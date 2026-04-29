# 飞书项目 OpenAPI 取数与指标同步实施文档

> 版本: v1.0  
> 日期: 2026-04-28  
> 适用项目: 皇冠赛平台  
> 目标: 从飞书项目拉取赛季内需求、设计、研发、问题和故障数据，聚合为本系统 `scoring_dimensions` 中的飞书指标，并写入 `indicator_scores`。

## 1. 结论

飞书项目取数建议走「飞书项目插件 OpenAPI」，不是当前 `server/src/lib/feishu.ts` 中登录用的 `https://open.feishu.cn/open-apis`。

推荐链路：

```text
飞书项目插件凭证
  -> plugin_token
  -> 字段发现 / 工作项类型发现 / 用户映射
  -> 按赛季时间、人员、工作项类型分页拉取工作项
  -> 按岗位聚合指标
  -> upsert indicator_scores(source = 'feishu', approved = 1)
  -> POST /api/scoring/calculate/:seasonId
```

这版不建议继续使用 `feishu_data_cache` 承接业务结果。原始数据如果需要审计，可以后续单独做同步日志或原始快照表。

## 2. 官方与参考资料

优先以飞书项目帮助中心为准：

- 飞书项目 OpenAPI 概述: https://project.feishu.cn/b/helpcenter/1p8d7djs/4bsmoql6
- 飞书项目 OpenAPI FAQ: https://www.feishu.cn/content/60bl79n2
- 飞书项目插件管理入口: https://project.feishu.cn

辅助接口索引用于快速查 API 路径：

- 飞书项目 Meegle API 文档社区版: https://0msnllx48v.apifox.cn
- LLM 索引: https://0msnllx48v.apifox.cn/llms.txt

关键确认点：

- 调用空间数据前，需要先创建插件、申请权限，并把插件安装到对应空间。
- `project_key` 可以通过双击空间名称复制，也可以使用空间域名 `simple_name`。
- `X-USER-KEY` 可双击用户头像获取，也可通过「获取用户详情」接口按邮箱查询。
- 复杂搜索接口里的 `SearchParam.param_key` 与空间字段的 `field_key` 相同。
- 视图接口取数依赖视图保存后的筛选条件；如果视图筛选改了但没保存，API 返回可能和页面看到的不一致。

## 3. 环境变量

在后端 `.env` 增加以下配置：

```bash
# 飞书项目 OpenAPI，不是飞书开放平台 OAuth app_id/app_secret
FEISHU_PROJECT_BASE_URL=https://project.feishu.cn
FEISHU_PROJECT_PLUGIN_ID=cli_xxx
FEISHU_PROJECT_PLUGIN_SECRET=xxx
FEISHU_PROJECT_USER_KEY=7012514555133xxxx
FEISHU_PROJECT_KEY=your_project_key_or_simple_name

# 工作项类型。默认可先按飞书项目系统类型配置，实际以空间返回为准
FEISHU_PROJECT_STORY_TYPE=story
FEISHU_PROJECT_ISSUE_TYPE=issue
FEISHU_PROJECT_TASK_TYPE=task

# 可选：控制单页数量。接口通常支持 page_num/page_size
FEISHU_PROJECT_PAGE_SIZE=100
```

注意：

- `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 仍用于当前系统飞书登录。
- `FEISHU_PROJECT_PLUGIN_ID` / `FEISHU_PROJECT_PLUGIN_SECRET` 专用于飞书项目取数。
- `FEISHU_PROJECT_USER_KEY` 建议使用空间管理员或有全量读取权限的服务账号，避免因为用户权限导致漏数。

## 4. 核心 API 清单

### 4.1 获取 plugin_token

```http
POST /open_api/authen/plugin_token
Host: project.feishu.cn
Content-Type: application/json
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/authen/plugin_token" \
  -H 'Content-Type: application/json' \
  -d "{
    \"plugin_id\": \"$FEISHU_PROJECT_PLUGIN_ID\",
    \"plugin_secret\": \"$FEISHU_PROJECT_PLUGIN_SECRET\"
  }"
