# Security Audit — Ollama Studio

| | |
| --- | --- |
| Audit date | 2026-10-29 |
| Target | Ollama Studio (`package.json` version `0.2.0`) |
| Commit | `56d660e` (`docs: 同步 0.2.0 发布结果与版本号治理说明`) |
| Scope | Web/Node production server, Vite dev server, React client, local management APIs, download pipeline, Ollama cache tooling, macOS menu-bar wrapper, CI/release configuration |
| Method | Manual source review, targeted dynamic probes against the production build, dependency/secret scans, baseline checks |
| Result | **1 critical / 4 high / 5 medium / 10 low / 4 informational findings** |

> This directory was added by the audit. No repository source, configuration, test, or
> project documentation file was modified. Temporary fixtures under the system temp
> directory and a temporary build under `/tmp` were removed after evidence collection.

## Executive summary

Ollama Studio is a local-first tool. Its default posture (bind `127.0.0.1`, no token)
is sensible for a single-user machine, and the codebase has several good security
properties: no `eval`/`innerHTML`/`dangerouslySetInnerHTML` sinks, URL and path
allowlists for remote GGUF downloads and filesystem operations, no shell interpolation
for most child processes, a lockfile-only dependency tree, and no live secrets in the
repository or its history.

The audit nevertheless found that **the localhost boundary is not a security boundary**:

- The optional `PROXY_TOKEN` is embedded into the JavaScript bundle served by the
  unauthenticated static endpoint. Any client that can reach the HTTP server can fetch
  `/`, follow the bundle URL, extract the token, and call the protected APIs
  (`OSA-01`). Token mode is therefore not an access control against a network attacker.
- State-changing endpoints accept cross-origin, CORS-simple `text/plain` POST requests
  and do not inspect `Origin`/`Sec-Fetch-Site`. A malicious website can trigger cache
  cleanup, downloads, exports, Ollama operations, and (with `ALLOW_DAEMON_CONTROL=1`)
  daemon start/stop (`OSA-02`).
- The production server accepts arbitrary `Host` headers. A DNS-rebinding page can
  become same-origin with the local service and read/write every API, including
  `DELETE /ollama/api/delete` (`OSA-03`).
- Cache cleanup has two data-safety gaps. A missing/empty manifest store is treated as
  a complete scan, so blobs can be classified as orphans (`OSA-04`); and cleanup does
  not honor active downloads for the `temp` and `orphan` categories, so it can delete
  an in-progress download and quarantine freshly written blobs (`OSA-05`).

These issues matter most when the app is exposed on a LAN or when `PROXY_TOKEN` is used
as the only protection. They also matter on a loopback-only machine because a normal
web page in the user's browser can reach loopback services via CSRF, and DNS rebinding
can turn that into full read/write access.

**Bottom line:** do not expose this server beyond loopback in its current form. Before
doing so, implement the P0 items in [appendix/remediation-checklist.md](appendix/remediation-checklist.md):
remove the client-embedded secret, add Host/Origin enforcement, add cache safety
interlocks, and fail closed on non-loopback binds. Even for single-user loopback use,
the CSRF and cache-cleanup issues deserve prompt fixes.

## 摘要（中文）

本次审计覆盖 `server.ts`/`server/`、React 前端、Vite 开发代理、后台下载、Ollama 缓存
清理/导出、macOS 菜单栏封装、CI 与发布配置。共记录 **24 项**：1 项 Critical（仅在把
`PROXY_TOKEN` 当作访问控制时）、4 项 High、5 项 Medium、10 项 Low、4 项信息级。

最需要先处理的问题：

1. **OSA-01：`PROXY_TOKEN` 会进入前端 bundle，而静态资源无需认证即可下载。** 任何能访问
   HTTP 端口的人都能从 `/assets/index-*.js` 提取令牌，再用它调用受保护 API。令牌模式下
   这不是访问控制。
2. **OSA-02：状态变更接口可被跨站 CSRF。** 服务端不检查 `Origin`/`Sec-Fetch-Site`，
   `readJsonBody` 也不要求 `Content-Type: application/json`；恶意网站可用
   `text/plain` 简单请求触发缓存清理、下载、导出、Ollama 操作；开启
   `ALLOW_DAEMON_CONTROL=1` 时还可达 daemon 控制。loopback 来源检查挡不住浏览器请求。
3. **OSA-03：生产服务不校验 `Host`，存在 DNS rebinding 风险。** 攻击者域名解析到
   `127.0.0.1` 后，浏览器会把它当作同源，可读写所有 API，包括 `DELETE
   /ollama/api/delete`。
