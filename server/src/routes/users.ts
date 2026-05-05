import { Router, Request, Response } from 'express'
import { adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { getAllUsers, getUserById, updateUser } from '../services/auth.service'

export const usersRouter = Router()

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
  const { role, job_role } = req.body
  if (role && !['ADMIN', 'MEMBER'].includes(role)) {
    res.status(400).json({ error: '无效的角色' })
    return
  }
  if (job_role && !['product', 'design', 'tech'].includes(job_role)) {
    res.status(400).json({ error: '无效的岗位' })
    return
  }
  const user = await updateUser(parseInt(req.params.id, 10), { role, job_role })
  res.json(user)
}))
