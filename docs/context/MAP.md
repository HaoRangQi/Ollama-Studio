# MAP

> 目录、版本、配置与部署关系。定位修改对象时读；版本以 `package.json` / `package-lock.json` 为准。
>
> 最后核验：2026-10-29；范围：仓库根目录、`src/`、`server/`、`server.ts`、`macos/menu-bar/`、构建/类型/测试/CI 配置、脚本、已安装依赖、真实拉取/删除/克隆/创建、ModelScope / Hugging Face 搜索与下载、后台下载任务、缓存扫描/清理（fixture）、GGUF 导出（fixture + 真实 0.8B）、系统指标与 daemon 只读检测、令牌鉴权、持久化、Chat 导航视觉与 headless DOM 冒烟。已执行安装、`typecheck`、`lint`、`format:check`、`test`、`build`、菜单栏 App 构建/启动、代理与鉴权验证；未执行 daemon 自动重启/停止。

## 目录结构

```text
ollama-studio/
├── index.html
├── package.json
├── package-lock.json
├── metadata.json
├── LICENSE                    # Apache-2.0
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc.json / .prettierignore
├── tsconfig.json
├── server.ts                  # 生产：静态托管 dist + /ollama 流式代理 + /api/import + /api/modelscope + /api/downloads + /api/cache + /api/export + /api/metrics + /api/daemon + 可选令牌
├── server/http.ts             # 共用 JSON body 读取（64 KB 上限）
├── server/importGguf.ts       # 开发/生产共用的 GGUF 上传、CLI 预检与 ollama create
├── server/modelscope.ts       # ModelScope 搜索、GGUF 下载与 ollama create
├── server/huggingface.ts      # Hugging Face 文件解析、服务端直下 GGUF 与 ollama create
├── server/downloads.ts        # 服务端后台下载任务（pull / modelscope / huggingface），内存 Map + 5 分钟 TTL
├── server/cache.ts            # Ollama 模型目录与临时目录扫描、明细、清理与文件管理器定位
├── server/exportGguf.ts       # manifest → GGUF 导出（model/projector、目录校验、重名、APFS clone）
├── server/metrics.ts          # 磁盘/内存/CPU 指标，macOS ioreg GPU 解析，ANE 不可用说明
├── server/daemon.ts           # Ollama.app/launchd/Homebrew/systemd/进程检测与可选控制命令
├── .github/workflows/ci.yml   # typecheck/lint/format/test/build
├── .env.example
├── .gitignore
├── README.md                    # 英文主版本
├── README.zh-CN.md              # 中文版
├── AGENTS.md
├── PROJECT_INDEX.md
├── macos/menu-bar/              # 可选 macOS 菜单栏封装（Swift + 内置 Node）
│   ├── main.swift               # NSStatusItem、内置服务、打开 Web/日志、退出
│   ├── build.sh                 # npm run build:menu：前端 + server.js + Node runtime + 图标 + ad-hoc 签名 + DMG
│   ├── Info.plist
│   ├── make-icon.swift
│   ├── make-app-icon.swift
│   └── assets/                  # menu-iconTemplate*.png
├── build/                       # 菜单栏 .app / DMG 产物（gitignore）
├── docs/context/
│   ├── NOW.md
│   ├── MAP.md
│   ├── RUNBOOK.md
│   ├── DECISIONS.md
│   ├── RISKS.md
│   └── history/README.md
├── docs/assets/screenshots/    # README 界面截图（en/ 英文、zh/ 中文，演示数据）
├── public/assets/aistudio/     # 设计参考：PNG / HTML / Material 3 token markdown
├── dist/                       # 构建产物（gitignore）
├── server.js                   # esbuild 产物（gitignore）
└── src/
    ├── main.tsx                # 字体/图标导入 + createRoot
    ├── App.tsx
    ├── index.css
    ├── types.ts
    ├── api/
    │   ├── ollama.ts           # 版本/模型/运行/聊天/拉取/删除/克隆/创建/加载释放/GGUF
    │   ├── ollamaMapper.ts     # OllamaTag + OllamaRunning -> OllamaModel
    │   ├── catalog.ts          # ModelScope / Hugging Face / ollama.com 模型库搜索
    │   ├── downloads.ts        # 后台下载任务查询、创建、取消
    │   ├── cache.ts            # 缓存扫描与清理请求
    │   ├── export.ts           # GGUF 导出请求
    │   ├── metrics.ts          # 系统指标请求
    │   ├── daemon.ts           # 守护进程检测与服务控制请求
    │   └── *.test.ts
    ├── lib/
    │   ├── storage.ts          # 安全的 localStorage JSON 读写
    │   ├── chatSessions.ts     # v2 多会话存储与 v1 迁移
    │   ├── modelSettings.ts    # 每模型采样参数与 keep_alive
    │   ├── downloadTask.ts     # 下载任务元数据与中断标记
    │   ├── daemonConfig.ts     # 环境变量 → ollama serve 启动命令
    │   ├── markdown.ts         # fenced code block 解析
    │   ├── attachments.ts      # 图片压缩、视频抽帧、base64 转换
    │   └── *.test.ts
    ├── hooks/useOllama.ts      # connecting | online | offline；5 秒静默轮询与并发去重
    ├── hooks/useDismissable.ts # 点击外部 / Esc 关闭浮层
    ├── components/
    │   ├── Sidebar.tsx         # 桌面侧栏（lg+）
    │   ├── MobileNav.tsx       # 移动端底部导航（<lg）
    │   ├── Header.tsx
    │   ├── ConnectionBanner.tsx
    │   ├── CommandPalette.tsx
    │   ├── CatalogResultRow.tsx # 搜索结果长条卡片
    │   ├── PullModal.tsx
    │   ├── QuantizationPickerModal.tsx
    │   └── ThemePaletteModal.tsx
    ├── context/ThemeContext.tsx
    ├── data/mockData.ts        # 离线回退与精选列表
    ├── i18n/translations.ts
    └── screens/
        ├── ModelsScreen.tsx
        ├── PullScreen.tsx
        ├── ChatScreen.tsx
        ├── ModelfileLabScreen.tsx
        └── TelemetryScreen.tsx
```