```

返回中的 `data.token` 用作后续 `X-PLUGIN-TOKEN`。`expire_time` 是过期时间，服务端应缓存到过期前 5 分钟。

### 4.2 获取用户详情

用于把系统用户 `email` 或 `union_id/out_id` 映射到飞书项目 `user_key`。

```http
POST /open_api/user/query
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/user/query" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"emails":["zhangsan@example.com"]}'
```

建议映射优先级：

1. `users.email -> user_key`
2. `users.id(open_id) -> out_id/union_id`，如果你能拿到当前开放平台应用下的统一身份
3. 姓名只做人工兜底，不建议自动匹配

### 4.3 获取字段信息

用于生成字段映射表，避免靠页面名称猜字段。

```http
POST /open_api/{project_key}/field/all
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/$FEISHU_PROJECT_KEY/field/all" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"work_item_type_key":"story"}'
```

返回重点字段：

- `field_key`: 复杂搜索、详情返回、字段读取的稳定 key
- `field_alias`: 字段对接标识，部分空间会配置
- `field_name`: 页面显示名，只用于人工核对
- `field_type_key`: 字段类型，例如 `user`、`number`、`date`、`select`

### 4.4 获取创建工作项元数据

用于查看某类工作项详情页可返回哪些字段、角色与人员配置。

```http
GET /open_api/{project_key}/work_item/{work_item_type_key}/meta
```

```bash
curl -sS "$FEISHU_PROJECT_BASE_URL/open_api/$FEISHU_PROJECT_KEY/work_item/story/meta" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY"
```

### 4.5 获取指定工作项列表

适合按工作项类型、人员、创建/更新时间、状态做基础筛选。

```http
POST /open_api/{project_key}/work_item/filter
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/$FEISHU_PROJECT_KEY/work_item/filter" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d "{
    \"work_item_type_keys\": [\"story\"],
    \"user_keys\": [\"7012514555133xxxx\"],
    \"created_at\": {\"start\": 1711900800000, \"end\": 1714492799000},
    \"page_num\": 1,
    \"page_size\": 100,
    \"expand\": {
      \"need_workflow\": true,
      \"relation_fields_detail\": true,
      \"need_multi_text\": true,
      \"need_user_detail\": true,
      \"need_sub_task_parent\": true
    }
  }"
```

### 4.6 获取指定工作项列表，复杂传参

这是本项目最推荐的通用查询接口，用于按任意字段筛选。

```http
POST /open_api/{project_key}/work_item/{work_item_type_key}/search/params
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/$FEISHU_PROJECT_KEY/work_item/story/search/params" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d "{
    \"search_group\": {
      \"conjunction\": \"AND\",
      \"search_params\": [
        {\"param_key\": \"owner\", \"operator\": \"IN\", \"value\": [\"7012514555133xxxx\"]},
        {\"param_key\": \"created_at\", \"operator\": \"BETWEEN\", \"value\": [1711900800000, 1714492799000]}
      ]
    },
    \"fields\": [\"name\", \"owner\", \"created_at\", \"updated_at\"],
    \"page_num\": 1,
    \"page_size\": 100,
    \"expand\": {
      \"need_workflow\": true,
      \"relation_fields_detail\": true,
      \"need_multi_text\": true,
      \"need_user_detail\": true,
      \"need_sub_task_parent\": true
    }
  }"
```

`operator` 的实际可用值需要结合飞书项目「搜索参数格式及常用示例」和空间字段类型联调确认。文档落地时不要硬编码字段名和 operator，应做成配置。

### 4.7 获取工作项详情

用于列表返回字段不够时，按 ID 批量补详情。

```http
POST /open_api/{project_key}/work_item/{work_item_type_key}/query
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/$FEISHU_PROJECT_KEY/work_item/story/query" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "work_item_ids": [123456789],
    "fields": ["name", "owner", "created_at", "updated_at"],
    "expand": {
      "need_workflow": true,
      "relation_fields_detail": true,
      "need_multi_text": true,
      "need_user_detail": true,
      "need_sub_task_parent": true
    }
  }'
