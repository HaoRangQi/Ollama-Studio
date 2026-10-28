# RUNBOOK

> 有依据的操作、前置条件与验证步骤。执行对应操作前读；状态列是证据，不是承诺。
>
> 最后核验：2026-10-29；范围：`package.json`、`vite.config.ts`、`tsconfig.json`、`eslint.config.js`、`vitest.config.ts`、`.github/workflows/ci.yml`、`server.ts`、依赖安装、Ollama 代理、令牌鉴权、真实拉取/删除/克隆/创建、GGUF 上传、模型库搜索、后台下载任务、缓存扫描/清理（fixture + 真实目录只读）、UI 状态轮询、会话/参数/下载任务持久化、构建与 headless DOM 冒烟。2026-10-28 真实缓存清理事故见 14 与 `RISKS.md` R-042；2026-10-29 新增 Hugging Face 服务端直下验证（见 13）与菜单栏 App 打包验证（见 19）。
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
- 结果：**已执行（2026-10-27/28）通过**。初始安装 180 个包；后续新增 Vitest/ESLint/Prettier 等开发依赖与字体/图标包。2026-10-28 用 `npm ci --cache .npm-cache --no-audit --no-fund` 按锁文件干净安装，added 299 packages，随后全量验证通过。
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
- 结果：**已执行（2026-10-29）通过**：15 个测试文件、133 个测试。
- 覆盖：NDJSON 分片/错误/中止、`pullModel`、`loadModel`/`unloadModel`（generate/embed/keep_alive）、模型映射、会话存储与 v1→v2 迁移、模型参数归一化、下载任务中断与失败任务 source 持久化、GGUF 名称与空上传、附件类型判定与 base64 转换、ModelScope URL/量化映射、Hugging Face URL/文件解析/下载管线（mock `ollama create`）、缓存扫描与清理安全边界、逐文件明细与文件管理器定位路径校验、GGUF manifest 解析/model/projector 导出/重名与目录校验、磁盘指标与 ioreg GPU 解析、launchd/ps/pgrep 解析与 daemon 命令构建、`ollama serve` 命令生成。
- 未覆盖：真实浏览器、真实 Ollama 流、真实模型加载/卸载、GGUF 成功导入（需 CLI）、真实视觉模型推理与视频解码兼容性。

### 5. 生产构建

