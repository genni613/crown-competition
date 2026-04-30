# 皇冠赛评分结果层设计

> 目标：支持稳定展示每个成员的指标得分、维度得分、岗位分、组织分和最终总分。
>
> 适用范围：当前项目已有飞书原始事实表、评分规则表、赛季成员表，本文补充“评分结果层”设计，不涉及实现细节。

---

## 1. 设计目标

当前系统已经具备以下数据基础：

- 原始事实层：`feishu_workitem_gongshi`、`feishu_workitem_story`、`feishu_workitem_project`、`feishu_workitem_issue`
- 规则配置层：`scoring_dimensions`
- 赛季成员结果层：`season_members`

缺失的是中间的“结果层”：

- 每个赛季成员在每个指标上的聚合值和指标分
- 每个赛季成员在每个维度上的汇总分

如果没有这层结果表，前端虽然可以临时计算总分，但会有三个问题：

- 无法稳定展示“每个维度得多少分”
- 无法解释“这个指标是怎么来的”
- 规则调整后，难以做重算、对账和追溯

因此建议增加两张结果表：

- `season_indicator_scores`
- `season_dimension_scores`

最终总分仍然落在 `season_members`。

---

## 2. 分层职责

建议把评分数据链路固定成四层。

### 2.1 原始事实层

职责：只存同步回来的明细，不直接承担评分展示。

主要表：

- `feishu_workitem_gongshi`
- `feishu_workitem_story`
- `feishu_workitem_project`
- `feishu_workitem_issue`
- `org_scores`
- `evidence_submissions`

### 2.2 规则配置层

职责：定义指标、权重、阈值、扣分规则。

主要表：

- `scoring_dimensions`

说明：

- 当前 `scoring_dimensions` 一行实际上就是一个“指标定义”
- `dimension_name` 表示维度名
- `indicator_name` 表示指标名

### 2.3 评分结果层

职责：固化“指标结果”和“维度结果”，供页面查询和后续总分计算使用。

新增表：

- `season_indicator_scores`
- `season_dimension_scores`

### 2.4 最终汇总层

职责：存个人最终岗位分、组织分、总分、排名和 271 分布。

主要表：

- `season_members`

---

## 3. 表设计

## 3.1 `season_indicator_scores`

用途：

- 存每个赛季成员在每个指标上的原始聚合值
- 存指标阈值换算后的得分
- 存扣分项的最终扣分
- 支撑“维度下展开看指标明细”

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT PK AUTO_INCREMENT | 主键 |
| `season_id` | BIGINT NOT NULL | 赛季 ID |
| `season_member_id` | BIGINT NOT NULL | 赛季成员 ID |
| `scoring_dimension_id` | BIGINT NOT NULL | 指向 `scoring_dimensions.id` |
| `job_role` | ENUM('product','design','tech') NOT NULL | 冗余岗位，便于查询 |
| `dimension_name` | VARCHAR(255) NOT NULL | 冗余维度名，便于前端展示 |
| `indicator_name` | VARCHAR(255) NOT NULL | 冗余指标名，便于前端展示 |
| `raw_value` | DOUBLE NULL | 聚合后的原始值，如工时、次数、比例 |
| `threshold_score` | DOUBLE NULL | 阈值换算后的 0-100 分 |
| `final_score` | DOUBLE NULL | 指标最终分，扣分项可为负数 |
| `source` | ENUM('feishu','admin','evidence') NOT NULL | 数据来源 |
| `approved` | TINYINT(1) NOT NULL DEFAULT 0 | 是否已审核生效 |
| `calc_snapshot_json` | JSON NULL | 本次计算依据快照 |
| `notes` | TEXT NULL | 备注 |
| `calculated_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 最近一次计算时间 |
| `updated_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

建议约束：

- 唯一键：`uniq_season_member_dimension (season_member_id, scoring_dimension_id)`
- 索引：`idx_indicator_scores_season_member (season_id, season_member_id)`
- 索引：`idx_indicator_scores_dimension (scoring_dimension_id)`

说明：

- 这里的唯一粒度就是“赛季成员 + 指标定义”
- 当前一个 `scoring_dimensions.id` 对应一个指标，因此不需要额外 `indicator_key`
- 但长期看，仍建议后续给 `scoring_dimensions` 增加稳定键

推荐 DDL 草案：

