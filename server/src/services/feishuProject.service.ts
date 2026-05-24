import { config } from '../config'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface ProjectApiOptions {
  baseUrl: string
  pluginId: string
  pluginSecret: string
  userKey: string
  projectKey: string
}

interface RequestOptions {
  method?: HttpMethod
  auth?: boolean
  body?: unknown
  query?: Record<string, string | number | undefined>
}

interface CachedToken {
  value: string
  expiresAt: number
}

interface CachedProjects {
  value: FeishuProjectSummary[]
  expiresAt: number
}

function summarizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 10
      ? { type: 'array', length: value.length, sample: value.slice(0, 10).map(summarizeValue) }
      : value.map(summarizeValue)
  }
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    const summary: Record<string, unknown> = {}
    for (const key of Object.keys(item).slice(0, 20)) {
      const current = item[key]
      if (Array.isArray(current)) {
        summary[key] = { type: 'array', length: current.length, sample: current.slice(0, 5).map(summarizeValue) }
      } else if (current && typeof current === 'object') {
        summary[key] = { type: 'object', keys: Object.keys(current as Record<string, unknown>).slice(0, 10) }
      } else {
        summary[key] = current
      }
    }
    return summary
  }
  return value
}

export interface FeishuProjectField {
  field_key?: string
  field_alias?: string
  field_name?: string
  field_type_key?: string
  [key: string]: unknown
}

export interface FeishuProjectWorkItemType {
  api_name?: string
  is_disable?: number
  type_key?: string
  name?: string
  [key: string]: unknown
}

export interface FeishuProjectViewConfig {
  id?: string
  view_id?: string
  name?: string
  view_name?: string
  [key: string]: unknown
}

export interface FeishuProjectSummary {
  project_key: string
  project_name?: string
  name?: string
  simple_name?: string
  simpleName?: string
  [key: string]: unknown
}

export class FeishuProjectService {
  private pluginToken?: CachedToken
  private projectsCache?: CachedProjects
  private _concurrencyQueue: Array<() => void> = []
  private _activeCount = 0
  private static readonly MAX_CONCURRENT = 5
  private static readonly MAX_RETRIES = 3

  private _rateLimitRemaining: number = 100
  private _rateLimitResetAt: number = 0
  private _rateLimitCancelling = false

  get rateLimitRemaining(): number { return this._rateLimitRemaining }
  get rateLimitResetAt(): number { return this._rateLimitResetAt }

  private async acquire(): Promise<void> {
    if (this._activeCount < FeishuProjectService.MAX_CONCURRENT) {
      this._activeCount++
      return
    }
    return new Promise<void>(resolve => this._concurrencyQueue.push(resolve))
  }

  private release(): void {
    const next = this._concurrencyQueue.shift()
    if (next) {
      next()
    } else {
      this._activeCount--
    }
  }

  private _parseRateLimitHeaders(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining')
      ?? response.headers.get('X-RateLimit-Remaining')
    if (remaining != null) {
      this._rateLimitRemaining = Number(remaining)
    }
    const reset = response.headers.get('x-ratelimit-reset')
      ?? response.headers.get('X-RateLimit-Reset')
    if (reset != null) {
      const val = Number(reset)
      this._rateLimitResetAt = val > 1e12 ? val : val * 1000
    }
  }

  async waitForBudget(needed: number = 1): Promise<void> {
    if (this._rateLimitCancelling) {
      throw new Error('同步已取消')
    }
    if (this._rateLimitRemaining >= needed) {
      this._rateLimitRemaining -= needed
      return
    }
    const waitMs = Math.max(this._rateLimitResetAt - Date.now(), 1000)
    console.log('[feishu-project] rate budget exhausted, waiting', { waitMs, remaining: this._rateLimitRemaining })
    await new Promise(r => setTimeout(r, waitMs))
    this._rateLimitRemaining = 100
  }

  cancelRateLimitWait(): void {
    this._rateLimitCancelling = true
  }

  resetRateLimitState(): void {
    this._rateLimitCancelling = false
    this._rateLimitRemaining = 100
    this._rateLimitResetAt = 0
  }

  constructor(private options: ProjectApiOptions = config.feishuProject) {}

  get projectKey(): string {
    return this.options.projectKey
  }

