import fieldMappings from '../config/projectFields.json'
import { config } from '../config'
import { getDb } from '../db'
import { feishuProject } from './feishuProject.service'

interface Mapping {
  source: 'top' | 'field'
  path?: string
  key?: string
  type?: string
}

interface SyncResult {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ index: number; reason: string }>
}

const mappings: Record<string, Mapping> = fieldMappings as Record<string, Mapping>

const WORK_ITEM_TYPE_KEY = config.feishuProject.projectType

function extractTopLevel(item: any, path: string): any {
  const parts = path.split('.')
  let value: any = item
  for (const part of parts) {
    if (value == null) return null
    value = value[part]
  }
  return value
}

function extractFieldValue(fields: any[], key: string): any {
  const field = fields.find(f => f.field_key === key)
  return field?.field_value ?? null
}

function parseFieldValue(raw: any, type: string): any {
  if (raw == null) {
    switch (type) {
      case 'number': return 0
      case 'date': return null
      case 'user': return ''
      case 'bool': return false
      case 'select': return ''
      case 'text': return ''
      case 'related': return ''
      default: return null
    }
  }

  switch (type) {
    case 'number':
      return typeof raw === 'number' ? raw : Number(raw) || 0
    case 'date': {
      if (typeof raw !== 'number') return null
      return new Date(raw)
    }
    case 'user':
      return typeof raw === 'string' ? raw : String(raw)
    case 'bool':
      return raw === true || raw === 1
    case 'select':
      if (typeof raw === 'object' && raw !== null) {
        return String(raw.label ?? raw.value ?? '')
      }
      return String(raw)
    case 'text':
      return String(raw)
    case 'related':
      return String(raw)
    default:
      return raw
  }
}

function parseWorkItem(item: any): Record<string, any> {
  const fields = Array.isArray(item.fields) ? item.fields : []
  const row: Record<string, any> = {}

  for (const [column, mapping] of Object.entries(mappings)) {
    let raw: any
    if (mapping.source === 'top') {
      raw = extractTopLevel(item, mapping.path ?? '')
    } else {
      raw = extractFieldValue(fields, mapping.key ?? '')
    }
    row[column] = parseFieldValue(raw, mapping.type ?? 'text')
  }

  const updatedAt = extractTopLevel(item, 'updated_at')
  row.updated_at = typeof updatedAt === 'number' ? new Date(updatedAt) : new Date()

  return row
}

async function upsertRow(db: any, row: Record<string, any>): Promise<'inserted' | 'updated'> {
  const result = await db.execute(`
    INSERT INTO feishu_workitem_project (
      work_item_id, name, owner, start_time, updated_at,
      current_status_operator, business, rd_business_domain, project_level,
      estimated_pd, planned_pd, scheduled_pd, total_registered_pd, feishu_total_registered_pd
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      owner = VALUES(owner),
      start_time = VALUES(start_time),
      updated_at = VALUES(updated_at),
      current_status_operator = VALUES(current_status_operator),
      business = VALUES(business),
      rd_business_domain = VALUES(rd_business_domain),
      project_level = VALUES(project_level),
      estimated_pd = VALUES(estimated_pd),
      planned_pd = VALUES(planned_pd),
      scheduled_pd = VALUES(scheduled_pd),
      total_registered_pd = VALUES(total_registered_pd),
      feishu_total_registered_pd = VALUES(feishu_total_registered_pd)
  `, [
    row.work_item_id, row.name, row.owner, row.start_time, row.updated_at || new Date(),
    row.current_status_operator, row.business, row.rd_business_domain, row.project_level,
    row.estimated_pd, row.planned_pd, row.scheduled_pd, row.total_registered_pd, row.feishu_total_registered_pd,
  ])

  return result.affectedRows === 1 ? 'inserted' : 'updated'
}

async function importItems(items: any[]): Promise<SyncResult> {
  const db = getDb()
  const errors: Array<{ index: number; reason: string }> = []
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (let i = 0; i < items.length; i++) {
    try {
      const row = parseWorkItem(items[i])
      if (!row.work_item_id) {
        errors.push({ index: i, reason: '缺少 work_item_id' })
        skipped++
        continue
      }
      const action = await upsertRow(db, row)
      if (action === 'inserted') inserted++
      else updated++
    } catch (err) {
      errors.push({ index: i, reason: err instanceof Error ? err.message : String(err) })
      skipped++
    }
  }

  return { total: items.length, inserted, updated, skipped, errors }
}

function getUniqueFieldKeys(): string[] {
  const topKeys = new Set(['name', 'created_at', 'updated_at', 'start_time'])
  return [...new Set(
    Object.values(mappings)
      .filter(m => m.source === 'field' && m.key && !topKeys.has(m.key))
      .map(m => m.key!)
  )]
}

/** 全量同步 */
export async function syncAllProjects(workItemTypeKey?: string): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY
  const uniqueFieldKeys = getUniqueFieldKeys()

  const items = await feishuProject.listAllWorkItemsByFilter({
    work_item_type_keys: [rawTypeKey],
    fields: uniqueFieldKeys,
  })

  console.log('[project-import] full sync done', { typeKey: rawTypeKey, total: items.length })

  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }
  return importItems(items)
}

/** 按时间范围同步：用 filter API 在飞书端按时间段过滤 */
export async function syncProjectsByDateRange(startDate: string, endDate: string, workItemTypeKey?: string): Promise<SyncResult> {
  feishuProject.assertConfigured()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY
  const startMs = new Date(`${startDate}T00:00:00`).getTime()
  const endMs = new Date(`${endDate}T23:59:59.999`).getTime()
  const uniqueFieldKeys = getUniqueFieldKeys()

  console.log('[project-import] date range sync', { startDate, endDate, typeKey: rawTypeKey })

  const items = await feishuProject.listAllWorkItemsByFilter({
    work_item_type_keys: [rawTypeKey],
    fields: uniqueFieldKeys,
    updated_at: { start: startMs, end: endMs },
    expand: { need_workflow: false },
  })

  console.log('[project-import] date range sync done', { filtered: items.length })

  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }
  return importItems(items)
}

/** 增量同步：基于本地 MAX(updated_at) 只拉更新的数据 */
export async function syncIncrementalProjects(workItemTypeKey?: string): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const db = getDb()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY

  const row = await db.queryOne<{ max_updated: string }>(
    'SELECT MAX(updated_at) AS max_updated FROM feishu_workitem_project'
  )
  const localMaxUpdated = row?.max_updated ? new Date(row.max_updated).getTime() : 0

  if (!localMaxUpdated) {
    console.log('[project-import] incremental: no local data, fallback to full sync')
    return syncAllProjects(workItemTypeKey)
  }

  const safeLowerBound = localMaxUpdated - 300_000
  const nowMs = Date.now()
  const uniqueFieldKeys = getUniqueFieldKeys()

  console.log('[project-import] incremental sync', {
    localMaxUpdated: new Date(localMaxUpdated).toISOString(),
  })

  const items = await feishuProject.listAllWorkItemsByFilter({
    work_item_type_keys: [rawTypeKey],
    fields: uniqueFieldKeys,
    updated_at: { start: safeLowerBound, end: nowMs },
    expand: { need_workflow: false },
  })

  console.log('[project-import] incremental sync done', { filtered: items.length })

  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }
  return importItems(items)
}

/** 手动导入 */
export async function importProjectItems(items: any[]): Promise<SyncResult> {
  return importItems(items)
}
