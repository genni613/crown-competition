import { getDb, withTransaction } from '../db'
import { calculateSeasonScores } from './scoring.service'
import { queryPdSummaryByDateRange } from './pdAggregation.service'
import { calculateThresholdScore } from '../utils/scoringFormulas'
import type { JobRole, ScoringDimension, Season } from '../types/entities'

type MetricMap = Record<string, number>

interface SyncMember {
  season_member_id: number
  user_key: string
  job_role: JobRole | null
  sub_role: 'client' | 'frontend' | 'backend' | null
  email: string | null
  name: string
}

interface SyncWarning {
  userId?: string
  metric?: string
  reason: string
}

interface MemberPreview {
  member: SyncMember
  projectUserKey: string
  metrics: MetricMap
  totalRdPd?: number
  warnings: SyncWarning[]
  rawCounts: Record<string, number>
}

interface SyncResult {
  seasonId: number
  memberCount: number
  syncedCount: number
  skippedCount: number
  writtenScoreCount: number
  warnings: SyncWarning[]
}

const metricNamesByRole: Record<JobRole, string[]> = {
  product: [
    '产品需求使用研发测试PD数',
    '核心项目准时上线率',
    '线上问题系统解决数',
  ],
  design: [
    '设计需求完成数（加权）',
    '设计交付准时率',
    '设计返工消耗PD',
    '线上问题系统解决数',
  ],
  tech: [
    '消耗需求评估标准工时',
    '过程问题(P0/P1/P2)',
    '线上故障(P1/P2)',
    '线上问题(仅研发代码)',
    '提测不通过',
    '线上问题系统解决数',
  ],
}

function toTime(value: string | number | Date): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) throw new Error(`无法解析日期：${value}`)
  return parsed
}

function computeDeliveryQuality(p0: number, p1: number, p2: number): number {
  const total = p0 + p1 + p2
  if (total === 0) return 100
  const p0Ratio = p0 / total
  if (p0Ratio > 0.01) return 0
  if (p0 === 0 && p1 === 0 && p2 < 10) return 100
  if (p0 === 0 && p1 === 0 && p2 < 25) return 80
  return 60
}

const GONGSHI_TIME = 'COALESCE(g.work_date, g.work_start_time, g.create_time, g.update_time)'

async function queryLocalPdCount(userKey: string, startMs: number, endMs: number): Promise<number> {
  const rows = await getDb().query<{ total_pd: number }>(`
    SELECT ROUND(SUM(COALESCE(pd_count, 0)), 2) AS total_pd
    FROM feishu_workitem_gongshi g
    WHERE g.work_hour_reporter = ?
      AND ${GONGSHI_TIME} IS NOT NULL
      AND ${GONGSHI_TIME} >= ?
      AND ${GONGSHI_TIME} < ?
  `, [userKey, new Date(startMs), new Date(endMs)])
  return Number(rows[0]?.total_pd || 0)
}

async function queryLocalIssueCount(userKey: string, startMs: number, endMs: number, extraWhere: string = ''): Promise<number> {
  const rows = await getDb().query<{ count: number }>(`
    SELECT COUNT(*) as count FROM feishu_workitem_issue
    WHERE owner = ?
      AND COALESCE(archiving_date, start_time) IS NOT NULL
      AND COALESCE(archiving_date, start_time) >= ?
      AND COALESCE(archiving_date, start_time) < ?
      ${extraWhere}
  `, [userKey, new Date(startMs), new Date(endMs)])
  return Number(rows[0]?.count || 0)
}

async function queryLocalIssuePriorityCounts(userKey: string, startMs: number, endMs: number): Promise<Record<string, number>> {
  const rows = await getDb().query<{ priority: string | null; count: number }>(`
    SELECT UPPER(TRIM(priority)) AS priority, COUNT(*) AS count
    FROM feishu_workitem_issue
    WHERE owner = ?
      AND COALESCE(archiving_date, start_time) IS NOT NULL
      AND COALESCE(archiving_date, start_time) >= ?
      AND COALESCE(archiving_date, start_time) < ?
      AND UPPER(TRIM(priority)) IN ('P0', 'P1', 'P2')
    GROUP BY UPPER(TRIM(priority))
  `, [userKey, new Date(startMs), new Date(endMs)])
  return Object.fromEntries(
    rows.map(row => [String(row.priority || '').toUpperCase(), Number(row.count)])
  )
}

