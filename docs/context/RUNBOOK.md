# RUNBOOK

> 有依据的操作、前置条件与验证步骤。执行对应操作前读；状态列是证据，不是承诺。
>
> 最后核验：2026-10-28；范围：`package.json`、`vite.config.ts`、`tsconfig.json`、`eslint.config.js`、`vitest.config.ts`、`.github/workflows/ci.yml`、`server.ts`、依赖安装、Ollama 代理、令牌鉴权、真实拉取/删除/克隆/创建、GGUF 上传、模型库搜索、会话/参数/下载任务持久化、构建与 headless DOM 冒烟。
>
> 命令已配置不等于执行成功；历史结果不等于当前证据；本文档中的步骤不构成执行授权。

## 状态标记

- **未执行**：没有运行记录，不能假设可用。
- **已执行（日期）**：有实际运行记录，附结果与证据。
- **失败（日期）**：已运行但未通过，附原因。
- **部分通过（日期）**：主路径可用，但有明确未覆盖项。
- **不适用**：当前阶段不需要或没有对应能力。

## 前置条件

- 在项目根目录执行命令（包含 `package.json` 的目录）。
- Node.js：`package.json` 未声明 `engines`；本次环境为 Node.js `v24.22.0`，仅作记录，不是最低版本要求。
- npm：本次为 `11.19.1`；已生成 `package-lock.json`（lockfileVersion 3）。
- Ollama：本次为 `0.40.7`，默认地址 `http://127.0.0.1:11434`；可通过 `OLLAMA_HOST` 覆盖。开发（Vite `loadEnv`）与生产（`dotenv/config`）都会读取 `.env`，进程环境优先。
- 网络：安装依赖需要访问 npm registry；字体与图标已本地打包，页面运行不再依赖 Google Fonts。
- **模型资源纪律**：除非验证目标必须依赖真实推理，否则只用 `/api/version`、`/api/tags`、`/api/ps` 或 mock NDJSON；需要加载模型时先说明原因，测试后用 `keep_alive: 0` 卸载并记录（`DECISIONS.md` D-106）。用户指定的测试模型为 `minicpm-v-4.7-1b-heretic:q4_k_m`（1B，Q4_K_M，约 0.67 GB）；优先用它，测试后必须卸载。

## 操作

### 1. 安装依赖

- 命令（本次实际使用）：`npm install --cache .npm-cache --no-audit --no-fund`
- 前置：项目根目录、Node/npm 可用、可访问 npm registry。
- 结果：**已执行（2026-10-27/28）通过**。初始安装 180 个包；后续新增 Vitest/ESLint/Prettier 等开发依赖与字体/图标包。
- 失败记录：直接 `npm install` 报 `EPERM`，路径 `~/.npm/_cacache/tmp`，原因是默认 npm 缓存包含 root-owned 文件。未执行 `sudo chown`；改用仓库内 `.npm-cache/` 绕过。
- 验证：`npm ls --depth=0` 可列出版本；锁文件存在。
- 备注：`.npm-cache/` 已加入 `.gitignore`；CI 使用默认缓存，不受本机权限问题影响（`RISKS.md` R-017）。

### 2. 类型检查

- 命令：`npm run typecheck`
- 实际执行：`tsc --noEmit`
- 前置：依赖已安装。
- 结果：**已执行（2026-10-28）通过**，退出码 0。`tsconfig.json` 已启用 `strict`。
- 备注：`npm run lint` 现在是 ESLint，不再承担类型检查；CI 同时运行两者。

### 3. Lint 与格式检查

- 命令：`npm run lint`、`npm run format:check`
- 实际执行：ESLint 10 flat config（typescript-eslint、react-hooks、react-refresh）+ Prettier 3。
- 结果：**已执行（2026-10-28）通过**，0 error、0 warning。
- 修复命令：`npm run lint:fix`、`npm run format`。
- 备注：E2E/组件测试未配置；`react-hooks/set-state-in-effect` 与 `purity` 因未启用 React Compiler 而关闭，其余 hooks 规则保留。

### 4. 单元测试

- 命令：`npm test`（监听：`npm run test:watch`；覆盖率：`npm run coverage`）
- 结果：**已执行（2026-10-28）通过**：7 个测试文件、59 个测试。
- 覆盖：NDJSON 分片/错误/中止、`pullModel`、`loadModel`/`unloadModel`（generate/embed/keep_alive）、模型映射、会话存储与 v1→v2 迁移、模型参数归一化、下载任务中断、GGUF 名称与空上传。
- 未覆盖：真实浏览器、真实 Ollama 流、真实模型加载/卸载、GGUF 成功导入（需 CLI）。