- 命令：`npm run build`
- 实际执行：`npm run build:web && npm run build:server`
- 前置：依赖已安装。
- 结果：**已执行（2026-10-29）通过**。
  - `dist/assets/index-*.js` 约 525.5 kB（gzip 约 142.8 kB）。
  - `dist/assets/index-*.css` 约 80.1 kB（gzip 约 17.2 kB）。
  - `server.js` 约 77.9 kB。
  - 字体与 Material Symbols woff2 作为 `dist/assets/*.woff2` 输出；Material Symbols 全量约 4 MB。
  - Vite 提示部分服务端导入未带扩展名、前端 chunk 超过 500 kB；构建仍通过，未在本轮处理。
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
- 搜索/精选分区补充验证（2026-10-28）：Chrome DevTools Protocol 在开发服务器 3000 操作——进入“发现拉取”，输入 `qw` 并点击“搜索 Hugging Face”后，页面显示“Hugging Face 搜索结果”和“返回本地精选”，隐藏“本地精选分类”与精选卡片；点击返回后恢复精选列表与分类标签。截图临时保存在 `/tmp`，未提交。
- 命令面板与聊天输入框补充验证（2026-10-28）：CDP 在 1440×1100 视口操作——点击遮罩、右上角关闭按钮、Esc 均可关闭命令面板；聊天输入框无附件按钮，占位文案为“输入消息…”，`scrollHeight === clientHeight`（无内部滚动条）。截图临时保存在 `/tmp`，未提交。
- 可调输入框补充验证（2026-10-28）：CDP 拖拽顶部手柄把 textarea 从 23px 调到 143px，输入 12 行文本后高度保持 143px 且出现滚动；刷新后高度仍为 143px（`ollama_chat_input_height_v1`）；双击手柄恢复 23px 并清除存储键。
- 输入框默认高度与横向滚动条补充验证（2026-10-28）：新会话空内容时 textarea 高度为 96px，`scrollWidth === clientWidth`（824/824），`overflow-x: hidden`；拖到 236px 后仍无横向溢出；输入 12 行后 `scrollHeight 273 > clientHeight 236`（仅纵向滚动）；双击手柄恢复自动高度 200px（内容较多）并清除手动高度。
- 图片/视频附件验证（2026-10-28）：CDP 通过 `DOM.setFileInputFiles` 同时选择一张 PNG 和一段 1 秒 WebM；待发送缩略图为 2 个，视频标记“视频 · 3”，发送按钮可用；点击发送后，页面内 mock 的 `/api/chat` 捕获最后一条 user message 的 `images` 为 4（1 张图片 + 3 个视频帧），`content` 为默认“请描述这些附件的内容。”；用户消息显示 2 个附件，`ollama_chat_sessions_v2` 包含 `attachments`。**未执行真实视觉模型推理**。
- 网格/列表切换验证（2026-10-28）：CDP 在模型库点击“列表视图”——容器类名由 `grid grid-cols-1 sm:grid-cols-2` 变为 `flex flex-col`；两张真实模型卡片的 `top` 从相同（638/638）变为堆叠（638/871）；再点“网格视图”恢复两列。
- 显存单位验证（2026-10-28）：CDP 注入 mock `/api/version`、`/api/tags`、`/api/ps`（`size_vram: 926000000`）后刷新——侧栏与遥测页均显示 `926 MB`，不再出现 `926.0 GB`。未加载真实模型。
- 自定义调色盘验证（2026-10-28）：CDP 设置取色器为 `#22c55e`——根元素 `--primary-accent` 变为 `#22c55e`、`--primary-glow` 变为 `rgba(34, 197, 94, 0.45)`；`localStorage` 写入 `ollama_accent_palette=custom` 与 `ollama_custom_accent=#22c55e`；弹窗显示“自定义调色盘”区块与选中色板。
- 搜索结果列表补充验证（2026-10-28）：CDP 在 1600×1300 视口搜索 `qwen`——首屏 6 条长条卡片、4 个页码、范围文本 `1–6 / 24`；点击页码 2 后首条结果变化且 `aria-current=2`；展开量化标签从 8 个变为 12 个。截图临时保存在 `/tmp`，未提交。
- 每页条数补充验证（2026-10-28）：CDP 切换 `每页` 选择器——6 条/4 页、12 条/2 页、24 条/1 页（页码隐藏）、再回 6 条/4 页；每次范围文本同步更新，`ollama_catalog_page_size_v1` 依次为 12/24/6。截图临时保存在 `/tmp`，未提交。
- 量化选中与行内下载补充验证（2026-10-28）：CDP 在搜索结果中点击 `Q4_1`，`aria-pressed=true`，计算背景为 `rgb(121, 82, 236)`（主题强调色）；“下载 Q4_1”触发 `/api/pull`（测试时用页面内 mock NDJSON，未发起真实下载），任务卡显示 `hf.co/unsloth/Qwen3.8-27B-GGUF:Q4_1`、toast 出现，页面滚动到任务卡附近（`scrollY≈115`）。“仅填入命令”保留只填 CLI 的行为。
- 下载任务卡失败态排版验证（2026-10-28）：CDP 注入含 800+ 字符长错误的 mock 任务后刷新——修复前“速率:”标签被压成 25×33 px（折成两行）、胶囊宽 107 px、错误区高 83 px；修复后标签 25×17 px 单行、胶囊 108×34 px、错误区 2 行截断并显示“展开完整错误”。展开后错误区 5 行 83 px、按钮变“收起”，收起后回到 2 行；900 px 与 640 px 视口下标签仍为 17 px 单行，`scrollWidth === clientWidth` 无横向溢出。修改点：左侧容器补 `min-w-0 flex-1`、右侧容器补 `shrink-0`、速率胶囊补 `whitespace-nowrap`、错误段落改 `line-clamp-2` + `break-all` + 展开开关。截图临时保存在 `/tmp`，未提交。
- HF 服务端直下 UI 验证（2026-10-29，生产服务器 3102/3103 + CDP，1600×1200）：在“发现拉取”选择 Hugging Face，搜索 `qwen3.5-0.8b`，选中 `unsloth/Qwen3.5-0.8B-GGUF` 的 `Q4_K_M` 后点击“下载 Q4_K_M”，拦截到 `POST /api/downloads` body 为 `{"kind":"huggingface","repo":"unsloth/Qwen3.5-0.8B-GGUF","file":"Qwen3.5-0.8B-Q4_K_M.gguf","quant":"Q4_K_M","model":"unsloth/Qwen3.5-0.8B-GGUF:Q4_K_M"}`，`/api/pull` 调用 0 次，任务卡出现且显示“下载后由 ollama create 注册”。在同一页面把顶部输入改为 `hf.co/unsloth/Qwen3.5-0.8B-GGUF:Q4_K_M` 后点击“拉取权重 Run”，同样发送 `kind:"huggingface"`，未带 `file`（服务端按量化解析）；未发起真实下载。截图临时保存在 `/tmp`，未提交。
- HF 直拉被 DNS 阻断后的本地导入（2026-10-28）：`dig us.aws.cdn.hf.co` 仍为 `198.18.0.85`，Ollama 直拉必然失败（R-024）。改用 `curl -L` 下载同一 URL 可正常返回 200（content-length 688066496），下载后 `shasum -a 256` 与 HF tree API 的 `lfs.oid` 一致（`b1c3bf2995e9…`）。执行 `ollama create <name> -f Modelfile`（`FROM <本地路径>`）导入成功，`ollama show` 显示 llama 架构 / 1.1B / 131072 上下文 / Q4_K_M / capabilities `tools, thinking, completion`；`/api/chat` 带 `think: true` 返回 `message.thinking` 与 `message.content`，实测 85–105 tok/s。测试后 `keep_alive: 0` 卸载，`/api/ps` 为空。**注意**：`num_predict` 过小（如 120）时 thinking 会耗尽预算导致 `content` 为空；应用不设 `num_predict`，不受影响。
- 模型卡动作条排版验证（2026-10-28）：CDP 在 1440/1280/1100/820 px 四档视口进入“模型库”——修复前“释放显存”按钮被压成 71×78 px 竖排圆钮（文字竖着叠放，视觉上不像按钮，“即刻推理”同样塌陷）；修复后两钮均为 104×36 px 横排，四档一致。同时确认模型卸载/删除入口：**释放显存**在模型卡底部动作条（已加载时显示“释放显存”，未加载显示“加载到显存”）；**从磁盘删除**在右侧详情面板底部红色按钮（`xl` 以下视口会掉到页面最底部，1100 px 时 y≈2032、页面高 2139）。`onDeleteModel` → `deleteModel` → 真实 `DELETE /api/delete`。
- 模型库交互补充验证（2026-10-28）：CDP 在 1440×1200 进入“模型库”——三张卡片中仅选中卡片的 `background-color` 为 `color(srgb 0.208392 0.178275 0.297725)`（主题色 13% 混入表面色）、`border-color` 为 `rgb(121, 82, 236)`，其余两张为 `rgb(43, 40, 52)` / `rgba(255,255,255,0.08)`（修复前 `isSelected` 恒真，全部卡片都高亮）。`⋮` 点击后 `aria-expanded=true`，菜单含“加载到显存 / 即刻推理 / 克隆模型 / 从磁盘删除”4 项，点 `fixed inset-0 z-10` 遮罩后菜单关闭、遮罩归零。布局默认 `list`（卡片 640×217，比例 2.96），点“网格视图”后为 312×304、点“列表视图”回到 640×217，按钮高亮同步。抽屉 `fullTag` 徽章 `background` 为主题色 15%、`border` 为 45%。分类 chips 均为 2 行（全部/3、大语言/LLM、视觉多模态/Vision、代码生成/Coder、嵌入/Embedding）。
- 模型卡内部间距验证（2026-10-28）：CDP 测量规格胶囊行底部与动作条顶部的距离——修复前 `mt-auto` 在 `list` 模式下等于 0，两者直接相邻；改为 `flex-1 min-h-4` 占位后，`list` 与 `grid` 两种模式均为 **16 px**（`actionTop - specBottom`）。截图临时保存在 `/tmp`，未提交。
- 危险色主题适配验证（2026-10-28）：CDP 分别切换 `ollama_theme_mode=light/dark` 后测量“从磁盘彻底移除此权重”按钮——浅色主题文字 `rgb(179, 38, 30)`、底色 `rgba(179, 38, 30, 0.08)`，对比度 **5.22**；深色主题文字 `rgb(255, 180, 171)`、底色 `rgba(147, 0, 10, 0.2)`，对比度 **10.37**；两者均 ≥ WCAG AA 的 4.5。侧栏 logo `img[src*="ollama-llama"]` 自然尺寸 96×112、渲染 18×21、`complete:true`。截图临时保存在 `/tmp`，未提交。
- 浮层关闭验证（2026-10-28）：CDP 在 1440×900 逐个打开聊天页的模型选择、采样参数、会话列表与顶栏的通知中心、个人面板——5 个浮层 `visible:true`，用 `Input.dispatchMouseEvent` 点击 (1180, 700) 空白处后均从 DOM 移除；`Escape` 同样可关闭通知面板（`beforeEsc:true` → `afterEsc:false`）；点击参数面板内部（面板内坐标）保持打开（`innerClickKeepsOpen:true`），不会误关。截图临时保存在 `/tmp`，未提交。
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
- 备注：令牌保护 `/ollama/*`、`/api/import`、`/api/modelscope/*`、`/api/downloads`、`/api/cache`、`/api/export`、`/api/metrics` 与 `/api/daemon`；`/api/catalog`、`/api/hf` 是只读无鉴权代理。`VITE_PROXY_TOKEN` 构建时嵌入前端，属于共享密钥（`RISKS.md` R-025）。测试后进程已停止。

