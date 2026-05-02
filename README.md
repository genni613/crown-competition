# Crown Competition（皇冠赛）

科技中心会员数字化团队内部绩效竞赛平台，面向产品、设计、研发三类角色，通过多维度量化评分体系产出排名和 271 绩效分布。

## 功能特性

- **多角色评分体系** — 产品 / 设计 / 研究各有独立维度与权重（交付效率、需求价值、创新、交付质量、协作）
- **阈值评分 + 扣分评分** — 支持正向指标阈值映射（0-100）和负向指标按次扣分，含成长排名和保护机制
- **271 分布** — 自动按赛季排名生成 Top 20% / Middle 70% / Bottom 10% 分布
- **组织分** — 导师、分享、种草、内推等加分项，每赛季上限 25 分
- **飞书项目数据同步** — 通过飞书 Project OpenAPI 自动拉取工作项、需求、缺陷、工时数据
- **飞书 OAuth 登录** — 扫码登录，基于部门/组织限制访问
- **证据提交与审核** — 成员提交创新成果/社区贡献等证据（含图片），管理员审批
- **AI 助手** — 基于 CopilotKit 的智能助手，支持评分规则问答、辅助填报证据、组织分录入等

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite + Ant Design + Zustand |
| 后端 | Express.js + TypeScript |
| 数据库 | MySQL |
| AI | CopilotKit Runtime + OpenAI SDK（兼容接口） |
| 认证 | 飞书 OAuth 2.0 + IronSession |
| 测试 | Vitest |

## 快速开始

### 前置条件

- Node.js 18+
- MySQL 服务
- 飞书企业自建应用（含 OAuth 和 Project OpenAPI 权限）

### 安装

```bash
npm install
```

### 配置环境变量

复制项目根目录 `.env` 并填写以下配置：

```env
# 飞书 OAuth
FEISHU_APP_ID=
FEISHU_APP_SECRET=

# Session 加密密钥（至少 32 位）
SESSION_SECRET=

# 服务地址
SITE_URL=http://localhost:3001
PORT=3001

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=crown_competition

# 飞书 Project OpenAPI（数据同步）
FEISHU_PROJECT_APP_ID=
FEISHU_PROJECT_APP_SECRET=
FEISHU_PROJECT_BASE_URL=

# AI 助手（OpenAI 兼容接口）
COPILOTKIT_OPENAI_BASE_URL=
COPILOTKIT_OPENAI_API_KEY=
COPILOTKIT_OPENAI_MODEL=
```

客户端配置（`client/.env`）：

```env
VITE_COPILOTKIT_ENABLED=true
VITE_COPILOTKIT_RUNTIME_URL=http://localhost:3001/copilotkit
VITE_COPILOTKIT_AGENT=scoring-agent
```

### 运行

```bash
# 启动后端（默认 3001 端口）
npm run dev:server

# 启动前端（默认 5173 端口，自动代理 /api 到后端）
npm run dev:client
```

### 构建 & 测试

```bash
npm run build
npm run test
```

## 项目结构

```
crown-competition/
├── client/                     # React 前端
│   └── src/
│       ├── api/                # Axios API 模块
│       ├── components/         # UI 组件（布局、AI 助手、证据、排名、评分）
│       ├── pages/              # 页面（仪表盘、排名、管理页）
│       ├── store/              # Zustand 状态管理
│       └── types/              # TypeScript 类型定义
├── server/                     # Express 后端
│   └── src/
│       ├── agent/              # CopilotKit AI Agent
│       ├── config/             # JSON 配置（管理员、字段映射）
│       ├── db/                 # 数据库初始化、Schema、种子数据
│       ├── lib/                # 飞书 OAuth、Session 管理
│       ├── middleware/         # 认证、错误处理
│       ├── routes/             # 路由处理（11 个模块）
│       ├── services/           # 业务逻辑（10 个服务）
│       ├── utils/              # 评分公式引擎、常量
│       └── types/              # 实体类型定义
├── docs/                       # 详细技术文档
└── design.md                   # 主设计文档
```

## 文档

| 文档 | 说明 |
|------|------|
| [design.md](design.md) | 完整设计文档（项目概述、OAuth 流程、评分体系、数据库、API、前端页面） |
| [scoring-rules.md](scoring-rules.md) | 各角色评分规则、阈值、权重 |
| [kit.md](kit.md) | CopilotKit 功能说明 |
| [docs/scoring-metric-aggregation.md](docs/scoring-metric-aggregation.md) | 指标自动聚合可行性分析 |
| [docs/permission-control.md](docs/permission-control.md) | 权限控制设计 |
| [docs/feishu-project-openapi-sync.md](docs/feishu-project-openapi-sync.md) | 飞书 Project OpenAPI 对接指南 |
| [docs/scoring-result-model.md](docs/scoring-result-model.md) | 评分结果模型设计 |
