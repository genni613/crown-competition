import { getDb } from '../db'

export interface PdSummaryPerson {
  project_user_key: string
  user_id: string | null
  name: string
  email: string | null
  department_name: string | null
  total_pd: number
  total_hours: number
  item_count: number
  first_work_date: string | null
  last_work_date: string | null
  requirement_names: string[]
  project_names: string[]
}

export interface PdSummaryResult {
  startDate: string
  endDate: string
  projectUserKey: string | null
  totalPd: number
  totalHours: number
  peopleCount: number
  people: PdSummaryPerson[]
}

interface AggregatedPdRow {
  project_user_key: string
  total_pd: number
  total_hours: number
  item_count: number
  first_work_date: string | null
  last_work_date: string | null
}

export interface FeishuUserRow {
  user_key: string
  name: string
  email: string
  avatar_url: string | null
}

function normalizeDateInput(value: string | undefined, fieldName: string): string {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${fieldName} 不能为空`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} 格式必须为 YYYY-MM-DD`)
  }
  return text
}

export async function queryPdSummaryByDateRange(
  startDateInput: string | undefined,
  endDateInput: string | undefined,
  projectUserKeyInput?: string | undefined
): Promise<PdSummaryResult> {
  const startDate = normalizeDateInput(startDateInput, 'startDate')
  const endDate = normalizeDateInput(endDateInput, 'endDate')
  const projectUserKey = String(projectUserKeyInput || '').trim() || null
  const db = getDb()
  const timeExpr = 'COALESCE(g.work_date, g.work_start_time, g.create_time, g.update_time)'

  console.log('[pd-summary] start', { startDate, endDate, projectUserKey })

  const params: Array<string> = [startDate, endDate]
  let reporterWhere = ''
  if (projectUserKey) {
    reporterWhere = ' AND g.work_hour_reporter = ?'
    params.push(projectUserKey)
  }

  const aggregated = await db.query<AggregatedPdRow>(`
    SELECT
      g.work_hour_reporter AS project_user_key,
      ROUND(SUM(COALESCE(g.pd_count, 0)), 2) AS total_pd,
      ROUND(SUM(COALESCE(g.actual_work_hours, 0)), 2) AS total_hours,
      COUNT(*) AS item_count,
      DATE_FORMAT(MIN(${timeExpr}), '%Y-%m-%d %H:%i:%s') AS first_work_date,
      DATE_FORMAT(MAX(${timeExpr}), '%Y-%m-%d %H:%i:%s') AS last_work_date
    FROM feishu_workitem_gongshi g
    WHERE ${timeExpr} IS NOT NULL
      AND ${timeExpr} >= ?
      AND ${timeExpr} < DATE_ADD(?, INTERVAL 1 DAY)
      ${reporterWhere}
    GROUP BY g.work_hour_reporter
    ORDER BY total_pd DESC, total_hours DESC, item_count DESC, project_user_key ASC
  `, params)

  console.log('[pd-summary] aggregated rows', { count: aggregated.length })

  const projectUserKeys = aggregated
    .map(item => String(item.project_user_key || '').trim())
    .filter(Boolean)

  const feishuUsers = projectUserKeys.length > 0
    ? await db.query<FeishuUserRow>(
      `SELECT user_key, name, email FROM feishu_user WHERE user_key IN (${projectUserKeys.map(() => '?').join(', ')})`,
      projectUserKeys
    )
    : []

  const feishuUserMap = new Map(feishuUsers.map(item => [item.user_key, item]))

  // 查询每人关联的去重需求 ID
  const reqIdRows = projectUserKeys.length > 0
    ? await db.query<{ project_user_key: string; related_requirement: string }>(`
        SELECT g.work_hour_reporter AS project_user_key, g.related_requirement
        FROM feishu_workitem_gongshi g
        WHERE ${timeExpr} IS NOT NULL
          AND ${timeExpr} >= ?
          AND ${timeExpr} < DATE_ADD(?, INTERVAL 1 DAY)
          ${reporterWhere}
          AND g.work_hour_reporter IN (${projectUserKeys.map(() => '?').join(', ')})
          AND g.related_requirement IS NOT NULL AND g.related_requirement != ''
        GROUP BY g.work_hour_reporter, g.related_requirement
      `, [...params, ...projectUserKeys])
    : []

  // 收集所有需求 ID，批量查名称
  const allReqIds = [...new Set(reqIdRows.map(r => String(r.related_requirement).trim()).filter(Boolean))]
  const storyNameMap = new Map<string, string>()
  if (allReqIds.length > 0) {
    const stories = await db.query<{ work_item_id: string; name: string }>(
      `SELECT work_item_id, name FROM feishu_workitem_story WHERE work_item_id IN (${allReqIds.map(() => '?').join(', ')})`,
      allReqIds
    )
    for (const s of stories) {
      storyNameMap.set(String(s.work_item_id), String(s.name || s.work_item_id))
    }
  }

  // 每人的需求名称列表
  const reqNamesMap = new Map<string, string[]>()
  for (const row of reqIdRows) {
    const key = String(row.project_user_key).trim()
    if (!reqNamesMap.has(key)) reqNamesMap.set(key, [])
    const name = storyNameMap.get(String(row.related_requirement).trim()) || String(row.related_requirement)
    reqNamesMap.get(key)!.push(name)
  }

  // 查询每人关联的去重项目 ID
  const projIdRows = projectUserKeys.length > 0
    ? await db.query<{ project_user_key: string; related_project: string }>(`
        SELECT g.work_hour_reporter AS project_user_key, g.related_project
        FROM feishu_workitem_gongshi g
        WHERE ${timeExpr} IS NOT NULL
          AND ${timeExpr} >= ?
          AND ${timeExpr} < DATE_ADD(?, INTERVAL 1 DAY)
          ${reporterWhere}
          AND g.work_hour_reporter IN (${projectUserKeys.map(() => '?').join(', ')})
          AND g.related_project IS NOT NULL AND g.related_project != ''
        GROUP BY g.work_hour_reporter, g.related_project
      `, [...params, ...projectUserKeys])
    : []

  const allProjIds = [...new Set(projIdRows.map(r => String(r.related_project).trim()).filter(Boolean))]
  const projNameMap = new Map<string, string>()
  if (allProjIds.length > 0) {
    const projects = await db.query<{ work_item_id: string; name: string }>(
      `SELECT work_item_id, name FROM feishu_workitem_project WHERE work_item_id IN (${allProjIds.map(() => '?').join(', ')})`,
      allProjIds
    )
    for (const p of projects) {
      projNameMap.set(String(p.work_item_id), String(p.name || p.work_item_id))
    }
  }

  const projNamesMap = new Map<string, string[]>()
  for (const row of projIdRows) {
    const key = String(row.project_user_key).trim()
    if (!projNamesMap.has(key)) projNamesMap.set(key, [])
    const name = projNameMap.get(String(row.related_project).trim()) || String(row.related_project)
    projNamesMap.get(key)!.push(name)
  }

  const people: PdSummaryPerson[] = aggregated.map(item => {
    const projectUserKey = String(item.project_user_key || '').trim()
    const feishuUser = feishuUserMap.get(projectUserKey)
    const email = String(feishuUser?.email || '').trim() || null

    return {
      project_user_key: projectUserKey,
      user_id: null,
      name: feishuUser?.name || projectUserKey,
      email,
      department_name: null,
      total_pd: Number(item.total_pd || 0),
      total_hours: Number(item.total_hours || 0),
      item_count: Number(item.item_count || 0),
      first_work_date: item.first_work_date,
      last_work_date: item.last_work_date,
      requirement_names: reqNamesMap.get(projectUserKey) || [],
      project_names: projNamesMap.get(projectUserKey) || [],
    }
  })

  const totals = people.reduce((acc, person) => {
    acc.totalPd += person.total_pd
    acc.totalHours += person.total_hours
    return acc
  }, { totalPd: 0, totalHours: 0 })

  console.log('[pd-summary] done', {
    projectUserKey,
    peopleCount: people.length,
    totalPd: totals.totalPd,
    totalHours: totals.totalHours,
    sample: people.slice(0, 3).map(p => ({ name: p.name, projects: p.project_names.length, requirements: p.requirement_names.length })),
  })

  return {
    startDate,
    endDate,
    projectUserKey,
    totalPd: Number(totals.totalPd.toFixed(2)),
    totalHours: Number(totals.totalHours.toFixed(2)),
    peopleCount: people.length,
    people,
  }
}

export async function listFeishuUsers(): Promise<FeishuUserRow[]> {
  const db = getDb()
  return db.query<FeishuUserRow>(`
    SELECT user_key, name, email, avatar_url
    FROM feishu_user
    WHERE user_key IS NOT NULL AND user_key != ''
    ORDER BY
      CASE WHEN name IS NULL OR name = '' THEN 1 ELSE 0 END ASC,
      name ASC,
      user_key ASC
  `)
}