4. **OSA-04/05：缓存清理可能造成数据丢失。** manifest 目录缺失或为空时
   `scanComplete` 仍为 `true`，所有 blob 会被判定为 orphan；清理 `temp`/`orphan` 时不
   检查活动下载，也没有对“刚写入的 blob”的最近修改保护，实测可在下载进行中删除临时
   目录并隔离新 blob。

默认只绑定 `127.0.0.1` 能降低网络暴露，但**不能视为安全边界**：恶意网页仍可通过 CSRF
触发本地副作用，DNS rebinding 可进一步获得完整读写能力。当前版本不应直接开放到局域网
或多用户环境；即使单机使用，也建议尽快修复 CSRF 与缓存清理问题。P0 修复顺序见
[appendix/remediation-checklist.md](appendix/remediation-checklist.md)：移除前端密钥、
增加 Host/Origin 校验、补齐缓存安全锁、非回环绑定失败关闭。

## Findings at a glance

Severity is contextual. The default loopback bind reduces network exposure; the
"token mode" and "LAN" conditions below are called out explicitly. See
[findings.md](findings.md) for reproduction details and remediation.

| ID | Finding | Severity | Primary evidence |
| --- | --- | --- | --- |
| OSA-01 | `PROXY_TOKEN` is recoverable from the unauthenticated static JS bundle | **Critical** when token mode is used as access control; High overall | [03](evidence/03-token-extraction.txt) |
| OSA-02 | State-changing APIs are CSRF-able; no Origin/Sec-Fetch-Site check and no JSON content-type requirement | **High** | [02](evidence/02-csrf-text-plain.txt) |
| OSA-03 | No `Host` validation → DNS rebinding gives same-origin API access | **High** | [01](evidence/01-host-and-dns-rebinding.txt) |
| OSA-04 | `scanComplete` stays `true` when manifest roots are missing/empty → blobs treated as orphans | **High** (data loss) | [05](evidence/05-cache-scan-complete.txt) |
| OSA-05 | Cleanup ignores active downloads for `temp`/`orphan`; no recent-blob guard → deletes in-progress data | **High** (data loss) | [06](evidence/06-cache-cleanup-active-download.txt) |
| OSA-06 | Non-loopback bind without token only warns; server fails open | **Medium** | Code: `server.ts:301-306` |
| OSA-07 | `/ollama` proxy forwards `Authorization`, `X-Proxy-Token`, `Cookie` upstream | **Medium** | [07](evidence/07-proxy-header-forwarding.txt) |
| OSA-08 | Missing CSP / frame-ancestors / `X-Content-Type-Options` / Referrer-Policy; `X-Powered-By` exposed | **Medium** | [08](evidence/08-headers-and-error-handling.txt) |
| OSA-09 | `/ollama` buffers the entire request body in memory with no cap or timeout | **Medium** (availability) | [09](evidence/09-body-limit-and-concurrency.txt) |
| OSA-10 | Express stack traces and absolute paths exposed for malformed URLs (`NODE_ENV` unset) | **Low** | [08](evidence/08-headers-and-error-handling.txt) |
| OSA-11 | No concurrency/queue/disk admission control for download jobs | **Medium** (availability) | [09](evidence/09-body-limit-and-concurrency.txt) |
| OSA-12 | `/api/catalog/search` serves third-party HTML (with inline scripts) on the app origin | **Low** (defense-in-depth) | [13](evidence/13-catalog-html-proxy.txt) |
| OSA-13 | Design-mock HTML with remote scripts is shipped and publicly served | **Low** | [12](evidence/12-production-design-artifacts.txt) |
| OSA-14 | Auth coverage gaps; unauthenticated `/healthz` leaks upstream URL; management GETs expose paths/PIDs | **Low** | [04](evidence/04-auth-coverage.txt) |
| OSA-15 | Token mode breaks the default ModelScope channel (client omits the auth header) | **Low** (functional/security posture) | [04](evidence/04-auth-coverage.txt) |
| OSA-16 | ModelScope search/file-list fetches have no timeout or abort propagation | Low | Code: `server/modelscope.ts:199-210,278-293` |
| OSA-17 | `/api/hf` path allowlist uses `startsWith('/api/models')` rather than an exact segment | Low | Code: `server.ts:120` |
| OSA-18 | Token comparison is not constant-time; no rate limit; examples use `change-me` | Low | Code: `server.ts:40`, `.env.example:14-15` |
| OSA-19 | Child processes inherit `PROXY_TOKEN`; daemon control uses `/bin/sh -c` | Informational (latent) | Code: `server/importGguf.ts:96`, `server/daemon.ts:366` |
| OSA-20 | CI/release hardening: floating action tags, no `permissions`, no SCA/CodeQL, ad-hoc signing | Low / Informational | `.github/workflows/ci.yml`, `macos/menu-bar/build.sh:79-81` |
| OSA-21 | Export copy TOCTOU: `COPYFILE_FICLONE` without `COPYFILE_EXCL` | Low | Code: `server/exportGguf.ts:255-267,311` |
| OSA-22 | Cancelling a job during `ollama create` does not stop the CLI | Informational | Code: `server/importGguf.ts:80-99` |
| OSA-23 | Chat history/attachments stored unencrypted in `localStorage`; no `SECURITY.md` | Informational | Code: `src/lib/storage.ts`, `.github/` |
| OSA-24 | SPA fallback returns `200 text/html` for unknown `/api/*` GETs and missing assets | Informational | Code: `server.ts:293-295` |

