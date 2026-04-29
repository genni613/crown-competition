import express from 'express'
import { config } from './config'
import { getDb, closeDb } from './db'
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

// 初始化数据库
getDb()
seed()

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

// 启动服务
const server = app.listen(config.port, () => {
  console.log(`Server running at ${config.siteUrl}`)
})

process.on('SIGTERM', () => {
  server.close()
  closeDb()
})

export { app, server }
