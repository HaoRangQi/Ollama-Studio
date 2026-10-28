# DECISIONS

> 只记录已确认的决策与明确的待决策项。建议、猜测、计划不要写成“已决定”。
>
> 最后核验：2026-10-29；范围：仓库代码、配置、依赖、代理、下载、缓存、菜单栏封装与本次第一阶段接入。

## 已确认（有仓库证据）

### D-001 前端采用 React + TypeScript + Vite 单页应用

- **状态**：已确认（现状基线）。
- **内容**：浏览器端 SPA，使用 React 19、TypeScript、Vite 构建；入口 `index.html` → `src/main.tsx` → `src/App.tsx`。
- **依据/来源**：`package.json`、`vite.config.ts`、`src/main.tsx`、`src/App.tsx`。
- **理由**：仓库由 AI Studio 脚手架导出，现有实现已按此结构落地；未发现替代方案记录。
- **范围**：前端构建与运行方式；不涉及桌面壳或部署形态。
- **备注**：是否长期保留待后续确认；当前没有路由库。

### D-002 视觉体系采用 Tailwind CSS v4 + CSS 变量 + Material 3 Expressive 风格

- **状态**：已确认（现状基线）。
- **内容**：Tailwind v4 通过 `@tailwindcss/vite` 接入；`src/index.css` 用 `@theme` 把颜色 token 映射到 `--app-*` / `--primary-*` 变量；主题由 `ThemeContext` 在运行时写入 CSS 变量。
- **依据/来源**：`src/index.css`、`src/context/ThemeContext.tsx`、`metadata.json`、`public/assets/aistudio/` 中的 Material 3 token 参考。
- **理由**：现有页面已按该体系实现，包含明暗模式与五套强调色。
- **范围**：样式与主题；不约束组件库或设计工具。

### D-003 页面切换使用组件内 state，不引入路由库

- **状态**：已确认（现状基线）。
- **内容**：`App.tsx` 用 `currentScreen: NavScreen` 控制 `models`、`pull`、`chat`、`telemetry-settings`、`modelfile-lab` 五个页面。
- **依据/来源**：`src/App.tsx`、`src/types.ts`。
- **理由**：页面数量少，state 切换足够；`package.json` 没有路由依赖。
- **范围**：页面导航。刷新后回到默认 `models` 页面；不支持深链接。
- **备注**：接入真实应用后是否引入路由，待确认。

### D-004 原 mock-first 数据层（已被 D-101 / D-102 / D-104 替代）

- **状态**：已替代（仅保留历史记录）。
- **内容**：原实现中模型、下载任务、聊天消息、daemon 配置与日志全部来自 `src/data/mockData.ts` 和组件内 state，`src/` 中没有网络请求。
- **依据/来源**：2026-10-27 首次文档核验时的 `src/data/mockData.ts`、`src/App.tsx`、`src/screens/ChatScreen.tsx`、`src/screens/TelemetryScreen.tsx`。
- **替代原因**：第一阶段已接入真实 `/api/version`、`/api/tags`、`/api/ps`、`/api/chat`；仍保留离线演示回退。
- **范围**：仅说明历史基线，不再代表当前实现。

### D-005 主题、强调色、语言由自建 ThemeContext 管理并写入 localStorage

- **状态**：已确认（现状基线）。
- **内容**：`ThemeContext` 提供 `themeMode`、`accentPalette`、`language` 和 `t()`；持久化键为 `ollama_theme_mode`、`ollama_accent_palette`、`ollama_language`。
- **依据/来源**：`src/context/ThemeContext.tsx`、`src/i18n/translations.ts`。
- **理由**：集中管理 UI 偏好，避免引入额外状态/i18n 库。
- **范围**：仅主题、强调色、语言；业务数据不持久化。

### D-006 文档体系采用 AGENTS.md + PROJECT_INDEX.md + README.md + docs/context/

- **状态**：已确认（本次任务要求）。
- **内容**：根目录保存协作规则、索引与项目说明；专题文档放入 `docs/context/`；历史归档索引放入 `docs/context/history/`。
- **依据/来源**：用户 2026-10-27 的任务要求；本次新建的文档。
- **理由**：让后续 AI 能按需获取上下文、写入正确位置并接续工作。
- **范围**：仅文档与导航；不约束业务实现。

### D-101 当前形态为 Web 优先，Tauri 作为后续可选升级

- **状态**：已确认（用户 2026-10-27 明确）。
- **内容**：先完成 Web 形态；将来若需要桌面 App，再评估 Tauri。前端不得依赖 Tauri/Electron 专有 API，数据访问通过可替换的 HTTP/代理边界。
- **依据/来源**：用户指令“现在先 web 形态使用，将来或许需要升级到 tauri，变成桌面 app”。
- **理由**：先降低运行与分发复杂度，同时保留迁移路径。
- **范围**：运行形态与前端边界；不承诺 Tauri 迁移时间表。

### D-102 前端统一通过同源 `/ollama` 代理访问 Ollama

