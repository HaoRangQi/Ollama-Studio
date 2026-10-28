# 2026-10-27 原型基线

> 历史归档：记录真实 API 接入前的状态，便于追溯“哪些能力曾经只是演示”。当前事实见 `docs/context/NOW.md`。

## 背景

2026-10-27 首次为仓库建立文档体系时，Ollama Studio 是一个纯前端设计原型：React + TypeScript + Vite，视觉与交互完整，但没有后端、没有 Ollama API 调用。

## 当时结论

- 模型、精选模型、下载任务、聊天消息、daemon 配置与日志来自 `src/data/mockData.ts` 和组件内 state。
- `ChatScreen.handleSendMessage` 用 `setTimeout` + 关键词分支返回固定回复，没有真实推理。
- `Header` 每 2.8 秒随机波动 GPU/吞吐指标；`TelemetryScreen` 每 3.6 秒随机追加日志。
- `PullScreen` 的下载进度是静态值；GGUF“导入”只读取 `file.name`。
- `ModelfileLabScreen.handleBuild` 用 `setTimeout` 模拟构建，新模型只存在内存。
- 没有 `node_modules/`、锁文件、`dist/`、`server.js`；`lint` / `build` / `dev` 均未执行。
- 仓库不是 Git 仓库；没有测试、CI、ESLint/Prettier、许可证。

## 为什么不再适用

第一阶段已完成真实接入：`/api/version`、`/api/tags`、`/api/ps`、`/api/chat`（流式），并增加 Vite 开发代理与 Express 生产代理。聊天、模型列表、连接状态已使用真实数据；离线时才回退到标注过的演示数据。

## 当前替代来源

- 当前状态：`docs/context/NOW.md`
- 数据流与目录：`docs/context/MAP.md`
- 决策：`docs/context/DECISIONS.md` 的 D-101 至 D-108
- 风险：`docs/context/RISKS.md`
- 执行记录：`docs/context/RUNBOOK.md`
