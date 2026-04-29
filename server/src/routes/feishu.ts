import { Router, Request, Response, NextFunction } from 'express'
import { adminMiddleware } from '../middleware/auth'
import { config } from '../config'
import { feishuProject } from '../services/feishuProject.service'
import { queryDepartmentWorkHours, queryPersonProjectWorkHours } from '../services/feishuWorkHours.service'
import {
  expectedFeishuMetricNames,
  previewMemberFeishuData,
  syncMemberFeishuData,
  syncSeasonFeishuData,
} from '../services/feishuSync.service'

export const feishuRouter = Router()

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next)
  }
}

function extractWorkItems(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.data?.work_items)) return payload.data.work_items
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.work_items)) return payload.work_items
  return []
}

function extractWorkItemIds(items: any[]): Array<string | number> {
  return items
    .map(item => item?.id ?? item?.work_item_id ?? item?.workItemId)
    .filter((id): id is string | number => id != null && id !== '')
}

function normalizeExpand(expand: unknown) {
  return {
    relation_fields_detail: true,
    need_multi_text: true,
    need_user_detail: true,
    need_sub_task_parent: true,
    ...(expand && typeof expand === 'object' ? expand : {}),
  }
}

async function resolveWorkItemTypeQueryKey(inputKey: string): Promise<string> {
  const normalized = String(inputKey || '').trim()
  if (!normalized) return normalized

  try {
    const detail = await feishuProject.getWorkItemTypeDetail(normalized)
    const detailKey = String(detail.type_key || detail.api_name || '').trim()
    if (detailKey) return detailKey
  } catch {
    // ignore and fall back to the normalized key
  }

  return normalized
}

async function enrichProjectRelations(payload: any) {
  const items = extractWorkItems(payload)
  if (items.length === 0) return payload

  const relationTargets = new Map<string, Set<string>>()
  const detailTargets: Array<{
    item: any
    relationFieldKey: string
    details: any[]
  }> = []
  const debugSamples: Array<{
    itemId: string | number | null
    fieldKey: string
    relatedId: string
    relatedName: string
  }> = []

  const addTarget = (workItemTypeKey: string, workItemId: string) => {
    const typeKey = String(workItemTypeKey || '').trim()
    const id = String(workItemId || '').trim()
    if (!typeKey || !id) return
    if (!relationTargets.has(typeKey)) relationTargets.set(typeKey, new Set<string>())
    relationTargets.get(typeKey)!.add(id)
  }

  for (const item of items) {
    const details = Array.isArray(item?.relation_fields_detail) ? item.relation_fields_detail : []
    for (const entry of details) {
      if (entry?.field_key !== 'field_33cf4d') continue
      const detailList = Array.isArray(entry.detail) ? entry.detail : []
      const normalizedDetails = detailList
        .map((detail: any) => {
          const relatedId = String(
            detail?.field_value ??
            detail?.work_item_id ??
            detail?.workItemId ??
            detail?.story_id ??
            detail?.id ??
            ''
          ).trim()
          const workItemTypeKey = String(detail?.work_item_type_key || '').trim()
          if (relatedId && workItemTypeKey) addTarget(workItemTypeKey, relatedId)
          return relatedId ? {
            ...detail,
            id: relatedId,
            field_value: detail?.field_value ?? relatedId,
            work_item_id: relatedId,
            related_work_item_id: relatedId,
            work_item_type_key: workItemTypeKey || detail?.work_item_type_key,
          } : null
        })
        .filter((detail: Record<string, unknown> | null): detail is Record<string, unknown> => Boolean(detail))
      if (normalizedDetails.length > 0) {
        detailTargets.push({
          item,
          relationFieldKey: entry.field_key,
          details: normalizedDetails,
        })
      }
    }
  }

  if (relationTargets.size === 0) return payload

  const nameMaps = new Map<string, Map<string, string>>()

  for (const [workItemTypeKey, workItemIds] of relationTargets.entries()) {
    const ids = Array.from(workItemIds)
    const titleMap = new Map<string, string>()

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      try {
        const detail = await feishuProject.queryWorkItems(workItemTypeKey, {
          work_item_ids: batch,
          fields: ['name', 'title', 'simple_name', 'simpleName'],
          expand: {
            need_workflow: true,
            relation_fields_detail: true,
            need_multi_text: true,
            need_user_detail: true,
            need_sub_task_parent: true,
          },
        })
        const workItems = extractWorkItems(detail)
        for (const workItem of workItems) {
          const id = String(workItem?.id ?? workItem?.work_item_id ?? workItem?.workItemId ?? '').trim()
          if (!id) continue
          const title = String(
            workItem?.name ??
            workItem?.title ??
            workItem?.simple_name ??
            workItem?.simpleName ??
            id
          ).trim() || id
          titleMap.set(id, title)
        }
      } catch (error) {
        console.warn('[feishu-project] relation work item resolve failed', {
          workItemTypeKey,
          batchSize: batch.length,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    nameMaps.set(workItemTypeKey, titleMap)
  }

  for (const { item, details, relationFieldKey } of detailTargets) {
    const normalized = details
      .map((entry: any) => {
        const relatedId = String(
          entry?.field_value ??
          entry?.work_item_id ??
          entry?.workItemId ??
          entry?.id ??
          entry?.story_id ??
          ''
        ).trim()
        if (!relatedId) return null
        const workItemTypeKey = String(entry?.work_item_type_key || '').trim()
        const relatedName = (workItemTypeKey && nameMaps.get(workItemTypeKey)?.get(relatedId)) || relatedId
        return {
          ...entry,
          id: relatedId,
          field_value: entry?.field_value ?? relatedId,
          work_item_id: relatedId,
          related_work_item_id: relatedId,
          related_work_item_type_key: workItemTypeKey,
          name: relatedName,
          title: relatedName,
          related_work_item_name: relatedName,
        }
      })
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))

    if (normalized.length === 0) continue

    item[relationFieldKey] = normalized
    if (item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields)) {
      item.fields[relationFieldKey] = normalized
    }

    if (debugSamples.length < 5) {
      for (const entry of normalized) {
        debugSamples.push({
          itemId: item?.id ?? item?.work_item_id ?? item?.workItemId ?? null,
          fieldKey: relationFieldKey,
          relatedId: String(entry.id || ''),
          relatedName: String(entry.name || ''),
        })
        if (debugSamples.length >= 5) break
      }
    }
  }

  if (debugSamples.length > 0) {
    console.log('[feishu-project] relation project resolved', debugSamples)
  }

  return payload
}

