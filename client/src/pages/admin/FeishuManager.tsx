import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  DatePicker,
  Form,
  message,
  Popover,
  Select,
  Space,
  Table,
  Typography,
  Tabs,
} from 'antd'
import { UserOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  filterFeishuWorkItems,
  getFeishuProjectFields,
  getFeishuProjectPersonWorkHours,
  getFeishuProjectStatus,
  getFeishuProjectWorkItemTypes,
  getLocalFeishuUsers,
  getFeishuProjectUsersByKeys,
  getLocalPdSummary,
  importWorkHourItems,
  type LocalFeishuUser,
  type LocalPdSummaryResponse,
  syncAllWorkHours,
  syncIncrementalWorkHours,
  syncWorkHoursByDateRange,
  syncAllStories,
  syncIncrementalStories,
  syncStoriesByDateRange,
  syncAllIssues,
  syncIncrementalIssues,
  syncIssuesByDateRange,
  syncAllProjects,
  syncIncrementalProjects,
  syncProjectsByDateRange,
  syncAllUsers,
  queryFeishuWorkItemDetails,
  type FeishuProjectField,
  type FeishuRawFilterResponse,
  type FeishuProjectStatus,
  type FeishuProjectWorkItemType,
  type FeishuProjectUser,
  type FeishuPersonProjectWorkHourResponse,
  type LocalPdSummaryPerson,
  type WorkHourImportResult,
} from '../../api/feishu'
import { getUsers } from '../../api/users'
import type { User } from '../../types/models'

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function unwrapValue(value: unknown): any {
  if (Array.isArray(value)) {
    if (value.length === 1) return unwrapValue(value[0])
    return value.map(unwrapValue)
  }
  if (value && typeof value === 'object') {
    const item = value as Record<string, any>
    if ('default' in item) return item.default
    if ('zh_cn' in item) return item.zh_cn
    if ('en_us' in item) return item.en_us
    if ('value' in item) return item.value
    if ('field_value' in item) return item.field_value
    if ('fieldValue' in item) return item.fieldValue
    if ('text' in item) return item.text
    if ('name' in item) return item.name
    if ('label' in item) return item.label
    if ('display_name' in item) return item.display_name
    if ('displayName' in item) return item.displayName
    if ('timestamp' in item) return item.timestamp
    if ('date_value' in item) return item.date_value
    if ('dateValue' in item) return item.dateValue
  }
  return value
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
      field.alias === key
    )
    if (found) return found.value ?? found.field_value ?? found
  }
  return undefined
}

function readText(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const item = value as Record<string, unknown>
    const candidates = [
      item.default,
      item.zh_cn,
      item.en_us,
      item.option_name,
      item.optionName,
      item.full_name,
      item.fullName,
      item.path_name,
      item.pathName,
      item.title,
      item.simple_name,
      item.simpleName,
      item.text,
      item.label,
      item.display_name,
      item.displayName,
      item.name,
    ]
    const text = candidates.map(candidate => {
      if (candidate === value) return ''
      return readText(candidate)
    }).find(Boolean)
    if (text) return text
  }

  const raw = unwrapValue(value)
  if (raw == null) return ''
  if (Array.isArray(raw)) return raw.map(readText).filter(Boolean).join(', ')
  if (typeof raw === 'object') {
    const item = raw as Record<string, unknown>
    const candidates = [
      item.option_name,
      item.optionName,
      item.full_name,
      item.fullName,
      item.path_name,
      item.pathName,
      item.title,
      item.simple_name,
      item.simpleName,
      item.text,
      item.label,
      item.display_name,
      item.displayName,
      item.name,
    ]
    const text = candidates.map(readText).find(Boolean)
    if (text) return text

    if (Array.isArray(item.values)) return item.values.map(readText).filter(Boolean).join(', ')
    if (Array.isArray(item.options)) return item.options.map(readText).filter(Boolean).join(', ')
    if (Array.isArray(item.path)) return item.path.map(readText).filter(Boolean).join(' / ')
    if (Array.isArray(item.children)) return item.children.map(readText).filter(Boolean).join(' / ')

    return JSON.stringify(raw)
  }
  return String(raw)
}

interface OwnerEntity {
  id: string
  name: string
  avatarUrl?: string
}

interface ResolvedUser {
  id: string
  name: string
  avatarUrl?: string
}

interface RelationEntity {
  id: string
  name: string
}

function readOwners(value: unknown): OwnerEntity[] {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.flatMap(readOwners)
  if (typeof value === 'object') {
    const item = value as Record<string, any>
    const id = String(
      item.user_key ||
      item.userKey ||
      item.open_id ||
      item.openId ||
      item.id ||
      item.key ||
      ''
    )
    const name = String(
      item.name ||
      item.display_name ||
      item.displayName ||
      item.label ||
      id
    )
    const avatarUrl = String(
      item.avatar_url ||
      item.avatarUrl ||
      item.avatar_middle ||
      item.avatarMiddle ||
      item.avatar?.avatar_middle ||
      item.avatar?.avatarMiddle ||
      ''
    ) || undefined
    return id ? [{ id, name, avatarUrl }] : []
  }
  const raw = unwrapValue(value)
  if (Array.isArray(raw)) return raw.flatMap(readOwners)
  const text = String(raw)
  return text ? [{ id: text, name: text }] : []
}

function readOwnerNames(value: unknown): string {
  return readOwners(value).map(owner => owner.name).filter(Boolean).join(', ')
}

function normalizeResolvedUser(user: FeishuProjectUser): ResolvedUser | null {
  const id = String(user.user_key || user.userKey || user.key || '').trim()
  if (!id) return null
  const name = readText(user.name || user.display_name || user.displayName || id) || id
  const avatarUrl = readText(
    user.avatar_url ||
    user.avatar_middle ||
    user.avatar?.avatar_middle ||
    ''
  ) || undefined
  return { id, name, avatarUrl }
}

