import { Router, Request, Response, NextFunction } from 'express'
import { adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { getDb } from '../db'

export const dimensionsRouter = Router()

// GET /api/dimensions — 查全部维度规则
dimensionsRouter.get('/', adminMiddleware, asyncHandler(async (_req, res) => {
  const db = getDb()
  const rows = await db.query('SELECT * FROM scoring_dimensions ORDER BY job_role, sort_order, id')
  res.json(rows)
}))

// PUT /api/dimensions/:id — 更新单条维度规则
dimensionsRouter.put('/:id', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!id) { res.status(400).json({ error: '无效 ID' }); return }

  const {
    dimension_weight,
    indicator_weight,
    threshold_100,
    threshold_60,
    deduction_per_unit,
    deduction_cap,
    deduction_divisor,
    sort_order,
  } = req.body

  const db = getDb()
  await db.execute(
    `UPDATE scoring_dimensions SET
      dimension_weight = COALESCE(?, dimension_weight),
      indicator_weight = COALESCE(?, indicator_weight),
      threshold_100 = ?,
      threshold_60 = ?,
      deduction_per_unit = ?,
      deduction_cap = ?,
      deduction_divisor = ?,
      sort_order = COALESCE(?, sort_order)
    WHERE id = ?`,
    [
      dimension_weight,
      indicator_weight,
      threshold_100,
      threshold_60,
      deduction_per_unit,
      deduction_cap,
      deduction_divisor,
      sort_order,
      id,
    ]
  )

  const updated = await db.queryOne('SELECT * FROM scoring_dimensions WHERE id = ?', [id])
  if (!updated) { res.status(404).json({ error: '维度规则不存在' }); return }
  res.json(updated)
}))
