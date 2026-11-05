# Threat model — Ollama Studio

## 1. System context

```
User browser (localhost or LAN)
        │  HTTP, no TLS by default
        ▼
┌─────────────────────────────────────────────┐
│ Express server (server.ts / server.js)      │
│  • static dist/                             │
│  • /ollama/* reverse proxy ────────────────┼──► Ollama daemon (127.0.0.1:11434)
│  • /api/downloads, /api/cache, /api/export  │
│  • /api/modelscope, /api/hf, /api/catalog  │──► modelscope.cn, huggingface.co,
│  • /api/daemon, /api/metrics               │    ollama.com
└───────────────┬─────────────────────────────┘
                │ filesystem (user privileges)
                ▼
   ~/.ollama/models (blobs, manifests, manifests-v2)
   os.tmpdir()/ollama-studio-* (downloads/imports)
   ~/Downloads/Ollama Studio (exports)
   /Applications/Ollama.app (optional daemon control)
```

The browser is both the primary user interface and an **untrusted request source**:
any web page the user visits can issue cross-origin requests to loopback and can
attempt DNS rebinding. The Node process runs with the user's privileges and can read
and modify the user's Ollama model store.

## 2. Assets

| Asset                              | Why it matters                                                 | Where                                                   |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Ollama models/blobs                | Large, hard to recreate; deleting them breaks the user's setup | `~/.ollama/models`                                      |
| Model metadata/manifests           | Required to use blobs; corruption loses models                 | `manifests/`, `manifests-v2/`                           |
| `PROXY_TOKEN` / session            | Intended access control; also a shared secret                  | env, JS bundle, headers                                 |
| Chat history and attachments       | Potentially sensitive prompts/images                           | browser `localStorage`                                  |
| Local API control                  | Can pull/delete models, export weights, control the daemon     | `/api/*`, `/ollama/*`                                   |
| System information                 | Paths, PIDs, disk/memory/GPU, upstream URL                     | `/api/cache`, `/api/metrics`, `/api/daemon`, `/healthz` |
| Host machine / daemon availability | Stopping Ollama or filling disk is disruptive                  | `ALLOW_DAEMON_CONTROL`, downloads                       |
| Release artifacts                  | Ad-hoc signed DMG; users trust the publisher                   | `build/`, GitHub Releases                               |

## 3. Actors

| Actor                                                         | Capability                                                                                                                       | Trust                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Local user                                                    | Full UI, filesystem, can enable daemon control                                                                                   | Trusted                                 |
| Any website in the user's browser                             | Can send cross-origin requests to loopback; can attempt DNS rebinding; cannot read cross-origin responses without CORS/rebinding | **Untrusted**                           |
| LAN client                                                    | Can reach the server if bound non-loopback; can read/write all exposed APIs                                                      | **Untrusted** unless network is trusted |
| Local unprivileged process                                    | Can reach loopback, read user files it has access to, inspect env/processes                                                      | Semi-trusted (same user)                |
| Remote model registry (HF/ModelScope/ollama.com)              | Supplies metadata/files; can redirect and return unexpected content                                                              | External / semi-trusted                 |
| Supply chain (npm packages, GitHub Actions, CDN, Node binary) | Code execution at build/runtime                                                                                                  | External                                |
| Malicious model file / prompt                                 | Model content and output; out of scope for app security except path handling                                                     | External                                |

## 4. Trust boundaries and assumptions

1. **Browser ↔ localhost server.** The server assumes loopback is safe. This is false:
   browsers allow cross-origin writes to loopback (CSRF) and DNS rebinding can turn a
   remote origin into a same-origin client. This boundary needs Host/Origin checks
   and a real authentication/session mechanism.
2. **Server ↔ Ollama.** The proxy is a confused deputy: it accepts any client request
   and forwards it to Ollama. It also forwards client credentials upstream.
3. **Server ↔ filesystem.** The server has the user's file permissions. Path
   allowlists, `realpath`, and quarantine reduce risk, but a logic bug can delete
   models (OSA-04/05) or write outside an intended directory (OSA-21).
