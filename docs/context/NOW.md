# NOW

> 当前状态快照。接续任务先读这里；稳定事实见 `README.md` / `README.zh-CN.md` / `MAP.md`，决策见 `DECISIONS.md`，风险见 `RISKS.md`。
>
> 更新日期：2026-10-29
> 核验对象：仓库根目录、`src/`、`server/`、`server.ts`、`vite.config.ts`、`package.json`、`tsconfig.json`、`macos/menu-bar/`、测试与 CI 配置、`docs/context/`
> 更新范围：完成第三阶段工程化与功能收口：Vitest/ESLint/Prettier/strict/CI、依赖清理、模型参数默认值与显存 keep_alive、多会话、代码块渲染、i18n 补全、空模型状态、下载任务持久化、GGUF CLI 预检、可选代理令牌、开发服务器回环绑定、字体自托管、Apache-2.0 与 Git 基线；并接入 ModelScope 渠道、服务端后台下载任务、浮层外部点击关闭与 Ollama 缓存扫描/清理。2026-10-29 修复缓存清理忽略 `manifests-v2` symlink 的误删事故（D-140、R-042），把 Hugging Face 下载改为服务端直下 GGUF + `ollama create`（D-141、R-049），新增 macOS 菜单栏封装（D-142、R-050），并按首版复刻 Chat 导航图标（显式组合 `chat` + `_` + `spa` + `rk`）。2026-10-29 重写 README 安装/开发章节，修复切换模型库渠道清空输入，离线提示标题加大加粗标红，并更新菜单栏 App 外观与打包产物，发布首个 GitHub Release `v0.1.0`。未做完整人工视觉/a11y 验收；未在真实 UI 点击验证模型加载/卸载；事故后真实 `~/.ollama/models` 仅只读扫描，未再执行清理。

## 当前目标

把 Ollama Studio 从 UI 设计原型推进为可用的本地 Ollama 管理与对话应用，并按标准软件仓库维护。当前形态为 **Web 优先**，另有可选的 macOS 菜单栏封装（`DECISIONS.md` D-142）；将来若需要跨平台桌面能力，再评估 Tauri（`DECISIONS.md` D-101）。

## 本轮进展

已完成：

### 工程基础

