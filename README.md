# Ollama Studio

面向 Ollama 本地模型的 macOS 风格模型管理与对话界面。模型列表、运行状态、流式对话、拉取、删除/克隆、Modelfile 构建与 GGUF 导入都调用本机 Ollama；会话、模型参数与下载任务元数据保存在浏览器本地。

> 实时状态与下一步见 [`docs/context/NOW.md`](docs/context/NOW.md)；已知风险见 [`docs/context/RISKS.md`](docs/context/RISKS.md)。

## 项目定位

Ollama Studio 把本地模型的日常操作集中到一个界面里：浏览和筛选模型、拉取与量化选择、对话与参数调节、用 Modelfile 派生模型、查看守护进程与推理遥测。界面按 Material 3 Expressive 风格实现，支持明暗主题、五套强调色和中英双语。

当前是**可运行的 Web 应用**。默认只监听本机；如需局域网访问，可显式开启并配置共享令牌。

## 当前状态（核验于 2026-10-28）

- 已接入 `GET /api/version`、`GET /api/tags`、`GET /api/ps`、`POST /api/chat`（NDJSON 流式）、`POST /api/pull`（NDJSON 进度）、`DELETE /api/delete`、`POST /api/copy`、`POST /api/create`，以及 `ollama create` GGUF 导入。
- 聊天支持流式输出、停止生成、思考内容折叠、温度/topP/num_ctx、JSON 模式、系统人设、错误展示与**每模型多会话**（创建/切换/重命名/删除）。
- 回复中的 fenced code block 会渲染为独立代码块并支持复制。
- 模型参数按模型保存为**对话默认值**（`localStorage`），不会修改模型权重；显存“加载/释放”通过 `keep_alive` 调用真实 API。
- 拉取任务显示真实层状态、速度、剩余时间与进度，可暂停/继续/取消；刷新后未完成任务标记为中断，需显式继续。
- 模型库关键字搜索支持 **Hugging Face** 与 **Ollama 官方**；HF 量化标签由文件名推断。
- 遥测页显示真实连接状态、版本、模型/显存统计与事件日志；Ollama 不提供的 GPU/ANE/磁盘指标改为只读说明。
- 代理默认绑定 `127.0.0.1`；可选 `PROXY_TOKEN` 保护 `/ollama/*` 与 `/api/import`。
- 字体与 Material Symbols 已自托管，不再依赖 Google Fonts。
- 工程化：TypeScript `strict`、ESLint、Prettier、Vitest（59 个测试）、GitHub Actions CI。
- 已用 headless Chrome 对开发/生产首屏、真实模型列表与代理做冒烟验证；**未做完整逐页人工视觉/a11y 验收**。
- Hugging Face 直拉仍受本机 DNS 限制；需要正常网络或本地 GGUF 导入。

详细状态、阻塞和下一步见 [`docs/context/NOW.md`](docs/context/NOW.md)。

## 功能一览

| 模块 | 已实现 | 尚未实现 / 边界 |
| --- | --- | --- |
| 模型库 | 真实模型列表、卡片/列表、分类、搜索、参数默认值持久化、真实删除/克隆、加载/释放显存 | 参数不写入模型文件；导出 GGUF 无 API，按钮禁用 |
| 发现拉取 | CLI 输入、量化选择、精选模型、HF/Ollama 搜索、真实 `/api/pull` 进度、暂停/继续/取消、GGUF 上传 | HF 量化由文件名推断；GGUF 导入依赖本机 `ollama` CLI；HF 下载受网络限制 |
| 即时对话 | 真实流式 `/api/chat`、停止、思考折叠、参数、JSON、人设、错误提示、多会话、代码块复制 | 附件上传未实现（按钮禁用）；无 E2E 测试 |
| Modelfile 实验室 | 可视化生成 `FROM` / `PARAMETER` / `SYSTEM`、预设、真实 `/api/create`、测试对话 | 参数编辑不会同步到已有模型 |
| 监控与设置 | 真实连接/版本/模型/显存统计、事件日志、模型存储卡片、配置持久化 | Ollama 不提供 GPU/ANE/磁盘 API；服务停止/重启/GC 为只读说明 |
| 全局 | ⌘K 命令面板、主题调色盘、中英切换、明暗模式、移动端底部导航 | 仍需人工窄屏/a11y 验收 |

## 技术栈

- React 19 + TypeScript 6 + Vite 8 单页应用
- Tailwind CSS v4（通过 `@tailwindcss/vite`）
- 自建 `ThemeContext` 管理主题、强调色、语言；无路由库、无全局状态库
- 开发代理：Vite `server.proxy`（`/ollama`、`/api/catalog`、`/api/hf`）
- 生产服务：Express 4 + esbuild 打包的 `server.js`
- 测试与质量：Vitest、ESLint 10（flat config）、Prettier、GitHub Actions
- 字体/图标：`@fontsource-variable/*`、`material-symbols`（本地打包）