### 9. 真实模型与交互验证（2026-10-28 历史记录）

- **用户指定模型**：`hf.co/saidutta69/MiniCPM-V-4.7-1B-heretic:Q4_K_M`。
- **HF 拉取失败（历史）**：`POST /api/pull` 约 70 秒后返回 `max retries exceeded ... redirect target not allowed: us.aws.cdn.hf.co resolves to non-public 198.18.0.85`。本机 DNS 被代理改写，Ollama 拒绝非公网重定向目标。2026-10-29 起应用内 HF 下载改由服务端直下，见 13；该历史限制只影响 Ollama 原生 `hf.co` pull。
- **本地导入替代**：用 `curl -L` 从 Hugging Face 下载同一 GGUF（641 MB），执行 `ollama create minicpm-v-4.7-1b-heretic:q4_k_m -f <Modelfile>`；模型大小 672 MB。
- **真实对话**：`POST /api/chat` 返回 `thinking` 与正文；测试后 `ollama stop`，`/api/ps` 为空。
- **删除/克隆、Modelfile 构建、GGUF 上传、遥测**：均已实测；临时模型已删除。
- **未覆盖**：模型参数写回、多会话；真实 HF 下载成功路径已由 2026-10-29 的服务端直下补测（见 13），但尚未用真实 `ollama create` 注册大模型。

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

