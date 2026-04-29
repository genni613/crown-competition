# CopilotKit 接入说明

当前项目已经完成了前端基础接入：

- 已安装 `@copilotkit/react-core` 和 `@copilotkit/react-ui`
- 已在前端入口接入 `CopilotKit` provider
- 已在应用布局中预留浮动聊天入口
- 已把当前登录用户、当前页面路由、系统核心能力暴露给 CopilotKit 上下文

## 如何启用

在 `client/.env` 中配置：

```env
VITE_COPILOTKIT_ENABLED=true
VITE_COPILOTKIT_RUNTIME_URL=/api/copilotkit
VITE_COPILOTKIT_AGENT=crown_competition_assistant
```

也可以参考 `client/.env.example`。

## 当前还缺什么

当前项目还没有真正的 CopilotKit runtime / agent 后端，所以前端虽然已经具备挂载能力，但不会自己生成回答。

你需要补一条真实链路：

1. 一个 CopilotKit 兼容 runtime endpoint
2. 一个 agent，能够理解“皇冠赛”业务
3. agent 内部接入你现有的业务 API 或服务层

## 现有项目为什么适合集成

这个项目已经具备接入条件：

- 前端是 React + Vite，适合直接挂 CopilotKit UI
- 后端是 Express，适合新增或代理 Copilot runtime endpoint
- 业务 API 已比较完整，agent 可以直接调用：
  - `/api/seasons`
  - `/api/scoring`
  - `/api/scores`
  - `/api/evidence`
  - `/api/org-scores`
  - `/api/feishu`
- 现有登录态走 cookie/session，后续 runtime 放在同域 `/api/copilotkit` 时可以直接复用 `credentials="include"`

## 推荐的下一步

最稳妥的做法是把 CopilotKit runtime 作为单独的 agent 服务接入，再让它调用你现有 Express API，而不是把大模型逻辑直接塞进当前业务服务里。

这样做的好处：

- 业务边界更清晰
- 更容易替换模型和 agent 框架
- 不会把现有评分/飞书同步服务和 AI 运行时强耦合

如果你要继续，我下一步可以直接帮你补：

- `LangGraph + CopilotKit runtime` 最小后端
- 一个“皇冠赛助手” agent
- 让它调用你现有的查询接口回答“当前赛季成绩、评分规则、举证流程、管理员操作说明”