- **状态**：已确认（2026-10-27 实现）。
- **内容**：前端默认请求 `/ollama/api/*`；开发环境由 `vite.config.ts` 代理，生产环境由 `server.ts` 代理；上游地址取 `OLLAMA_HOST`，默认 `http://127.0.0.1:11434`。仅当浏览器可直连时才使用 `VITE_OLLAMA_BASE_URL`。
- **依据/来源**：`src/api/ollama.ts`、`vite.config.ts`、`server.ts`、`.env.example`。
- **理由**：避免浏览器 CORS 与硬编码端口；同一套前端代码可运行在开发服务器、生产服务器和未来桌面壳中。
- **范围**：HTTP 请求路径与代理；不涉及鉴权方案。

### D-103 第一阶段 API 范围限定为版本、模型列表、运行状态与流式聊天

- **状态**：已确认（2026-10-27 实现）。
- **内容**：接入 `GET /api/version`、`GET /api/tags`、`GET /api/ps`、`POST /api/chat`（`stream: true`，NDJSON）。拉取、删除、复制、创建、GGUF 导入不在第一阶段。
- **依据/来源**：`src/api/ollama.ts`、`src/hooks/useOllama.ts`、`src/screens/ChatScreen.tsx`。
- **理由**：先打通“看到真实模型 + 真实对话”的最小闭环，再扩展写操作。
- **范围**：只读模型数据与聊天；写操作在 D-103 阶段未接线，后续由 D-118 接通拉取/删除/克隆/创建。

### D-104 真实数据优先，离线时回退到明确标注的演示数据

- **状态**：已确认（2026-10-27 实现）。
- **内容**：`useOllama` 连接成功时用 `/api/tags` + `/api/ps` 映射的模型替换 App 状态；连接中/离线时保留 `INITIAL_MODELS` 作为演示回退，并由 `ConnectionBanner` 标注“演示数据”。在线但没有模型时显示空列表，不伪造模型。
- **依据/来源**：`src/hooks/useOllama.ts`、`src/App.tsx`、`src/components/ConnectionBanner.tsx`。
- **理由**：保留设计原型的可展示性，同时避免把 mock 误认为真实数据。
- **范围**：模型列表与连接状态；聊天在离线时仍会请求并显示错误，不伪造回复。
- **备注**：在线但 0 个模型时，`ConnectionBanner` 会提示“已连接但没有本地模型 / 前往拉取”；`selectedModel` 仍可能指向演示模型，后续应改为可空并禁用聊天。

### D-105 生产形态为 Express 静态托管 + 流式代理

- **状态**：已确认（2026-10-27 实现）。
- **内容**：`server.ts` 托管 `dist/`，把 `/ollama/*` 转发到 `OLLAMA_HOST`，保留 NDJSON 流；`npm run build` 同时执行 `build:web` 与 `build:server`，`npm start` 运行 `server.js`。默认 `HOST=127.0.0.1`、`PORT=3000`。
- **依据/来源**：`server.ts`、`package.json`、`RUNBOOK.md`。
- **理由**：不引入额外反向代理即可本地运行生产构建；流式响应不被缓冲。
- **范围**：单机本地运行；未做鉴权、TLS、容器化或公网部署。

### D-106 模型测试遵循资源纪律

- **状态**：已确认（用户 2026-10-27 要求 + 本次执行）。
- **内容**：除非验证目标必须依赖真实推理，否则只用 `/api/version`、`/api/tags`、`/api/ps` 或 mock NDJSON；需要加载模型时先说明原因，测试后用 `keep_alive: 0` 卸载并记录。
- **依据/来源**：用户指令“没必要真启动 ollama 模型做测试……除非十分必要，否则别开本地模型”；本次测试后已卸载模型。
- **理由**：大模型加载会占内存、造成卡顿；大部分接口与解析逻辑不需要真实推理。
- **范围**：开发与验收测试；不限制用户主动使用应用聊天。

### D-107 包管理器使用 npm，并提交 `package-lock.json`

- **状态**：已确认（2026-10-27 安装验证）。
- **内容**：使用 npm 11 与 `package-lock.json`（lockfileVersion 3）；当前环境默认缓存 `~/.npm` 有权限问题，安装时使用仓库内 `.npm-cache/`。
- **依据/来源**：`package-lock.json`、`RUNBOOK.md` 安装记录。
- **理由**：锁文件提供可复现安装；本地缓存绕过当前机器的 `EPERM`。
- **范围**：当前开发环境；长期应修复 npm 缓存权限或写入 CI 安装说明。

### D-108 当前最低验证为类型检查 + 构建 + 手动连通性

- **状态**：已确认（2026-10-27 执行）。
- **内容**：`npm run lint`（`tsc --noEmit`）与 `npm run build` 必须通过；API/代理改动需补充 `/api/version`、`/api/tags`、`/api/ps` 或 mock 流验证。尚未引入 ESLint/Prettier、单元测试或 CI。
- **依据/来源**：`package.json`、`RUNBOOK.md` 执行记录。
- **理由**：先建立可执行的最低门槛，避免把“能构建”误当成“有测试”。
- **范围**：当前阶段；测试/CI 方案仍待决策（D-110）。

### D-116 模型库搜索通过同源只读代理查询 ollama.com

