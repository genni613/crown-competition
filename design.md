# 皇冠赛平台 — 设计文档

> 版本: v1.1 | 日期: 2026-04-22

---

## 1. 项目概述

### 1.1 背景

科技中心会员数字化团队需要一个内部绩效竞赛平台（"皇冠赛"），用于量化评估产品、设计、研发三个岗位的工作表现，通过多维度评分体系实现公平竞争，最终产出 271 分布排名。

### 1.2 试点赛季

- **周期**: 2026年5月1日 ~ 2026年6月30日
- **数据范围**: 仅计算5月、6月数据
- **适用范围**: 会员数字化模块除小组长外全部正岗伙伴

### 1.3 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React + TypeScript + Vite | SPA 单页应用 |
| UI库 | Ant Design | 企业级组件库 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 后端 | Node.js + Express + TypeScript | RESTful API |
| 数据库 | SQLite (better-sqlite3) | 单文件数据库，内部工具够用 |
| 认证 | 飞书 OAuth 2.0 + IronSession | 飞书扫码登录，服务端Session |
| 校验 | Zod | 请求参数校验 |

### 1.4 用户角色

| 角色 | 权限 |
|------|------|
| 管理员 (ADMIN) | 管理赛季、录入分数、审核举证、管理组织分、用户管理 |
| 参赛者 (MEMBER) | 查看个人分数和排名、提交举证 |