根目录的隐藏工具目录（如 `.ccgui/`、`.workflow/`、`.dsh-progress/`）不属于应用源码，不参与构建，不默认读取。

## 入口与渲染链

```text
index.html（#root、标题）
└─ src/main.tsx（本地字体/图标 + createRoot）
   └─ src/App.tsx（ThemeProvider → MainApp）
      ├─ useOllama()（真实连接状态与模型）
      ├─ Sidebar（lg+）+ MobileNav（<lg）+ Header + ConnectionBanner
      ├─ 按 currentScreen 渲染：
      │   models | pull | chat | telemetry-settings | modelfile-lab
      └─ 全局弹窗：CommandPalette / PullModal / QuantizationPickerModal / ThemePaletteModal
```

- `currentScreen` 的类型 `NavScreen` 定义在 `src/types.ts`，`telemetry-settings` 对应 `TelemetryScreen.tsx`。
- 没有路由库；刷新后回到默认的 `models` 页面。
- ⌘K/⌘Ctrl+K 由 `CommandPalette` 的全局键盘监听打开或关闭。

## 状态与数据流

### 真实 Ollama 数据

```text
useOllama
└─ getConnection()（Promise.all）
   ├─ GET /api/version
   ├─ GET /api/tags
   └─ GET /api/ps
      ↓ 相对路径 /ollama/api/*
Vite dev proxy（vite.config.ts）或 Express server.ts
      ↓ 去掉 /ollama 前缀（可选 Bearer/X-Proxy-Token 校验）
OLLAMA_HOST（默认 http://127.0.0.1:11434）
```

