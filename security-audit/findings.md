# Findings — Ollama Studio security audit

Detailed findings OSA-01 through OSA-15. Lower-severity and informational items are
in [hardening.md](hardening.md). Evidence paths are relative to this directory.

Severity scale used here:

- **Critical** — a security control can be fully bypassed by a remote client, leading
  to broad compromise.
- **High** — significant confidentiality/integrity/availability impact, or a
  destructive data-loss path, with a realistic trigger.
- **Medium** — limited impact, defense-in-depth failure, or denial of service.
- **Low** — information disclosure or hardening gap requiring additional conditions.
- **Informational** — best-practice observation, no direct exploit.

CVSS 3.1 values are indicative and assume the stated exposure. The default
`127.0.0.1` bind reduces network reachability; scores are for prioritization, not a
claim that the service is internet-facing.

---

## OSA-01 — `PROXY_TOKEN` is recoverable from the unauthenticated static bundle

**Severity:** Critical when `PROXY_TOKEN` is used as the access control; High for the
project overall (token mode is optional).
**CVSS 3.1 (conditional):** 9.8 — `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`.
**CWE:** CWE-321 (Use of Hard-coded Cryptographic Key), CWE-200 (Exposure of
Sensitive Information), CWE-522 (Insufficiently Protected Credentials).
**Affected:** `server.ts:47-59`, `server.ts:290`; `src/api/ollama.ts:3-19`;
`package.json:12`; built `dist/assets/*.js`.
**Evidence:** [03-token-extraction.txt](evidence/03-token-extraction.txt),
[04-auth-coverage.txt](evidence/04-auth-coverage.txt).

### Summary

The optional shared secret is compiled into the browser bundle and that bundle is
served without authentication. Any client that can reach the HTTP server can fetch
`/`, read the referenced `/assets/index-*.js`, extract the token, and then call the
protected APIs with it. The token only stops a client that does not look at the
frontend it is already allowed to download.

### Technical detail

`src/api/ollama.ts` reads `VITE_PROXY_TOKEN` at build time:

```ts
const RAW_PROXY_TOKEN = (import.meta.env as ...)?.VITE_PROXY_TOKEN;
export function proxyAuthHeaders(): Record<string, string> {
  const token = RAW_PROXY_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}
```

Vite replaces `import.meta.env.VITE_*` with literal values. A production build made
with `VITE_PROXY_TOKEN` therefore contains the secret as a string constant.

The server's token middleware is mounted only on the API prefixes:

```ts
app.use(['/ollama', '/api/import', '/api/modelscope', '/api/downloads',
         '/api/cache', '/api/export', '/api/metrics', '/api/daemon'],
        requireProxyToken);
...
app.use(express.static(distDir));
```

`express.static` is registered after the middleware and is not covered by it. `GET /`
and `GET /assets/index-*.js` are public. `healthz` (`server.ts:75-77`) is public too.

### Proof of concept

A build with `VITE_PROXY_TOKEN=<TEST_TOKEN>` and a server started with the same
`PROXY_TOKEN` was used:

```text
GET /                                  -> 200 text/html, references assets/index-*.js
GET /assets/index-*.js                 -> 200 application/javascript
grep '<TEST_TOKEN>' bundle             -> 1 occurrence
GET /api/cache (no token)              -> 401
GET /api/cache (extracted token)       -> 200
```

The full transcript is in [03-token-extraction.txt](evidence/03-token-extraction.txt).
The same extraction is possible from any LAN client, and from a DNS-rebinding page
that can read same-origin assets (see OSA-03). Because `healthz` reports
`authRequired`, an attacker also knows whether the token is enabled.

### Impact

- Any client that can reach the server obtains the shared secret, defeating the
  intended LAN protection.
- With the token, the attacker can use every protected endpoint: list and delete
  models through `/ollama/*`, read `/api/cache` paths, export models, start downloads,
  inspect metrics/daemon state, and control the daemon when `ALLOW_DAEMON_CONTROL=1`.
- The token is also present in build artifacts/DMG bundles, source maps (if enabled
  later), and browser caches. Rotating it requires a rebuild and redeploy.
- Because the app is local-first and the default is no token, the practical severity
  depends on deployment. The failure is absolute when the token is relied upon: it is
  not a secret.

### Remediation

1. **Do not ship a shared secret in client code.** Remove `VITE_PROXY_TOKEN` and the
   `proxyAuthHeaders()` build-time constant.
2. Use one of:
   - a server-side login/pairing flow that exchanges a one-time code for an
     `HttpOnly`, `SameSite=Strict`, `Secure` (when TLS) session cookie;
   - a reverse proxy / OS-level authentication layer (e.g. an authenticated tunnel or
     local user boundary);
   - a token entered at runtime and kept only in memory/session storage, never
     compiled into the bundle. This is weaker but at least not readable from the
     static assets before authentication.
3. Do not treat `PROXY_TOKEN` as authentication in documentation unless it is no
   longer embedded. If it remains, describe it as a local speed bump, not an access
   control.
4. Add a build-time test that fails if a configured token value appears anywhere in
   `dist/` (including source maps).
5. If static assets must remain public, ensure they contain no secrets and do not
   enable source maps in production.

### Verification

After the fix: build with a test token, `grep -R` the token in `dist/`, and confirm no
match. Confirm `/api/cache` without a session/token returns 401 and with a valid
session returns 200. Add an e2e test that fetches `/` and every referenced JS asset
without credentials and checks for the token.

---

## OSA-02 — State-changing APIs are CSRF-able

**Severity:** High.
**CVSS 3.1 (conditional):** 8.1 — `AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:H`.
**CWE:** CWE-352 (Cross-Site Request Forgery), CWE-20 (Improper Input Validation).
**Affected:** `server/http.ts:7-22`; all POST handlers in `server.ts`,
`server/downloads.ts`, `server/cache.ts`, `server/exportGguf.ts`,
`server/daemon.ts`; the Vite dev middleware equivalents.
**Evidence:** [02-csrf-text-plain.txt](evidence/02-csrf-text-plain.txt).

### Summary

