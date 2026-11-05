# Remediation checklist

Ordered by risk reduction, not by effort. Each item has a file reference, a concrete
change, and a way to verify it. Do not deploy to a LAN until P0 is complete.

## P0 — before any non-loopback exposure (recommended for loopback too)

### P0-1. Remove the client-embedded secret (OSA-01)

- [ ] Delete `VITE_PROXY_TOKEN` reads from `src/api/ollama.ts:3-19` and remove
      `proxyAuthHeaders()` from the browser bundle.
- [ ] Implement a server-side session:
  - a small login/pairing page that accepts the token once;
  - exchange it for an `HttpOnly`, `SameSite=Strict`, `Secure` cookie (or an
    in-memory session ID);
  - protect API routes with the session, not a value compiled into JS.
  - Alternatively, put a real authenticating reverse proxy in front of the app.
- [ ] If the token must remain, do **not** claim it is authentication; document it as a
      local speed bump. A runtime-entered token kept in memory is the minimum.
- [ ] Remove `PROXY_TOKEN` from `build`/DMG artifacts and check `dist/` for the value.

**Verify:** build with a test token; `grep -R '<token>' dist/` returns nothing.
Fetch `/`, follow every JS asset without credentials, and assert the token is absent.
`GET /api/cache` without a session → 401; with a valid session → 200.

### P0-2. Add Host and CSRF enforcement (OSA-02, OSA-03)

- [ ] Add a Host allowlist at the very top of `server.ts` (before static/routes):
      `127.0.0.1:<port>`, `localhost:<port>`, `[::1]:<port>`, plus any explicitly
      configured LAN host. Reject unknown Host with 421/403.
- [ ] Add an origin/CSRF middleware for all non-GET requests:
  - reject `Origin` values not in the allowlist (allow absent Origin only for
    non-browser clients that also present a valid token/session);
  - reject `Sec-Fetch-Site: cross-site`/`same-site` unless explicitly configured;
  - require `Content-Type: application/json` for JSON endpoints (415 otherwise);
  - require a custom header (e.g. `X-Ollama-Studio-CSRF`) or a per-session CSRF token
    for destructive endpoints.
- [ ] Add `confirm: true`/nonce requirements to `/api/cache/cleanup`,
      `/api/export`, and `/api/daemon/control`.
- [ ] Keep `isLoopback()` as defense-in-depth, not as the primary gate; it does not
      distinguish a browser on the machine from a remote page.
- [ ] In Vite dev, add the same checks; set `server.allowedHosts` explicitly for
      `dev:lan`.
- [ ] `app.set('trust proxy', false)` unless a trusted proxy is configured; if so,
      validate `X-Forwarded-Host` against the same allowlist.

**Verify:** `curl -H 'Host: evil.example'` → 421/403; `curl --resolve
evil.example:<port>:127.0.0.1` → 421/403; `POST` with `Origin: https://evil.example`
and `Content-Type: text/plain` → 403/415; valid same-origin app flows still work.
Add these as integration tests.

### P0-3. Fix cache scan completeness (OSA-04)

- [ ] In `server/cache.ts`, set `complete = false` if neither `manifests/` nor
      `manifests-v2/` exists.
- [ ] If blobs exist but zero manifest files were parsed successfully, set
      `complete = false`.
- [ ] Refuse `cleanCache(['orphan'])` when `complete === false` (already does) and
      surface a clear reason ("no manifest store found; orphan cleanup disabled").
- [ ] Add a `manifestFiles`/`manifestRoots` count to `CacheReport` and show it in the
      UI.
- [ ] Add tests:
  - `blobs/` + empty `manifests/` → `scanComplete === false`;
  - `cleanCache(['orphan'])` → 409;
  - normal fixture with a manifest → still `true`.

**Verify:** the new fixture test and the evidence scenario in
[05](../evidence/05-cache-scan-complete.txt) now refuse cleanup.

### P0-4. Fix cleanup races and active-download locks (OSA-05)

- [ ] Gate `temp` and `orphan` on `hasRunningDownloads()` (not just `partial`).
      Return 409 while a job is running, or require `force: true` with a warning.
- [ ] Apply `RECENT_MS` to complete blobs in the orphan scan; skip anything modified
      in the last 10 minutes.
- [ ] Replace directory-mtime recency for temp dirs with a per-job lock/heartbeat:
      create a lock file and update its mtime while downloading; cleanup skips fresh
      locks.
