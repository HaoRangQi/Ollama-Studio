# Ollama Studio

**English** | [简体中文](README.zh-CN.md)

A macOS-style model manager and chat interface for local Ollama models. Model browsing, runtime status, streaming chat, pulls, delete/clone, Modelfile creation, and GGUF import/export all talk to your local Ollama instance; conversations, model parameters, and download metadata stay in the browser.

> Current status and next steps: [`docs/context/NOW.md`](docs/context/NOW.md); known risks: [`docs/context/RISKS.md`](docs/context/RISKS.md).

## UI Preview

> Screenshots use demo data and do not represent the models or hardware of a real machine. Click an image to open the full-size version.

| Model Library | Chat & Reasoning |
| --- | --- |
| [![Model Library: installed models, runtime status, and sampling parameters](docs/assets/screenshots/en/models.png)](docs/assets/screenshots/en/models.png) | [![Chat & Reasoning: streaming replies, model switching, and context settings](docs/assets/screenshots/en/chat.png)](docs/assets/screenshots/en/chat.png) |
| **Discover & Pull** | **Telemetry & Settings** |
| [![Discover & Pull: ModelScope, Hugging Face, and Ollama registry search](docs/assets/screenshots/en/pull.png)](docs/assets/screenshots/en/pull.png) | [![Telemetry & Settings: disk, memory, CPU, GPU, cache cleanup, and service control](docs/assets/screenshots/en/telemetry.png)](docs/assets/screenshots/en/telemetry.png) |

## Project Overview

Ollama Studio brings the day-to-day work of running local models into one interface: browse and filter models, pull weights with quantization choices, chat with adjustable parameters, derive models with Modelfile, and inspect daemon and inference telemetry. The UI follows Material 3 Expressive with light/dark themes, five accent palettes, and Chinese/English localization.

This is a **runnable web application**. It listens on localhost by default; LAN access must be enabled explicitly and configured with a shared token.

## Platform Support

**macOS is the primary target** and the only platform with full runtime verification. Linux and Windows are best-effort: the table reflects code paths and CI results, not a complete runtime acceptance run.

Legend: ✅ verified/available · ⚠️ implemented but not fully runtime-verified, or partial · ❌ unavailable.

| Capability | macOS | Linux | Windows |
| --- | :---: | :---: | :---: |
| UI, chat, pulls, model management | ✅ | ⚠️ | ⚠️ |
| GGUF import / export | ✅ | ⚠️ | ⚠️ |
| Cache scan / cleanup | ✅ | ⚠️ | ⚠️ |
| Disk / memory / CPU metrics | ✅ | ⚠️ | ⚠️ |
| GPU metrics | ✅ `ioreg` | ❌ | ❌ |
| Daemon detection / copyable commands | ✅ | ⚠️ systemd | ❌ |
| Automatic daemon start / restart / stop | ✅ live-tested (Ollama.app) | ⚠️ detection only | ❌ |
| Environment startup command | ✅ | ✅ POSIX | ❌ POSIX only |
| Menu bar app / DMG | ✅ build + launch | ❌ | ❌ |

> Automatic daemon control is implemented for macOS (Ollama.app / launchd / Homebrew), off by default. Start, stop and restart were live-tested against a real Ollama.app daemon on 2026-10-29; the plain-process fallback (`ollama serve`) and standalone launchd forms have not. Linux systemd detection is read-only and never auto-executes (commands contain `sudo`). On Windows, `npm run clean` and the POSIX-style README examples also need adaptation. GitHub Actions currently runs on `ubuntu-latest` only; it covers build/tests, not a live Ollama session. The optional macOS menu bar wrapper is ad-hoc signed and not notarized; it has been built and launched from the repository, but not installed to `/Applications` or verified with a real model download.

## Current Status (verified 2026-10-29)

