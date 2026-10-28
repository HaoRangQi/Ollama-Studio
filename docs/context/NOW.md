# NOW

> 当前状态快照。接续任务先读这里；稳定事实见 `README.md` / `MAP.md`，决策见 `DECISIONS.md`，风险见 `RISKS.md`。
>
> 更新日期：2026-10-28
> 核验对象：仓库根目录、`src/`、`server/`、`server.ts`、`vite.config.ts`、`package.json`、`tsconfig.json`、测试与 CI 配置、`docs/context/`
> 更新范围：完成第三阶段工程化与功能收口：Vitest/ESLint/Prettier/strict/CI、依赖清理、模型参数默认值与显存 keep_alive、多会话、代码块渲染、i18n 补全、空模型状态、下载任务持久化、GGUF CLI 预检、可选代理令牌、开发服务器回环绑定、字体自托管、Apache-2.0 与 Git 基线。未做完整人工视觉/a11y 验收；未在真实 UI 点击验证模型加载/卸载。

## 当前目标

把 Ollama Studio 从 UI 设计原型推进为可用的本地 Ollama 管理与对话应用，并按标准软件仓库维护。当前形态为 **Web 优先**；将来若需要桌面能力，再评估 Tauri（`DECISIONS.md` D-101）。

## 本轮进展

已完成：

### 工程基础

- [x] 添加 Vitest（Node 环境）与 59 个测试：NDJSON 分片/错误/中止、`streamChat`/`pullModel`、`loadModel`/`unloadModel`、映射、会话迁移/增删改、模型参数校验、下载任务中断、GGUF 名称与空上传。
- [x] 添加 ESLint 10 flat config、Prettier 3，`npm run lint`、`format:check` 通过；开启 TypeScript `strict`。
- [x] 添加 `.github/workflows/ci.yml`：`npm ci` → `typecheck` → `lint` → `format:check` → `test` → `build`（尚未在 GitHub 实际运行）。
- [x] 移除未使用依赖 `@google/genai`、`lucide-react`、`motion`、`tsx`、`autoprefixer`；`metadata.json` 移除 Gemini 能力声明；包名改为 `ollama-studio`，版本 `0.1.0`。
- [x] TypeScript 固定 `6.0.3`（typescript-eslint peer 要求 `<6.1.0`；TS 7 会 ERESOLVE）。
- [x] 字体与 Material Symbols 通过 npm 自托管，移除 Google Fonts 外链。

### 功能接线

- [x] 模型参数按模型保存到 `ollama_model_settings_v1`，作为对话默认值；Models 页与 Chat 参数面板共用；UI 注明“不修改模型权重”（D-125）。
- [x] 显存加载/释放改为真实 `/api/generate`（embedding 用 `/api/embed`）的 `keep_alive: -1 / 0`，完成后刷新 `/api/ps`；失败有 toast。
- [x] 聊天会话升级为 v2 多会话（`ollama_chat_sessions_v2`）：创建、切换、重命名、删除，自动迁移 v1；按模型保存 active session（D-129）。
- [x] 回复中的 fenced code block 解析为独立代码块，支持逐块复制；移除对静态 `codeSnippet` 的依赖（仍兼容旧数据）。
- [x] 流式完成后显示真实 `eval_count/eval_duration` 计算的 tok/s；移除假 “48.2 tok/s”“Metal 3 Turbo”和假内存/KV/温度。
- [x] 空模型状态：在线且 0 模型时 `selectedModel`/`chatModel` 置空，Models/Chat/ModelfileLab 显示空状态与拉取入口。
- [x] 下载任务元数据持久化到 `ollama_download_task_v1`；刷新后标记“上次任务已中断，可继续”，取消时清除记录（D-130）。
- [x] GGUF 导入在上传非空后预检 `ollama --version`，CLI 缺失返回 503；空文件/非 `.gguf` 在 CLI 预检前返回 400。
- [x] 可选代理令牌：`PROXY_TOKEN` + `VITE_PROXY_TOKEN` 保护 `/ollama/*` 与 `/api/import`；无令牌 401、Bearer 200 已实测。
- [x] 开发服务器默认 `127.0.0.1:3000`；新增 `dev:lan` 显式开放并文档警告。
- [x] i18n 收口：聊天、模型、拉取、Modelfile、遥测、Command Palette、Pull/Quant 弹窗的主要文案按语言切换；移除假版本号/假 GPU/假通知。
- [x] 移动端底部导航、`lg` 断点布局、`:focus-visible` 与减少动态效果样式；图标按钮补 `aria-label`。
- [x] 模型库搜索与本地精选分区：搜索时只显示搜索结果并隐藏“本地精选分类”，清空或点击“返回本地精选”后恢复精选列表；分类 chips 不再暗示会筛选远程结果。
- [x] 命令面板支持点击遮罩、右上角 X、Esc 三种关闭方式；聊天输入框移除无效附件按钮、缩短占位文案、改为容器聚焦环，并支持拖拽或方向键调整高度、双击恢复自动高度，高度写入 `ollama_chat_input_height_v1`。
- [x] ⌘K 现在可以从任意页面打开命令面板（此前只能关闭）。
- [x] 导出 GGUF、深度清理、附件入口在无 API 时禁用并说明原因，不再显示假成功 toast。

### 验证与仓库

