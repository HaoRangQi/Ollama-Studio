# PROJECT_INDEX.md

> 条件路由：只在需要定位文件或章节时读。不要把它当成必读清单，也不要按表逐项打开。

## 项目定位

Ollama Studio 是一个 React + TypeScript + Vite 的 Ollama 本地模型管理与对话界面。已接入 `GET /api/version`、`GET /api/tags`、`GET /api/ps`、`POST /api/chat`（流式）、`POST /api/pull`（流式进度）、`DELETE /api/delete`、`POST /api/copy`、`POST /api/create`、`/api/generate`（加载/释放）、`/api/embed`（embedding 加载）、同源代理、ModelScope（默认）/ Hugging Face / ollama.com 模型库搜索、ModelScope / Hugging Face 服务端下载 + `ollama create`、服务端后台下载任务（`/api/downloads`，刷新可接回）、Ollama 缓存扫描/清理（`/api/cache`）、GGUF 导入与导出（`/api/export`）、系统指标（`/api/metrics`）与守护进程检测/可选控制（`/api/daemon`）。会话支持每模型多会话，模型参数作为对话默认值持久化。另有可选的 macOS 菜单栏封装（`macos/menu-bar/`，Swift + 内置 Node 服务，`npm run build:menu` 生成 `.app` 与 DMG）。项目目标与实时状态见 `docs/context/NOW.md`。

## 事实权威

文档职责与权威分工以 `AGENTS.md` 第 5 节为准；本文件只负责按任务路由，不重复定义权威来源。

## 任务 → 入口