- Integrated `GET /api/version`, `GET /api/tags`, `GET /api/ps`, `POST /api/chat` (streaming NDJSON), `POST /api/pull` (NDJSON progress), `DELETE /api/delete`, `POST /api/copy`, `POST /api/create`, plus `ollama create` GGUF import and local blob export.
- Chat supports streaming output, stop generation, collapsible thinking content, temperature/topP/num_ctx, JSON mode, system persona, error display, and **multiple conversations per model** (create/switch/rename/delete).
- Fenced code blocks in replies render as dedicated code blocks with copy support.
- Model parameters are saved **per model as chat defaults** in `localStorage`; they never modify model weights. VRAM "load/release" uses `keep_alive` against the real API.
- Downloads run **server-side in the background**: pull tasks show real status, speed, ETA, and progress, and can be paused/resumed/cancelled. After a failure, the UI shows the exact command that will be rerun; "Retry" reruns it unchanged, while "Edit command" puts it back into the input for editing. Remote GGUF repository and file information persists across refreshes. Closing the page does not interrupt a download; reopening reconnects to the task and shows its progress.
- Model search supports **ModelScope (default)**, **Hugging Face**, and the **Ollama registry**; quantization labels are inferred from filenames and the full recognized list is returned without truncation (the UI collapses it). After a successful download, the model records its source, and the model card menu can jump back to the original Hugging Face / ModelScope page. For ModelScope and Hugging Face, the local server downloads the selected GGUF and then runs `ollama create`; progress and errors stream back as NDJSON. Hugging Face downloads no longer use Ollama's `hf.co` pull, so a proxy/DNS setup that maps the CDN to a non-public address no longer blocks the app.
- Telemetry includes **cache cleanup**: it scans the Ollama model directory and the application temp directory, groups unreferenced blobs, unfinished downloads (`*-partial` and chunk markers), and temp files, and processes only selected categories. Unreferenced blobs are moved to `.ollama-studio-trash` under the model directory instead of being deleted outright, so they can be moved back to `blobs/` to restore; unfinished downloads and app temp folders are deleted. Blobs referenced by manifests and Ollama metadata, files written within the last 10 minutes, and partial files with an active download are protected. If a manifest is unreadable or a `manifests-v2` symlink is dangling, unreferenced-blob cleanup is locked. The confirmation dialog expands each category into per-file details (name, size, mtime, full path) and can reveal a file or directory in the system file manager (handled by the local server, so it also works in the web build).
- Telemetry shows real connection status, version, model/VRAM statistics, and an event log. The sidebar "Loaded VRAM / running models" counters and the telemetry page poll `/api/ps` every 5 seconds, so external load/unload operations appear without a manual refresh. `GET /api/metrics` reads filesystem capacity/used/free for the model directory, memory, CPU load, and macOS `ioreg` GPU utilization; unavailable values are labeled explicitly, and ANE has no public utilization API. Running model cards offer a confirmed **Unload all** action (`keep_alive: 0`).
- The model page exports the currently installed quantization as GGUF: the server reads the manifest, copies the `model` layer, and writes the `projector` layer as `*-mmproj.gguf`. The default directory is `~/Downloads/Ollama Studio`; duplicate names get numeric suffixes. Only weights are exported; template/license/params are not part of GGUF. Large files prefer APFS copy-on-write clones.
- The telemetry **Service Control** panel detects whether Ollama is managed by Ollama.app, launchd, Homebrew, systemd, or a plain process, and generates copyable start/restart/stop commands. Start/restart/stop buttons live in that panel only (the panel is collapsed by default); the header keeps just the connection pill and a refresh button, so a stray click cannot interrupt the service. Automatic execution is off by default and only runs when `ALLOW_DAEMON_CONTROL=1` is set, the request comes from loopback, and the user confirms; the buttons stay clickable and explain the requirement when the switch is off. Starting and stopping are idempotent, and a restart while Ollama is stopped behaves as a start. Environment settings can generate an `ollama serve` startup command, but never write to the system environment; restart Ollama manually for changes to take effect.
- The proxy binds to `127.0.0.1` by default. Optional `PROXY_TOKEN` protects `/ollama/*`, `/api/import`, `/api/modelscope/*`, `/api/downloads`, `/api/cache`, `/api/export`, `/api/metrics`, and `/api/daemon`.
- Fonts and Material Symbols are self-hosted; no Google Fonts dependency.
- An optional **macOS menu bar app** wraps the same local server: it starts the bundled Node runtime on `127.0.0.1:3210`, opens the dashboard in the default browser, and offers Open Web / Open Log / Quit. `npm run build:menu` produces an `.app` and a DMG; it is ad-hoc signed, macOS-only, and has no login item, auto-update, or notarization.
- Engineering: TypeScript `strict`, ESLint, Prettier, Vitest (164 tests), and GitHub Actions CI.
- Headless Chrome smoke tests cover the development/production first screen, real model list, export, and telemetry pages. A full page-by-page visual/a11y review has **not** been performed.
- Hugging Face downloads are fetched by the local server and registered with `ollama create`; they require the `ollama` CLI, are limited to one GGUF file per task (20 GB max), and have no resume support. Sharded GGUF and multimodal projector files are not automatically combined.