### 5. 生产构建

- 命令：`npm run build`
- 实际执行：`npm run build:web && npm run build:server`
- 前置：依赖已安装。
- 结果：**已执行（2026-10-28）通过**。
  - `dist/assets/index-*.css` 约 73.2 kB（gzip 约 16.1 kB）。
  - `dist/assets/index-*.js` 约 446.9 kB（gzip 约 121.4 kB）。
  - `server.js` 约 10.9 kB。
  - 字体与 Material Symbols woff2 作为 `dist/assets/*.woff2` 输出；Material Symbols 全量约 4 MB。
- 验证：退出码 0；`dist/` 与 `server.js` 存在。

### 6. 本地开发服务器与代理

- 命令：`npm run dev` → `vite --port=3000 --host=127.0.0.1`
- 局域网显式开放：`npm run dev:lan`（`0.0.0.0`，仅可信网络）。
- 本次验证使用：`npx vite --port 3001 --host 127.0.0.1`（3000 被既有进程占用，未终止该进程）。
- 结果：**已执行（2026-10-28）通过**。
  - `GET http://127.0.0.1:3001/` 返回 200 HTML。
  - `GET http://127.0.0.1:3001/ollama/api/version` 返回 `{"version":"0.40.7"}`。
  - `POST /api/import?filename=a.txt` 返回 400 `{"error":"仅支持 .gguf 文件。"}`。
  - headless Chrome 首屏渲染包含“本地模型生态库”与两个真实模型。
- 未覆盖：逐页点击、窄屏/键盘/屏幕阅读器。
- 安全：默认只绑定本机；`dev:lan` 无鉴权，仅在可信网络临时使用，用完停止进程。

### 7. 生产服务器与流式代理

- 命令：`PORT=3101 HOST=127.0.0.1 node server.js`
- 前置：已执行 `npm run build`；Ollama 已启动。
- 结果：**已执行（2026-10-28）通过**。
  - `GET /healthz` → `{"ok":true,"ollamaHost":"http://127.0.0.1:11434","authRequired":false}`。
  - `GET /ollama/api/version` → `{"version":"0.40.7"}`。
  - `GET /ollama/api/tags` → 真实模型列表（`minicpm-v-4.7-1b-heretic:q4_k_m`、`huihui_ai/qwen3.8-abliterated:27b-q4_K_L`）。
  - `GET /` → 200 HTML；headless Chrome 渲染出真实模型卡片。
- 资源处理：本次验证未加载模型；`/api/ps` 未产生测试负载。测试后进程已停止。
- 未覆盖：客户端中途断开、上游超时、非 NDJSON 错误体。

### 8. 代理令牌鉴权

- 命令：`PORT=3102 HOST=127.0.0.1 PROXY_TOKEN=test-secret node server.js`
- 结果：**已执行（2026-10-28）通过**。
  - `/healthz` → `authRequired:true`。
  - 无令牌 `GET /ollama/api/version` → 401。
  - `Authorization: Bearer test-secret` → 200。
  - 无令牌 `POST /api/import` → 401。
  - 带令牌 `POST /api/import?filename=a.txt` → 400（通过鉴权，进入文件校验）。
- 备注：令牌只保护 `/ollama/*` 与 `/api/import`；`/api/catalog`、`/api/hf` 是只读无鉴权代理。`VITE_PROXY_TOKEN` 构建时嵌入前端，属于共享密钥（`RISKS.md` R-025）。测试后进程已停止。

### 9. 真实模型与交互验证（2026-10-28 历史记录）

- **用户指定模型**：`hf.co/saidutta69/MiniCPM-V-4.7-1B-heretic:Q4_K_M`。
- **HF 拉取失败**：`POST /api/pull` 约 70 秒后返回 `max retries exceeded ... redirect target not allowed: us.aws.cdn.hf.co resolves to non-public 198.18.0.85`。本机 DNS 被代理改写，Ollama 拒绝非公网重定向目标。
- **本地导入替代**：用 `curl -L` 从 Hugging Face 下载同一 GGUF（641 MB），执行 `ollama create minicpm-v-4.7-1b-heretic:q4_k_m -f <Modelfile>`；模型大小 672 MB。
- **真实对话**：`POST /api/chat` 返回 `thinking` 与正文；测试后 `ollama stop`，`/api/ps` 为空。
- **删除/克隆、Modelfile 构建、GGUF 上传、遥测**：均已实测；临时模型已删除。
- **未覆盖**：模型参数写回、多会话、真实 HF 网络下载成功路径（本次已实现参数默认值/多会话，但未做完整 UI 人工验收）。