版本以 `package.json` / `package-lock.json` 为准，完整映射见 [`docs/context/MAP.md`](docs/context/MAP.md)。

## 快速开始

前置：Node.js、npm，以及本机运行的 Ollama（默认 `http://127.0.0.1:11434`）。GGUF 文件上传还需要运行服务的机器能执行 `ollama` CLI。在项目根目录执行：

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`。开发服务器默认只监听本机。

如果 `npm install` 因默认缓存权限报 `EPERM`，使用仓库内缓存：

```bash
npm install --cache .npm-cache --no-audit --no-fund
```

### 配置 Ollama 地址

复制 `.env.example` 为 `.env`，按需修改（开发与生产都会读取；进程环境优先）：

```bash
OLLAMA_HOST=http://127.0.0.1:11434
PORT=3000
HOST=127.0.0.1
```

前端默认走同源 `/ollama` 代理，不需要浏览器直连 Ollama。只有浏览器能直接访问 Ollama 时，才设置 `VITE_OLLAMA_BASE_URL`。

### 局域网访问与共享令牌

默认只允许本机访问。需要同一可信网络访问时：

```bash
# 生产：设置共享令牌后再绑定非 loopback
PROXY_TOKEN=change-me HOST=0.0.0.0 npm start

# 前端构建时必须使用相同令牌
VITE_PROXY_TOKEN=change-me npm run build
```

`PROXY_TOKEN` 保护 `/ollama/*` 与 `/api/import`；未设置时代理无鉴权。`VITE_PROXY_TOKEN` 会嵌入前端产物，属于共享密钥，不是用户级认证；跨网段使用请再加反向代理与 TLS。开发时可用 `npm run dev:lan` 显式开放，仅限可信网络。

### 生产运行

```bash
npm run build
npm start
```

`npm run build` 同时构建 `dist/` 与 `server.js`；`npm start` 默认监听 `127.0.0.1:3000`，静态托管前端并把 `/ollama/*` 流式转发到 `OLLAMA_HOST`。

### 可用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器，`127.0.0.1:3000` |
| `npm run dev:lan` | 显式绑定 `0.0.0.0:3000`（仅可信网络） |
| `npm run build` | 构建 `dist/` + `server.js` |
| `npm run build:web` / `build:server` | 仅构建前端 / 仅打包服务端 |
| `npm start` | 运行生产服务器 |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint 检查 / 自动修复 |
| `npm run format` / `format:check` | Prettier 格式化 / 检查 |
| `npm test` / `test:watch` / `coverage` | Vitest 测试 / 监听 / 覆盖率 |
| `npm run clean` | 删除 `dist/`、`server.js`、`coverage/` |

前置条件、产物、验证步骤和执行状态见 [`docs/context/RUNBOOK.md`](docs/context/RUNBOOK.md)。

## 验证状态

- `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test`（59 个测试）、`npm run build`：2026-10-28 全部通过。
- 生产服务器（3101）与开发服务器（3001）：`/healthz`、`/ollama/api/version`、`/ollama/api/tags`、`/api/import` 校验与 headless Chrome 首屏渲染通过。
- 代理令牌：无令牌 401、Bearer 令牌 200、`/api/import` 无令牌 401，均已验证。
- **未执行**：真实 UI 中的模型加载/卸载、完整逐页视觉/窄屏/a11y 验收、GitHub Actions 远端运行、正常网络下的 HF 直拉。

## 文档

| 文档 | 用途 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 协作规则、读取/写入约束、验证要求 |
| [`PROJECT_INDEX.md`](PROJECT_INDEX.md) | 任务到文件/章节的路由 |
| [`docs/context/NOW.md`](docs/context/NOW.md) | 当前目标、进展、阻塞、下一步 |
| [`docs/context/MAP.md`](docs/context/MAP.md) | 目录、版本、配置、部署关系 |
| [`docs/context/RUNBOOK.md`](docs/context/RUNBOOK.md) | 操作步骤、前置条件、执行状态 |
| [`docs/context/DECISIONS.md`](docs/context/DECISIONS.md) | 已确认决策与待决策 |
| [`docs/context/RISKS.md`](docs/context/RISKS.md) | 风险、验证缺口、保护措施 |
| [`docs/context/history/README.md`](docs/context/history/README.md) | 历史归档索引 |

## 来源与设计参考

- 原始 AI Studio 应用：https://ai.studio/apps/9ab4837f-c57f-4777-a911-4ac097c9b6ee
- 原 `README.md` 为 AI Studio 导出模板；2026-10-27 重写为项目说明，保留原始应用链接与本地运行步骤。
- `public/assets/aistudio/` 保存设计参考（截图、HTML、Material 3 色彩 token），当前未被应用代码引用。

## 许可

Apache License 2.0，见 [`LICENSE`](LICENSE)。