- `src/api/ollama.ts`：`OLLAMA_BASE` 默认 `/ollama`；`getVersion`、`getTags`、`getRunning`、`getConnection`；`streamChat` 解析 NDJSON；`loadModel`/`unloadModel` 发送 `keep_alive: -1/0`（embedding 模型走 `/api/embed`）。
- `src/api/export.ts`：`POST /api/export`，返回 `{model, directory, files, totalBytes}`；`src/api/metrics.ts` 轮询 `/api/metrics`；`src/api/daemon.ts` 读取 `/api/daemon` 并可选调用 `/api/daemon/control`。
- `src/api/ollamaMapper.ts`：把 `OllamaTag` / `OllamaRunning` 映射为 `OllamaModel`，使用 `details.context_length`、`parameter_size`、`quantization_level`、`capabilities`；按 capabilities/名称推断分类。
- `src/hooks/useOllama.ts`：状态 `connecting | online | offline`，暴露 `version`、`models`、`runningCount`、`error`、`refresh`。
- `src/App.tsx`：在线且 0 模型时把 `selectedModel`/`chatModel` 置空；在线有模型时替换为真实列表；离线保留 `INITIAL_MODELS` 演示回退。
- `src/components/ConnectionBanner.tsx`：离线/连接中提示“演示数据”；在线但 0 模型时提示“前往拉取”。

### 聊天、会话与参数

```text
ChatScreen
├─ loadChatStore()  ← localStorage: ollama_chat_sessions_v2
│  └─ 首次读取若只有 v1（ollama_chat_sessions_v1）→ 迁移为每模型一个会话
├─ loadModelSettings(tag) ← localStorage: ollama_model_settings_v1
└─ streamChat(POST /api/chat)
   ├─ keep_alive ← settings.keepAlive
   └─ options: temperature/top_p/num_ctx/repeat_penalty
```

- 会话操作：`createSession`、`setActiveSession`、`upsertSession`、`updateSessionMessages`、`removeSession`、`renameSession`；标题取首条用户消息（最多 40 字符）。
- 附件：`src/lib/attachments.ts` 把图片压缩为 JPEG，把视频抽取最多 3 帧；`ChatMessage.attachments` 持久化缩略图/帧的 data URL；发送时转换为 `/api/chat` 的 `images`（去掉 `data:...;base64,` 前缀）。PDF/任意文件被拒绝。
- 流式更新按 token 写入会话；保存经过 300 ms 防抖。切换模型会中止当前流；localStorage 写满时提示附件可能不保留。
- 参数在 Models 页或 Chat 参数面板修改后立即写入 `ollama_model_settings_v1`；只作为对话默认值，不修改模型文件。
- 回复按 fenced code block 拆分为文本/代码段；代码块带复制按钮。

### 拉取与下载任务

```text
App.startPullDownload / startModelScopeDownload / startHuggingFaceDownload
├─ POST /api/downloads { kind: 'pull' | 'modelscope' | 'huggingface', ... } → server/downloads.ts
├─ 服务端消费 Ollama NDJSON、执行 ModelScope 下载，或用 server/huggingface.ts 直下 GGUF 后 ollama create
├─ 前端每 900ms GET /api/downloads/<id> → 进度/速度/错误
├─ saveDownloadTask() → localStorage: ollama_download_task_v1（元数据 + 远程 source）
└─ 刷新/重新打开 → GET /api/downloads → 接回运行中的任务（首次自动切到拉取页）
```