The server never inspects `Origin`, `Referer`, or `Sec-Fetch-Site`, and
`readJsonBody()` parses a JSON body regardless of `Content-Type`. A malicious website
can therefore send a CORS-simple `text/plain` POST to `http://127.0.0.1:<port>` and
cause privileged local actions without reading the response. The browser sends the
request from the victim's machine, so source-address checks such as the daemon
`isLoopback()` test do not help.

### Technical detail

`readJsonBody` only counts bytes and calls `JSON.parse`:

```ts
for await (const chunk of request) { ... }
if (chunks.length === 0) return {};
const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
```

There is no `Content-Type` check, no `Origin`/`Sec-Fetch-Site` check, and no CSRF
token. Every state-changing handler trusts the body:

- `POST /api/cache/cleanup` — moves/quarantines blobs and deletes temp/partial files.
- `POST /api/cache/reveal` — opens the system file manager.
- `POST /api/export` — copies model weights to the user's downloads directory.
- `POST /api/downloads` — starts a background pull/ModelScope/HF download.
- `POST /api/import` — streams an uploaded GGUF to a temp file and runs `ollama create`.
- `POST /api/modelscope/pull` — downloads and registers a model.
- `POST /api/daemon/control` — starts/stops/restarts Ollama when enabled.
- `POST /ollama/api/pull`, `/ollama/api/chat`, `/ollama/api/create`, `/ollama/api/copy`
  — proxied to Ollama.

A cross-origin `fetch` with `Content-Type: text/plain` is a CORS-simple request; no
preflight occurs. The server's JSON parser does not care about the content type.

### Proof of concept

Using the production build on loopback, without `PROXY_TOKEN`:

```http
POST /api/cache/cleanup HTTP/1.1
Origin: https://evil.example
Sec-Fetch-Site: cross-site
Content-Type: text/plain

{"targets":["temp"]}
```

The server deleted an `ollama-studio-*` fixture directory and returned
`removed.temp = 1` ([02](evidence/02-csrf-text-plain.txt)). The same primitive created
a running download job:

```http
POST /api/downloads
Origin: https://evil.example
Content-Type: text/plain

{"kind":"pull","model":"csrf-audit-model"}
```

and was accepted by `/api/daemon/control` with `ALLOW_DAEMON_CONTROL=1` (a `start`
request short-circuited as "already running"; no command was executed). The loopback
check passed because the browser was on the same machine. The response was not
readable cross-origin (no CORS headers), but the side effects occurred.

### Impact

- **Destructive:** cache cleanup can delete `ollama-studio-*` temp data, partial
  downloads, and quarantine orphan blobs. Combined with OSA-04/05, this can break
  models or in-progress downloads.
- **Resource exhaustion:** start arbitrary pulls/downloads/exports, consume disk and
  network, and occupy GPU via chat/generate.
- **Service control:** with `ALLOW_DAEMON_CONTROL=1`, start/stop/restart Ollama from a
  website when `executable[action]` is true (the audit verified the `start` path; the
  `stop` path uses the same checks). This is especially dangerous because the flag is
  the only gate and the loopback check is not a browser boundary.
- **Data exposure:** no CORS means responses are not readable via simple CSRF, but
  DNS rebinding (OSA-03) turns this into full read access.

### Remediation

1. **Reject cross-site state-changing requests.** For every non-GET request, require
   `Origin` to be absent (non-browser client) or exactly one of the configured
   origins (`http://127.0.0.1:<port>`, `http://localhost:<port>`, and the configured
   LAN origin if any). Reject `Origin: null` and unknown origins.
2. **Check `Sec-Fetch-Site`** where present: allow `same-origin`/`none`; reject
   `cross-site` and `same-site` unless explicitly configured.
3. **Require `Content-Type: application/json`** for JSON endpoints; return 415
   otherwise. This blocks simple form/text/plain CSRF, though it is not sufficient
   alone (DNS rebinding still forges same-origin requests).
4. **Require a per-session CSRF token or custom header** for destructive endpoints
   (`cache/cleanup`, `cache/reveal`, `export`, `daemon/control`, `downloads`), and
   check it server-side. A custom header cannot be set cross-origin without CORS
   preflight.
5. **Add `confirm: true`** (or a server-issued nonce) to cleanup/export/daemon
   actions; do not rely on the UI's `window.confirm`.
6. **Do not treat loopback as authentication.** Any browser on the machine can reach
   loopback. Keep the check as defense-in-depth, not as the primary gate.
7. Add integration tests that send `Origin: https://evil.example` with
   `Content-Type: text/plain` and expect 403/415.

### Note on `PROXY_TOKEN`

When a token is set, a cross-site simple request cannot add the `Authorization` or
`X-Proxy-Token` header, so these endpoints are not CSRF-able **via that path**.
However, the token is public (OSA-01) and DNS rebinding (OSA-03) bypasses the origin
boundary, so token mode is not a reliable CSRF defense either.

---

## OSA-03 — Missing Host validation enables DNS rebinding

**Severity:** High.
**CVSS 3.1 (conditional):** 7.5 — `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H`.
**CWE:** CWE-350 (Reliance on Reverse DNS Resolution for a Security-Critical Action),
CWE-346 (Origin Validation Error), CWE-16 (Configuration).
**Affected:** `server.ts` (no Host/authority check before routing or static serving);
`server.ts:290`, `server.ts:293-295`; all `/api/*` and `/ollama/*` routes.
**Evidence:** [01-host-and-dns-rebinding.txt](evidence/01-host-and-dns-rebinding.txt).

### Summary

The Express server accepts any `Host` header. An attacker-controlled domain that
resolves to `127.0.0.1` is treated as the same origin by the browser, so a
DNS-rebinding page can issue same-origin requests to every API and read the responses.
This bypasses the browser's CORS protection, the (missing) CSRF checks, and — because
the JS bundle is public — token mode as well (OSA-01).

### Technical detail

There is no middleware that validates `request.headers.host` against an allowlist.
`app.listen(port, host)` binds to loopback by default, but binding does not validate
the HTTP `Host` header. A DNS-rebinding attack works as follows:

1. The victim visits `http://attacker.example:<port>`; the attacker's DNS returns the
   attacker's server and serves a page.
2. The page waits for the DNS TTL to expire; the attacker's DNS now returns
   `127.0.0.1` (or `::1`).