```

### 4.8 获取视图下工作项列表

适合业务已经维护好固定视图或全景视图的场景。优点是不用在代码里复刻所有复杂筛选，缺点是依赖视图配置变更。

```http
POST /open_api/{project_key}/view/{view_id}
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/$FEISHU_PROJECT_KEY/view/$VIEW_ID" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "page_num": 1,
    "page_size": 100,
    "expand": {
      "need_workflow": true,
      "relation_fields_detail": true,
      "need_multi_text": true,
      "need_user_detail": true,
      "need_sub_task_parent": true
    }
  }'
```

### 4.9 获取工作项操作记录

用于判断某些事件是否发生在赛季内，例如状态流转、节点完成、评审动作、字段变更。

```http
POST /open_api/op_record/work_item/list
```

```bash
curl -sS -X POST "$FEISHU_PROJECT_BASE_URL/open_api/op_record/work_item/list" \
  -H "X-PLUGIN-TOKEN: $PLUGIN_TOKEN" \
  -H "X-USER-KEY: $FEISHU_PROJECT_USER_KEY" \
  -H 'Content-Type: application/json' \
  -d "{
    \"project_key\": \"$FEISHU_PROJECT_KEY\",
    \"work_item_ids\": [123456789],
    \"start\": 1711900800000,
    \"end\": 1714492799000,
    \"page_size\": 100
  }"
