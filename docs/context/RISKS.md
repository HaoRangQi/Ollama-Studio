# RISKS

> 有证据的问题、风险与验证缺口。任务涉及对应风险时读；证据或状态变化时更新。
>
> 最后核验：2026-10-28；范围：仓库代码、配置、依赖、测试、CI、Ollama 代理、真实拉取/删除/克隆/创建、模型库搜索、后台下载任务、缓存扫描/清理（fixture）、缓存明细与文件管理器定位（macOS）、UI 状态轮询、多会话与参数持久化、显存 keep_alive、GGUF 导出（fixture + 真实 0.8B）、系统指标与 daemon 只读检测、构建与 headless DOM 冒烟。未做完整逐页人工视觉/a11y 验收；未在真实 UI 中点击验证模型加载/卸载与“全部卸载”；未执行 daemon 自动重启/停止；未对真实 Ollama 目录执行清理。

## 风险与缺口

| ID | 风险 / 缺口 | 证据 | 影响 | 保护措施 / 下一步 | 状态 |
| --- | --- | --- | --- | --- | --- |
| R-001 | 演示界面可能被误认为已连接真实 Ollama | 拉取、删除、克隆、Modelfile、GGUF 导入/导出、遥测、参数默认值、显存 keep_alive、多会话均已接真实 API/CLI；剩余演示点仅为离线回退模型与部分精选列表 | 用户可能把未接线能力当成真实生效 | 保留顶部“演示数据”提示；PDF/任意附件仍明确拒绝；缓存清理已接真实 `/api/cache`（R-042）；GGUF 导出已接真实 manifest/blob（R-046） | 大部分缓解 |
| R-002 | 聊天回复曾是关键词硬编码 | 现已使用 `streamChat` + `/api/chat`；`src/api/ollama.test.ts` 覆盖流式解析、错误与中止 | 已能真实推理；视觉/长会话仍缺人工验收 | 保持单测；真实推理用用户指定小模型并卸载 | 已解决，待人工验收 |
| R-003 | 部分业务数据只存在内存 | 会话（v2 多会话）、模型参数、下载任务元数据、主题/语言、daemon 界面配置均已持久化；模型参数仅作为对话默认值 | 模型文件本身不被修改；未完成下载需重新拉取 | 按 D-119/D-125/D-130 保持边界；UI 已注明参数语义 | 已缓解 |
| R-004 | 依赖与构建未验证 | `npm ci`/安装、`typecheck`、`lint`、`format:check`、`test`、`build` 均通过；生成 `dist/`、`server.js` | 已缓解；本机 npm 缓存权限仍需绕过 | 保持锁文件；CI 在新环境复验；记录 Node/npm 版本 | 已缓解 |
| R-005 | 仓库未初始化 Git | 2026-10-28 执行 `git init -b main` 并创建本地基线提交（不推送） | 仍无远端、无协作流程 | 需要远端时由所有者创建并配置 remote；不擅自推送 | 部分缓解 |
| R-006 | 无测试、无 CI、无 ESLint/Prettier | 已添加 Vitest 65 个测试、`.github/workflows/ci.yml`、ESLint 10 flat config、Prettier 3 | 已建立回归保护；CI 尚未在 GitHub 实际运行 | 首次推送后观察 Actions 结果；按 D-123 维护 | 已解决（本地验证） |
| R-007 | 依赖与配置冗余、能力声明误导 | 已移除 `@google/genai`、`lucide-react`、`motion`、`tsx`、`autoprefixer`；`metadata.json` 不再声明 Gemini；包名改为 `ollama-studio` | 供应链面减小 | 新增依赖前确认实际引用 | 已解决 |
| R-008 | 开发服务器绑定 `0.0.0.0` | `dev` 改为 `vite --port=3000 --host=127.0.0.1`；新增显式 `dev:lan` | 默认只本机可访问 | `dev:lan` 仅可信网络临时使用；生产默认 loopback | 已解决 |
| R-009 | GGUF 导入依赖本机 Ollama CLI | `importGgufStream` 在上传非空后预检 `ollama --version`，缺失返回 503；开发/生产均已用真实 GGUF 验证 | 远端 Ollama 部署受限 | 保留 503 明确错误；后续评估 Ollama API blob 上传或桌面壳 | 部分缓解（本机可用） |
| R-010 | 国际化不完整 | 聊天、模型、拉取、实验室、遥测、命令面板、弹窗与演示模型/精选模型的描述均已按语言选择；拉取层状态保留 Ollama 返回的英文原文 | 英文模式下仅少数后端状态为英文 | 新增文案走 `translations.ts` 或 language 分支；后端状态原样展示 | 已解决（后端原文除外） |
| R-011 | 无许可证 | 已添加 Apache-2.0 `LICENSE`，`package.json` 声明 | 复用/分发状态明确 | 按 D-122 执行；第三方资产许可需单独确认 | 已解决 |
| R-012 | 外部字体/图标依赖网络 | 字体与 Material Symbols 已通过 npm 自托管，`index.html` 不再加载 Google Fonts | 离线可用；Material Symbols 全量 woff2 约 4 MB | 后续可做图标子集化 | 已解决（体积增大） |
| R-013 | TypeScript 未启用 `strict`，且无 ESLint | `strict` 已开启；ESLint 10 + typescript-eslint + react-hooks 已配置；Prettier 已格式化 | 类型/风格问题减少 | 保持 `typecheck` + `lint` 在 CI 中执行 | 已解决 |
| R-014 | 接入 Ollama 的安全边界未定 | 生产默认 `127.0.0.1`；可选 `PROXY_TOKEN` 保护 `/ollama` 与本地管理 API（含 import/modelscope/downloads/cache/export/metrics/daemon）；非 loopback 无令牌时启动警告 | 令牌是共享密钥，无 TLS/限流/审计 | 按 D-126 使用；跨网段部署前加反向代理与 TLS | 部分缓解 |
| R-015 | 可访问性与响应式未验证 | 新增移动端底部导航、`lg` 断点布局、`:focus-visible` 样式与 `aria-label`；未做屏幕阅读器/窄屏逐页验收 | 仍有组件级 a11y 缺陷可能漏过 | 按 D-131 评估 Playwright/axe 或人工审计 | 部分缓解 |
| R-016 | 加载本地大模型会造成卡顿与内存压力 | 2026-10-28 真实聊天测试使用 1B 小模型，测试后卸载；本次开发未加载模型 | 测试可能拖慢机器 | 遵循 D-106/D-120：优先 tags/ps/mock；必须加载时用指定小模型并卸载 | 已缓解（有纪律） |
| R-017 | npm 默认缓存权限导致安装失败 | `npm install` 曾报 `EPERM`；当前使用 `--cache .npm-cache` 成功 | 新环境直接安装可能失败；`.npm-cache/` 占空间 | 修复缓存所有权；CI 使用默认缓存不受影响 | 已绕过，未根治 |
| R-018 | 流式解析缺少自动化测试 | 已添加 `streamChat`/`pullModel` 分片、错误、中止测试与 mapper/存储测试 | 回归风险显著降低 | 继续覆盖真实错误体与超时 | 已解决 |
| R-019 | 生产代理无鉴权 | 默认 loopback；设置 `PROXY_TOKEN` 后 `/ollama`、`/api/import` 返回 401/200 已验证；新增 export/metrics/daemon 同受保护但未单独复测 401；`/api/catalog`、`/api/hf` 仍无鉴权 | 若暴露且未设令牌，同网段可调用模型/导入/控制 daemon | 按 D-126；不要把 `PROXY_TOKEN` 当用户级认证 | 部分缓解 |
| R-020 | 在线但 0 个模型时仍可能显示演示模型 | `App.tsx` 在线且 0 模型时把 `selectedModel`/`chatModel` 置空；Models/Chat/ModelfileLab 均有空状态 | 已不再请求不存在的演示模型 | 保留空状态测试（未做组件级单测） | 已解决 |
| R-021 | 缺少浏览器端完整交互验收 | 2026-10-28 用 headless Chrome 验证生产 3101/开发 3001 首屏渲染、真实模型列表、代理与鉴权；未逐页点击/视觉/窄屏/a11y | 交互与样式问题可能漏过 | 人工验收清单；后续按 D-131 引入 E2E | 部分缓解 |
| R-022 | 模型库搜索依赖 ollama.com HTML 结构 | `src/api/catalog.ts` 解析 HTML；代理只读；2026-10-28 曾验证 200 HTML | 官网改版/限流/离线会导致搜索失效 | 解析失败显示官网链接与本地精选；不持久化 HTML | 已缓解（只读兜底） |
| R-023 | Hugging Face 搜索依赖 API 与文件名量化推断 | 使用 JSON API 与 siblings 文件名；量化标签为推断结果 | 限流/离线时失败；标签可能缺失或误判 | 保留官网链接；UI 标注推断；真实拉取失败显示 Ollama 错误 | 部分缓解 |
| R-024 | 外部模型源下载被本机 DNS/代理阻断 | `us.aws.cdn.hf.co` 解析为 `198.18.0.85`（2026-10-28 复核仍如此）；Ollama 官方 registry 的 blob CDN `*.r2.cloudflarestorage.com` 解析为 `198.18.0.245`（2026-10-28 后台任务实测 `redirect target not allowed`）。Ollama 报 `redirect target not allowed`；`curl -L` 下载同一 URL 返回 200，下载后 SHA256 与 HF `lfs.oid` 一致，`ollama create` 可成功导入（2026-10-28 用 MiniCPM5-1B Q4_K_M 实测） | 本机无法通过 Ollama 直拉 HF 模型；UI 内“下载”按钮对此类模型必然失败 | 换正常 DNS/网络复测；或 `curl` 下载 GGUF 后 `ollama create` 本地导入（已验证）。2026-10-28 起拉取页默认渠道改为 ModelScope（R-039），HF 保留为第二个 tab | 已缓解（默认走 ModelScope；环境限制仍在） |
| R-025 | `PROXY_TOKEN` 是共享密钥并进入前端产物 | `VITE_PROXY_TOKEN` 在构建时嵌入 JS；无用户级身份、TLS、限流 | 拿到前端产物的人可获得令牌 | 仅在可信网络使用；需要更强边界时用反向代理/身份层 | 待接受/待评估 |
| R-026 | 字体图标自托管增加构建体积 | `material-symbols-outlined.woff2` 约 4 MB；构建输出包含多语言字体子集 | 首屏字体下载增大（本地应用影响较小） | 后续按实际使用图标子集化 | 已知，低 |
| R-027 | TypeScript 固定 6.0.3 以兼容 lint 工具 | typescript-eslint peer 要求 `<6.1.0`；升级 TS 7 会 ERESOLVE | 无法使用 TS 7 新特性/性能改进 | 等 typescript-eslint 支持后升级并复验 | 已知，待后续 |
| R-028 | 模型加载/卸载只做了请求级单测 | `loadModel`/`unloadModel` 的 `/api/generate`、`/api/embed`、`keep_alive` 已由 Vitest 校验；未在真实 UI 点击加载/释放 | 真实 `/api/ps` 状态变化与错误提示可能未覆盖 | 用 1B 小模型人工验收一次并卸载；记录 `/api/ps` | 未验证 |
| R-029 | GitHub Actions 尚未实际运行 | 仅本地执行了与 CI 相同的命令；无远端仓库 | 环境差异（Node 缓存、字体安装）可能失败 | 初始化远端后观察首次运行；必要时调整 | 待核实 |
| R-030 | 附件以 base64 存入 `localStorage`，可能超配额 | 每条消息最多 6 个附件、数据 URL 合计最多 4M 字符；`saveChatStore` 失败时显示“可能不会保留”提示 | 大量图片会占用存储，刷新后可能丢失附件或整个会话 | 控制附件数量/尺寸；后续评估 IndexedDB；失败提示已存在 | 部分缓解 |
| R-031 | 真实多模态推理未验证 | 附件测试用页面内 mock `/api/chat` 捕获请求，确认发送 1 张图片 + 3 个视频帧；未让真实模型解析 | 模型可能忽略图片、拒绝图片或返回错误；当前 MiniCPM 1B 的 capabilities 未声明 vision | 用声明 vision 的模型（如 `huihui_ai/qwen3.8-abliterated:27b-q4_K_L`）人工验证一次，记录结果并卸载 | 未验证 |
| R-032 | 视频抽帧依赖浏览器编解码器 | 仅用 WebM/VP9 验证；H.264/HEVC/MOV 未测 | 部分视频会报“浏览器无法解码”，无法生成帧 | 错误提示换 MP4/WebM；后续测常见格式或引入转码 | 部分缓解 |
| R-033 | Ollama 不接受 PDF/任意文件 | `/api/chat` 只有 `images` 字段；UI 选择器仅接受 `image/*,video/*`，其他文件明确拒绝 | 用户可能误以为可以上传 PDF/文档 | UI/README 明确边界；PDF 需先转图片或使用其他工具 | 已记录（能力限制） |
| R-034 | 显存数值曾被放大 1000 倍 | 旧实现 `parseFloat(model.vramUsage)` 把 `formatBytes` 产出的 `926 MB` 解析成数字 926 后按 GB 显示；2026-10-28 CDP 用 mock `/api/ps`（`size_vram: 926000000`）复现并修复，Sidebar 与遥测页现显示 `926 MB` | 用户误判显存占用 | 已改用 `OllamaModel.sizeVramBytes` + `formatBytes`；mapper 单测覆盖 `sizeVramBytes` | 已解决 |
| R-035 | 自定义强调色可能降低对比度 | 取色器允许任意颜色，过亮色（如 `#eab308`）上的白色按钮文字对比不足 | 可读性下降，WCAG 未达 AA | UI 提示过亮色风险；后续可加自动亮度校正或对比度检测 | 部分缓解 |
| R-038 | 危险操作颜色在浅色主题下不可读 | 删除按钮硬编码 `text-[#ffb4ab]`（浅粉）叠加 `bg-[#93000a]/20`，浅色主题下变成粉底粉字；实测对比度远低于 WCAG AA | 用户看不清“从磁盘彻底移除此权重”，误以为功能缺失 | 已修：新增 `--app-danger-*` 主题变量，浅色主题反转为 `#b3261e` 深红字 + 8% 浅红底；浅色 5.22 / 深色 10.37，均达 AA（2026-10-28 CDP 实测） | 已解决 |
| R-037 | 模型卡“选中态”判定恒为真 | `const isSelected = model.id === model.id;` 自比较永远成立，导致所有卡片都套用选中样式，用户无法区分当前选中模型，也无法通过选中样式找到操作入口 | 选中反馈失效，卡片视觉层级混乱 | 已修：改为 `model.id === selectedModel?.id`，选中态改为淡主题色背景 + 主题色边框；1440px 下三张卡片仅一张带选中样式（2026-10-28 CDP 验证） | 已解决 |
| R-036 | 下载任务卡与模型卡动作条在内容过长时排版塌陷 | ① 下载任务卡：`hf.co/...` 完整模型名不截断且左侧缺 `min-w-0`，“速率:”被折成两行（25×33 px）。② 模型卡动作条：左侧“保留至 …”占位后，“释放显存/即刻推理”被压成竖排圆钮（71×78 px），视觉上不像按钮，用户因此找不到卸载入口。CDP 复现并测量 | 指标文字竖排、卡片异常变高、按钮不可识别 | 已修：两处均补 `min-w-0` + `truncate` + 右侧 `shrink-0` + `whitespace-nowrap`；错误信息改 2 行截断 + 展开开关。修复后速率标签 25×17 px 单行、释放显存按钮 104×36 px；1440/1280/1100/820 px 四档验证通过 | 已解决 |