3. The browser reconnects to the same origin (`attacker.example:<port>`) but reaches
   the local Ollama Studio server. The server sees `Host: attacker.example:<port>`
   and serves the API; the browser considers the responses same-origin.

No CORS headers are emitted, but they are not needed after rebinding. A `DELETE`
request, which is not possible with a simple CSRF form, becomes possible with
`fetch` from the rebound origin.

### Proof of concept

```bash
curl -s -H 'Host: evil.example:45871' http://127.0.0.1:45871/healthz
# HTTP 200, {"ok":true,...}

curl -s --resolve evil.example:45871:127.0.0.1 http://evil.example:45871/api/cache
# HTTP 200 application/json
```

The second request is the server-side equivalent of the browser reaching the local
service after rebinding. Full output: [01](evidence/01-host-and-dns-rebinding.txt).

### Impact

- Read `/api/cache` (model paths, blob inventory), `/api/metrics` (disk/memory/CPU/GPU),
  `/api/daemon` (PIDs/commands), `/api/downloads` (model names/jobs).
- Read `/ollama/api/tags`/`ps`, chat with models, and `DELETE /ollama/api/delete` to
  remove models.
- Trigger cache cleanup, export, downloads, and daemon control (if enabled).
- Extract the `PROXY_TOKEN` from the public bundle, so token mode does not stop the
  attack (OSA-01).
- The rebound origin is `evil.example`, not `127.0.0.1`, so it does **not** directly
  read the app origin's `localStorage`; that requires script execution on the app
  origin itself (see OSA-12/13). It can still read every API response and act on the
  user's models.

### Remediation

1. Add a Host allowlist middleware before all routes:
   ```ts
   const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
   app.use((req, res, next) => {
     const host = req.headers.host;
     if (!host || !allowedHosts.has(host)) return res.status(421).end();
     next();
   });
   ```
   If LAN binding is intentional, add the configured `HOST:PORT` and any trusted
   reverse-proxy host; never accept arbitrary Host values.
2. Set `app.set('trust proxy', false)` unless a trusted reverse proxy is explicitly
   configured; if a proxy is used, validate `X-Forwarded-Host` against the same list
   and document it.
3. Reject requests with `Forwarded`/`X-Forwarded-Host`/`X-Forwarded-For` from
   untrusted peers for daemon control.
4. In Vite dev, set `server.allowedHosts` explicitly for `dev:lan` and keep the
   default loopback host check for `npm run dev`.
5. Keep the loopback bind default and fail closed for unknown interface addresses.
6. Add tests: `Host: evil.example` must return 421/403 for `/`, `/healthz`, `/api/*`,
   and `/ollama/*`.

---

## OSA-04 — `scanComplete` is true when no manifest store exists → blobs can be quarantined

**Severity:** High (data loss; requires a misconfigured/legacy/empty model directory).
**CVSS 3.1 (conditional):** 6.8 — `AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:H/A:H`.
**CWE:** CWE-754 (Improper Check for Unusual or Exceptional Conditions), CWE-682
(Incorrect Calculation), CWE-693 (Protection Mechanism Failure).
**Affected:** `server/cache.ts:118-133`, `server/cache.ts:215-221`,
`server/cache.ts:256-258`, `server/cache.ts:386-455`, `server/cache.ts:485-494`.
**Evidence:** [05-cache-scan-complete.txt](evidence/05-cache-scan-complete.txt).

### Summary

`readManifestDigests()` starts with `complete = true` and its directory walk silently
ignores a missing manifest root (`ENOENT`). If the model directory contains blobs but
neither `manifests/` nor `manifests-v2/` yields a manifest, the scan is still reported
as complete and **every blob not protected by a metadata digest is classified as an
orphan**. `cleanCache(['orphan'])` then re-checks only the same `complete` flag and
moves the affected blobs into `.ollama-studio-trash`. Ollama no longer sees them, so
installed models disappear from `ollama list` even though the bytes are recoverable
from the trash.

This is a different root cause from the 2026-10-28 incident (`R-042`, symlink
manifests), but it is the same class of failure: an incomplete scan is treated as a
safe scan.

### Technical detail

```ts
async function readManifestDigests(modelsDir) {
  ...
  let complete = true;

  const walk = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') complete = false; // ENOENT is ignored
      return;
    }
    ...
  };

  await walk(path.join(modelsDir, 'manifests'));
  await walk(path.join(modelsDir, 'manifests-v2'));
  return { digests, complete };
}
```

If both roots are missing, or both exist but contain no manifest files, `complete`
remains `true`. `scanCache()` then marks each complete blob not in `digests` as orphan
(`digests.has(...) ? referenced : orphan`). `cleanCache()` checks `report.scanComplete`
and `collectProtectedDigests()` (which has the same behavior) and proceeds. The only
guard is a manifest that fails to parse or a broken symlink; empty/missing roots are
not treated as failure.

A directory with `blobs/` and an empty `manifests/` is a realistic state after:

- `OLLAMA_MODELS` points at a copy/backup that contains blobs but not manifests;
- Ollama changes its manifest layout or stores manifests elsewhere;
- a user creates the directory manually or restores only blobs;
- an interrupted migration leaves an empty manifest root.

### Proof of concept

Fixture: `blobs/` with one blob and an empty `manifests/`; `manifests-v2/` absent.

```json
GET /api/cache
{ "scanComplete": true, "orphanFiles": 1, "orphanBytes": 16, ... }

POST /api/cache/cleanup {"targets":["orphan"]}
{
  "freedBytes": 16,
  "quarantinedBytes": 16,
  "removed": { "orphan": 1, ... },
  "quarantinePath": "<FIXTURE_MODELS>/.ollama-studio-trash/..."
}
```

The blob was moved out of `blobs/`. Full output: [05](evidence/05-cache-scan-complete.txt).

### Impact

- Models that were installed and working can disappear from Ollama after cleanup.
- The quarantine preserves bytes, but restoring them requires manual work and the
  correct manifest; users may not know which files belong together.
- The UI's "unreferenced blobs (high risk)" warning and default-unchecked state reduce
  the chance of a user doing this accidentally, but the API and CSRF path do not
  require UI confirmation (see OSA-02). The scan also reports `scanComplete: true`,
  which is misleading.