const extraFieldKeys = ['field_33cf4d', 'field_cfa724', 'field_2f6748'] as const
const WORK_ITEM_QUERY_LIMIT = 50
const PROJECT_WORK_ITEM_TYPE_KEY = '676ba5497a0d2d9faf21b715'

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function readRelations(value: unknown): RelationEntity[] {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.flatMap(readRelations)
  if (typeof value === 'object') {
    const item = value as Record<string, any>
    if (Array.isArray(item.items)) return item.items.flatMap(readRelations)
    if (Array.isArray(item.work_items)) return item.work_items.flatMap(readRelations)
    if (Array.isArray(item.relations)) return item.relations.flatMap(readRelations)

    const id = String(
      item.story_id ||
      item.project_id ||
      item.work_item_id ||
      item.workItemId ||
      item.id ||
      item.key ||
      item.value ||
      ''
    ).trim()
    const name = readText(
      item.name ||
      item.story_name ||
      item.project_name ||
      item.title ||
      item.simple_name ||
      item.display_name ||
      item.displayName ||
      item.label ||
      ''
    ).trim()

    if (id) return [{ id, name: name || id }]
  }

  const raw = unwrapValue(value)
  if (Array.isArray(raw)) return raw.flatMap(readRelations)
  const text = String(raw).trim()
  return text ? [{ id: text, name: text }] : []
}

function extractRelationIds(value: unknown): string[] {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.flatMap(extractRelationIds)
  if (typeof value === 'object') {
    const item = value as Record<string, any>
    if (Array.isArray(item.items)) return item.items.flatMap(extractRelationIds)
    if (Array.isArray(item.work_items)) return item.work_items.flatMap(extractRelationIds)
    if (Array.isArray(item.relations)) return item.relations.flatMap(extractRelationIds)

    const id = item.field_value ?? item.value ?? item.id ?? item.work_item_id ?? item.workItemId ?? item.story_id ?? item.project_id ?? item.key
    if (id != null && id !== '') return [String(id).trim()]
  }

  const raw = unwrapValue(value)
  if (Array.isArray(raw)) return raw.flatMap(extractRelationIds)
  const text = String(raw).trim()
  return text ? [text] : []
}

function renderRelatedWorkItem(record: any, fieldKey: string, resolvedNames: Map<string, string>) {
  const ids = extractRelationIds(fieldValue(record, fieldKey))
  if (ids.length === 0) return '-'
  const typeKey = fieldKey === 'field_33cf4d' ? PROJECT_WORK_ITEM_TYPE_KEY : 'story'
  return ids.map(id => {
    if (!typeKey) return id
    return resolvedNames.get(`${typeKey}:${id}`) || id
  }).filter(Boolean).join(', ')
}


function renderOwners(value: unknown, resolvedUsers: Map<string, ResolvedUser>) {
  const owners = readOwners(value).map(owner => {
    const resolved = resolvedUsers.get(owner.id)
    if (!resolved) return owner
    return {
      id: owner.id,
      name: owner.name === owner.id ? resolved.name : owner.name,
      avatarUrl: owner.avatarUrl || resolved.avatarUrl,
    }
  })
  if (owners.length === 0) return '-'

  return (
    <Space size={8} wrap>
      {owners.map(owner => (
        <span key={owner.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Avatar src={owner.avatarUrl} icon={<UserOutlined />} size="small" />
          <span>{owner.name}</span>
        </span>
      ))}
    </Space>
  )
}

function readDateText(value: unknown): string {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number') {
    const timestamp = raw < 10_000_000_000 ? raw * 1000 : raw
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
  }
  if (typeof raw === 'string') {
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
      const timestamp = numeric < 10_000_000_000 ? numeric * 1000 : numeric
      return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
    }
    const parsed = dayjs(raw)
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : raw
  }
  return readText(raw)
}

function readDateMs(value: unknown): number | null {
  const raw = unwrapValue(value)
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return raw < 10_000_000_000 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    }
    const parsed = dayjs(raw)
    return parsed.isValid() ? parsed.valueOf() : null
  }
  return null
}