async function aggregateProduct(userKey: string, startMs: number, endMs: number, startDate: string, endDate: string): Promise<{ metrics: MetricMap; totalRdPd: number }> {
  const db = getDb()

  // 赛季内所有研发/测试成员的总PD（客户端 ÷3）
  const totalRdRows = await db.query<{ total_rd_pd: number }>(`
    SELECT ROUND(SUM(
      CASE WHEN fu.sub_role = 'client'
           THEN g.pd_count / 3
           ELSE g.pd_count END
    ), 2) AS total_rd_pd
    FROM feishu_workitem_gongshi g
    JOIN feishu_user fu ON fu.user_key = g.work_hour_reporter
    WHERE fu.job_role IN ('tech', 'test')
      AND ${GONGSHI_TIME} IS NOT NULL
      AND ${GONGSHI_TIME} >= ?
      AND ${GONGSHI_TIME} < ?
  `, [new Date(startMs), new Date(endMs)])
  const totalRdPd = Number(totalRdRows[0]?.total_rd_pd || 0)

  // 该产品经理负责的需求所消耗的研发/测试PD（客户端 ÷3）
  const rdPdRows = await db.query<{ total_rd_pd: number }>(`
    SELECT ROUND(SUM(
      CASE WHEN fu.sub_role = 'client'
           THEN g.pd_count / 3
           ELSE g.pd_count END
    ), 2) AS total_rd_pd
    FROM feishu_workitem_gongshi g
    JOIN feishu_workitem_story s ON s.work_item_id = g.related_requirement
    JOIN feishu_user fu ON fu.user_key = g.work_hour_reporter
    WHERE s.product_owner = ?
      AND fu.job_role IN ('tech', 'test')
      AND ${GONGSHI_TIME} IS NOT NULL
      AND ${GONGSHI_TIME} >= ?
      AND ${GONGSHI_TIME} < ?
  `, [userKey, new Date(startMs), new Date(endMs)])
  const rdPd = Number(rdPdRows[0]?.total_rd_pd || 0)
  const resolvedIssueCount = await queryLocalIssueCount(userKey, startMs, endMs)

  return {
    metrics: {
      '产品需求使用研发测试PD数': rdPd,
      '核心项目准时上线率': 100,
      '线上问题系统解决数': resolvedIssueCount,
    },
    totalRdPd,
  }
}

async function aggregateDesign(userKey: string, startMs: number, endMs: number): Promise<MetricMap> {
  const db = getDb()

  // 设计需求完成数：从工时表统计关联的不同需求数
  const storyRows = await db.query<{ count: number }>(`
    SELECT COUNT(DISTINCT related_requirement) as count
    FROM feishu_workitem_gongshi g
    WHERE g.work_hour_reporter = ?
      AND ${GONGSHI_TIME} IS NOT NULL
      AND ${GONGSHI_TIME} >= ?
      AND ${GONGSHI_TIME} < ?
      AND g.related_requirement IS NOT NULL AND g.related_requirement != ''
  `, [userKey, new Date(startMs), new Date(endMs)])

  const resolvedIssueCount = await queryLocalIssueCount(userKey, startMs, endMs)

  return {
    '设计需求完成数（加权）': Number(storyRows[0]?.count || 0),
    '设计交付准时率': 100,
    '设计返工消耗PD': 0,
    '线上问题系统解决数': resolvedIssueCount,
  }
}

async function aggregateTech(userKey: string, subRole: string | null, startMs: number, endMs: number, startDate: string, endDate: string): Promise<MetricMap> {
  const pdResult = await queryPdSummaryByDateRange(startDate, endDate, userKey)
  let totalHours = pdResult.people.find(p => p.project_user_key === userKey)?.total_hours ?? 0
  // 客户端 3PD 折算 1PD
  if (subRole === 'client') {
    totalHours = Math.round((totalHours / 3) * 100) / 100
  }
  const issuePriorityCounts = await queryLocalIssuePriorityCounts(userKey, startMs, endMs)

  // 线上故障(P1/P2)：P1/P2 且来源含"故障"
  const faultCount = await queryLocalIssueCount(userKey, startMs, endMs,
    `AND UPPER(TRIM(priority)) IN ('P1', 'P2') AND \`source\` LIKE '%故障%'`)

  // 线上问题(仅研发代码)：问题原因含"研发"/"代码"
  const codeCount = await queryLocalIssueCount(userKey, startMs, endMs,
    `AND (root_cause LIKE '%研发%' OR root_cause LIKE '%代码%' OR root_cause LIKE '%code%')`)

  // 线上问题系统解决数
  const resolvedCount = await queryLocalIssueCount(userKey, startMs, endMs)

  return {
    '消耗需求评估标准工时': totalHours,
    '过程问题(P0/P1/P2)': computeDeliveryQuality(
      issuePriorityCounts['P0'] || 0,
      issuePriorityCounts['P1'] || 0,
      issuePriorityCounts['P2'] || 0,
    ),
    '线上故障(P1/P2)': faultCount,
    '线上问题(仅研发代码)': codeCount,
    '提测不通过': 0,
    '线上问题系统解决数': resolvedCount,
  }
}

