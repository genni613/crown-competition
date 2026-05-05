import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) {
  console.error('Unhandled error:', err)
  const status = err.status ?? 500
  res.status(status).json({
    error: (status === 500 && process.env.NODE_ENV === 'production') ? 'Internal server error' : err.message,
  })
}
