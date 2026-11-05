# Hardening and informational observations

Lower-severity items OSA-16 through OSA-24, plus a record of controls that were
checked and found to be sound. These do not need immediate action ahead of the P0
items in [README.md](README.md), but they improve resilience and reduce future risk.

---

## OSA-16 — ModelScope search and file-list fetches have no timeout

**Severity:** Low (availability).
**CWE:** CWE-400, CWE-1088 (Synchronous Access of Remote Resource without Timeout).
**Affected:** `server/modelscope.ts:199-210` (`searchModelScope`),
`server/modelscope.ts:278-293` (`fetchModelScopeFileEntries`),
`server/modelscope.ts:372-400` (`handleModelScopeSearchRequest`).

### Detail

```ts
const response = await fetch('https://modelscope.cn/api/v1/dolphin/models', {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'user-agent': 'ollama-studio' },
  body: JSON.stringify({ ... })
});
```

and

```ts
const response = await fetch(url, { headers: { 'user-agent': 'ollama-studio' } });
```

Neither passes an `AbortSignal`, and the handler does not abort when the client
disconnects. `searchModelScope` also fetches the file list for up to 24 hits in
batches of six; a slow upstream can hold the HTTP request and Node resources for a
long time. The Ollama catalog and HF proxy use explicit timeouts
(`server.ts:96`, `server.ts:131`), so this is an inconsistency.

### Impact

- A stalled ModelScope response can hang `/api/modelscope/search` indefinitely; a
  client can trigger repeated searches, consuming sockets.
- A download job's resolve phase has an abort signal, but the search/file-list path
  does not.
- No data loss; availability only.

### Remediation

- Pass `AbortSignal.timeout(12000)` to every `fetch` and propagate the request's
  abort signal.
- Bound the total search time (e.g. 15s) and return a clear 504/502 error.
- Add a timeout test with a never-resolving mock server.

---

## OSA-17 — `/api/hf` prefix allowlist is not segment-safe

**Severity:** Low.
**CWE:** CWE-20 (Improper Input Validation), CWE-697 (Incorrect Comparison).
**Affected:** `server.ts:116-123`.

### Detail

```ts
if (target.origin !== 'https://huggingface.co' || !target.pathname.startsWith('/api/models')) {
  response.status(400).json({ error: '不支持的 Hugging Face 路径' });
  return;
}
```

`startsWith('/api/models')` also accepts `/api/modelsfoo`, `/api/models-anything`, and
similar paths. The audit probe `/api/hf/api/modelsfoo` reached Hugging Face and
returned its 401 (`502` from the proxy), proving the prefix is broader than intended.
The target origin is fixed, so this is not SSRF; it just widens the set of HF API
endpoints the proxy can reach.

### Remediation

- Require `target.pathname === '/api/models' || target.pathname.startsWith('/api/models/')`.
- Add tests for `/api/modelsfoo`, `/api/modelsX`, and a valid `/api/models/...`.
- Consider allowing only the specific search query shape used by the client.

---

## OSA-18 — Token comparison, rate limiting, and weak examples

**Severity:** Low.
**CWE:** CWE-208 (Observable Timing Discrepancy), CWE-307 (Improper Restriction of
Excessive Authentication Attempts), CWE-521 (Weak Password Requirements).
**Affected:** `server.ts:22-44`; `vite.config.ts:25-41`; `.env.example:14-15`;
`README.md:159-162`, `README.zh-CN.md:159-162`.

### Detail

- `readProxyToken(request) === proxyToken` uses string equality; it is not
  constant-time. Over loopback/LAN, a timing attack on a 32-byte random token is
  impractical, but it is a standard hardening item.
- No failed-auth rate limit or lockout. If the server is on a LAN and the token is
  short, online guessing is possible.
- Documentation uses `change-me` as the example token. Users may copy it literally;
  it is trivially guessable.
- `PROXY_TOKEN` is a single shared secret with no user identity, auditing, or
  revocation. This is acknowledged in `RISKS.md` (R-025) but worth repeating.

### Remediation

- Compare fixed-length hashes with `crypto.timingSafeEqual`:
  ```ts
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  if (a.length === b.length && timingSafeEqual(a, b)) ...
  ```
- Add a small in-memory rate limiter for 401s (e.g. 10 attempts/minute/IP) or rely on
  a reverse proxy.
- Require at least 32 random characters; reject placeholders and whitespace-only
  values.
- Document `openssl rand -hex 32` and never commit the token.
- Prefer per-session authentication over a shared secret.

---

## OSA-19 — Child processes inherit secrets; daemon control uses a shell

**Severity:** Informational (latent).
**CWE:** CWE-526 (Exposure of Sensitive Information Through Environmental Variables),
CWE-78 (OS Command Injection — currently mitigated).
**Affected:** `server/importGguf.ts:95-99` (env spread),
`server/daemon.ts:366` (`/bin/sh -c`), `server/cache.ts:633-651` (`spawn`).