// GET /api/feishu/project/status — 检查飞书项目 OpenAPI 配置
feishuRouter.get('/project/status', adminMiddleware, (req: Request, res: Response) => {
  res.json({
    configured: feishuProject.isConfigured(),
    projectKey: feishuProject.projectKey,
    workHourType: config.feishuProject.workHourType,
    workHourUserField: config.feishuProject.workHourUserField,
    workHourHoursField: config.feishuProject.workHourHoursField,
    workHourDateField: config.feishuProject.workHourDateField,
    workHourProjectField: config.feishuProject.workHourProjectField,
    workHourProjectType: config.feishuProject.workHourProjectType,
    requiredEnv: [
      'FEISHU_PROJECT_PLUGIN_ID',
      'FEISHU_PROJECT_PLUGIN_SECRET',
      'FEISHU_PROJECT_USER_KEY',
      'FEISHU_PROJECT_KEY',
    ],
  })
})

// GET /api/feishu/project-keys — 获取可访问空间 project_key 列表
feishuRouter.get('/project-keys', adminMiddleware, asyncHandler(async (_req, res) => {
  const projects = await feishuProject.listProjects()
  res.json(projects)
}))

// GET /api/feishu/project/work-hours — 按部门查询 gongshi 工时登记情况
feishuRouter.get('/project/work-hours', adminMiddleware, asyncHandler(async (req, res) => {
  const result = await queryDepartmentWorkHours({
    departmentName: String(req.query.department || ''),
    startDate: String(req.query.startDate || ''),
    endDate: String(req.query.endDate || ''),
    workItemTypeKey: String(req.query.workItemTypeKey || ''),
    userFieldKey: String(req.query.userFieldKey || ''),
    hoursFieldKey: String(req.query.hoursFieldKey || ''),
    dateFieldKey: String(req.query.dateFieldKey || ''),
  })
  res.json(result)
}))

// GET /api/feishu/project/work-hours/by-person-project — 按个人统计关联项目工时
feishuRouter.get('/project/work-hours/by-person-project', adminMiddleware, asyncHandler(async (req, res) => {
  const userId = String(req.query.userId || '').trim()
  if (!userId) {
    res.status(400).json({ error: '缺少 userId' })
    return
  }
  const result = await queryPersonProjectWorkHours({
    userId,
    startDate: String(req.query.startDate || ''),
    endDate: String(req.query.endDate || ''),
    workItemTypeKey: String(req.query.workItemTypeKey || ''),
    userFieldKey: String(req.query.userFieldKey || ''),
    hoursFieldKey: String(req.query.hoursFieldKey || ''),
    dateFieldKey: String(req.query.dateFieldKey || ''),
    projectFieldKey: String(req.query.projectFieldKey || ''),
    projectTypeKey: String(req.query.projectTypeKey || ''),
  })
  res.json(result)
}))