- [x] 添加 Vitest（Node 环境）与 133 个测试：NDJSON 分片/错误/中止、`streamChat`/`pullModel`、`loadModel`/`unloadModel`、映射、会话迁移/增删改、模型参数校验、下载任务中断与失败 source 持久化、GGUF 名称与空上传、附件类型/base64 转换、ModelScope URL/量化映射、缓存扫描与清理安全边界、逐文件明细与文件管理器定位路径校验、GGUF 导出 manifest/model/projector/重名/目录校验、磁盘指标与 ioreg GPU 解析、launchd/ps/pgrep 与 daemon 命令构建、`ollama serve` 命令生成。
- [x] 添加 ESLint 10 flat config、Prettier 3，`npm run lint`、`format:check` 通过；开启 TypeScript `strict`。
- [x] 添加 `.github/workflows/ci.yml`：`npm ci` → `typecheck` → `lint` → `format:check` → `test` → `build`；2026-10-29 首次远端运行 `40739185722` 通过。
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
- [x] 可选代理令牌：`PROXY_TOKEN` + `VITE_PROXY_TOKEN` 保护 `/ollama/*` 与本地管理 API（`/api/import`、`/api/modelscope`、`/api/downloads`、`/api/cache`、`/api/export`、`/api/metrics`、`/api/daemon`）；无令牌 401、Bearer 200 已实测。
- [x] 开发服务器默认 `127.0.0.1:3000`；新增 `dev:lan` 显式开放并文档警告。
- [x] i18n 收口：聊天、模型、拉取、Modelfile、遥测、Command Palette、Pull/Quant 弹窗的主要文案按语言切换；移除假版本号/假 GPU/假通知。
- [x] 移动端底部导航、`lg` 断点布局、`:focus-visible` 与减少动态效果样式；图标按钮补 `aria-label`。
- [x] 模型库搜索与本地精选分区：搜索时只显示搜索结果并隐藏“本地精选分类”，清空或点击“返回本地精选”后恢复精选列表；分类 chips 不再暗示会筛选远程结果。
- [x] 搜索结果改为横向长条卡片列表：每页默认 6 条，可切换 6/12/24 条并写入 `ollama_catalog_page_size_v1`；支持页码/上一页/下一页、量化标签预览与展开（8→全部）、作者/下载/标签/量化数量等信息。量化标签点击后用主题色选中，行内“下载 <quant>”直接启动 `/api/pull` 并滚动到进度卡；“仅填入命令”保留旧行为。
- [x] 命令面板支持点击遮罩、右上角 X、Esc 三种关闭方式；聊天输入框移除无效附件按钮、缩短占位文案、改为容器聚焦环，默认高度 96px，并支持拖拽或方向键调整高度、双击恢复自动高度，高度写入 `ollama_chat_input_height_v1`；同时设置 `overflow-x-hidden`，空内容不再出现横向滚动条。
- [x] 聊天支持图片/视频附件：图片在浏览器压缩为 JPEG；视频抽取 3 帧；随 `/api/chat` 的 `images` 发送；支持缩略图预览、移除、拖放；PDF/压缩包等任意文件明确拒绝。附件随会话持久化，localStorage 超配额时提示可能不保留。
- [x] ⌘K 现在可以从任意页面打开命令面板（此前只能关闭）。
- [x] 模型库网格/列表切换真正生效（网格为两列，列表为单列），此前只改 state 不改变布局。
- [x] 显存单位修复：此前把 `926 MB` 文本解析为数字后当作 GB 显示成 `926.0 GB`；现改用 `/api/ps` 的 `size_vram` 字节值，经 `formatBytes` 显示，Sidebar 与遥测页共用（`RISKS.md` R-034）。
- [x] 主题新增自定义调色盘：支持系统取色器、16 色预设、随机色，自动派生 container/tint/glow 并持久化到 `ollama_accent_palette=custom` + `ollama_custom_accent`；并提示过亮颜色的对比度风险。
- [x] 导出 GGUF、深度清理、附件入口在无 API 时禁用并说明原因，不再显示假成功 toast。
- [x] 下载任务卡失败态排版修复：长模型名挤压右侧指标导致“速率:”折成竖排（25×33 px）；现左侧容器 `min-w-0 flex-1`、右侧 `shrink-0`、速率胶囊 `whitespace-nowrap`，标签恢复单行（25×17 px）。错误信息从整段“红字墙”改为 2 行 `line-clamp-2` + `break-all`，超过 120 字符提供“展开完整错误/收起”开关。
- [x] 模型卡动作条排版修复：左侧“保留至 …”占位把“释放显存/即刻推理”压成 71×78 px 竖排圆钮，用户因此难以识别卸载入口；补 `min-w-0` + `truncate` + `shrink-0` + `whitespace-nowrap` 后恢复 104×36 px 横排（`RISKS.md` R-036）。
- [x] 模型库交互与视觉调整（2026-10-28）：① 修复 `isSelected` 恒为 true 的 bug（原为 `model.id === model.id`），选中卡片改为淡主题色背景 + 主题色边框；② “运行参数与配置”下的 `fullTag` 改为主题色描边徽章；③ 卡片右上角 `⋮` 改为下拉菜单（加载/释放显存、即刻推理、克隆模型、从磁盘删除，删除含二次确认，点遮罩关闭）；④ 分类 chips 改为中英双行（大语言/LLM、视觉多模态/Vision、代码生成/Coder、嵌入/Embedding）；⑤ 默认布局改为长条矩形（`list`，640×217，比例 2.96），右上角切换按钮同步高亮。CDP 验证：三张卡片仅选中一张有主题色样式，菜单 4 项可开可关，grid 模式 312×304、list 模式 640×217 切换正常。⑥ 卡片内规格胶囊行与底部动作条之间原用 `mt-auto` 撑开，在 `list` 模式下等于 0 导致两者贴连；改为 `flex-1 min-h-4` 占位后两种布局均稳定 16 px 间距。
- [x] 品牌图标与危险色主题适配（2026-10-28）：① 侧栏 logo 由 Material Symbols `neurology` 换成 Ollama 官方羊驼图标 `public/assets/ollama-llama.png`（取自 `ollama.com/public/ollama-nav.png`，商标归属已在 `NOTICE` 注明）；② 新增 `--app-danger-text/bg/bg-hover/border/solid/on-solid` 主题变量，浅色主题下反转为深红字 + 极浅红底；删除按钮、删除确认、菜单删除项与拉取错误文字改用变量。实测对比度：浅色 5.22、深色 10.37（修复前浅色下粉底粉字几乎不可见），均达到 WCAG AA。
- [x] Chat 导航入口视觉复刻（2026-10-29）：按首版截图中 `chat_spark` 被字体拆分后的效果，用合法片段显式组合为 `chat` + `_` + `spa` + `rk`，不再依赖无效图标名；active 态恢复为与其他导航一致的纯色 `--primary-accent` 胶囊 + 外发光，标签保持单行。headless Chrome 在 1600×1000 下验证选中/未选中态，按钮尺寸 223×44 px；移动端底部导航与命令面板仍使用 `forum`，避免组合字形在五列布局中过宽。
- [x] README 安装与独立开发章节（2026-10-29）：新增 “Install and Run”（前置条件、Web 源码运行、菜单栏 App/DMG 安装、无预构建版本说明）与 “Development”（初始化、日常检查、目录结构、一分钟架构、CI、文档入口、脚本表），中英文同步；明确 Web 开发不依赖 Xcode 或菜单栏 App，并标注 `/Applications` 安装与真实模型下载仍未验证。本地链接与 Prettier 检查通过。