### 12. ModelScope 渠道（搜索与下载）

- 前置：开发服务器或生产服务器已启动；下载还需要本机安装 Ollama CLI。
- 搜索：`curl -s "http://127.0.0.1:5199/api/modelscope/search?q=qwen3%200.6b"`。
  - 状态：**已执行（2026-10-28）通过**，返回 24 条 GGUF 仓库，含 `quants` 与 `files`。
- 下载：`curl -sN -X POST http://127.0.0.1:5199/api/modelscope/pull -H 'content-type: application/json' -d '{"namespace":"ggml-org","name":"SmolLM2-135M-GGUF","file":"SmolLM2-135M-Q4_K_M.gguf","model":"ms-verify-smollm2"}'`。
  - 状态：**已执行（2026-10-28）通过**，NDJSON 输出 `downloading`（`total=101016128`）→ `creating` → `success model=ms-verify-smollm2:latest`；`/api/tags` 显示 101.0 MB。
  - 清理：测试后 `ollama rm ms-verify-smollm2`，`/api/tags` 恢复原有 2 个模型。**未加载到显存**。
- 参数校验：`namespace=../etc` → `{"status":"error","error":"namespace 含非法字符。"}`；`file=README.md` → `仅支持 .gguf 文件。`。
- 中断清理：下载 5 秒后断开连接，`/tmp/ollama-studio-ms-*` 无残留。
- 生产服务器同样挂载 `/api/modelscope/search` 与 `/api/modelscope/pull`，且受 `PROXY_TOKEN` 保护；**生产路径未单独复测**。

### 13. 后台下载任务（`/api/downloads`）

