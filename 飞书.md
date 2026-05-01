# 飞书项目取数设计文档

> 版本: v1.0 | 日期: 2026-04-26

> 最新可运行实施文档见 [docs/feishu-project-openapi-sync.md](/Users/pengyuang/Desktop/play/game/docs/feishu-project-openapi-sync.md:1)，其中补充了飞书项目 OpenAPI 鉴权、字段发现、工作项分页查询、指标映射和 Node.js 探测脚本。

---

## 1. 设计目标

本文档用于补充“皇冠赛平台”中飞书项目数据的取数方案，明确在**不使用缓存表**的前提下，如何从飞书项目拉取数据、聚合指标、写入评分表并触发算分。

本方案适用于当前试点规模：

- 参赛人数约 50 人
- 数据范围按赛季统计
- 管理员低频触发同步

**核心原则**：

- 不引入 `feishu_data_cache`
- 不在用户页面访问时实时查询飞书
- 统一由管理员触发“同步飞书数据”
- 同步结果直接写入 `indicator_scores`

---

## 2. 为什么这一版不做缓存

当前系统中的飞书数据消费方式，本质上是“赛季维度批量算分”，不是高频在线查询。

对于约 50 名参赛者：

- 单次全量同步的人数可控
- 同步频率可控，通常是每日一次或算分前一次
- 飞书项目原始数据需要先做业务聚合，最终系统只关心指标结果

因此第一版可以去掉缓存层，减少一张中间表和一套中间态接口，链路更直接：

```text
飞书项目 -> 后端同步服务 -> 指标聚合 -> indicator_scores -> scoring.calculate
```

不建议采用的方式：

- 排行榜页面实时查飞书
- 用户打开详情页时即时拉飞书项目
- 每个接口请求都从飞书现算指标

原因很简单：即使人数不多，这种模式也会让页面响应受外部接口稳定性影响，而且难以排查数据口径问题。

---

## 3. 总体方案

### 3.1 新的数据链路

```text
管理员点击“同步飞书项目数据”
        ↓
后端读取赛季成员 season_members
        ↓
按成员身份查询飞书项目中的原始数据
        ↓
按岗位规则聚合为系统指标
        ↓
upsert 到 indicator_scores.raw_value
        ↓
触发 /api/scoring/calculate/:seasonId
        ↓
生成最终岗位分、总分、排名
```

### 3.2 与现有系统的衔接关系

本方案保留现有能力：

- `users`
- `season_members`
- `scoring_dimensions`
- `indicator_scores`
- `/api/scoring/calculate/:seasonId`

本方案调整点：

- 不再依赖 `feishu_data_cache`
- `server/src/routes/feishu.ts` 从“mock + 覆盖单值”转为“同步接口”
- 飞书同步服务直接写 `indicator_scores`

---

## 4. 同步时机

推荐只支持以下三种同步方式：

### 4.1 管理员手动同步

管理员在后台点击“同步飞书项目数据”，适合：

- 赛季初始化
- 算分前人工确认
- 修正人员映射后重新同步

### 4.2 定时同步

可选。每天凌晨或工作日固定时段执行一次，适合：

- 赛季中持续更新
- 降低人工操作成本

### 4.3 单人重同步

当某个人的数据口径有误、人员映射修正、项目归属变化时，只重拉单人数据。

---

## 5. 接口设计

飞书相关接口建议调整为以下形式。

### 5.1 全赛季同步

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| POST | `/api/feishu/:seasonId/sync` | 同步整个赛季所有成员的飞书项目数据并触发重算 | admin |

返回示例：

```json
{
  "seasonId": 1,
  "memberCount": 50,
  "syncedCount": 47,
  "skippedCount": 3,
  "writtenScoreCount": 286,
  "durationMs": 4280,
  "warnings": [
    {
      "userId": "ou_xxx",
      "reason": "未找到飞书项目成员映射"
    }
  ]
}
```

### 5.2 单人同步

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| POST | `/api/feishu/:seasonId/:userId/sync` | 同步单个人的飞书项目数据并触发整赛季重算 | admin |

说明：

- 虽然是单人同步，但由于最终排名依赖整组排序，建议同步后仍然调用整赛季重算接口。

### 5.3 同步预览

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/api/feishu/:seasonId/:userId/preview` | 只查看聚合结果，不落库 | admin |

适用于口径联调阶段，便于验证：

- 飞书原始数据是否查对
- 指标聚合是否正确
- 最终 `metric -> dimension` 映射是否正确

### 5.4 同步结果查询

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/api/scores/:seasonId/:memberId` | 查看该成员当前已写入的评分指标 | admin |

说明：

- 既然不保留缓存层，就不再单独提供“查询飞书缓存”的接口
- 同步结果以 `indicator_scores` 为准

---

## 6. 数据表使用方式

### 6.1 保留表

#### users

用于维护系统用户基础信息，主键为飞书 `open_id`。

#### season_members

用于表示赛季成员关系和岗位归属，是本次同步的成员范围来源。

#### scoring_dimensions

用于定义指标口径、权重和得分规则。飞书同步时需要根据岗位和指标名找到对应维度。

#### indicator_scores

