import fieldMappings from '../config/workHourFields.json'
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

const WORK_ITEM_TYPE_KEY = config.feishuProject.workHourType

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
      case 'yesno': return false
      case 'select': return ''
      case 'tree_select': return ''
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
    case 'yesno':
      if (typeof raw === 'object' && raw !== null) {
        const label = String(raw.label ?? raw.value ?? '').toLowerCase()
        return label === '是' || label === 'yes' || label === '1'
      }
      return raw === true || raw === 1
    case 'select':
      if (typeof raw === 'object' && raw !== null) {
        return String(raw.label ?? raw.value ?? '')
      }
      return String(raw)
    case 'tree_select':
      if (typeof raw === 'object' && raw !== null) {
        return String(raw.label ?? '')
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

  // 额外提取 update_time（飞书顶层字段 updated_at，毫秒时间戳）
  const updatedAt = extractTopLevel(item, 'updated_at')
  row.update_time = typeof updatedAt === 'number' ? new Date(updatedAt) : new Date()

  return row
}

async function upsertRow(db: any, row: Record<string, any>): Promise<'inserted' | 'updated'> {
  const result = await db.execute(`
    INSERT INTO feishu_workitem_gongshi (
      work_item_id, work_description, work_item_type, work_item_status,
      create_time, work_hour_reporter, actual_work_hours, pd_count,
      work_date, related_project, related_requirement, specific_work_hour_type,
      role, business_domain_belonging, belonging_month, work_start_time,
      work_content_description, description, priority,
      is_completed, is_auto_generated, is_quality_related,
      update_time
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?
    )
    ON DUPLICATE KEY UPDATE
      work_description = VALUES(work_description),
      work_item_type = VALUES(work_item_type),
      work_item_status = VALUES(work_item_status),
      create_time = VALUES(create_time),
      work_hour_reporter = VALUES(work_hour_reporter),
      actual_work_hours = VALUES(actual_work_hours),
      pd_count = VALUES(pd_count),
      work_date = VALUES(work_date),
      related_project = VALUES(related_project),
      related_requirement = VALUES(related_requirement),
      specific_work_hour_type = VALUES(specific_work_hour_type),
      role = VALUES(role),
      business_domain_belonging = VALUES(business_domain_belonging),
      belonging_month = VALUES(belonging_month),
      work_start_time = VALUES(work_start_time),
      work_content_description = VALUES(work_content_description),
      description = VALUES(description),
      priority = VALUES(priority),
      is_completed = VALUES(is_completed),
      is_auto_generated = VALUES(is_auto_generated),
      is_quality_related = VALUES(is_quality_related),
      update_time = VALUES(update_time)
  `, [
    row.work_item_id, row.work_description, row.work_item_type, row.work_item_status,
    row.create_time, row.work_hour_reporter, row.actual_work_hours, row.pd_count,
    row.work_date, row.related_project, row.related_requirement, row.specific_work_hour_type,
    row.role, row.business_domain_belonging, row.belonging_month, row.work_start_time,
    row.work_content_description, row.description, row.priority,
    row.is_completed, row.is_auto_generated, row.is_quality_related,
    row.update_time || new Date(),
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

function extractItemsFromResponse(raw: any): any[] {
  const data = raw?.data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const key of ['items', 'work_items', 'work_item_list']) {
      if (Array.isArray(data[key])) return data[key]
    }
  }
  return []
}

function getUniqueFieldKeys(): string[] {
  const topKeys = new Set(['name', 'created_at', 'updated_at', 'template', 'start_time'])
  return [...new Set(
    Object.values(mappings)
      .filter(m => m.source === 'field' && m.key && !topKeys.has(m.key))
      .map(m => m.key!)
  )]
}

function uniqueItems(items: any[]): any[] {
  const seen = new Set<string>()
  const result: any[] = []
  for (const item of items) {
    const id = item?.id ?? item?.work_item_id ?? item?.workItemId ?? item?.name ?? JSON.stringify(item)
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function readUpdatedAtMs(item: any): number | null {
  const candidates = [
    item?.updated_at,
    item?.updatedAt,
    item?.fields?.updated_at,
    item?.field_value_map?.updated_at,
    item?.fieldValueMap?.updated_at,
  ]

  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue
    if (typeof candidate === 'number') {
      return candidate > 1_000_000_000_000 ? candidate : candidate * 1000
    }
    if (typeof candidate === 'string') {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed) && parsed > 1_000_000_000) {
        return parsed < 10_000_000_000 ? parsed * 1000 : parsed
      }
      const time = new Date(candidate).getTime()
      if (!Number.isNaN(time)) return time
    }
  }

  const fields = Array.isArray(item?.fields) ? item.fields : []
  const updatedField = fields.find((field: any) =>
    field?.field_key === 'updated_at' ||
    field?.field_alias === 'updated_at' ||
    field?.key === 'updated_at'
  )
  const raw = updatedField?.field_value ?? updatedField?.value ?? updatedField
  if (typeof raw === 'number') {
    return raw > 1_000_000_000_000 ? raw : raw * 1000
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed > 1_000_000_000) {
      return parsed < 10_000_000_000 ? parsed * 1000 : parsed
    }
    const time = new Date(raw).getTime()
    if (!Number.isNaN(time)) return time
  }

  return null
}