```

返回 `data.has_more` 和 `data.start_from`，需要循环分页。

## 5. 字段映射配置

飞书项目字段高度可配置，必须先跑字段发现，再落配置。建议在服务端新增：

```ts
type FeishuMetricFieldMap = {
  story: {
    owner: string
    productOwner: string
    designer: string
    developer: string
    standardHours: string
    pd: string
    clientPd: string
    reviewPlanAt: string
    reviewDoneAt: string
    launchPlanAt: string
    launchDoneAt: string
    isCore: string
    changePd: string
    designComplexity: string
    designPlanAt: string
    designDoneAt: string
    designReworkPd: string
  }
  issue: {
    owner: string
    resolver: string
    severity: string
    rootCause: string
    closedAt: string
    source: string
  }
  defect: {
    owner: string
    testResult: string
    failedAt: string
  }
}
```

首版可以放在 `.env` 或 `server/src/config/feishuProjectFields.json`。推荐 JSON，便于联调后提交：

```json
{
  "story": {
    "productOwner": "field_product_owner",
    "designer": "field_designer",
    "developer": "field_developer",
    "standardHours": "field_standard_hours",
    "pd": "field_pd",
    "clientPd": "field_client_pd",
    "reviewPlanAt": "field_review_plan_at",
    "reviewDoneAt": "field_review_done_at",
    "launchPlanAt": "field_launch_plan_at",
    "launchDoneAt": "field_launch_done_at",
    "isCore": "field_is_core",
    "changePd": "field_change_pd",
    "designComplexity": "field_design_complexity",
    "designPlanAt": "field_design_plan_at",
    "designDoneAt": "field_design_done_at",
    "designReworkPd": "field_design_rework_pd"
  },
  "issue": {
    "resolver": "field_resolver",
    "severity": "field_severity",
    "rootCause": "field_root_cause",
    "closedAt": "field_closed_at",
    "source": "field_source"
  },
  "defect": {
    "owner": "field_owner",
    "testResult": "field_test_result",
    "failedAt": "field_failed_at"
  }
}
```

## 6. 指标取数口径

当前系统 `server/src/db/seed.ts` 中 `data_source = 'feishu'` 的指标如下。

| 岗位 | 系统指标 | 建议飞书项目来源 | 聚合口径 |
|---|---|---|---|
| product | 产品需求使用研发测试PD数 | 需求 `story` | 赛季内产品负责人为该成员的需求，累加 `pd + clientPd / 3` |
| product | 需求评审通过准时率 | 需求 `story` + 节点/字段 | `reviewDoneAt <= reviewPlanAt` 的数量 / 有评审计划的需求数量 * 100 |
| product | 核心项目准时上线率 | 需求 `story` | `isCore = true` 且 `launchDoneAt <= launchPlanAt` 的数量 / 核心需求数量 * 100 |
| product | 需求变更消耗PD | 需求 `story` 或操作记录 | 累加赛季内需求变更产生的额外 PD |
| product | 线上问题系统解决数 | 问题/缺陷 `issue` | 关闭时间在赛季内，解决人/负责人为该成员的线上问题数量 |
| design | 设计需求完成数（加权） | 需求 `story` | 赛季内设计负责人为该成员且已完成，简单=1、中等=2、复杂=3 |
| design | 设计交付准时率 | 需求 `story` | `designDoneAt <= designPlanAt` 的数量 / 有设计计划的需求数量 * 100 |
| design | 设计返工消耗PD | 需求 `story` 或操作记录 | 累加赛季内设计返工额外 PD |
| design | 线上问题系统解决数 | 问题/缺陷 `issue` | 同产品，可按解决人统计 |
| tech | 消耗需求评估标准工时 | 需求 `story` | 赛季内研发负责人包含该成员，累加标准工时 |
| tech | 过程问题(P0/P1/P2) | 缺陷/问题 `issue` | 赛季内归因该成员，严重等级为 P0/P1/P2 的过程问题数量或折算值 |
| tech | 线上故障(P1/P2) | 线上故障 `issue` | 赛季内 P1/P2 线上故障数量，作为扣分项 |
| tech | 线上问题(仅研发代码) | 线上问题 `issue` | 赛季内根因是研发代码且归因该成员的线上问题数量，作为扣分项 |
| tech | 提测不通过 | 缺陷/测试工作项 | 赛季内提测不通过次数，作为扣分项 |
| tech | 线上问题系统解决数 | 问题/缺陷 `issue` | 关闭时间在赛季内，解决人为该成员的线上问题数量 |

落库时不要用英文 metric key 匹配。当前库表以中文 `indicator_name` 为准，建议用 `(job_role, indicator_name)` 找 `dimension_id`。

## 7. 可运行 Node.js 探测脚本

这个脚本不依赖第三方包，Node.js 18+ 可直接运行。它用于验证 token、字段发现、分页拉取是否通。

新建临时文件 `tmp-feishu-project-probe.mjs`：

```js
const env = process.env

const baseUrl = env.FEISHU_PROJECT_BASE_URL || 'https://project.feishu.cn'
const pluginId = required('FEISHU_PROJECT_PLUGIN_ID')
const pluginSecret = required('FEISHU_PROJECT_PLUGIN_SECRET')
const userKey = required('FEISHU_PROJECT_USER_KEY')
const projectKey = required('FEISHU_PROJECT_KEY')
const storyType = env.FEISHU_PROJECT_STORY_TYPE || 'story'
const pageSize = Number(env.FEISHU_PROJECT_PAGE_SIZE || 100)