- 暂停/取消：`DELETE /api/downloads/<id>`；继续按 `kind` 分流，ModelScope / Hugging Face 用服务端快照的 `target` 重新创建任务。
- 失败重试：任务卡显示“将重跑”的命令并提供“重试”，按原参数重新创建任务；pull 任务可“编辑命令”，把命令填回顶部输入框。ModelScope 优先用持久化的 `DownloadTask.source`（`namespace/name/file/quant/modelName`），Hugging Face 用 `repo/file/quant/modelName`；刷新后也可用；旧任务没有 `kind/source` 时按 `.gguf` 文件名推断 ModelScope，否则回退 `targetPath`。`pull model manifest: file does not exist` 且模型名含 `/` 时，客户端追加 `hf.co/` 或 ModelScope 提示。
- 缓存清理：`TelemetryScreen` → `GET /api/cache`（只读扫描）→ `POST /api/cache/cleanup`（重新扫描后处理勾选类别；orphan 移入 `.ollama-studio-trash`，partial/temp 直接删除）；manifest 解析失败、v2 symlink 悬空锁 orphan，下载进行中锁 partial（D-133、D-137）。
- GGUF 上传：`importGguf` → `/api/import`（同源）→ `server/importGguf.ts`；先校验 `.gguf` 与空文件，再预检 `ollama --version`，最后 `ollama create`。
- GGUF 导出：`ModelsScreen` 的导出按钮/菜单 → `src/api/export.ts` → `POST /api/export` → `server/exportGguf.ts`；解析 `manifests/` 或 `manifests-v2/`（默认 registry 同时尝试 `registry.ollama.ai` 与 `ollama.com`），复制 `model` 层，`projector` 层写成 `*-mmproj.gguf`，默认目录 `~/Downloads/Ollama Studio`，重名追加序号（D-136）。
- 系统指标：`TelemetryScreen` 挂载时与每 5 秒（页面可见时）读取 `/api/metrics`；磁盘用 `statfs`，内存/CPU 用 `os`，GPU 用 macOS `ioreg`，ANE 固定不可用（D-138）。
- 服务控制：`TelemetryScreen` 读取 `/api/daemon` 显示管理方式与可复制命令；`POST /api/daemon/control` 仅在 `ALLOW_DAEMON_CONTROL=1`、loopback、`confirm:true` 时执行（D-137）。环境变量面板用 `buildServeCommand` 生成 `ollama serve` 命令，不写系统环境。

### 模型库搜索（只读）

- ModelScope（默认）：`/api/modelscope/search?q=...` → 服务端追加 `gguf`、并发拉取文件列表并推导量化；下载由 `server/downloads.ts` 调 `pullFromModelScope`。
- Hugging Face：搜索走 `/api/hf/api/models?search=...&filter=gguf&sort=downloads&expand[]=siblings` → JSON；`src/api/catalog.ts` 提取 id/downloads/likes/tags、`files` 与量化（排除分片和 mmproj）。下载由 `server/downloads.ts` 调 `server/huggingface.ts`：服务端请求 `https://huggingface.co/<repo>/resolve/<revision>/<file>` 并跟随 302 到 CDN，下载后执行 `ollama create`；直接输入 `hf.co/<repo>:<quant>` 且缺少文件路径时，读取 HF API 文件列表按量化解析（D-141）。
- Ollama 官方：`/api/catalog/search?q=...` → 转发 `https://ollama.com/search` HTML；`DOMParser` 提取 `a[href^="/library/"]`、`h2`、`p`。
- 搜索代理都是只读；失败时 UI 显示官网兜底链接。

### App 级状态

- `models`、`selectedModel`（可空）、`chatModel`（可空）、`downloadTask`、`selectedQuant`、各弹窗开关。
- 在线时 `models` 来自真实 API；离线时为 `src/data/mockData.ts` 的 `INITIAL_MODELS`。
- `runningModelCount` 在线时取 `ollama.runningCount`；`loadedVramGb` 由 `/api/ps` 的 `size_vram` 映射值求和。

### 主题/语言

- `src/context/ThemeContext.tsx`：`themeMode`、`accentPalette`、`language`；持久化到 `localStorage` 的 `ollama_theme_mode`、`ollama_accent_palette`、`ollama_language`，并写入根元素 CSS 变量。

### 页面内状态