async function fetchWorkHourItems(workItemTypeKey?: string, startDate?: string, endDate?: string): Promise<any[]> {
  feishuProject.assertConfigured()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY
  const dateFieldKey = config.feishuProject.workHourDateField
  const pageSize = config.feishuProject.pageSize
  const uniqueFieldKeys = getUniqueFieldKeys()

  const allItems: any[] = []

  // 先拉第一页拿总数
  const firstRaw = await feishuProject.listWorkItemsByFilter({
    work_item_type_keys: [rawTypeKey],
    fields: uniqueFieldKeys,
    page_num: 1,
    page_size: pageSize,
  })
  const firstItems = extractItemsFromResponse(firstRaw)
  allItems.push(...firstItems)

  const firstPagination = firstRaw?.pagination || firstRaw?.data?.pagination
  const total = Number(firstPagination?.total || firstRaw?.data?.total || 0)
  const totalPages = Math.ceil(total / pageSize)

  console.log('[work-hour-import] first page done', { total, totalPages, pageSize })

  // 并发拉剩余页
  if (totalPages > 1) {
    const concurrency = 5
    for (let batchStart = 2; batchStart <= totalPages; batchStart += concurrency) {
      const batchEnd = Math.min(batchStart + concurrency - 1, totalPages)
      const pages = []
      for (let p = batchStart; p <= batchEnd; p++) {
        pages.push(p)
      }

      const results = await Promise.all(
        pages.map(pageNum =>
          feishuProject.listWorkItemsByFilter({
            work_item_type_keys: [rawTypeKey],
            fields: uniqueFieldKeys,
            page_num: pageNum,
            page_size: pageSize,
          }).then(raw => ({ pageNum, items: extractItemsFromResponse(raw) }))
        )
      )

      results.sort((a, b) => a.pageNum - b.pageNum)
      for (const { pageNum, items } of results) {
        allItems.push(...items)
      }

      console.log('[work-hour-import] batch done', {
        pages: `${batchStart}-${batchEnd}`,
        fetched: results.reduce((sum, r) => sum + r.items.length, 0),
        totalSoFar: allItems.length,
      })
    }
  }

  console.log('[work-hour-import] all pages done', { typeKey: rawTypeKey, total: allItems.length })

  // 打印第一条数据的字段情况，方便排查
  if (allItems.length > 0) {
    const sample = allItems[0]
    const sampleFields = Array.isArray(sample?.fields) ? sample.fields : []
    const foundKeys = sampleFields.map((f: any) => f.field_key).filter(Boolean)
    const missingKeys = uniqueFieldKeys.filter(k => !foundKeys.includes(k))
    console.log('[work-hour-import] sample field check', {
      requestedFields: uniqueFieldKeys.length,
      foundFields: foundKeys.length,
      missingFields: missingKeys.length > 0 ? missingKeys : 'none',
      sampleKeys: foundKeys.slice(0, 15),
    })
  }

  // 全量拿到后，如果有时间范围，按日期字段过滤
  if (startDate && endDate && allItems.length > 0) {
    const startMs = new Date(`${startDate}T00:00:00`).getTime()
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime()
    const filtered = allItems.filter(item => {
      const dateValue = extractFieldValue(item.fields || [], dateFieldKey)
        ?? extractTopLevel(item, 'created_at')
      if (dateValue == null) return false
      const ts = typeof dateValue === 'number' ? dateValue : 0
      return ts >= startMs && ts <= endMs
    })
    console.log('[work-hour-import] date range filter', { total: allItems.length, filtered: filtered.length })
    return filtered
  }

  return allItems
}

