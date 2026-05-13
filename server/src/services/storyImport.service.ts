import fieldMappings from '../config/storyFields.json'
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

const WORK_ITEM_TYPE_KEY = config.feishuProject.storyType

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

  // 从 role_owners 字段提取产品负责人（PM）
  const roleOwners = extractFieldValue(fields, 'role_owners')
  if (Array.isArray(roleOwners)) {
    const pmEntry = roleOwners.find((r: any) => r.role === 'PM')
    row.product_owner = Array.isArray(pmEntry?.owners) && pmEntry.owners.length > 0
      ? String(pmEntry.owners[0])
      : null
  } else {
    row.product_owner = null
  }

  const updatedAt = extractTopLevel(item, 'updated_at')
  row.update_time = typeof updatedAt === 'number' ? new Date(updatedAt) : new Date()

  return row
}

async function upsertRow(db: any, row: Record<string, any>): Promise<'inserted' | 'updated'> {
  const result = await db.execute(`
    INSERT INTO feishu_workitem_story (
      work_item_id, name, owner, start_time, finish_time,
      work_item_type_key, work_item_status, finish_status, related_project,
      current_status_operator, product_owner, template_type, sub_stage, update_time
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      owner = VALUES(owner),
      start_time = VALUES(start_time),
      finish_time = VALUES(finish_time),
      work_item_type_key = VALUES(work_item_type_key),
      work_item_status = VALUES(work_item_status),
      finish_status = VALUES(finish_status),
      related_project = VALUES(related_project),
      current_status_operator = VALUES(current_status_operator),
      product_owner = VALUES(product_owner),
      template_type = VALUES(template_type),
      sub_stage = VALUES(sub_stage),
      update_time = VALUES(update_time)
  `, [
    row.work_item_id, row.name, row.owner, row.start_time, row.finish_time,
    row.work_item_type_key, row.work_item_status, row.finish_status, row.related_project,
    row.current_status_operator, row.product_owner, row.template_type, row.sub_stage, row.update_time || new Date(),
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
  const keys = Object.values(mappings)
    .filter(m => m.source === 'field' && m.key && !topKeys.has(m.key))
    .map(m => m.key!)
  // role_owners 不在 storyFields 映射中，但需要请求以解析产品负责人
  keys.push('role_owners')
  return [...new Set(keys)]
}

async function fetchStoryItems(workItemTypeKey?: string, startDate?: string, endDate?: string): Promise<any[]> {
  feishuProject.assertConfigured()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY
  const pageSize = config.feishuProject.pageSize
  const uniqueFieldKeys = getUniqueFieldKeys()

  const allItems: any[] = []

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

  console.log('[story-import] first page done', { total, totalPages, pageSize })

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

      console.log('[story-import] batch done', {
        pages: `${batchStart}-${batchEnd}`,
        fetched: results.reduce((sum, r) => sum + r.items.length, 0),
        totalSoFar: allItems.length,
      })
    }
  }

  console.log('[story-import] all pages done', { typeKey: rawTypeKey, total: allItems.length })

  if (allItems.length > 0) {
    const sample = allItems[0]
    const sampleFields = Array.isArray(sample?.fields) ? sample.fields : []
    const foundKeys = sampleFields.map((f: any) => f.field_key).filter(Boolean)
    const missingKeys = uniqueFieldKeys.filter(k => !foundKeys.includes(k))
    console.log('[story-import] sample field check', {
      requestedFields: uniqueFieldKeys.length,
      foundFields: foundKeys.length,
      missingFields: missingKeys.length > 0 ? missingKeys : 'none',
      sampleKeys: foundKeys.slice(0, 15),
    })
  }

  if (startDate && endDate && allItems.length > 0) {
    const startMs = new Date(`${startDate}T00:00:00`).getTime()
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime()
    const filtered = allItems.filter(item => {
      const dateValue = extractFieldValue(item.fields || [], 'start_time')
        ?? extractTopLevel(item, 'created_at')
      if (dateValue == null) return false
      const ts = typeof dateValue === 'number' ? dateValue : 0
      return ts >= startMs && ts <= endMs
    })
    console.log('[story-import] date range filter', { total: allItems.length, filtered: filtered.length })
    return filtered
  }

  return allItems
}

/** 全量同步：拉取所有需求数据并入库 */
export async function syncAllStories(workItemTypeKey?: string): Promise<SyncResult> {
  const items = await fetchStoryItems(workItemTypeKey)
  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }
  return importItems(items)
}

/** 按时间范围同步：用 filter API 在飞书端按时间段过滤，只拉取指定范围的数据 */
export async function syncStoriesByDateRange(startDate: string, endDate: string, workItemTypeKey?: string): Promise<SyncResult> {
  feishuProject.assertConfigured()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY
  const startMs = new Date(`${startDate}T00:00:00`).getTime()
  const endMs = new Date(`${endDate}T23:59:59.999`).getTime()
  const uniqueFieldKeys = getUniqueFieldKeys()

  console.log('[story-import] date range sync', { startDate, endDate, typeKey: rawTypeKey })

  const items = await feishuProject.listAllWorkItemsByFilter({
    work_item_type_keys: [rawTypeKey],
    fields: uniqueFieldKeys,
    updated_at: { start: startMs, end: endMs },
    expand: { need_workflow: false },
  })

  console.log('[story-import] date range sync done', { filtered: items.length })

  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }

  return importItems(items)
}

/** 手动导入：接收前端传来的数据 */
export async function importStoryItems(items: any[]): Promise<SyncResult> {
  return importItems(items)
}

/** 增量同步：用 search API 按时间范围只拉新增/更新的数据 */
export async function syncIncrementalStories(workItemTypeKey?: string): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const db = getDb()

  const rawTypeKey = workItemTypeKey || WORK_ITEM_TYPE_KEY

  const row = await db.queryOne<{ max_updated: string }>(
    'SELECT MAX(update_time) AS max_updated FROM feishu_workitem_story'
  )
  const localMaxUpdated = row?.max_updated ? new Date(row.max_updated).getTime() : 0

  if (!localMaxUpdated) {
    console.log('[story-import] incremental: no local data, fallback to full sync')
    return syncAllStories(workItemTypeKey)
  }

  console.log('[story-import] incremental sync', {
    localMaxUpdated: new Date(localMaxUpdated).toISOString(),
  })

  const nowMs = Date.now()
  const uniqueFieldKeys = getUniqueFieldKeys()

  let items: any[] = []

  const searchFields = ['updated_at', 'start_time', 'created_at']
  for (const searchField of searchFields) {
    if (items.length > 0) break
    try {
      items = await feishuProject.searchAllWorkItems(rawTypeKey, {
        fields: uniqueFieldKeys,
        search_group: {
          conjunction: 'AND',
          search_params: [
            { param_key: searchField, operator: 'BETWEEN', value: [localMaxUpdated, nowMs] },
          ],
        },
      })
      console.log(`[story-import] incremental search by ${searchField} done`, { items: items.length })
    } catch (err) {
      console.warn(`[story-import] search by ${searchField} failed`, {
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (items.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }

  return importItems(items)
}