async function aggregateMemberMetrics(member: SyncMember, season: Season): Promise<MemberPreview> {
  if (!member.job_role) throw new Error('成员缺少 job_role')
  const startMs = toTime(season.start_date)
  const endMs = toTime(season.end_date) + 86_399_999
  const userKey = member.user_key

  const sdDate = new Date(toTime(season.start_date))
  const edDate = new Date(toTime(season.end_date))
  const pad = (n: number) => String(n).padStart(2, '0')
  const sd = `${sdDate.getFullYear()}-${pad(sdDate.getMonth() + 1)}-${pad(sdDate.getDate())}`
  const ed = `${edDate.getFullYear()}-${pad(edDate.getMonth() + 1)}-${pad(edDate.getDate())}`

  const productResult = member.job_role === 'product'
    ? await aggregateProduct(userKey, startMs, endMs, sd, ed)
    : null

  const metrics = productResult
    ? productResult.metrics
    : member.job_role === 'design'
      ? await aggregateDesign(userKey, startMs, endMs)
      : await aggregateTech(userKey, member.sub_role, startMs, endMs, sd, ed)

  return {
    member,
    projectUserKey: userKey,
    metrics,
    totalRdPd: productResult?.totalRdPd,
    warnings: [],
    rawCounts: { local: 1 },
  }
}

async function writeIndicatorScores(member: SyncMember, metrics: MetricMap, totalRdPd?: number): Promise<number> {
  if (!member.job_role) return 0
  const db = getDb()
  const dimensions = await db.query<ScoringDimension>(`
    SELECT * FROM scoring_dimensions
    WHERE job_role = ? AND data_source IN ('feishu', 'evidence')
  `, [member.job_role])

  const dimensionByName = new Map(dimensions.map(dim => [dim.indicator_name, dim]))

  let written = 0
  await withTransaction(async tx => {
    for (const [metricName, rawValue] of Object.entries(metrics)) {
      const dimension = dimensionByName.get(metricName)
      if (!dimension) continue

      // 产品需求使用研发测试PD数：动态阈值（基于总研发PD的1/3和1/4）
      let dynamicThreshold: { threshold_score: number; final_score: number } | undefined
      if (metricName === '产品需求使用研发测试PD数' && totalRdPd != null && totalRdPd > 0) {
        const t100 = totalRdPd / 3
        const t60 = totalRdPd / 4
        const ts = calculateThresholdScore(rawValue, t100, t60)
        dynamicThreshold = {
          threshold_score: ts,
          final_score: ts * dimension.indicator_weight,
        }
      }

      if (dimension.data_source === 'evidence') {
        // 仅在用户没有已审批的举证记录时，写入飞书数据作为默认值
        const existingApproved = await tx.queryOne<{ id: number }>(
          `SELECT id FROM indicator_scores WHERE season_member_id = ? AND dimension_id = ? AND approved = 1`,
          [member.season_member_id, dimension.id]
        )
        if (existingApproved) continue

        await tx.execute(`
          INSERT INTO indicator_scores (
            season_member_id, dimension_id, raw_value, threshold_score, final_score, source, approved, notes
          ) VALUES (?, ?, ?, ?, ?, 'evidence', 1, ?)
          ON DUPLICATE KEY UPDATE
            raw_value = VALUES(raw_value),
            threshold_score = COALESCE(VALUES(threshold_score), threshold_score),
            final_score = COALESCE(VALUES(final_score), final_score),
            notes = VALUES(notes)
        `, [member.season_member_id, dimension.id, rawValue,
            dynamicThreshold?.threshold_score ?? null,
            dynamicThreshold?.final_score ?? null,
            totalRdPd != null ? `总研发测试PD: ${totalRdPd}, 阈值100: ≥${(totalRdPd / 3).toFixed(1)}, 阈值60: ≥${(totalRdPd / 4).toFixed(1)}` : '飞书同步默认值，用户举证后覆盖'])
        written += 1
      } else {
        await tx.execute(`
          INSERT INTO indicator_scores (
            season_member_id, dimension_id, raw_value, threshold_score, final_score, source, approved, notes
          ) VALUES (?, ?, ?, ?, ?, 'feishu', 1, ?)
          ON DUPLICATE KEY UPDATE
            raw_value = VALUES(raw_value),
            threshold_score = COALESCE(VALUES(threshold_score), threshold_score),
            final_score = COALESCE(VALUES(final_score), final_score),
            source = 'feishu',
            approved = 1,
            notes = VALUES(notes)
        `, [member.season_member_id, dimension.id, rawValue,
            dynamicThreshold?.threshold_score ?? null,
            dynamicThreshold?.final_score ?? null,
            totalRdPd != null ? `总研发测试PD: ${totalRdPd}, 阈值100: ≥${(totalRdPd / 3).toFixed(1)}, 阈值60: ≥${(totalRdPd / 4).toFixed(1)}` : 'synced from local db'])
        written += 1
      }
    }
  })
  return written
}