- **状态**：已确认（2026-10-28 实现并验证）。
- **内容**：PullScreen 提供关键字搜索；本地精选即时过滤，远程结果通过 `/api/catalog/search` 代理 `https://ollama.com/search?q=`，前端用 `DOMParser` 提取模型名、描述和链接。结果填入 `ollama pull` 命令；点击“拉取权重”后由 App 调用真实 `/api/pull`。
- **依据/来源**：`src/api/catalog.ts`、`src/screens/PullScreen.tsx`、`vite.config.ts`、`server.ts`、`RUNBOOK.md` 搜索代理记录。
- **理由**：Ollama 没有公开的模型搜索 API；官网搜索页是唯一可用的公共目录。同源代理避免 CORS，并让开发/生产共用同一路径。
- **范围/风险**：依赖 ollama.com HTML 结构，官网改版或离线可能失效；已有官网链接与本地精选兜底（`RISKS.md` R-022）。不把 HTML 持久化，不转发搜索以外的路径。

### D-117 Hugging Face 作为默认模型搜索来源

- **状态**：部分被 D-141 替代（2026-10-29）：搜索与 HF 文件列表保留，下载改由服务端直下，不再依赖 `ollama pull hf.co`；默认渠道后续改为 ModelScope。
- **内容**：PullScreen 搜索默认使用 Hugging Face；通过同源 `/api/hf/*` 代理调用 `https://huggingface.co/api/models`，参数为 `search`、`filter=gguf`、`sort=downloads`、`direction=-1`、`limit=24`、`expand[]=siblings`。前端从 `siblings` 的 `.gguf` 文件名推导量化标签，点击标签填入 `ollama pull hf.co/<repo>:<quant>`。Ollama 官方来源保留为第二选项。
- **依据/来源**：`src/api/catalog.ts`、`src/screens/PullScreen.tsx`、`vite.config.ts`、`server.ts`、`RUNBOOK.md` 搜索代理记录；用户 2026-10-28 提出“Hugging Face 渠道查询会更好”。
- **理由**：Hugging Face 提供结构化 JSON、下载量排序和 GGUF 仓库过滤，比解析 ollama.com HTML 更稳定、结果更丰富。
- **范围/风险**：依赖 Hugging Face API 可用性与限流；量化标签由文件名推断，可能不完整或与 Ollama 的 `hf.co` 规则不完全一致（`RISKS.md` R-023）。HF 下载还受本机 DNS/代理影响（`RISKS.md` R-024）。

### D-118 真实写操作统一走同源 `/ollama` 代理

- **状态**：已确认（2026-10-28 实现并验证）。
- **内容**：`/api/pull`、`/api/delete`、`/api/copy`、`/api/create` 均通过现有 `/ollama/*` 同源代理调用；PullScreen 任务卡消费 `POST /api/pull` 的 NDJSON 层进度，支持暂停（abort）、继续（重新拉取）和取消；Models 页删除/克隆、Modelfile 实验室创建均在成功后刷新 `/api/tags`。删除的空响应体由 `requestJson` 兼容。
- **依据/来源**：`src/api/ollama.ts`、`src/App.tsx`、`src/screens/PullScreen.tsx`、`src/screens/ModelsScreen.tsx`、`src/screens/ModelfileLabScreen.tsx`、`RUNBOOK.md` 5.1。
- **理由**：写操作必须反映真实 Ollama 状态，避免 UI 假成功；复用代理可让开发与生产路径一致，并保留 NDJSON 流。
- **范围/风险**：HF 拉取受网络 DNS/重定向限制；暂停/继续不是 Ollama 原生 pause，而是 abort 后重新拉取，依赖已下载 blob 复用；GGUF 上传由 D-121 单独处理（`RISKS.md` R-009、R-024）。

### D-119 按模型会话持久化到 localStorage

- **状态**：已确认（2026-10-28 实现并验证）。
- **内容**：ChatScreen 以 `currentModel.fullTag` 为键，把消息数组写入 `localStorage` 的 `ollama_chat_sessions_v1`；切换模型时加载对应会话，刷新后恢复；新会话清空当前模型消息。
- **依据/来源**：`src/screens/ChatScreen.tsx`、`RUNBOOK.md` 5.1。
- **理由**：当前没有数据库与后端账户体系；按模型分会话能避免不同模型上下文混在一起，且实现成本低。
- **范围/风险**：只存在本机浏览器；清除站点数据会丢失；消息可能包含敏感内容，不做服务端同步。模型参数、下载任务尚未持久化。

### D-120 测试优先使用用户指定的小模型，并记录网络限制

- **状态**：已确认（2026-10-28 执行）。
- **内容**：真实推理测试使用 `hf.co/saidutta69/MiniCPM-V-4.7-1B-heretic:Q4_K_M`（1B，约 0.67 GB）；测试后用 `ollama stop` 卸载。该模型经 HF 直拉失败（本机 DNS 将 CDN 解析为 `198.18.0.85`，Ollama 拒绝非公网重定向），改用同一 GGUF 本地 `ollama create` 导入为 `minicpm-v-4.7-1b-heretic:q4_k_m` 完成对话测试。
- **依据/来源**：用户 2026-10-28 指令；`RUNBOOK.md` 5.1；`RISKS.md` R-024。
- **理由**：小模型资源占用低，能验证真实 chat 链路而不影响用户其他工作；同时暴露 HF 下载的网络依赖。
- **范围/风险**：本地导入是测试替代路径，不代表应用内 HF 拉取成功；模型保留供用户复测，临时副本/构建模型已删除。

### D-121 GGUF 上传通过本机 ollama CLI 注册