- [x] 新增 ModelScope 渠道并设为默认（2026-10-28）：`/api/modelscope/search`（服务端追加 `gguf` 关键字、并发 6 拉取文件列表推导量化）与 `/api/modelscope/pull`（下载 GGUF → `ollama create` 注册，NDJSON 进度）。Ollama 不支持 pull ModelScope 仓库，故由本地服务下载；直链无 `content-length`，总大小回退到文件列表 API 的 `Size`。前端渠道顺序为 ModelScope / Hugging Face / Ollama 官方，默认 ModelScope；结果卡片补 ModelScope 徽章、GGUF 徽章、量化 chip、`在 ModelScope 查看` 与 `curl + ollama create` 填命令；暂停/恢复按来源分流（ModelScope 任务无断点续传，恢复即重新下载）。见 `RISKS.md` R-039。
- [x] Hugging Face 改为服务端直下（2026-10-29）：本机 `us.aws.cdn.hf.co` 被代理解析为 `198.18.x.x`，Ollama 自带 `hf.co` pull 以 `redirect target not allowed` 拒绝；新增 `server/huggingface.ts` 与 `/api/downloads` 的 `kind: "huggingface"`，由 Node `fetch` 跟随 302 到 CDN 下载 GGUF，再执行 `ollama create`，不再经过 Ollama 的 HF 客户端。搜索结果返回 `files` 把量化映射到具体文件；直接输入 `hf.co/<repo>:<quant>` 也走同一路径，缺文件时由 HF API 按量化解析。任务 `source` 持久化 `repo/file/quant/modelName`，失败重试不会退回 `ollama pull`。见 `RUNBOOK.md` 13、`DECISIONS.md` D-141、`RISKS.md` R-049。
- [x] 拉取页渠道切换保留输入（2026-10-29）：切换 ModelScope / Hugging Face / Ollama 官方时只清空旧渠道结果，不再清空 `catalogQuery`；点击当前渠道直接返回，不重置。headless Chrome 输入 “MiniCPM5-2B” 后切换，值保留、占位文案更新、旧结果清空。
- [x] 离线提示强化（2026-10-29）：`ConnectionBanner` 在离线态把标题由 13px semibold 改为 16px bold，并使用 `--app-danger-text`（深色 `#ffb4ab`、浅色 `#b3261e`）；“正在连接”和“已连接但无模型”两种状态保持原样。用 `OLLAMA_HOST=http://127.0.0.1:9` 启动生产服务 + headless Chrome 截图验证，文字明显大于副标题且为红色。
- [x] 首个 GitHub Release `v0.1.0`（2026-10-29）：tag 指向 `0f76bae`，附 macOS DMG（48,175,616 字节，SHA256 `e405e7f2…abefc6`）；Releases 仅保留该版本。发布为手动执行，无自动流水线；DMG 未在 `/Applications` 安装验证。
- [x] 下载改为服务端后台任务（2026-10-28）：新增 `server/downloads.ts` 与 `/api/downloads`（`POST` 创建/复用、`GET` 列表或单个、`DELETE` 取消），下载由服务端持有，浏览器只轮询进度。刷新页面后前端用 `listDownloadJobs()` 接回仍在运行的任务并自动回到拉取页；Ollama 分层 `total/completed` 聚合移到服务端，客户端不再自己算。`DownloadTask` 增加 `kind`，撤销/暂停后“继续”按来源分流——ModelScope 任务用服务端保留的 `target` 重新发起，不会再错误地走 `ollama pull <namespace>/<name>`（此前会报 `pull model manifest: file does not exist`）。旧的 `src/api/modelscope.ts` 流式客户端已删除。
- [x] 浮层外部点击关闭（2026-10-28）：新增 `src/hooks/useDismissable.ts`（点击外部 + Esc，回调存 ref 避免重复绑定），接入聊天页的模型选择、采样参数、会话列表与顶栏的通知中心、个人面板；此前这些浮层只能靠再次点击触发按钮或面板内关闭按钮收起。模型卡 `⋮` 菜单原本用 `fixed inset-0` 遮罩，行为不变。
- [x] Ollama 缓存管理（2026-10-28，2026-10-29 修复）：新增 `server/cache.ts` 与 `/api/cache`（`GET` 扫描、`POST /api/cache/cleanup` 清理），遥测页“缓存清理”卡片替换原只读占位。扫描 `OLLAMA_MODELS`（默认 `~/.ollama/models`）的 `blobs/`、`manifests/` 与 `manifests-v2/`，把完整 blob 分为被 manifest/metadata 引用/未引用，另计 `*-partial`、`*-partial-N` 分块与应用临时目录 `ollama-studio-*`；清理前重新扫描，只处理勾选类别，orphan 同盘移入 `.ollama-studio-trash` 而非直接删除（D-140）。安全规则：manifest 解析失败、v2 symlink 悬空或越界时禁止清理未引用 blob（409）；有后台下载进行中时禁止清理未完成下载（409）；10 分钟内修改过的文件跳过。2026-10-29 修复前，旧版忽略 `manifests-v2` symlink，导致两个模型被误删（R-042）。确认弹窗支持展开三类逐文件明细（名称、类型、大小、修改时间、完整路径，按体积排序，每类最多 500 条），并提供 `POST /api/cache/reveal` 在系统文件管理器中定位文件/目录；该接口只允许模型目录内路径或 `ollama-studio-*` 临时目录（`realpath` 校验，越界 403）。
- [x] 侧栏显存/运行数自动刷新（2026-10-28）：`useOllama` 默认每 5 秒静默轮询 `/api/version` + `/api/tags` + `/api/ps`，并发刷新共享同一个 Promise，避免请求堆叠；轮询失败不回切 connecting，减少离线抖动。`TelemetryScreen` 原有的独立 5 秒 interval 已移除，改由 hook 统一负责。侧栏“已加载显存/运行模型数”现在会随外部加载/卸载更新（此前只在挂载、手动刷新或下载完成时更新）。
- [x] 下载失败可重试（2026-10-28）：失败任务卡新增“重试”按钮，按原参数重新创建后台任务，并显示“将重跑”的具体命令（pull 为 `ollama pull <model>`，ModelScope 为 `ModelScope · <file>`）；pull 任务可点“编辑命令”，把原命令填回输入框并聚焦。`DownloadTask` 增加可选 `source`（`namespace/name/file/quant/modelName`），ModelScope 任务写入 `ollama_download_task_v1`，刷新后仍能重试。旧任务没有 `kind/source` 时，`targetPath` 以 `.gguf` 结尾会推断为 ModelScope，避免误走 `ollama pull`；否则回退用 `targetPath` 作为文件名。对 `pull model manifest: file does not exist` 且模型名含 `/` 的错误追加可操作提示：Hugging Face 仓库应使用 `hf.co/<repo>:<quant>`，或改用 ModelScope 下载 GGUF；不自动改写用户输入。见 `DECISIONS.md` D-135。
- [x] GGUF 导出（2026-10-28）：新增 `server/exportGguf.ts` 与 `POST /api/export`，读取 `manifests/` 或 `manifests-v2/`（默认 registry 同时尝试 `registry.ollama.ai` 与 `ollama.com`），复制 `application/vnd.ollama.image.model` blob，多模态 `projector` 单独导出为 `*-mmproj.gguf`；默认写入 `~/Downloads/Ollama Studio`，重名追加 `-2`，复制优先使用 APFS clone。模型页原禁用按钮改为“导出 GGUF”，`⋮` 菜单同步增加入口，成功 toast 显示目录与 mmproj 提示。边界：只导出当前量化，template/license/params 不含在 GGUF 内；不提供目录选择。见 `DECISIONS.md` D-136。
- [x] 真实系统指标（2026-10-28）：新增 `server/metrics.ts` 与 `GET /api/metrics`，返回磁盘总量/已用/可用（`statfs`，优先模型目录）、内存、CPU load 与核心数；macOS 通过 `ioreg -c IOAccelerator` 读取 GPU 型号与 `Device Utilization %`，失败时返回明确原因；ANE 无公开 API，固定返回不可用。遥测页每 5 秒轮询（页面隐藏时暂停），替换“可用空间未知”“Ollama 不提供 GPU/ANE”等占位。见 `DECISIONS.md` D-138。
- [x] 运行模型 GC 与服务控制（2026-10-28）：遥测页运行中模型卡片增加“全部卸载”（确认后对每个运行模型发送 `keep_alive: 0`，embedding 走 `/api/embed`）；新增服务控制面板，检测 Ollama.app / launchd / Homebrew / systemd / 普通进程，显示 PID 与可复制的重启/停止命令。`POST /api/daemon/control` 默认 403，只有 `ALLOW_DAEMON_CONTROL=1`、loopback、`confirm:true` 且管理方式可执行时才运行；Ollama.app 使用 AppleScript 退出并重开。环境变量面板新增 `ollama serve` 启动命令预览与复制，不写系统环境。见 `DECISIONS.md` D-137。
- [x] README 双语化与浅色截图（2026-10-28）：`README.md` 改为英文主版本，中文内容迁移到 `README.zh-CN.md`，两份头部互链；新增 `docs/assets/screenshots/en/` 与 `zh/` 两套浅色主题演示截图（各 4 张，2×2 预览）。同时修复英文界面中残留的模型描述、显存状态与拉取页标签文案，使截图与语言一致。见 `DECISIONS.md` D-139。