4. **Server ↔ public registries.** The server fetches remote content and follows
   redirects. URLs are mostly pinned, but response content is untrusted; raw HTML is
   currently proxied (OSA-12).
5. **Token as a boundary.** `PROXY_TOKEN` is assumed to be a secret. It is embedded
   in a public bundle (OSA-01), so this assumption is invalid. It is at best a
   speed bump for naive clients, not authentication.
6. **Local-only deployment.** The documented/default deployment is loopback. LAN
   exposure is opt-in (`HOST=0.0.0.0`, `dev:lan`) and is where most network findings
   become directly exploitable.

## 5. Attack paths

### A. Malicious website → CSRF → destructive local action

1. Victim visits `evil.example`.
2. Page sends `POST http://127.0.0.1:3000/api/cache/cleanup` with
   `Content-Type: text/plain` and a JSON body.
3. No Origin check, no content-type check, no token (default) → handler runs.
4. Temp/partial files are deleted, orphan blobs are quarantined; downloads/exports
   can also be started.

Mapped to OSA-02, OSA-05.

### B. Malicious website → DNS rebinding → full API access

1. Page is served from `evil.example:<port>` with a short DNS TTL.
2. DNS is rebound to `127.0.0.1`; browser reconnects to the same origin.
3. Server accepts `Host: evil.example:<port>` and returns API responses.
4. Page reads `/api/cache`/`/ollama/api/tags`, deletes models with
   `DELETE /ollama/api/delete`, starts downloads, and extracts the token from
   `/assets/*.js`.

Mapped to OSA-03, OSA-01.

### C. LAN attacker → token extraction → full API access

1. Attacker reaches `http://host:3000/` (no auth).
2. Reads the referenced JS bundle, extracts `VITE_PROXY_TOKEN`.
3. Calls `/api/cache`, `/ollama/api/*`, `/api/export`, `/api/daemon/control` with the
   token.

Mapped to OSA-01, OSA-06.

### D. User cleanup during a download → data loss

1. User starts a large ModelScope/HF download (or a native `ollama pull`).
2. The temp directory is older than 10 minutes, or a blob was just written.
3. User (or a CSRF page) runs cleanup with `temp`/`orphan`.
4. Active temp files are `rm`-ed; fresh blobs are quarantined; the download breaks
   or a pull has to restart.

Mapped to OSA-05.

### E. Misconfigured model path → all blobs orphaned

1. `OLLAMA_MODELS` points at a directory with `blobs/` but no/empty `manifests/`
   (backup, migration, layout change).
2. `GET /api/cache` reports `scanComplete: true` and all blobs as orphan.
3. Cleanup moves them to `.ollama-studio-trash`; `ollama list` loses models.

Mapped to OSA-04.

### F. Compromised upstream search page → script on local origin

1. User navigates to `/api/catalog/search?q=...` (or is tricked into it).
2. The server returns ollama.com HTML as `text/html`; inline scripts execute on the
   local origin.
3. Script can read `localStorage` (chat history) and the public bundle token, and call
   the API.

Mapped to OSA-12, OSA-08, OSA-01.

## 6. Out of scope

- Vulnerabilities in the Ollama daemon/CLI, model files, or model output.
- macOS, browser, or Node zero-days.
- An attacker with root/physical access or control of the user's browser profile.
- Malicious npm packages that pass `npm audit`/lockfile review (supply-chain
  provenance is noted but not fully audited).
- Model licensing/content safety.
- Network-level attacks on a reverse proxy/TLS terminator that is not part of this
  repository.

## 7. Security objectives

1. **Only the intended user can change local state** (models, cache, downloads,
   daemon) even if the user visits an untrusted website.
2. **The local service is not an open proxy** for arbitrary origins or methods.
3. **Cleanup cannot destroy installed models or active downloads** absent explicit,
   confirmed user intent.
4. **Secrets are not exposed to clients that have not authenticated.**
5. **Remote content cannot execute with the app origin's privileges.**
6. **Availability:** a local client or LAN peer cannot exhaust disk/memory/sockets
   with a trivial request.

The current design meets (5) partially (React escaping, DOMParser) and fails (1), (2),
(3), and (4) in the paths described above.