### 10. 预览构建产物

- 命令：`npm run preview`
- 前置：已成功执行生产构建；`dist/` 存在。
- 状态：**未执行**。
- 备注：生产形态由 `server.js` 覆盖，预览不是必需路径。

### 11. 清理构建产物

- 命令：`npm run clean`
- 实际执行：`rm -rf dist server.js coverage`
- 状态：**未执行**。
- 注意：这是删除操作；只在明确需要清理构建产物时执行。

## Ollama 连通性检查

- 版本：`curl -s http://127.0.0.1:11434/api/version` → `0.40.7`。
- 模型列表：`curl -s http://127.0.0.1:11434/api/tags` → 两个模型；1B 模型 `context_length=262144`，`capabilities=["tools","thinking","completion"]`。
- 运行状态：`curl -s http://127.0.0.1:11434/api/ps` → 当前为空。
- 代理版本/模型：`curl -s http://127.0.0.1:3101/ollama/api/{version,tags}`（生产测试期间）→ 与上游一致。

## 手动验收清单（未执行）

- [ ] Models：分类/搜索/网格列表、参数修改后刷新仍保留、加载/释放显存并核对 `/api/ps`。
- [ ] Pull：真实拉取、暂停/继续/取消、刷新后中断提示、GGUF 上传（非 `.gguf`/空文件/CLI 缺失）。
- [ ] Chat：多会话创建/切换/重命名/删除、刷新恢复、代码块复制、停止生成、思考折叠、JSON/人设、错误提示。
- [ ] Modelfile：构建、成功提示、测试对话、空模型状态。
- [ ] Telemetry：连接状态、模型/显存统计、事件日志、daemon 界面配置保存。
- [ ] 全局：明暗模式、五套强调色、中英切换、⌘K、移动端底部导航、键盘焦点、窄屏布局。
- [ ] 资源：加载模型后必须卸载；记录 `/api/ps`。

## 模型测试记录与纪律

- 2026-10-27：为验证流式代理与 `streamChat` 解析，加载了 `huihui_ai/qwen3.8-abliterated:27b-q4_K_L`（约 21.8 GB），完成后用 `keep_alive:0` 卸载。
- 2026-10-28：真实对话使用 1B 小模型，测试后 `ollama stop`，`/api/ps` 为空。
- 用户明确要求：**没有必要不要启动本地模型，电脑会卡**。后续默认遵守：
  - 只读接口用 `/api/version`、`/api/tags`、`/api/ps` 验证，不加载模型。
  - 流式解析用 mock NDJSON 或单元测试验证，不加载模型。
  - 必须真实推理时，先说明原因、限制 `num_predict`、测试后卸载并记录。
- 当前 `/api/ps` 为空；没有常驻测试模型。

## Git 与发布

- 2026-10-28：`git init -b main`，创建本地基线提交 `6198c59`；未推送、未创建远端。
- 远端、tag、发布流程：**未执行**（无远端仓库）。
- 许可证：Apache-2.0（`LICENSE`）。

## 文档变更检查清单

- [x] 只改本次任务允许的文件；业务代码、依赖、构建与代理验证均有记录。
- [x] 相对链接指向存在的文件；新增/移动文件后已同步 `PROJECT_INDEX.md`、`MAP.md`。
- [x] 每类事实只有一个权威来源；其他位置是摘要和链接。
- [x] 已确认决策、待决策、风险、计划、事实没有混写。
- [x] 未执行的操作标注“未执行”；没有把配置或历史结果写成当前证据。
- [x] 没有写入密钥、令牌或个人设备私有路径（测试令牌 `test-secret` 仅用于本地验证）。
- [x] 核验日期与范围已注明。
- [x] 模型测试遵循资源纪律；本次验证未加载模型。

## 执行记录模板

后续执行操作时，把记录追加到对应小节，或在本节保留最近一次结果：

```text
- 日期：
- 操作：
- 命令：
- 结果：通过 / 失败 / 部分通过
- 证据：退出码、关键输出、截图或产物路径
- 备注：
```