- **状态**：已确认（2026-10-28 实现并验证）。
- **内容**：开发 Vite 与生产 Express 共用 `/api/import`；请求体流式写入临时 `.gguf` 文件（上限 20 GB），写一个只含 `FROM <临时文件>` 的 Modelfile，执行 `ollama create <model> -f <Modelfile>`，完成后删除临时目录。前端 PullScreen 拖拽/文件选择调用该接口，上传中禁用入口，成功后刷新模型列表。
- **依据/来源**：`server/importGguf.ts`、`server.ts`、`vite.config.ts`、`src/api/ollama.ts`、`src/screens/PullScreen.tsx`、`RUNBOOK.md` 5.1。
- **理由**：Ollama `/api/create` 的 `from` 不接受本地 GGUF 路径（实测返回 `invalid model name`），`files` 字段需要 digest 而非文件内容；CLI 是当前 Ollama 版本可靠的本地 GGUF 注册方式。
- **范围/风险**：要求运行服务的机器安装 `ollama` CLI 且能访问 `OLLAMA_HOST`；远端 Ollama 部署需额外处理；上传是流式落盘，不把整文件读入内存；临时文件失败时也会清理（`RISKS.md` R-009）。

### D-122 许可证采用 Apache-2.0

- **状态**：已确认（2026-10-28，用户选择）。
- **内容**：仓库根目录添加标准 Apache License 2.0 文本；`package.json` 声明 `"license": "Apache-2.0"`。
- **依据/来源**：用户 2026-10-28 对许可证选项的确认；`LICENSE`。
- **理由**：允许复用与分发，并包含明确的专利授权条款。
- **范围/风险**：不代替项目所有者对商标、贡献者协议或第三方资产许可的审查。

### D-123 测试与 CI 采用 Vitest + GitHub Actions

- **状态**：已确认（2026-10-28，替代 D-110 的待决策项）。
- **内容**：使用 Vitest（Node 环境）覆盖 NDJSON 流式解析、映射、会话存储、模型参数、下载任务、GGUF 名称与空上传校验；`.github/workflows/ci.yml` 依次执行 `npm ci`、`typecheck`、`lint`、`format:check`、`test`、`build`。暂不引入 Playwright。
- **依据/来源**：`vitest.config.ts`、`src/**/*.test.ts`、`server/**/*.test.ts`、`.github/workflows/ci.yml`。
- **理由**：纯函数与 fetch/NDJSON 解析不需要浏览器即可回归；CI 在 GitHub 上可复现。
- **范围/风险**：不覆盖真实浏览器交互、视觉、a11y 与真实模型推理；这些仍需人工验收。

### D-124 TypeScript 固定为 6.0.3 并启用 strict

- **状态**：已确认（2026-10-28）。
- **内容**：从 TypeScript 7.0.2 降到 6.0.3；`tsconfig.json` 开启 `strict`、`noFallthroughCasesInSwitch`、`forceConsistentCasingInFileNames`。
- **依据/来源**：`package.json`、`package-lock.json`、`tsconfig.json`；typescript-eslint 8.72.1 的 peer 范围是 `>=4.8.4 <6.1.0`。
- **理由**：TypeScript 7 与当前 typescript-eslint 不兼容，直接安装会 npm ERESOLVE；6.0.3 可通过类型检查且满足 lint 工具链。
- **范围/风险**：升级 TypeScript 7 需等 typescript-eslint 支持后单独验证；当前不使用 TS 7 独有语法。

### D-125 采样参数作为对话默认值持久化，显存开关使用 keep_alive

- **状态**：已确认（2026-10-28，替代 D-111 的参数部分）。
- **内容**：Models 页的 temperature/top_p/num_ctx/repeat_penalty 写入 `localStorage` 的 `ollama_model_settings_v1`，作为该模型的对话默认值；Ollama 没有修改已注册模型参数的 API，因此不覆盖重建模型。显存常驻/释放通过 `/api/generate`（embedding 模型用 `/api/embed`）发送 `keep_alive: -1` / `0`，并刷新 `/api/ps`。
- **依据/来源**：`src/lib/modelSettings.ts`、`src/screens/ModelsScreen.tsx`、`src/screens/ChatScreen.tsx`、`src/api/ollama.ts` 的 `loadModel` / `unloadModel`。
- **理由**：避免同名重建模型带来的破坏性副作用；参数对对话立即生效并可刷新恢复。
- **范围/风险**：参数不会改变模型文件或其他客户端；真实加载/卸载 UI 尚未做人工验收（仅单测请求构造）。

### D-126 代理鉴权采用可选共享令牌，默认仅监听 localhost

- **状态**：已确认（2026-10-28，替代 D-115 的待决策项）。
- **内容**：生产服务器默认 `HOST=127.0.0.1`；设置 `PROXY_TOKEN` 后，`/ollama/*` 与本地管理 API（`/api/import`、`/api/modelscope`、`/api/downloads`、`/api/cache`、`/api/export`、`/api/metrics`、`/api/daemon`）要求 `Authorization: Bearer <token>` 或 `X-Proxy-Token`。前端在构建时通过 `VITE_PROXY_TOKEN` 发送同一令牌。非 loopback 且未设置令牌时，启动日志输出安全警告。
- **依据/来源**：`server.ts`、`vite.config.ts`、`src/api/ollama.ts` 的 `proxyAuthHeaders`、`.env.example`；2026-10-28 生产服务器 401/200 验证。
- **理由**：默认本机使用零配置；需要局域网访问时可加一层共享密钥。
- **范围/风险**：`VITE_PROXY_TOKEN` 会进入前端产物，是共享密钥而非用户级认证；未加 TLS、限流或审计；`/api/catalog` 与 `/api/hf` 仍是只读无鉴权代理。