- 创建：`curl -s -X POST http://127.0.0.1:5199/api/downloads -H 'content-type: application/json' -d '{"kind":"pull","model":"smollm2:135m"}'`；ModelScope 用 `{"kind":"modelscope","namespace":"Qwen","name":"Qwen3-Embedding-0.6B-GGUF","file":"Qwen3-Embedding-0.6B-Q8_0.gguf","model":"ms-refresh-test"}`。
- 查询：`GET /api/downloads`（全部）或 `GET /api/downloads/<id>`；取消：`DELETE /api/downloads/<id>`。
- 状态：**已执行（2026-10-28，pull/ModelScope）；2026-10-29 补充 HF 直下**。
  - Hugging Face 创建：`curl -s -X POST http://127.0.0.1:3103/api/downloads -H 'content-type: application/json' -d '{"kind":"huggingface","repo":"ggml-org/models-moved","file":"tinyllamas/stories260K.gguf","quant":"TEST","model":"test/hf-direct:test"}'`。任务 `resolving/downloading/creating → success`，`completed=total=1,185,376`；临时 `/tmp/ollama-studio-hf-*` 与 `ollama-studio-gguf-*` 均无残留。服务端通过真实 HF 302 跳转到 CDN，假 `ollama` CLI 记录到 `create test/hf-direct:test -f <Modelfile>` 与 `FROM <...>/download.gguf`；**未向真实 Ollama 注册模型，未加载模型**。
  - HF 参数/解析错误：`repo:"owner"` → 400 `Hugging Face 仓库格式应为 owner/name。`；`file:"../model.gguf"` → 400 `文件路径非法。`；`file:"does-not-exist.gguf"` → 任务 `error`、`Hugging Face 返回 HTTP 404。`；只给 `quant:"Q2_K"` → `error`、`未找到量化 Q2_K 对应的 GGUF 文件，请重新选择量化。`
  - 错误路径：不存在的模型 → 任务 `status:error`，`error: pull model manifest: file does not exist`。
  - 真实下载：ModelScope 639 MB 文件约 10–13 MB/s，`completed/total` 与服务端进度一致；完成后 `/api/tags` 出现注册模型。
  - 刷新接续：下载中连续两次 `Page.reload`，任务卡仍显示同一 `dl-…` 任务，进度 63.1% → 65.5% → 71.1% → 75.2% → 80.1% 连续增长，`ollama_download_task_v1` 中的 id 不变。
  - 暂停/继续：点暂停后任务卡显示“已暂停”；点继续生成**新的** `dl-…` 任务并按 ModelScope 重新下载（不再出现 `ollama pull` 的 manifest 错误）。
  - 失败重试：失败任务卡显示“将重跑”的具体命令（pull 为 `ollama pull <model>`，ModelScope 为 `ModelScope · <file>`）与“重试”按钮，点击后按原参数创建新任务；pull 任务还可点“编辑命令”，把命令填回顶部输入框并聚焦。ModelScope 任务把 `namespace/name/file/quant/modelName` 写入 `ollama_download_task_v1`，刷新后仍可重试；旧任务没有 `kind/source` 时，`targetPath` 以 `.gguf` 结尾会推断为 ModelScope，否则回退 `targetPath` 作为文件名。
  - 取消：`DELETE` 返回 `cancelled`，`/tmp/ollama-studio-ms-*` 无残留。
  - `ollama pull` 真实完成路径**未验证**：本机网络把 `*.r2.cloudflarestorage.com` 解析为 `198.18.0.245`，任务按预期进入 `status:error`（`redirect target not allowed`），与 HF 的同类限制一致（`RISKS.md` R-024）。
  - 清理：测试后 `ollama rm ms-refresh-test ms-verify-smollm2`，模型列表恢复原有 2 个；未加载任何模型到显存。
  - 生产服务器（3103）：`GET /api/downloads` → `{"jobs":[]}`；非法 namespace 的 `POST` 直接返回 400 `namespace 含非法字符。`（不再创建必然失败的任务）；不存在的模型任务按预期转为 `error`。
  - 失败重试（2026-10-28，开发服务器 3000 + CDP `Fetch` mock）：注入 pull 失败任务 → 任务卡显示“将重跑：ollama pull unsloth/Qwen3.5-0.8B-GGUF”和“编辑命令”；点击编辑后输入框值变为 `ollama pull unsloth/Qwen3.5-0.8B-GGUF` 并获得焦点。点击重试 → `POST /api/downloads` body 为 `{"kind":"pull","model":"unsloth/Qwen3.5-0.8B-GGUF"}`，轮询两轮后转为完成。注入 ModelScope 失败任务并刷新页面 → 点击重试的 body 含持久化 `file: "Q4_K_M/Qwen3.5-0.8B-Q4_K_M.gguf"`，任务转为完成。注入缺少 `kind/source`、`targetPath` 为 `Q4_K_M/model.gguf` 的旧任务 → 卡片显示 `ModelScope · Q4_K_M/model.gguf`、不显示编辑按钮，重试 body 为 `kind:"modelscope"` 且 `file` 使用 `targetPath`，任务转为完成。对 `pull model manifest: file does not exist` 且模型名含 `/` 的实时失败，卡片追加“Ollama registry 中没有该路径 / 使用 `hf.co/` 前缀或 ModelScope”提示。**未对真实 Ollama 重试 `unsloth/Qwen3.5-0.8B-GGUF`**。

### 14. 缓存扫描与清理（`/api/cache`）