  isConfigured(): boolean {
    return Boolean(
      this.options.baseUrl &&
      this.options.pluginId &&
      this.options.pluginSecret &&
      this.options.userKey &&
      this.options.projectKey
    )
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        '飞书项目 OpenAPI 未配置完整，请检查 FEISHU_PROJECT_PLUGIN_ID、FEISHU_PROJECT_PLUGIN_SECRET、FEISHU_PROJECT_USER_KEY、FEISHU_PROJECT_KEY'
      )
    }
  }

  async getPluginToken(): Promise<string> {
    this.assertConfigured()
    if (this.pluginToken && Date.now() < this.pluginToken.expiresAt - 300_000) {
      return this.pluginToken.value
    }

    const data = await this.request('/open_api/authen/plugin_token', {
      method: 'POST',
      auth: false,
      body: {
        plugin_id: this.options.pluginId,
        plugin_secret: this.options.pluginSecret,
      },
    })

    const token = data.data?.token
    if (!token) throw new Error('飞书项目 plugin_token 响应缺少 data.token')

    const expireSeconds = Number(data.data?.expire_time || 7200)
    this.pluginToken = {
      value: token,
      expiresAt: Date.now() + expireSeconds * 1000,
    }
    return token
  }

  async request(path: string, init: RequestOptions = {}): Promise<any> {
    await this.acquire()
    try {
      return await this._requestWithRetry(path, init)
    } finally {
      this.release()
    }
  }

  private async _requestWithRetry(path: string, init: RequestOptions): Promise<any> {
    const maxRetries = FeishuProjectService.MAX_RETRIES
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (init.auth !== false) {
        headers['X-PLUGIN-TOKEN'] = await this.getPluginToken()
        headers['X-USER-KEY'] = this.options.userKey
      }

      const startedAt = Date.now()
      console.log('[feishu-project] request start', {
        method: init.method || 'GET',
        path,
        query: init.query || null,
        attempt,
      })

      const url = new URL(path, this.options.baseUrl)
      if (init.query) {
        for (const [key, value] of Object.entries(init.query)) {
          if (value != null && value !== '') url.searchParams.set(key, String(value))
        }
      }

      const response = await fetch(url.toString(), {
        method: init.method || 'GET',
        headers,
        body: init.body == null ? undefined : JSON.stringify(init.body),
      })

      this._parseRateLimitHeaders(response)

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfterMs = Number(response.headers.get('Retry-After') || 0) * 1000
          || Math.min(1000 * Math.pow(2, attempt), 10000)
        console.warn('[feishu-project] rate limited (429), retrying', {
          path,
          attempt: attempt + 1,
          retryAfterMs,
          retryAfterSec: response.headers.get('Retry-After'),
        })
        await new Promise(r => setTimeout(r, retryAfterMs))
        continue
      }

      const text = await response.text()
      let json: any
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(`飞书项目 API 返回非 JSON：${response.status} ${text.slice(0, 300)}`)
      }

      const code = json.err_code ?? json.error?.code
      if (!response.ok || (code != null && code !== 0)) {
        const message = json.err_msg || json.error?.msg || json.message || text
        console.warn('[feishu-project] request failed', {
          method: init.method || 'GET',
          path,
          status: response.status,
          ms: Date.now() - startedAt,
          code,
          message,
        })
        throw new Error(`飞书项目 API 调用失败：${response.status} ${message}`)
      }
      console.log('[feishu-project] request done', {
        method: init.method || 'GET',
        path,
        status: response.status,
        ms: Date.now() - startedAt,
        code: code ?? 0,
      })
      return json
    }
    throw new Error('unreachable')
  }

  async queryUserByEmail(email: string): Promise<any> {
    return this.request('/open_api/user/query', {
      method: 'POST',
      body: { emails: [email] },
    })
  }

  async queryUsersByKeys(userKeys: string[]): Promise<any> {
    const keys = Array.from(new Set(userKeys.map(item => item.trim()).filter(Boolean)))
    return this.request('/open_api/user/query', {
      method: 'POST',
      body: { user_keys: keys },
    })
  }

  async searchUsers(query?: string): Promise<any[]> {
    const body: Record<string, string> = {
      project_key: this.options.projectKey,
    }
    if (query) body.query = query

    const json = await this.request('/open_api/user/search', {
      method: 'POST',
      body,
    })
    return this.extractList(json, ['data', 'users', 'list'])
  }

  async queryUsersByOutIds(outIds: string[]): Promise<any> {
    const ids = Array.from(new Set(outIds.map(item => item.trim()).filter(Boolean)))
    return this.request('/open_api/user/query', {
      method: 'POST',
      body: { out_ids: ids },
    })
  }

  private normalizeProjectSummary(item: unknown): FeishuProjectSummary | null {
    if (!item || typeof item !== 'object') {
      if (typeof item === 'string' && item.trim()) {
        return { project_key: item.trim() }
      }
      return null
    }

    const raw = item as Record<string, unknown>
    const projectKey = String(
      raw.project_key ??
      raw.projectKey ??
      raw.key ??
      raw.id ??
      ''
    ).trim()
    if (!projectKey) return null

    const projectName = String(
      raw.project_name ??
      raw.projectName ??
      raw.name ??
      raw.simple_name ??
      raw.simpleName ??
      raw.display_name ??
      raw.displayName ??
      ''
    ).trim()

    return {
      ...raw,
      project_key: projectKey,
      ...(projectName ? { project_name: projectName } : {}),
    } as FeishuProjectSummary
  }

  async listProjects(): Promise<FeishuProjectSummary[]> {
    if (this.projectsCache && Date.now() < this.projectsCache.expiresAt - 300_000) {
      return this.projectsCache.value
    }

    const json = await this.request('/open_api/projects', {
      method: 'POST',
      body: {},
    })
    const projectKeys = this.extractList(json, ['items', 'projects', 'list'])
    const projects = projectKeys
      .map(item => this.normalizeProjectSummary(item))
      .filter((item): item is FeishuProjectSummary => Boolean(item))

    this.projectsCache = {
      value: projects,
      expiresAt: Date.now() + 30 * 60 * 1000,
    }

    return projects
  }

  async resolveProjectName(projectKey: string): Promise<string | null> {
    const normalized = String(projectKey || '').trim()
    if (!normalized) return null
    const projects = await this.listProjects()
    const project = projects.find(item => item.project_key === normalized)
    return String(
      project?.project_name ??
      project?.name ??
      project?.simple_name ??
      project?.simpleName ??
      ''
    ).trim() || null
  }

  async listWorkItemTypes(): Promise<FeishuProjectWorkItemType[]> {
    const json = await this.request(`/open_api/${this.options.projectKey}/work_item/all-types`)
    return this.extractList(json, ['items', 'types', 'work_item_types'])
  }

  async getWorkItemTypeDetail(workItemTypeKey: string): Promise<FeishuProjectWorkItemType> {
    const json = await this.request(`/open_api/${this.options.projectKey}/work_item/type/${workItemTypeKey}`)
    return json?.data || {}
  }

  async listViewConfigs(projectKey: string = this.options.projectKey): Promise<FeishuProjectViewConfig[]> {
    const json = await this.request(`/open_api/${projectKey}/view_conf/list`, {
      method: 'POST',
      body: {},
    })
    return this.extractList(json, ['items', 'view_configs', 'views', 'list'])
  }

  async listFields(workItemTypeKey: string): Promise<FeishuProjectField[]> {
    const bodyJson = await this.request(`/open_api/${this.options.projectKey}/field/all`, {
      method: 'POST',
      body: { work_item_type_key: workItemTypeKey },
    })
    const bodyFields = this.extractList(bodyJson, ['fields', 'items', 'field_list', 'field_infos'])
    if (bodyFields.length > 0) return bodyFields

    const queryJson = await this.request(`/open_api/${this.options.projectKey}/field/all`, {
      method: 'POST',
      query: { work_item_type_key: workItemTypeKey },
      body: {},
    })
    return this.extractList(queryJson, ['fields', 'items', 'field_list', 'field_infos'])
  }

  private extractList(json: any, keys: string[]): any[] {
    if (Array.isArray(json?.data)) return json.data
    for (const key of keys) {
      if (Array.isArray(json?.data?.[key])) return json.data[key]
      if (Array.isArray(json?.[key])) return json[key]
    }
    return []
  }

  async listWorkItemsByFilter(body: unknown): Promise<any> {
    return this.request(`/open_api/${this.options.projectKey}/work_item/filter`, {
      method: 'POST',
      body,
    })
  }

  async listAllWorkItemsByFilter(body: Record<string, any>): Promise<any[]> {
    const pageSize = config.feishuProject.pageSize
    const all: any[] = []
    let pageNum = 1

    while (true) {
      const json = await this.listWorkItemsByFilter({
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
      const items = this.extractList(json, ['items', 'work_items', 'work_item_list'])
      all.push(...items)

      const pagination = json?.pagination || json?.data?.pagination
      const total = Number(pagination?.total || json?.data?.total || 0)
      const hasMore = typeof pagination?.has_more === 'boolean'
        ? pagination.has_more
        : total > pageNum * pageSize && items.length > 0
      if (!hasMore) break
      pageNum += 1
    }

    return all
  }

  async listAllWorkItemsByFilterVariants(bodies: Record<string, any>[]): Promise<{ items: any[]; variantIndex: number }> {
    let lastItems: any[] = []
    let lastError: unknown
    for (let i = 0; i < bodies.length; i++) {
      try {
        const items = await this.listAllWorkItemsByFilter(bodies[i])
        if (items.length > 0) return { items, variantIndex: i }
        lastItems = items
      } catch (error) {
        lastError = error
      }
    }
    if (lastItems.length === 0 && lastError && bodies.length === 1) throw lastError
    return { items: lastItems, variantIndex: bodies.length - 1 }
  }

  async listWorkItemsByView(viewId: string, body: unknown): Promise<any> {
    return this.request(`/open_api/${this.options.projectKey}/view/${viewId}`, {
      method: 'POST',
      body,
    })
  }

  async listAllWorkItemsByView(viewId: string, body: Record<string, any>): Promise<any[]> {
    const pageSize = config.feishuProject.pageSize
    const all: any[] = []
    let pageNum = 1

    while (true) {
      const json = await this.listWorkItemsByView(viewId, {
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
      const items = this.extractList(json, ['items', 'work_items', 'work_item_list'])
      all.push(...items)

      const pagination = json?.pagination || json?.data?.pagination
      const total = Number(pagination?.total || json?.data?.total || 0)
      const hasMore = typeof pagination?.has_more === 'boolean'
        ? pagination.has_more
        : total > pageNum * pageSize && items.length > 0
      if (!hasMore) break
      pageNum += 1
    }

    return all
  }

  async searchWorkItems(workItemTypeKey: string, body: unknown): Promise<any> {
    return this.request(
      `/open_api/${this.options.projectKey}/work_item/${workItemTypeKey}/search/params`,
      { method: 'POST', body }
    )
  }

  async queryWorkItems(workItemTypeKey: string, body: unknown): Promise<any> {
    return this.request(
      `/open_api/${this.options.projectKey}/work_item/${workItemTypeKey}/query`,
      { method: 'POST', body }
    )
  }

  async searchAllWorkItems(workItemTypeKey: string, body: Record<string, any>): Promise<any[]> {
    const pageSize = Math.min(config.feishuProject.pageSize, 50)
    const all: any[] = []
    let pageNum = 1

    while (true) {
      const json = await this.searchWorkItems(workItemTypeKey, {
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
      const items = this.extractList(json, ['items', 'work_items', 'work_item_list'])
      all.push(...items)

      const pagination = json?.pagination || json?.data?.pagination
      const total = Number(pagination?.total || json?.data?.total || 0)
      const hasMore = typeof pagination?.has_more === 'boolean'
        ? pagination.has_more
        : total > pageNum * pageSize && items.length > 0
      if (!hasMore) break
      pageNum += 1
    }

    return all
  }

  async searchAllWorkItemsByCreatedAt(workItemTypeKey: string, body: Record<string, any>): Promise<any[]> {
    const nowWithBuffer = Date.now() + 86_400_000
    return this.searchAllWorkItems(workItemTypeKey, {
      ...body,
      search_group: {
        conjunction: 'AND',
        search_params: [
          { param_key: 'created_at', operator: 'BETWEEN', value: [0, nowWithBuffer] },
        ],
      },
    })
  }
}

export const feishuProject = new FeishuProjectService()