### D-127 开发服务器默认绑定 127.0.0.1

- **状态**：已确认（2026-10-28）。
- **内容**：`npm run dev` 使用 `vite --port=3000 --host=127.0.0.1`；需要局域网访问时显式运行 `npm run dev:lan`（`0.0.0.0`），并遵守安全提示。
- **依据/来源**：`package.json`、`vite.config.ts`、`RUNBOOK.md`；2026-10-28 在 3001 窄绑定验证通过。
- **理由**：避免开发服务器在无鉴权情况下暴露给同网段。
- **范围/风险**：`dev:lan` 仍是明文 HTTP，仅应在可信网络临时使用。

### D-128 字体与图标自托管

- **状态**：已确认（2026-10-28）。
- **内容**：通过 `@fontsource-variable/*` 与 `material-symbols` npm 包在 `src/main.tsx` 引入 Geist、Plus Jakarta Sans、JetBrains Mono 和 Material Symbols；移除 `index.html` 的 Google Fonts 链接。
- **依据/来源**：`package.json`、`src/main.tsx`、`src/index.css`、`index.html`；构建产物包含本地 woff2。
- **理由**：离线或受限网络下界面不退化，减少第三方运行时依赖。
- **范围/风险**：Material Symbols 全量 woff2 约 4 MB，构建体积增大；未做图标子集化。

### D-129 聊天会话升级为每模型多会话

- **状态**：已确认（2026-10-28）。
- **内容**：`localStorage` 键改为 `ollama_chat_sessions_v2`，结构为 `{ version: 2, activeByModel, sessionsByModel }`；每个模型可创建、切换、重命名、删除多个会话。读取时若只有 v1（`ollama_chat_sessions_v1`），自动迁移为每个模型一个会话并删除旧键。
- **依据/来源**：`src/lib/chatSessions.ts`、`src/screens/ChatScreen.tsx`、`src/lib/chatSessions.test.ts`。
- **理由**：保留既有会话数据的同时支持多会话管理。
- **范围/风险**：只迁移本地浏览器存储；迁移失败时回退为空存储，不破坏原键（仅成功写入 v2 后删除 v1）。

### D-130 下载任务只持久化元数据，刷新后需用户显式继续

- **状态**：部分被 D-132 替代（2026-10-28）：任务改由服务端持有；`localStorage` 仍保存展示元数据，但刷新后自动接回运行中的任务，不再要求用户显式继续。
- **内容**：下载任务写入 `localStorage` 的 `ollama_download_task_v1`；页面刷新后，原本进行中的任务恢复为暂停并标记“上次任务已中断”，用户点击继续时重新调用 `/api/pull`（Ollama 复用已下载 blob）。取消任务会清除持久化记录。
- **依据/来源**：`src/lib/downloadTask.ts`、`src/App.tsx`、`src/screens/PullScreen.tsx`、`src/lib/downloadTask.test.ts`。
- **理由**：浏览器刷新无法保留 HTTP 流；持久化元数据并显式恢复比伪装“继续”更诚实。
- **范围/风险**：不恢复原始流、速度历史或精确进度；中断后需重新查询 manifest。

### D-132 下载任务改由服务端后台执行，浏览器轮询并自动接回

- **状态**：已确认（2026-10-28，替代 D-130 的刷新处理部分）。
- **内容**：新增 `server/downloads.ts` 与 `/api/downloads`：`POST` 创建或复用任务，`GET` 查询列表/单个任务，`DELETE` 取消。Ollama pull 的 NDJSON 在服务端消费并聚合分层字节；ModelScope 下载同样由服务端持有。前端每 900ms 轮询，刷新后挂载时拉取运行中的任务并接回，首次自动切到拉取页。
- **依据/来源**：`server/downloads.ts`、`src/api/downloads.ts`、`src/App.tsx`、`src/screens/PullScreen.tsx`、`RUNBOOK.md` 13。
- **理由**：浏览器刷新/关闭不应中断下载；服务端持有任务比“刷新后标中断再重下”更符合用户预期，也避免 ModelScope 任务被错误地走 `ollama pull`。
- **范围/风险**：任务表是进程内 `Map`，服务端重启会丢失运行中任务（R-040）；已结束任务保留 5 分钟；ModelScope 无断点续传，暂停/继续会重新下载（R-039）。

### D-133 缓存清理只回收未引用 blob、未完成下载与应用临时目录