## What was verified as good

These are positive controls, not findings:

- **No DOM XSS sinks found.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`, or `document.write` in `src/` or `server/`. React escapes model
  names, descriptions, chat content, and error strings.
- **No reflected XSS in the Ollama search proxy.** The upstream escapes the query
  (`<script>alert(1)</script>` appears five times as `&lt;script&gt;...`, never raw)
  in [evidence/13](evidence/13-catalog-html-proxy.txt).
- **No live secrets in the repository or git history.** `.env` is ignored; only
  `.env.example` and documentation placeholders (`change-me`, `test-secret`) exist.
  `package-lock.json` resolves all 370 packages from `https://registry.npmjs.org`.
- **No known dependency vulnerabilities** in the lockfile at audit time: `npm audit`
  reports 0 across production and development dependencies
  ([10](evidence/10-npm-audit.json), [11](evidence/11-dependencies-baseline-secrets.txt)).
- **No static path traversal/source exposure.** `GET /../server.ts`, `/.env`,
  `/package.json`, and `/src/App.tsx` return the SPA `index.html` (HTTP 200 HTML), not
  source; `dist/` contains no source maps.
- **URL/path validation for remote GGUF downloads.** HF repo/file/revision and
  ModelScope namespace/name/file are segment-validated and encoded; `..`/backslash/NUL
  are rejected. `/api/hf` checks the target origin and `/api/models` prefix; probes for
  `//evil.example`, `https://evil.example`, and `../../evil` return 400.
- **Filesystem allowlists.** `/api/export` rejects `/etc` (403) and traversal model
  names (400); `/api/cache/reveal` rejects `/etc/hosts` and non-`ollama-studio-*` temp
  paths (403) and uses `realpath`; the existing tests cover these.
- **No shell interpolation in most paths.** GGUF import/export/reveal use
  `execFile`/`spawn` with argv arrays; daemon commands are built from validated
  manager/label/uid/PID values and the shell path is constrained.
- **Cache quarantine.** Orphan blobs are moved to `.ollama-studio-trash` instead of
  being `rm`-ed, and manifest parsing handles `manifests-v2` symlinks, manifest blobs,
  manifest lists, and metadata digests (the R-042 fix). The remaining gaps are OSA-04
  and OSA-05.
- **Baseline:** 17 test files / 164 tests pass, `tsc --noEmit` passes, and a fresh
  esbuild build of `server.ts` is byte-identical to the `server.js` used for dynamic
  testing ([11](evidence/11-dependencies-baseline-secrets.txt)).

## Priority plan

**P0 — before any non-loopback exposure (and recommended even for loopback):**

1. **OSA-01**: stop compiling `VITE_PROXY_TOKEN` into the browser bundle. Use a
   server-issued HttpOnly/SameSite session cookie after a pairing/login step, a
   reverse proxy with real auth, or an OS-level boundary. Do not describe
   `PROXY_TOKEN` as authentication while it is readable from `/assets/*.js`.
2. **OSA-02/03**: add a `Host` allowlist and reject cross-site state-changing
   requests (`Origin`, `Sec-Fetch-Site`), require `Content-Type: application/json`
   for JSON endpoints, and require an explicit per-session CSRF token or custom
   header for destructive actions. Do not rely on the loopback source address.
3. **OSA-04/05**: make `scanComplete` false when no manifest root exists or no
   manifest parsed; require at least one manifest before orphan cleanup; gate
   `orphan` and `temp` on active downloads; skip recent blobs; add a cross-process
   lock/heartbeat; lock all three categories in the UI.
