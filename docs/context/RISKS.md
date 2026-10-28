# RISKS

> 有证据的问题、风险与验证缺口。任务涉及对应风险时读；证据或状态变化时更新。
>
> 最后核验：2026-10-28；范围：仓库代码、配置、依赖、测试、CI、Ollama 代理、真实拉取/删除/克隆/创建、模型库搜索、多会话与参数持久化、显存 keep_alive、构建与 headless DOM 冒烟。未做完整逐页人工视觉/a11y 验收；未在真实 UI 中点击验证模型加载/卸载。

## 风险与缺口

| ID | 风险 / 缺口 | 证据 | 影响 | 保护措施 / 下一步 | 状态 |
| --- | --- | --- | --- | --- | --- |
| R-001 | 演示界面可能被误认为已连接真实 Ollama | 拉取、删除、克隆、Modelfile、GGUF、遥测、参数默认值、显存 keep_alive、多会话均已接真实 API/CLI；剩余演示点仅为离线回退模型与部分精选列表 | 用户可能把未接线能力当成真实生效 | 保留顶部“演示数据”提示；导出 GGUF、清理、附件入口已禁用并说明原因 | 大部分缓解 |
| R-002 | 聊天回复曾是关键词硬编码 | 现已使用 `streamChat` + `/api/chat`；`src/api/ollama.test.ts` 覆盖流式解析、错误与中止 | 已能真实推理；视觉/长会话仍缺人工验收 | 保持单测；真实推理用用户指定小模型并卸载 | 已解决，待人工验收 |
| R-003 | 部分业务数据只存在内存 | 会话（v2 多会话）、模型参数、下载任务元数据、主题/语言、daemon 界面配置均已持久化；模型参数仅作为对话默认值 | 模型文件本身不被修改；未完成下载需重新拉取 | 按 D-119/D-125/D-130 保持边界；UI 已注明参数语义 | 已缓解 |
| R-004 | 依赖与构建未验证 | `npm ci`/安装、`typecheck`、`lint`、`format:check`、`test`、`build` 均通过；生成 `dist/`、`server.js` | 已缓解；本机 npm 缓存权限仍需绕过 | 保持锁文件；CI 在新环境复验；记录 Node/npm 版本 | 已缓解 |
| R-005 | 仓库未初始化 Git | 2026-10-28 执行 `git init -b main` 并创建本地基线提交（不推送） | 仍无远端、无协作流程 | 需要远端时由所有者创建并配置 remote；不擅自推送 | 部分缓解 |
| R-006 | 无测试、无 CI、无 ESLint/Prettier | 已添加 Vitest 59 个测试、`.github/workflows/ci.yml`、ESLint 10 flat config、Prettier 3 | 已建立回归保护；CI 尚未在 GitHub 实际运行 | 首次推送后观察 Actions 结果；按 D-123 维护 | 已解决（本地验证） |
| R-007 | 依赖与配置冗余、能力声明误导 | 已移除 `@google/genai`、`lucide-react`、`motion`、`tsx`、`autoprefixer`；`metadata.json` 不再声明 Gemini；包名改为 `ollama-studio` | 供应链面减小 | 新增依赖前确认实际引用 | 已解决 |
| R-008 | 开发服务器绑定 `0.0.0.0` | `dev` 改为 `vite --port=3000 --host=127.0.0.1`；新增显式 `dev:lan` | 默认只本机可访问 | `dev:lan` 仅可信网络临时使用；生产默认 loopback | 已解决 |
| R-009 | GGUF 导入依赖本机 Ollama CLI | `importGgufStream` 在上传非空后预检 `ollama --version`，缺失返回 503；开发/生产均已用真实 GGUF 验证 | 远端 Ollama 部署受限 | 保留 503 明确错误；后续评估 Ollama API blob 上传或桌面壳 | 部分缓解（本机可用） |
| R-010 | 国际化不完整 | 聊天、模型、拉取、实验室、遥测、命令面板、弹窗与演示模型/精选模型的描述均已按语言选择；拉取层状态保留 Ollama 返回的英文原文 | 英文模式下仅少数后端状态为英文 | 新增文案走 `translations.ts` 或 language 分支；后端状态原样展示 | 已解决（后端原文除外） |
| R-011 | 无许可证 | 已添加 Apache-2.0 `LICENSE`，`package.json` 声明 | 复用/分发状态明确 | 按 D-122 执行；第三方资产许可需单独确认 | 已解决 |
| R-012 | 外部字体/图标依赖网络 | 字体与 Material Symbols 已通过 npm 自托管，`index.html` 不再加载 Google Fonts | 离线可用；Material Symbols 全量 woff2 约 4 MB | 后续可做图标子集化 | 已解决（体积增大） |
| R-013 | TypeScript 未启用 `strict`，且无 ESLint | `strict` 已开启；ESLint 10 + typescript-eslint + react-hooks 已配置；Prettier 已格式化 | 类型/风格问题减少 | 保持 `typecheck` + `lint` 在 CI 中执行 | 已解决 |
| R-014 | 接入 Ollama 的安全边界未定 | 生产默认 `127.0.0.1`；可选 `PROXY_TOKEN` 保护 `/ollama` 与 `/api/import`；非 loopback 无令牌时启动警告 | 令牌是共享密钥，无 TLS/限流/审计 | 按 D-126 使用；跨网段部署前加反向代理与 TLS | 部分缓解 |
| R-015 | 可访问性与响应式未验证 | 新增移动端底部导航、`lg` 断点布局、`:focus-visible` 样式与 `aria-label`；未做屏幕阅读器/窄屏逐页验收 | 仍有组件级 a11y 缺陷可能漏过 | 按 D-131 评估 Playwright/axe 或人工审计 | 部分缓解 |
| R-016 | 加载本地大模型会造成卡顿与内存压力 | 2026-10-28 真实聊天测试使用 1B 小模型，测试后卸载；本次开发未加载模型 | 测试可能拖慢机器 | 遵循 D-106/D-120：优先 tags/ps/mock；必须加载时用指定小模型并卸载 | 已缓解（有纪律） |
| R-017 | npm 默认缓存权限导致安装失败 | `npm install` 曾报 `EPERM`；当前使用 `--cache .npm-cache` 成功 | 新环境直接安装可能失败；`.npm-cache/` 占空间 | 修复缓存所有权；CI 使用默认缓存不受影响 | 已绕过，未根治 |
| R-018 | 流式解析缺少自动化测试 | 已添加 `streamChat`/`pullModel` 分片、错误、中止测试与 mapper/存储测试 | 回归风险显著降低 | 继续覆盖真实错误体与超时 | 已解决 |
| R-019 | 生产代理无鉴权 | 默认 loopback；设置 `PROXY_TOKEN` 后 `/ollama`、`/api/import` 返回 401/200 已验证；`/api/catalog`、`/api/hf` 仍无鉴权 | 若暴露且未设令牌，同网段可调用模型/导入 | 按 D-126；不要把 `PROXY_TOKEN` 当用户级认证 | 部分缓解 |
| R-020 | 在线但 0 个模型时仍可能显示演示模型 | `App.tsx` 在线且 0 模型时把 `selectedModel`/`chatModel` 置空；Models/Chat/ModelfileLab 均有空状态 | 已不再请求不存在的演示模型 | 保留空状态测试（未做组件级单测） | 已解决 |
| R-021 | 缺少浏览器端完整交互验收 | 2026-10-28 用 headless Chrome 验证生产 3101/开发 3001 首屏渲染、真实模型列表、代理与鉴权；未逐页点击/视觉/窄屏/a11y | 交互与样式问题可能漏过 | 人工验收清单；后续按 D-131 引入 E2E | 部分缓解 |
| R-022 | 模型库搜索依赖 ollama.com HTML 结构 | `src/api/catalog.ts` 解析 HTML；代理只读；2026-10-28 曾验证 200 HTML | 官网改版/限流/离线会导致搜索失效 | 解析失败显示官网链接与本地精选；不持久化 HTML | 已缓解（只读兜底） |
| R-023 | Hugging Face 搜索依赖 API 与文件名量化推断 | 使用 JSON API 与 siblings 文件名；量化标签为推断结果 | 限流/离线时失败；标签可能缺失或误判 | 保留官网链接；UI 标注推断；真实拉取失败显示 Ollama 错误 | 部分缓解 |
| R-024 | Hugging Face 拉取被本机 DNS/代理阻断 | `us.aws.cdn.hf.co` 解析为 `198.18.0.85`，Ollama 报 `redirect target not allowed`；`curl` 可下载同一 GGUF | 本机无法通过 Ollama 直拉 HF 模型 | 换正常 DNS/网络复测；或下载 GGUF 后本地导入 | 已记录（环境限制） |
| R-025 | `PROXY_TOKEN` 是共享密钥并进入前端产物 | `VITE_PROXY_TOKEN` 在构建时嵌入 JS；无用户级身份、TLS、限流 | 拿到前端产物的人可获得令牌 | 仅在可信网络使用；需要更强边界时用反向代理/身份层 | 待接受/待评估 |
| R-026 | 字体图标自托管增加构建体积 | `material-symbols-outlined.woff2` 约 4 MB；构建输出包含多语言字体子集 | 首屏字体下载增大（本地应用影响较小） | 后续按实际使用图标子集化 | 已知，低 |
| R-027 | TypeScript 固定 6.0.3 以兼容 lint 工具 | typescript-eslint peer 要求 `<6.1.0`；升级 TS 7 会 ERESOLVE | 无法使用 TS 7 新特性/性能改进 | 等 typescript-eslint 支持后升级并复验 | 已知，待后续 |
| R-028 | 模型加载/卸载只做了请求级单测 | `loadModel`/`unloadModel` 的 `/api/generate`、`/api/embed`、`keep_alive` 已由 Vitest 校验；未在真实 UI 点击加载/释放 | 真实 `/api/ps` 状态变化与错误提示可能未覆盖 | 用 1B 小模型人工验收一次并卸载；记录 `/api/ps` | 未验证 |
| R-029 | GitHub Actions 尚未实际运行 | 仅本地执行了与 CI 相同的命令；无远端仓库 | 环境差异（Node 缓存、字体安装）可能失败 | 初始化远端后观察首次运行；必要时调整 | 待核实 |

## 建议优先级

1. **人工验收**：逐页检查窄屏、键盘操作、主题/语言切换、多会话、代码块复制、空模型状态。
2. **R-028**：用 `minicpm-v-4.7-1b-heretic:q4_k_m` 在真实 UI 验证加载/释放与 `/api/ps`，测试后卸载。
3. **R-024**：在正常网络复测 HF 拉取；若仍失败，保留手动下载/本地导入指引。
4. **R-029 / R-019 / R-025**：配置远端后观察 CI；确认是否需要更强的代理鉴权/TLS。
5. **R-015 / R-021 / D-131**：评估 Playwright + axe，或继续人工验收。
6. **R-017 / R-026 / R-027**：缓存权限、图标子集化、TS 升级作为维护项。

> 以上是建议，不是已确认决策；执行前在 `DECISIONS.md` 中确认对应事项。
