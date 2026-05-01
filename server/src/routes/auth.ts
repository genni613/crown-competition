import { Router, Request, Response } from 'express'
import { getIronSession } from 'iron-session'
import { getDb } from '../db'
import crypto from 'crypto'
import { feishuAuth } from '../lib/feishu'
import { sessionOptions, SessionData } from '../lib/session'
import { config } from '../config'
import { upsertUser } from '../services/auth.service'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'

export const authRouter = Router()

// GET /api/auth/login — 发起飞书 OAuth 登录
authRouter.get('/login', async (req: Request, res: Response) => {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  const state = crypto.randomBytes(16).toString('hex')
  session.state = state
  await session.save()

  const redirectUri = `${config.siteUrl}/api/auth/callback`
  const authorizeUrl = feishuAuth.getAuthorizeUrl(redirectUri, state)
  res.redirect(authorizeUrl)
})

// GET /api/auth/callback — 飞书回调
authRouter.get('/callback', asyncHandler(async (req: Request, res: Response) => {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  const { code, state } = req.query as { code?: string; state?: string }

  if (!code || !state) {
    res.status(400).json({ error: '缺少 code 或 state 参数' })
    return
  }

  // 校验 state 防 CSRF
  if (state !== session.state) {
    res.status(403).json({ error: 'State 校验失败' })
    return
  }
  session.state = undefined

  try {
    const result = await feishuAuth.loginWithCode(code)

    // 检查登录限制
    const allowed = await feishuAuth.checkLoginRestriction(
      (result as any).tenantKey,
      (result as any).departmentIds
    )
    if (!allowed) {
      res.status(403).json({ error: '您不在允许登录的范围内' })
      return
    }

    // 创建/更新本地用户
    const extra = result as any
    const user = await upsertUser({
      id: result.user.id,
      name: result.user.name,
      avatar_url: result.user.avatar_url,
      email: extra.email,
      department_id: extra.departmentIds?.[0],
      department_name: result.user.department_name,
      title: extra.title,
      role: result.user.role,
    })

    // 建立 Session
    session.user = {
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      department_name: user.department_name,
      role: user.role,
    }
    session.accessToken = result.accessToken
    session.refreshToken = result.refreshToken
    await session.save()

    res.redirect(new URL('/', config.clientUrl).toString())
  } catch (err: any) {
    console.error('Auth callback error:', err)
    res.status(500).json({ error: `登录失败: ${err.message}` })
  }
}))

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  session.destroy()
  res.json({ ok: true })
})

// GET /api/auth/me — 当前用户信息
authRouter.get('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  const currentUser = req.currentUser as any
  if (session.accessToken && currentUser && !currentUser.email) {
    try {
      let accessToken = session.accessToken
      let tokenUserInfo = await feishuAuth.getUserInfo(accessToken)
      if (!tokenUserInfo && session.refreshToken) {
        const refreshed = await feishuAuth.refreshUserAccessToken(session.refreshToken)
        accessToken = refreshed.access_token
        session.accessToken = accessToken
        session.refreshToken = refreshed.refresh_token
        await session.save()
        tokenUserInfo = await feishuAuth.getUserInfo(accessToken)
      }
      const userDetail = await feishuAuth.getUserDetail(tokenUserInfo.open_id)
      const updated = await upsertUser({
        id: currentUser.id,
        name: userDetail?.name || tokenUserInfo.name || currentUser.name,
        avatar_url: tokenUserInfo.avatar_middle || tokenUserInfo.avatar_url || currentUser.avatar_url,
        email: userDetail?.email || tokenUserInfo.email || null,
        department_id: userDetail?.department_ids?.[0],
        department_name: currentUser.department_name,
        title: userDetail?.title,
        role: currentUser.role,
      })
      req.currentUser = updated
      const fu = await getDb().queryOne<{ job_role: string | null }>('SELECT job_role FROM feishu_user WHERE user_key = ?', [updated.user_key])
      res.json({ user: { ...updated, feishu_job_role: fu?.job_role ?? null } })
      return
    } catch (error) {
      console.warn('Failed to refresh current user profile from Feishu:', error)
    }
  }
  const userKey = (req.currentUser as any)?.user_key
  let feishuJobRole: string | null = null
  if (userKey) {
    const fu = await getDb().queryOne<{ job_role: string | null }>('SELECT job_role FROM feishu_user WHERE user_key = ?', [userKey])
    feishuJobRole = fu?.job_role ?? null
  }
  res.json({ user: { ...req.currentUser, feishu_job_role: feishuJobRole } })
}))