- 前置：开发服务器或生产服务器已启动；扫描目录取 `OLLAMA_MODELS`，未设置时为 `~/.ollama/models`；临时目录部分扫描系统 `tmpdir` 下的 `ollama-studio-*`。
- 扫描（只读）：`curl -s http://127.0.0.1:5199/api/cache`。每类返回 `files/bytes/items/hidden`，`items` 按体积降序、最多 500 条，含 `name/path/bytes/modifiedAt/kind`；`temp` 额外含目录内文件数 `entries`。
- 清理：`curl -s -X POST http://127.0.0.1:5199/api/cache/cleanup -H 'content-type: application/json' -d '{"targets":["orphan","partial","temp"]}'`；`targets` 可取 `orphan`（未引用完整 blob）、`partial`（`*-partial` 与 `*-partial-N`）、`temp`（应用临时目录）。`orphan` 不直接删除，而是移入 `OLLAMA_MODELS/.ollama-studio-trash/<timestamp>-<id>/`；返回 `freedBytes`（总处理字节）、`quarantinedBytes`（其中移入回收站的字节）与 `quarantinePath`。恢复时把回收站内的 `sha256-*` 文件移回 `blobs/`。
- 在文件管理器中定位：`curl -s -X POST http://127.0.0.1:5199/api/cache/reveal -H 'content-type: application/json' -d '{"path":"/绝对路径"}'`。只允许 `OLLAMA_MODELS` 目录内路径，或系统临时目录下 `ollama-studio-*` 目录；`realpath` 校验越界返回 403，缺失 404。macOS 用 `open -R`（文件）/`open`（目录），Windows 用 `explorer /select,`，Linux 用 `xdg-open`。
- 安全规则（服务端实现，不可由请求绕过）：清理前重新扫描；解析 `manifests/` 普通文件与 `manifests-v2/` symlink（含 manifest blob 自身、manifest list 递归与 `metadata/sha256-*.json` 保护）；manifest 解析失败、v2 symlink 悬空或指向 `blobs/` 外时拒绝 `orphan`（409）；有后台下载进行中时拒绝 `partial`（409）；10 分钟内修改过的文件跳过；被任何 manifest 或 metadata 引用的 blob 不移动。UI 默认不勾选 orphan，勾选后需二次确认。
- 状态：**已执行（2026-10-29）通过（fixture + 真实目录只读）**。
  - 单测与 HTTP fixture：引用 a/b + orphan c；`POST` 清理 orphan → `quarantinedBytes=300`、`quarantinePath` 存在、c 在回收站、a 仍在 `blobs/`、`report.orphan.files=0`、`errors=[]`。21 项缓存测试通过。
  - 真实目录（**只读**）：`GET /api/cache` 对 `~/.ollama/models` 返回 referenced 21,846,248,274 字节 / 6 个、orphan 0；`scanComplete=false`（两个 v2 manifest symlink 悬空）；**未执行清理**。
  - 事故记录（2026-10-28）：旧版扫描忽略 `manifests-v2/` symlink，把 `diodel/qwen3.5-0.8b-q4_k_m-gguf:latest` 与 `minicpm-v-4.7-1b-heretic:q4_k_m` 的 blob 判为 orphan；UI 默认全选并直接 `rm`，两个模型从 `ollama list` 消失。无 APFS 本地快照、Time Machine 副本或 Trash 副本；已找到 SHA256 完全匹配的 HF 源（`diodel/Qwen3.5-0.8B-Q4_K_M-GGUF` 与 `saidutta69/MiniCPM-V-4.7-1B-heretic`），恢复待用户确认。见 `RISKS.md` R-042。
  - 下载锁：真实 ModelScope 任务运行中 `activeDownloads=true`，UI 的“未完成下载”行显示锁定；`DELETE` 取消任务后临时目录无残留，陈旧 partial 可正常清理。
  - 明细与定位（fixture-v2：orphan 12 MB + 5 MB、partial 8 MB + 3 MB、chunks 3 KB、temp 2 MB）：弹窗自动展开最大类别，明细按体积列出名称、类型、大小、相对时间和完整路径；partial 行显示“2 个未完成文件 + 3 个分块标记”；全部取消后预计处理 `0 B` 且确认按钮禁用。点击文件夹图标时 CDP 拦截到 `POST /api/cache/reveal` 并确认 body 为对应绝对路径（UI 无错误）。服务端校验：空路径 400、`/etc/hosts` 403、不存在路径 404、允许路径 200（macOS 实际调用 `open`）。**Windows/Linux 分支未验证**（R-043）。
  - 生产服务器（3104，`PROXY_TOKEN=test-secret` + fixture）：旧版测试已覆盖无令牌 401、带令牌扫描与 fixture 清理；**新版 `quarantinedBytes` / `quarantinePath` 尚未在该路径复测**。`/api/cache/reveal` 由同一 handler 挂载并受令牌保护，**未单独复测**。测试后停止服务器并删除 fixture 目录。

### 15. UI 状态轮询（`useOllama`）

