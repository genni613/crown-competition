import admins from '../config/admins.json'

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'

interface FeishuTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface FeishuUserInfo {
  open_id: string
  name: string
  avatar_url?: string
  avatar_middle?: string
  email?: string
  mobile?: string
  tenant_key?: string
}

interface FeishuUserDetail {
  open_id: string
  name: string
  en_name?: string
  avatar?: { avatar_middle?: string }
  email?: string
  department_ids?: string[]
  title?: string
}

interface FeishuApiResponse<T = any> {
  code: number
  msg?: string
  data?: T
  app_access_token?: string
}

export class FeishuAuthService {
  private appId: string
  private appSecret: string

  constructor() {
    this.appId = process.env.FEISHU_APP_ID || ''
    this.appSecret = process.env.FEISHU_APP_SECRET || ''
  }

  private async getAppAccessToken(): Promise<string> {
    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/app_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    })
    const data = await response.json() as FeishuApiResponse
    if (data.code !== 0) {
      throw new Error(`Failed to get app_access_token: ${data.msg}`)
    }
    if (!data.app_access_token) throw new Error('Failed to get app_access_token: empty token')
    return data.app_access_token
  }

  getAuthorizeUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: redirectUri,
      state,
    })
    return `${FEISHU_API_BASE}/authen/v1/authorize?${params.toString()}`
  }

  async getUserAccessToken(code: string): Promise<FeishuTokenResponse> {
    const appAccessToken = await this.getAppAccessToken()
    const response = await fetch(`${FEISHU_API_BASE}/authen/v1/oidc/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appAccessToken}`,
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code }),
    })
    const data = await response.json() as FeishuApiResponse<FeishuTokenResponse>
    if (data.code !== 0) {
      throw new Error(`Feishu token exchange error: ${data.msg}`)
    }
    return data.data!
  }

  async getUserInfo(userAccessToken: string): Promise<FeishuUserInfo> {
    const response = await fetch(`${FEISHU_API_BASE}/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    })
    const data = await response.json() as FeishuApiResponse<FeishuUserInfo>
    if (data.code !== 0) {
      throw new Error(`Feishu user info error: ${data.msg}`)
    }
    return data.data!
  }

  async getUserDetail(openId: string): Promise<FeishuUserDetail | null> {
    if (!openId) return null
    const appAccessToken = await this.getAppAccessToken()
    const response = await fetch(
      `${FEISHU_API_BASE}/contact/v3/users/batch_get_id?user_id_type=open_id&department_id_type=open_department_id&open_ids=${openId}`,
      { headers: { Authorization: `Bearer ${appAccessToken}` } }
    )
    const data = await response.json() as FeishuApiResponse<{ user_list?: FeishuUserDetail[] }>
    if (data.code !== 0) return null
    const users = data.data?.user_list || []
    return users?.length > 0 ? users[0] : null
  }

  async getDepartmentName(departmentId: string): Promise<string | null> {
    if (!departmentId) return null
    const appAccessToken = await this.getAppAccessToken()
    const response = await fetch(
      `${FEISHU_API_BASE}/contact/v3/departments/${departmentId}?department_id_type=open_department_id`,
      { headers: { Authorization: `Bearer ${appAccessToken}` } }
    )
    const data = await response.json() as FeishuApiResponse<{ department?: { name?: string } }>
    if (data.code !== 0) return null
    return data.data?.department?.name || null
  }

  async getAllSubDepartmentIds(parentId: string): Promise<string[]> {
    const allIds: string[] = [parentId]
    try {
      const appAccessToken = await this.getAppAccessToken()
      const response = await fetch(
        `${FEISHU_API_BASE}/contact/v3/departments/${parentId}/children?department_id_type=open_department_id&page_size=50`,
        { headers: { Authorization: `Bearer ${appAccessToken}` } }
      )
      const data = await response.json() as FeishuApiResponse<{ items?: { open_department_id?: string }[] }>
      const items = data.data?.items || []
      if (data.code === 0 && items.length > 0) {
        for (const dept of items) {
          if (dept.open_department_id) {
            allIds.push(dept.open_department_id)
            const childIds = await this.getAllSubDepartmentIds(dept.open_department_id)
            allIds.push(...childIds)
          }
        }
      }
    } catch (e) {
      console.error('Failed to get sub-departments:', e)
    }
    return allIds
  }

  async loginWithCode(code: string): Promise<{
    user: { id: string; name: string; avatar_url?: string | null; department_name?: string | null; role: string }
    accessToken: string
    tenantKey?: string
    departmentIds?: string[]
    email?: string | null
    title?: string | null
  }> {
    // 1. 换取 user_access_token
    const tokenData = await this.getUserAccessToken(code)
    const userAccessToken = tokenData.access_token

    // 2. 获取用户基本信息
    const userInfo = await this.getUserInfo(userAccessToken)
    const openId = userInfo.open_id
    const tenantKey = userInfo.tenant_key
    if (!openId) throw new Error('Failed to get open_id from Feishu')

    // 3. 获取详细信息（含部门）
    const userDetail = await this.getUserDetail(openId)
    const departmentIds = userDetail?.department_ids || []
    let departmentName: string | null = null
    if (departmentIds.length > 0) {
      departmentName = await this.getDepartmentName(departmentIds[0])
    }

    // 4. 准备用户数据
    const name = userDetail?.name || userInfo.name || 'Unknown'
    const avatarUrl = userInfo.avatar_middle || userInfo.avatar_url || userDetail?.avatar?.avatar_middle
    const email = userDetail?.email || userInfo.email
    const title = userDetail?.title
    const departmentId = departmentIds[0]

    // 5. 确定角色（仅首次登录时使用配置，老用户保留数据库角色）
    const role = admins.admins.includes(openId) ? 'ADMIN' : 'MEMBER'

    return {
      user: {
        id: openId,
        name,
        avatar_url: avatarUrl,
        department_name: departmentName,
        role,
      },
      accessToken: userAccessToken,
      tenantKey,
      departmentIds,
      email,
      title,
    } as any
  }

  /** 检查登录限制 */
  async checkLoginRestriction(tenantKey?: string, departmentIds?: string[]): Promise<boolean> {
    const restriction = admins.loginRestriction
    if (restriction.mode === 'none') return true

    if (restriction.mode === 'organization') {
      if (!tenantKey) return false
      return (restriction.allowedTenants as string[]).includes(tenantKey)
    }

    if (restriction.mode === 'department') {
      if (!departmentIds?.length) return false
      // 获取所有允许部门及其子部门
      const allAllowed = new Set<string>()
      for (const deptId of restriction.allowedDepartments) {
        const ids = await this.getAllSubDepartmentIds(deptId)
        ids.forEach(id => allAllowed.add(id))
      }
      return departmentIds.some(id => allAllowed.has(id))
    }

    return true
  }
}

export const feishuAuth = new FeishuAuthService()
