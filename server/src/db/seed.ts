import { getDb } from './index'

export async function seed(): Promise<void> {
  const db = getDb()

  // 检查是否已有种子数据
  const count = (await db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM org_score_types'))?.cnt ?? 0
  if (count > 0) return

  const insertOrg = `
    INSERT INTO org_score_types (name, display_name, points_per_unit, max_per_season, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `

  const orgTypes = [
    ['mentor', '带教伙伴（>50天，每人在职）', 2, null, 1],
    ['certified_trainer', '集团认证讲师（年度积分≥4000）', 5, 5, 2],
    ['sharing_group', '分享（组内）', 0.5, 3, 3],
    ['sharing_dept', '分享（会员数字化）', 1, 3, 4],
    ['sharing_group_hq', '分享（集团）', 3, 3, 5],
    ['duty_no_response', '值班未响应', -1, null, 6],
    ['gardener', '花匠工作（>50天）', 3, 3, 7],
    ['referral_onboard', '内推（入职）', 1, null, 8],
    ['referral_confirm', '内推（转正）', 1, null, 9],
    ['value_a', '价值观A（持续两个赛季）', 3, 3, 10],
    ['infra_core', '复杂基建项目（核心）', 10, null, 11],
    ['infra_participate', '复杂基建项目（参与）', 5, null, 12],
    ['special_contribution', '特别贡献分（组织评定）', 0, 10, 13],
  ] as const

  for (const t of orgTypes) {
    await db.execute(insertOrg, [...t])
  }

  // 评分维度配置
  const insertDim = `
    INSERT INTO scoring_dimensions (
      job_role, dimension_name, dimension_weight, indicator_name, indicator_weight,
      data_source, score_type, threshold_100, threshold_60,
      deduction_per_unit, deduction_cap, deduction_divisor, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `

  const dimensions = [
    // ===== 产品岗 =====
    // 交付效率 (30%) - 两个指标 2:1
    ['product', '交付效率', 0.30, '产品需求使用研发测试PD数', 0.67, 'feishu', 'threshold', null, null, null, null, null, 1],
    ['product', '交付效率', 0.30, '需求评审通过准时率', 0.33, 'feishu', 'threshold', 95, 80, null, null, null, 2],
    // 需求价值 (30%) - 两个指标 1:1
    ['product', '需求价值', 0.30, '核心项目业务价值完成度', 0.50, 'admin', 'threshold', 100, 80, null, null, null, 3],
    ['product', '需求价值', 0.30, '产品功能用户体验度量分', 0.50, 'admin', 'threshold', 4.8, 4.5, null, null, null, 4],
    // 创新突破 (15%) - 单指标
    ['product', '创新突破', 0.15, 'AI/数字化工具解决真问题数', 1.00, 'evidence', 'threshold', 5, 1, null, null, null, 5],
    // 交付质量 (10%) - 单指标 + 扣分
    ['product', '交付质量', 0.10, '核心项目准时上线率', 1.00, 'feishu', 'threshold', 100, 80, null, null, null, 6],
    ['product', '交付质量', 0.00, '需求变更消耗PD', 0.00, 'feishu', 'deduction', null, null, 1, 15, 3, 7],
    // 协作贡献 (15%) - 两个指标 1:2
    ['product', '协作贡献', 0.15, '微社区被点赞数', 0.33, 'admin', 'threshold', 10, 5, null, null, null, 8],
    ['product', '协作贡献', 0.15, '线上问题系统解决数', 0.67, 'feishu', 'threshold', 5, 1, null, null, null, 9],

    // ===== 设计岗 =====
    // 交付效率 (25%) - 两个指标 3:2
    ['design', '交付效率', 0.25, '设计需求完成数（加权）', 0.60, 'feishu', 'threshold', 30, 20, null, null, null, 10],
    ['design', '交付效率', 0.25, '设计交付准时率', 0.40, 'feishu', 'threshold', 95, 80, null, null, null, 11],
    // 需求价值 (20%) - 两个指标 1:1
    ['design', '需求价值', 0.20, '核心项目业务价值完成度', 0.50, 'admin', 'threshold', 100, 80, null, null, null, 12],
    ['design', '需求价值', 0.20, '用户体验度量分', 0.50, 'admin', 'threshold', 4.8, 4.5, null, null, null, 13],
    // 创新突破 (15%) - 单指标
    ['design', '创新突破', 0.15, '设计创新成果数', 1.00, 'evidence', 'threshold', 5, 1, null, null, null, 14],
    // 交付质量 (25%) - 三个指标 1:2:2 + 扣分
    ['design', '交付质量', 0.25, '设计规范遵循率', 0.20, 'admin', 'threshold', 95, 85, null, null, null, 15],
    ['design', '交付质量', 0.25, '设计系统贡献', 0.40, 'admin', 'threshold', 8, 4, null, null, null, 16],
    ['design', '交付质量', 0.25, '设计还原度', 0.40, 'admin', 'threshold', 95, 85, null, null, null, 17],
    ['design', '交付质量', 0.00, '设计返工消耗PD', 0.00, 'feishu', 'deduction', null, null, 1, 15, 3, 18],
    // 协作贡献 (15%) - 两个指标 1:2
    ['design', '协作贡献', 0.15, '微社区被点赞数', 0.33, 'admin', 'threshold', 10, 5, null, null, null, 19],
    ['design', '协作贡献', 0.15, '线上问题系统解决数', 0.67, 'feishu', 'threshold', 5, 1, null, null, null, 20],

    // ===== 研发岗 =====
    // 交付效率 (40%) - 单指标
    ['tech', '交付效率', 0.40, '消耗需求评估标准工时', 1.00, 'feishu', 'threshold', 304, 243, null, null, null, 21],
    // 创新突破 (15%) - 单指标
    ['tech', '创新突破', 0.15, 'AI/数字化工具解决真问题数', 1.00, 'evidence', 'threshold', 5, 1, null, null, null, 22],
    // 交付质量 (30%) - 单指标 + 3个扣分
    ['tech', '交付质量', 0.30, '过程问题(P0/P1/P2)', 1.00, 'feishu', 'threshold', null, null, null, null, null, 23],
    ['tech', '交付质量', 0.00, '线上故障(P1/P2)', 0.00, 'feishu', 'deduction', null, null, 100, 100, 1, 24],
    ['tech', '交付质量', 0.00, '线上问题(仅研发代码)', 0.00, 'feishu', 'deduction', null, null, 1, 100, 1, 25],
    ['tech', '交付质量', 0.00, '提测不通过', 0.00, 'feishu', 'deduction', null, null, 10, 100, 1, 26],
    // 协作贡献 (15%) - 两个指标 1:2
    ['tech', '协作贡献', 0.15, '微社区被点赞数', 0.33, 'admin', 'threshold', 10, 5, null, null, null, 27],
    ['tech', '协作贡献', 0.15, '线上问题系统解决数', 0.67, 'feishu', 'threshold', 5, 1, null, null, null, 28],
  ] as const

  for (const d of dimensions) {
    await db.execute(insertDim, [...d])
  }

  console.log('Seed data inserted successfully')
}