- [ ] Add a cross-process lock (e.g. an exclusive lock file in the models directory)
      so two app instances cannot clean concurrently.
- [ ] Re-check `hasRunningDownloads()` and re-scan immediately before each `rm`/
      `rename`.
- [ ] In `src/screens/TelemetryScreen.tsx`, set `locked: cacheReport.activeDownloads`
      (or a per-target lock) for `temp` and `orphan` too; do not hard-code
      `locked: false` (line 1709).
- [ ] Add tests: a delayed job + cleanup for each target → 409 and fixtures remain;
      a fresh blob → not quarantined; an old orphan → quarantined.

**Verify:** run the delayed-job scenario from
[06](../evidence/06-cache-cleanup-active-download.txt); both fixtures must remain.

### P0-5. Fail closed on non-loopback binds; strip proxy headers (OSA-06, OSA-07)

- [ ] In `server.ts`, refuse to start when `HOST` is non-loopback and
      `PROXY_TOKEN` is empty, unless `ALLOW_INSECURE_BIND=1` is set explicitly.
- [ ] Enforce token strength (e.g. ≥32 chars; reject `change-me`, `test-secret`,
      empty/whitespace).
- [ ] Update `.env.example` and README to use `openssl rand -hex 32`, not
      `change-me`; remove the unqualified `HOST=0.0.0.0` example or mark it
      dangerous.
- [ ] In `/ollama`, forward only `content-type`, `accept`, `user-agent`, and required
      Ollama headers. Strip `authorization`, `x-proxy-token`, `cookie`, `origin`,
      `referer`, and `x-forwarded-*`.
- [ ] If a reverse proxy is supported, document `trust proxy` and the Host allowlist;
      do not treat loopback source as authentication.

**Verify:** start with `HOST=0.0.0.0` and no token → process exits; with a token and an
echo upstream, the upstream does not see `authorization`/`cookie`.

## P1 — hardening this sprint

### P1-1. Security headers and CSP (OSA-08)