### 验证与仓库

- [x] GGUF 手动导入链路实测（2026-10-28）：`curl -L` 下载 HF GGUF（688,066,496 字节，SHA256 与 HF `lfs.oid` 一致）→ `ollama create` 导入成功 → `ollama show` 显示 1.1B / 131072 上下文 / Q4_K_M / `tools, thinking, completion` → `/api/chat` 带 `think: true` 返回 thinking 与 content，85–105 tok/s → `keep_alive: 0` 卸载后 `/api/ps` 为空。**走的是 CLI，未覆盖 UI 的 `/api/import` 上传路径**。
- [x] ModelScope 渠道实测（2026-10-28，开发服务器 5199 + CDP + 真实 Ollama 0.40.7）：① 搜索 `qwen3 0.6b` 返回 24 条 GGUF 仓库，量化与文件映射正确（`unsloth/Qwen3-0.6B-GGUF` 12 个量化）；② 参数校验：`namespace=../etc` → `namespace 含非法字符。`，非 `.gguf` → `仅支持 .gguf 文件。`；③ 进度含总大小（`ggml-org/SmolLM2-135M-GGUF` 101,016,128 字节），中断后临时目录已清理；④ 端到端下载并注册成功：`success model=ms-verify-smollm2:latest`，`/api/tags` 显示 101.0 MB，随后 `ollama rm` 清理；⑤ 客户端链路用 CDP `Fetch` 拦截 `/api/modelscope/pull` 注入 mock NDJSON，进度卡显示 1.00/2.00 GB、`ollama create` 阶段与完成态；⑥ 截图确认默认渠道为 ModelScope、卡片显示 `ModelScope`/`GGUF` 徽章与量化 chip。
- [x] HF 服务端直下实测（2026-10-29，生产服务器 3103 + 假 `ollama` CLI）：真实下载 `ggml-org/models-moved` 的 `tinyllamas/stories260K.gguf` 1,185,376 字节，任务 `resolving → downloading → creating → success`，`completed/total` 一致，临时目录无残留；假 CLI 收到 `create test/hf-direct:test -f <Modelfile>`，未向真实 Ollama 注册模型。CDP 在 1600×1200 验证：HF 搜索结果点击 `Q4_K_M` 下载后，`POST /api/downloads` body 为 `{"kind":"huggingface","repo":"unsloth/Qwen3.5-0.8B-GGUF","file":"Qwen3.5-0.8B-Q4_K_M.gguf","quant":"Q4_K_M","model":"unsloth/Qwen3.5-0.8B-GGUF:Q4_K_M"}`，`/api/pull` 调用 0 次；粘贴 `hf.co/unsloth/Qwen3.5-0.8B-GGUF:Q4_K_M` 后同样发送 `kind:"huggingface"`，未带 `file`，由服务端按量化解析。**未下载 529 MB/672 MB 恢复文件，未用真实 `ollama create` 注册。**
- [x] 菜单栏 App 重新打包（2026-10-29）：`npm run build:menu` 重新生成 `build/Ollama Studio Menu.app` 与 DMG。修复内置 `server/package.json`（`{"type":"module"}`）：未声明模块类型时 Node 会向上遍历父目录查找 package.json，从 Downloads 启动时卡在 `GetNearestParentPackageJSONType` → `open`；安装到 `/Applications` 后还可能按 CommonJS 解析而启动失败。新包启动后监听 `127.0.0.1:3210`，非法 HF 仓库与 `../` 文件路径均返回预期 400，确认内置服务为 HF 直下版本。2026-10-29 02:24 再次打包（Chat 图标复刻后），App 监听 3210；headless Chrome 打开 3210 验证 `.chat-mark` 组合字形、单行标签、223×44 px 与 `#7952ec` 选中态，`/healthz` 200、`/ollama/api/version` 0.40.7。**未通过 App 发起真实下载或真实 `ollama create`。** 见 `RUNBOOK.md` 19。
- [x] 后台下载实测（2026-10-28，开发服务器 5199 + CDP + 真实 Ollama 0.40.7）：① ModelScope 639 MB 文件 → 任务 `running`，速度 10–13 MB/s；② 下载中连续两次 `Page.reload`，任务卡接回同一 `dl-…` 任务，进度 63.1% → 80.1% 连续增长；③ 暂停后继续 → 生成新任务并重新走 ModelScope（无 `ollama pull` 的 manifest 错误）；④ 完成后 `/api/tags` 出现注册模型，取消后 `/tmp/ollama-studio-ms-*` 无残留；⑤ `ollama pull` 完成路径未验证——本机把 `*.r2.cloudflarestorage.com` 解析为 `198.18.0.245`，任务按预期进入 `error`。测试后删除注册模型，模型列表恢复原有 2 个。
- [x] 缓存清理实测（2026-10-28，开发服务器 5200，`OLLAMA_MODELS=/tmp/os-cache-fixture/models`）：① fixture 含被引用 blob 1 MB、孤儿 blob 5 MB、陈旧 `-partial` 3 MB + 分块标记 2 KB、临时目录 2 MB；`GET /api/cache` 正确分类，`reclaimableBytes=10,004,096`。② UI 卡片显示 `10 MB` 可回收与三类明细；打开弹窗默认全选，全部取消后“确认清理”禁用且预计释放 `0 B`；点击遮罩可关闭；只勾选孤儿后确认释放 5,000,000 字节，卡片与 `GET /api/cache` 同步刷新，被引用 blob 保留。③ 再次全量清理后 `reclaimableBytes=0`、按钮禁用，`blobs/` 只剩被引用文件。④ 下载锁：启动真实 ModelScope 任务（1.27 GB，进度 76 MB），`activeDownloads=true`，UI 中“未完成下载”显示 `lock` 且不可勾选，卡片提示“有下载进行中”；`DELETE` 取消后任务 `cancelled`，临时目录无残留、`activeDownloads=false`，陈旧 partial 仍可清理。⑤ 真实 `~/.ollama/models` 只读扫描：被引用 21,846,248,274 字节 / 6 个，未引用 672,004,366 字节 / 5 个，partial 4,330,025,216 字节 / 5 个，分块 2,232 字节 / 39 个，合计约 4.66 GB 可回收；**未对真实目录执行清理**（`RISKS.md` R-042）。扫描时 `temp` 的 2 MB 是本次 UI fixture，已随测试清理。⑥ 生产服务器 3104（`PROXY_TOKEN` + fixture）：无令牌 401、带令牌扫描 5000 字节、清理释放 5000 字节且保留被引用 blob；测试后停止服务器并删除 fixture。⑦ 明细与定位（2026-10-28，开发服务器 5200 + CDP，fixture：引用 1 MB、孤儿 12 MB + 5 MB、partial 8 MB + 3 MB、chunks 3 KB、temp 2 MB）：卡片显示“查看明细并清理”，打开弹窗自动展开最大类别（未引用权重 17 MB），明细按体积列出 12 MB / 5 MB 两个完整 blob；展开“未完成下载”列出 2 个未完成文件 + 3 个分块标记，显示类型徽章、大小、相对时间与完整路径；全部取消后预计释放 `0 B`、确认按钮禁用。点击文件夹图标时 CDP 拦截到 `POST /api/cache/reveal` 且 body 为对应文件绝对路径，UI 无错误。服务端校验：空路径 400、`/etc/hosts` 403、不存在路径 404、允许路径 200（实际调用 `open`，macOS Finder 可定位）；Windows/Linux 的打开命令**未验证**（`RISKS.md` R-043）。**该次 orphan 测试是旧版“直接删除”语义；2026-10-29 起改为回收站，且真实扫描中的 672 MB “未引用”很可能包含被 v2 symlink manifest 引用的模型，不能作为可回收证据。**
- [x] 缓存误删事故修复（2026-10-29）：Ollama 0.40.7 把部分模型 manifest 存为 `manifests-v2/.../tag` symlink，指向 `blobs/sha256-<manifest>`。旧 `readManifestDigests` 只处理普通文件，symlink 被静默跳过，`scanComplete` 仍为 true；两个小模型的全部 blob 因此被判为 orphan。用户执行清理后，旧代码用 `rm` 永久删除，`diodel/qwen3.5-0.8b-q4_k_m-gguf:latest` 与 `minicpm-v-4.7-1b-heretic:q4_k_m` 从 `ollama list` 消失。修复：`readlink`/`realpath` 解析 v2 symlink，保护 manifest blob 自身，递归 manifest list，合并 `metadata/sha256-*.json` 的 digest，悬空/越界链接使 `scanComplete=false`；orphan 改为同盘 `rename` 到 `.ollama-studio-trash/<timestamp>-<id>/`，UI 默认不勾选 orphan 并二次确认，返回并展示回收站路径。验证：`typecheck`、`lint`、`format:check`、123 tests、`build` 通过；真实目录只读扫描 referenced 6 / 21,846,248,274 字节、orphan 0、`scanComplete=false`；HTTP fixture 验证 300 字节移入回收站且引用 blob 保留。**未再对真实目录执行清理。** 恢复待确认：两个悬空 manifest 仍在；匿名 Ollama registry 查询均 404，但 Hugging Face 找到 SHA256 完全匹配的公开源——`diodel/Qwen3.5-0.8B-Q4_K_M-GGUF` 的 `qwen3.5-0.8b-Q4_K_M.gguf`（529,297,312 字节，`fb89581c…`）与 `saidutta69/MiniCPM-V-4.7-1B-heretic` 的 `MiniCPM-V-4.7-1B-heretic-Q4_K_M.gguf`（672,003,744 字节，`18f8b9d7…`）。本地 `minicpm5-1b-fable5` 是另一个 llama 架构模型，不能用于恢复。见 `DECISIONS.md` D-140、`RISKS.md` R-042。
- [x] 侧栏轮询实测（2026-10-28，开发服务器 5200 + CDP `Fetch` mock `/ollama/api/tags` 与 `/ollama/api/ps`，未加载真实模型）：初始 `— / 0 活跃`；把 mock `/api/ps` 切为 1 个运行模型（`size_vram=926000000`）后 6.5 秒内侧栏变为 `926 MB / 1 活跃`；切回空列表后 6.5 秒内恢复 `— / 0 活跃`。遥测页在同一 mock 下也自动更新（`926 MB` → `—`）。轮询请求间隔约 5 秒，App 与遥测页各自的 hook 实例会并行请求（遥测页打开时约每 2.5 秒一次），均为只读 `/api/version`、`/api/tags`、`/api/ps`。
- [x] 下载失败重试实测（2026-10-28，开发服务器 3000 + CDP `Fetch` mock，未访问真实模型源）：① 注入 pull 失败任务（`unsloth/Qwen3.5-0.8B-GGUF`，错误 `pull model manifest: file does not exist`），任务卡显示“将重跑：ollama pull unsloth/Qwen3.5-0.8B-GGUF”和“编辑命令”；点击编辑后输入框值变为该命令并获得焦点。点击重试后 POST body 为 `{kind:"pull",model:"unsloth/Qwen3.5-0.8B-GGUF"}`，轮询两轮后转为完成。② 注入 ModelScope 失败任务并刷新页面，点击重试的 body 含 `namespace/name/file/model`，其中 `file` 来自持久化的 `source`，任务转为完成。③ 注入缺少 `kind/source`、`targetPath` 为 `Q4_K_M/model.gguf` 的旧任务：卡片显示 `ModelScope · Q4_K_M/model.gguf`、不显示编辑按钮，重试 body 为 `kind:"modelscope"` 且 `file` 使用 `targetPath`，任务转为完成。④ 实时 pull 失败（running → error）时卡片显示原始错误 + `Ollama registry 中没有该路径` 提示与“重试”按钮。**未对真实 Ollama 重试该 HF 仓库**。
- [x] GGUF 导出实测（2026-10-28）：fixture 经 `POST /api/export` 导出 model + projector 两层（12 + 14 字节），内容正确、重名生成 `-2`；`/etc` 返回 403、`../etc` 返回 400。真实 `diodel/qwen3.5-0.8b-q4_k_m-gguf:latest` 导出 529,297,312 字节，文件头为 `GGUF`，SHA256 `fb89581c…` 与 manifest digest 一致，耗时约 1.19 秒（APFS clone）。CDP mock 验证模型页导出按钮发送 `{model:"diodel/..."}` 并显示“已导出 2 个文件…（含 mmproj）”。**未导出 21.8 GB 的 27B 模型**。
- [x] 系统指标与服务检测实测（2026-10-28）：`GET /api/metrics` 返回真实磁盘容量（约 494 GB 总量 / 107 GB 可用）、内存、CPU load 与 `ioreg` GPU（Apple M1 Pro，实测 62% / 69%）；`GET /api/daemon` 识别 `manager: ollama-app`、PID 6928 与可复制命令；`POST /api/daemon/control` 在未设置 `ALLOW_DAEMON_CONTROL` 时返回 403。CDP 确认遥测页显示 GPU、磁盘已用、启动命令、全部卸载与服务控制面板，且 `ALLOW_DAEMON_CONTROL` 关闭时提示正确。
- [x] `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test`（133 个测试）、`npm run build` 全部通过（2026-10-29）。
- [x] 构建体积：前端 JS 约 519.4 kB（gzip 141.1 kB），CSS 约 79.8 kB（gzip 17.1 kB），`server.js` 约 63.2 kB；字体/图标为本地资源（Material Symbols woff2 约 4 MB）。
- [x] 生产服务器 3101：`/healthz`、`/ollama/api/version`、`/ollama/api/tags`、首屏 headless Chrome 通过。
- [x] 开发服务器 3001：首屏、代理、`/api/import` 400 校验、headless Chrome 通过。
- [x] 令牌服务器 3102：`/healthz authRequired:true`、无令牌 401、Bearer 200、`/api/import` 无令牌 401、带令牌非法文件 400。
- [x] 添加 Apache-2.0 `LICENSE`；初始化 Git（`main`）并创建本地基线提交 `6198c59`，不推送。
- [x] 同步 `README.md`、`README.zh-CN.md`、`PROJECT_INDEX.md`、`MAP.md`、`RUNBOOK.md`、`DECISIONS.md`、`RISKS.md`、`NOW.md`。

