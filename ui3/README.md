# UI3 并行界面

UI3 是基于 `design/UI3/` 设计稿实现的一套独立界面：鼠尾草绿、可可棕与杏色的本地模型工作室。它和现有界面并行存在，方便后续多人评审定稿。

## 入口与边界

| 界面 | 入口 | 源码 |
| --- | --- | --- |
| 经典界面（默认） | `/` | `src/` |
| UI3 | `/ui3/` | `ui3/` |
| 历史界面 | 保留原状 | `ui-legacy/`、`ui-redesign/` |
| UI3 设计参考 | 不参与构建 | `design/UI3/` |

- `/` 仍是默认界面；接入 UI3 没有修改 `src/`、`ui-legacy/`、`ui-redesign/` 的任何文件。
- UI3 是独立的 Vite 多页入口：开发时访问 `/ui3/`，构建后输出 `dist/ui3/index.html` 与带哈希的静态资源。
- 原有的 `UI3/` 设计素材已原样移动到 `design/UI3/`，避免 macOS 大小写不敏感文件系统与 Linux CI 对 `UI3/`、`ui3/` 的路径混淆。

## 页面

- **即时对话**：按模型保存的多会话、流式回复、停止生成、思考折叠、代码块、图片/视频附件、JSON/思考/流式开关、系统人设、参数滑杆与 zen 模式。
- **模型库**：真实模型列表、筛选、网格/列表、加载/释放、克隆、删除、GGUF 导出、抽屉内参数与 Modelfile 预览。
- **发现与拉取**：CLI 命令、Ollama / ModelScope / Hugging Face 搜索、量化选择、搜索结果收藏（本地快照，不下载，默认收起；与经典界面共用）、服务端后台任务、暂停/继续/取消/重试、GGUF 拖放导入。
- **Modelfile 实验室**：预设、语法高亮编辑器、参数滑杆改写 `PARAMETER`、本地校验、真实 `/api/create` 构建与构建历史。
- **监控与设置**：守护进程信息与受控命令、运行模型卸载、磁盘/内存/CPU/GPU 指标、事件日志、缓存扫描清理、主题/语言/偏好、环境变量启动命令。

## 运行

```bash
npm run dev
# 浏览器打开 http://127.0.0.1:39471/ui3/

npm run build:web
# 产物：dist/ui3/index.html
```

生产服务器沿用现有 `server.ts` 的静态托管与鉴权，`npm start` 后访问 `/ui3/`。

## 状态共享

UI3 通过 `ui3/lib/legacy.ts` 只读复用现有 API 与业务逻辑，不复制服务端协议。以下数据与经典界面共用：

- `ollama_chat_sessions_v2`：会话
- `ollama_model_settings_v1`：模型参数默认值
- `ollama_language`：语言
- `ollama_model_origin_v1`：下载来源
- `ollama_favorite_models_v1`：搜索结果收藏快照（经典界面与 UI3 共用）
- `ollama_daemon_config_v1`：守护进程环境配置

UI3 自己的界面状态使用 `ollama_ui3_*` 前缀，包括主题、强调色、偏好、对话开关、人设、下载记录、当前页面、量化偏好、环境变量、Modelfile 草稿、构建历史、当前模型与拉取输入。卸载 UI3 或回退经典界面不会清理共享的会话与模型参数。

## 验证记录

验证日期：2026-11-08。验证对象：`ui3/`、`vite.config.ts` 的 UI3 入口。

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run format:check`：通过。
- `npm test`：206/206 通过（一次机器高负载运行时曾有 1 个既有缓存测试 5 秒超时，隔离运行与最终全量复跑均通过）。
- `npm run build`：通过；产物含 `dist/ui3/index.html` 与 `server.js`。
- 生产服务器实测：`PORT=3107 node server.js` 后 `/ui3/` 返回 200，入口 JS 静态资源返回 200。
- 浏览器实测：用本机 Vite 开发服务器 + Puppeteer/headless Chrome 检查了 1440px 桌面五页、深色主题、1024px 平板五页与 390px 移动端五页；页面无横向溢出，控制台无脚本错误。
- 交互实测：⌘K 命令面板可打开/关闭并自动聚焦；账户菜单可打开主题调色盘，五个强调色、三种明暗模式与语言切换均渲染；移动端模型卡片点击后打开抽屉，关闭按钮与底部操作按钮均可用。
- 收藏实测（2026-11-08）：headless Chrome 拦截 ModelScope 搜索响应，在 UI3 与经典界面分别收藏同一结果；收藏写入 `ollama_favorite_models_v1` 快照（含量化与 GGUF 文件），未向 `/api/pull`、`/api/downloads`、`/api/modelscope/pull` 发送 POST；刷新后收藏夹仍在，取消收藏后消失。
- UI3 验证期间未加载真实模型、未发起真实推理/下载/`ollama create`，也未执行守护进程启停；这些链路的服务端逻辑与经典界面共用。
- 未做完整的逐页键盘与屏幕阅读器 a11y 验收。

## 后续

- 多人评审后在 UI3 与经典界面之间定稿；定稿前两套入口继续并行。
- 如需把 UI3 设为默认，只需调整服务器根路径的静态入口，不需要改动现有页面代码。