### Detail

`createModelFromGguf` executes:

```ts
await execFileAsync('ollama', ['create', model, '-f', modelfilePath], {
  env: { ...process.env, OLLAMA_HOST: ollamaHost },
  ...
});
```

The child inherits `PROXY_TOKEN`, `VITE_PROXY_TOKEN`, and any other app secrets. A
compromised `ollama` binary/CLI wrapper or a crash dump could expose them. Similar
inheritance applies to `ollama --version` and the daemon commands.

`handleDaemonControlRequest` executes `execFileAsync('/bin/sh', ['-c', command])`. The
command is assembled from `manager`, `label`, `uid`, and `appPid`:
`label` is validated with `^[a-zA-Z0-9._-]+$` in `buildDaemonCommands`, `uid` is
numeric, and `appPid` is parsed as an integer, so this audit found **no user-controlled
shell injection**. The shell remains a latent sink if a future caller passes
unsanitized input.

`openInFileManager` uses `spawn` with argv arrays (macOS `open`, Windows `explorer`,
Linux `xdg-open`) and no shell; path validation is performed by
`resolveRevealTarget`. No injection found.

### Remediation

- Build a minimal environment for child processes instead of spreading
  `process.env`: include `PATH`, `HOME`, `OLLAMA_HOST`, and platform-required
  variables only.
- Replace `/bin/sh -c` with argv arrays (`['kill', pid]`, `['launchctl', ...]`,
  `['open', '-a', 'Ollama']`) or a strict command allowlist with no string
  concatenation.
- Keep the tests that reject shell characters in `launchd` labels and validate
  `appPid` as a positive integer.

---

## OSA-20 — CI and release hardening

**Severity:** Low / Informational.
**CWE:** CWE-1357 (Reliance on Insufficiently Trustworthy Component), CWE-1104
(Use of Unmaintained Third Party Components) analogy.
**Affected:** `.github/workflows/ci.yml:3-36`; `macos/menu-bar/build.sh:79-81`;
release process (manual DMG, ad-hoc signing).

### Detail

- `actions/checkout@v4` and `actions/setup-node@v4` use floating major tags, not
  commit SHAs. A compromised/retagged action can execute in CI. Pin SHAs and enable
  Dependabot for updates.
- The workflow has no `permissions:` block. The default `GITHUB_TOKEN` may have write
  access; set `permissions: contents: read` for a build/test workflow.
- No `npm audit`, SCA, CodeQL, secret scanning, or SBOM step. `npm audit` is clean
  today (0/370) but nothing prevents a regression.
- `npm ci` runs dependency lifecycle scripts with the runner's token/network.
  Consider `--ignore-scripts` where the toolchain allows it, or a allowlist.
- The macOS app is ad-hoc signed (`codesign --force --deep --sign -`) and not
  notarized. Users cannot verify the publisher; Gatekeeper may require a bypass.
  `--deep` is deprecated and signs nested code in one pass; sign inner components
  first for a real identity.
- Releases are built and uploaded manually; there is no CI-built, reproducible, or
  signed artifact, and no checksum file in the repo. The release notes contain a
  SHA256, but the process is manual.
- No `SECURITY.md`/private disclosure policy.

### Remediation

- Pin GitHub Actions to full commit SHAs and add Dependabot.
- Add `permissions: contents: read` (and `id-token: none` unless needed).
- Add `npm audit --audit-level=high`, `npm sbom`, and CodeQL or a comparable SAST
  workflow; run `npm ci --ignore-scripts` if compatible.
- Add a release workflow that builds on a clean runner, signs with a Developer ID,
  notarizes, publishes a SHA256/SHA512 checksum, and attaches an SBOM.
- Add `SECURITY.md` with a private reporting channel and supported versions.
- Review `build.sh` for supply-chain inputs (Node binary copied from the build host,
  Homebrew paths, Swift toolchain).

---

## OSA-21 — Export copy has a TOCTOU/symlink race

**Severity:** Low (local).
**CWE:** CWE-367 (Time-of-check Time-of-use Race Condition), CWE-59 (Improper Link
Resolution Before File Access).
**Affected:** `server/exportGguf.ts:255-267` (`uniqueTarget`),
`server/exportGguf.ts:311` (`copyFile`).

### Detail

`uniqueTarget` uses `stat` to find a free name, then `copyFile` with
`COPYFILE_FICLONE` (no `COPYFILE_EXCL`). Between the check and the copy, another
process could create a file or symlink at the target. `copyFile` follows a destination
symlink, so a local attacker who can write to the export directory could cause a model
copy to overwrite a file outside that directory. The default export directory is under
the user's home; the explicit directory is allowlisted via `realpath`.

