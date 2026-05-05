import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from './config'
import { initDb, getDb, closeDb } from './db'
import { seed } from './db/seed'
import { errorHandler } from './middleware/errorHandler'
import { authMiddleware } from './middleware/auth'

// 路由
import { authRouter } from './routes/auth'
import { seasonsRouter } from './routes/seasons'
import { usersRouter } from './routes/users'
import { scoresRouter } from './routes/scores'
import { scoringRouter } from './routes/scoring'
import { evidenceRouter } from './routes/evidence'
import { orgScoresRouter } from './routes/orgScores'
import { orgScoreAssistRouter } from './routes/orgScoreAssist'
import { feishuRouter } from './routes/feishu'
import { dimensionsRouter } from './routes/dimensions'
import { copilotkitRouter } from './routes/copilotkit'

const app = express()

// 安全中间件
app.use(helmet())
app.use(cors({ origin: config.clientUrl, credentials: true }))

// 限流：全局
const limiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true })
app.use('/api/', limiter)

// 限流：文件上传（更严格）
const uploadLimiter = rateLimit({ windowMs: 60_000, max: 20 })
app.use('/api/evidence/attachments', uploadLimiter)

// 限流：认证相关
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 })
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/callback', authLimiter)

// Body 解析
app.use(express.json({ limit: '5mb' }))

// API 路由
app.use('/api/auth', authRouter)
app.use('/api/seasons', seasonsRouter)
app.use('/api/users', usersRouter)
app.use('/api/scores', scoresRouter)
app.use('/api/scoring', scoringRouter)
app.use('/api/evidence', evidenceRouter)
app.use('/api/org-scores', orgScoresRouter)
app.use('/api/org-score-assist', orgScoreAssistRouter)
app.use('/api/feishu', feishuRouter)
app.use('/api/dimensions', dimensionsRouter)
app.use('/api/copilotkit', authMiddleware, copilotkitRouter)

// 健康检查
app.get('/api/health', async (_req, res) => {
  try {
    await getDb().queryOne('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected' })
  }
})

// 错误处理
app.use(errorHandler)

let server: ReturnType<typeof app.listen>

async function start() {
  // 校验必填环境变量
  const requiredEnvs = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'SESSION_SECRET']
  const missing = requiredEnvs.filter(k => !process.env[k])
  if (missing.length) {
    throw new Error(`缺少必填环境变量: ${missing.join(', ')}`)
  }

  await initDb()
  await seed()

  if (process.env.NODE_ENV === 'production') {
    const localhostUrls = ['http://localhost:3001', 'http://localhost:5173']
    if (localhostUrls.includes(config.siteUrl) || localhostUrls.includes(config.clientUrl)) {
      console.warn(
        'Production config reminder: please set SITE_URL and CLIENT_URL to your deployed backend and frontend URLs.'
      )
    }
  }

  server = app.listen(config.port, () => {
    console.log(`Server running at ${config.siteUrl}`)
  })
}

start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
})

// 优雅关停
let isShuttingDown = false

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`Received ${signal}, shutting down gracefully...`)

  const timeout = setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)

  server?.close(() => {
    clearTimeout(timeout)
    closeDb().then(() => process.exit(0)).catch(() => process.exit(1))
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

export { app, server }