- The same failure can occur with a wrong `OLLAMA_MODELS` path, which is an
  environment/config mistake rather than an attack.

### Remediation

1. Treat "no manifest store" as incomplete:
   - if neither `manifests/` nor `manifests-v2/` exists, set `complete = false`;
   - if the roots exist but zero manifests were successfully parsed while blobs
     exist, set `complete = false`;
   - require at least one valid manifest before orphan cleanup is allowed.
2. Do not infer "all blobs are orphans" from an empty manifest set. A directory with
   blobs but no manifests is ambiguous; require an explicit opt-in/acknowledgement
   and a backup, or refuse cleanup entirely.
3. Add a fixture test with `blobs/` + empty `manifests/` asserting
   `scanComplete === false` and `cleanCache(['orphan'])` rejects with 409.
4. Show the manifest count and roots in the cache report/UI ("0 manifests found;
   orphan cleanup disabled").
5. Consider a manifest sentinel/version check per model directory and a "last known
   good scan" baseline; refuse to quarantine if the referenced-blob count drops to 0
   unexpectedly.

---

## OSA-05 — Cleanup ignores active downloads for `temp`/`orphan` and has no recent-blob guard

**Severity:** High (data loss / availability).
**CWE:** CWE-362 (Race Condition), CWE-693 (Protection Mechanism Failure), CWE-400
(Uncontrolled Resource Consumption).
**Affected:** `server/cache.ts:27`, `server/cache.ts:336-384`,
`server/cache.ts:401-421`, `server/cache.ts:485-572`;
`server/downloads.ts:66-71`; `src/screens/TelemetryScreen.tsx:204-208`,
`src/screens/TelemetryScreen.tsx:1709`.
**Evidence:** [06-cache-cleanup-active-download.txt](evidence/06-cache-cleanup-active-download.txt).

### Summary

`hasRunningDownloads()` gates only the `partial` branch. The `temp` and `orphan`
branches run while a download is active. A running job is not protected from temp
cleanup, and a freshly written blob is not protected by the 10-minute recency guard
(which applies only to partial/chunk files and temp directories). The UI mirrors the
same gap: the `partial` row is locked when `activeDownloads` is true, but the `temp`
row is hard-coded `locked: false` and `orphan` is locked only on `!scanComplete`.

### Technical detail

```ts
// partial
if (targets.includes('partial')) {
  if (report.activeDownloads || hasRunningDownloads()) throw ...;
  ...
  if (now - blob.modifiedAt < RECENT_MS) { skippedRecent += 1; continue; }
}

// temp
if (targets.includes('temp')) {
  const temp = await scanTempDirs();
  for (const entry of temp.entries) { await rm(entry.path, { recursive: true }); }
}

// orphan
if (targets.includes('orphan')) {
  if (!report.scanComplete) throw ...;
  const { digests, complete } = await collectProtectedDigests(...);
  for (const blob of orphanBlobs) { await rename(blob, trash); }
}
```

The temp recency check uses `stat(dir).mtimeMs` (`server/cache.ts:353-356`), not file
activity. A long download creates the directory and file at the start; subsequent
writes to the existing file do not update the directory mtime. After 10 minutes, the
directory is eligible for deletion even though the download is still writing.

The orphan branch does not look at `hasRunningDownloads()` at all and does not apply
`RECENT_MS` to complete blobs. Any blob that is not otherwise protected by a manifest
or metadata digest at the moment of the scan — including a blob just written by
`ollama create` or an external `ollama pull` — is moved to `.ollama-studio-trash`.

### Proof of concept

The audit held a pull job in `running` state using a slow echo upstream, then invoked
cleanup with `{"targets":["orphan","temp"]}`:

```json
{
  "removed": { "orphan": 1, "partial": 0, "temp": 1 },
  "report.activeDownloads": true,
  "report.scanComplete": true
}
```

Both the `ollama-studio-*` temp fixture and the just-written 28-byte blob were gone
after the request; the blob was in the quarantine directory. Full output:
[06](evidence/06-cache-cleanup-active-download.txt).

The UI confirms the gap: `src/screens/TelemetryScreen.tsx:1709` sets `locked: false`
for the temp row, while the partial row uses `locked: cacheReport.activeDownloads`
(line 1667).

### Impact

- A user who starts a long download and then cleans the cache can delete the active
  download directory; the download restarts or fails.
- A native `ollama pull` (not tracked in `server/downloads.ts`) can have its freshly
  completed layers quarantined before the manifest is written, breaking or delaying
  the pull.
- Two app instances (dev server + menu-bar app, or two ports) share the temp prefix;
  one instance can delete the other's active download.
- The same actions are CSRF-able (OSA-02), so a malicious page can trigger them
  without the user opening the cleanup dialog.
- Quarantine avoids permanent deletion of blobs, but temp directories are `rm -rf`-ed
  permanently.

### Remediation

1. Gate **all** cleanup categories on active downloads, not just `partial`:
   - `hasRunningDownloads()` at the start and again before each category;
   - if any job is running, return 409 for `temp` and `orphan` as well, or accept an
     explicit `force: true` with a clear warning.
2. Add a recency guard for complete blobs (e.g. skip `mtime < 10 minutes`) in the
   orphan scan and re-check before `rename`.
3. Replace directory-mtime recency with a per-job lock/heartbeat:
   - create a lock file in the temp directory and update its mtime during the
     download;
   - cleanup skips directories with a fresh lock file;
   - use a cross-process lock (e.g. `open(..., 'wx')`) in the models directory so two
     instances cannot clean concurrently.
4. Use the job ID in the temp directory name and maintain a small on-disk job registry
   (or at least a lock file) so a new process can distinguish "stale" from "active".
5. Lock all three rows in the UI when `activeDownloads` is true (or when a lock file is
   present) and require a second confirmation for `temp`/`orphan`.
6. Add tests: start a delayed job, call cleanup with each target, assert 409 and that
   the fixture remains; test a fresh blob (mtime now) is not quarantined.

---

## OSA-06 — Non-loopback binding without a token fails open

**Severity:** Medium (High if intentionally exposed to a LAN without a token).
**CWE:** CWE-1188 (Insecure Default Initialization of Resource), CWE-16.
**Affected:** `server.ts:18-20`, `server.ts:301-306`; `.env.example:11-15`;
`README.md:159-165`, `README.zh-CN.md:159-165`; `package.json:10` (`dev:lan`).
**Evidence:** Code and documentation.

### Summary

The server binds `127.0.0.1` by default, but if `HOST` is set to a non-loopback
address and `PROXY_TOKEN` is unset, it only prints a warning and starts. The README
shows `PROXY_TOKEN=change-me HOST=0.0.0.0 npm start` as an example. A user who omits
the token (or uses the placeholder) exposes the entire API to the network. Vite's
`dev:lan` is similarly unauthenticated.

### Technical detail

```ts
const host = process.env.HOST || '127.0.0.1';
const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
...
if (!isLoopback && !proxyToken) {
  console.warn('[security] HOST is not loopback and PROXY_TOKEN is unset. ...');
}
```

The warning is the only enforcement. There is no TLS, no rate limiting, no user
accounts, and (per OSA-01) the token is not a real secret. The `.env.example` and
README use `change-me` as the token placeholder, which is likely to be copied
literally.

### Impact

- Any host on the LAN can call `/ollama/*` and all management APIs: pull/delete
  models, import GGUF, export weights, clean the cache, inspect metrics, and control
  the daemon if enabled.
- No TLS: tokens, model names, prompts, and responses travel in clear text.
- The token, if set, is extractable (OSA-01); if unset, there is no gate at all.
- `dev:lan` exposes the Vite dev server, source files, HMR, and the local APIs on all
  interfaces; it is intended only for trusted networks but has no guard.

### Remediation

1. Fail closed:
   ```ts
   const isLoopback = ...;
   if (!isLoopback && !proxyToken) {
     console.error('Refusing to bind non-loopback without PROXY_TOKEN. Set ALLOW_INSECURE_BIND=1 to override.');
     process.exit(1);
   }
   ```
   If an override is needed for a trusted lab, require an explicit
   `ALLOW_INSECURE_BIND=1` and print a prominent warning.
2. Reject weak tokens: enforce a minimum length (e.g. 32 characters), reject
   `change-me`, `test-secret`, and empty values; generate a random token in the docs
   (`openssl rand -hex 32`).
3. Require TLS at the reverse proxy for any non-loopback deployment; document that
   `PROXY_TOKEN` is not a substitute for TLS or user authentication.
4. Keep `dev:lan` opt-in and add a startup warning/refusal when it is used without a
   token; consider removing it from the standard scripts or gating it behind an
   explicit environment flag.
5. Add a CI/test check for the refusal path.

---

## OSA-07 — `/ollama` forwards proxy credentials and browser headers upstream

**Severity:** Medium.
**CVSS 3.1 (conditional):** 7.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` for the
credential disclosure; impact is higher if the leaked token is valid and the upstream
is untrusted.
**CWE:** CWE-200, CWE-522, CWE-201 (Insertion of Sensitive Information Into Sent Data).
**Affected:** `server.ts:61-73`, `server.ts:231-236`.
**Evidence:** [07-proxy-header-forwarding.txt](evidence/07-proxy-header-forwarding.txt).

### Summary

The reverse proxy copies every inbound header except the hop-by-hop list. It does not
strip `authorization`, `x-proxy-token`, `cookie`, `origin`, or `referer`. When
`OLLAMA_HOST` points at a remote or untrusted service, the app's proxy token and any
browser cookies are disclosed to that service and may appear in its logs.

### Technical detail

```ts
for (const [key, value] of Object.entries(request.headers)) {
  if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
  headers.set(key, Array.isArray(value) ? value.join(', ') : value);
}
```

`HOP_BY_HOP` contains `host`, `connection`, `content-length`, `accept-encoding`,
`transfer-encoding`, `keep-alive`, `upgrade`, `proxy-authorization`,
`proxy-authenticate`, `te`, `trailer` — but not `authorization`, `x-proxy-token`,
`cookie`, `origin`, or `referer`.

The audit upstream observed:

```json
{
  "authorization": "Bearer <TEST_TOKEN>",
  "x-proxy-token": "<TEST_TOKEN>",
  "cookie": "session=leak-me",
  "origin": "http://127.0.0.1:45873"
}
```

Full output: [07](evidence/07-proxy-header-forwarding.txt).

### Impact

- Shared-secret disclosure to the Ollama upstream, any reverse proxy between the app
  and Ollama, or a compromised local Ollama process.
- Cookie disclosure if the app is ever served with cookies (after the OSA-01 fix, this
  becomes more relevant).
- `Origin`/`Referer` disclosure can leak the local app origin/port to upstream logs.
- The token is already public in the bundle (OSA-01), but this finding remains
  important if the token is replaced by a session cookie or a non-embedded secret.

### Remediation

1. Build an allowlist of headers to forward: `content-type`, `accept`, `user-agent`,
   and any explicitly required Ollama headers. Do not forward `authorization`,
   `cookie`, `x-proxy-token`, `origin`, `referer`, or `x-forwarded-*`.
2. If the upstream needs authentication, use a dedicated server-side credential that
   is never accepted from the client.
3. Add tests with an echo upstream asserting these headers are absent.
4. Consider forwarding only `content-type`/`accept` and setting a fixed
   `user-agent` for the upstream.

---

## OSA-08 — Missing browser security headers; clickjacking and CSP gaps

**Severity:** Medium.
**CVSS 3.1 (conditional):** 5.4 — `AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N`.
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers / Clickjacking),
CWE-693 (Protection Mechanism Failure), CWE-79 (CSP defense-in-depth).
**Affected:** `server.ts` (no header middleware); `index.html`; all static/API
responses.
**Evidence:** [08-headers-and-error-handling.txt](evidence/08-headers-and-error-handling.txt).

### Summary

The main app response has no `Content-Security-Policy`, `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`, and exposes
`X-Powered-By: Express`. The app can be framed by an attacker and used for
clickjacking; there is no CSP to contain XSS if a future sink appears. The public
`PROXY_TOKEN` (OSA-01) and local chat data make XSS containment particularly
important.

### Technical detail

`GET /` returns only Express/static headers:

```
HTTP/1.1 200 OK
X-Powered-By: Express
Accept-Ranges: bytes
Cache-Control: public, max-age=0
ETag: ...
Content-Type: text/html; charset=UTF-8
```

The Express default error page does set `Content-Security-Policy: default-src 'none'`
and `X-Content-Type-Options: nosniff`, but the application does not. There is no
`frame-ancestors`/`X-Frame-Options`, so the UI can be iframed with an overlay. There
is no CSP, so any future HTML injection (or a malicious third-party HTML response
such as OSA-12) executes without restriction.

### Impact

- Clickjacking: a malicious page can overlay the local UI and trick the user into
  clicking "cleanup", "export", "delete", or daemon controls. Some destructive actions
  have `window.confirm`, but not all, and the confirm can be framed/obscured.
- No CSP: if an XSS is introduced later, it can read `localStorage` (chat history,
  attachments) and call the API with the user's access.
- `X-Powered-By` discloses the framework, aiding fingerprinting.
- Missing `X-Content-Type-Options` can allow MIME sniffing in older browsers;
  `Referrer-Policy` may leak the local URL to external links that do not set
  `rel=noreferrer`.

### Remediation

Add a header middleware before routes, and disable the framework banner:

```ts
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  next();
});
```

Notes:

- `style-src 'unsafe-inline'` is needed for React inline styles/Tailwind; a nonce-based
  policy would be stronger but requires build changes.
- `img-src data: blob:` and `media-src blob:` are needed for chat attachments.
- `connect-src 'self'` is enough for the same-origin API; if a direct
  `VITE_OLLAMA_BASE_URL` is used, add that origin explicitly.
- Do not add `Access-Control-Allow-Origin: *`.
- The Vite dev server needs `'unsafe-inline'`/`ws:` for HMR; apply the CSP in
  production only or add dev-specific exceptions.
- Verify with `curl -D -` and a browser smoke test.

---

## OSA-09 — `/ollama` buffers the full request body in memory with no cap or timeout

**Severity:** Medium (availability).
**CVSS 3.1 (conditional):** 7.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`.
**CWE:** CWE-400 (Uncontrolled Resource Consumption), CWE-770 (Allocation of
Resources Without Limits or Throttling).
**Affected:** `server.ts:238-245`, `server.ts:247-252`.
**Evidence:** [09-body-limit-and-concurrency.txt](evidence/09-body-limit-and-concurrency.txt).