未开始 / 仍未验证：

- [ ] **ModelScope Range 断点续传（用户 2026-10-28 要求先记录、以后再做）**：当前 ModelScope 下载只支持从头开始，暂停后继续会重新下载。候选方案是用 `.part` 文件 + sidecar 元数据保存 URL、ETag/Last-Modified、总大小与已完成字节；恢复时发送 `Range: bytes=<offset>-`，校验远端元数据未变化后追加写入，完成后再走 `ollama create`。需要服务端任务重启后可恢复，且不能与 Ollama pull 的原生 `*-partial` 机制混用。见 `RISKS.md` R-039。
- [ ] 缓存事故恢复待确认：`diodel/qwen3.5-0.8b-q4_k_m-gguf:latest` 与 `minicpm-v-4.7-1b-heretic:q4_k_m` 已被旧版清理删除；本机无 APFS 快照/Time Machine/Trash 副本，匿名 Ollama registry 查询均 404。已在 Hugging Face 找到 SHA256 完全匹配的公开 GGUF（`diodel/Qwen3.5-0.8B-Q4_K_M-GGUF` 与 `saidutta69/MiniCPM-V-4.7-1B-heretic`）；需确认是否下载（约 1.2 GB）、清理两个悬空 `manifests-v2` symlink 并用 `ollama create` 重建。不要在未确认时删除悬空链接。
- [ ] 文件管理器定位仅在 macOS 验证；Windows `explorer /select` 与 Linux `xdg-open` 分支未验证。
- [ ] 真实视觉模型推理（图片/视频帧）未验证；当前只用 mock `/api/chat` 检查了 `images` 请求体。
- [ ] 视频解码兼容性未逐格式验证；仅测试了 WebM/VP9，H.264/HEVC/MOV 可能因浏览器编解码器失败。
- [ ] 完整人工视觉/窄屏/a11y 验收（逐页点击、键盘、屏幕阅读器）。
- [ ] 真实 UI 中的模型加载/释放（`keep_alive`）与 `/api/ps` 状态变化；当前只有请求级单测。
- [ ] “全部卸载”未点击真实运行模型；仅验证按钮渲染与请求路径（`keep_alive: 0`）。
- [ ] 20 GB 级模型导出与跨文件系统完整复制未实测；当前真实导出为 529 MB，同卷 APFS clone。
- [ ] daemon 自动重启/停止未执行；macOS Automation 权限弹窗、systemd/Windows 分支与执行失败提示未实测。默认 `ALLOW_DAEMON_CONTROL` 关闭。
- [ ] 通过新 HF 直下路径执行真实大模型下载与真实 `ollama create`（小文件链路已用假 CLI 验证，未改动真实模型列表）；本机 DNS 仍把 CDN 解析为 `198.18.x.x`。
- [x] GitHub Actions 首次远端运行：2026-10-29 推送 `f8b66d0`，运行 `40739185722` 在 `ubuntu-latest` + Node 24 上通过 typecheck、lint、format:check、test 与 build。
- [ ] Tauri 迁移触发条件（D-114，仍待决策）。
- [ ] 图标子集化（Material Symbols 全量约 4 MB）。
- [x] 发布流程/版本 tag（`origin` 已配置；2026-10-29 手动发布 `v0.1.0`，无自动发布流水线）。