> 首次登录时根据 `config/admins.json` 分配初始角色，后续由管理员在后台管理。详见 [2.2 角色管理](#22-角色管理)。

---

## 2. 飞书登录与权限管理

> 参考项目: `/Users/pengyuang/Desktop/play/skillhub`

### 2.1 飞书 OAuth 2.0 登录流程

采用飞书 OIDC（OpenID Connect）协议，实现企业内扫码登录。

```
┌──────────┐    ①点击登录     ┌──────────┐    ②重定向     ┌──────────┐
│  浏览器   │ ──────────────> │  后端    │ ────────────> │  飞书    │
│          │                 │ /login   │               │ 授权页面  │
│          │                 │          │               │          │
│          │ <────────────── │          │ <──────────── │          │
│          │  ⑥重定向到首页   │          │  ③用户扫码授权 │          │
│          │  (Session已建立) │          │               │          │
│          │                 │          │ <──────────── │          │
│          │                 │          │  ④回调带code  │          │
│          │                 │          │               │          │
│          │                 │          │ ────────────> │          │
│          │                 │          │  ⑤code换token │          │
│          │                 │          │  获取用户信息   │          │
└──────────┘                 └──────────┘               └──────────┘
```

#### 详细步骤

**Step 1 — 发起登录**
- 用户访问 `/api/auth/login`
- 后端生成随机 `state`（CSRF防护），存入 Session
- 构造飞书授权 URL，302 重定向

```typescript
// 授权 URL 格式
`https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${APP_ID}&redirect_uri=${CALLBACK}&state=${STATE}`
```

**Step 2 — 飞书回调**
- 用户在飞书授权后，飞书回调 `GET /api/auth/callback?code=xxx&state=xxx`
- 校验 `state` 防止 CSRF
- 用 `code` 换取 `user_access_token`

```
POST https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
Headers: Authorization: Bearer <app_access_token>
Body: { grant_type: "authorization_code", code: "<code>" }
```

> `app_access_token` 每次实时获取（避免缓存过期）：
> ```
> POST https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal
> Body: { app_id, app_secret }
> ```

**Step 3 — 获取用户信息**
用 `user_access_token` 调用飞书 API 获取用户基本信息：

```
GET https://open.feishu.cn/open-apis/authen/v1/user_info
Headers: Authorization: Bearer <user_access_token>
→ 返回: open_id, name, avatar_url, email, mobile, tenant_key
```

用 `app_access_token` 获取用户详细信息（含部门）：

```
GET https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id&open_ids=<open_id>
Headers: Authorization: Bearer <app_access_token>
→ 返回: department_ids, title
```

获取部门名称：

```
GET https://open.feishu.cn/open-apis/contact/v3/departments/<department_id>?department_id_type=open_department_id
→ 返回: department.name
```

**Step 4 — 创建/更新本地用户**
- 用 `open_id` 作为用户唯一标识
- 在数据库中 upsert 用户记录（更新姓名、头像、部门等）
- 判定角色（见 2.2）

**Step 5 — 建立 Session**
- 将用户信息和 `access_token` 写入 IronSession
- 重定向到前端首页

### 2.2 角色管理

角色统一存储在数据库 `users.role` 字段中，权限校验只看数据库。

**初始角色分配**（首次登录时）：

```typescript
// config/admins.json — 仅用于首次登录时的初始角色分配
{
  "admins": [
    "ou_xxxxx",  // 预设管理员的飞书 open_id
    "ou_yyyyy"
  ]
}

// 登录时的 upsert 逻辑
const isNewUser = !(await db.getUser(openId))
const role = isNewUser
  ? (admins.includes(openId) ? 'ADMIN' : 'MEMBER')  // 首次：根据配置分配
  : undefined                                         // 老用户：保留数据库中的角色不变
```

**后续角色变更**：管理员在后台"用户管理"页面直接修改，无需改配置文件或重新部署。

| 场景 | 行为 |
|------|------|
| 新用户首次登录 | `admins.json` 中的 open_id → ADMIN，其余 → MEMBER |
| 老用户再次登录 | 保持数据库中的角色，不覆盖 |
| 管理员在后台改角色 | 直接更新数据库，立即生效 |
| 权限校验 | 每次请求从数据库实时读取 role，不依赖 Session 缓存 |

> `config/admins.json` 的作用仅是"初始化清单"，部署后在线上管理即可，无需维护配置文件。

### 2.3 登录限制

> 配置与角色管理合并在同一个 `config/admins.json` 文件中：
> ```json
> {
>   "admins": ["ou_xxxxx"],
>   "loginRestriction": {
>     "mode": "department",
>     "allowedDepartments": ["od-xxxxx"],
>     "allowedTenants": ["xxxxx"]
>   }
> }
> ```

支持三种模式（通过 `loginRestriction.mode` 配置）：

| 模式 | 说明 |
|------|------|
| `none` | 不限制，任何飞书用户可登录 |
| `department` | 仅允许指定部门及其**子部门**的用户登录 |
| `organization` | 仅允许指定租户（组织）的用户登录 |

**部门限制**会递归查询所有子部门：
```typescript
async getAllSubDepartmentIds(parentId: string): Promise<string[]> {
  // 1. 将 parentId 加入列表
  // 2. 调用飞书 API 查询子部门列表
  // 3. 对每个子部门递归查询
  // 4. 返回所有层级的部门 ID
}
```

**判断逻辑**：用户的 `department_ids` 中任一个在允许列表中即可登录。

### 2.4 Session 管理

使用 [IronSession](https://github.com/vvo/iron-session) 进行服务端 Session 管理（加密 Cookie）：

```typescript
interface SessionData {
  user?: {
    id: string            // 飞书 open_id
    name: string
    avatar_url?: string
    department_name?: string
    role: string          // 'ADMIN' | 'MEMBER'
  }
  accessToken?: string    // 飞书 user_access_token
  state?: string          // CSRF state
}

// Session 配置
{
  password: process.env.SESSION_SECRET,
  cookieName: 'crown_session',
  cookieOptions: {
    secure: true,         // 生产环境 HTTPS
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600, // 7天过期
    httpOnly: true,
  }
}
```

### 2.5 权限校验中间件

```typescript
// 获取当前用户（从数据库实时读取 role，解决后台改角色后 session 不更新的问题）
async function getCurrentUser(req, res): Promise<{ user, error }>

// 要求管理员权限
async function requireAdmin(req, res): Promise<{ user, error }>
// → 内部调用 getCurrentUser，若 role !== 'ADMIN' 返回 403
```

**路由使用方式**：
```typescript
// 需要登录
app.get('/api/scoring/rankings/:seasonId', authMiddleware, handler)

// 需要管理员
app.post('/api/seasons', adminMiddleware, handler)
```

### 2.6 需要的环境变量

```env
# 飞书应用凭证
FEISHU_APP_ID=cli_xxxxxx
FEISHU_APP_SECRET=xxxxxx

# Session 加密密钥（至少32字符）
SESSION_SECRET=your-secret-key-at-least-32-characters

# 站点URL（用于构造回调地址）
NEXT_PUBLIC_SITE_URL=http://localhost:3001
# 或 Express: SITE_URL=http://localhost:3001
```

### 2.7 飞书应用配置（需在飞书开放平台操作）

1. 创建飞书自建应用
2. 开启 **网页应用** 能力
3. 配置重定向 URL: `http://<domain>/api/auth/callback`
4. 添加权限范围：
   - `contact:user.base:readonly` — 获取用户基本信息
   - `contact:user.department_id:readonly` — 获取用户部门
   - `contact:department.base:readonly` — 获取部门信息
5. 发布应用

---

## 3. 评分体系

### 2.1 总分公式

```
个人总分 = 岗位分 + 组织分
```

### 3.2 岗位分计算流程

```
              ┌─────────────────────────────────────────────┐
              │  各指标原始数据                               │
              │  (飞书项目 / 管理员录入 / 用户举证)           │
              └──────────────────┬──────────────────────────┘
                                 ▼
              ┌─────────────────────────────────────────────┐
              │  Step 1: 阈值得分                            │
              │  每个指标按阈值映射为 0~100 分（或减分）      │
              └──────────────────┬──────────────────────────┘
                                 ▼
              ┌─────────────────────────────────────────────┐
              │  Step 2: 维度得分                            │
              │  同一维度内各指标按权重加权求和               │
              └──────────────────┬──────────────────────────┘
                                 ▼
              ┌─────────────────────────────────────────────┐
              │  Step 3: 原始岗位分                          │
              │  各维度按权重加权求和                         │
              └──────────────────┬──────────────────────────┘
                                 ▼
              ┌─────────────────────────────────────────────┐
              │  Step 4: 增长率排名                          │
              │  增长率 = (当前原始分 - 上赛季分) / 上赛季分  │
              │  按增长率排序，线性赋分: 第1名=100, 末名=60   │
              └──────────────────┬──────────────────────────┘
                                 ▼
              ┌─────────────────────────────────────────────┐
              │  Step 5: 保护机制                            │
              │  若原始岗位分 ≥ 85，取 MAX(原始分, 赋分分)   │
              │  否则取赋分分                                │
              └──────────────────┬──────────────────────────┘
                                 ▼
                         最终岗位分
```

### 3.3 首赛季初始化

首赛季无历史数据，上赛季岗位分按个人绩效等级映射：

| 绩效等级 | 上赛季岗位分 |
|----------|-------------|
| A | 72 |
| B+ | 69 |
| B | 66 |
| B- | 63 |
| C | 60 |

### 3.4 271 分布

按个人总分在每个岗位组内排名后：
- **前 20%** → "2"（优秀）
- **中间 70%** → "7"（达标）
- **后 10%** → "1"（待改进）

> 小组保底：最少1人"2"，最少1人"1"

### 3.5 组织分

单人单赛季封顶 **25 分**，包含以下加分/减分项：

| 项目 | 分值 | 类型 |
|------|------|------|
| 带教伙伴（>50天，每人在职） | +2分/人，上不封顶 | 管理员录入 |
| 集团认证讲师（年度积分≥4000） | +5分 | 管理员录入 |
| 分享（集团3分/会员数字化1分/组内0.5分） | 加分，满分3分 | 管理员录入 |
| 值班未响应 | -1分/次 | 管理员录入 |
| 花匠工作（>50天） | +3分 | 管理员录入 |
| 内推（入职+1，转正+1） | 加分 | 管理员录入 |
| 价值观A（持续两个赛季） | +3分 | 管理员录入 |
| 复杂基建项目（核心+10/参与+5） | 加分 | 管理员录入 |
| 特别贡献分（领导分配，每人封顶10分） | 加分 | 管理员录入 |

---

## 4. 各岗位评分标准

### 4.1 维度权重对比

| 维度 | 产品 | 设计 | 研发 |
|------|------|------|------|
| 交付效率 | 30% | 25% | **40%** |
| 需求价值 | **30%** | 20% | — |
| 创新突破 | 15% | 15% | 15% |
| 交付质量 | 10%+减分 | **25%**+减分 | **30%**+减分 |
| 协作贡献 | 15% | 15% | 15% |

### 4.2 产品岗

#### 交付效率 (30%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 产品需求使用研发测试PD数（客户端3PD折算1PD） | 20% | 100分: ≥1/3总PD / 60分: ≥1/4总PD / 0分: <1/4 | 飞书项目 |
| 需求评审通过准时率 | 10% | 100分: ≥95% / 60分: ≥80% / 0分: <80% | 飞书项目 |

> - 专项每个版本计1个需求数，迭代每2个需求计1个需求数

#### 需求价值 (30%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 核心项目(S/A级)业务价值完成度 | 15% | 100分: ≥100% / 60分: ≥80% / 0分: <80% | **管理员录入** |
| 产品功能用户体验度量分 | 15% | 100分: ≥4.8 / 60分: ≥4.5 / 0分: <4.5 | **管理员录入** |

> - 无核心项目默认60分，多项目均等占比
> - 用户体验度量 = 体验智能体打分(50%) + 一线调研打分(50%)

#### 创新突破 (15%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| AI/数字化工具解决真问题数（含AI coding闭环） | 15% | 150分: ≥10 / 100分: ≥5 / 60分: ≥1 / 0分: <1 | **用户举证** |

> 采纳标准：
> - C端：日均覆盖>1000用户，ROI≥4或满意度≥4.8
> - 总部：工具提效，5人以上，每人每周≥2小时
> - 一线：落地≥10家门店，满意度≥4.6
> - AI coding：修改代码<40%，节约≥3PD

#### 交付质量 (10%+减分)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 核心项目准时上线率 | 10% | 100分: ≥100% / 60分: ≥80% / 0分: <80% | 飞书项目 |
| 需求变更消耗PD | 减分 | 每3额外PD扣1分，最多扣15分 | 飞书项目 |

#### 协作贡献 (15%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 微社区被点赞数 | 5% | 100分: ≥10 / 60分: ≥5 / 0分: <5 | **管理员录入** |
| 线上问题系统解决数 | 10% | 100分: ≥5 / 60分: ≥1 / 0分: <1 | 飞书项目 |

> 自己两季度内上线产生的问题不计

---

### 4.3 设计岗

#### 交付效率 (25%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 设计需求完成数（简单1分/中等2分/复杂3分加权） | 15% | 100分: ≥30加权分 / 60分: ≥20加权分 / 0分: <20 | 飞书项目 |
| 设计交付准时率 | 10% | 100分: ≥95% / 60分: ≥80% / 0分: <80% | 飞书项目 |

> 专项每版本按1个中等需求计，同一需求多次修改不计重复分

#### 需求价值 (20%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 核心项目业务价值完成度 | 10% | 100分: ≥100% / 60分: ≥80% / 0分: <80% | **管理员录入** |
| 用户体验度量分 | 10% | 100分: ≥4.8 / 60分: ≥4.5 / 0分: <4.5 | **管理员录入** |

#### 创新突破 (15%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 设计创新成果数 | 15% | 150分: ≥10 / 100分: ≥5 / 60分: ≥1 / 0分: <1 | **用户举证** |

> 采纳标准同产品岗，额外包含设计驱动增长、AI赋能设计、体验创新等

#### 交付质量 (25%+减分)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 设计规范遵循率 | 5% | 100分: ≥95% / 60分: ≥85% / 0分: <85% | **管理员录入** |
| 设计系统贡献（新增1分/优化2分/文档1分/Token 0.5分） | 10% | 100分: ≥8贡献分 / 60分: ≥4贡献分 / 0分: <4 | **管理员录入** |
| 设计还原度（视觉40%+交互40%+内容20%） | 10% | 100分: ≥95% / 60分: ≥85% / 0分: <85% | **管理员录入** |
| 设计返工消耗PD | 减分 | 每3额外PD扣1分，封顶15分 | 飞书项目 |

#### 协作贡献 (15%)

同产品岗。

---

### 4.4 研发岗

#### 交付效率 (40%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 消耗需求评估标准工时 | 40% | 100分: ≥304小时 / 60分: ≥243小时 / 0分: <243 | 飞书项目 |

#### 创新突破 (15%)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| AI/数字化工具解决真问题数（含跨端研发、PRD撰写等） | 15% | 150分: ≥10 / 100分: ≥5 / 60分: ≥1 / 0分: <1 | **用户举证** |

#### 交付质量 (30%+减分)

| 指标 | 权重 | 得分口径 | 数据来源 |
|------|------|----------|----------|
| 过程问题(P0/P1/P2) | 30% | 100分: 无P0/P1且P2<10 / 80分: 无P0/P1且P2<25 / 60分: P0≤1% / 0分: P0>1% | 飞书项目 |
| 线上故障(P1/P2/P3/P4) | 减分 | P1/P2: -100分/个 / P3/P4: -20分/个，封顶100分 | 飞书项目 |
| 线上问题(仅研发代码) | 减分 | P1: -10分 / P2: -5分 / P3: -3分，封顶100分 | 飞书项目 |
| 提测不通过 | 减分 | -10分/次，封顶100分 | 飞书项目 |

#### 协作贡献 (15%)

同产品岗。

---

### 4.5 数据来源汇总

| 来源类型 | 涵盖指标 | 平台操作 |
|----------|----------|----------|
| **飞书项目** (Mock) | PD数、工时、准时率、Bug数、故障数、提测不通过等 | 管理员Mock数据/后续API对接 |
| **管理员录入** | 业务价值完成度、用户体验度量、设计规范遵循率、设计系统贡献、设计还原度、微社区点赞、组织分各项 | 管理员后台手动填写 |
| **用户举证** | 创新突破成果（三岗位）、特别贡献等 | 参赛者提交→管理员审核→采纳后计分 |

### 4.6 数据落库原则

飞书 OpenAPI 作为**外部事实来源**，本地数据库作为**赛季结算、审核留痕、结果查询**的事实底座。

#### 适合直接走飞书 OpenAPI 的数据

- 登录身份信息（用户基础资料、部门信息）
- 飞书项目原始任务、工时、状态、缺陷、故障等源数据
- 飞书文档/消息/云盘文件等举证来源对象

#### 必须本地持久化的数据

- 赛季配置、赛季成员、岗位快照、绩效快照
- 评分维度定义、阈值规则、组织分规则
- 每个成员每个指标在赛季内的**原始值快照**
- 评分计算结果、排名、271 分布结果
- 管理员手工录入值、覆盖值、审核意见
- 用户提交的举证内容、附件元数据、审核状态

#### 为什么不能完全依赖飞书实时查询

- 飞书项目中的字段、负责人、状态、工时后续可能变化，赛季结算必须可追溯、可复算
- 排名页和计算页不能依赖实时聚合外部接口，性能和稳定性不可控
- 管理员存在“修正口径”诉求，系统需要保留“原始拉取值”和“人工覆盖值”
- 审核通过后的举证属于本系统业务事实，不能只保留飞书链接

#### 存储策略

- 飞书原始对象：按“赛季 + 人 + 指标/任务”做本地快照，不做全量长期镜像
- 评分相关数值：本地保存原始值、覆盖值、最终用于计算的值
- 举证材料：正文存结构化富文本，附件存元数据；文件本体放飞书云盘或对象存储，数据库仅保存引用与快照信息

---

## 5. 数据库设计

### 5.1 ER 关系图

```
users ──1:N──> season_members ──1:N──> indicator_scores
                  │                          │
                  │                          └──> scoring_dimensions (配置表)
                  │
                  ├──1:N──> org_scores ──> org_score_types (配置表)
                  │
                  ├──1:N──> evidence_submissions ──1:N──> evidence_attachments
                  │
                  └──> seasons

seasons ──1:N──> season_members
seasons ──1:N──> feishu_metric_snapshots
seasons ──1:N──> feishu_source_snapshots
```

### 5.2 表结构

#### users — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 飞书 open_id |
| name | TEXT | 用户姓名（飞书同步） |
| avatar_url | TEXT | 头像URL（飞书同步） |
| email | TEXT | 邮箱（飞书同步） |
| department_id | TEXT | 主部门ID（飞书同步） |
| department_ids | TEXT | 所属部门ID列表（JSON数组） |
| department_name | TEXT | 部门名称（飞书同步） |
| title | TEXT | 职位头衔（飞书同步） |
| role | TEXT | 'ADMIN' / 'MEMBER' |
| job_role | TEXT | 'product' / 'design' / 'tech'（管理员设定） |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

#### seasons — 赛季表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT UNIQUE | 赛季名称 |
| start_date | TEXT | 开始日期 |
| end_date | TEXT | 结束日期 |
| status | TEXT | 'draft' / 'active' / 'ended' |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

#### season_members — 赛季成员表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_id | INTEGER FK | 赛季ID |
| user_id | TEXT FK | 用户ID（关联 users.id） |
| job_role | TEXT | 本赛季岗位快照 |
| performance_grade | TEXT | 绩效等级 A/B+/B/B-/C |
| prev_raw_score | REAL | 上赛季原始岗位分 |
| raw_position_score | REAL | 本赛季原始岗位分（计算得出） |
| growth | REAL | 增长率 |
| linear_score | REAL | 线性赋分 |
| final_position_score | REAL | 最终岗位分（含保护机制） |
| total_org_score | REAL | 组织分总计（封顶25） |
| total_score | REAL | 个人总分 |
| rank | INTEGER | 岗位组内排名 |
| distribution | TEXT | 271分布值 '2'/'7'/'1' |

#### scoring_dimensions — 评分维度配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| job_role | TEXT | 'product' / 'design' / 'tech' |
| dimension_name | TEXT | 维度名（如"交付效率"） |
| dimension_weight | REAL | 维度权重（如0.30） |
| indicator_name | TEXT | 指标名（如"PD数量"） |
| indicator_weight | REAL | 指标在维度内的权重 |
| data_source | TEXT | 'feishu' / 'admin' / 'evidence' |
| score_type | TEXT | 'threshold' / 'deduction' |
| threshold_100 | REAL | 100分阈值 |
| threshold_60 | REAL | 60分阈值 |
| deduction_per_unit | REAL | 每单位扣分 |
| deduction_cap | REAL | 扣分上限 |
| deduction_divisor | REAL | 扣分除数（如每3PD扣1分=3） |
| sort_order | INTEGER | 排序号 |

#### indicator_scores — 指标得分表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_member_id | INTEGER FK | 赛季成员ID |
| dimension_id | INTEGER FK | 评分维度ID |
| raw_value | REAL | 原始数值 |
| overridden_value | REAL | 管理员覆盖后的数值（可空） |
| effective_value | REAL | 实际参与计算的数值 |
| threshold_score | REAL | 阈值计算得分 |
| final_score | REAL | 最终得分（含减分） |
| source | TEXT | 'feishu' / 'admin' / 'evidence' |
| approved | INTEGER | 举证审核: 0待审/1通过/-1驳回 |
| source_snapshot_id | INTEGER FK | 关联飞书/举证来源快照（可空） |
| notes | TEXT | 备注 |

#### org_score_types — 组织分类型表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT UNIQUE | 类型标识 |
| display_name | TEXT | 显示名称 |
| points_per_unit | REAL | 每单位分值 |
| max_per_season | REAL | 赛季上限（NULL=不限） |
| sort_order | INTEGER | 排序号 |

#### org_scores — 组织分明细表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_member_id | INTEGER FK | 赛季成员ID |
| org_score_type_id | INTEGER FK | 组织分类型ID |
| quantity | REAL | 数量 |
| points | REAL | 计算得分 |
| description | TEXT | 描述 |
| status | TEXT | 'pending' / 'approved' / 'rejected' |
| submitted_by | TEXT FK | 提交人 |
| reviewed_by | TEXT FK | 审核人 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

#### evidence_submissions — 举证提交表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_member_id | INTEGER FK | 赛季成员ID |
| target_type | TEXT | 'indicator' / 'org_score' |
| target_id | INTEGER | 关联的indicator_scores或org_scores ID |
| title | TEXT | 举证标题 |
| content_format | TEXT | 'plain' / 'html' / 'json' |
| content_text | TEXT | 纯文本摘要/搜索文本 |
| content_json | TEXT | 富文本结构JSON（主存储） |
| source_type | TEXT | 'manual' / 'feishu_doc' / 'feishu_msg' / 'feishu_file' / 'link' |
| source_ref | TEXT | 外部来源标识（如 doc token、message id、file token、URL） |
| status | TEXT | 'pending' / 'approved' / 'rejected' |
| review_comment | TEXT | 审核意见 |
| reviewed_by | TEXT FK | 审核人 |
| submitted_by | TEXT FK | 提交人 |
| submitted_at | TEXT | 提交时间 |
| reviewed_at | TEXT | 审核时间 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

#### evidence_attachments — 举证附件表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| evidence_submission_id | INTEGER FK | 关联举证ID |
| type | TEXT | 'image' / 'file' / 'link' |
| name | TEXT | 文件名/展示名 |
| mime_type | TEXT | MIME类型 |
| size | INTEGER | 文件大小（字节） |
| storage_provider | TEXT | 'feishu' / 'oss' / 'local' |
| file_token | TEXT | 飞书文件token（可空） |
| url | TEXT | 文件访问地址/下载地址 |
| width | INTEGER | 图片宽度（可空） |
| height | INTEGER | 图片高度（可空） |
| sort_order | INTEGER | 排序号 |
| created_at | TEXT | 创建时间 |

#### feishu_metric_snapshots — 飞书指标快照表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_id | INTEGER FK | 赛季ID |
| user_id | TEXT FK | 用户ID |
| metric_key | TEXT | 指标键名 |
| metric_value_number | REAL | 数值型指标值（可空） |
| metric_value_text | TEXT | 文本型指标值（可空） |
| source_snapshot_id | INTEGER FK | 对应原始对象快照（可空） |
| fetched_at | TEXT | 拉取时间 |
| snapshot_version | INTEGER | 快照版本号 |

#### feishu_source_snapshots — 飞书原始对象快照表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_id | INTEGER FK | 赛季ID |
| user_id | TEXT FK | 用户ID（可空，按对象维度时可不填） |
| source_type | TEXT | 'project_task' / 'work_item' / 'bug' / 'incident' / 'doc' / 'message' / 'file' |
| source_id | TEXT | 飞书侧对象ID |
| source_title | TEXT | 对象标题（可空） |
| raw_payload_json | TEXT | 原始响应JSON快照 |
| fetched_at | TEXT | 拉取时间 |
| snapshot_version | INTEGER | 快照版本号 |

---

## 6. API 设计

### 6.1 认证 `/api/auth`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/login` | 发起飞书OAuth登录，302重定向到飞书 | 公开 |
| GET | `/callback` | 飞书回调，换token、创建/更新用户、建立Session | 公开 |
| POST | `/logout` | 销毁Session | 已登录 |
| GET | `/me` | 当前用户信息 | 已登录 |

### 6.2 赛季 `/api/seasons`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/` | 赛季列表 | 已登录 |
| GET | `/:id` | 赛季详情 | 已登录 |
| POST | `/` | 创建赛季 | admin |
| PUT | `/:id` | 编辑赛季 | admin |
| POST | `/:id/activate` | 激活赛季 | admin |
| POST | `/:id/end` | 结束赛季 | admin |
| GET | `/:id/members` | 赛季成员列表 | 已登录 |
| POST | `/:id/members` | 添加成员 | admin |
| PUT | `/:id/members/:mid` | 编辑成员 | admin |
| DELETE | `/:id/members/:mid` | 移除成员 | admin |

### 6.3 评分 `/api/scoring`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/dimensions/:jobRole` | 获取岗位评分维度定义 | 已登录 |
| POST | `/calculate/:seasonId` | 触发全赛季计算 | admin |
| POST | `/calculate/:seasonId/:memberId` | 计算单人 | admin |
| GET | `/breakdown/:seasonId/:memberId` | 分数详情 | 已登录(自己或admin) |
| GET | `/rankings/:seasonId` | 全赛季排名 | 已登录 |
| GET | `/rankings/:seasonId/:jobRole` | 按岗位排名 | 已登录 |

### 6.4 分数录入 `/api/scores`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/:seasonId/:memberId` | 某人所有指标分数 | admin |
| PUT | `/:seasonId/:memberId/:dimensionId` | 录入/更新单个指标 | admin |
| PUT | `/:seasonId/:memberId/batch` | 批量更新 | admin |
| GET | `/:seasonId/summary` | 全员分数总览 | admin |

### 6.5 飞书数据 `/api/feishu`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/:seasonId/:userId` | 某人飞书数据 | admin |
| POST | `/:seasonId/mock` | 生成Mock数据 | admin |
| PUT | `/:seasonId/:userId/:metricKey` | 覆盖某项数据 | admin |

### 6.6 举证 `/api/evidence`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/pending` | 待审核列表 | admin |
| GET | `/mine/:seasonId` | 我的举证 | participant |
| POST | `/` | 提交举证 | participant |
| PUT | `/:id/status` | 审核通过/驳回 | admin |
| GET | `/:id` | 举证详情 | 已登录 |
| DELETE | `/:id` | 撤回举证 | participant(自己的) |

### 6.7 组织分 `/api/org-scores`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/types` | 组织分类型列表 | 已登录 |
| GET | `/:seasonId/:memberId` | 某人组织分 | admin |
| POST | `/:seasonId/:memberId` | 新增组织分 | admin |
| PUT | `/:id` | 编辑组织分 | admin |
| DELETE | `/:id` | 删除组织分 | admin |
| GET | `/:seasonId/summary` | 全员组织分总览 | admin |

### 6.8 用户管理 `/api/users`

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/` | 用户列表 | admin |
| GET | `/:id` | 用户详情 | admin |
| PUT | `/:id` | 编辑用户 | admin |
| POST | `/:id/reset-password` | 重置密码 | admin |

---

## 7. 前端页面设计

### 7.1 路由结构

```
/login                          飞书OAuth登录入口（重定向到飞书）
/auth/callback                  飞书回调（后端处理，不渲染页面）
/dashboard                      参赛者主视图
  - 当前赛季概览
  - 我的分数详情卡（可展开各维度各指标）
  - 我的排名
/rankings/:seasonId             排名看板
  - 岗位Tab切换（产品/设计/研发）
  - 排名表格 + 271分布标签
/evidence/submit                提交举证
  - 选择指标 → 填写描述 → 上传附件
/evidence/mine                  我的举证列表

/admin/seasons                  赛季管理
  - 赛季列表 + 新建/编辑/激活/结束
  - 赛季成员管理
/admin/scores/:seasonId         分数录入
  - 类电子表格：行=成员，列=指标
  - 颜色标识数据来源
  - 批量保存 + 重新计算
/admin/evidence                 举证审核
  - 待审核队列
  - 审核面板：查看详情 + 通过/驳回
/admin/org-scores/:seasonId     组织分管理
  - 成员×组织分类型 网格
  - 封顶校验提示
/admin/feishu/:seasonId         飞书数据管理
  - 数据预览 + Mock生成
```

### 7.2 核心页面交互

#### 分数录入表格（管理员最常用页面）

```
┌─────────────────────────────────────────────────────────────────┐
│ 2026 Q2 赛季 — 产品岗分数录入                    [保存] [重新计算] │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤
│ 成员     │ PD数量   │ 评审准时率│ 业务价值 │ 体验度量 │ 创新成果│
│          │  (20%)   │  (10%)   │  (15%)   │  (15%)   │  (15%)  │
├──────────┼──────────┼──────────┼──────────┼──────────┼─────────┤
│ 张三     │  42 🟢   │ 96% 🟢   │ 100% 🟡  │ 4.7 🟡   │ 3 🔵   │
│ 李四     │  35 🟢   │ 88% 🟢   │ 85% 🟡   │ 4.5 🟡   │ —       │
│ 王五     │  28 🟢   │ 92% 🟢   │ 78% 🟡   │ 4.3 🟡   │ 1 🔵   │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────────┘

🟢 飞书数据  🟡 管理员录入  🔵 用户举证  ⬜ 缺失
```

#### 参赛者仪表盘

```
┌───────────────────────────────────────────────────┐
│  2026 Q2 赛季 — 我的成绩                           │
├───────────────────────────────────────────────────┤
│                                                    │
│  岗位分: 85.6    组织分: 12.0    总分: 97.6        │
│  排名: 第3名/15人   271分布: 7                    │
│                                                    │
├───────────────────────────────────────────────────┤
│  ▼ 交付效率 (30%) — 得分: 88.5                     │
│    ├ PD数量 (20%): 原始值42 → 92分                │
│    └ 评审准时率 (10%): 原始值96% → 84分            │
│  ▼ 需求价值 (30%) — 得分: 82.0                     │
│    ├ 业务价值完成度 (15%): 原始值100% → 100分      │
│    └ 用户体验度量 (15%): 原始值4.7 → 64分          │
│  ▼ 创新突破 (15%) — 得分: 60.0                     │
│    └ 创新成果数 (15%): 采纳3个 → 60分              │
│  ▼ 交付质量 (10%) — 得分: 100.0                    │
│    └ 上线率 (10%): 100% → 100分                    │
│  ▼ 协作贡献 (15%) — 得分: 90.0                     │
│    ├ 社区点赞 (5%): 8个 → 84分                     │
│    └ 问题解决 (10%): 3个 → 80分                    │
├───────────────────────────────────────────────────┤
│  原始岗位分: 84.1                                  │
│  上赛季岗位分: 69 (B+)                             │
│  增长率: 21.9%                                     │
│  线性赋分: 80.0 (第3名/15人)                        │
│  保护机制: 未触发 (原始分<85)                       │
│  最终岗位分: 80.0                                  │
└───────────────────────────────────────────────────┘
```

---

## 8. 评分引擎核心算法

### 8.1 阈值得分计算

```typescript
function calculateThresholdScore(
  value: number,
  threshold100: number,
  threshold60: number
): number {
  if (value >= threshold100) return 100;
  if (value >= threshold60) {
    return 60 + (value - threshold60) / (threshold100 - threshold60) * 40;
  }
  return 0;
}
```

### 8.2 线性赋分（按增长率排名）

```typescript
function assignLinearScores(members: { growth: number }[]): Map<number, number> {
  const sorted = [...members].sort((a, b) => b.growth - a.growth);
  const N = sorted.length;
  const scores = new Map<number, number>();

  sorted.forEach((m, i) => {
    if (N === 1) {
      scores.set(m.id, 100);
    } else {
      scores.set(m.id, 100 - i * (100 - 60) / (N - 1));
    }
  });

  return scores;
}
```

### 8.3 保护机制

```typescript
function applyProtection(
  rawScore: number,
  linearScore: number
): number {
  if (rawScore >= 85) {
    return Math.max(rawScore, linearScore);
  }
  return linearScore;
}
```

### 8.4 271 分布

```typescript
function calculate271(totalMembers: number): string[] {
  const topCount = Math.max(1, Math.round(totalMembers * 0.2));
  const bottomCount = Math.max(1, Math.round(totalMembers * 0.1));

  return Array.from({ length: totalMembers }, (_, i) => {
    if (i < topCount) return '2';
    if (i >= totalMembers - bottomCount) return '1';
    return '7';
  });
}
```

---

## 9. 项目目录结构

```
crown-competition/
├── package.json
├── tsconfig.base.json
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── lib/
│   │   │   ├── feishu.ts              # 飞书OAuth服务（参考skillhub）
│   │   │   ├── auth.ts                # 权限校验（getCurrentUser, requireAdmin）
│   │   │   └── session.ts             # IronSession配置
│   │   ├── config/
│   │   │   └── admins.json            # 管理员初始列表 + 登录限制配置
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.sql
│   │   │   └── seed.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── adminOnly.ts
│   │   │   └── errorHandler.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── seasons.ts
│   │   │   ├── users.ts
│   │   │   ├── scores.ts
│   │   │   ├── scoring.ts
│   │   │   ├── evidence.ts
│   │   │   ├── orgScores.ts
│   │   │   └── feishu.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── season.service.ts
│   │   │   ├── scoring.service.ts
│   │   │   ├── evidence.service.ts
│   │   │   ├── orgScore.service.ts
│   │   │   └── feishu.service.ts
│   │   ├── utils/
│   │   │   ├── scoringFormulas.ts
│   │   │   └── constants.ts
│   │   └── types/
│   │       ├── express.d.ts
│   │       └── entities.ts
│   └── tests/
│       └── scoring.test.ts
│
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   ├── client.ts
        │   ├── auth.ts
        │   ├── seasons.ts
        │   ├── scores.ts
        │   ├── scoring.ts
        │   ├── evidence.ts
        │   ├── orgScores.ts
        │   └── feishu.ts
        ├── components/
        │   ├── layout/
        │   │   ├── AppLayout.tsx
        │   │   ├── Sidebar.tsx
        │   │   └── Header.tsx
        │   ├── common/
        │   │   ├── DataTable.tsx
        │   │   ├── ScoreBadge.tsx
        │   │   └── DistributionBadge.tsx
        │   ├── scoring/
        │   │   ├── ScoreBreakdownCard.tsx
        │   │   └── DimensionRow.tsx
        │   ├── ranking/
        │   │   ├── RankingTable.tsx
        │   │   └── RoleTabs.tsx
        │   └── evidence/
        │       ├── EvidenceForm.tsx
        │       └── ReviewPanel.tsx
        ├── pages/
        │   ├── Login.tsx
        │   ├── Dashboard.tsx
        │   ├── Rankings.tsx
        │   ├── EvidenceSubmit.tsx
        │   ├── EvidenceList.tsx
        │   └── admin/
        │       ├── SeasonManager.tsx
        │       ├── MemberManager.tsx
        │       ├── ScoreEntry.tsx
        │       ├── EvidenceReview.tsx
        │       ├── OrgScoreManager.tsx
        │       └── FeishuManager.tsx
        ├── store/
        │   ├── authStore.ts
        │   └── uiStore.ts
        └── types/
            ├── api.ts
            └── models.ts
```

---

## 10. 实施步骤

| 步骤 | 内容 | 关键产出 |
|------|------|----------|
| 1 | 项目脚手架 + 数据库 | monorepo、schema.sql、seed.ts |
| 2 | 飞书登录 + 权限 | OAuth2.0登录、IronSession、登录限制、角色判定 |
| 3 | 评分公式引擎 | scoringFormulas.ts + 单元测试 |
| 4 | 赛季 + 成员管理 | 赛季CRUD、成员添加、绩效初始化 |
| 5 | 管理员分数录入 | ScoreEntry.tsx 电子表格、管理员角色管理 |
| 6 | 举证工作流 | 提交→审核→采纳 |
| 7 | 组织分管理 | 录入+封顶校验 |
| 8 | 排名看板 + 仪表盘 | 排名表、分数详情卡 |
| 9 | Mock数据 + 测试 | 全流程验证 |