```sql
CREATE TABLE IF NOT EXISTS season_indicator_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT NOT NULL,
  season_member_id BIGINT NOT NULL,
  scoring_dimension_id BIGINT NOT NULL,
  job_role ENUM('product', 'design', 'tech') NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  indicator_name VARCHAR(255) NOT NULL,
  raw_value DOUBLE NULL,
  threshold_score DOUBLE NULL,
  final_score DOUBLE NULL,
  source ENUM('feishu', 'admin', 'evidence') NOT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  calc_snapshot_json JSON NULL,
  notes TEXT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_season_member_dimension (season_member_id, scoring_dimension_id),
  KEY idx_indicator_scores_season_member (season_id, season_member_id),
  KEY idx_indicator_scores_dimension (scoring_dimension_id),
  CONSTRAINT fk_sis_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_sis_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_sis_dimension FOREIGN KEY (scoring_dimension_id) REFERENCES scoring_dimensions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3.2 `season_dimension_scores`

用途：

- 存每个赛季成员在每个维度上的汇总结果
- 支撑“展示每个维度得分”
- 支撑最终岗位分计算

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT PK AUTO_INCREMENT | 主键 |
| `season_id` | BIGINT NOT NULL | 赛季 ID |
| `season_member_id` | BIGINT NOT NULL | 赛季成员 ID |
| `job_role` | ENUM('product','design','tech') NOT NULL | 岗位 |
| `dimension_name` | VARCHAR(255) NOT NULL | 维度名，如“交付效率” |
| `dimension_weight` | DOUBLE NOT NULL | 维度权重，如 `0.30` |
| `raw_dimension_score` | DOUBLE NOT NULL | 维度内指标加权后的原始分，通常 0-100 |
| `weighted_dimension_score` | DOUBLE NOT NULL | 维度贡献分，通常等于 `raw_dimension_score * dimension_weight` |
| `calculated_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 最近一次计算时间 |
| `updated_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

建议约束：

- 唯一键：`uniq_member_dimension_name (season_member_id, dimension_name)`
- 索引：`idx_dimension_scores_season_member (season_id, season_member_id)`

推荐 DDL 草案：

```sql
CREATE TABLE IF NOT EXISTS season_dimension_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT NOT NULL,
  season_member_id BIGINT NOT NULL,
  job_role ENUM('product', 'design', 'tech') NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  dimension_weight DOUBLE NOT NULL,
  raw_dimension_score DOUBLE NOT NULL,
  weighted_dimension_score DOUBLE NOT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_member_dimension_name (season_member_id, dimension_name),
  KEY idx_dimension_scores_season_member (season_id, season_member_id),
  CONSTRAINT fk_sds_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_sds_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

说明：

- 这里暂时用 `dimension_name` 作为唯一维度标识，是为了兼容当前表结构
- 如果后续要长期演进，建议补一张维度定义表，或者在 `scoring_dimensions` 中新增 `dimension_key`

---

## 3.3 `season_members`

`season_members` 不再承载指标明细和维度明细，只负责最终汇总结果。

保留现有关键字段：

- `prev_raw_score`
- `raw_position_score`
- `growth`
- `linear_score`
- `final_position_score`
- `total_org_score`
- `total_score`
- `rank`
- `distribution`

字段含义建议统一为：

- `raw_position_score`：所有维度贡献分之和，再减去扣分项之后的岗位原始分
- `final_position_score`：经过增长率线性映射和保护机制后的岗位分
- `total_org_score`：审核通过后的组织分汇总，封顶 25
- `total_score`：`final_position_score + total_org_score`

---

## 4. 计算链路设计

建议固定成三步，避免把聚合、评分、排名揉在一个函数里。

### 4.1 第一步：生成指标结果

输入：

- 赛季时间范围
- 赛季成员
- `scoring_dimensions`
- 原始事实表 / 管理员录入 / 举证数据

输出：

- 写入 `season_indicator_scores`

处理逻辑：

1. 遍历赛季成员
2. 读取该岗位对应的全部指标定义
3. 每个指标根据来源和规则聚合出 `raw_value`
4. 根据阈值或扣分规则计算：
   - `threshold_score`
   - `final_score`
5. 保存本次计算快照到 `calc_snapshot_json`

说明：

- `feishu` 来源指标由聚合器自动写入
- `admin` 来源指标由后台录入后写入
- `evidence` 来源指标需要审批通过后写入或更新 `approved=1`

### 4.2 第二步：汇总维度结果

输入：

- `season_indicator_scores`

输出：

- 写入 `season_dimension_scores`

处理逻辑：

1. 按 `season_member_id + dimension_name` 分组
2. 对 `threshold` 类型指标：
   - 维度内做 `sum(indicator final_score * indicator_weight)`
   - 再除以 `dimension_weight` 得到 `raw_dimension_score`