// GET /api/feishu/project/fields/:workItemTypeKey — 字段发现
feishuRouter.get('/project/fields/:workItemTypeKey', adminMiddleware, asyncHandler(async (req, res) => {
  const fields = await feishuProject.listFields(req.params.workItemTypeKey)
  res.json(fields.map(field => ({
    field_key: field.field_key,
    field_alias: field.field_alias,
    field_name: field.field_name,
    field_type_key: field.field_type_key,
  })))
}))

// GET /api/feishu/project/work-item-types — 获取空间下工作项类型
feishuRouter.get('/project/work-item-types', adminMiddleware, asyncHandler(async (_req, res) => {
  const types = await feishuProject.listWorkItemTypes()
  res.json(types.map(type => ({
    api_name: type.api_name,
    type_key: type.type_key,
    name: type.name,
    is_disable: type.is_disable,
    query_key: type.api_name || type.type_key,
  })))
}))

// GET /api/feishu/project/work-item-types/:workItemTypeKey — 获取单个工作项类型详情
feishuRouter.get('/project/work-item-types/:workItemTypeKey', adminMiddleware, asyncHandler(async (req, res) => {
  const detail = await feishuProject.getWorkItemTypeDetail(req.params.workItemTypeKey)
  res.json({
    api_name: detail.api_name,
    type_key: detail.type_key,
    name: detail.name,
    is_disable: detail.is_disable,
    raw: detail,
  })
}))

// POST /api/feishu/project/work-items/filter — 直接代理工作项筛选查询
feishuRouter.post('/project/work-items/filter', adminMiddleware, asyncHandler(async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? { ...req.body } : {}
  body.expand = normalizeExpand(body.expand)

  const raw = await feishuProject.listWorkItemsByFilter(body)
  res.json(raw)
}))

// GET /api/feishu/project/view-configs — 获取视图配置列表
feishuRouter.get('/project/view-configs', adminMiddleware, asyncHandler(async (req, res) => {
  const projectKey = String(req.query.projectKey || '').trim() || feishuProject.projectKey
  const views = await feishuProject.listViewConfigs(projectKey)
  res.json({
    projectKey,
    items: views,
  })
}))

// POST /api/feishu/project/work-items/:workItemTypeKey/query — 查询工作项详情/自定义字段
feishuRouter.post('/project/work-items/:workItemTypeKey/query', adminMiddleware, asyncHandler(async (req, res) => {
  const workItemTypeKey = String(req.params.workItemTypeKey || '').trim()
  if (!workItemTypeKey) {
    res.status(400).json({ error: '缺少 workItemTypeKey' })
    return
  }

  let resolvedQueryKey = workItemTypeKey
  let workItemTypeDetail: any = null
  try {
    workItemTypeDetail = await feishuProject.getWorkItemTypeDetail(workItemTypeKey)
    resolvedQueryKey = String(workItemTypeDetail.type_key || workItemTypeDetail.api_name || workItemTypeKey).trim()
  } catch {
    // typeKey 可能已经就是 api_name，直接用
  }
  resolvedQueryKey = await resolveWorkItemTypeQueryKey(resolvedQueryKey)
  console.log('[feishu-project] query work item resolved type', {
    inputKey: workItemTypeKey,
    detailApiName: workItemTypeDetail?.api_name ?? null,
    detailTypeKey: workItemTypeDetail?.type_key ?? null,
    resolvedQueryKey,
  })

  const body = (req.body && typeof req.body === 'object') ? { ...req.body } : {}
  let result: any
  let mode: 'detail' | 'list+detail' | 'view+detail' = 'list+detail'

  if (Array.isArray(body.work_item_ids) && body.work_item_ids.length > 0) {
    mode = 'detail'
    const detailBody = {
      ...body,
      expand: normalizeExpand(body.expand),
    }
    try {
      result = await feishuProject.queryWorkItems(resolvedQueryKey, detailBody)
      await enrichProjectRelations(result)
    } catch {
      res.json({ items: [], raw: null, mode: 'detail' })
      return
    }
  } else {
    if (!Array.isArray(body.work_item_type_keys) || body.work_item_type_keys.length === 0) {
      body.work_item_type_keys = [resolvedQueryKey]
    }
    if (!body.page_num) body.page_num = 1
    if (!body.page_size) body.page_size = 20
    const filterBody = {
      ...body,
      expand: normalizeExpand(body.expand),
    }
    const listResult = await feishuProject.listWorkItemsByFilter(filterBody)
    let listItems = extractWorkItems(listResult)
    let workItemIds = extractWorkItemIds(listItems)
    let searchResult: any = null
    let viewResult: any = null

    if (workItemIds.length === 0) {
      const searchBody = {
        page_num: body.page_num,
        page_size: body.page_size,
        fields: Array.isArray(body.fields) ? body.fields : undefined,
        expand: normalizeExpand(body.expand),
      }
      try {
        searchResult = await feishuProject.searchWorkItems(resolvedQueryKey, searchBody)
        listItems = extractWorkItems(searchResult)
        workItemIds = extractWorkItemIds(listItems)
      } catch {
      }
    }

    if (workItemIds.length === 0) {
      const fallbackViewId = typeof body.view_id === 'string' && body.view_id
        ? body.view_id
        : (workItemTypeKey === config.feishuProject.workHourType ? config.feishuProject.workHourViewId : '')

      if (fallbackViewId) {
        const viewBody = {
          page_num: body.page_num,
          page_size: body.page_size,
          fields: Array.isArray(body.fields) ? body.fields : undefined,
          expand: normalizeExpand(body.expand),
        }
        try {
          viewResult = await feishuProject.listWorkItemsByView(fallbackViewId, viewBody)
          listItems = extractWorkItems(viewResult)
          workItemIds = extractWorkItemIds(listItems)
          mode = 'view+detail'
        } catch {
        }
      }
    }

    if (workItemIds.length === 0) {
      res.json({
        items: [],
        raw: { list: listResult, search: searchResult, view: viewResult, detail: null },
        mode,
      })
      return
    }

    const fields = Array.isArray(body.fields) && body.fields.length > 0
      ? body.fields
      : (await feishuProject.listFields(workItemTypeKey))
        .map(field => field.field_key)
        .filter((key): key is string => Boolean(key))

    const detailBody = {
      work_item_ids: workItemIds,
      fields,
      expand: normalizeExpand(body.expand),
    }
    const detailResult = await feishuProject.queryWorkItems(resolvedQueryKey, detailBody)
    await enrichProjectRelations(detailResult)
    result = {
      resolvedWorkItemType: {
        input: workItemTypeKey,
        query_key: resolvedQueryKey,
        name: workItemTypeDetail.name,
        api_name: workItemTypeDetail.api_name,
        type_key: workItemTypeDetail.type_key,
      },
      list: listResult,
      search: searchResult,
      view: viewResult,
      detail: detailResult,
    }
  }

  res.json({
    items: mode === 'detail' ? extractWorkItems(result) : extractWorkItems(result.detail),
    raw: mode === 'detail'
      ? {
        resolvedWorkItemType: {
          input: workItemTypeKey,
          query_key: resolvedQueryKey,
          name: workItemTypeDetail.name,
          api_name: workItemTypeDetail.api_name,
          type_key: workItemTypeDetail.type_key,
        },
        detail: result,
      }
      : result,
    mode,
  })
}))