export default function FeishuManager() {
  const { seasonId } = useParams()
  const [form] = Form.useForm()
  const [personForm] = Form.useForm()
  const [deptForm] = Form.useForm()
  const [status, setStatus] = useState<FeishuProjectStatus>()
  const [workItemTypes, setWorkItemTypes] = useState<FeishuProjectWorkItemType[]>([])
  const [fields, setFields] = useState<FeishuProjectField[]>([])
  const [result, setResult] = useState<FeishuRawFilterResponse>()
  const [personProjectResult, setPersonProjectResult] = useState<FeishuPersonProjectWorkHourResponse>()
  const [deptResult, setDeptResult] = useState<FeishuRawFilterResponse>()
  const [loading, setLoading] = useState(false)
  const [personLoading, setPersonLoading] = useState(false)
  const [deptLoading, setDeptLoading] = useState(false)
  const [deptNameFilter, setDeptNameFilter] = useState<string>()
  const [deptDateRange, setDeptDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>()
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [personDateRange, setPersonDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [resolvedUsers, setResolvedUsers] = useState<Map<string, ResolvedUser>>(new Map())
  const [resolvedRelatedNames, setResolvedRelatedNames] = useState<Map<string, string>>(new Map())
  const [users, setUsers] = useState<User[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<WorkHourImportResult>()
  const [importTypeKey, setImportTypeKey] = useState<string>()
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyResult, setStoryResult] = useState<WorkHourImportResult>()
  const [storyTypeKey, setStoryTypeKey] = useState<string>()
  const [importDateRange, setImportDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [storyDateRange, setStoryDateRange] = useState<[Dayjs, Dayjs] | null>(null)

  const [issueLoading, setIssueLoading] = useState(false)
  const [issueResult, setIssueResult] = useState<WorkHourImportResult>()
  const [issueTypeKey, setIssueTypeKey] = useState<string>()
  const [issueDateRange, setIssueDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectResult, setProjectResult] = useState<WorkHourImportResult>()
  const [projectTypeKey, setProjectTypeKey] = useState<string>()
  const [projectDateRange, setProjectDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [userLoading, setUserLoading] = useState(false)
  const [userResult, setUserResult] = useState<WorkHourImportResult>()
  const [pdSummaryLoading, setPdSummaryLoading] = useState(false)
  const [pdSummaryRange, setPdSummaryRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [pdSummaryProjectUserKey, setPdSummaryProjectUserKey] = useState<string>()
  const [feishuUsers, setFeishuUsers] = useState<LocalFeishuUser[]>([])
  const [pdSummaryResult, setPdSummaryResult] = useState<LocalPdSummaryResponse>()
  const selectedType = Form.useWatch('workItemTypeKey', form)
  const selectedPersonType = Form.useWatch('workItemTypeKey', personForm)
  const rawItems = useMemo(() => Array.isArray(result?.data) ? result.data : [], [result])
  const userFieldKey = status?.workHourUserField || 'owner'
  const hoursFieldKey = status?.workHourHoursField || 'field_1e956a'
  const dateFieldKey = status?.workHourDateField || 'field_11eb9f'

  useEffect(() => {
    void loadBootstrap()
  }, [])

  useEffect(() => {
    if (!selectedType) return
    void loadFields(selectedType)
  }, [selectedType])

  useEffect(() => {
    const ownerIds = Array.from(new Set(
      rawItems.flatMap(item => readOwners(fieldValue(item, userFieldKey)).map(owner => owner.id)).filter(Boolean)
    ))
    const unresolvedIds = ownerIds.filter(id => {
      const owner = rawItems
        .flatMap(item => readOwners(fieldValue(item, userFieldKey)))
        .find(candidate => candidate.id === id)
      return !owner || owner.name === id
    })

    if (unresolvedIds.length === 0) return

    let cancelled = false
    void (async () => {
      try {
        const res = await getFeishuProjectUsersByKeys(unresolvedIds)
        const payload = res.data?.data
        const users = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as any)?.users)
            ? (payload as any).users
            : Array.isArray(res.data?.users)
              ? res.data.users
              : []
        if (cancelled) return

        setResolvedUsers(prev => {
          const next = new Map(prev)
          for (const user of users) {
            const normalized = normalizeResolvedUser(user)
            if (normalized) next.set(normalized.id, normalized)
          }
          return next
        })
      } catch (error) {
        console.error('Failed to resolve project users by keys:', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rawItems, userFieldKey])

  useEffect(() => {
    if (rawItems.length === 0) return

    const idsByType = new Map<string, Set<string>>()
    for (const item of rawItems) {
      for (const fieldKey of ['field_33cf4d', 'field_cfa724'] as const) {
        const ids = extractRelationIds(fieldValue(item, fieldKey))
        if (ids.length === 0) continue
        const typeKey = fieldKey === 'field_33cf4d' ? PROJECT_WORK_ITEM_TYPE_KEY : 'story'
        let bucket = idsByType.get(typeKey)
        if (!bucket) {
          bucket = new Set<string>()
          idsByType.set(typeKey, bucket)
        }
        for (const id of ids) bucket.add(id)
      }
    }

    if (idsByType.size === 0) return

    let cancelled = false
    void (async () => {
      try {
        const resolved = new Map<string, string>()
        for (const [typeKey, idsSet] of idsByType.entries()) {
          const pendingIds = Array.from(idsSet).filter(id => !resolvedRelatedNames.has(`${typeKey}:${id}`))
          if (pendingIds.length === 0) continue
          const batches = chunkArray(pendingIds, WORK_ITEM_QUERY_LIMIT)
          for (const batch of batches) {
            try {
              const res = await queryFeishuWorkItemDetails(typeKey, batch)
              const items = Array.isArray(res.data?.items) ? res.data.items : []
              for (const item of items) {
                const id = String(item?.id ?? '').trim()
                const name = readText(item?.name ?? item?.title ?? '')
                if (id && name) resolved.set(`${typeKey}:${id}`, name)
              }
            } catch (error) {
              console.error('Failed to resolve relation work item batch:', {
                typeKey,
                batchSize: batch.length,
                ids: batch,
                error,
              })
            }
          }
        }
        if (cancelled || resolved.size === 0) return
        setResolvedRelatedNames(prev => new Map([...prev, ...resolved]))
      } catch {}
    })()

    return () => { cancelled = true }
  }, [rawItems, resolvedRelatedNames])

  async function loadBootstrap() {
    try {
      const [statusRes, typesRes, usersRes, feishuUsersRes] = await Promise.all([
        getFeishuProjectStatus(),
        getFeishuProjectWorkItemTypes(),
        getUsers(),
        getLocalFeishuUsers(),
      ])
      const enabledTypes = typesRes.data.filter(type => type.is_disable !== 1 && type.type_key)
      setStatus(statusRes.data)
      setWorkItemTypes(enabledTypes)
      setUsers(usersRes.data)
      setFeishuUsers(feishuUsersRes.data)
      const currentValue = form.getFieldValue('workItemTypeKey')
      if (!currentValue && enabledTypes[0]?.type_key) {
        form.setFieldsValue({ workItemTypeKey: enabledTypes[0].type_key })
      }
      const currentPersonTypeValue = personForm.getFieldValue('workItemTypeKey')
      if (!currentPersonTypeValue && statusRes.data.workHourType) {
        personForm.setFieldsValue({ workItemTypeKey: statusRes.data.workHourType })
      } else if (!currentPersonTypeValue && enabledTypes[0]?.type_key) {
        personForm.setFieldsValue({ workItemTypeKey: enabledTypes[0].type_key })
      }
      const currentDeptTypeValue = deptForm.getFieldValue('workItemTypeKey')
      if (!currentDeptTypeValue && statusRes.data.workHourType) {
        deptForm.setFieldsValue({ workItemTypeKey: statusRes.data.workHourType })
      } else if (!currentDeptTypeValue && enabledTypes[0]?.type_key) {
        deptForm.setFieldsValue({ workItemTypeKey: enabledTypes[0].type_key })
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '加载飞书配置失败')
    }
  }

  async function loadFields(workItemTypeKey: string) {
    try {
      const res = await getFeishuProjectFields(workItemTypeKey)
      setFields(res.data)
    } catch {
      setFields([])
    }
  }

  async function onSubmit(values: { workItemTypeKey: string }) {
    const body = {
      work_item_type_keys: [values.workItemTypeKey],
      fields: ['name', ...extraFieldKeys],
    }

    setLoading(true)
    try {
      const res = await filterFeishuWorkItems(body)
      setResult(res.data)
      message.success(`查询完成，共 ${Array.isArray(res.data.data) ? res.data.data.length : 0} 条工作项`)
    } catch (error: any) {
      message.error(error.response?.data?.error || '查询工作项失败')
    } finally {
      setLoading(false)
    }
  }

  async function onPersonProjectSubmit(values: { userId: string; workItemTypeKey: string; dateRange?: [Dayjs, Dayjs] }) {
    const startDate = values.dateRange?.[0]?.format('YYYY-MM-DD')
    const endDate = values.dateRange?.[1]?.format('YYYY-MM-DD')
    setPersonLoading(true)
    try {
      const res = await getFeishuProjectPersonWorkHours({
        userId: values.userId,
        workItemTypeKey: values.workItemTypeKey,
        startDate: startDate || '',
        endDate: endDate || '',
      })
      setPersonProjectResult(res.data)
      message.success(`统计完成，共 ${res.data.projectCount} 个关联项目`)
    } catch (error: any) {
      message.error(error.response?.data?.error || '统计个人工时失败')
    } finally {
      setPersonLoading(false)
    }
  }

  async function onDeptWorkHoursSubmit(values: { workItemTypeKey: string }) {
    setDeptLoading(true)
    try {
      const res = await filterFeishuWorkItems({
        work_item_type_keys: [values.workItemTypeKey],
        fields: ['name', ...extraFieldKeys],
      })
      setDeptResult(res.data)
      const count = Array.isArray(res.data.data) ? res.data.data.length : 0
      message.success(`查询完成，共 ${count} 条工时记录`)
    } catch (error: any) {
      message.error(error.response?.data?.error || '查询工时失败')
    } finally {
      setDeptLoading(false)
    }
  }

  const ownerOptions = useMemo(() => {
    const ownerMap = new Map<string, string>()
    for (const item of rawItems) {
      for (const owner of readOwners(fieldValue(item, userFieldKey))) {
        const resolved = resolvedUsers.get(owner.id)
        if (!ownerMap.has(owner.id)) ownerMap.set(owner.id, resolved?.name || owner.name)
      }
    }
    return Array.from(ownerMap.entries()).map(([value, label]) => ({ value, label }))
  }, [rawItems, userFieldKey, resolvedUsers])

  const localUserOptions = useMemo(() => {
    return users.map(user => ({
      value: user.id,
      label: `${user.name}${user.email ? ` (${user.email})` : ''}`,
    }))
  }, [users])

  const personProjectColumns = [
    {
      title: '关联项目',
      dataIndex: 'projectName',
      key: 'projectName',
      width: 260,
    },
    {
      title: '项目 ID',
      dataIndex: 'projectId',
      key: 'projectId',
      width: 200,
    },
    {
      title: '工时总和',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 160,
      render: (value: number) => `${Number(value || 0).toFixed(2)} h`,
    },
    {
      title: '工时条数',
      dataIndex: 'itemCount',
      key: 'itemCount',
      width: 120,
    },
  ]

  const pdSummaryColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '总 PD',
      dataIndex: 'total_pd',
      key: 'total_pd',
      width: 120,
      render: (value: number) => Number(value || 0).toFixed(2),
    },
    {
      title: '总工时',
      dataIndex: 'total_hours',
      key: 'total_hours',
      width: 120,
      render: (value: number) => `${Number(value || 0).toFixed(2)} h`,
    },
    {
      title: '项目数',
      key: 'project_count',
      width: 100,
      render: (_: unknown, record: LocalPdSummaryPerson) => {
        const names = record.project_names || []
        if (names.length === 0) return 0
        return (
          <Popover
            title={`关联项目（${names.length}）`}
            trigger="hover"
            content={
              <ul style={{ margin: 0, paddingLeft: 16, maxWidth: 300 }}>
                {names.map((name, i) => (
                  <li key={i} style={{ fontSize: 12, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</li>
                ))}
              </ul>
            }
          >
            <span style={{ cursor: 'pointer', color: '#1677ff' }}>{names.length}</span>
          </Popover>
        )
      },
    },
    {
      title: '需求数',
      key: 'requirement_count',
      width: 100,
      render: (_: unknown, record: LocalPdSummaryPerson) => {
        const names = record.requirement_names || []
        if (names.length === 0) return 0
        return (
          <Popover
            title={`关联需求（${names.length}）`}
            trigger="hover"
            content={
              <ul style={{ margin: 0, paddingLeft: 16, maxWidth: 300 }}>
                {names.map((name, i) => (
                  <li key={i} style={{ fontSize: 12, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</li>
                ))}
              </ul>
            }
          >
            <span style={{ cursor: 'pointer', color: '#1677ff' }}>{names.length}</span>
          </Popover>
        )
      },
    },
  ]

  const filteredItems = useMemo(() => {
    return rawItems.filter(item => {
      const owners = readOwners(fieldValue(item, userFieldKey))
      const dateMs = readDateMs(fieldValue(item, dateFieldKey))

      if (ownerFilter && !owners.some(owner => owner.id === ownerFilter)) return false
      if (dateRange?.[0] && dateRange?.[1]) {
        if (dateMs == null) return false
        const start = dateRange[0].startOf('day').valueOf()
        const end = dateRange[1].endOf('day').valueOf()
        if (dateMs < start || dateMs > end) return false
      }
      return true
    })
  }, [rawItems, ownerFilter, dateRange, userFieldKey, dateFieldKey])

  const fieldLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const field of fields) {
      const label = field.field_name || field.field_alias || field.field_key
      if (field.field_key && label) map.set(field.field_key, label)
      if (field.field_alias && label) map.set(field.field_alias, label)
    }
    return map
  }, [fields])

  const columns = [
    {
      title: fieldLabelMap.get('name') || '名称',
      dataIndex: 'name',
      width: 240,
      render: (_: unknown, record: any) => readText(fieldValue(record, 'name') ?? record.name ?? record.title),
    },
    {
      title: fieldLabelMap.get('field_33cf4d') || '关联项目',
      key: 'field_33cf4d',
      width: 220,
      render: (_: unknown, record: any) => renderRelatedWorkItem(record, 'field_33cf4d', resolvedRelatedNames),
    },
    {
      title: fieldLabelMap.get('field_cfa724') || '关联需求',
      key: 'field_cfa724',
      width: 220,
      render: (_: unknown, record: any) => renderRelatedWorkItem(record, 'field_cfa724', resolvedRelatedNames),
    },
    {
      title: fieldLabelMap.get(userFieldKey) || userFieldKey,
      key: userFieldKey,
      width: 220,
      render: (_: unknown, record: any) => renderOwners(fieldValue(record, userFieldKey), resolvedUsers),
    },
    {
      title: fieldLabelMap.get('field_2f6748') || '人员归属业务域',
      key: 'field_2f6748',
      width: 180,
      render: (_: unknown, record: any) => readText(fieldValue(record, 'field_2f6748')) || '-',
    },
    {
      title: fieldLabelMap.get(hoursFieldKey) || hoursFieldKey,
      key: hoursFieldKey,
      width: 180,
      render: (_: unknown, record: any) => readText(fieldValue(record, hoursFieldKey)) || '-',
    },
    {
      title: fieldLabelMap.get(dateFieldKey) || dateFieldKey,
      key: dateFieldKey,
      width: 180,
      render: (_: unknown, record: any) => readDateText(fieldValue(record, dateFieldKey)) || '-',
    },
  ]

  const rawDeptItems = useMemo(() => Array.isArray(deptResult?.data) ? deptResult.data : [], [deptResult])

  const deptOwnerOptions = useMemo(() => {
    const ownerMap = new Map<string, string>()
    for (const item of rawDeptItems) {
      for (const owner of readOwners(fieldValue(item, userFieldKey))) {
        const resolved = resolvedUsers.get(owner.id)
        if (!ownerMap.has(owner.id)) ownerMap.set(owner.id, resolved?.name || owner.name)
      }
    }
    return Array.from(ownerMap.entries()).map(([value, label]) => ({ value, label }))
  }, [rawDeptItems, userFieldKey, resolvedUsers])

  const filteredDeptItems = useMemo(() => {
    return rawDeptItems.filter(item => {
      const owners = readOwners(fieldValue(item, userFieldKey))
      const dateMs = readDateMs(fieldValue(item, dateFieldKey))

      if (deptNameFilter && !owners.some(owner => {
        const resolved = resolvedUsers.get(owner.id)
        const name = resolved?.name || owner.name
        return name === deptNameFilter
      })) return false
      if (deptDateRange?.[0] && deptDateRange?.[1]) {
        if (dateMs == null) return false
        const start = deptDateRange[0].startOf('day').valueOf()
        const end = deptDateRange[1].endOf('day').valueOf()
        if (dateMs < start || dateMs > end) return false
      }
      return true
    })
  }, [rawDeptItems, deptNameFilter, deptDateRange, userFieldKey, dateFieldKey, resolvedUsers])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            飞书工时工作项查询
          </Typography.Title>
          <Typography.Text type="secondary">
            当前页面包含三个标签：工作项查询、个人工时统计和全员工时汇总。
            {seasonId ? ` 当前入口赛季 ID: ${seasonId}` : ''}
          </Typography.Text>
          {status && (
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="已配置">{status.configured ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="project_key">{status.projectKey || '-'}</Descriptions.Item>
              <Descriptions.Item label="必填环境变量">{status.requiredEnv.join(', ')}</Descriptions.Item>
            </Descriptions>
          )}
          {status && !status.configured && (
            <Alert type="warning" showIcon message="飞书项目 OpenAPI 配置不完整" />
          )}
        </Space>
      </Card>

      <Tabs
        items={[
          {
            key: 'work-items',
            label: '工作项查询',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="查询">
                  <Form form={form} layout="vertical" onFinish={onSubmit}>
                    <Form.Item
                      name="workItemTypeKey"
                      label="工作项类型"
                      rules={[{ required: true, message: '请选择工作项类型' }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={workItemTypes
                          .filter(type => type.type_key)
                          .map(type => ({
                            label: `${type.name || type.type_key} (${type.type_key})`,
                            value: type.type_key,
                          }))}
                      />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      查询
                    </Button>
                  </Form>
                </Card>

                <Card title="实际请求体">
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {prettyJson({
                      work_item_type_keys: [
                        form.getFieldValue('workItemTypeKey'),
                      ],
                      fields: ['name', ...extraFieldKeys],
                    })}
                  </pre>
                </Card>

                <Card title="查询结果">
                  <Space style={{ marginBottom: 16 }} wrap>
                    <Select
                      allowClear
                      placeholder={`按 ${fieldLabelMap.get(userFieldKey) || userFieldKey} 筛选`}
                      style={{ width: 260 }}
                      value={ownerFilter}
                      onChange={value => setOwnerFilter(value)}
                      options={ownerOptions}
                    />
                    <DatePicker.RangePicker
                      value={dateRange}
                      onChange={value => setDateRange(value as [Dayjs, Dayjs] | null)}
                    />
                    <Button onClick={() => {
                      setOwnerFilter(undefined)
                      setDateRange(null)
                    }}>
                      清空筛选
                    </Button>
                    <Typography.Text type="secondary">
                      当前展示 {filteredItems.length} / {rawItems.length} 条
                    </Typography.Text>
                  </Space>
                  <Table
                    rowKey={(record) => String(record.work_item_id ?? record.id ?? Math.random())}
                    dataSource={filteredItems}
                    columns={columns}
                    loading={loading}
                    scroll={{ x: 1500 }}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>

                <Card title="原始响应" extra={
                  result ? (
                    <Button
                      size="small"
                      onClick={() => {
                        const blob = new Blob([prettyJson(result)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `feishu-response-${Date.now()}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      导出 JSON
                    </Button>
                  ) : null
                }>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {prettyJson(result || {})}
                  </pre>
                </Card>
              </Space>
            ),
          },
          {
            key: 'import',
            label: '工时同步',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="同步飞书工时数据到本地">
                  <Space direction="vertical" size={12}>
                    <Typography.Text type="secondary">
                      后端直接调用飞书 OpenAPI 拉取工时数据，解析后写入 feishu_workitem_gongshi 表。重复 work_item_id 会自动更新。
                    </Typography.Text>
                    <Space wrap align="start">
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>工作项类型</Typography.Text>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择工时工作项类型"
                          style={{ width: 320 }}
                          value={importTypeKey}
                          onChange={setImportTypeKey}
                          options={workItemTypes
                            .filter(type => type.type_key)
                            .map(type => ({
                              label: `${type.name || type.type_key} (${type.type_key})`,
                              value: type.type_key,
                            }))}
                        />
                      </div>
                    </Space>
                    <Space wrap>
                      <Button type="primary" loading={importLoading} disabled={!importTypeKey} onClick={async () => {
                        if (!importTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setImportLoading(true)
                        setImportResult(undefined)
                        try {
                          const res = await syncAllWorkHours(importTypeKey)
                          setImportResult(res.data)
                          message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setImportLoading(false)
                        }
                      }}>
                        全量同步
                      </Button>
                      <Button loading={importLoading} disabled={!importTypeKey} onClick={async () => {
                        if (!importTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setImportLoading(true)
                        setImportResult(undefined)
                        try {
                          const res = await syncIncrementalWorkHours(importTypeKey)
                          setImportResult(res.data)
                          message.success(`增量同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setImportLoading(false)
                        }
                      }}>
                        增量同步
                      </Button>
                    </Space>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>按时间段同步</Typography.Text>
                      <Space>
                        <DatePicker.RangePicker
                          value={importDateRange}
                          onChange={value => setImportDateRange(value as [Dayjs, Dayjs] | null)}
                        />
                        <Button loading={importLoading} disabled={!importTypeKey || !importDateRange} onClick={async () => {
                          if (!importTypeKey || !importDateRange) {
                            message.warning('请先选择工作项类型和时间范围')
                            return
                          }
                          setImportLoading(true)
                          setImportResult(undefined)
                          try {
                            const res = await syncWorkHoursByDateRange(
                              importDateRange[0].format('YYYY-MM-DD'),
                              importDateRange[1].format('YYYY-MM-DD'),
                              importTypeKey,
                            )
                            setImportResult(res.data)
                            message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                          } catch (err: any) {
                            message.error(err?.response?.data?.error || err?.message || '同步失败')
                          } finally {
                            setImportLoading(false)
                          }
                        }}>
                          按时间段同步
                        </Button>
                      </Space>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      全量同步：拉所有数据覆盖入库；增量同步：只拉比本地 update_time 更新的记录入库；按时间段同步：按工时工作时间字段 `field_11eb9f` 在飞书侧筛选后入库。
                    </Typography.Text>
                  </Space>
                </Card>

                {importResult && (
                  <Card title="同步结果">
                    <Descriptions size="small" column={4}>
                      <Descriptions.Item label="总条数">{importResult.total}</Descriptions.Item>
                      <Descriptions.Item label="新增">{importResult.inserted}</Descriptions.Item>
                      <Descriptions.Item label="更新">{importResult.updated}</Descriptions.Item>
                      <Descriptions.Item label="跳过">{importResult.skipped}</Descriptions.Item>
                    </Descriptions>
                    {importResult.errors.length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`${importResult.errors.length} 条数据同步失败`}
                        description={
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {importResult.errors.slice(0, 20).map((err, i) => (
                              <li key={i}>#{err.index}: {err.reason}</li>
                            ))}
                          </ul>
                        }
                      />
                    )}
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'pd-summary',
            label: 'PD 汇总',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="按时间范围统计每个人消耗的总 PD">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Typography.Text type="secondary">
                      基于本地表 `feishu_workitem_gongshi` 聚合 `pd_count`。时间字段口径为 `COALESCE(work_date, work_start_time, create_time, update_time)`。
                    </Typography.Text>
                    <Space wrap>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择飞书项目用户"
                        style={{ width: 320 }}
                        value={pdSummaryProjectUserKey}
                        onChange={value => setPdSummaryProjectUserKey(value)}
                        options={feishuUsers.map(user => ({
                          value: user.user_key,
                          label: `${user.name || user.user_key}${user.email ? ` (${user.email})` : ''}`,
                        }))}
                      />
                      <DatePicker.RangePicker
                        value={pdSummaryRange}
                        onChange={value => setPdSummaryRange(value as [Dayjs, Dayjs] | null)}
                      />
                      <Button
                        type="primary"
                        loading={pdSummaryLoading}
                        disabled={!pdSummaryRange}
                        onClick={async () => {
                          if (!pdSummaryRange) {
                            message.warning('请先选择时间范围')
                            return
                          }
                          setPdSummaryLoading(true)
                          try {
                            const res = await getLocalPdSummary({
                              startDate: pdSummaryRange[0].format('YYYY-MM-DD'),
                              endDate: pdSummaryRange[1].format('YYYY-MM-DD'),
                              projectUserKey: pdSummaryProjectUserKey,
                            })
                            setPdSummaryResult(res.data)
                            message.success(`统计完成，共 ${res.data.peopleCount} 人`)
                          } catch (err: any) {
                            message.error(err?.response?.data?.error || err?.message || '查询 PD 汇总失败')
                          } finally {
                            setPdSummaryLoading(false)
                          }
                        }}
                      >
                        查询
                      </Button>
                      <Button
                        onClick={() => {
                          setPdSummaryRange(null)
                          setPdSummaryProjectUserKey(undefined)
                          setPdSummaryResult(undefined)
                        }}
                      >
                        清空
                      </Button>
                    </Space>
                  </Space>
                </Card>

                {pdSummaryResult && (
                  <Card title="汇总结果">
                    <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
                      <Descriptions.Item label="开始日期">{pdSummaryResult.startDate}</Descriptions.Item>
                      <Descriptions.Item label="结束日期">{pdSummaryResult.endDate}</Descriptions.Item>
                      <Descriptions.Item label="用户 Key">{pdSummaryResult.projectUserKey || '全部'}</Descriptions.Item>
                      <Descriptions.Item label="人数">{pdSummaryResult.peopleCount}</Descriptions.Item>
                      <Descriptions.Item label="总 PD">{pdSummaryResult.totalPd.toFixed(2)}</Descriptions.Item>
                      <Descriptions.Item label="总工时">{pdSummaryResult.totalHours.toFixed(2)} h</Descriptions.Item>
                    </Descriptions>
                    <Table
                      rowKey={(record) => `${record.project_user_key}:${record.user_id || 'unknown'}`}
                      dataSource={pdSummaryResult.people}
                      columns={pdSummaryColumns}
                      loading={pdSummaryLoading}
                      scroll={{ x: 1700 }}
                      pagination={{ pageSize: 20 }}
                    />
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'story-sync',
            label: '需求同步',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="同步飞书需求数据到本地">
                  <Space direction="vertical" size={12}>
                    <Typography.Text type="secondary">
                      后端直接调用飞书 OpenAPI 拉取需求数据，解析后写入 feishu_workitem_story 表。重复 work_item_id 会自动更新。
                    </Typography.Text>
                    <Space wrap align="start">
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>工作项类型</Typography.Text>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择需求工作项类型"
                          style={{ width: 320 }}
                          value={storyTypeKey}
                          onChange={setStoryTypeKey}
                          options={workItemTypes
                            .filter(type => type.type_key)
                            .map(type => ({
                              label: `${type.name || type.type_key} (${type.type_key})`,
                              value: type.type_key,
                            }))}
                        />
                      </div>
                    </Space>
                    <Space wrap>
                      <Button type="primary" loading={storyLoading} disabled={!storyTypeKey} onClick={async () => {
                        if (!storyTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setStoryLoading(true)
                        setStoryResult(undefined)
                        try {
                          const res = await syncAllStories(storyTypeKey)
                          setStoryResult(res.data)
                          message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setStoryLoading(false)
                        }
                      }}>
                        全量同步
                      </Button>
                      <Button loading={storyLoading} disabled={!storyTypeKey} onClick={async () => {
                        if (!storyTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setStoryLoading(true)
                        setStoryResult(undefined)
                        try {
                          const res = await syncIncrementalStories(storyTypeKey)
                          setStoryResult(res.data)
                          message.success(`增量同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setStoryLoading(false)
                        }
                      }}>
                        增量同步
                      </Button>
                    </Space>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>按时间段同步</Typography.Text>
                      <Space>
                        <DatePicker.RangePicker
                          value={storyDateRange}
                          onChange={value => setStoryDateRange(value as [Dayjs, Dayjs] | null)}
                        />
                        <Button loading={storyLoading} disabled={!storyTypeKey || !storyDateRange} onClick={async () => {
                          if (!storyTypeKey || !storyDateRange) {
                            message.warning('请先选择工作项类型和时间范围')
                            return
                          }
                          setStoryLoading(true)
                          setStoryResult(undefined)
                          try {
                            const res = await syncStoriesByDateRange(
                              storyDateRange[0].format('YYYY-MM-DD'),
                              storyDateRange[1].format('YYYY-MM-DD'),
                              storyTypeKey,
                            )
                            setStoryResult(res.data)
                            message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                          } catch (err: any) {
                            message.error(err?.response?.data?.error || err?.message || '同步失败')
                          } finally {
                            setStoryLoading(false)
                          }
                        }}>
                          按时间段同步
                        </Button>
                      </Space>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      全量同步：拉所有数据覆盖入库；增量同步：只拉比本地 update_time 更新的记录入库；按时间段同步：只拉选定时间范围内的数据入库。
                    </Typography.Text>
                  </Space>
                </Card>

                {storyResult && (
                  <Card title="同步结果">
                    <Descriptions size="small" column={4}>
                      <Descriptions.Item label="总条数">{storyResult.total}</Descriptions.Item>
                      <Descriptions.Item label="新增">{storyResult.inserted}</Descriptions.Item>
                      <Descriptions.Item label="更新">{storyResult.updated}</Descriptions.Item>
                      <Descriptions.Item label="跳过">{storyResult.skipped}</Descriptions.Item>
                    </Descriptions>
                    {storyResult.errors.length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`${storyResult.errors.length} 条数据同步失败`}
                        description={
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {storyResult.errors.slice(0, 20).map((err, i) => (
                              <li key={i}>#{err.index}: {err.reason}</li>
                            ))}
                          </ul>
                        }
                      />
                    )}
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'issue-sync',
            label: '缺陷同步',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="同步飞书缺陷数据到本地">
                  <Space direction="vertical" size={12}>
                    <Typography.Text type="secondary">
                      后端直接调用飞书 OpenAPI 拉取缺陷数据，解析后写入 feishu_workitem_issue 表。重复 work_item_id 会自动更新。
                    </Typography.Text>
                    <Space wrap align="start">
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>工作项类型</Typography.Text>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择缺陷工作项类型"
                          style={{ width: 320 }}
                          value={issueTypeKey}
                          onChange={setIssueTypeKey}
                          options={workItemTypes
                            .filter(type => type.type_key)
                            .map(type => ({
                              label: `${type.name || type.type_key} (${type.type_key})`,
                              value: type.type_key,
                            }))}
                        />
                      </div>
                    </Space>
                    <Space wrap>
                      <Button type="primary" loading={issueLoading} disabled={!issueTypeKey} onClick={async () => {
                        if (!issueTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setIssueLoading(true)
                        setIssueResult(undefined)
                        try {
                          const res = await syncAllIssues(issueTypeKey)
                          setIssueResult(res.data)
                          message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setIssueLoading(false)
                        }
                      }}>
                        全量同步
                      </Button>
                      <Button loading={issueLoading} disabled={!issueTypeKey} onClick={async () => {
                        if (!issueTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setIssueLoading(true)
                        setIssueResult(undefined)
                        try {
                          const res = await syncIncrementalIssues(issueTypeKey)
                          setIssueResult(res.data)
                          message.success(`增量同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setIssueLoading(false)
                        }
                      }}>
                        增量同步
                      </Button>
                    </Space>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>按时间段同步</Typography.Text>
                      <Space>
                        <DatePicker.RangePicker
                          value={issueDateRange}
                          onChange={value => setIssueDateRange(value as [Dayjs, Dayjs] | null)}
                        />
                        <Button loading={issueLoading} disabled={!issueTypeKey || !issueDateRange} onClick={async () => {
                          if (!issueTypeKey || !issueDateRange) {
                            message.warning('请先选择工作项类型和时间范围')
                            return
                          }
                          setIssueLoading(true)
                          setIssueResult(undefined)
                          try {
                            const res = await syncIssuesByDateRange(
                              issueDateRange[0].format('YYYY-MM-DD'),
                              issueDateRange[1].format('YYYY-MM-DD'),
                              issueTypeKey,
                            )
                            setIssueResult(res.data)
                            message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                          } catch (err: any) {
                            message.error(err?.response?.data?.error || err?.message || '同步失败')
                          } finally {
                            setIssueLoading(false)
                          }
                        }}>
                          按时间段同步
                        </Button>
                      </Space>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      全量同步：拉所有数据覆盖入库；增量同步：只拉比本地 update_time 更新的记录入库；按时间段同步：只拉选定时间范围内的数据入库。
                    </Typography.Text>
                  </Space>
                </Card>

                {issueResult && (
                  <Card title="同步结果">
                    <Descriptions size="small" column={4}>
                      <Descriptions.Item label="总条数">{issueResult.total}</Descriptions.Item>
                      <Descriptions.Item label="新增">{issueResult.inserted}</Descriptions.Item>
                      <Descriptions.Item label="更新">{issueResult.updated}</Descriptions.Item>
                      <Descriptions.Item label="跳过">{issueResult.skipped}</Descriptions.Item>
                    </Descriptions>
                    {issueResult.errors.length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`${issueResult.errors.length} 条数据同步失败`}
                        description={
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {issueResult.errors.slice(0, 20).map((err, i) => (
                              <li key={i}>#{err.index}: {err.reason}</li>
                            ))}
                          </ul>
                        }
                      />
                    )}
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'project-sync',
            label: '项目同步',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="同步飞书项目数据到本地">
                  <Space direction="vertical" size={12}>
                    <Typography.Text type="secondary">
                      后端直接调用飞书 OpenAPI 拉取项目数据，解析后写入 feishu_workitem_project 表。重复 work_item_id 会自动更新。
                    </Typography.Text>
                    <Space wrap align="start">
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>工作项类型</Typography.Text>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择项目工作项类型"
                          style={{ width: 320 }}
                          value={projectTypeKey}
                          onChange={setProjectTypeKey}
                          options={workItemTypes
                            .filter(type => type.type_key)
                            .map(type => ({
                              label: `${type.name || type.type_key} (${type.type_key})`,
                              value: type.type_key,
                            }))}
                        />
                      </div>
                    </Space>
                    <Space wrap>
                      <Button type="primary" loading={projectLoading} disabled={!projectTypeKey} onClick={async () => {
                        if (!projectTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setProjectLoading(true)
                        setProjectResult(undefined)
                        try {
                          const res = await syncAllProjects(projectTypeKey)
                          setProjectResult(res.data)
                          message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setProjectLoading(false)
                        }
                      }}>
                        全量同步
                      </Button>
                      <Button loading={projectLoading} disabled={!projectTypeKey} onClick={async () => {
                        if (!projectTypeKey) {
                          message.warning('请先选择工作项类型')
                          return
                        }
                        setProjectLoading(true)
                        setProjectResult(undefined)
                        try {
                          const res = await syncIncrementalProjects(projectTypeKey)
                          setProjectResult(res.data)
                          message.success(`增量同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                        } catch (err: any) {
                          message.error(err?.response?.data?.error || err?.message || '同步失败')
                        } finally {
                          setProjectLoading(false)
                        }
                      }}>
                        增量同步
                      </Button>
                    </Space>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>按时间段同步</Typography.Text>
                      <Space>
                        <DatePicker.RangePicker
                          value={projectDateRange}
                          onChange={value => setProjectDateRange(value as [Dayjs, Dayjs] | null)}
                        />
                        <Button loading={projectLoading} disabled={!projectTypeKey || !projectDateRange} onClick={async () => {
                          if (!projectTypeKey || !projectDateRange) {
                            message.warning('请先选择工作项类型和时间范围')
                            return
                          }
                          setProjectLoading(true)
                          setProjectResult(undefined)
                          try {
                            const res = await syncProjectsByDateRange(
                              projectDateRange[0].format('YYYY-MM-DD'),
                              projectDateRange[1].format('YYYY-MM-DD'),
                              projectTypeKey,
                            )
                            setProjectResult(res.data)
                            message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                          } catch (err: any) {
                            message.error(err?.response?.data?.error || err?.message || '同步失败')
                          } finally {
                            setProjectLoading(false)
                          }
                        }}>
                          按时间段同步
                        </Button>
                      </Space>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      全量同步：拉所有数据覆盖入库；增量同步：只拉比本地 updated_at 更新的记录入库；按时间段同步：只拉选定时间范围内的数据入库。
                    </Typography.Text>
                  </Space>
                </Card>

                {projectResult && (
                  <Card title="同步结果">
                    <Descriptions size="small" column={4}>
                      <Descriptions.Item label="总条数">{projectResult.total}</Descriptions.Item>
                      <Descriptions.Item label="新增">{projectResult.inserted}</Descriptions.Item>
                      <Descriptions.Item label="更新">{projectResult.updated}</Descriptions.Item>
                      <Descriptions.Item label="跳过">{projectResult.skipped}</Descriptions.Item>
                    </Descriptions>
                    {projectResult.errors.length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`${projectResult.errors.length} 条数据同步失败`}
                        description={
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {projectResult.errors.slice(0, 20).map((err, i) => (
                              <li key={i}>#{err.index}: {err.reason}</li>
                            ))}
                          </ul>
                        }
                      />
                    )}
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'user-sync',
            label: '用户同步',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card title="同步飞书用户数据到本地">
                  <Space direction="vertical" size={12}>
                    <Typography.Text type="secondary">
                      后端调用飞书 OpenAPI 搜索租户内所有用户，解析后写入 feishu_user 表。重复 user_key 会自动更新。
                    </Typography.Text>
                    <Button type="primary" loading={userLoading} onClick={async () => {
                      setUserLoading(true)
                      setUserResult(undefined)
                      try {
                        const res = await syncAllUsers()
                        setUserResult(res.data)
                        message.success(`同步完成：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`)
                      } catch (err: any) {
                        message.error(err?.response?.data?.error || err?.message || '同步失败')
                      } finally {
                        setUserLoading(false)
                      }
                    }}>
                      全量同步
                    </Button>
                  </Space>
                </Card>

                {userResult && (
                  <Card title="同步结果">
                    <Descriptions size="small" column={4}>
                      <Descriptions.Item label="总条数">{userResult.total}</Descriptions.Item>
                      <Descriptions.Item label="新增">{userResult.inserted}</Descriptions.Item>
                      <Descriptions.Item label="更新">{userResult.updated}</Descriptions.Item>
                      <Descriptions.Item label="跳过">{userResult.skipped}</Descriptions.Item>
                    </Descriptions>
                    {userResult.errors.length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`${userResult.errors.length} 条数据同步失败`}
                        description={
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {userResult.errors.slice(0, 20).map((err, i) => (
                              <li key={i}>#{err.index}: {err.reason}</li>
                            ))}
                          </ul>
                        }
                      />
                    )}
                  </Card>
                )}
              </Space>
            ),
          },
        ]}
      />
    </Space>
  )
}