function required(name) {
  const value = env[name]
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers['X-PLUGIN-TOKEN'] = token
    headers['X-USER-KEY'] = userKey
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Non-JSON response ${response.status}: ${text.slice(0, 300)}`)
  }

  const code = json.err_code ?? json.error?.code
  if (!response.ok || (code != null && code !== 0)) {
    throw new Error(`API error ${response.status}: ${text}`)
  }
  return json
}

async function getPluginToken() {
  const json = await request('/open_api/authen/plugin_token', {
    method: 'POST',
    body: { plugin_id: pluginId, plugin_secret: pluginSecret },
  })
  return json.data.token
}

async function getFields(token, workItemTypeKey) {
  const json = await request(`/open_api/${projectKey}/field/all`, {
    method: 'POST',
    token,
    body: { work_item_type_key: workItemTypeKey },
  })
  return json.data || []
}

async function searchStories(token) {
  const json = await request(`/open_api/${projectKey}/work_item/filter`, {
    method: 'POST',
    token,
    body: {
      work_item_type_keys: [storyType],
      page_num: 1,
      page_size: pageSize,
      expand: {
        need_workflow: true,
        relation_fields_detail: true,
        need_multi_text: true,
        need_user_detail: true,
        need_sub_task_parent: true,
      },
    },
  })
  return json
}

const token = await getPluginToken()
console.log('plugin_token ok')

const fields = await getFields(token, storyType)
console.log('story fields:', fields.slice(0, 20).map(f => ({
  key: f.field_key,
  alias: f.field_alias,
  name: f.field_name,
  type: f.field_type_key,
})))

const stories = await searchStories(token)
console.log('story page:', {
  count: stories.data?.length || 0,
  pagination: stories.pagination,
  first: stories.data?.[0] && {
    id: stories.data[0].id,
    name: stories.data[0].name,
    type: stories.data[0].work_item_type_key,
  },
})
```

运行：

```bash
set -a
source .env
set +a
node tmp-feishu-project-probe.mjs
```

## 8. 服务端实现轮廓

建议新增 `server/src/services/feishuProject.service.ts`，职责如下：

```ts
type ProjectApiOptions = {
  baseUrl: string
  pluginId: string
  pluginSecret: string
  userKey: string
  projectKey: string
}

export class FeishuProjectService {
  private pluginToken?: { value: string; expiresAt: number }

  constructor(private options: ProjectApiOptions) {}

  async getPluginToken(): Promise<string> {
    if (this.pluginToken && Date.now() < this.pluginToken.expiresAt - 300_000) {
      return this.pluginToken.value
    }

    const data = await this.request('/open_api/authen/plugin_token', {
      method: 'POST',
      auth: false,
      body: {
        plugin_id: this.options.pluginId,
        plugin_secret: this.options.pluginSecret,
      },
    })

    this.pluginToken = {
      value: data.data.token,
      expiresAt: Date.now() + data.data.expire_time * 1000,
    }
    return this.pluginToken.value
  }

  async request(path: string, init: { method?: string; auth?: boolean; body?: unknown }) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (init.auth !== false) {
      headers['X-PLUGIN-TOKEN'] = await this.getPluginToken()
      headers['X-USER-KEY'] = this.options.userKey
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method: init.method || 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const json = await response.json()
    const code = json.err_code ?? json.error?.code
    if (!response.ok || (code != null && code !== 0)) {
      throw new Error(`Feishu Project API failed: ${JSON.stringify(json)}`)
    }
    return json
  }

  async queryUserByEmail(email: string) {
    return this.request('/open_api/user/query', {
      method: 'POST',
      body: { emails: [email] },
    })
  }

  async listWorkItemsByFilter(body: unknown) {
    return this.request(`/open_api/${this.options.projectKey}/work_item/filter`, {
      method: 'POST',
      body,
    })
  }

  async searchWorkItems(workItemTypeKey: string, body: unknown) {
    return this.request(
      `/open_api/${this.options.projectKey}/work_item/${workItemTypeKey}/search/params`,
      { method: 'POST', body },
    )
  }
}
```

再新增 `server/src/services/feishuSync.service.ts`：

```ts
export async function syncSeasonFeishuData(seasonId: number) {
  const db = getDb()
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId)
  if (!season) throw new Error('赛季不存在')

  const members = db.prepare(`
    SELECT sm.id AS season_member_id, sm.user_id, sm.job_role, u.email, u.name
    FROM season_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.season_id = ?
  `).all(seasonId)

  const result = { syncedCount: 0, skippedCount: 0, writtenScoreCount: 0, warnings: [] as unknown[] }

  for (const member of members) {
    try {
      const metrics = await aggregateMemberMetrics(member, season)
      const written = writeIndicatorScores(db, member, metrics)
      result.syncedCount += 1
      result.writtenScoreCount += written
    } catch (error) {
      result.skippedCount += 1
      result.warnings.push({ userId: member.user_id, reason: String(error) })
    }
  }

  return result
}
```

写分建议：

```sql
INSERT INTO indicator_scores (
  season_member_id, dimension_id, raw_value, source, approved, notes
) VALUES (?, ?, ?, 'feishu', 1, ?)
ON CONFLICT(season_member_id, dimension_id)
DO UPDATE SET
  raw_value = excluded.raw_value,
  source = 'feishu',
  approved = 1,
  notes = excluded.notes
```

## 9. 路由调整

当前 `server/src/routes/feishu.ts` 仍是 mock + `feishu_data_cache` 模式。建议替换为：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/feishu/:seasonId/sync` | 同步整个赛季并触发重算 |
| POST | `/api/feishu/:seasonId/:userId/sync` | 同步单人并触发整赛季重算 |
| GET | `/api/feishu/:seasonId/:userId/preview` | 只拉取和聚合，不落库 |
| GET | `/api/feishu/project/fields/:workItemTypeKey` | 字段发现，联调阶段使用 |

保留 admin 权限：

```ts
feishuRouter.post('/:seasonId/sync', adminMiddleware, async (req, res, next) => {
  try {
    const result = await syncSeasonFeishuData(Number(req.params.seasonId))
    // 当前项目的重算逻辑在 POST /api/scoring/calculate/:seasonId。
    // 实现时建议把 routes/scoring.ts 内的计算逻辑抽成 service 后在这里直接调用。
    await scoringService.calculateSeason(Number(req.params.seasonId))
    res.json(result)
  } catch (error) {
    next(error)
  }
})
```

## 10. 分页与限流

通用分页策略：

- `work_item/filter`: 按 `pagination.total` 与 `page_num/page_size` 翻页。
- `search/params`: 同上。
- `op_record/work_item/list`: 按 `data.has_more` 与 `data.start_from` 翻页。

建议控制：

- 单页 `page_size=100` 起步，联调确认最大值后再调高。
- 全赛季同步按成员串行或小并发，建议并发 3 到 5。
- 对 API 错误做指数退避，权限类错误不要重试。

## 11. 联调检查表

1. 插件已安装到目标空间，且具有读取工作项、字段、用户、操作记录等权限。
2. `FEISHU_PROJECT_USER_KEY` 对目标空间有足够权限。
3. `node tmp-feishu-project-probe.mjs` 能拿到 token、字段、至少一页工作项。
4. 通过字段发现结果完成 `feishuProjectFields.json`。
5. 用 1 个产品、1 个设计、1 个研发成员做 preview，人工核对飞书页面和聚合值。
6. 写入 `indicator_scores` 后，调用 `/api/scoring/calculate/:seasonId`，确认排行页指标正常。
7. 明确 0 与缺失的区别：真实查到 0 才写 0；人员映射失败或字段缺失应跳过并 warning。

## 12. 第一版落地范围

第一版建议只做：

- 管理员手动同步
- 全赛季同步
- 单人 preview
- 单人同步
- 字段映射 JSON
- 直接写 `indicator_scores`
- 同步后自动重算

暂不做：

- 用户页面实时查飞书项目
- 原始飞书数据缓存表
- 自动 webhook 增量同步
- 页面化字段映射配置
- 复杂历史审计报表

## 13. 已知风险

- 飞书项目字段、流程、节点高度自定义，同名字段不能直接当稳定接口字段使用。
- `X-USER-KEY` 的权限会影响取数完整性，推荐固定服务账号。
- 视图接口取数简单，但强依赖业务人员保存视图筛选条件。
- 状态流转、评审通过、提测不通过等动作如果没有结构化字段，可能需要结合操作记录聚合。
- 当前评分维度里部分技术指标是扣分项，写入时应写原始次数，由现有 `scoring` 逻辑按 `deduction_per_unit` 扣分。