- [x] `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test`、`npm run build` 全部通过（2026-10-28）。
- [x] 构建体积：前端 JS 约 449.5 kB（gzip 122.2 kB），CSS 约 73.2 kB（gzip 16.1 kB），`server.js` 约 10.9 kB；字体/图标为本地资源（Material Symbols woff2 约 4 MB）。
- [x] 生产服务器 3101：`/healthz`、`/ollama/api/version`、`/ollama/api/tags`、首屏 headless Chrome 通过。
- [x] 开发服务器 3001：首屏、代理、`/api/import` 400 校验、headless Chrome 通过。
- [x] 令牌服务器 3102：`/healthz authRequired:true`、无令牌 401、Bearer 200、`/api/import` 无令牌 401、带令牌非法文件 400。
- [x] 添加 Apache-2.0 `LICENSE`；初始化 Git（`main`）并创建本地基线提交 `6198c59`，不推送。
- [x] 同步 `README.md`、`PROJECT_INDEX.md`、`MAP.md`、`RUNBOOK.md`、`DECISIONS.md`、`RISKS.md`、`NOW.md`。

未开始 / 仍未验证：

- [ ] 完整人工视觉/窄屏/a11y 验收（逐页点击、键盘、屏幕阅读器）。
- [ ] 真实 UI 中的模型加载/释放（`keep_alive`）与 `/api/ps` 状态变化；当前只有请求级单测。
- [ ] 正常网络下 HF 直拉成功路径（本机 DNS 仍把 CDN 解析为 `198.18.0.85`）。
- [ ] GitHub Actions 首次远端运行（无远端仓库）。
- [ ] Tauri 迁移触发条件（D-114，仍待决策）。
- [ ] 图标子集化（Material Symbols 全量约 4 MB）。
- [ ] 发布流程/远端仓库/版本 tag（无远端，未执行）。

## 阻塞与待确认

| 事项 | 影响 | 入口 |
| --- | --- | --- |
| HF 拉取被本机 DNS/代理阻断 | `us.aws.cdn.hf.co` 解析为 `198.18.0.85`，Ollama 报 `redirect target not allowed`；搜索可用，下载失败 | `RISKS.md` R-024、`RUNBOOK.md` 5.1 |
| 无远端 Git / CI 未实际运行 | 无法观察 GitHub Actions、无协作与发布基线 | `RISKS.md` R-005、R-029 |
| 代理令牌为共享密钥 | `VITE_PROXY_TOKEN` 进入前端产物；无 TLS/限流/审计 | `RISKS.md` R-025、D-126 |
| 人工验收未完成 | 视觉、窄屏、a11y、多步交互问题可能漏过 | `RISKS.md` R-015、R-021、D-131 |
| 真实加载/卸载未点击验证 | keep_alive 与 `/api/ps` 的 UI 反馈未覆盖 | `RISKS.md` R-028 |
| npm 默认缓存权限 `EPERM` | 直接 `npm install` 失败；当前使用 `.npm-cache/` 绕过 | `RISKS.md` R-017 |
| 模型库搜索依赖外部目录 | ollama.com HTML 结构、HF JSON API 与文件名量化推断 | `RISKS.md` R-022、R-023 |

## 下一步（建议顺序）

1. 人工验收：逐页检查 Models / Pull / Chat / Modelfile / Telemetry，重点看窄屏、键盘、主题/语言、多会话、代码块复制、空模型。
2. 用 1B 小模型 `minicpm-v-4.7-1b-heretic:q4_k_m` 在真实 UI 点击“加载到显存/释放显存”，核对 `/api/ps`，结束后确保卸载。
3. 在正常网络复测 HF 直拉；失败则保留 GGUF 下载 + `ollama create` 指引。
4. 创建远端仓库后观察 CI；再决定 D-114（Tauri）与 D-131（Playwright/axe）。
5. 视需要做图标子集化、npm 缓存权限修复与发布流程。

> 以上是建议，不是已确认决策；执行前先在 `DECISIONS.md` 中确认。

## 证据入口

- API 客户端、拉取/删除/克隆/创建、加载/释放、令牌头：`src/api/ollama.ts`
- 数据映射：`src/api/ollamaMapper.ts`
- 模型库搜索：`src/api/catalog.ts`、`src/screens/PullScreen.tsx`
- 拉取任务与写操作：`src/App.tsx`、`src/screens/PullScreen.tsx`、`src/screens/ModelsScreen.tsx`
- 会话/参数/下载任务持久化：`src/lib/chatSessions.ts`、`src/lib/modelSettings.ts`、`src/lib/downloadTask.ts`
- 代码块解析：`src/lib/markdown.ts`
- 聊天 UI：`src/screens/ChatScreen.tsx`
- Modelfile 创建：`src/screens/ModelfileLabScreen.tsx`
- 遥测：`src/screens/TelemetryScreen.tsx`、`src/hooks/useOllama.ts`
- 开发代理与令牌：`vite.config.ts`
- GGUF 导入：`server/importGguf.ts`、`server.ts`、`vite.config.ts` 的 `/api/import`
- 生产代理、鉴权与静态托管：`server.ts`
- 测试与 CI：`src/**/*.test.ts`、`server/**/*.test.ts`、`vitest.config.ts`、`.github/workflows/ci.yml`
- 构建与脚本：`package.json`、`tsconfig.json`、`eslint.config.js`、`.prettierrc.json`
- 执行记录与验证命令：`RUNBOOK.md`
- 已知风险：`RISKS.md`
