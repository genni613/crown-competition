import { config } from '../config'
import { getDb } from '../db'
import { feishuProject } from './feishuProject.service'

interface WorkHourQuery {
  departmentName?: string
  startDate?: string
  endDate?: string
  workItemTypeKey?: string
  userFieldKey?: string
  hoursFieldKey?: string
  dateFieldKey?: string
}

interface PersonProjectWorkHourQuery {
  userId: string
  startDate?: string
  endDate?: string
  workItemTypeKey?: string
  userFieldKey?: string
  hoursFieldKey?: string
  dateFieldKey?: string
  projectFieldKey?: string
  projectTypeKey?: string
}

interface WorkHourPerson {
  userId: string
  name: string
  email: string | null
  departmentName: string | null
  projectUserKey: string | null
  itemCount: number
  fetchedItemCount: number
  totalHours: number
  missingHoursFieldCount: number
  missingDateFieldCount: number
  warnings: string[]
}

interface FetchAttempt {
  source: string
  itemCount?: number
  error?: string
  durationMs?: number
}

interface FieldDiagnostic {
  workItemTypeKey: string
  requestedWorkItemTypeKey?: string
  resolvedTypeKey?: string
  resolvedApiName?: string
  resolvedName?: string
  ok: boolean
  fieldCount?: number
  userFieldFound?: boolean
  hoursFieldFound?: boolean
  dateFieldFound?: boolean
  likelyHourFields?: Array<{
    field_key?: string
    field_alias?: string
    field_name?: string
    field_type_key?: string
  }>
  likelyDateFields?: Array<{
    field_key?: string
    field_alias?: string
    field_name?: string
    field_type_key?: string
  }>
  matchingFields?: Array<{
    field_key?: string
    field_alias?: string
    field_name?: string
    field_type_key?: string
  }>
  error?: string
}

interface LocalUserLite {
  id: string
  name: string
  email: string | null
  department_name: string | null
}

interface ResolvedWorkItemType {
  requestedKey: string
  diagnosticKey: string
  queryKeys: string[]
  typeKey?: string
  apiName?: string
  name?: string
}

interface ProjectWorkHourItem {
  projectId: string
  projectName: string
  itemCount: number
  totalHours: number
}

interface WorkHourFetchResult {
  workItemTypeKey: string
  candidateTypes: string[]
  resolvedCandidateTypes: ResolvedWorkItemType[]
  fieldDiagnostics: FieldDiagnostic[]
  attempts: FetchAttempt[]
  items: any[]
  filteredItems: any[]
  userFieldKey: string
  hoursFieldKey: string
  dateFieldKey: string
  startMs?: number
  endMs?: number
}

function unwrapValue(value: unknown): any {
  if (Array.isArray(value)) {
    if (value.length === 1) return unwrapValue(value[0])
    return value.map(unwrapValue)
  }
  if (value && typeof value === 'object') {
    const item = value as Record<string, any>
    if ('value' in item) return item.value
    if ('field_value' in item) return item.field_value
    if ('fieldValue' in item) return item.fieldValue
    if ('number_value' in item) return item.number_value
    if ('numberValue' in item) return item.numberValue
    if ('date_value' in item) return item.date_value
    if ('dateValue' in item) return item.dateValue
    if ('timestamp' in item) return item.timestamp
    if ('text' in item) return item.text
    if ('name' in item) return item.name
    if ('label' in item) return item.label
  }
  return value
}

function readNumber(value: unknown): number {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return 0
  if (Array.isArray(raw)) return raw.reduce((sum, item) => sum + readNumber(item), 0)
  if (typeof raw === 'number') return raw > 1_000_000_000 && raw < 10_000_000_000 ? raw * 1000 : raw
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function readDate(value: unknown): number | null {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return null
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const time = readDate(item)
      if (time != null) return time
    }
    return null
  }
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    }
    const parsed = new Date(raw).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function readText(value: unknown): string {
  const raw = unwrapValue(value)
  if (raw == null) return ''
  if (Array.isArray(raw)) return raw.map(readText).filter(Boolean).join(',')
  if (typeof raw === 'object') return JSON.stringify(raw)
  return String(raw)
}

function fieldValue(item: any, key: string): unknown {
  if (item?.[key] !== undefined) return item[key]
  if (item?.fields?.[key] !== undefined) return item.fields[key]
  if (item?.field_value_map?.[key] !== undefined) return item.field_value_map[key]
  if (item?.fieldValueMap?.[key] !== undefined) return item.fieldValueMap[key]
  if (item?.field_values?.[key] !== undefined) return item.field_values[key]

  const fields = item?.fields || item?.field_values || item?.fieldValueList || item?.field_value_list
  if (Array.isArray(fields)) {
    const found = fields.find((field: any) =>
      field.field_key === key ||
      field.field_alias === key ||
      field.key === key ||
      field.alias === key ||
      field.id === key ||
      field.field_id === key ||
      field.fieldId === key
    )
    if (found) return found.value ?? found.field_value ?? found
  }
  return undefined
}

function toStartMs(date?: string): number | undefined {
  if (!date) return undefined
  const time = new Date(`${date}T00:00:00.000`).getTime()
  return Number.isNaN(time) ? undefined : time
}

function toEndMs(date?: string): number | undefined {
  if (!date) return undefined
  const time = new Date(`${date}T23:59:59.999`).getTime()
  return Number.isNaN(time) ? undefined : time
}