## 阻塞与待确认

| 事项 | 影响 | 入口 |
| --- | --- | --- |
| 外部模型源被本机 DNS/代理阻断 | `us.aws.cdn.hf.co` → `198.18.x.x`，`*.r2.cloudflarestorage.com`（Ollama 官方 registry blob）→ `198.18.0.245`，Ollama 原生 pull 报 `redirect target not allowed`；应用内 HF 已改为服务端 `fetch` 直下 + `ollama create`，小文件实测成功，Ollama 原生 pull 仍不可用 | `RISKS.md` R-024、R-049、`RUNBOOK.md` 5.1、13 |
| ModelScope 下载依赖本地服务与 `ollama create` | 需要本机安装 Ollama CLI；单文件上限 20 GB；无断点续传（Range 续传已列为待办，用户要求暂缓）；结果质量依赖 ModelScope 搜索 | `RISKS.md` R-039 |
| 远端 CI 仅覆盖 Ubuntu | 首次运行已通过，但未覆盖 macOS 运行时、菜单栏 App 构建与真实 Ollama；已手动发布 `v0.1.0`，无发布流水线 | `RISKS.md` R-029 |
| 代理令牌为共享密钥 | `VITE_PROXY_TOKEN` 进入前端产物；无 TLS/限流/审计 | `RISKS.md` R-025、D-126 |
| 人工验收未完成 | 视觉、窄屏、a11y、多步交互问题可能漏过 | `RISKS.md` R-015、R-021、D-131 |
| 真实加载/卸载未点击验证 | keep_alive 与 `/api/ps` 的 UI 反馈未覆盖 | `RISKS.md` R-028 |
| npm 默认缓存权限 `EPERM` | 直接 `npm install` 失败；当前使用 `.npm-cache/` 绕过 | `RISKS.md` R-017 |
| 模型库搜索依赖外部目录 | ollama.com HTML 结构、HF JSON API 与文件名量化推断 | `RISKS.md` R-022、R-023 |
| 缓存误删事故恢复待确认 | 两个模型已丢失；两个悬空 manifest 仍在；已找到 Hugging Face SHA256 精确源，待确认下载（约 1.2 GB）与重建 | `RISKS.md` R-042、`RUNBOOK.md` 14、`DECISIONS.md` D-140 |
| 文件管理器定位仅 macOS 验证 | Windows/Linux 分支未执行；Web 版依赖本地服务进程执行 `open`/`explorer`/`xdg-open` | `RISKS.md` R-043、`RUNBOOK.md` 14 |