- 位置：`src/hooks/useOllama.ts`；默认 `DEFAULT_POLL_INTERVAL_MS = 5000`，`useOllama(0)` 可关闭。
- 行为：挂载时立即刷新，之后每 5 秒静默调用 `getConnection()`（`/api/version` + `/api/tags` + `/api/ps`）；并发刷新共享同一个 Promise；静默轮询不把状态切到 `connecting`，避免离线时闪烁。
- 消费方：`App`（侧栏“已加载显存/运行模型数”、顶栏、模型列表）与 `TelemetryScreen`；遥测页不额外轮询 `/api/ps`，但单独每 5 秒读取 `/api/metrics`（页面隐藏时暂停）。
- 状态：**已执行（2026-10-28）通过**。CDP `Fetch` mock `/ollama/api/tags` 与 `/ollama/api/ps`（未加载真实模型）：初始侧栏 `— / 0 活跃`；mock 切为 1 个运行模型（`size_vram=926000000`）后 6.5 秒内变为 `926 MB / 1 活跃`；切回空列表后 6.5 秒内恢复 `— / 0 活跃`。遥测页同步从 `926 MB` 变为 `—`。轮询间隔约 5 秒；遥测页打开时两个 hook 实例并行请求，均为只读接口。
- 注意：轮询会每 5 秒请求一次 `/api/version`、`/api/tags`、`/api/ps`；`useOllama` 未做页面隐藏时暂停，`/api/metrics` 已做可见性判断。若后续接入超大模型列表或远程 Ollama，可考虑提高间隔或共享单一 hook 实例。

### 16. GGUF 导出（`/api/export`）

- 前置：开发服务器或生产服务器已启动；导出目录默认 `~/Downloads/Ollama Studio`（自动创建），也可在请求中传已存在且位于用户主目录、系统临时目录或 `/Volumes`、`/media`、`/mnt` 内的 `directory`。
- 请求：`curl -s -X POST http://127.0.0.1:5303/api/export -H 'content-type: application/json' -d '{"model":"diodel/qwen3.5-0.8b-q4_k_m-gguf:latest","directory":"/tmp/ollama-export-real"}'`。
- 行为：解析 `manifests/` 或 `manifests-v2/`（默认 registry 尝试 `registry.ollama.ai` 与 `ollama.com`），复制 `model` 层；`projector` 层输出 `<name>-mmproj.gguf`；重名追加 `-2`。`COPYFILE_FICLONE` 在 APFS 上优先 clone，失败自动回退完整复制。错误：模型/manifest 缺失 404，无模型层 422，越界目录 403，磁盘满 507。
- 结果：**已执行（2026-10-28）通过**。fixture 导出 model + projector 两层并验证重名；真实 0.8B 模型导出 529,297,312 字节，`GGUF` 文件头与 SHA256 均与 manifest 一致，耗时约 1.19 秒。CDP mock 验证模型页导出按钮与成功 toast。**未导出 27B（21.8 GB）模型，未测跨文件系统完整复制**。
- 注意：只导出当前量化；template/license/params 不属于 GGUF；不会修改 Ollama 存储。

### 17. 系统指标（`/api/metrics`）

- 请求：`curl -s http://127.0.0.1:5303/api/metrics`。
- 返回：`disk`（`path/totalBytes/freeBytes/usedBytes`，优先 `OLLAMA_MODELS` 所在文件系统）、`memory`、`cpu`（核心数与 load1/5/15）、`gpu`（macOS `ioreg -c IOAccelerator` 的型号与 `Device Utilization %`，不可用时带 `reason`）、`ane`（固定 `available:false`，`no-public-api`）。
- 结果：**已执行（2026-10-28）通过**。本机返回磁盘约 494 GB 总量 / 107 GB 可用、GPU `Apple M1 Pro` 利用率 62%–69%；CDP 确认遥测页每 5 秒更新 GPU、磁盘已用、内存与 CPU。
- 未覆盖：Linux/Windows GPU（返回 `unsupported-platform`）、`ioreg` 失败、无图形会话；内存 `os.freemem()` 是“空闲”而非 macOS 的 inactive/cached 可用量。

### 18. 服务检测、控制与启动命令（`/api/daemon`）