| R-039 | ModelScope 下载依赖本地服务与 `ollama create` | Ollama 不支持 `pull` ModelScope 仓库，只能由 `/api/modelscope/pull` 把 GGUF 下载到临时目录后调用 `ollama create`；单文件上限 20 GB；直链不带 `content-length`，总大小回退到文件列表 API 的 `Size`（2026-10-28 实测 101,016,128 字节）；搜索关键字在服务端追加 `gguf` | 部分模型（分片 GGUF、非 GGUF 仓库、超过 20 GB）无法下载；无断点续传，暂停后恢复从头下载；需要本机安装 Ollama CLI | UI 说明走服务端下载；分片 GGUF 已从量化列表过滤；错误以 NDJSON 回传并显示在任务卡；用户 2026-10-28 要求把 Range 断点续传先记录、以后再做（方案：`.part` + sidecar 元数据 + `Range`，恢复前校验 ETag/总大小，见 `NOW.md`）。刷新/暂停后的恢复问题已由后台任务解决（R-040） | 部分缓解 |
| R-040 | 后台下载任务只存在于服务端内存 | `server/downloads.ts` 的任务表是进程内 `Map`，已结束任务保留 5 分钟后清理；服务端重启或进程退出会丢失运行中的任务与进度 | 重启后前端显示“后台任务已丢失，请重新下载”；ModelScope 文件已下载的部分被删除，需要重新下载；Ollama pull 的已下载 blob 仍可复用 | 任务卡明确提示；`GET /api/downloads/<id>` 返回 404 时降级为“已中断”；如需跨重启恢复，后续可落盘任务状态 | 已知（有界） |
| R-041 | 刷新后自动跳回“发现拉取”页 | 页面挂载时若发现运行中的后台任务，会切到拉取页展示进度 | 用户在其他页面刷新时会被带离原页面（每次加载只跳一次） | 若体验不佳可改为顶部常驻进度指示 | 待观察 |
| R-042 | 缓存清理可能误删被引用权重或正在写入的文件 | `server/cache.ts` 的边界：只删未被任何 manifest 引用的完整 blob、`*-partial`/`*-partial-N` 与 `ollama-studio-*` 临时目录；清理前重新扫描；manifest 解析失败时拒绝 orphan（409）；后台下载进行中拒绝 partial（409）；10 分钟内修改的文件跳过。`server/cache.test.ts` 14 项通过（含清理、明细与定位校验）；fixture 实测释放 10,004,096 字节且保留被引用 blob；真实 `~/.ollama/models` 只读扫描约 4.66 GB 可回收，**未执行删除** | manifest 目录结构变化或权限错误可能让“无引用”判断失真；用户手动放入 blobs 的文件可能被当作孤儿 | 真实清理需用户从 UI 确认；清理前记录 `GET /api/cache`，清理后复核 `/api/tags`、`ollama ps` 与模型加载；解析异常时保持锁定 | 已缓解，真实清理待确认 |
| R-043 | 文件管理器定位接口由本地服务执行系统命令 | `POST /api/cache/reveal` 只允许 `OLLAMA_MODELS` 目录内路径或系统临时目录下 `ollama-studio-*`，并用 `realpath` 防止符号链接越界；空路径 400、越界 403、不存在 404；macOS 允许路径 200（实际 `open`）。fixture UI 通过 CDP 确认请求体为对应绝对路径 | 若路径校验被绕过，可能打开任意本地路径；Web 版依赖本地服务进程；无图形会话可能失败 | 路径白名单 + `realpath` + POST JSON；生产/开发都受 `PROXY_TOKEN` 可选保护；失败返回 403/404/501 | 已缓解，Windows/Linux 与无图形会话待验证 |
| R-044 | 每 5 秒轮询带来的额外请求与双实例开销 | `useOllama` 默认每 5 秒请求 `/api/version`、`/api/tags`、`/api/ps`；并发刷新共享 Promise；`App` 与 `TelemetryScreen` 各有一个 hook 实例，遥测页打开时两套轮询并行（实测间隔约 5 秒，交错后约 2.5 秒一次）；静默轮询不切 `connecting` | 本地 Ollama 负载很小；若将来连接远程/慢速 Ollama 或模型列表很大，可能增加延迟与网络开销；页面隐藏时仍会轮询（浏览器会节流） | 已提供 `useOllama(0)` 关闭开关；只读接口；如需要可改为按页面可见性暂停或共享单一 hook 实例 | 已知（低），暂不优化 |
| R-045 | 失败重试依赖任务里保存的来源信息 | `DownloadTask.source` 只在新建 ModelScope 任务时写入；旧版本 localStorage 任务没有 source，重试回退用 `targetPath` 作为文件名，文件位于子目录时可能 404；没有 `kind` 的旧任务按 `.gguf` 后缀推断来源，若 targetPath 被改过可能误判；pull 任务按模型标签重跑，无法修正用户输错的标签 | 刷新后旧失败任务可能无法直接重试成功；错误命令原样重试仍会失败；误判来源会再次失败 | 失败卡显示“将重跑”的具体命令；pull 任务可“编辑命令”，用户可改成 `hf.co/` 前缀或从 ModelScope 重新下载；错误提示引导来源切换。CDP mock 已验证 pull、ModelScope、旧任务推断与编辑命令，**未对真实模型源重试** | 已缓解，真实源待验证 |
| R-046 | GGUF 导出依赖 manifest 布局与磁盘空间 | `server/exportGguf.ts` 同时查 `manifests/` 与 `manifests-v2/`，默认 registry 尝试 `registry.ollama.ai` 与 `ollama.com`；真实 0.8B 导出 529,297,312 字节，SHA256 与 manifest 一致；fixture 覆盖 model+projector、重名、越界目录、缺失 blob；**27B（21.8 GB）与跨文件系统未测** | 旧/新 Ollama manifest 布局变化会 404；跨卷完整复制可能耗时并占空间；导出文件只是权重，不含 template/license/params；用户可能误以为已注册回 Ollama | 导出目录白名单 + `realpath`；重名自动序号；复制后校验大小，失败删除半成品；APFS clone；错误返回 404/422/403/507。下一步用 27B 多模态模型导出到外接卷并校验 mmproj（R-046） | 部分验证 |
| R-047 | daemon 自动控制可能中断服务或触发权限问题 | `GET /api/daemon` 本机识别 `ollama-app` 与 PID；`POST /api/daemon/control` 默认 403；命令由受控字段生成，未执行真实重启/停止；Ollama.app 走 AppleScript，macOS 可能弹 Automation 权限；systemd 命令含 sudo，未自动执行；Windows 未实现 | 重启/停止会中断推理与下载；权限失败会留下“已发送”但服务未恢复的误解；错误 manager 判断可能发错命令 | 默认仅复制命令；自动执行需 `ALLOW_DAEMON_CONTROL=1` + loopback + `confirm:true` + `canExecute`；systemd/普通进程不自动执行；执行后刷新状态并显示错误。真实重启需用户明确同意后测试（R-047） | 未验证自动执行 |
| R-048 | 系统指标口径与平台差异 | `/api/metrics` 真实返回磁盘、内存、CPU 与 `ioreg` GPU；GPU 仅 macOS，`ioreg` 字段可能随系统变化；`os.freemem()` 是“空闲”而非 inactive/cached 可用量；ANE 无公开 API，固定不可用；Linux/Windows 与命令失败分支未实测 | 用户可能把“空闲内存”当作“可用内存”，或在非 macOS 看到不可用而误以为功能坏了；`ioreg` 改版可能使 GPU 永远不可用 | 返回 `reason` 并在 UI 显示；内存文案用“空闲”；GPU 不可用时保留 Ollama 自己报告的 VRAM；ANE 明确“无公开指标”。下一步在 Linux/Windows 与 `ioreg` 失败场景验证（R-048） | 部分验证 |