function isInDateRange(item: any, dateFieldKey: string, startMs?: number, endMs?: number): boolean {
  if (startMs == null || endMs == null) return true
  const date = readDate(fieldValue(item, dateFieldKey))
  return date != null && date >= startMs && date <= endMs
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

function workHourTypeCandidates(primary: string): string[] {
  return Array.from(new Set([
    primary,
    ...config.feishuProject.workHourTypeCandidates.split(',').map(item => item.trim()),
    config.feishuProject.defectType,
    config.feishuProject.storyType,
    config.feishuProject.issueType,
  ].filter(Boolean)))
}

async function resolveWorkItemTypeCandidates(candidateKeys: string[]): Promise<ResolvedWorkItemType[]> {
  const types = await feishuProject.listWorkItemTypes()
  const resolved = new Map<string, ResolvedWorkItemType>()

  for (const candidateKey of candidateKeys) {
    const normalized = candidateKey.trim()
    if (!normalized) continue

    const matched = types.find(type =>
      type.type_key === normalized ||
      type.api_name === normalized ||
      type.name === normalized
    )

    const queryKeys = Array.from(new Set([
      matched?.api_name,
      matched?.type_key,
      normalized,
    ].filter((value): value is string => Boolean(value && value.trim()))))

    const diagnosticKey = String(matched?.type_key || matched?.api_name || normalized)
    resolved.set(normalized, {
      requestedKey: normalized,
      diagnosticKey,
      queryKeys,
      typeKey: matched?.type_key,
      apiName: matched?.api_name,
      name: matched?.name,
    })
  }

  return Array.from(resolved.values())
}

function hasRequiredWorkHourFields(item: any, userFieldKey: string, hoursFieldKey: string): boolean {
  return fieldValue(item, userFieldKey) !== undefined && fieldValue(item, hoursFieldKey) !== undefined
}

function fieldMatches(field: any, key: string): boolean {
  return field?.field_key === key ||
    field?.field_alias === key ||
    field?.key === key ||
    field?.alias === key ||
    field?.id === key ||
    field?.field_id === key ||
    field?.fieldId === key
}

function fieldText(field: any): string {
  return [field?.field_key, field?.field_alias, field?.field_name, field?.field_type_key]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function toFieldSummary(field: any) {
  return {
    field_key: field.field_key,
    field_alias: field.field_alias,
    field_name: field.field_name,
    field_type_key: field.field_type_key,
  }
}

async function diagnoseWorkHourFields(
  candidateTypes: ResolvedWorkItemType[],
  userFieldKey: string,
  hoursFieldKey: string,
  dateFieldKey: string
): Promise<FieldDiagnostic[]> {
  const diagnostics: FieldDiagnostic[] = []
  for (const candidateType of candidateTypes) {
    const startedAt = Date.now()
    console.log('[feishu-work-hours] field diagnostic start', {
      requestedWorkItemTypeKey: candidateType.requestedKey,
      workItemTypeKey: candidateType.diagnosticKey,
      queryKeys: candidateType.queryKeys,
    })
    try {
      const fields = await feishuProject.listFields(candidateType.diagnosticKey)
      const matchingFields = fields.filter(field =>
        fieldMatches(field, userFieldKey) ||
        fieldMatches(field, hoursFieldKey) ||
        fieldMatches(field, dateFieldKey)
      )
      const likelyHourFields = fields.filter(field => {
        const text = fieldText(field)
        return /工时|小时|耗时|hour|hours|time_spent|work/.test(text)
      }).slice(0, 12)
      const likelyDateFields = fields.filter(field => {
        const text = fieldText(field)
        return /日期|时间|date|time|day|created|updated/.test(text)
      }).slice(0, 12)
      const diagnostic = {
        workItemTypeKey: candidateType.diagnosticKey,
        requestedWorkItemTypeKey: candidateType.requestedKey,
        resolvedTypeKey: candidateType.typeKey,
        resolvedApiName: candidateType.apiName,
        resolvedName: candidateType.name,
        ok: true,
        fieldCount: fields.length,
        userFieldFound: fields.some(field => fieldMatches(field, userFieldKey)),
        hoursFieldFound: fields.some(field => fieldMatches(field, hoursFieldKey)),
        dateFieldFound: fields.some(field => fieldMatches(field, dateFieldKey)),
        likelyHourFields: likelyHourFields.map(toFieldSummary),
        likelyDateFields: likelyDateFields.map(toFieldSummary),
        matchingFields: matchingFields.map(toFieldSummary),
      }
      diagnostics.push(diagnostic)
      console.log('[feishu-work-hours] field diagnostic done', {
        ...diagnostic,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        workItemTypeKey: candidateType.diagnosticKey,
        requestedWorkItemTypeKey: candidateType.requestedKey,
        resolvedTypeKey: candidateType.typeKey,
        resolvedApiName: candidateType.apiName,
        resolvedName: candidateType.name,
        ok: false,
        error: reason,
      })
      console.warn('[feishu-work-hours] field diagnostic failed', {
        requestedWorkItemTypeKey: candidateType.requestedKey,
        workItemTypeKey: candidateType.diagnosticKey,
        durationMs: Date.now() - startedAt,
        reason,
      })
    }
  }
  return diagnostics
}

function dateSearchBody(dateFieldKey: string, startMs?: number, endMs?: number, fields?: string[]): Record<string, any> {
  return {
    fields,
    search_group: {
      conjunction: 'AND',
      search_params: [
        { param_key: dateFieldKey, operator: 'BETWEEN', value: [startMs, endMs] },
      ],
    },
  }
}

function extractUsers(value: unknown): Array<{ key: string; name: string; email: string | null }> {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return []
  if (typeof raw === 'string') return [{ key: raw, name: raw, email: null }]
  if (Array.isArray(raw)) return raw.flatMap(extractUsers)
  if (typeof raw === 'object') {
    const item = raw as Record<string, any>
    const key = String(item.user_key || item.userKey || item.key || item.id || item.open_id || item.out_id || item.value || '')
    const name = String(item.name || item.display_name || item.displayName || item.en_name || key || '未知用户')
    const email = item.email ? String(item.email) : null
    return key ? [{ key, name, email }] : []
  }
  return []
}

function getLocalUserMap(): Map<string, LocalUserLite> {
  const users = getDb().prepare('SELECT id, name, email, department_name FROM users').all() as LocalUserLite[]
  const map = new Map<string, LocalUserLite>()
  for (const user of users) {
    map.set(user.id, user)
    if (user.email) map.set(user.email, user)
    map.set(user.name, user)
  }
  return map
}

function matchLocalUser(localUsers: Map<string, LocalUserLite>, projectUser: { key: string; name: string; email: string | null }) {
  return localUsers.get(projectUser.key) ||
    (projectUser.email ? localUsers.get(projectUser.email) : undefined) ||
    localUsers.get(projectUser.name)
}

async function resolveProjectUserKeyByEmail(email: string): Promise<string> {
  const json = await feishuProject.queryUserByEmail(email)
  const users = json.data?.users || json.data?.user_list || json.data || []
  const first = Array.isArray(users) ? users[0] : users
  const userKey = first?.user_key || first?.userKey || first?.key
  if (!userKey) throw new Error(`未找到飞书项目用户映射：${email}`)
  return userKey
}

async function resolveProjectUserKeyByUserId(userId: string): Promise<string> {
  const json = await feishuProject.queryUsersByOutIds([userId])
  const users = json.data?.users || json.data?.user_list || json.data || []
  const first = Array.isArray(users) ? users[0] : users
  const userKey = first?.user_key || first?.userKey || first?.key
  if (!userKey) throw new Error(`未找到飞书项目用户映射：${userId}`)
  return userKey
}

function extractWorkItemItems(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.data?.work_items)) return payload.data.work_items
  if (Array.isArray(payload?.data?.work_item_list)) return payload.data.work_item_list
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.work_items)) return payload.work_items
  return []
}