// GET /api/feishu/project/users/by-email?email=xxx — 用户映射联调
feishuRouter.get('/project/users/by-email', adminMiddleware, asyncHandler(async (req, res) => {
  const email = String(req.query.email || '')
  if (!email) {
    res.status(400).json({ error: '缺少 email' })
    return
  }
  const result = await feishuProject.queryUserByEmail(email)
  res.json(result)
}))

// POST /api/feishu/project/users/by-keys — 用 user_key 批量查询用户详情
feishuRouter.post('/project/users/by-keys', adminMiddleware, asyncHandler(async (req, res) => {
  const userKeys = Array.isArray(req.body?.user_keys)
    ? req.body.user_keys.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : []
  if (userKeys.length === 0) {
    res.status(400).json({ error: '缺少 user_keys' })
    return
  }
  const result = await feishuProject.queryUsersByKeys(userKeys)
  res.json(result)
}))

// GET /api/feishu/project/metrics/:jobRole — 查看当前岗位应写入的飞书指标
feishuRouter.get('/project/metrics/:jobRole', adminMiddleware, (req: Request, res: Response) => {
  const jobRole = req.params.jobRole
  if (!['product', 'design', 'tech'].includes(jobRole)) {
    res.status(400).json({ error: 'jobRole 必须是 product/design/tech' })
    return
  }
  res.json(expectedFeishuMetricNames(jobRole as any))
})

// GET /api/feishu/:seasonId/:userId/preview — 只取数和聚合，不落库
feishuRouter.get('/:seasonId/:userId/preview', adminMiddleware, asyncHandler(async (req, res) => {
  const preview = await previewMemberFeishuData(Number(req.params.seasonId), req.params.userId)
  res.json(preview)
}))

// POST /api/feishu/:seasonId/:userId/sync — 同步单人并触发整赛季重算
feishuRouter.post('/:seasonId/:userId/sync', adminMiddleware, asyncHandler(async (req, res) => {
  const result = await syncMemberFeishuData(Number(req.params.seasonId), req.params.userId)
  res.json(result)
}))

// POST /api/feishu/:seasonId/sync — 同步全赛季并触发整赛季重算
feishuRouter.post('/:seasonId/sync', adminMiddleware, asyncHandler(async (req, res) => {
  const result = await syncSeasonFeishuData(Number(req.params.seasonId))
  res.json(result)
}))