- `ModelsScreen`：分类、搜索、布局、参数（持久化默认值）、加载/释放显存、删除/克隆；空模型时显示拉取入口。
- `PullScreen`：CLI 输入、精选列表、分类、ModelScope/HF/Ollama 搜索、下载任务卡、GGUF 拖拽/选择。
- `ChatScreen`：多会话、消息流、生成中标记、参数面板、JSON/人设、思考折叠、代码块复制、图片/视频附件（视频抽帧、缩略图、移除、拖放）。
- `ModelfileLabScreen`：基础模型、参数、System Prompt、真实 `/api/create` 构建；无模型时显示空状态。
- `TelemetryScreen`：实时连接状态、模型/显存统计、事件日志、磁盘/内存/CPU/GPU 指标、全部卸载运行模型、daemon 界面配置持久化、缓存扫描与清理确认弹窗（逐文件明细、文件管理器定位）、服务检测与可复制重启/停止命令；ANE 无公开指标。

### 数据来源汇总

- 真实：`/api/version`、`/api/tags`、`/api/ps`、`/api/chat`、`/api/pull`、`/api/delete`、`/api/copy`、`/api/create`、`/api/generate`（加载/释放）、`/api/embed`（embedding 加载）、`/api/import`（本机 CLI）、`/api/modelscope/*`、`/api/downloads`、`/api/cache`、`/api/export`、`/api/metrics`、`/api/daemon`。
- 演示：`src/data/mockData.ts` 的 `INITIAL_MODELS`（离线回退）、`INITIAL_CURATED_MODELS`、`INITIAL_DAEMON_CONFIG`；`INITIAL_DOWNLOAD_TASK` / `INITIAL_CHAT_MESSAGES` 已不再作为初始状态。
- 无数据库、无全局状态库；主题/语言、会话、参数、下载任务、daemon 界面配置、搜索每页条数写 `localStorage`。

### 已知占位/模拟点

- 离线回退模型与精选模型列表是演示数据，顶部提示条会标注；在线后替换为真实数据。
- 导出 GGUF 已通过本地 manifest/blob 实现，不依赖 Ollama API；深度清理已由 `/api/cache` 接通；附件上传不支持 PDF/任意文件。
- `TelemetryScreen` 的 daemon 环境变量输入只保存界面值并生成启动命令，不修改系统环境；服务停止/重启默认只生成可复制命令，自动执行需 `ALLOW_DAEMON_CONTROL=1` 且未实测。
- 模型参数只作为对话默认值，不写入模型；`RISKS.md` R-003 / D-125。
- `models` 页的“分类覆盖”按真实分类计数；“显存”使用 `/api/ps` 的 `size_vram`。

## 样式与主题

- Tailwind CSS v4，通过 `@tailwindcss/vite` 接入；入口 `src/index.css`。
- `@theme` 把 Tailwind 颜色 token 映射到 `--app-*` / `--primary-*` CSS 变量。
- `:root` 是深色默认值，`:root.light` 覆盖浅色值；`ThemeContext` 还会写入强调色变量并切换 `.dark` / `.light` class。
- 强调色预设：`lavender`、`emerald`、`amber`、`sakura`、`cyan`，定义在 `ThemeContext.tsx` 的 `PALETTES`；`custom` 由 `buildCustomPalette` 从用户选的十六进制色派生 container/tint/glow，持久化在 `ollama_custom_accent`。
- 字体与图标通过 npm 本地打包：`@fontsource-variable/geist`、`plus-jakarta-sans`、`jetbrains-mono`、`material-symbols`；不再使用 Google Fonts。
- 布局：`lg` 以上显示固定侧栏；以下显示 `MobileNav` 底部导航；Chat 输入框相应调整 `left`/`bottom`。
- 可访问性：全局 `:focus-visible` 轮廓、`prefers-reduced-motion`、主要图标按钮 `aria-label`；尚未做完整 a11y 审计。

## 配置关系

### `package.json`

