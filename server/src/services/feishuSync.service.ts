import fieldsConfig from '../config/feishuProjectFields.json'
import { config } from '../config'
import { getDb } from '../db'
import { feishuProject } from './feishuProject.service'
import { calculateSeasonScores } from './scoring.service'
import type { JobRole, ScoringDimension, Season } from '../types/entities'

type MetricMap = Record<string, number>

interface SyncMember {
  season_member_id: number
  user_id: string
  job_role: JobRole | null
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

const storyFields = fieldsConfig.story
const issueFields = fieldsConfig.issue
const defectFields = fieldsConfig.defect

const metricNamesByRole: Record<JobRole, string[]> = {
  product: [
    '产品需求使用研发测试PD数',
    '需求评审通过准时率',
    '核心项目准时上线率',
    '需求变更消耗PD',
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

function inRange(value: unknown, startMs: number, endMs: number): boolean {
  const time = readDate(value)
  return time != null && time >= startMs && time <= endMs
}

function readDate(value: unknown): number | null {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 1_000_000_000) return numeric
    const parsed = new Date(raw).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function unwrapValue(value: unknown): any {
  if (value && typeof value === 'object') {
    const item = value as Record<string, any>
    if ('value' in item) return item.value
    if ('field_value' in item) return item.field_value
    if ('number_value' in item) return item.number_value
    if ('date_value' in item) return item.date_value
    if ('text' in item) return item.text
    if ('name' in item) return item.name
    if ('label' in item) return item.label
  }
  return value
}

function readNumber(value: unknown): number {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return raw
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function readText(value: unknown): string {
  const raw = unwrapValue(value)
  if (raw == null) return ''
  if (Array.isArray(raw)) return raw.map(readText).filter(Boolean).join(',')
  if (typeof raw === 'object') return JSON.stringify(raw)
  return String(raw)
}

function readBool(value: unknown): boolean {
  const raw = unwrapValue(value)
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') return ['true', '是', 'yes', '1', '核心'].includes(raw.toLowerCase())
  return Boolean(raw)
}

function fieldValue(item: any, key?: string): unknown {
  if (!key) return undefined
  if (item?.[key] !== undefined) return item[key]
  if (item?.fields?.[key] !== undefined) return item.fields[key]
  if (item?.field_value_map?.[key] !== undefined) return item.field_value_map[key]

  const fields = item?.fields || item?.field_values || item?.fieldValueList || item?.field_value_list
  if (Array.isArray(fields)) {
    const found = fields.find((field: any) =>
      field.field_key === key ||
      field.field_alias === key ||
      field.key === key ||
      field.alias === key
    )
    if (found) return found.value ?? found.field_value ?? found
  }
  return undefined
}

function isMissingField(item: any, key?: string): boolean {
  if (!key) return true
  return fieldValue(item, key) === undefined
}

function hasUser(value: unknown, userKey: string): boolean {
  const raw = unwrapValue(value)
  if (raw == null) return false
  if (typeof raw === 'string') return raw === userKey
  if (Array.isArray(raw)) return raw.some(item => hasUser(item, userKey))
  if (typeof raw === 'object') {
    const item = raw as Record<string, any>
    return [item.user_key, item.userKey, item.key, item.id, item.open_id, item.out_id].some(id => id === userKey)
  }
  return false
}

function dataItems(json: any): any[] {
  const data = json?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.work_items)) return data.work_items
  if (Array.isArray(data?.work_item_list)) return data.work_item_list
  if (Array.isArray(json?.items)) return json.items
  return []
}

function hasMore(json: any, pageNum: number, pageSize: number, itemCount: number): boolean {
  const pagination = json?.pagination || json?.data?.pagination
  if (typeof pagination?.has_more === 'boolean') return pagination.has_more
  if (typeof json?.data?.has_more === 'boolean') return json.data.has_more
  const total = Number(pagination?.total || json?.data?.total || 0)
  return total > pageNum * pageSize && itemCount > 0
}

function searchGroup(fieldKey: string, userKey: string, dateFieldKey: string, startMs: number, endMs: number) {
  return {
    conjunction: 'AND',
    search_params: [
      { param_key: fieldKey, operator: 'IN', value: [userKey] },
      { param_key: dateFieldKey, operator: 'BETWEEN', value: [startMs, endMs] },
    ],
  }
}

async function searchAll(workItemTypeKey: string, body: Record<string, any>): Promise<any[]> {
  const pageSize = config.feishuProject.pageSize
  const all: any[] = []
  let pageNum = 1

  while (true) {
    const json = await feishuProject.searchWorkItems(workItemTypeKey, {
      ...body,
      page_num: pageNum,
      page_size: pageSize,
      expand: {
        need_workflow: true,
        relation_fields_detail: true,
        need_multi_text: true,
        need_user_detail: true,
        need_sub_task_parent: true,
        ...(body.expand || {}),
      },
    })
    const items = dataItems(json)
    all.push(...items)
    if (!hasMore(json, pageNum, pageSize, items.length)) break
    pageNum += 1
  }

  return all
}

async function resolveProjectUserKey(member: SyncMember): Promise<string> {
  if (!member.email) throw new Error('用户缺少 email，无法映射飞书项目 user_key')
  const json = await feishuProject.queryUserByEmail(member.email)
  const users = json.data?.users || json.data?.user_list || json.data || []
  const first = Array.isArray(users) ? users[0] : users
  const userKey = first?.user_key || first?.userKey || first?.key
  if (!userKey) throw new Error(`未找到飞书项目用户映射：${member.email}`)
  return userKey
}

function aggregateProduct(stories: any[], issues: any[], userKey: string, startMs: number, endMs: number): MetricMap {
  const ownedStories = stories.filter(item => hasUser(fieldValue(item, storyFields.productOwner), userKey))
  const reviewStories = ownedStories.filter(item => fieldValue(item, storyFields.reviewPlanAt) != null)
  const onTimeReviews = reviewStories.filter(item => {
    const plan = readDate(fieldValue(item, storyFields.reviewPlanAt))
    const done = readDate(fieldValue(item, storyFields.reviewDoneAt))
    return plan != null && done != null && done <= plan
  })
  const coreStories = ownedStories.filter(item => readBool(fieldValue(item, storyFields.isCore)))
  const onTimeLaunches = coreStories.filter(item => {
    const plan = readDate(fieldValue(item, storyFields.launchPlanAt))
    const done = readDate(fieldValue(item, storyFields.launchDoneAt))
    return plan != null && done != null && done <= plan
  })
  const resolvedIssues = issues.filter(item =>
    hasUser(fieldValue(item, issueFields.resolver), userKey) &&
    inRange(fieldValue(item, issueFields.closedAt), startMs, endMs)
  )

  return {
    '产品需求使用研发测试PD数': ownedStories.reduce((sum, item) =>
      sum + readNumber(fieldValue(item, storyFields.pd)) + readNumber(fieldValue(item, storyFields.clientPd)) / 3, 0),
    '需求评审通过准时率': reviewStories.length ? onTimeReviews.length / reviewStories.length * 100 : 0,
    '核心项目准时上线率': coreStories.length ? onTimeLaunches.length / coreStories.length * 100 : 0,
    '需求变更消耗PD': ownedStories.reduce((sum, item) => sum + readNumber(fieldValue(item, storyFields.changePd)), 0),
    '线上问题系统解决数': resolvedIssues.length,
  }
}

function complexityWeight(value: unknown): number {
  const text = readText(value).toLowerCase()
  if (text.includes('复杂') || text.includes('high') || text.includes('3')) return 3
  if (text.includes('中') || text.includes('medium') || text.includes('2')) return 2
  if (!text) return 1
  return 1
}

function aggregateDesign(stories: any[], issues: any[], userKey: string, startMs: number, endMs: number): MetricMap {
  const ownedStories = stories.filter(item => hasUser(fieldValue(item, storyFields.designer), userKey))
  const designPlanStories = ownedStories.filter(item => fieldValue(item, storyFields.designPlanAt) != null)
  const onTimeDesigns = designPlanStories.filter(item => {
    const plan = readDate(fieldValue(item, storyFields.designPlanAt))
    const done = readDate(fieldValue(item, storyFields.designDoneAt))
    return plan != null && done != null && done <= plan
  })
  const resolvedIssues = issues.filter(item =>
    hasUser(fieldValue(item, issueFields.resolver), userKey) &&
    inRange(fieldValue(item, issueFields.closedAt), startMs, endMs)
  )

  return {
    '设计需求完成数（加权）': ownedStories.reduce((sum, item) =>
      sum + complexityWeight(fieldValue(item, storyFields.designComplexity)), 0),
    '设计交付准时率': designPlanStories.length ? onTimeDesigns.length / designPlanStories.length * 100 : 0,
    '设计返工消耗PD': ownedStories.reduce((sum, item) => sum + readNumber(fieldValue(item, storyFields.designReworkPd)), 0),
    '线上问题系统解决数': resolvedIssues.length,
  }
}

function severity(item: any): string {
  return readText(fieldValue(item, issueFields.severity)).toUpperCase()
}

function aggregateTech(stories: any[], issues: any[], defects: any[], userKey: string, startMs: number, endMs: number): MetricMap {
  const ownedStories = stories.filter(item => hasUser(fieldValue(item, storyFields.developer), userKey))
  const ownedIssues = issues.filter(item =>
    (hasUser(fieldValue(item, issueFields.owner), userKey) || hasUser(fieldValue(item, issueFields.resolver), userKey)) &&
    inRange(fieldValue(item, issueFields.closedAt), startMs, endMs)
  )
  const resolvedIssues = issues.filter(item =>
    hasUser(fieldValue(item, issueFields.resolver), userKey) &&
    inRange(fieldValue(item, issueFields.closedAt), startMs, endMs)
  )
  const processIssues = ownedIssues.filter(item => ['P0', 'P1', 'P2'].includes(severity(item)))
  const onlineFaults = ownedIssues.filter(item => {
    const source = readText(fieldValue(item, issueFields.source)).toLowerCase()
    return ['P1', 'P2'].includes(severity(item)) && (source.includes('故障') || source.includes('fault'))
  })
  const codeIssues = ownedIssues.filter(item => {
    const cause = readText(fieldValue(item, issueFields.rootCause)).toLowerCase()
    return cause.includes('研发') || cause.includes('代码') || cause.includes('code')
  })
  const failedTests = defects.filter(item =>
    hasUser(fieldValue(item, defectFields.owner), userKey) &&
    inRange(fieldValue(item, defectFields.failedAt), startMs, endMs) &&
    /不通过|fail|failed/i.test(readText(fieldValue(item, defectFields.testResult)))
  )

  return {
    '消耗需求评估标准工时': ownedStories.reduce((sum, item) => sum + readNumber(fieldValue(item, storyFields.standardHours)), 0),
    '过程问题(P0/P1/P2)': processIssues.length,
    '线上故障(P1/P2)': onlineFaults.length,
    '线上问题(仅研发代码)': codeIssues.length,
    '提测不通过': failedTests.length,
    '线上问题系统解决数': resolvedIssues.length,
  }
}

function fieldWarnings(member: SyncMember, sample: any | undefined): SyncWarning[] {
  if (!sample || !member.job_role) return []
  const warnings: SyncWarning[] = []
  const fieldsToCheck = member.job_role === 'product'
    ? [storyFields.productOwner, storyFields.pd, storyFields.reviewPlanAt, storyFields.launchPlanAt]
    : member.job_role === 'design'
      ? [storyFields.designer, storyFields.designComplexity, storyFields.designPlanAt]
      : [storyFields.developer, storyFields.standardHours]

  for (const key of fieldsToCheck) {
    if (isMissingField(sample, key)) warnings.push({ userId: member.user_id, reason: `样例工作项缺少字段 ${key}，请检查 feishuProjectFields.json` })
  }
  return warnings
}

async function aggregateMemberMetrics(member: SyncMember, season: Season): Promise<MemberPreview> {
  if (!member.job_role) throw new Error('成员缺少 job_role')
  const startMs = toTime(season.start_date)
  const endMs = toTime(`${season.end_date}T23:59:59.999`)
  const projectUserKey = await resolveProjectUserKey(member)

  const storyUserField = member.job_role === 'product'
    ? storyFields.productOwner
    : member.job_role === 'design'
      ? storyFields.designer
      : storyFields.developer

  const stories = await searchAll(config.feishuProject.storyType, {
    search_group: searchGroup(storyUserField, projectUserKey, 'created_at', startMs, endMs),
    fields: Object.values(storyFields),
  })
  const issues = await searchAll(config.feishuProject.issueType, {
    search_group: searchGroup(issueFields.resolver, projectUserKey, issueFields.closedAt, startMs, endMs),
    fields: Object.values(issueFields),
  })
  const defects = member.job_role === 'tech'
    ? await searchAll(config.feishuProject.defectType, {
      search_group: searchGroup(defectFields.owner, projectUserKey, defectFields.failedAt, startMs, endMs),
      fields: Object.values(defectFields),
    })
    : []

  const metrics = member.job_role === 'product'
    ? aggregateProduct(stories, issues, projectUserKey, startMs, endMs)
    : member.job_role === 'design'
      ? aggregateDesign(stories, issues, projectUserKey, startMs, endMs)
      : aggregateTech(stories, issues, defects, projectUserKey, startMs, endMs)

  return {
    member,
    projectUserKey,
    metrics,
    warnings: fieldWarnings(member, stories[0]),
    rawCounts: {
      stories: stories.length,
      issues: issues.length,
      defects: defects.length,
    },
  }
}

function writeIndicatorScores(member: SyncMember, metrics: MetricMap): number {
  if (!member.job_role) return 0
  const db = getDb()
  const dimensions = db.prepare(`
    SELECT * FROM scoring_dimensions
    WHERE job_role = ? AND data_source = 'feishu'
  `).all(member.job_role) as ScoringDimension[]

  const dimensionByName = new Map(dimensions.map(dim => [dim.indicator_name, dim]))
  const upsert = db.prepare(`
    INSERT INTO indicator_scores (
      season_member_id, dimension_id, raw_value, source, approved, notes
    ) VALUES (?, ?, ?, 'feishu', 1, ?)
    ON CONFLICT(season_member_id, dimension_id)
    DO UPDATE SET
      raw_value = excluded.raw_value,
      source = 'feishu',
      approved = 1,
      notes = excluded.notes
  `)

  let written = 0
  const transaction = db.transaction(() => {
    for (const [metricName, rawValue] of Object.entries(metrics)) {
      const dimension = dimensionByName.get(metricName)
      if (!dimension) continue
      upsert.run(member.season_member_id, dimension.id, rawValue, 'synced from feishu project')
      written += 1
    }
  })
  transaction()
  return written
}

function getSeason(seasonId: number): Season {
  const season = getDb().prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId) as Season | undefined
  if (!season) throw new Error('赛季不存在')
  return season
}

function getMembers(seasonId: number, userId?: string): SyncMember[] {
  const params: unknown[] = [seasonId]
  let where = 'WHERE sm.season_id = ?'
  if (userId) {
    where += ' AND sm.user_id = ?'
    params.push(userId)
  }

  return getDb().prepare(`
    SELECT sm.id AS season_member_id, sm.user_id, sm.job_role, u.email, u.name
    FROM season_members sm
    JOIN users u ON u.id = sm.user_id
    ${where}
  `).all(...params) as SyncMember[]
}

export async function previewMemberFeishuData(seasonId: number, userId: string): Promise<MemberPreview> {
  feishuProject.assertConfigured()
  const season = getSeason(seasonId)
  const member = getMembers(seasonId, userId)[0]
  if (!member) throw new Error('赛季成员不存在')
  return aggregateMemberMetrics(member, season)
}

export async function syncMemberFeishuData(seasonId: number, userId: string): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const season = getSeason(seasonId)
  const member = getMembers(seasonId, userId)[0]
  if (!member) throw new Error('赛季成员不存在')

  const warnings: SyncWarning[] = []
  const preview = await aggregateMemberMetrics(member, season)
  warnings.push(...preview.warnings)
  const writtenScoreCount = writeIndicatorScores(member, preview.metrics)
  calculateSeasonScores(seasonId)

  return {
    seasonId,
    memberCount: 1,
    syncedCount: 1,
    skippedCount: 0,
    writtenScoreCount,
    warnings,
  }
}

export async function syncSeasonFeishuData(seasonId: number): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const season = getSeason(seasonId)
  const members = getMembers(seasonId)
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
      result.warnings.push(...preview.warnings)
      result.writtenScoreCount += writeIndicatorScores(member, preview.metrics)
      result.syncedCount += 1
    } catch (error) {
      result.skippedCount += 1
      result.warnings.push({
        userId: member.user_id,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (result.syncedCount > 0) calculateSeasonScores(seasonId)
  return result
}

export function expectedFeishuMetricNames(jobRole: JobRole): string[] {
  return metricNamesByRole[jobRole]
}