飞书同步的最终写入表。至少写入：

- `season_member_id`
- `dimension_id`
- `raw_value`
- `source = 'feishu'`

### 6.2 可废弃表

#### feishu_data_cache

这一版设计中不再使用：

- 不作为飞书原始数据缓存
- 不作为调试用中间表
- 不作为前端展示接口来源

如后续确实需要审计、追溯、性能缓冲，再考虑恢复。

---

## 7. 取数范围与过滤规则

飞书项目数据必须带上明确的赛季范围，不能全量无条件扫描。

### 7.1 时间范围

同步时必须使用赛季时间：

- `season.start_date`
- `season.end_date`

用于过滤飞书项目中的：

- 需求创建/完成时间
- 评审完成时间
- 上线时间
- 提测时间
- 故障发生时间
- 问题关闭时间

### 7.2 人员范围

同步成员以 `season_members` 为准，不以飞书项目全员为准。

即：

- 先查出该赛季参与成员
- 再逐个对成员做飞书项目数据查询

### 7.3 岗位范围

成员的 `job_role` 决定需要取哪些指标：

- `product`
- `design`
- `tech`

不同岗位拉同一批原始数据也可以，但最终只聚合自己岗位需要的指标。

---

## 8. 指标映射设计

这一节是整个方案最核心的部分。系统并不关心飞书项目返回了哪些原始字段，系统只关心最终要写入哪些指标。

### 8.1 产品岗

| 系统指标 key | 指标说明 | 聚合口径 |
|------|------|------|
| `pd_count` | 产品需求使用研发测试PD数 | 赛季内该成员负责需求消耗的 PD 折算总和 |
| `review_on_time_rate` | 需求评审通过准时率 | 准时评审数 / 应评审总数 |
| `launch_on_time_rate` | 核心项目准时上线率 | 准时上线核心项目数 / 核心项目总数 |
| `requirement_change_pd` | 需求变更消耗PD | 赛季内需求变更额外消耗 PD 总和 |
| `online_issues_resolved` | 线上问题系统解决数 | 赛季内关闭的线上问题数 |

补充说明：

- `pd_count` 的“客户端 3PD 折算 1PD”必须在聚合逻辑中实现
- `launch_on_time_rate` 只统计定义为核心项目的项目

### 8.2 设计岗

| 系统指标 key | 指标说明 | 聚合口径 |
|------|------|------|
| `design_count_weighted` | 设计需求完成数 | 简单 1 分 / 中等 2 分 / 复杂 3 分的加权总和 |
| `design_on_time_rate` | 设计交付准时率 | 准时交付数 / 应交付总数 |
| `design_rework_pd` | 设计返工消耗PD | 赛季内设计返工额外消耗 PD 总和 |
| `online_issues_resolved` | 线上问题系统解决数 | 赛季内关闭的线上问题数 |

### 8.3 技术岗

| 系统指标 key | 指标说明 | 聚合口径 |
|------|------|------|
| `standard_hours` | 消耗需求评估标准工时 | 赛季内标准工时总和 |
| `online_fault_p1_p2` | 线上故障 P1/P2 | 赛季内 P1/P2 故障数量 |
| `online_fault_p3_p4` | 线上故障 P3/P4 | 赛季内 P3/P4 故障数量 |
| `online_issue_p1` | 线上问题 P1 | 赛季内归因到研发代码的 P1 数量 |
| `online_issue_p2` | 线上问题 P2 | 赛季内归因到研发代码的 P2 数量 |
| `online_issue_p3` | 线上问题 P3 | 赛季内归因到研发代码的 P3 数量 |
| `test_fail_count` | 提测不通过 | 赛季内提测不通过次数 |
| `online_issues_resolved` | 线上问题系统解决数 | 赛季内关闭的线上问题数 |

---

## 9. 人员映射设计

系统用户主键是飞书 `open_id`，但飞书项目中的人员标识不一定直接等于 `open_id`。因此必须补一层“人员映射”。

### 9.1 推荐做法

优先级如下：

1. 如果飞书项目数据源本身支持使用飞书用户 ID，则直接以 `open_id` 对齐
2. 如果只支持邮箱，则使用 `users.email` 对齐
3. 如果只支持姓名，则只能作为兜底，不建议作为长期方案

### 9.2 映射失败处理

若成员无法映射到飞书项目中的责任人：

- 本次同步跳过该成员
- 返回 warning
- 不直接写 0 分

原因：

- “无数据” 和 “真实为 0” 不是一回事
- 跳过并告警更利于排查

---

## 10. 写库策略

### 10.1 写入目标

飞书同步结果直接写入 `indicator_scores`。

建议写入逻辑：

1. 根据 `seasonId + userId` 找到 `season_member_id`
2. 根据 `job_role + indicator_name` 或约定好的 `metric_key` 找到 `dimension_id`
3. upsert `indicator_scores`

建议写入字段：

```typescript
{
  season_member_id,
  dimension_id,
  raw_value,
  source: 'feishu',
  approved: 1,
  notes: 'synced from feishu project'
}
```

### 10.2 upsert 规则

同一个成员、同一个评分维度，只保留一条记录：