- 检测：`curl -s http://127.0.0.1:5303/api/daemon` → `manager`（`ollama-app` / `launchd` / `brew` / `systemd` / `process` / `unknown`）、`running`、`pid`、`restartCommand`、`stopCommand`、`canExecute`、`controlEnabled`。
- 控制：`curl -s -X POST http://127.0.0.1:5303/api/daemon/control -H 'content-type: application/json' -d '{"action":"restart","confirm":true}'`。默认返回 403；只有服务启动时设置 `ALLOW_DAEMON_CONTROL=1`、请求来自 loopback 且 `canExecute` 为真才执行。Ollama.app 使用 `osascript` 退出 + `open -a Ollama`；launchd 使用 `launchctl kickstart -k`；Homebrew 使用 `brew services restart ollama`；systemd 只生成 `sudo systemctl ...`，不自动执行。
- 结果：**已执行（2026-10-28，只读检测）通过**。本机识别 `ollama-app`、PID 6928 与重启/停止命令；未设置开关时 `POST` 返回 403。CDP 确认服务控制面板显示管理方式、命令与“自动执行默认关闭”。**未执行真实重启/停止**，macOS Automation 权限、下载/推理中断与 systemd/Windows 分支未验证。
- 环境变量：遥测页的 `OLLAMA_HOST` / `OLLAMA_MODELS` / `OLLAMA_NUM_PARALLEL` / `OLLAMA_KEEP_ALIVE` / `OLLAMA_FLASH_ATTENTION` 只写入浏览器 `localStorage`（`ollama_daemon_config_v1`），并生成可复制的 `ollama serve` 命令；不修改系统环境，需用户重启 Ollama 后生效。
- 安全：命令由服务端根据检测到的 manager/label/uid 生成，不接受用户传入的 shell 片段；`launchd` label 会校验；控制接口同时受可选 `PROXY_TOKEN` 保护。

### 19. 菜单栏 App 打包与启动

- 命令：`npm run build:menu`（`macos/menu-bar/build.sh`）。
- 前置：macOS 与 Xcode Command Line Tools（`swift` / `swiftc` / `iconutil` / `hdiutil` / `codesign`）；先退出正在运行的 `Ollama Studio Menu`，否则脚本报错退出。
- 产物：`build/Ollama Studio Menu.app`（约 127 MB）与 `build/Ollama Studio Menu-0.1.0.dmg`（约 47 MB）。
- 内置：`Contents/Resources/runtime/node`、`server/server.js`、`server/dist/` 与 `server/package.json`（`{"type":"module"}`）。`package.json` 必须随包分发：它声明 ESM，并让 Node 不再向上遍历父目录查找模块类型；缺失时从受保护目录启动会卡在 package.json 查找，安装到 `/Applications` 后则可能按 CommonJS 解析而启动失败。
- 启动：`open "build/Ollama Studio Menu.app"`；服务监听 `127.0.0.1:3210`，菜单栏出现图标，默认打开浏览器。
- 验证：**已执行（2026-10-29）通过**。重新打包后启动，Node 子进程正常监听 `127.0.0.1:3210`；`POST /api/downloads` 的非法 HF 仓库返回 400 `Hugging Face 仓库格式应为 owner/name。`，`file:"../model.gguf"` 返回 400 `文件路径非法。`，确认内置服务已是 HF 服务端直下版本。
- 未验证：通过 App 发起真实 HF 下载或真实 `ollama create`；安装到 `/Applications`、登录项、自动更新、Developer ID 签名与公证。

## Ollama 连通性检查

- 版本：`curl -s http://127.0.0.1:11434/api/version` → `0.40.7`。
- 模型列表：`curl -s http://127.0.0.1:11434/api/tags` → 两个模型；1B 模型 `context_length=262144`，`capabilities=["tools","thinking","completion"]`。
- 运行状态：`curl -s http://127.0.0.1:11434/api/ps` → 当前为空。
- 代理版本/模型：`curl -s http://127.0.0.1:3101/ollama/api/{version,tags}`（生产测试期间）→ 与上游一致。

## 手动验收清单（未执行）

- [ ] Models：分类/搜索/网格列表、参数修改后刷新仍保留、加载/释放显存并核对 `/api/ps`、导出 GGUF（含多模态 mmproj）与重名文件。
- [ ] Pull：真实拉取、暂停/继续/取消、刷新后中断提示、GGUF 上传（非 `.gguf`/空文件/CLI 缺失）。
- [ ] Chat：多会话创建/切换/重命名/删除、刷新恢复、代码块复制、停止生成、思考折叠、JSON/人设、错误提示。
- [ ] Modelfile：构建、成功提示、测试对话、空模型状态。
- [ ] Telemetry：连接状态、模型/显存统计、事件日志、真实磁盘/内存/CPU/GPU 指标、“全部卸载”、服务检测/复制命令、`ALLOW_DAEMON_CONTROL=1` 下的重启/停止（需用户明确同意）、daemon 界面配置保存与启动命令复制。
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

- 2026-10-28：`git init -b main`，创建本地基线提交 `6198c59`。
- 2026-10-29：远端 `origin` 配置为 `https://github.com/HaoRangQi/Ollama-Studio.git`；本次待提交并推送，推送结果与 GitHub Actions 首次运行另行记录。
- tag、发布流程：**未执行**（无版本 tag、无发布流水线）。
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