- **状态**：已确认（2026-10-28）。
- **内容**：`GET /api/cache` 扫描 `OLLAMA_MODELS`（默认 `~/.ollama/models`）与系统临时目录，把完整 blob 分为被 manifest 引用/未引用，并统计 `*-partial`、`*-partial-N` 与 `ollama-studio-*`；每类附按体积排序的逐文件明细（最多 500 条）。`POST /api/cache/cleanup` 只删除请求中勾选的类别；`POST /api/cache/reveal` 在系统文件管理器中定位文件/目录，只允许模型目录内路径或 `ollama-studio-*` 临时目录（`realpath` 校验）。清理前重新扫描；manifest 解析失败时禁止 orphan（409）；有运行中的下载任务时禁止 partial（409）；10 分钟内修改的文件跳过。
- **依据/来源**：`server/cache.ts`、`server/cache.test.ts`、`src/api/cache.ts`、`src/screens/TelemetryScreen.tsx`、`RUNBOOK.md` 14。
- **理由**：Ollama 没有公开的 GC API；直接删目录风险高。以 manifest 引用关系和文件年龄双重校验，能把“可回收”限制在可证明安全的集合内。
- **范围/风险**：不清理 manifest、不压缩；依赖 Ollama 现有的 `manifests/` 与 `manifests-v2/` 布局，未知布局或权限错误会让扫描不完整；真实目录清理需用户确认（R-042）；文件管理器定位依赖本地图形会话，Windows/Linux 分支未验证（R-043）。

### D-134 Ollama 状态采用 5 秒静默轮询

- **状态**：已确认（2026-10-28）。
- **内容**：`useOllama` 挂载时立即刷新，之后默认每 5000ms 静默调用 `getConnection()`（`/api/version`、`/api/tags`、`/api/ps`）；并发刷新共享同一个 Promise 防止堆叠；静默轮询不把状态切到 `connecting`。`TelemetryScreen` 原有的独立 5 秒 interval 移除，统一由 hook 负责；`useOllama(0)` 可关闭轮询。
- **依据/来源**：`src/hooks/useOllama.ts`、`src/App.tsx`、`src/screens/TelemetryScreen.tsx`、`RUNBOOK.md` 15。
- **理由**：侧栏“已加载显存/运行模型数”之前只在挂载、手动刷新或下载完成时更新，外部加载/卸载后长期显示旧值；5 秒轮询能及时反映 `/api/ps`，且只读、低成本。
- **范围/风险**：每 5 秒 3 个只读请求；App 与遥测页各一个 hook 实例，遥测页打开时两套轮询并行（R-044）；未按页面可见性暂停；若未来连接远程 Ollama 可提高间隔或共享状态。

### D-135 下载失败后重跑命令，并持久化 ModelScope 来源

- **状态**：已确认（2026-10-28）。
- **内容**：失败任务卡显示“将重跑”的具体命令并提供“重试”，按原参数重新创建后台任务；pull 任务可“编辑命令”，把 `ollama pull <model>` 填回输入框并聚焦，由用户修正后再次提交。`DownloadTask.source` 保存 ModelScope 的 `namespace/name/file/quant/modelName` 并写入 `ollama_download_task_v1`，刷新后仍可重试；旧任务没有 `kind/source` 时，`targetPath` 以 `.gguf` 结尾推断为 ModelScope，否则用 `targetPath` 作为文件名回退。仅对 `pull model manifest: file does not exist` 且模型名含 `/`、不以 `hf.co/` 开头的错误追加 Hugging Face / ModelScope 提示，不自动改写命令。
- **依据/来源**：`src/App.tsx`、`src/types.ts`、`src/lib/downloadTask.ts`、`src/screens/PullScreen.tsx`、`RUNBOOK.md` 13。
- **理由**：失败后只能关闭并重新搜索/输入，操作成本高；ModelScope 任务的关键参数（尤其子目录中的 `file`）无法从展示字段完整恢复，必须随任务持久化。原样重跑无法修正用户输错的模型标签，编辑入口让“重跑下载命令”可见且可修正。
- **范围/风险**：重试是重新下载而非断点续传；ModelScope 仍受单文件 20 GB 与网络限制（R-039）；提示与来源推断依赖既有字段（`.gguf`、Ollama 英文错误文本），上游格式变化时可能失效；不自动改写命令，用户仍需自行使用 `hf.co/` 前缀或 ModelScope 渠道（R-045）。D-141 扩展后，`source` 也支持 Hugging Face 的 `repo/file/quant/modelName`。

### D-136 从 Ollama manifest 导出当前量化的 GGUF

- **状态**：已确认（2026-10-28）。
- **内容**：`POST /api/export` 由本地服务读取 `OLLAMA_MODELS`（默认 `~/.ollama/models`）下的 manifest，复制 `application/vnd.ollama.image.model`（兼容 `...image.gguf`）blob，并把 `application/vnd.ollama.image.projector`（兼容 `...mmproj`）写成 `<name>-mmproj.gguf`。默认目录为 `~/Downloads/Ollama Studio`；显式 `directory` 必须已存在并通过 `realpath` 校验，只允许用户主目录、系统临时目录、`/tmp`、`/Volumes`、`/media`、`/mnt`。重名追加 `-2`。复制优先 `COPYFILE_FICLONE`（APFS clone），失败回退完整复制；任何一层失败会删除本次已写文件。默认 registry 的 manifest 同时尝试 `manifests`/`manifests-v2` 与 `registry.ollama.ai`/`ollama.com`。
- **依据/来源**：`server/exportGguf.ts`、`server/exportGguf.test.ts`、`src/api/export.ts`、`src/screens/ModelsScreen.tsx`、`RUNBOOK.md` 16；真实 0.8B 导出 SHA256 与 manifest digest 一致。
- **理由**：Ollama 没有导出 API；manifest 的 model 层本身就是 GGUF，直接复制不需要重新下载或加载模型。多模态模型必须同时导出 projector，否则视觉能力丢失。APFS clone 可把大模型导出成本降到接近零。
- **范围/风险**：只导出当前已安装量化；template/license/params 不属于 GGUF，需另存 Modelfile；不提供目录选择与进度条；跨文件系统是完整复制，可能耗时并占空间；没有预先计算 SHA256，只校验复制后大小；manifest 目录布局变化需扩展（R-046）。