function extractProjectRelationIds(item: any, projectFieldKey: string): string[] {
  const ids = new Set<string>()
  const append = (value: unknown) => {
    const raw = unwrapValue(value)
    if (raw == null || raw === '') return
    if (Array.isArray(raw)) {
      raw.forEach(append)
      return
    }
    if (typeof raw === 'object') {
      const entry = raw as Record<string, any>
      const candidates = [
        entry.project_key,
        entry.project_id,
        entry.work_item_id,
        entry.workItemId,
        entry.story_id,
        entry.id,
        entry.key,
        entry.value,
        entry.field_value,
      ]
      for (const candidate of candidates) {
        const text = String(candidate || '').trim()
        if (text) ids.add(text)
      }
      return
    }
    const text = String(raw).trim()
    if (text) ids.add(text)
  }

  append(fieldValue(item, projectFieldKey))

  const details = Array.isArray(item?.relation_fields_detail) ? item.relation_fields_detail : []
  for (const entry of details) {
    if (entry?.field_key !== projectFieldKey) continue
    const detailList = Array.isArray(entry.detail) ? entry.detail : []
    for (const detail of detailList) {
      append(detail?.project_key)
      append(detail?.project_id)
      append(detail?.work_item_id)
      append(detail?.workItemId)
      append(detail?.story_id)
      append(detail?.id)
      append(detail?.value)
      append(detail?.field_value)
    }
  }

  return Array.from(ids)
}