This requires local write access to the export directory, so it is not a remote
vulnerability. Concurrent exports of the same model can also race and overwrite each
other.

### Remediation

- Use `copyFile(src, dest, COPYFILE_FICLONE | COPYFILE_EXCL)` and retry with the next
  suffix on `EEXIST`.
- Use `lstat` and refuse symlinks; open the destination with `O_CREAT|O_EXCL` and
  stream the copy if `copyFile` cannot guarantee exclusivity.
- Serialize exports per target directory (in-process queue; cross-process lock if
  needed).
- Optionally verify the destination is inside the resolved export directory with
  `realpath` after creation.

---

## OSA-22 — Cancelling a job during `ollama create` does not stop the CLI

**Severity:** Informational.
**CWE:** CWE-404 (Improper Resource Shutdown or Release), CWE-367 (state/race).
**Affected:** `server/downloads.ts:431-439` (DELETE aborts the controller);
`server/importGguf.ts:80-99` (`execFile` has no signal).

### Detail

`DELETE /api/downloads/<id>` calls `job.controller.abort()`, which aborts the HTTP
download. Once the job reaches the `creating` stage, `createModelFromGguf` runs
`ollama create` with `execFile` and no `AbortSignal`. The UI marks the job
`cancelled`, but the CLI may continue and register the model after the cancellation.
The temp directory is removed in `finally`, but that happens after the CLI exits.

The reverse is also possible: the job reports success/failure for a CLI that is still
finishing. This is a correctness/cleanup issue rather than a privilege boundary.

### Remediation

- Pass an `AbortSignal` to `execFile` (`signal` option is supported in Node 16+), or
  track the child and `kill` it on abort; wait for exit before marking cancelled.
- Do not delete the temp GGUF until the CLI has exited (already true in the `finally`,
  but cancellation should join that path).
- Make the job state model explicit: `cancelling` until the download/CLI actually
  stops, then `cancelled`.
- Add a test with a slow fake CLI.

---

## OSA-23 — Chat data at rest and missing disclosure policy

**Severity:** Informational.
**CWE:** CWE-312 (Cleartext Storage of Sensitive Information), CWE-1059 (Insufficient
Technical Documentation) analogy.
**Affected:** `src/lib/storage.ts`, `src/lib/chatSessions.ts`,
`src/lib/attachments.ts`; browser `localStorage`; repository root (no `SECURITY.md`).

### Detail

Chat sessions, model parameters, download task metadata, attachments (base64 JPEG
frames), theme, and model-origin records are stored in `localStorage` in clear text.
Any JavaScript running on the app origin (including the third-party HTML scenarios in
OSA-12/13, or a future XSS) can read them. A local process with access to the browser
profile can also read them. There is no encryption, expiry, or "clear all data"
control beyond the app's own delete actions.

This is normal for a local-first chat UI, but it should be a documented privacy
property, especially because prompts may contain sensitive content and images.

There is no `SECURITY.md` with a vulnerability disclosure process.

### Remediation

- Document that chat history/attachments are stored unencrypted in browser storage
  and are readable by anyone/anything with access to the browser profile.
- Add a "clear all local data" action and an explicit retention choice.
- Consider IndexedDB with a size cap and optional encryption if the threat model
  includes local profile access.
- Reduce attachment retention (e.g. store thumbnails only, or make persistence
  opt-in).
- Add `SECURITY.md` with a private reporting address and supported versions.

---

## OSA-24 — SPA fallback returns 200 HTML for unknown API GETs and missing assets

**Severity:** Informational.
**CWE:** CWE-20 analogy (incorrect error semantics), no direct security impact.
**Affected:** `server.ts:290-295`; `app.get('*')`.

### Detail

`express.static(distDir)` is followed by a catch-all `GET *` that returns
`dist/index.html` with HTTP 200. As a result:

- `GET /api/%63ache`, `GET /api/cache/` (some encodings), `/server.js`,
  `/package.json`, and `/.env` return the SPA HTML, not a 404. This audit confirmed
  no source/secrets are exposed, but the behavior masks missing routes and can confuse
  clients/monitoring.
- A missing JS asset (e.g. a stale `index-*.js` after a deploy) returns HTML with a
  JavaScript content type request, causing a syntax error in the browser instead of a
  clear 404.
- It makes API enumeration/noise harder to distinguish from real endpoints.

### Remediation

- Mount API routes with a JSON 404 handler before the SPA fallback.
- For `/assets/*` requests that do not match a file, return 404 (do not fall back to
  `index.html`).
- Restrict the SPA fallback to requests that accept HTML and do not start with
  `/api/`, `/ollama/`, or `/assets/`.
- Keep the fallback for client-side routes only.

---

## Positive controls verified

The following were explicitly checked and did not reveal a vulnerability. They are
recorded so future work does not re-litigate them without new evidence.