### Summary

For every non-GET request, the proxy reads the entire body into an array of Buffers
and concatenates it before forwarding. There is no size cap, no `Content-Length`
check, and no upstream timeout. A single large upload or several concurrent requests
can exhaust the Node heap; a hung upstream holds the connection indefinitely.

### Technical detail

```ts
let body: Buffer | undefined;
if (request.method !== 'GET' && request.method !== 'HEAD') {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

const upstream = await fetch(targetUrl, {
  method: request.method,
  headers,
  body,
  signal: controller.signal
});
```

The only limit is the process's available memory. A 5 MB body was accepted and fully
buffered; the upstream received 5,242,880 bytes ([09](evidence/09-body-limit-and-concurrency.txt)).
The `/api/import` path intentionally streams up to 20 GB to disk, but the `/ollama`
proxy does not stream.

The `fetch` has an abort signal tied to the client connection but no timeout; a
malicious or stalled upstream can keep the request open. `request.on('aborted')` and
`response.on('close')` help only when the client disconnects.

### Impact

- Memory exhaustion / process crash by sending a large body (local or LAN, or via
  CSRF with a large `fetch` body).
- Many concurrent requests multiply memory use.
- A hung Ollama upstream holds file descriptors and sockets.
- The proxy is a general-purpose path for chat/image payloads; legitimate large
  payloads make a naive small limit impractical, so streaming is the better fix.