### D-137 daemon 默认只生成命令，自动控制显式开启且限制本机

- **状态**：已确认（2026-10-28）。
- **内容**：`GET /api/daemon` 检测 Ollama.app、launchd、Homebrew、systemd 或普通进程，返回 PID 与重启/停止命令。`POST /api/daemon/control` 默认 403；只有 `ALLOW_DAEMON_CONTROL=1`、请求来自 loopback、`confirm:true` 且 `canExecute` 为真时才执行。Ollama.app 用 AppleScript 退出 + `open -a Ollama`，launchd 用 `kickstart -k`，Homebrew 用 `brew services`；systemd/普通进程只给命令，不自动执行。环境变量面板只写 `localStorage` 并生成 `ollama serve` 命令，不写系统环境。
- **依据/来源**：`server/daemon.ts`、`server/daemon.test.ts`、`src/api/daemon.ts`、`src/lib/daemonConfig.ts`、`src/screens/TelemetryScreen.tsx`、`RUNBOOK.md` 18。
- **理由**：重启/停止会中断推理与下载，且不同安装方式（App、launchd、brew、systemd）命令不同；默认自动执行风险过高。复制命令 + 可选显式开关既提供操作路径，又保留用户控制。
- **范围/风险**：真实重启/停止未执行；macOS 可能弹 Automation 权限；systemd 需要 sudo，未自动执行；Windows 未实现（R-047）。命令由受控字段拼接，不接受用户 shell 片段，但服务端仍具备执行能力，必须保持 `ALLOW_DAEMON_CONTROL` 默认关闭。

### D-138 系统指标使用 OS 能力，缺失时明确不可用

- **状态**：已确认（2026-10-28）。
- **内容**：`GET /api/metrics` 用 `fs.statfs` 读取模型目录所在文件系统的总量/可用/已用；用 `os` 读取内存、CPU 核心与 load；macOS 通过 `ioreg -r -d 1 -w 0 -c IOAccelerator` 读取 GPU 型号与 `Device Utilization %`，失败时返回 `unsupported-platform`/`command-failed`/`not-detected`/`utilization-unavailable`；ANE 固定 `available:false`，`reason:no-public-api`。遥测页每 5 秒读取，页面隐藏时暂停。
- **依据/来源**：`server/metrics.ts`、`server/metrics.test.ts`、`src/api/metrics.ts`、`src/screens/TelemetryScreen.tsx`、`RUNBOOK.md` 17。
- **理由**：Ollama 不提供 GPU/ANE/磁盘 API；用系统能力能给出真实磁盘与 Apple Silicon GPU 利用率，同时避免用 mock 数值冒充。ANE 没有公开利用率 API，明确写不可用比编造更可信。
- **范围/风险**：GPU 仅 macOS，`ioreg` 字段可能随系统版本变化；Linux/Windows 返回不可用；`os.freemem()` 是“空闲”而非 macOS inactive/cached 可用量，UI 使用“空闲”措辞；每 5 秒一次本地命令与读取，开销低但未做更长周期缓存（R-048）。

### D-139 README 采用英文主版本 + 中文并行版本

- **状态**：已确认（2026-10-28）。
- **内容**：`README.md` 改为英文主版本，作为 GitHub 默认入口；中文内容迁移到 `README.zh-CN.md`。两份文件头部互相链接（`English` / `简体中文`），内容保持同步。界面截图分语言存放：`docs/assets/screenshots/en/` 与 `docs/assets/screenshots/zh/`，均为浅色主题、演示数据。
- **依据/来源**：`README.md`、`README.zh-CN.md`、`AGENTS.md`、`PROJECT_INDEX.md`、`docs/context/MAP.md`。
- **理由**：仓库面向公开访问，英文 README 便于更广泛的读者快速理解项目；保留中文版本不丢失已有的详细说明。分语言截图避免英文主版本出现中文界面残留，浅色主题在 GitHub 与普通显示器上更易阅读。
- **范围/风险**：两份 README 需要同时维护，功能或验证状态变化时必须同步；截图依赖 mock 演示数据，不能当作真实设备或真实模型证据。

### D-140 缓存 orphan 默认不勾选，清理改为回收站