### Injection and browser-side execution

- No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `document.write`, `eval`, `new Function`, or `window.open` in `src/` or `server/`.
  React escapes model names, descriptions, messages, errors, and catalog text.
- The Ollama catalog parser uses `DOMParser` and `textContent`; it does not inject
  HTML into the app DOM.
- The `<script>alert(1)</script>` query is escaped by ollama.com; no reflected XSS was
  found in `/api/catalog/search` (the raw payload appears zero times).
- External links use `target="_blank"` with `rel="noreferrer"` (and `noopener` where
  set), preventing reverse tabnabbing.
- Attachments are processed in the browser via canvas/`createImageBitmap` and sent as
  data URLs; PDFs/archives are rejected. No server-side file parsing of arbitrary
  formats.

### SSRF and URL handling

- HF repo/file/revision and ModelScope namespace/name/file are segment-validated and
  percent-encoded; `..`, backslash, NUL, and non-`.gguf` files are rejected.
- `/api/hf` pins the origin to `https://huggingface.co` and the path prefix to
  `/api/models`; `//evil.example`, `https://evil.example`, and `../../evil` probes
  returned 400.
- `/api/catalog` pins the URL to `https://ollama.com/search` and encodes the query.
- `/api/modelscope` pins hosts to `modelscope.cn` and encodes segments.
- The Ollama proxy target is built from the configured `ollamaHost` plus a path that
  always starts with `/` (Express mount strips `/ollama`), so a userinfo/authority
  injection such as `http://host@evil` is not reachable through the route.
- HF/ModelScope downloads follow redirects; this is a residual low risk (a trusted
  upstream redirect to an internal address) but no exploitable open redirect was
  found. If the threat model includes compromised registries, validate the final URL
  and disallow loopback/private addresses.

### Filesystem and child processes

- `/api/export` validates the model reference (`SAFE_SEGMENT`/`SAFE_REGISTRY`),
  manifest paths, digests, and the target directory (`realpath` + allowlist). Probes:
  `../../etc/passwd` → 400, `a/../../b` → 400, `/etc` → 403.
- `/api/cache/reveal` restricts to the models directory or `ollama-studio-*` temp
  paths, resolves `realpath`, and returns 400/403/404 for empty/out-of-scope/missing
  paths. Probes: `/etc/hosts` → 403, `/tmp/ollama-studio-*` on macOS → 403 (the real
  temp root is under `/var/folders`), empty → 400.
- GGUF import uses `path.basename`, a fixed temp directory, `execFile` with argv
  arrays, and a 20 GB stream limit; it removes the temp directory in `finally`.
- Cache cleanup uses `rename` to a quarantine directory for orphans, validates
  manifest digests and symlink targets, and refuses to clean when a manifest fails to
  parse or a v2 symlink is broken/dangling (the R-042 fix). The remaining gaps are
  OSA-04/05, not the symlink logic.
- Daemon commands are built from a fixed manager enum, a validated launchd label,
  numeric uid, and numeric app PID; `resolveExecutable` disables systemd `sudo`
  commands. No user-controlled shell fragment was found.
- `/api/metrics` uses `execFile('ioreg', [...])` with fixed args; no shell.
- `/api/daemon` detection uses fixed `ps`, `launchctl`, `pgrep`, `test`, and
  `systemctl` invocations with fixed args; no user input.

### Network and auth

- The default bind is `127.0.0.1`; `dev` and `preview` also bind loopback.
- The token gate works on the listed endpoints: no token → 401, Bearer or
  `X-Proxy-Token` → 200 (verified for `/api/cache`).
- No CORS headers are emitted, so a cross-origin attacker cannot read responses via
  simple requests (though side effects and DNS rebinding remain; OSA-02/03).
- The `/ollama` proxy aborts the upstream request on client disconnect and does not
  forward upstream `set-cookie`/`location` headers back to the browser.
- The menu-bar app forces `HOST=127.0.0.1`, sets `NODE_ENV=production`, and removes
  `PROXY_TOKEN`/`VITE_PROXY_TOKEN` from the child environment
  (`macos/menu-bar/main.swift:281-288`). It does not enable token mode; it relies on
  loopback binding.

### Supply chain and repository hygiene

- `.env` is gitignored (`.gitignore:7-8`); only `.env.example` is tracked.
- No real secrets were found in the working tree or git history; only documentation
  placeholders and test tokens.
- `package-lock.json` resolves all 370 packages from `https://registry.npmjs.org`;
  no unknown registries or git/tarball dependencies.
- `npm audit` reports 0 vulnerabilities (production + dev) at audit time.
- No source maps in `dist/`; no source files served by the production static handler.
- 17 test files / 164 tests pass; `tsc --noEmit` passes; `server.js` is byte-identical
  to a fresh build.