## 建议优先级

1. **人工验收**：逐页检查窄屏、键盘操作、主题/语言切换、多会话、代码块复制、空模型状态。
2. **R-031**：用声明 vision 能力的模型人工验证图片/视频帧推理；选择资源可接受的模型，测试后卸载。
3. **R-028**：用 `minicpm-v-4.7-1b-heretic:q4_k_m` 在真实 UI 验证加载/释放与 `/api/ps`，测试后卸载。
4. **R-024**：在正常网络复测 HF 拉取；若仍失败，保留手动下载/本地导入指引。
5. **R-046**：用 27B 多模态模型导出到外接卷，校验 model + mmproj 与磁盘空间；测试后删除导出文件。
6. **R-047**：获得用户明确同意且无下载/推理时，设置 `ALLOW_DAEMON_CONTROL=1` 测试一次重启，记录 Automation 权限与恢复结果。
7. **R-048**：在 Linux/Windows 与 `ioreg` 失败场景验证指标回退文案。
8. **R-029 / R-019 / R-025**：配置远端后观察 CI；确认是否需要更强的代理鉴权/TLS。
9. **R-015 / R-021 / D-131**：评估 Playwright + axe，或继续人工验收。
10. **R-017 / R-026 / R-027 / R-030 / R-032**：缓存权限、图标子集化、TS 升级、附件存储与视频编码作为维护项。

> 以上是建议，不是已确认决策；执行前在 `DECISIONS.md` 中确认对应事项。