## 下一步（建议顺序）

1. 人工验收：逐页检查 Models / Pull / Chat / Modelfile / Telemetry，重点看窄屏、键盘、主题/语言、多会话、代码块复制、空模型。
2. 先处理缓存事故：确认是否从已核对的 Hugging Face 源下载两个 GGUF（约 1.2 GB）、清理悬空 `manifests-v2` symlink 并用 `ollama create` 恢复；再用可用小模型在真实 UI 验证“加载到显存/释放显存”与“全部卸载”。
3. 用 27B 多模态模型验证导出 `model + projector` 到外接卷，核对 `*-mmproj.gguf`、磁盘空间与 SHA256；测试后删除导出文件。
4. 在用户明确同意且无下载/推理时，设置 `ALLOW_DAEMON_CONTROL=1` 测试一次重启，记录 macOS Automation 权限与恢复结果；失败则保留命令复制路径。
5. 用新 HF 直下路径下载并注册一个真实小模型（需要用户确认后执行），核对 `/api/tags` 与 `ollama show`；Ollama 原生 `hf.co` pull 只在正常网络下作为对照复测。
6. 缓存事故处理完成且 manifest 无悬空后，再评估是否从遥测页清理真实缓存；清理前记录 `GET /api/cache`，orphan 只会移入 `.ollama-studio-trash`，清理后复核 `/api/tags`、`ollama ps` 与回收站内容。
7. 观察 GitHub Actions 首次运行；再决定 D-114（Tauri）与 D-131（Playwright/axe）。
8. 视需要做图标子集化与 npm 缓存权限修复；发布流程已手动跑通，再评估是否改为 CI 自动发布。