### Remediation

1. Stream the request body to the upstream instead of buffering:
   - use `Readable.toWeb(request)` (Node 18+) with `duplex: 'half'` in the fetch
     options, or `http.request` piping;
   - preserve abort handling.
2. If streaming is not feasible, enforce a hard cap (e.g. 64 MB or 128 MB) by checking
   `Content-Length` and counting bytes; return 413 and destroy the request stream.
3. Set an upstream timeout (`AbortSignal.timeout(...)`) and a maximum response time
   for non-streaming calls; keep long-lived streaming chat/pull responses exempt or
   use an idle timeout.
4. Add a concurrency limit for proxied requests (e.g. 8) and return 429/503.
5. Log body sizes and upstream durations for anomaly detection.

---

## OSA-10 — Express stack traces and absolute paths exposed for malformed URLs

**Severity:** Low.
**CVSS 3.1:** 5.3 — `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`.
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information),
CWE-200.
**Affected:** `package.json:15` (`start`: `node server.js`); Express default error
handling; no custom error middleware.
**Evidence:** [08-headers-and-error-handling.txt](evidence/08-headers-and-error-handling.txt).

### Summary

`npm start` does not set `NODE_ENV=production`, and there is no custom error handler.
A malformed URI such as `/%ZZ` makes Express return an HTML error page with a full
stack trace and absolute paths under the repository's `node_modules`.

### Technical detail

`curl --path-as-is http://127.0.0.1:<port>/%ZZ` returns:

```
HTTP/1.1 400 Bad Request
...
<pre>URIError: Failed to decode param '/%ZZ'<br>
 at decodeURIComponent (<anonymous>)<br>
 at decode_param (<REPO>/node_modules/express/lib/router/layer.js:172:12)<br>
 ...
```

The error page itself sets `Content-Security-Policy: default-src 'none'` and
`X-Content-Type-Options: nosniff`, so it is not XSS, but it discloses the framework
version, internal file layout, and that the app is running in development mode. The
menu-bar app sets `NODE_ENV=production` (`macos/menu-bar/main.swift`), so it is less
affected; `npm start` is not.

### Impact

- Information disclosure that helps fingerprint the deployment and locate Express
  internals.
- No secrets were observed in the stack, but future error paths could include
  sensitive values if a handler throws with them.
- A development-mode Express may also enable other verbose behavior.

### Remediation

1. Set `NODE_ENV=production` in the `start` script or at process start:
   `"start": "NODE_ENV=production node server.js"` (or use a cross-platform env
   wrapper).
