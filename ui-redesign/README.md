# ui-redesign

Ollama Studio 的新版实验界面。它只读复用 `src/api`、`src/lib`、`src/types` 中的业务逻辑，
视觉与交互层全部写在本目录，现有 `src/`、`index.html` 与经典界面不做任何修改。

## 运行与切换

```bash
npm run dev
```

- 经典界面：`http://127.0.0.1:39471/`
- 新界面：`http://127.0.0.1:39471/ui-redesign/`
- 临时回到经典界面：在地址后加 `?ui=legacy`，例如
  `http://127.0.0.1:39471/ui-redesign/?ui=legacy`
- 开发服务器级回退：启动前设置 `VITE_UI=legacy`，新入口会重定向到 `/`。
  该变量在 `npm run dev` 启动时读取，修改后需重启开发服务器。

新界面使用 hash 路由：`#runtime`、`#models`、`#pull`、`#chat`、`#modelfile`。
旧界面的 `#telemetry-settings` 与 `#modelfile-lab` 会分别映射到 `runtime` 与 `modelfile`。

## 文件

| 路径 | 作用 |
| --- | --- |
| `index.html` | 新界面 HTML 入口；预置明暗模式与 `?ui=legacy` 重定向 |
| `main.tsx` | 字体、Material Symbols、样式与 React 根 |
| `App.tsx` | hash 路由、所选模型持久化、五个屏幕与全局离线提示 |
| `copy.ts` | 中英文文案；缺失值使用“未提供”，不编造指标 |
| `lib/legacy.ts` | 对现有业务逻辑的只读重导出边界 |
| `styles/tokens.css` | Console 主题 token；`light-dark()` 成对定义明暗 |
| `styles/app.css` | 组件样式；首行是 Hallmark stamp |
| `screens/` | Runtime、Models、Pull、Chat、Modelfile 五个屏幕 |

## 与经典界面的共享状态

| localStorage 键 | 内容 |
| --- | --- |
| `ollama_language` | `zh` 或 `en` |
| `ollama_theme_mode` | `dark` 或 `light` |
| `ollama_model_settings_v1` | 按模型保存的对话参数 |
| `ollama_chat_sessions_v2` | 会话与消息（两套界面共用） |
| `ollama_console_model` | 新界面最后选择的模型 |

## 验证记录（2026-11-05）

在本机执行过：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test`：19 个测试文件、192 个测试通过。
- 使用临时 Vite 配置把经典入口与 `ui-redesign/index.html` 一并构建到项目外的临时目录：通过，未覆盖现有 `dist/` 或 `server.js`。
- 开发服务器实测 `/ui-redesign/`：五个屏幕、明暗切换、中英切换、模型选择持久化、会话新建/删除、`?ui=legacy` 重定向均正常。
- 对话流式渲染使用拦截的 mock NDJSON 验证（文本、代码块、token 速率、自动滚动、停止、thinking 模型与 JSON 模式）；未加载任何真实模型。
- Hallmark `sloplint --scope app --render`：0 FAIL、0 REFLEX、0 WARN。
- 375px、320px 宽度下 `document.documentElement.scrollWidth` 与视口一致；修掉了对话工具栏、Modelfile 头部与拉取筛选的窄屏溢出。

## 尚未接通 / 仍属经典界面

- 附件与多模态输入、GGUF 导入、模型克隆、导出 GGUF：仍在经典界面。
- 生产构建入口：`vite.config.ts` 未加入 `ui-redesign/index.html`，因为本次约束禁止修改现有文件。
  需要发布到生产时，应把该入口加入 Rollup input，并由现有 `server.js` 提供 `/ollama` 与 `/api/*`。
- 清理缓存、启动/停止守护进程、拉取模型、加载/卸载模型都是真实操作；
  本次验证只读取了状态接口，没有执行这些不可逆或耗时操作。