4. **OSA-06**: fail closed when `HOST` is non-loopback and `PROXY_TOKEN` is unset
   (or require an explicit `ALLOW_INSECURE_BIND=1`), and reject weak/short tokens.
5. **OSA-07**: strip `authorization`, `x-proxy-token`, `cookie`, `origin`,
   `referer`, and `x-forwarded-*` from the upstream proxy headers.

**P1 — hardening (this sprint):**

6. Security headers and CSP (OSA-08), body cap/streaming and upstream timeout
   (OSA-09), custom error handler and `NODE_ENV=production` (OSA-10), download
   admission control (OSA-11).
7. Fix the ModelScope token-mode regression (OSA-15) and add timeouts (OSA-16).

**P2 — cleanup and assurance:**

8. Stop proxying raw third-party HTML (OSA-12); remove design mocks from `public/`
   (OSA-13); tighten `/api/hf` (OSA-17); rate-limit and constant-time token compare
   (OSA-18); review subprocess environments (OSA-19); pin CI actions, add SCA/CodeQL,
   and notarize releases (OSA-20); harden export copy (OSA-21).
9. Add regression tests for CSRF/Host/token extraction/cache interlocks and an
   integration test that builds with a token and asserts it is absent from `dist/`.

See [appendix/remediation-checklist.md](appendix/remediation-checklist.md) for a
checklist with file references and verification commands.

## Document map

- [findings.md](findings.md) — detailed findings OSA-01 through OSA-15, with
  reproductions, impact, and remediation.
- [hardening.md](hardening.md) — lower-severity findings OSA-16 through OSA-24,
  plus positive controls and notes on things that were checked and found safe.
- [appendix/threat-model.md](appendix/threat-model.md) — assets, actors, trust
  boundaries, and attack paths.
- [appendix/remediation-checklist.md](appendix/remediation-checklist.md) — P0/P1/P2
  checklist and suggested code changes.
- [appendix/verification-commands.md](appendix/verification-commands.md) — safe,
  reproducible commands used for the dynamic checks.
- [evidence/](evidence/) — raw command output and sanitized excerpts. Personal paths
  and test tokens are replaced with `<REPO>`, `<HOME>`, `<TMPDIR>`, `<FIXTURE_MODELS>`,
  and `<TEST_TOKEN>`.

## Existing risk register mapping

This audit confirms and extends the project's own risk register:

- `R-019` (production proxy without auth) — confirmed; see OSA-02, OSA-03, OSA-14.
- `R-025` (`PROXY_TOKEN` embedded in the frontend) — confirmed and **escalated**: the
  bundle is served unauthenticated, so the token is not a secret against any client
  that can reach the server (OSA-01).
- `R-042` (cache cleanup deleted referenced weights) — related; OSA-04 and OSA-05
  are new, distinct data-loss gaps in the same subsystem.
- `R-043` (file-manager reveal executes system commands) — path allowlist and
  `realpath` checks held in this audit; no new bypass found.
- `R-050` (ad-hoc signed, non-notarized menu-bar app) — release hardening noted in
  OSA-20.
- `R-014`, `R-029`, `R-040`, `R-039`, `R-049` — related context for OSA-06, OSA-20,
  OSA-11, OSA-15/16, and the HF download path, respectively.

## Limitations

- Dynamic testing used the production `server.js` (confirmed byte-identical to a
  fresh build) bound to `127.0.0.1`, with a local echo upstream and fixture model/temp
  directories. **No real model was pulled, deleted, created, or unloaded; no real
  cache was cleaned; no daemon was stopped.** One `/api/daemon` GET was performed to
  confirm the detection output, and one `ALLOW_DAEMON_CONTROL=1` `start` request was
  short-circuited by the already-running Ollama.app (no command executed).
- DNS rebinding was simulated with an arbitrary `Host` header and
  `curl --resolve evil.example:<port>:127.0.0.1`. A real browser DNS-rebind depends on
  DNS TTL, browser private-network policies, and victim interaction; the server-side
  root cause (no Host validation) is proven, but end-to-end browser exploitation was
  not executed.
- No fuzzing, authenticated DAST, or review of `node_modules` source. Dependency risk
  is limited to `npm audit` against the public advisory database on 2026-10-29.
- Runtime branches for Windows/Linux (service detection, file-manager reveal,
  `explorer`/`xdg-open`) were not executed. The audit environment was macOS.
- The Ollama daemon itself, model files, and model output safety are out of scope.