```text
UNIQUE(season_member_id, dimension_id)
```

同步时如果记录已存在：

- 更新 `raw_value`
- 更新 `source`
- 保留或覆盖 `notes`

### 10.3 空值处理

不同情况要区分：

- 明确查到结果且为 0：写入 `0`
- 人员未映射成功：跳过，不写
- 飞书接口失败：整次同步失败或部分失败
- 指标暂不适用：跳过，不写

---

## 11. 同步流程设计

### 11.1 全量同步流程

```text
1. 校验管理员权限
2. 查询赛季信息（开始/结束时间）
3. 查询 season_members
4. 按成员逐个构建飞书项目查询条件
5. 拉取成员原始数据
6. 按岗位聚合出系统指标
7. 写入 indicator_scores
8. 执行整赛季算分
9. 返回同步结果摘要
```

### 11.2 单人同步流程

```text
1. 校验管理员权限
2. 查询该成员所属赛季和岗位
3. 拉取该成员在赛季范围内的飞书项目原始数据
4. 聚合系统指标
5. 写入 indicator_scores
6. 触发整赛季重算
7. 返回该成员同步结果
```

### 11.3 事务边界

建议将“单个成员写分”包在数据库事务里：

- 一个成员的多个指标要么一起成功
- 要么一起失败回滚

全赛季同步不建议包成一个超大事务：

- 任意一个成员失败不应该拖垮全体
- 应支持部分成功 + warning 返回

---

## 12. 错误处理

### 12.1 可恢复错误

以下错误不必终止全量同步：

- 单个成员未找到映射
- 单个成员飞书项目无数据
- 单个成员部分指标缺失

处理方式：

- 跳过该成员或该指标
- 记录 warning
- 继续同步其他成员

### 12.2 不可恢复错误

以下错误应直接中断：

- 飞书应用鉴权失败
- 赛季不存在
- 飞书项目接口整体不可用
- 本地评分维度配置缺失且无法定位写入目标

---

## 13. 权限与审计

### 13.1 权限要求

飞书同步接口只允许 `ADMIN` 调用。

### 13.2 操作审计

虽然本方案不做缓存，但仍建议至少记录同步日志。最低要求包括：

- 操作人
- 赛季 ID
- 开始时间
- 结束时间
- 同步人数
- 成功人数
- 失败人数
- warning 摘要

第一版如果不单独建表，也至少应打印结构化日志。

---

## 14. 服务拆分建议

建议新增服务文件：

```text
server/src/services/feishuSync.service.ts
```

职责拆分建议如下：

- `fetchMemberProjectRawData(member, season)`
  - 负责查询单个成员的飞书项目原始数据

- `aggregateProductMetrics(rawData)`
  - 聚合产品岗指标

- `aggregateDesignMetrics(rawData)`
  - 聚合设计岗指标

- `aggregateTechMetrics(rawData)`
  - 聚合技术岗指标

- `writeIndicatorScores(member, metrics)`
  - 将聚合结果写入 `indicator_scores`

- `syncSeasonFeishuData(seasonId)`
  - 执行整赛季同步

- `syncMemberFeishuData(seasonId, userId)`
  - 执行单人同步

这样路由层只负责：

- 参数校验
- 权限控制
- 调用 service
- 返回结果

---

## 15. 与现有代码的改造建议

### 15.1 路由层

当前 [server/src/routes/feishu.ts](/Users/pengyuang/Desktop/play/game/server/src/routes/feishu.ts:1) 仍是 mock 模式，建议改为：

- 删除 `POST /:seasonId/mock`
- 删除 `PUT /:seasonId/:userId/:metricKey`
- 增加 `POST /:seasonId/sync`
- 增加 `POST /:seasonId/:userId/sync`
- 增加 `GET /:seasonId/:userId/preview`

### 15.2 数据库层

当前表结构可以先不删 `feishu_data_cache`，但业务上不再使用它，避免影响已有开发节奏。

### 15.3 评分层

当前 [server/src/routes/scoring.ts](/Users/pengyuang/Desktop/play/game/server/src/routes/scoring.ts:1) 已可消费 `indicator_scores`，因此不需要重写评分算法，只需要保证同步服务能正确填入 `raw_value`。

---

## 16. 第一版实现边界

为了控制复杂度，第一版建议只做以下范围：

- 管理员手动同步
- 全赛季同步
- 单人同步
- 直接写 `indicator_scores`
- 同步后自动重算
- 返回 warning，不做复杂重试

第一版暂不做：

- 页面实时查飞书
- 原始数据缓存
- 原始数据明细入库
- 多次同步历史追溯页面
- 自动补偿重试机制

---

## 17. 结论

对当前 50 人左右的内部竞赛系统，无缓存版飞书项目取数是合理方案。

它的关键不是“省掉缓存表”，而是把系统边界收紧：

- 飞书项目负责提供原始业务数据
- 同步服务负责按赛季和岗位聚合
- `indicator_scores` 负责承接最终评分输入
- `scoring` 负责计算最终结果

只要把“人员映射”和“指标口径映射”两层做好，这个方案就能稳定落地，而且比“缓存一层再算分”更简单直接。
