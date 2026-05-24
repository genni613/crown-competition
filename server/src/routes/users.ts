import { Router, Request, Response } from 'express'
import { adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import {
  getAllUsers,
  getMemberDirectory,
  getMemberSeasonHistory,
  getUserById,
  updateMemberDirectoryJobRole,
  updateUser,
} from '../services/auth.service'

export const usersRouter = Router()

usersRouter.get('/member-directory', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined
  const jobRole = req.query.jobRole ? String(req.query.jobRole) as 'product' | 'design' | 'tech' | 'test' : undefined
  const department = req.query.department ? String(req.query.department) : undefined
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined
  const anomalyOnly = ['1', 'true'].includes(String(req.query.anomalyOnly || '').toLowerCase())

  res.json(await getMemberDirectory({
    seasonId: seasonId && !Number.isNaN(seasonId) ? seasonId : undefined,
    jobRole,
    department,
    keyword,
    anomalyOnly,
  }))
}))

usersRouter.get('/member-directory/:userKey/history', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userKey = String(req.params.userKey || '').trim()
  if (!userKey) {
    res.status(400).json({ error: '无效的 user_key' })
    return
  }

  res.json(await getMemberSeasonHistory(userKey))
}))

usersRouter.put('/member-directory/:userKey/job-role', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userKey = String(req.params.userKey || '').trim()
  if (!userKey) {
    res.status(400).json({ error: '无效的 user_key' })
    return
  }

  const { job_role, sub_role, syncDraftSeasonMembers } = req.body
  if (job_role !== null && job_role !== undefined && !['product', 'design', 'tech', 'test'].includes(job_role)) {
    res.status(400).json({ error: '无效的岗位' })
    return
  }
  if (sub_role !== null && sub_role !== undefined && !['client', 'frontend', 'backend'].includes(sub_role)) {
    res.status(400).json({ error: '无效的子岗位' })
    return
  }

  const user = await updateMemberDirectoryJobRole(userKey, {
    job_role: job_role ?? null,
    sub_role: sub_role ?? null,
    syncDraftSeasonMembers: Boolean(syncDraftSeasonMembers),
  })
  res.json(user)
}))

// GET /api/users — 用户列表
usersRouter.get('/', adminMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  res.json(await getAllUsers())
}))

// GET /api/users/:id — 用户详情
usersRouter.get('/:id', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = await getUserById(parseInt(req.params.id, 10))
  if (!user) { res.status(404).json({ error: '用户不存在' }); return }
  res.json(user)
}))

// PUT /api/users/:id — 编辑用户
usersRouter.put('/:id', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { role, job_role, sub_role } = req.body
  if (role && !['ADMIN', 'MEMBER'].includes(role)) {
    res.status(400).json({ error: '无效的角色' })
    return
  }
  if (job_role && !['product', 'design', 'tech', 'test'].includes(job_role)) {
    res.status(400).json({ error: '无效的岗位' })
    return
  }
  if (sub_role && !['client', 'frontend', 'backend'].includes(sub_role)) {
    res.status(400).json({ error: '无效的子岗位' })
    return
  }
  const user = await updateUser(parseInt(req.params.id, 10), { role, job_role, sub_role })
  res.json(user)
}))