3. 对 `deduction` 类型指标：
   - 不参与维度正向均分
   - 作为总岗位分扣减项单独累计
4. 计算 `weighted_dimension_score = raw_dimension_score * dimension_weight`

说明：

- 展示维度分时，优先展示 `weighted_dimension_score`
- 如果前端想展示“该维度满分 100 下得了多少”，则展示 `raw_dimension_score`

### 4.3 第三步：生成最终总分

输入：

- `season_dimension_scores`
- 扣分项指标
- `org_scores`
- 历史岗位分

输出：

- 更新 `season_members`

处理逻辑：

1. 汇总所有 `weighted_dimension_score`
2. 再减去扣分型指标的绝对值
3. 得到 `raw_position_score`
4. 结合 `prev_raw_score` 计算增长率
5. 计算 `linear_score`
6. 应用保护机制，得到 `final_position_score`
7. 叠加 `total_org_score`
8. 更新 `total_score`、`rank`、`distribution`

---

## 5. 页面展示口径

为了让前端稳定展示，建议页面分成两层。

### 5.1 排名页

直接读 `season_members`，展示：

- 用户信息
- 岗位
- 岗位分
- 组织分
- 总分
- 排名
- 271 分布

### 5.2 个人详情页 / 管理员评分详情页

建议读 `season_dimension_scores + season_indicator_scores`，展示：

- 每个维度的 `weighted_dimension_score`
- 每个维度的 `raw_dimension_score`
- 展开后查看该维度下所有指标：
  - `raw_value`
  - `threshold_score`
  - `final_score`
  - `source`
  - `approved`
  - `notes`

推荐交互结构：

1. 总分卡片
2. 维度分卡片列表
3. 点击维度后展开指标明细

---

## 6. 与现有表的关系

## 6.1 `indicator_scores` 的处理建议

当前项目已有 `indicator_scores`，但它的职责偏旧：

- 没有显式 `season_id`
- 命名上更像历史的人工录分表
- 不足以表达“维度结果”

建议：

- 不继续扩展旧表作为长期方案
- 新建 `season_indicator_scores`
- 后续由新表替代旧表在评分链路中的职责

如果希望迁移更平滑，也可以分两步：

1. 先新增新表并开始写新数据
2. 等查询接口和计算流程全部切到新表后，再考虑废弃旧表

## 6.2 `scoring_dimensions` 的演进建议

当前 `scoring_dimensions` 足够支撑第一阶段，但后续建议新增两个稳定字段：

- `dimension_key`
- `indicator_key`

原因：

- 中文名适合展示，不适合做长期关联键
- 后续规则名称微调时，稳定键能减少迁移成本

---

## 7. 快照字段建议

`season_indicator_scores.calc_snapshot_json` 建议保存最小可追溯信息，不要把全部原始明细无限堆进去。

推荐结构示例：

```json
{
  "season_range": {
    "start_date": "2026-05-01",
    "end_date": "2026-06-30"
  },
  "rule": {
    "score_type": "threshold",
    "threshold_100": 304,
    "threshold_60": 243
  },
  "aggregation": {
    "source_table": "feishu_workitem_gongshi",
    "method": "sum(actual_work_hours)",
    "matched_rows": 42
  },
  "sample_refs": [101, 102, 103]
}
```

建议只保存：

- 赛季范围
- 使用的规则快照
- 聚合方法
- 命中的记录数
- 少量样例 ID

不要保存：

- 大量完整原始明细
- 可重复从事实表查出的冗余数据

---

## 8. 推荐落地顺序

为了降低改造风险，建议按下面顺序推进。

1. 新增 `season_indicator_scores`
2. 新增 `season_dimension_scores`
3. 让自动聚合先写 `season_indicator_scores`
4. 让维度汇总逻辑写 `season_dimension_scores`
5. 最后把总分计算入口切到新结果层
6. 前端详情页改读新结果层

这样可以保证：

- 原始同步逻辑不受影响
- 总分逻辑可逐步替换
- 页面展示可以先从明细页切，再切排名页

---

## 9. 最终结论

为了实现“能看到每个维度得分和最终总分”的目标，推荐采用以下结构：

- 原始事实表：继续保留
- 规则配置表：继续使用 `scoring_dimensions`
- 指标结果表：新增 `season_indicator_scores`
- 维度结果表：新增 `season_dimension_scores`
- 最终汇总表：继续使用 `season_members`

这个方案的核心价值是：

- 支持维度分展示
- 支持指标级追溯
- 支持重算
- 支持后续规则演进
- 保持总分口径清晰