async function getSeason(seasonId: number): Promise<Season> {
  const season = await getDb().queryOne<Season>('SELECT * FROM seasons WHERE id = ?', [seasonId])
  if (!season) throw new Error('赛季不存在')
  return season
}

async function getMembers(seasonId: number, userId?: string): Promise<SyncMember[]> {
  const params: unknown[] = [seasonId]
  let where = 'WHERE sm.season_id = ?'
  if (userId) {
    where += ' AND sm.user_key = ?'
    params.push(userId)
  }

  return getDb().query<SyncMember>(`
    SELECT sm.id AS season_member_id, sm.user_key, sm.job_role, sm.sub_role, fu.email, fu.name
    FROM season_members sm
    JOIN feishu_user fu ON fu.user_key = sm.user_key
    ${where}
  `, params)
}

export async function previewMemberFeishuData(seasonId: number, userId: string): Promise<MemberPreview> {
  const season = await getSeason(seasonId)
  const member = (await getMembers(seasonId, userId))[0]
  if (!member) throw new Error('赛季成员不存在')
  return aggregateMemberMetrics(member, season)
}

export async function syncMemberFeishuData(seasonId: number, userId: string): Promise<SyncResult> {
  console.log('[sync-member] start', { seasonId, userId })
  const season = await getSeason(seasonId)
  const member = (await getMembers(seasonId, userId))[0]
  if (!member) throw new Error('赛季成员不存在')

  const preview = await aggregateMemberMetrics(member, season)
  console.log('[sync-member] metrics', { userId, metrics: preview.metrics })
  const writtenScoreCount = await writeIndicatorScores(member, preview.metrics, preview.totalRdPd)
  console.log('[sync-member] writtenScoreCount', writtenScoreCount)
  await calculateSeasonScores(seasonId)
  console.log('[sync-member] done')

  return {
    seasonId,
    memberCount: 1,
    syncedCount: 1,
    skippedCount: 0,
    writtenScoreCount,
    warnings: preview.warnings,
  }
}

export async function syncSeasonFeishuData(seasonId: number): Promise<SyncResult> {
  console.log('[sync-season] start', { seasonId })
  const season = await getSeason(seasonId)
  const members = await getMembers(seasonId)
  console.log('[sync-season] members', { count: members.length, users: members.map(m => m.user_key) })
  const result: SyncResult = {
    seasonId,
    memberCount: members.length,
    syncedCount: 0,
    skippedCount: 0,
    writtenScoreCount: 0,
    warnings: [],
  }

  for (const member of members) {
    try {
      const preview = await aggregateMemberMetrics(member, season)
      console.log('[sync-season] member metrics', { userKey: member.user_key, jobRole: member.job_role, metrics: preview.metrics })
      result.warnings.push(...preview.warnings)
      result.writtenScoreCount += await writeIndicatorScores(member, preview.metrics, preview.totalRdPd)
      result.syncedCount += 1
    } catch (error) {
      console.error('[sync-season] member error', { userKey: member.user_key, error: error instanceof Error ? error.message : error })
      result.skippedCount += 1
      result.warnings.push({
        userId: member.user_key,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (result.syncedCount > 0) await calculateSeasonScores(seasonId)
  console.log('[sync-season] done', { syncedCount: result.syncedCount, skippedCount: result.skippedCount, writtenScoreCount: result.writtenScoreCount })
  return result
}

export function expectedFeishuMetricNames(jobRole: JobRole): string[] {
  return metricNamesByRole[jobRole]
}