async function fetchWorkHourItems(query: WorkHourQuery): Promise<WorkHourFetchResult> {
  feishuProject.assertConfigured()
  const workItemTypeKey = query.workItemTypeKey || config.feishuProject.workHourType
  const candidateTypes = workHourTypeCandidates(workItemTypeKey)
  const userFieldKey = query.userFieldKey || config.feishuProject.workHourUserField
  const hoursFieldKey = query.hoursFieldKey || config.feishuProject.workHourHoursField
  const dateFieldKey = query.dateFieldKey || config.feishuProject.workHourDateField
  const startMs = toStartMs(query.startDate)
  const endMs = toEndMs(query.endDate)
  const attempts: FetchAttempt[] = []
  const resolvedCandidateTypes = await resolveWorkItemTypeCandidates(candidateTypes)
  const fieldDiagnostics: FieldDiagnostic[] = await diagnoseWorkHourFields(
    resolvedCandidateTypes,
    userFieldKey,
    hoursFieldKey,
    dateFieldKey
  )
  const searchableTypes = resolvedCandidateTypes.filter(candidateType => {
    const diagnostic = fieldDiagnostics.find(item => item.requestedWorkItemTypeKey === candidateType.requestedKey)
    return Boolean(diagnostic?.ok && diagnostic.userFieldFound && diagnostic.hoursFieldFound)
  })

  console.log('[feishu-work-hours] query start', {
    departmentName: query.departmentName || null,
    workItemTypeKey,
    candidateTypes,
    resolvedCandidateTypes: resolvedCandidateTypes.map(item => ({
      requestedKey: item.requestedKey,
      diagnosticKey: item.diagnosticKey,
      queryKeys: item.queryKeys,
      typeKey: item.typeKey,
      apiName: item.apiName,
      name: item.name,
    })),
    searchableTypes: searchableTypes.map(item => ({
      requestedKey: item.requestedKey,
      diagnosticKey: item.diagnosticKey,
      queryKeys: item.queryKeys,
    })),
    userFieldKey,
    hoursFieldKey,
    dateFieldKey,
    startDate: query.startDate || null,
    endDate: query.endDate || null,
  })

  const fields = [userFieldKey, hoursFieldKey, dateFieldKey, 'name', 'created_at', 'updated_at', config.feishuProject.workHourProjectField]
  let items: any[] = []
  if (searchableTypes.length === 0) {
    attempts.push({
      source: 'field-precheck',
      error: `未找到同时包含 ${userFieldKey} 和 ${hoursFieldKey} 的工作项类型，请先修正 FEISHU_PROJECT_WORK_HOUR_TYPE / FEISHU_PROJECT_WORK_HOUR_HOURS_FIELD`,
    })
  }

  if (startMs != null && endMs != null) {
    for (const candidateType of searchableTypes) {
      for (const queryKey of candidateType.queryKeys) {
        const source = `search-by-date:${candidateType.requestedKey}:${queryKey}`
        const startedAt = Date.now()
        console.log('[feishu-work-hours] attempt start', { source, dateFieldKey, startMs, endMs })
        try {
          const candidateItems = await feishuProject.searchAllWorkItems(
            queryKey,
            dateSearchBody(dateFieldKey, startMs, endMs, fields)
          )
          const usableItems = queryKey === workItemTypeKey
            ? candidateItems
            : candidateItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
          const durationMs = Date.now() - startedAt
          attempts.push({ source, itemCount: usableItems.length, durationMs })
          console.log('[feishu-work-hours] attempt done', { source, itemCount: usableItems.length, durationMs })
          if (usableItems.length > 0) {
            items = usableItems
            break
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt
          const reason = error instanceof Error ? error.message : String(error)
          attempts.push({ source, error: reason, durationMs })
          console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
        }
      }
      if (items.length > 0) break
    }
  }

  if (startMs == null && endMs == null) {
    for (const candidateType of searchableTypes) {
      for (const queryKey of candidateType.queryKeys) {
        const source = `filter:${candidateType.requestedKey}:${queryKey}`
        const startedAt = Date.now()
        console.log('[feishu-work-hours] attempt start', { source })
        try {
          const candidateItems = await feishuProject.listAllWorkItemsByFilter({
            work_item_type_keys: [queryKey],
            fields,
          })
          const usableItems = queryKey === workItemTypeKey
            ? candidateItems
            : candidateItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
          attempts.push({
            source,
            itemCount: usableItems.length,
            durationMs: Date.now() - startedAt,
          })
          console.log('[feishu-work-hours] attempt done', {
            source,
            itemCount: usableItems.length,
            durationMs: Date.now() - startedAt,
          })
          if (usableItems.length > 0) {
            items = usableItems
            break
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt
          const reason = error instanceof Error ? error.message : String(error)
          attempts.push({
            source,
            error: reason,
            durationMs,
          })
          console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
        }
      }
      if (items.length > 0) break
    }
  }

  if (items.length === 0) {
    for (const candidateType of searchableTypes) {
      for (const queryKey of candidateType.queryKeys) {
        const source = startMs != null && endMs != null
          ? `search-created-at:${candidateType.requestedKey}:${queryKey}`
          : `search:${candidateType.requestedKey}:${queryKey}`
        const startedAt = Date.now()
        console.log('[feishu-work-hours] attempt start', { source })
        try {
          const candidateItems = startMs != null && endMs != null
            ? await feishuProject.searchAllWorkItems(
              queryKey,
              dateSearchBody('created_at', startMs, endMs, fields)
            )
            : await feishuProject.searchAllWorkItemsByCreatedAt(queryKey, { fields })
          const usableItems = queryKey === workItemTypeKey
            ? candidateItems
            : candidateItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
          const durationMs = Date.now() - startedAt
          attempts.push({
            source,
            itemCount: usableItems.length,
            durationMs,
          })
          console.log('[feishu-work-hours] attempt done', { source, itemCount: usableItems.length, durationMs })
          if (usableItems.length > 0) {
            items = usableItems
            break
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt
          const reason = error instanceof Error ? error.message : String(error)
          attempts.push({
            source,
            error: reason,
            durationMs,
          })
          console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
        }
      }
      if (items.length > 0) break
    }
  }

  if (items.length === 0 && startMs == null && endMs == null) {
    const source = 'filter:unscoped-with-required-fields'
    const startedAt = Date.now()
    console.log('[feishu-work-hours] attempt start', { source })
    try {
      const unscopedItems = await feishuProject.listAllWorkItemsByFilter({ fields })
      items = unscopedItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
      attempts.push({
        source,
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      })
      console.log('[feishu-work-hours] attempt done', {
        source,
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const reason = error instanceof Error ? error.message : String(error)
      attempts.push({
        source,
        error: reason,
        durationMs,
      })
      console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
    }
  }

  items = uniqueItems(items)
  const filteredItems = items.filter(item => isInDateRange(item, dateFieldKey, startMs, endMs))

  return {
    workItemTypeKey,
    candidateTypes,
    resolvedCandidateTypes,
    fieldDiagnostics,
    attempts,
    items,
    filteredItems,
    userFieldKey,
    hoursFieldKey,
    dateFieldKey,
    startMs,
    endMs,
  }
}

function summarizeItemFields(item: any): Record<string, unknown> {
  const fields = item?.fields || item?.field_values || item?.fieldValueList || item?.field_value_list
  const fieldArray = Array.isArray(fields) ? fields : []
  return {
    topLevelKeys: Object.keys(item || {}).slice(0, 30),
    fieldsIsArray: Array.isArray(fields),
    fieldsLength: fieldArray.length,
    fieldValueMapKeys: Object.keys(item?.field_value_map || item?.fieldValueMap || {}).slice(0, 30),
    fieldSamples: fieldArray.slice(0, 10).map((field: any) => ({
      field_key: field?.field_key,
      field_alias: field?.field_alias,
      field_id: field?.field_id,
      fieldId: field?.fieldId,
      key: field?.key,
      alias: field?.alias,
      valueKeys: field && typeof field === 'object' ? Object.keys(field).slice(0, 12) : [],
    })),
  }
}

export async function queryDepartmentWorkHours(query: WorkHourQuery) {
  feishuProject.assertConfigured()
  const workItemTypeKey = query.workItemTypeKey || config.feishuProject.workHourType
  const candidateTypes = workHourTypeCandidates(workItemTypeKey)
  const userFieldKey = query.userFieldKey || config.feishuProject.workHourUserField
  const hoursFieldKey = query.hoursFieldKey || config.feishuProject.workHourHoursField
  const dateFieldKey = query.dateFieldKey || config.feishuProject.workHourDateField
  const startMs = toStartMs(query.startDate)
  const endMs = toEndMs(query.endDate)
  const localUsers = getLocalUserMap()
  const attempts: FetchAttempt[] = []
  const resolvedCandidateTypes = await resolveWorkItemTypeCandidates(candidateTypes)
  const fieldDiagnostics: FieldDiagnostic[] = await diagnoseWorkHourFields(
    resolvedCandidateTypes,
    userFieldKey,
    hoursFieldKey,
    dateFieldKey
  )
  const searchableTypes = resolvedCandidateTypes.filter(candidateType => {
    const diagnostic = fieldDiagnostics.find(item => item.requestedWorkItemTypeKey === candidateType.requestedKey)
    return Boolean(diagnostic?.ok && diagnostic.userFieldFound && diagnostic.hoursFieldFound)
  })

  console.log('[feishu-work-hours] query start', {
    departmentName: query.departmentName || null,
    workItemTypeKey,
    candidateTypes,
    resolvedCandidateTypes: resolvedCandidateTypes.map(item => ({
      requestedKey: item.requestedKey,
      diagnosticKey: item.diagnosticKey,
      queryKeys: item.queryKeys,
      typeKey: item.typeKey,
      apiName: item.apiName,
      name: item.name,
    })),
    searchableTypes: searchableTypes.map(item => ({
      requestedKey: item.requestedKey,
      diagnosticKey: item.diagnosticKey,
      queryKeys: item.queryKeys,
    })),
    userFieldKey,
    hoursFieldKey,
    dateFieldKey,
    startDate: query.startDate || null,
    endDate: query.endDate || null,
  })

  const fields = [userFieldKey, hoursFieldKey, dateFieldKey, 'name', 'created_at', 'updated_at']
  let items: any[] = []
  if (searchableTypes.length === 0) {
    attempts.push({
      source: 'field-precheck',
      error: `未找到同时包含 ${userFieldKey} 和 ${hoursFieldKey} 的工作项类型，请先修正 FEISHU_PROJECT_WORK_HOUR_TYPE / FEISHU_PROJECT_WORK_HOUR_HOURS_FIELD`,
    })
  }
  if (startMs != null && endMs != null) {
    for (const candidateType of searchableTypes) {
      for (const queryKey of candidateType.queryKeys) {
        const source = `search-by-date:${candidateType.requestedKey}:${queryKey}`
        const startedAt = Date.now()
        console.log('[feishu-work-hours] attempt start', { source, dateFieldKey, startMs, endMs })
        try {
          const candidateItems = await feishuProject.searchAllWorkItems(
            queryKey,
            dateSearchBody(dateFieldKey, startMs, endMs, fields)
          )
          const usableItems = queryKey === workItemTypeKey
            ? candidateItems
            : candidateItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
          const durationMs = Date.now() - startedAt
          attempts.push({ source, itemCount: usableItems.length, durationMs })
          console.log('[feishu-work-hours] attempt done', { source, itemCount: usableItems.length, durationMs })
          if (usableItems.length > 0) {
            items = usableItems
            break
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt
          const reason = error instanceof Error ? error.message : String(error)
          attempts.push({ source, error: reason, durationMs })
          console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
        }
      }
      if (items.length > 0) {
        break
      }
    }
  }
  if (startMs == null && endMs == null) {
    for (const candidateType of searchableTypes) {
      for (const queryKey of candidateType.queryKeys) {
        const source = `filter:${candidateType.requestedKey}:${queryKey}`
        const startedAt = Date.now()
        console.log('[feishu-work-hours] attempt start', { source })
        try {
          const candidateItems = await feishuProject.listAllWorkItemsByFilter({
            work_item_type_keys: [queryKey],
            fields,
          })
          const usableItems = queryKey === workItemTypeKey
            ? candidateItems
            : candidateItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
          attempts.push({
            source,
            itemCount: usableItems.length,
            durationMs: Date.now() - startedAt,
          })
          console.log('[feishu-work-hours] attempt done', {
            source,
            itemCount: usableItems.length,
            durationMs: Date.now() - startedAt,
          })
          if (usableItems.length > 0) {
            items = usableItems
            break
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt
          const reason = error instanceof Error ? error.message : String(error)
          attempts.push({
            source,
            error: reason,
            durationMs,
          })
          console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
        }
      }
      if (items.length > 0) {
        break
      }
    }
  }
  if (items.length === 0) {
    for (const candidateType of searchableTypes) {
      for (const queryKey of candidateType.queryKeys) {
        const source = startMs != null && endMs != null
          ? `search-created-at:${candidateType.requestedKey}:${queryKey}`
          : `search:${candidateType.requestedKey}:${queryKey}`
        const startedAt = Date.now()
        console.log('[feishu-work-hours] attempt start', { source })
        try {
          const candidateItems = startMs != null && endMs != null
            ? await feishuProject.searchAllWorkItems(
              queryKey,
              dateSearchBody('created_at', startMs, endMs, fields)
            )
            : await feishuProject.searchAllWorkItemsByCreatedAt(queryKey, { fields })
          const usableItems = queryKey === workItemTypeKey
            ? candidateItems
            : candidateItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
          const durationMs = Date.now() - startedAt
          attempts.push({
            source,
            itemCount: usableItems.length,
            durationMs,
          })
          console.log('[feishu-work-hours] attempt done', { source, itemCount: usableItems.length, durationMs })
          if (usableItems.length > 0) {
            items = usableItems
            break
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt
          const reason = error instanceof Error ? error.message : String(error)
          attempts.push({
            source,
            error: reason,
            durationMs,
          })
          console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
        }
      }
      if (items.length > 0) {
        break
      }
    }
  }
  if (items.length === 0 && startMs == null && endMs == null) {
    const source = 'filter:unscoped-with-required-fields'
    const startedAt = Date.now()
    console.log('[feishu-work-hours] attempt start', { source })
    try {
      const unscopedItems = await feishuProject.listAllWorkItemsByFilter({ fields })
      items = unscopedItems.filter(item => hasRequiredWorkHourFields(item, userFieldKey, hoursFieldKey))
      attempts.push({
        source,
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      })
      console.log('[feishu-work-hours] attempt done', {
        source,
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const reason = error instanceof Error ? error.message : String(error)
      attempts.push({
        source,
        error: reason,
        durationMs,
      })
      console.warn('[feishu-work-hours] attempt failed', { source, durationMs, reason })
    }
  }
  items = uniqueItems(items)
  const filteredItems = items.filter(item => isInDateRange(item, dateFieldKey, startMs, endMs))
  const peopleMap = new Map<string, WorkHourPerson>()
  const globalWarnings: string[] = []

  console.log('[feishu-work-hours] fetched items', {
    fetchedItemCount: items.length,
    filteredItemCount: filteredItems.length,
    missingHoursFieldCount: filteredItems.filter(item => fieldValue(item, hoursFieldKey) === undefined).length,
    missingDateFieldCount: startMs != null && endMs != null
      ? items.filter(item => fieldValue(item, dateFieldKey) === undefined).length
      : 0,
    firstUserRaw: items[0] ? fieldValue(items[0], userFieldKey) : undefined,
    firstHoursRaw: items[0] ? fieldValue(items[0], hoursFieldKey) : undefined,
    firstDateRaw: items[0] ? fieldValue(items[0], dateFieldKey) : undefined,
    firstItemFields: items[0] ? summarizeItemFields(items[0]) : null,
    attempts,
    fieldDiagnostics,
  })

  for (const item of filteredItems) {
    const projectUsers = extractUsers(fieldValue(item, userFieldKey))
    if (projectUsers.length === 0) {
      globalWarnings.push(`工作项 ${readText(item?.id || item?.work_item_id || item?.name)} 缺少人员字段 ${userFieldKey}`)
      continue
    }
    const hours = readNumber(fieldValue(item, hoursFieldKey))

    for (const projectUser of projectUsers) {
      const localUser = matchLocalUser(localUsers, projectUser)
      const departmentName = localUser?.department_name || null
      if (query.departmentName && departmentName !== query.departmentName) continue

      const key = projectUser.key
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          userId: localUser?.id || key,
          name: localUser?.name || projectUser.name,
          email: localUser?.email || projectUser.email,
          departmentName,
          projectUserKey: projectUser.key,
          itemCount: 0,
          fetchedItemCount: 0,
          totalHours: 0,
          missingHoursFieldCount: 0,
          missingDateFieldCount: 0,
          warnings: localUser ? [] : ['未匹配到本地用户，按飞书项目用户展示'],
        })
      }

      const person = peopleMap.get(key)!
      person.fetchedItemCount += 1
      person.itemCount += 1
      person.totalHours += hours
      if (fieldValue(item, hoursFieldKey) === undefined) person.missingHoursFieldCount += 1
      if (startMs != null && endMs != null && fieldValue(item, dateFieldKey) === undefined) person.missingDateFieldCount += 1
    }
  }

  const people = Array.from(peopleMap.values()).sort((a, b) => b.totalHours - a.totalHours)
  if (people.length === 0 && globalWarnings.length > 0) {
    people.push({
      userId: 'unmatched',
      name: '未识别人员',
      email: null,
      departmentName: query.departmentName || null,
      projectUserKey: null,
      itemCount: 0,
      fetchedItemCount: filteredItems.length,
      totalHours: 0,
      missingHoursFieldCount: filteredItems.filter(item => fieldValue(item, hoursFieldKey) === undefined).length,
      missingDateFieldCount: 0,
      warnings: globalWarnings.slice(0, 20),
    })
  }
  if (people.length === 0 && filteredItems.length === 0) {
    people.push({
      userId: 'no-data',
      name: '未拉到工时数据',
      email: null,
      departmentName: query.departmentName || null,
      projectUserKey: null,
      itemCount: 0,
      fetchedItemCount: 0,
      totalHours: 0,
      missingHoursFieldCount: 0,
      missingDateFieldCount: 0,
      warnings: [
        ...attempts.map(attempt =>
        attempt.error
          ? `${attempt.source}: ${attempt.error}`
          : `${attempt.source}: ${attempt.itemCount || 0} 条`
        ),
        ...fieldDiagnostics.map(diagnostic => diagnostic.ok
          ? [
            `${diagnostic.workItemTypeKey} 字段发现成功：共 ${diagnostic.fieldCount || 0} 个字段，人员字段 ${diagnostic.userFieldFound ? '存在' : '不存在'}，工时字段 ${diagnostic.hoursFieldFound ? '存在' : '不存在'}，日期字段 ${diagnostic.dateFieldFound ? '存在' : '不存在'}`,
            diagnostic.likelyHourFields?.length
              ? `疑似工时字段：${diagnostic.likelyHourFields.map(field => `${field.field_name || '-'}(${field.field_key || field.field_alias || '-'})`).join(', ')}`
              : '',
            diagnostic.likelyDateFields?.length
              ? `疑似日期字段：${diagnostic.likelyDateFields.map(field => `${field.field_name || '-'}(${field.field_key || field.field_alias || '-'})`).join(', ')}`
              : '',
          ].filter(Boolean).join('；')
          : `${diagnostic.workItemTypeKey} 字段发现失败：${diagnostic.error}`
        ),
      ],
    })
  }

  const result = {
    departmentName: query.departmentName || null,
    workItemTypeKey,
    candidateTypes,
    userFieldKey,
    hoursFieldKey,
    dateFieldKey,
    startDate: query.startDate || null,
    endDate: query.endDate || null,
    userCount: people.length,
    totalHours: people.reduce((sum, person) => sum + person.totalHours, 0),
    people,
    attempts,
    fieldDiagnostics,
  }
  console.log('[feishu-work-hours] query done', {
    userCount: result.userCount,
    totalHours: result.totalHours,
    warningCount: people.reduce((sum, person) => sum + person.warnings.length, 0),
  })
  return result
}

export async function queryPersonProjectWorkHours(query: PersonProjectWorkHourQuery) {
  feishuProject.assertConfigured()
  const localUser = getDb().prepare(
    'SELECT id, name, email, department_name FROM users WHERE id = ?'
  ).get(query.userId) as LocalUserLite | undefined
  if (!localUser) throw new Error(`未找到本地用户：${query.userId}`)
  let projectUserKey: string
  if (localUser.email) {
    try {
      projectUserKey = await resolveProjectUserKeyByEmail(localUser.email)
    } catch (error) {
      console.warn('[feishu-work-hours] resolve by email failed, fallback to user id', {
        userId: localUser.id,
        userName: localUser.name,
        reason: error instanceof Error ? error.message : String(error),
      })
      projectUserKey = await resolveProjectUserKeyByUserId(localUser.id)
    }
  } else {
    console.log('[feishu-work-hours] user missing email, resolve by user id', {
      userId: localUser.id,
      userName: localUser.name,
    })
    projectUserKey = await resolveProjectUserKeyByUserId(localUser.id)
  }
  const projectFieldKey = query.projectFieldKey || config.feishuProject.workHourProjectField
  const projectTypeKey = query.projectTypeKey || config.feishuProject.workHourProjectType
  const userFieldKey = query.userFieldKey || config.feishuProject.workHourUserField
  const hoursFieldKey = query.hoursFieldKey || config.feishuProject.workHourHoursField
  const dateFieldKey = query.dateFieldKey || config.feishuProject.workHourDateField
  const startMs = toStartMs(query.startDate)
  const endMs = toEndMs(query.endDate)
  const candidateTypes = workHourTypeCandidates(query.workItemTypeKey || config.feishuProject.workHourType)
  const resolvedCandidateTypes = await resolveWorkItemTypeCandidates(candidateTypes)
  const matchedType = resolvedCandidateTypes.find(item =>
    item.requestedKey === (query.workItemTypeKey || config.feishuProject.workHourType) ||
    item.queryKeys.includes(query.workItemTypeKey || config.feishuProject.workHourType)
  ) || resolvedCandidateTypes[0]
  if (!matchedType) throw new Error('未找到可用的工时工作项类型')

  let candidateItems: any[] = []
  let usedQueryKey = matchedType.diagnosticKey
  let lastFilterError: string | null = null
  for (const queryKey of matchedType.queryKeys) {
    try {
      candidateItems = await feishuProject.listAllWorkItemsByFilter({
        work_item_type_keys: [queryKey],
        user_keys: [projectUserKey],
        fields: [userFieldKey, hoursFieldKey, dateFieldKey, 'name', 'created_at', 'updated_at', projectFieldKey],
      })
      usedQueryKey = queryKey
      lastFilterError = null
      break
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      lastFilterError = reason
      if (!/Wrong WorkItemType Param/i.test(reason)) {
        console.warn('[feishu-work-hours] list filter failed', {
          queryKey,
          reason,
        })
      }
    }
  }
  if (candidateItems.length === 0 && lastFilterError) {
    console.warn('[feishu-work-hours] all filter query keys failed', {
      queryKeys: matchedType.queryKeys,
      reason: lastFilterError,
    })
  }
  const filteredItems = candidateItems.filter(item => {
    if (startMs == null || endMs == null) return true
    const dateMs = readDate(fieldValue(item, dateFieldKey)) ?? readDate(fieldValue(item, 'created_at'))
    return dateMs != null && dateMs >= startMs && dateMs <= endMs
  })

  console.log('[feishu-work-hours] person project raw items', {
    userId: localUser.id,
    projectUserKey,
    workItemTypeKey: query.workItemTypeKey || config.feishuProject.workHourType,
    matchedType: {
      requestedKey: matchedType.requestedKey,
      diagnosticKey: matchedType.diagnosticKey,
      queryKeys: matchedType.queryKeys,
      typeKey: matchedType.typeKey,
      apiName: matchedType.apiName,
      name: matchedType.name,
    },
    usedQueryKey,
    candidateItemCount: candidateItems.length,
    filteredItemCount: filteredItems.length,
    dateFieldKey,
    startDate: query.startDate || null,
    endDate: query.endDate || null,
  })

  const projectIds = Array.from(new Set(
    filteredItems.flatMap(item => extractProjectRelationIds(item, projectFieldKey))
  ))
  const projectNameMap = new Map<string, string>()
  if (projectIds.length > 0) {
    try {
      const detail = await feishuProject.queryWorkItems(projectTypeKey, {
        work_item_ids: projectIds,
        fields: ['name'],
        expand: {
          need_workflow: true,
          relation_fields_detail: true,
          need_multi_text: true,
          need_user_detail: true,
          need_sub_task_parent: true,
        },
      })
      const items = extractWorkItemItems(detail)
      for (const item of items) {
        const id = String(item?.id ?? item?.work_item_id ?? item?.workItemId ?? '').trim()
        if (!id) continue
        const name = String(
          item?.name ??
          item?.title ??
          item?.simple_name ??
          item?.simpleName ??
          id
        ).trim() || id
        projectNameMap.set(id, name)
      }
    } catch (error) {
      console.warn('[feishu-work-hours] project detail resolve failed', {
        projectTypeKey,
        projectCount: projectIds.length,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const projectMap = new Map<string, ProjectWorkHourItem>()
  let totalHours = 0
  let itemCount = 0
  const warnings: string[] = []

  for (const item of filteredItems) {
    const owners = extractUsers(fieldValue(item, userFieldKey))
    const ownerMatched = owners.some(owner => owner.key === projectUserKey)
    if (!ownerMatched) continue

    const hours = readNumber(fieldValue(item, hoursFieldKey))
    const relationIds = Array.from(new Set(extractProjectRelationIds(item, projectFieldKey)))
    if (relationIds.length === 0) {
      warnings.push(`工作项 ${readText(item?.id || item?.work_item_id || item?.name)} 缺少关联项目字段 ${projectFieldKey}`)
      continue
    }

    totalHours += hours
    itemCount += 1
    for (const projectId of relationIds) {
      const projectName = projectNameMap.get(projectId) || projectId
      const current = projectMap.get(projectId) || {
        projectId,
        projectName,
        itemCount: 0,
        totalHours: 0,
      }
      current.itemCount += 1
      current.totalHours += hours
      current.projectName = projectName
      projectMap.set(projectId, current)
    }
  }

  const projects = Array.from(projectMap.values()).sort((a, b) => b.totalHours - a.totalHours)
  const result = {
    user: {
      userId: localUser.id,
      name: localUser.name,
      email: localUser.email,
      departmentName: localUser.department_name,
      projectUserKey,
    },
    startDate: query.startDate || null,
    endDate: query.endDate || null,
    workItemTypeKey: matchedType.diagnosticKey,
    projectFieldKey,
    projectTypeKey,
    itemCount,
    totalHours,
    projectCount: projects.length,
    projects,
    warnings,
    attempts: [],
    fieldDiagnostics: [],
  }

  console.log('[feishu-work-hours] person project query done', {
    userId: localUser.id,
    userName: localUser.name,
    projectCount: result.projectCount,
    totalHours: result.totalHours,
    itemCount: result.itemCount,
  })

  return result
}