> 以上是建议，不是已确认决策；执行前先在 `DECISIONS.md` 中确认。

## 证据入口

- API 客户端、拉取/删除/克隆/创建、加载/释放、令牌头：`src/api/ollama.ts`
- 数据映射：`src/api/ollamaMapper.ts`
- 模型库搜索：`src/api/catalog.ts`、`src/screens/PullScreen.tsx`
- ModelScope 渠道：`server/modelscope.ts`、`server/modelscope.test.ts`、`src/api/catalog.ts`、`src/components/CatalogResultRow.tsx`
- 后台下载任务：`server/downloads.ts`、`src/api/downloads.ts`、`src/App.tsx`、`src/screens/PullScreen.tsx`
- 缓存扫描与清理：`server/cache.ts`、`server/cache.test.ts`、`src/api/cache.ts`、`src/screens/TelemetryScreen.tsx`
- GGUF 导出：`server/exportGguf.ts`、`server/exportGguf.test.ts`、`src/api/export.ts`、`src/screens/ModelsScreen.tsx`
- 系统指标：`server/metrics.ts`、`server/metrics.test.ts`、`src/api/metrics.ts`、`src/screens/TelemetryScreen.tsx`
- daemon 检测/控制与启动命令：`server/daemon.ts`、`server/daemon.test.ts`、`src/api/daemon.ts`、`src/lib/daemonConfig.ts`、`src/screens/TelemetryScreen.tsx`
- 拉取任务与写操作：`src/App.tsx`、`src/screens/PullScreen.tsx`、`src/screens/ModelsScreen.tsx`
- 会话/参数/下载任务持久化：`src/lib/chatSessions.ts`、`src/lib/modelSettings.ts`、`src/lib/downloadTask.ts`
- 代码块解析：`src/lib/markdown.ts`
- 聊天 UI：`src/screens/ChatScreen.tsx`
- Modelfile 创建：`src/screens/ModelfileLabScreen.tsx`
- 遥测/系统指标/服务控制：`src/screens/TelemetryScreen.tsx`、`src/hooks/useOllama.ts`、`src/api/metrics.ts`、`src/api/daemon.ts`
- 开发代理与令牌：`vite.config.ts`
- GGUF 导入：`server/importGguf.ts`、`server.ts`、`vite.config.ts` 的 `/api/import`
- 生产代理、鉴权与静态托管：`server.ts`
- 测试与 CI：`src/**/*.test.ts`、`server/**/*.test.ts`、`vitest.config.ts`、`.github/workflows/ci.yml`
- 构建与脚本：`package.json`、`tsconfig.json`、`eslint.config.js`、`.prettierrc.json`
- 执行记录与验证命令：`RUNBOOK.md`
- 已知风险：`RISKS.md`