- 包名 `ollama-studio`，版本 `0.1.0`，`private: true`，`license: Apache-2.0`，`type: module`。
- 脚本：
  - `dev`：`vite --port=3000 --host=127.0.0.1`
  - `dev:lan`：`vite --port=3000 --host=0.0.0.0`
  - `build`：`npm run build:web && npm run build:server`
  - `build:web`：`vite build`
  - `build:server`：`esbuild server.ts --bundle --platform=node --format=esm --outfile=server.js --packages=external`
  - `build:menu`：`bash macos/menu-bar/build.sh`，生成 `.app` 与 DMG（仅 macOS）
  - `start`：`node server.js`
  - `preview`：`vite preview --host=127.0.0.1`
  - `typecheck`：`tsc --noEmit`
  - `lint` / `lint:fix`：`eslint .` / `eslint . --fix`
  - `format` / `format:check`：Prettier
  - `test` / `test:watch` / `coverage`：Vitest
  - `clean`：`rm -rf dist server.js coverage`

### `vite.config.ts`

- 插件：`@vitejs/plugin-react`、`@tailwindcss/vite`、GGUF 导入中间件。
- 别名：`@` → 项目根目录（`import.meta.dirname`）。
- `server.host`：默认 `127.0.0.1`；`dev:lan` 的 CLI 参数可覆盖。
- `server.proxy`：`/ollama` → `OLLAMA_HOST`；`/api/catalog` → `https://ollama.com`；`/api/hf` → `https://huggingface.co`，均去掉前缀。
- `PROXY_TOKEN` 设置时，`/ollama`、`/api/import`、`/api/modelscope`、`/api/downloads`、`/api/cache`、`/api/export`、`/api/metrics`、`/api/daemon` 中间件校验 Bearer/X-Proxy-Token；前端通过 `VITE_PROXY_TOKEN` 发送。
- `configureServer`：`/api/import` 上传中间件，以及缓存/下载/导出/指标/daemon 路由，与生产 `server.ts` 共用 `server/*` handler。
- `server.hmr`：`DISABLE_HMR !== 'true'` 时启用。

### `tsconfig.json`

- `target` / `lib`：ES2022 + DOM。
- `module`：ESNext；`moduleResolution`：bundler。
- `jsx`：`react-jsx`；`noEmit: true`；`strict: true`；`noFallthroughCasesInSwitch`、`forceConsistentCasingInFileNames`。
- `types`：`vite/client` + `node`；`esModuleInterop: true`。
- 路径别名：`@/*` → `./*`。
- `exclude`：`dist`、`server.js`、`node_modules`。

### `server.ts`

- Express 4 应用；`/healthz` 返回 `{ ok, ollamaHost, authRequired }`。
- 可选令牌中间件：`PROXY_TOKEN` 非空时保护 `/ollama/*`、`/api/import`、`/api/modelscope`、`/api/downloads`、`/api/cache`、`/api/export`、`/api/metrics`、`/api/daemon`；支持 `Authorization: Bearer` 或 `X-Proxy-Token`。
- `app.get('/api/catalog/search')`：校验 `q`，转发 `https://ollama.com/search` 并原样返回 HTML；12 秒超时；失败 502；不缓存。
- `app.get('/api/hf/*')`：只允许 `/api/models...`；15 秒超时；非法路径 400，失败 502；不缓存。
- `app.post('/api/import')`：流式接收 GGUF（上限 20 GB），非 `.gguf`/空文件 400，CLI 缺失 503，创建失败 502；临时目录 finally 清理。
- `app.all('/ollama/*')`：转发方法、必要请求头与请求体；逐块写回上游响应；客户端断开时 abort 上游。
- 静态托管 `dist/`；`app.get('*')` 回退到 `dist/index.html`。
- 环境变量：`OLLAMA_HOST`、`PORT`（默认 3000）、`HOST`（默认 `127.0.0.1`）、`PROXY_TOKEN`（可选）、`OLLAMA_MODELS`（可选，缓存/导出扫描目录）、`ALLOW_DAEMON_CONTROL`（可选，默认关闭）；`dotenv/config` 读取 `.env`，进程环境优先。
- 非 loopback 且未设置令牌时启动日志输出安全警告；无 TLS、无 CORS 配置。