For detailed status, blockers, and next steps, see [`docs/context/NOW.md`](docs/context/NOW.md).

## Features

| Area | Implemented | Not implemented / boundaries |
| --- | --- | --- |
| Model Library | Real model list, cards/list, categories, search, persisted parameter defaults, real delete/clone, VRAM load/release, export current quantization as GGUF (including multimodal projector), per-model "view channel page" jump back to the Hugging Face / ModelScope source recorded at download time | Only the installed quantization is exported; template/license/params are not in GGUF and need a separate Modelfile; export directory is fixed to `~/Downloads/Ollama Studio`; models pulled manually with the `ollama` CLI have no recorded origin and show the entry as disabled |
| Discover & Pull | CLI input, quantization selection, curated models, dedicated search view, ModelScope/HF/Ollama search, long-result list with pagination, adjustable page size (6/12/24), full quantization tag list (all recognized quants, collapsed by the UI), quantization selection and inline download, server-side background downloads (survive refresh), real progress, ModelScope/Hugging Face server downloads + `ollama create`, pause/resume/cancel, failure retry, GGUF upload | Quantization is inferred from filenames; GGUF import and remote downloads depend on the local `ollama` CLI; remote downloads have no resume support, a 20 GB per-file limit, and do not combine sharded GGUF/projector files; background tasks live in server memory and are lost on server restart |
| Chat & Reasoning | Real streaming `/api/chat`, stop, thinking collapse, parameters, JSON mode, persona, error display, multiple conversations, code-block copy, draggable input height, image/video attachments (video sampled to 3 frames) | Ollama only accepts `images`; PDFs and arbitrary files are unsupported; real multimodal inference has not been automatically verified |
| Modelfile Lab | Visual `FROM` / `PARAMETER` / `SYSTEM` generation, presets, real `/api/create`, test chat | Parameter edits do not propagate to existing models |
| Telemetry & Settings | Real connection/version/model/VRAM stats, event log, model storage card, disk/memory/CPU/GPU metrics, unload all running models, persisted configuration, cache scan/cleanup (unreferenced blobs / unfinished downloads / temp dirs, per-file details and file-manager reveal), service detection with copyable start/restart/stop commands and one-click header buttons | GPU metrics are macOS `ioreg` only; ANE has no public API; automatic service control is off by default and live-tested only against an Ollama.app daemon; environment changes only generate a command and do not write system environment |
| Global | ⌘K command palette, theme palette, Chinese/English switch, light/dark mode, mobile bottom navigation | Narrow-screen and a11y review still require manual validation |
| Desktop Wrapper | macOS menu bar app (Swift/AppKit) with bundled Node server and DMG build; the web UI remains the primary interface | macOS only; ad-hoc signed and not notarized; fixed port `3210`; no login item or auto-update |

## Tech Stack

- React 19 + TypeScript 6 + Vite 8 single-page application
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- Custom `ThemeContext` for theme, accent palette, and language; no router or global state library
- Development proxy: Vite `server.proxy` (`/ollama`, `/api/catalog`, `/api/hf`) plus custom middleware (`/api/import`, `/api/modelscope/*`, `/api/downloads`, `/api/cache`, `/api/export`, `/api/metrics`, `/api/daemon`)
- Production server: Express 4 + esbuild-bundled `server.js`
- Testing and quality: Vitest, ESLint 10 (flat config), Prettier, GitHub Actions
- Fonts/icons: `@fontsource-variable/*`, `material-symbols` (bundled locally)

Versions follow `package.json` / `package-lock.json`; see [`docs/context/MAP.md`](docs/context/MAP.md) for the full map.

## Install and Run