2. Add a terminal error handler that logs server-side and returns a generic JSON body:
   ```ts
   app.use((err, req, res, next) => {
     console.error(err);
     if (res.headersSent) return next(err);
     res.status(500).json({ error: 'Internal server error' });
   });
   ```
   Handle 400 URI errors explicitly (generic "Bad request") before the 500 handler.
3. Disable `X-Powered-By` (OSA-08).
4. Do not return `err.message` from unexpected exceptions to clients; keep detailed
   messages for expected validation errors.
5. Add a test for `/%ZZ` asserting no `at ` stack frames and no absolute paths.

---

## OSA-11 — No concurrency, queue, or disk admission control for download jobs

**Severity:** Medium (availability).
**CWE:** CWE-770, CWE-400, CWE-799 (Improper Control of Interaction Frequency).
**Affected:** `server/downloads.ts:63`, `server/downloads.ts:93-117`,
`server/downloads.ts:301-381`; `server/modelscope.ts`, `server/huggingface.ts`.
**Evidence:** [09-body-limit-and-concurrency.txt](evidence/09-body-limit-and-concurrency.txt).

### Summary

`POST /api/downloads` creates a job unconditionally. There is no maximum number of
concurrent jobs, no queue, no per-host limit, and no disk-space admission check. Each
job can write up to 20 GB (ModelScope/HF) or pull an arbitrarily large Ollama model.
Six concurrent jobs were accepted; the map is only pruned for finished jobs older
than five minutes, so hung running jobs accumulate.

### Technical detail

```ts
const jobs = new Map<string, DownloadJob>();
...
function createJob(...) {
  const job = { id: `dl-${randomUUID()}`, ..., controller: new AbortController() };
  jobs.set(job.id, job);
  return job;
}
```