| 任务 | 先读 / 修改 |
| --- | --- |
| 了解项目是什么、现在能不能用 | `README.md` 的“Project Overview”“Current Status”“Verification Status”；中文见 `README.zh-CN.md` |
| 接续上一次工作 | `docs/context/NOW.md` |
| 改 Ollama API 客户端、流式解析、错误处理、加载/释放 | `src/api/ollama.ts` |
| 改模型字段映射、分类、上下文/量化显示 | `src/api/ollamaMapper.ts` |
| 改模型库关键字搜索、Hugging Face / ollama.com 结果解析 | `src/api/catalog.ts`；`src/screens/PullScreen.tsx`；`vite.config.ts` / `server.ts` 的 `/api/hf` 与 `/api/catalog` |
| 改 Hugging Face 直下（文件解析、GGUF 下载、`ollama create`） | `server/huggingface.ts`；`server/huggingface.test.ts`；`server/downloads.ts` 的 `runHuggingFaceJob`；`src/api/catalog.ts` 的 `extractGgufFiles` / `findQuantFile`；`src/api/downloads.ts`；`src/App.tsx` 的 `startHuggingFaceDownload`；`src/screens/PullScreen.tsx`；`src/lib/downloadTask.ts` |
| 改 ModelScope 渠道（默认）、搜索与下载 | `server/modelscope.ts`；`server/downloads.ts` 的 `runModelScopeJob`；`src/api/catalog.ts` 的 `searchModelScopeCatalog`；`src/components/CatalogResultRow.tsx`；`server.ts` / `vite.config.ts` 的 `/api/modelscope/*` |
| 改缓存扫描与清理（未引用 blob、未完成下载、临时目录、逐文件明细、文件管理器定位） | `server/cache.ts`；`server/cache.test.ts`；`src/api/cache.ts`；`src/screens/TelemetryScreen.tsx` 的缓存卡片与确认弹窗；`server.ts` / `vite.config.ts` 的 `/api/cache` |
| 改 GGUF 导出（manifest 解析、model/projector 复制、重名、目录校验） | `server/exportGguf.ts`；`server/exportGguf.test.ts`；`src/api/export.ts`；`src/screens/ModelsScreen.tsx` 的导出按钮与菜单；`src/App.tsx` 的 `handleExportModel`；`server.ts` / `vite.config.ts` 的 `/api/export` |
| 改磁盘/内存/CPU/GPU 指标 | `server/metrics.ts`；`server/metrics.test.ts`；`src/api/metrics.ts`；`src/screens/TelemetryScreen.tsx` 的指标轮询与卡片；`server.ts` / `vite.config.ts` 的 `/api/metrics` |
| 改 daemon 检测/启动/重启/停止命令 | `server/daemon.ts`；`server/daemon.test.ts`；`src/api/daemon.ts`；`src/hooks/useDaemonControl.ts`；`src/lib/daemonConfig.ts` 与测试；`src/screens/TelemetryScreen.tsx` 的服务控制面板（唯一入口）；`src/screens/TelemetryScreen.tsx` 的服务控制面板；`server.ts` / `vite.config.ts` 的 `/api/daemon`；`ALLOW_DAEMON_CONTROL` |
| 改连接状态、自动轮询、刷新、真实模型加载 | `src/hooks/useOllama.ts`（默认 5 秒静默轮询）；`src/App.tsx` |
| 改真实拉取、进度、暂停/取消、失败重试、任务持久化 | `src/api/downloads.ts`；`server/downloads.ts`；`src/App.tsx` 的 `startPullDownload` / `handleRetryDownload` 与轮询 effect；`src/lib/downloadTask.ts`；`src/types.ts` 的 `ModelScopeDownloadSource` / `HuggingFaceDownloadSource`；`src/screens/PullScreen.tsx` |
| 改删除、克隆 | `src/api/ollama.ts` 的 `deleteModel` / `copyModel`；`src/App.tsx`；`src/screens/ModelsScreen.tsx` |
| 改模型来源登记、渠道页面跳转、卡片量化标签 | `src/lib/modelOrigin.ts`；`src/lib/modelOrigin.test.ts`；`src/App.tsx` 的下载成功回调；`src/screens/ModelsScreen.tsx` 的“查看渠道页面”菜单项；`src/api/catalog.ts` 的 `extractQuants`；`src/api/catalog.test.ts` |
| 改 Modelfile 创建 | `src/api/ollama.ts` 的 `createModel`；`src/screens/ModelfileLabScreen.tsx`；`src/App.tsx` |
| 改多会话、会话持久化与 v1 迁移 | `src/lib/chatSessions.ts`；`src/screens/ChatScreen.tsx` |
| 改模型采样参数默认值、keep_alive | `src/lib/modelSettings.ts`；`src/screens/ModelsScreen.tsx`；`src/screens/ChatScreen.tsx` |
| 改代码块解析/复制 | `src/lib/markdown.ts`；`src/screens/ChatScreen.tsx` |
| 改图片/视频附件、抽帧、附件拒绝规则 | `src/lib/attachments.ts`；`src/screens/ChatScreen.tsx`；类型 `ChatAttachment` 在 `src/types.ts` |
| 改遥测/日志/配置持久化/缓存清理/系统指标/服务控制 | `src/screens/TelemetryScreen.tsx`；`src/hooks/useOllama.ts`；`src/hooks/useDaemonControl.ts`；`src/api/cache.ts`；`src/api/metrics.ts`；`src/api/daemon.ts`；`src/lib/daemonConfig.ts`；`ollama_daemon_config_v1` |
| 改离线/连接中/空模型提示 | `src/components/ConnectionBanner.tsx`；`src/screens/ModelsScreen.tsx`；`src/screens/ChatScreen.tsx` |
| 改聊天流式输出、停止、思考、参数面板 | `src/screens/ChatScreen.tsx`；`src/api/ollama.ts` 的 `streamChat` |
| 改开发代理、开发绑定、令牌注入 | `vite.config.ts`；`package.json` 的 `dev` / `dev:lan` |
| 改生产静态托管/代理/鉴权/端口 | `server.ts`；`package.json` 的 `start` / `build:server` |
| 改/打包 macOS 菜单栏 App（菜单项、内置服务、图标、DMG） | `macos/menu-bar/main.swift`；`build.sh`；`Info.plist`；`make-icon.swift` / `make-app-icon.swift`；`package.json` 的 `build:menu`；`docs/context/RUNBOOK.md` 19 |
| 改页面或界面模块 | `src/screens/*.tsx`；共享组件在 `src/components/`；页面切换在 `src/App.tsx` |
| 改移动端导航/响应式 | `src/components/MobileNav.tsx`；`src/components/Sidebar.tsx`；`src/App.tsx`；`src/index.css` |
| 改主题、配色、明暗模式、自定义强调色 | `src/context/ThemeContext.tsx`（`resolvePalette` / `buildCustomPalette`）；`src/index.css`；`src/components/ThemePaletteModal.tsx` |
| 改中英文案 | `src/i18n/translations.ts`；调用处 `useAppTheme().t` |
| 改剩余演示数据/离线回退 | `src/data/mockData.ts`；类型在 `src/types.ts` |
| 改 GGUF 上传、CLI 预检 | `server/importGguf.ts`；`server.ts` / `vite.config.ts` 的 `/api/import`；`src/api/ollama.ts` 的 `importGguf`；`src/screens/PullScreen.tsx` |
| 改/加单元测试 | `src/**/*.test.ts`、`server/**/*.test.ts`；配置 `vitest.config.ts` |
| 改 lint/format/strict | `eslint.config.js`；`.prettierrc.json`；`tsconfig.json` |
| 改 CI | `.github/workflows/ci.yml` |
| 改字体/图标 | `src/main.tsx`；`src/index.css`；`package.json` 的字体依赖 |
| 安装依赖、开发、构建、生产运行 | `README.md` 的“Install and Run”与“Development”；命令与执行状态见 `docs/context/RUNBOOK.md` |
| 查依赖版本、脚本、环境 | `package.json`；`package-lock.json`；`vite.config.ts`；`tsconfig.json`；关系说明见 `docs/context/MAP.md` |
| 查为什么这样选 | `docs/context/DECISIONS.md` |
| 查已知坑和未验证项 | `docs/context/RISKS.md` |
| 找历史旧方案 | `docs/context/history/README.md`（先搜索再读） |
| 看视觉参考 | `public/assets/aistudio/`（设计参考，未被应用代码引用） |

## 当前不存在的结构（避免空找）

- 无路由库：页面由 `App.tsx` 的 `currentScreen` state 切换。
- 无全局状态库、无数据库；主题/语言、会话、参数、下载任务、daemon 界面配置写 `localStorage`。
- 无 Playwright/组件测试；当前只有 Vitest 单元测试与 headless DOM 冒烟。
- 远端 `origin` 已配置为 GitHub（HaoRangQi/Ollama-Studio），`main` 已推送；无版本 tag、无发布流水线。
- 无 Tauri/Electron 桌面壳；`macos/menu-bar/` 是可选的 macOS 菜单栏封装，不是跨平台桌面框架。
- 仓库内无部署配置（未发现 Docker、Vercel、Netlify、Cloud Run 等配置）。
- `server.ts` 已存在，`server.js` 是构建产物（已 gitignore）；`package-lock.json` 已存在。

> 以上为 2026-10-29 对仓库根目录、`src/`、`server/` 与配置文件的核验结果；新增结构后请同步更新本节。