> A prebuilt macOS menu bar app is available from [GitHub Releases](https://github.com/HaoRangQi/Ollama-Studio/releases/latest). The web app still runs from source; clone the repository first.

### Requirements

- **Ollama** installed and running at `http://127.0.0.1:11434` (verified with 0.40.7). Download: <https://ollama.com/download>.
- **Node.js 24** recommended (the CI version); Vite 8 requires Node `^20.19.0 || >=22.12.0`. npm is included.
- **macOS** is the primary target. The web app is best-effort on Linux and Windows; the menu bar app is macOS-only.
- **Xcode Command Line Tools** are required only for the menu bar build (`swift`, `swiftc`, `iconutil`, `hdiutil`, `codesign`).
- The menu bar app bundles its own Node runtime, so its users do not need Node. They still need Ollama.
- No cloud API key is required; ModelScope/Hugging Face search and downloads use their public APIs through the local server.
- GGUF upload and remote ModelScope/Hugging Face downloads also require the `ollama` CLI on the machine running the server.

### Option A: Web App from Source

```bash
git clone https://github.com/HaoRangQi/Ollama-Studio.git
cd Ollama-Studio
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. The development server listens on localhost only.

If `npm ci` fails with `EPERM` because of the default npm cache permissions, use the repository cache:

```bash
npm ci --cache .npm-cache --no-audit --no-fund
```

### Option B: macOS Menu Bar App

On macOS, an optional Swift/AppKit menu bar wrapper hosts the same web UI without Electron or Tauri. Download the latest DMG from [Releases](https://github.com/HaoRangQi/Ollama-Studio/releases/latest), or build it from source. From the repository root:

```bash
npm ci
npm run build:menu
open "build/Ollama Studio Menu.app"
```

To install it, open the downloaded or locally built DMG and drag `Ollama Studio Menu` to `/Applications`:

```bash
open "build/Ollama Studio Menu-<version>.dmg"   # e.g. 0.2.0
```

The build produces `build/Ollama Studio Menu.app` and `build/Ollama Studio Menu-<version>.dmg` — the version comes from `package.json`, so the filename tracks it. The app starts the bundled Node server on `127.0.0.1:3210`, opens the dashboard in the default browser, and provides Open Web / Open Log / Quit in the menu bar. Quit a running instance before rebuilding.

The app is ad-hoc signed and not notarized. If macOS blocks a downloaded copy, right-click the app in Finder and choose **Open**. There is no login-item, auto-update, Developer ID signing, or notarization yet. The build has been launched from the repository; installation to `/Applications` and a real model download through the app are still unverified. The regular web build and production server are unaffected.

### Configure the Ollama Endpoint

Copy `.env.example` to `.env` and adjust as needed (both development and production read it; process environment wins):

```bash
OLLAMA_HOST=http://127.0.0.1:11434
PORT=3000
HOST=127.0.0.1
```

The frontend uses the same-origin `/ollama` proxy by default; the browser does not need direct access to Ollama. Set `VITE_OLLAMA_BASE_URL` only when the browser can reach Ollama directly.

### LAN Access and Shared Token

Localhost access is the default. To allow access from the same trusted network:

```bash
# Production: set a shared token before binding to a non-loopback address
PROXY_TOKEN=change-me HOST=0.0.0.0 npm start

# The frontend build must use the same token
VITE_PROXY_TOKEN=change-me npm run build
```

`PROXY_TOKEN` protects `/ollama/*` and the local management APIs (`/api/import`, `/api/modelscope`, `/api/downloads`, `/api/cache`, `/api/export`, `/api/metrics`, `/api/daemon`); without it, the proxy is unauthenticated. `VITE_PROXY_TOKEN` is embedded in the frontend bundle: it is a shared secret, not user-level authentication. Add a reverse proxy and TLS when crossing network boundaries. For development, `npm run dev:lan` explicitly binds to `0.0.0.0`; use it only on trusted networks.

### Production

```bash
npm run build
npm start
```

`npm run build` builds both `dist/` and `server.js`; `npm start` listens on `127.0.0.1:3000` by default, serves the frontend statically, and streams `/ollama/*` to `OLLAMA_HOST`.

### Export GGUF

"Export GGUF" in the model page action area writes the installed quantization to `~/Downloads/Ollama Studio`, appending `-2`, `-3` on name collisions. Multimodal `projector` layers are written separately as `*-mmproj.gguf`; template/license/params are not part of GGUF and need a separate Modelfile. The local server reads `OLLAMA_MODELS` (default `~/.ollama/models`) and prefers APFS copy-on-write clones; cross-filesystem copies are full copies, so reserve enough space.

## Development

The web app can be developed independently of the macOS wrapper: `npm run dev` needs Node and Ollama, not Xcode or the menu bar app.

### Setup

```bash
git clone https://github.com/HaoRangQi/Ollama-Studio.git
cd Ollama-Studio
npm ci
cp .env.example .env   # optional; process environment wins
```

### Daily Checks

```bash
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

`npm test` uses Vitest with mocks and isolated fixtures; routine development does not load a real model. Run the full set before opening a pull request. GitHub Actions runs the same commands on `ubuntu-latest` with Node 24 in this order: `npm ci` → `typecheck` → `lint` → `format:check` → `test` → `build`. The macOS menu bar app is not built in CI; verify it locally with `npm run build:menu`.

### Project Layout

| Path | Responsibility |
| --- | --- |
| `src/screens/` | Page-level UI: models, chat, pull, Modelfile lab, telemetry |
| `src/components/`, `src/api/`, `src/context/`, `src/hooks/` | Shared UI, Ollama/proxy clients, theme/i18n, polling |
| `server.ts`, `server/` | Express server, `/ollama` proxy, downloads, cache, export, metrics, daemon |
| `macos/menu-bar/` | Swift/AppKit menu bar app and `build:menu` script |
| `docs/context/` | Current state, map, runbook, decisions, risks |
| `AGENTS.md`, `PROJECT_INDEX.md` | Collaboration rules and task-to-file routing |

### Architecture in One Minute

The browser talks to the same-origin `/ollama` proxy; the server forwards to `OLLAMA_HOST`. Long-running work (pulls, ModelScope/Hugging Face GGUF downloads, cache scans, GGUF export) runs server-side. The optional menu bar app embeds the built `dist/` and a Node runtime and serves the same UI on `127.0.0.1:3210`.

### Read Next

- `AGENTS.md` — repository rules, read/write boundaries, and verification requirements.
- `PROJECT_INDEX.md` — where to change a feature.
- `docs/context/NOW.md` — current goals, blockers, and next steps.
- `docs/context/RUNBOOK.md` — commands, prerequisites, and execution status.

### Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite development server on `127.0.0.1:3000` |
| `npm run dev:lan` | Explicitly bind `0.0.0.0:3000` (trusted networks only) |
| `npm run build` | Build `dist/` + `server.js` |
| `npm run build:web` / `build:server` | Build only the frontend / only the server bundle |
| `npm run build:menu` | Build the macOS menu bar `.app` and DMG (macOS only) |
| `npm start` | Run the production server |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint check / auto-fix |
| `npm run format` / `format:check` | Prettier format / check |
| `npm test` / `test:watch` / `coverage` | Vitest tests / watch / coverage |
| `npm run clean` | Remove `dist/`, `server.js`, and `coverage/` |

## Verification Status

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (133 tests), and `npm run build`: all passed on 2026-10-29.
- GitHub Actions CI: the first remote run ([40739185722](https://github.com/HaoRangQi/Ollama-Studio/actions/runs/40739185722)) passed typecheck, lint, format check, tests, and build on `ubuntu-latest` with Node 24.
- Server-side downloads and cache cleanup: two refreshes during a ModelScope download preserved progress (63.1% → 80.1%); cache cleanup moved unreferenced blobs to quarantine on fixtures while preserving referenced blobs; the detail dialog listed files by size and could reveal them in the file manager; a read-only scan of the real `~/.ollama/models` found 6 referenced blobs (about 21.8 GB) and no orphan cleanup was performed.
- Hugging Face direct download: the server fetched a real 1,185,376-byte GGUF through the `huggingface.co` 302 redirect to the CDN, streamed it to a temp file, and invoked a stub `ollama create`; `resolving → downloading → creating → success` matched `completed/total`, and temp directories were removed. CDP verified that both the search-result download button and a pasted `hf.co/<repo>:<quant>` command send `kind:"huggingface"` to `/api/downloads` with no `/api/pull` call. No large model was downloaded and no model was registered with the real Ollama instance.
- Menu bar app: `npm run build:menu` produced `Ollama Studio Menu.app` and a DMG; the rebuilt app launched, its bundled server listened on `127.0.0.1:3210`, and invalid Hugging Face repo/file requests returned the expected 400 responses. The bundle includes `server/package.json` (`{"type":"module"}`) so it does not depend on the repository's package.json. The 2026-10-29 rebuild also served the restored four-part Chat mark with a one-line label and a 223×44 px button. It was not installed to `/Applications`, and no real model download was run through the app.
- Chat navigation visual: the sidebar Chat mark uses the original four-part `chat` + `_` + `spa` + `rk` composition, explicitly assembled from valid glyphs instead of the invalid `chat_spark` name, with the shared flat accent pill and glow. Headless Chrome at 1600×1000 verified the active and inactive states, the one-line label, and a 223×44 px button. README screenshots still show the interim `forum` icon and were not regenerated.
- Sidebar status polling: CDP mocked `/ollama/api/ps` changing from 0 running models to 1 (`size_vram=926000000`) and back to 0; the sidebar showed `— / 0 active` → `926 MB / 1 active` → `— / 0 active` within 6.5 seconds, without a manual refresh.
- Failure retry: CDP mock `/api/downloads` injected pull and ModelScope failures; clicking "Retry" sent a POST body identical to the original task (ModelScope `file` was restored from the persisted source) and polling moved to completed; the failure card showed "Will rerun: `ollama pull <model>`"; "Edit command" filled and focused the input; legacy ModelScope tasks missing `kind/source` were inferred from the `.gguf` filename and did not incorrectly use `ollama pull`; `pull model manifest: file does not exist` added HF/ModelScope guidance.
- Pull channel switch: typed "MiniCPM5-2B" in the ModelScope query and switched to Hugging Face; the input value was preserved, the placeholder changed to Hugging Face, previous results were cleared, and the active pill moved to Hugging Face.
- Production server (3101) and development server (3001): `/healthz`, `/ollama/api/version`, `/ollama/api/tags`, `/api/import` validation, and headless Chrome first-screen rendering all passed.
- Proxy token: unauthenticated requests returned 401, Bearer token returned 200, and `/api/import` without a token returned 401; all verified.
- Image/video attachments: CDP selected a PNG + WebM, sampled 3 video frames; the mock `/api/chat` received 4 `images` entries and the default description; real visual inference was not run.
- GGUF export: a fixture exported both model and projector through `POST /api/export`, with correct contents and collision suffixes; out-of-bounds directory returned 403 and an invalid model name returned 400; a real 0.8B model exported 529,297,312 bytes with a `GGUF` header and a SHA256 matching the manifest's `sha256:fb89581…`, taking about 1.2 seconds (APFS clone). CDP mocked the model page request `{model:"diodel/qwen3.5-0.8b-q4_k_m-gguf:latest"}` and verified the success toast mentioning mmproj.
- System metrics and service detection: `GET /api/metrics` returned real disk capacity, memory, CPU load, and macOS `ioreg` GPU utilization (Apple M1 Pro on this machine); `GET /api/daemon` detected Ollama.app and its PID; `POST /api/daemon/control` returned 403 without `ALLOW_DAEMON_CONTROL=1`; CDP confirmed the telemetry page showed GPU, disk usage, startup command, Unload all, and the Service Control panel.
- **Not executed**: real model load/unload and "Unload all" in the UI, real multimodal inference, a complete page-by-page visual/narrow-screen/a11y review, real large-model HF download and real `ollama create` through the new server-side path, real 20 GB-class model export, automatic daemon restart/stop (including macOS Automation permission prompts), and systemd/Windows branches.

## Documentation

| Document | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Collaboration rules, read/write constraints, verification requirements |
| [`PROJECT_INDEX.md`](PROJECT_INDEX.md) | Task-to-file/section routing |
| [`docs/context/NOW.md`](docs/context/NOW.md) | Current goals, progress, blockers, next steps |
| [`docs/context/MAP.md`](docs/context/MAP.md) | Directory, version, configuration, and deployment map |
| [`docs/context/RUNBOOK.md`](docs/context/RUNBOOK.md) | Procedures, prerequisites, execution status |
| [`docs/context/DECISIONS.md`](docs/context/DECISIONS.md) | Confirmed decisions and open questions |
| [`docs/context/RISKS.md`](docs/context/RISKS.md) | Risks, verification gaps, mitigations |
| [`docs/context/history/README.md`](docs/context/history/README.md) | Historical archive index |

## Sources and Design References

- Original AI Studio app: https://ai.studio/apps/9ab4837f-c57f-4777-a911-4ac097c9b6ee
- The original `README.md` was an AI Studio export template; it was rewritten as project documentation on 2026-10-27, keeping the original app link and local run steps.
- `public/assets/aistudio/` stores design references (screenshots, HTML, Material 3 color tokens); the application code does not reference them.

## License

Apache License 2.0, see [`LICENSE`](LICENSE).