### `vitest.config.ts` / `.github/workflows/ci.yml`

- Vitest：Node 环境，`src/**/*.test.ts` 与 `server/**/*.test.ts`；coverage 使用 v8。
- CI：Ubuntu + Node 24，依次 `npm ci`、`typecheck`、`lint`、`format:check`、`test`、`build`。

### `index.html`

- `lang="en"`，根元素默认 `class="dark"`；标题与 meta 描述为 Ollama Studio。
- 不再引用外部字体/图标；由 `src/main.tsx` 导入本地包。

### `.env.example` 与 `.gitignore`

- `.env.example` 声明 `OLLAMA_HOST`、`PORT`、`HOST`、可选 `PROXY_TOKEN` / `VITE_PROXY_TOKEN`、注释的 `VITE_OLLAMA_BASE_URL`、`OLLAMA_MODELS` 与 `ALLOW_DAEMON_CONTROL`。
- `.gitignore` 忽略 `node_modules/`、`.npm-cache/`、`build/`、`dist/`、`server.js`、`coverage/`、`.DS_Store`、`*.log`、`.env*`、`.dsh-progress/`、`.workflow/`，保留 `.env.example`。

### `metadata.json`

- 名称 `Ollama Studio`，描述为本地 Ollama 管理器；`majorCapabilities` 为空数组（不再声明 Gemini）。

## 版本

以下为 2026-10-28 实际安装并解析的版本（`package-lock.json` lockfileVersion 3）；声明范围见 `package.json`。

| 包 | 实际版本 | 用途/说明 |
| --- | --- | --- |
| `react` / `react-dom` | `19.3.1` | 运行时 |
| `vite` | `8.3.5` | 构建工具 |
| `typescript` | `6.0.3` | `typecheck`；为兼容 typescript-eslint 固定 |
| `typescript-eslint` | `8.72.1` | ESLint TypeScript 规则 |
| `eslint` / `@eslint/js` | `10.13.0` / `10.0.1` | lint |
| `prettier` | `3.9.10` | format |
| `vitest` / `@vitest/coverage-v8` | `5.0.5` | 测试/覆盖率 |
| `tailwindcss` / `@tailwindcss/vite` | `4.3.3` | 样式构建 |
| `@vitejs/plugin-react` | `6.1.2` | Vite React 插件 |
| `express` | `4.22.3` | 生产代理/静态服务 |
| `esbuild` | `0.28.2` | 服务端打包 |
| `@types/node` / `@types/express` | `22.20.5` / `4.17.25` | 类型 |
| `material-symbols` | `0.48.2` | 本地图标字体 |
| `@fontsource-variable/*` | `5.3.0` | 本地文本字体 |

## 环境与部署

- **本次核验环境**（2026-10-28，仅记录，不作为版本要求）：Node.js `v24.22.0`，npm `11.19.1`，Ollama `0.40.7`。
- `package.json` 没有 `engines` 字段；最低 Node 版本待核实。
- 已存在 `node_modules/`、`package-lock.json`、`dist/`、`server.js`、`build/`；Git 分支 `main`，远端 `origin` 为 GitHub（HaoRangQi/Ollama-Studio）。
- 开发：`npm run dev` → `127.0.0.1:3000`；`npm run dev:lan` → `0.0.0.0:3000`。
- 生产：`npm run build && npm start` → 默认 `127.0.0.1:3000`，Express 静态托管 + `/ollama` 代理。
- 菜单栏：`npm run build:menu` → `build/Ollama Studio Menu.app` 与 DMG；App 内嵌 Node 与 `server.js`，监听 `127.0.0.1:3210`；ad-hoc 签名、未公证（`RUNBOOK.md` 19）。
- `npm run preview` 默认端口按 Vite 约定为 `4173`，未验证。
- 仓库内没有部署配置（Docker、Vercel、Netlify、Cloud Run 等均未发现）。
- README 链接的 AI Studio 应用是否仍在线、是否对应本仓库版本：待核实。