- [ ] Add the middleware from [findings.md](../findings.md) (OSA-08).
- [ ] `app.disable('x-powered-by')`.
- [ ] Set `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- [ ] Keep `img-src data: blob:`, `media-src blob:`, `style-src 'unsafe-inline'` for
      the existing UI; verify the app and chat attachments still render.
- [ ] If `VITE_OLLAMA_BASE_URL` is used, add that origin to `connect-src`; otherwise
      `'self'`.

**Verify:** `curl -D - /` shows the headers; load the app and exercise chat
attachments, fonts, and the theme picker; check the console for CSP violations.

### P1-2. Proxy body streaming/limit and timeouts (OSA-09)

- [ ] Stream the request body with `Readable.toWeb(request)` and `duplex: 'half'`, or
      enforce a hard byte cap and return 413.
- [ ] Add an upstream timeout and idle timeout; keep long-lived streaming responses
      working.
- [ ] Add a concurrency limit for proxied requests.
- [ ] Log body sizes/durations.

**Verify:** send a 100 MB body → 413 or streamed without heap growth; a hung upstream
times out; normal chat/pull streaming still works.

### P1-3. Error handling and mode (OSA-10)

- [ ] Set `NODE_ENV=production` for `npm start` (and the menu-bar child already does).
- [ ] Add a custom error handler returning generic JSON; log details server-side.
- [ ] Handle malformed URI errors without a stack.
- [ ] Disable `X-Powered-By`.

**Verify:** `/%ZZ` returns a generic 400 with no `at` frames or absolute paths.

### P1-4. Download admission control (OSA-11)

- [ ] Max concurrent jobs (e.g. 2) + queue; return 429 with `Retry-After`.
- [ ] Check free disk space before starting; reserve expected size + margin.
- [ ] Add network idle timeouts; reap stuck running jobs.
- [ ] Per-host/per-kind limits; expose queue position.

**Verify:** start 10 downloads → at most the limit run, the rest queue/reject; disk
check rejects when below the threshold.

### P1-5. Token-mode ModelScope fix and timeouts (OSA-15, OSA-16)

- [ ] Add `...proxyAuthHeaders()` (or the new session header) to
      `src/api/catalog.ts:164-167`.
- [ ] Add `AbortSignal.timeout(12000)` to ModelScope search and file-list fetches;
      propagate client abort.
- [ ] Test all three catalog channels with a token configured.

**Verify:** with a token, ModelScope search returns 200; a stalled mock upstream
times out within the configured limit.

## P2 — cleanup and assurance

### P2-1. Stop proxying raw HTML (OSA-12)

- [ ] Parse the Ollama search page server-side and return JSON, or return the HTML as
      `text/plain`/`application/octet-stream`.
- [ ] Keep the frontend on `DOMParser` only for inert HTML if needed.
- [ ] Apply the CSP from P1-1.

**Verify:** direct navigation to `/api/catalog/search?q=llama` does not execute
scripts; the app search still works.

### P2-2. Remove design mocks from production (OSA-13)

- [ ] Move `public/assets/aistudio/*` out of `public/` (e.g. `docs/assets/`) or delete
      them.
- [ ] Add a build check that `dist/assets/aistudio` does not exist.
- [ ] Confirm `/assets/aistudio/...` returns 404.

### P2-3. Tighten `/api/hf`, token comparison, rate limiting (OSA-17, OSA-18)

- [ ] Require `pathname === '/api/models'` or `startsWith('/api/models/')`.
- [ ] Use `crypto.timingSafeEqual` on hashed tokens.
- [ ] Add a 401 rate limiter (e.g. 10/min/IP) and a strong-token check.
- [ ] Replace `change-me` examples with a generated random token.

### P2-4. Subprocess environment and shell removal (OSA-19)

- [ ] Build a minimal child env (`PATH`, `HOME`, `OLLAMA_HOST`) instead of
      `...process.env`.
- [ ] Replace `/bin/sh -c` daemon commands with argv arrays or a strict command
      allowlist.
- [ ] Keep the launchd-label validation and numeric PID/uid checks.

### P2-5. CI, release, and supply chain (OSA-20)

- [ ] Pin `actions/checkout` and `actions/setup-node` to commit SHAs; add Dependabot.
- [ ] Add `permissions: contents: read`.
- [ ] Add `npm audit --audit-level=high`, `npm sbom`, and CodeQL/SAST.
- [ ] Build releases in CI; sign with Developer ID; notarize; publish SHA256 and SBOM.
- [ ] Add `SECURITY.md` with a private reporting channel.
- [ ] Review `build.sh` inputs (Node binary, Homebrew paths).

### P2-6. Export copy hardening (OSA-21) and cancellation (OSA-22)

- [ ] Use `COPYFILE_FICLONE | COPYFILE_EXCL`; retry with the next suffix on `EEXIST`.
- [ ] Refuse symlinks/`lstat` targets; serialize exports per directory.
- [ ] Pass an `AbortSignal` to `execFile` for `ollama create`; wait for exit before
      marking cancelled.

### P2-7. Privacy and disclosure (OSA-23, OSA-24)

- [ ] Document unencrypted `localStorage` chat/attachment retention; add "clear all
      local data".
- [ ] Add `SECURITY.md`.
- [ ] Return JSON 404 for unknown `/api/*`, 404 for missing `/assets/*`, and restrict
      the SPA fallback to HTML navigation.

## Regression tests to add

| Test                                                                                         | Expected                                  |
| -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Host: evil.example` on `/`, `/api/cache`, `/ollama/api/tags`                                | 421/403                                   |
| `Origin: https://evil.example` + `Content-Type: text/plain` POST to cleanup/downloads/daemon | 403/415                                   |
| Build with `VITE_PROXY_TOKEN=test`; fetch `/` + assets                                       | token absent                              |
| Empty `manifests/` + blobs                                                                   | `scanComplete=false`; orphan cleanup 409  |
| Active download + cleanup temp/orphan                                                        | 409; fixtures remain                      |
| Fresh blob (mtime now) + cleanup orphan                                                      | not quarantined                           |
| Echo upstream + `/ollama` request with Authorization/Cookie                                  | upstream does not see them                |
| `/%ZZ`                                                                                       | no stack/absolute paths                   |
| `/api/catalog/search` direct navigation                                                      | no script execution (or 200 `text/plain`) |
| Token mode + all three catalog channels                                                      | 200                                       |

## Verification commands

See [verification-commands.md](verification-commands.md) for safe commands. Run them
against a fixture (`OLLAMA_MODELS` pointing at a temporary directory) and an echo
upstream, not the real model store. Do not test daemon stop against a real Ollama
instance.