`startFromBody()` deduplicates an identical running job by key, but different model
names/files create new jobs. `runPullJob`/`runModelScopeJob`/`runHuggingFaceJob` have
no timeout for the network transfer; a stalled connection keeps the job `running`
forever (the pull job's fetch has an abort signal but no timeout). `prune()` only
removes non-running jobs after `JOB_TTL_MS` (5 minutes), so a running job is never
reaped.

### Impact

- Disk exhaustion: repeated 20 GB downloads can fill the disk and break other apps.
- Network exhaustion, upstream rate limits, and long-running background processes.
- Memory growth from the jobs map and progress state (bounded per job but unbounded
  in count).
- Combined with CSRF (OSA-02), a malicious website can trigger this without user
  interaction.

### Remediation

1. Enforce a global concurrency limit (e.g. 1–2 jobs) and a queue for the rest;
   return 429 with a clear message when full.
2. Check free disk space before starting; reserve the expected size plus a margin;
   refuse if insufficient (use `statfs`).
3. Apply a per-host/per-kind limit (Ollama pull vs HF vs ModelScope) and a per-source
   rate limit.
4. Add a network idle timeout for downloads; abort and mark the job failed.
5. Reap or mark running jobs stuck beyond a threshold on startup/periodically; expose
   a cancel endpoint.
6. Add a `Retry-After`/queue-position UI; do not let the client create unbounded
   jobs.

---

## OSA-12 — `/api/catalog/search` serves third-party HTML with inline scripts on the app origin

**Severity:** Low (defense-in-depth; no reflected XSS found).
**CWE:** CWE-829 (Inclusion of Functionality from an Untrusted Control Sphere),
CWE-79 (cross-site scripting defense-in-depth).
**Affected:** `server.ts:83-110`; `src/api/catalog.ts:55-108`.
**Evidence:** [13-catalog-html-proxy.txt](evidence/13-catalog-html-proxy.txt).

### Summary

The server fetches `https://ollama.com/search?q=...`, returns the raw HTML with
`Content-Type: text/html`, and the frontend parses it with `DOMParser`. The app path
is inert (scripts do not run in `DOMParser`), but a user who navigates directly to the
endpoint gets a page on the local origin that contains six script tags (five inline)
and relative assets. There is no CSP (OSA-08) and no sandbox. If the upstream page is
compromised, reflects input unsafely in the future, or an attacker can influence the
response, script runs with access to the local origin, its `localStorage`, and the
public token bundle.

### Technical detail

`server.ts`:

```ts
const upstream = await fetch(`https://ollama.com/search?q=${encodeURIComponent(query)}`, ...);
const html = await upstream.text();
response.type('text/html').set('cache-control', 'no-store').send(html);
```

The proxied page includes `cdn.tailwindcss.com`-style external references in other
design mocks, but the Ollama page itself contains inline scripts and a relative
`/public/vendor/htmx/bundle.js`. A direct navigation to
`http://127.0.0.1:<port>/api/catalog/search?q=llama` executes the inline scripts on
the local origin.

The query is escaped by the upstream: `<script>alert(1)</script>` appears as
`&lt;script&gt;...` five times and never raw (`raw '<script>...' = 0`). This audit
found **no reflected XSS**. The finding is about serving untrusted HTML as active
content, not a confirmed injection in ollama.com.

### Impact

- A compromised/malicious upstream response can run arbitrary JavaScript on the local
  origin, call every API, read chat history/attachments from `localStorage`, and
  extract the public token (OSA-01).
- The endpoint is unauthenticated and can be linked directly; users may click a link
  that looks like a local app URL.
- Even without an upstream compromise, inline scripts from a third-party site run in
  a trusted local origin, which violates least privilege.

### Remediation

1. Do not return raw HTML. Parse the search page server-side with a DOM parser and
   return a small JSON shape (name, description, URL, etc.), or return the HTML as
   `text/plain`/`application/octet-stream` so it cannot execute.
2. If raw HTML must be returned, add a strict CSP with `sandbox`/no scripts and
   `Content-Disposition: attachment`, but JSON is preferable.
3. Keep the frontend's `DOMParser` approach only for inert parsing; never inject the
   HTML into the app DOM.
4. Add a CSP (OSA-08) so even a future mistake cannot execute inline scripts.
5. Consider fetching and parsing in the browser directly (CORS may block) or using a
   stable JSON API.

---

## OSA-13 — Design-mock HTML with remote scripts is shipped in production

**Severity:** Low.
**CWE:** CWE-829, CWE-1104 (Use of Unmaintained Third Party Components) analogy.
**Affected:** `public/assets/aistudio/Image_2_5dbfc01f.html`,
`Image_4_75d84bef.html`, `Image_6_e11529ef.html`, `Image_8_f6d118c4.html`;
`dist/assets/aistudio/` after build.
**Evidence:** [12-production-design-artifacts.txt](evidence/12-production-design-artifacts.txt).

### Summary

The `public/` directory contains AI Studio design-mock HTML files that are not used by
the app. Vite copies them into `dist/`, and the production server serves them at
`/assets/aistudio/*.html`. One 41 KB mock loads `https://cdn.tailwindcss.com` and
Google Fonts and contains inline scripts. Opening it executes third-party code on the
local origin.

### Technical detail

`PROJECT_INDEX.md` describes `public/assets/aistudio/` as a design reference "未被应用
代码引用" (not referenced by app code), but `public/` is the Vite static directory.
The files are therefore part of the production deployment. `GET
/assets/aistudio/Image_2_5dbfc01f.html` returns 200 `text/html` and 41,320 bytes.

### Impact

- Unnecessary attack surface; a user who opens a design mock runs remote scripts with
  local-origin access.
- Third-party CDN compromise or a malicious network response could execute in the
  local origin.
- Design/reference content is exposed publicly (low sensitivity, but unintended).

### Remediation

1. Move design references out of `public/` (e.g. `docs/assets/` or a non-served
   directory) or delete them from the repo.
2. If they must stay for development, exclude them from the production build (Vite
   `publicDir`/copy plugin) and do not serve them.
3. Add a build test that asserts `dist/assets/aistudio` does not exist.
4. Consider a CSP that blocks third-party scripts (OSA-08).

---

## OSA-14 — Auth coverage gaps and unauthenticated metadata disclosure

**Severity:** Low.
**CWE:** CWE-200, CWE-306 (Missing Authentication for Critical Function) for the
public proxies if they are considered management endpoints.
**Affected:** `server.ts:47-59`, `server.ts:75-77`, `server.ts:83-145`;
`server.ts:290`.
**Evidence:** [04-auth-coverage.txt](evidence/04-auth-coverage.txt).

### Summary

`/healthz`, `/api/catalog/search`, and `/api/hf/*` are outside the token middleware.
`/healthz` returns the Ollama upstream URL and `authRequired`. The management GETs
(`/api/cache`, `/api/metrics`, `/api/daemon`, `/api/downloads`) expose absolute paths,
system metrics, PIDs, and commands when the token is unset. The public proxies are
read-only, but they let any LAN client use the service as an outbound proxy to
ollama.com/Hugging Face.

### Technical detail

The auth list covers `/ollama`, `/api/import`, `/api/modelscope`, `/api/downloads`,
`/api/cache`, `/api/export`, `/api/metrics`, `/api/daemon`. It does not include
`/healthz`, `/api/catalog/search`, `/api/hf`, or static files. The audit matrix:

```
/api/cache (no token)           401
/api/daemon (no token)          401
/api/metrics (no token)         401
/api/modelscope/search (no token) 401
/api/catalog/search (no token)  200
/api/hf/api/models (no token)   200
/healthz (no token)             200
```

`/healthz` body: `{"ok":true,"ollamaHost":"http://127.0.0.1:11434","authRequired":true}`.

### Impact

- Upstream URL disclosure can reveal internal hostnames/ports (and credentials if the
  URL contains them).
- Absolute model paths, PIDs, and system metrics help an attacker plan further
  actions.
- Public proxies can be abused for outbound requests/rate limits under the app's
  identity; they are read-only and fixed to public hosts, so impact is low.
- The token gate is incomplete by design; document which endpoints are public.

### Remediation

1. Reduce `/healthz` to `{ok:true}`; do not include the upstream URL or auth mode.
   If the menu-bar app needs liveness, a bare 200 is sufficient.
2. Require the token/session for `/api/cache`, `/api/metrics`, `/api/daemon`, and
   `/api/downloads` (already done when the token is set); ensure the no-token default
   is loopback-only.
3. For `/api/catalog`/`/api/hf`, either keep them explicitly public (documented) or
   protect them too; add rate limiting and a response size cap.
4. Avoid returning absolute paths in API responses where a relative/opaque ID would
   suffice; at minimum, make this a deliberate, documented choice.
5. Add an auth test matrix to CI for every route.

---

## OSA-15 — Token mode breaks the default ModelScope channel

**Severity:** Low (functional regression with a security downside: users may disable
the token to make search work).
**CWE:** CWE-287 analogy (improper authentication handling in the client); no direct
vulnerability.
**Affected:** `src/api/catalog.ts:155-167`; `server.ts:51`.
**Evidence:** [04-auth-coverage.txt](evidence/04-auth-coverage.txt).

### Summary

`/api/modelscope/search` is protected by `PROXY_TOKEN`, but the browser client omits
`proxyAuthHeaders()` for this request. With a token configured, the default
ModelScope channel returns 401; the Ollama and Hugging Face channels still work
because their endpoints are public. A user may respond by removing the token,
weakening the (already weak) protection.

### Technical detail

```ts
// src/api/catalog.ts
response = await fetch(`/api/modelscope/search?q=${encodeURIComponent(trimmed)}`, {
  signal,
  headers: { accept: 'application/json' }
});
```

No `proxyAuthHeaders()` — unlike `src/api/cache.ts`, `src/api/downloads.ts`,
`src/api/export.ts`, `src/api/metrics.ts`, and `src/api/daemon.ts`.

The server returns 401 without the header and 200 with it
([04](evidence/04-auth-coverage.txt)).

### Impact

- Default channel search fails in token mode.
- Users may disable the token or bind broadly without auth to restore functionality.
- Inconsistent client behavior makes token deployment unreliable.

### Remediation

1. Add `...proxyAuthHeaders()` to the ModelScope search request (and any future
   protected endpoint).
2. If the token-in-bundle design is removed (OSA-01), use the same session/CSRF
   mechanism for this request.
3. Add a test that runs the client against a token-protected server and asserts all
   three catalog channels succeed.
