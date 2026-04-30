import api from './client'

export interface FeishuProjectStatus {
  configured: boolean
  projectKey: string
  workHourType: string
  workHourUserField: string
  workHourHoursField: string
  workHourDateField: string
  workHourProjectField: string
  workHourProjectType: string
  requiredEnv: string[]
}

export interface FeishuProjectField {
  field_key?: string
  field_alias?: string
  field_name?: string
  field_type_key?: string
}

export interface FeishuProjectWorkItemType {
  api_name?: string
  type_key?: string
  name?: string
  is_disable?: number
  query_key?: string
}

export interface FeishuRawPagination {
  page_num?: number
  page_size?: number
  total?: number
}

export interface FeishuRawFilterResponse {
  err?: Record<string, unknown>
  err_code?: number
  err_msg?: string
  data?: any[]
  pagination?: FeishuRawPagination
  [key: string]: unknown
}

export interface FeishuProjectUser {
  user_key?: string
  userKey?: string
  key?: string
  name?: string
  display_name?: string
  displayName?: string
  avatar_url?: string
  avatar_middle?: string
  avatar?: {
    avatar_middle?: string
  }
  [key: string]: unknown
}

export interface FeishuWorkItemDetailResponse {
  items?: any[]
  raw?: unknown
  mode?: string
}

export interface FeishuPersonProjectWorkHourItem {
  projectId: string
  projectName: string
  itemCount: number
  totalHours: number
}

export interface FeishuPersonProjectWorkHourResponse {
  user: {
    userId: string
    name: string
    email: string | null
    departmentName: string | null
    projectUserKey: string
  }
  startDate: string | null
  endDate: string | null
  workItemTypeKey: string
  projectFieldKey: string
  projectTypeKey: string
  itemCount: number
  totalHours: number
  projectCount: number
  projects: FeishuPersonProjectWorkHourItem[]
  warnings: string[]
  attempts: Array<{ source: string; itemCount?: number; error?: string; durationMs?: number }>
  fieldDiagnostics: Array<Record<string, unknown>>
}

export interface FeishuDepartmentWorkHourPerson {
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

export interface FeishuDepartmentWorkHourResponse {
  departmentName: string | null
  workItemTypeKey: string
  userFieldKey: string
  hoursFieldKey: string
  dateFieldKey: string
  startDate: string | null
  endDate: string | null
  userCount: number
  totalHours: number
  people: FeishuDepartmentWorkHourPerson[]
  attempts: Array<{ source: string; itemCount?: number; error?: string; durationMs?: number }>
  fieldDiagnostics: Array<Record<string, unknown>>
}

export const getFeishuProjectStatus = () =>
  api.get<FeishuProjectStatus>('/feishu/project/status')

export const getFeishuProjectFields = (workItemTypeKey: string) =>
  api.get<FeishuProjectField[]>(`/feishu/project/fields/${workItemTypeKey}`)

export const getFeishuProjectWorkItemTypes = () =>
  api.get<FeishuProjectWorkItemType[]>('/feishu/project/work-item-types')

export const filterFeishuWorkItems = (body: Record<string, unknown>) =>
  api.post<FeishuRawFilterResponse>('/feishu/project/work-items/filter', body)

export const getFeishuProjectUsersByKeys = (userKeys: string[]) =>
  api.post<{ data?: { users?: FeishuProjectUser[] } | FeishuProjectUser[]; users?: FeishuProjectUser[] }>(
    '/feishu/project/users/by-keys',
    { user_keys: userKeys }
  )

export const queryFeishuWorkItemDetails = (workItemTypeKey: string, workItemIds: Array<string | number>) =>
  api.post<FeishuWorkItemDetailResponse>(
    `/feishu/project/work-items/${workItemTypeKey}/query`,
    {
      work_item_ids: workItemIds,
      fields: ['name'],
    }
  )

export const getFeishuProjectPersonWorkHours = (params: Record<string, string>) =>
  api.get<FeishuPersonProjectWorkHourResponse>('/feishu/project/work-hours/by-person-project', { params })

export const getFeishuProjectDepartmentWorkHours = (params: Record<string, string>) =>
  api.get<FeishuDepartmentWorkHourResponse>('/feishu/project/work-hours', { params })

export interface WorkHourImportResult {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ index: number; reason: string }>
}

export const importWorkHourItems = (data: unknown) =>
  api.post<WorkHourImportResult>('/feishu/work-hours/import', data)

export const syncAllWorkHours = (workItemTypeKey?: string) =>
  api.post<WorkHourImportResult>('/feishu/work-hours/sync', { workItemTypeKey })

export const syncWorkHoursByDateRange = (startDate: string, endDate: string, workItemTypeKey?: string) =>
  api.post<WorkHourImportResult>('/feishu/work-hours/sync-range', { startDate, endDate, workItemTypeKey })

export const syncIncrementalWorkHours = (workItemTypeKey?: string) =>
  api.post<WorkHourImportResult>('/feishu/work-hours/sync-incremental', { workItemTypeKey })
