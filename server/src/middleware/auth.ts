import { Request, Response, NextFunction } from 'express'
import { getIronSession } from 'iron-session'
import type { ServerResponse } from 'http'
import { sessionOptions, SessionData } from '../lib/session'
import { getDb } from '../db'

export async function getCurrentUser(req: Request): Promise<{ user: any; error?: string } | null> {
  const session = await getIronSession<SessionData>(req, resForSession(req), sessionOptions)
  if (!session.user?.id) return null

  // 从数据库实时读取 role
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id) as any
  if (!user) return null

  return { user }
}

// Helper to create a minimal response object for session operations
function resForSession(req: Request): ServerResponse {
  return {
    getHeader: () => undefined,
    setHeader: () => {},
  } as unknown as ServerResponse
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  if (!session.user?.id) {
    res.status(401).json({ error: '请先登录' })
    return
  }

  // 从数据库实时读取最新角色
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id) as any
  if (!user) {
    res.status(401).json({ error: '用户不存在' })
    return
  }

  req.currentUser = user
  next()
}

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  if (!session.user?.id) {
    res.status(401).json({ error: '请先登录' })
    return
  }

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id) as any
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ error: '需要管理员权限' })
    return
  }

  req.currentUser = user
  next()
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      currentUser?: any
    }
  }
}