/** 全量同步：拉取所有工时数据并入库 */
export async function syncAllWorkHours(workItemTypeKey?: string): Promise<SyncResult> {
  const items = await fetchWorkHourItems(workItemTypeKey)
  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }
  return importItems(items)
}

/** 按时间范围同步：全量拉取后再按日期过滤入库 */
export async function syncWorkHoursByDateRange(startDate: string, endDate: string, workItemTypeKey?: string): Promise<SyncResult> {
  const items = await fetchWorkHourItems(workItemTypeKey, startDate, endDate)
  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }
  return importItems(items)
}

/** 手动导入：接收前端传来的 response 数据 */
export async function importWorkHourItems(items: any[]): Promise<SyncResult> {
  return importItems(items)
}

/** 增量同步：拉全量后按更新时间做本地过滤，避免飞书 search 时间条件不兼容 */
export async function syncIncrementalWorkHours(workItemTypeKey?: string): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const db = getDb()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY

  // 查本地表最新的 update_time
  const row = await db.queryOne<{ max_updated: string }>(
    'SELECT MAX(update_time) AS max_updated FROM feishu_workitem_gongshi'
  )
  const localMaxUpdated = row?.max_updated ? new Date(row.max_updated).getTime() : 0

  // 本地没数据，走全量同步
  if (!localMaxUpdated) {
    console.log('[work-hour-import] incremental: no local data, fallback to full sync')
    return syncAllWorkHours(workItemTypeKey)
  }

  console.log('[work-hour-import] incremental sync', {
    localMaxUpdated: new Date(localMaxUpdated).toISOString(),
  })

  const safeLowerBound = localMaxUpdated - 300_000
  const nowMs = Date.now()
  const uniqueFieldKeys = getUniqueFieldKeys()

  let items: any[] = []
  try {
    items = await feishuProject.listAllWorkItemsByFilter({
      work_item_type_keys: [rawTypeKey],
      fields: uniqueFieldKeys,
      search_group: {
        conjunction: 'AND',
        search_params: [
          { param_key: 'updated_at', operator: 'BETWEEN', value: [safeLowerBound, nowMs] },
        ],
      },
    })
    console.log('[work-hour-import] incremental filter query done', {
      filtered: items.length,
      safeLowerBound: new Date(safeLowerBound).toISOString(),
      nowMs: new Date(nowMs).toISOString(),
    })
  } catch (err) {
    console.warn('[work-hour-import] incremental filter query failed, fallback to local scan', {
      reason: err instanceof Error ? err.message : String(err),
    })

    const allItems = await fetchWorkHourItems(rawTypeKey)
    items = uniqueItems(allItems).filter(item => {
      const updatedAt = readUpdatedAtMs(item)
      return updatedAt != null && updatedAt >= safeLowerBound
    })

    console.log('[work-hour-import] incremental local filter done', {
      total: allItems.length,
      unique: uniqueItems(allItems).length,
      filtered: items.length,
      safeLowerBound: new Date(safeLowerBound).toISOString(),
    })
  }

  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }

  return importItems(items)
}
