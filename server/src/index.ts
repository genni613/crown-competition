import express from 'express'
import { config } from './config'
import { initDb, closeDb } from './db'
import { seed } from './db/seed'
import { errorHandler } from './middleware/errorHandler'

// 路由
import { authRouter } from './routes/auth'
import { seasonsRouter } from './routes/seasons'
import { usersRouter } from './routes/users'
import { scoresRouter } from './routes/scores'
import { scoringRouter } from './routes/scoring'
import { evidenceRouter } from './routes/evidence'
import { orgScoresRouter } from './routes/orgScores'
import { feishuRouter } from './routes/feishu'
import { copilotkitRouter } from './routes/copilotkit'

const app = express()

// 中间件
app.use(express.json())

// API 路由
app.use('/api/auth', authRouter)
app.use('/api/seasons', seasonsRouter)
app.use('/api/users', usersRouter)
app.use('/api/scores', scoresRouter)
app.use('/api/scoring', scoringRouter)
app.use('/api/evidence', evidenceRouter)
app.use('/api/org-scores', orgScoresRouter)
app.use('/api/feishu', feishuRouter)
app.use(copilotkitRouter)

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// 错误处理
app.use(errorHandler)

let server: ReturnType<typeof app.listen>

async function start() {
  await initDb()
  await seed()

  server = app.listen(config.port, () => {
    console.log(`Server running at ${config.siteUrl}`)
  })
}

start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
})

process.on('SIGTERM', () => {
  if (server) {
    server.close()
  }
  void closeDb()
})

export { app, server }