- **状态**：已确认（2026-10-29）。
- **内容**：修复 `server/cache.ts`：解析 `manifests-v2` symlink（`readlink`/`realpath`）、保护 manifest blob 自身、递归 manifest list、合并 `metadata/sha256-*.json` 的 digest；任何 manifest 解析失败、悬空 symlink 或越界目标都将 `scanComplete=false` 并拒绝 orphan（409）。`cleanCache(['orphan'])` 先重新扫描，将 orphan 通过同盘 `rename` 移入 `OLLAMA_MODELS/.ollama-studio-trash/<timestamp>-<id>/`，返回 `quarantinedBytes` 与 `quarantinePath`；移动失败只记录错误，不删除。UI 默认 `orphan:false`，勾选后二次确认，清理结果展示回收站路径。
- **依据/来源**：`server/cache.ts`、`server/cache.test.ts`、`src/api/cache.ts`、`src/screens/TelemetryScreen.tsx`、`RUNBOOK.md` 14；2026-10-28 两个模型误删事故（R-042）。
- **理由**：Ollama 0.40.7 的 v2 manifest 是 symlink，旧扫描只处理普通文件，导致模型 blob 被判 orphan；`rm` 没有恢复路径。默认关闭 + 回收站 + manifest/metadata 多层保护，把误判代价从“永久丢失”降为“可恢复”。
- **范围/风险**：回收站不自动清理，会暂时占用磁盘；metadata 保护可能让陈旧 metadata 对应的 blob 无法通过本功能回收；不提供 UI 一键恢复，需手动把 `sha256-*` 移回 `blobs/`；真实清理仍需用户确认。

### D-141 Hugging Face 下载改为服务端直下 GGUF

- **状态**：已确认（2026-10-29）。
- **内容**：新增 `server/huggingface.ts` 和 `/api/downloads` 的 `kind: "huggingface"` 任务。搜索结果从 HF `siblings` 返回 `files`，前端把量化映射到具体 GGUF；服务端用 Node `fetch` 请求 `https://huggingface.co/<repo>/resolve/<revision>/<file>?download=true`，跟随 302 到 CDN，流式写入临时目录后执行 `ollama create`。直接输入 `hf.co/<repo>:<quant>` 时前端改走同一任务；未提供文件路径时，服务端读取 HF API 文件列表并按量化解析。任务保留 `repo/file/quant/modelName`，允许刷新后接回、暂停后重试；模型名默认为 `<repo>:<quant>`。Catalog 的 HF 结果补充 `files`，并排除分片与 `mmproj`/`projector`，避免把投影层当成对话权重。
- **依据/来源**：`server/huggingface.ts`、`server/huggingface.test.ts`、`server/downloads.ts`、`src/api/catalog.ts`、`src/api/downloads.ts`、`src/App.tsx`、`src/screens/PullScreen.tsx`、`src/lib/downloadTask.ts`、`RUNBOOK.md` 13；2026-10-29 真实小文件下载 + 假 `ollama` CLI 验证，以及 CDP 验证 UI 请求体。
- **理由**：本机代理把 `huggingface.co` 与 CDN 解析到 `198.18.x.x` fake-IP；Ollama 自带 `hf.co` pull 会拒绝非公网重定向目标，但 Node `fetch` 可正常跟随到 CDN。把下载从 Ollama 客户端移到本地服务，既绕过该限制，也与 ModelScope 的服务端下载模式一致。
- **范围/风险**：依赖本机 Ollama CLI 执行 `ollama create`；单文件上限 20 GB；无断点续传，暂停后恢复会重新下载；分片 GGUF 与多模态 projector 不会自动拼接/下载；HF API 或 CDN 不可达时任务失败（R-024、R-049）。应用默认仍以 ModelScope 为第一渠道，HF 作为第二渠道。

### D-142 macOS 菜单栏封装采用 Swift/AppKit + 内置 Node 服务

- **状态**：已确认（2026-10-29）。
- **内容**：新增可选的 `macos/menu-bar/`：Swift `NSStatusItem` 菜单栏程序，内嵌 Node 运行时、esbuild 产物 `server.js` 与 `dist/`，启动时监听 `127.0.0.1:3210`，菜单提供打开 Web、打开日志、退出；`npm run build:menu` 构建 `.app` 与 DMG。前端与生产服务器保持不变，菜单栏 App 只是复用同一套 Web UI 的可选桌面入口。
- **依据/来源**：`macos/menu-bar/main.swift`、`build.sh`、`Info.plist`、`package.json`、`RUNBOOK.md` 19；用户要求“菜单栏图标 + 打开 Web + 退出 + 打包 DMG”。
- **理由**：不引入 Electron/Tauri，不改变现有 Web 形态；Swift 菜单栏壳体积小、常驻状态栏，浏览器继续承担主界面，下载、聊天等服务端能力可直接复用。
- **范围/风险**：仅 macOS；固定端口 3210；ad-hoc 签名、未公证、无登录项/自动更新；内置 `server/package.json` 必须声明 `{"type":"module"}`；未验证安装到 `/Applications`、Finder 启动代理继承与真实模型下载（R-050）。

## 待决策（尚未决定）

以下事项**不是已选型**，不要据此声称已决定。确认后把对应条目移入“已确认”，写明理由、范围和来源。

| ID | 事项 | 为什么需要决定 | 相关入口 |
| --- | --- | --- | --- |
| D-114 | Tauri 迁移触发条件与范围 | 当前只确认“将来可能”，未确认何时/是否真的迁移 | `RISKS.md` R-009 |
| D-131 | 端到端浏览器自动化（Playwright 等） | 当前只有 Vitest 与 headless DOM 冒烟，视觉、响应式、a11y 与多步交互仍靠人工 | `RISKS.md` R-015、R-021 |

## 记录格式

新增决策时使用以下字段，保持可追溯：

```text
### D-XXX 标题
- 状态：已确认 / 待确认 / 已替代
- 内容：
- 依据/来源：
- 理由：
- 范围：
- 备注：
```
