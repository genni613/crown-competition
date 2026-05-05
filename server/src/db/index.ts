import fs from 'fs'
import path from 'path'
import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { config } from '../config'

type DbParams = any[]

function normalizeParams(params: DbParams): DbParams {
  return params.map(value => value === undefined ? null : value)
}

export interface DbExecutor {
  query<T>(sql: string, params?: DbParams): Promise<T[]>
  queryOne<T>(sql: string, params?: DbParams): Promise<T | undefined>
  execute(sql: string, params?: DbParams): Promise<ResultSetHeader>
}

let pool: Pool | undefined

function wrapExecutor(executor: Pool | PoolConnection): DbExecutor {
  return {
    async query<T>(sql: string, params: DbParams = []) {
      const [rows] = await executor.query<RowDataPacket[]>(sql, normalizeParams(params))
      return rows as T[]
    },
    async queryOne<T>(sql: string, params: DbParams = []) {
      const rows = await this.query<T>(sql, params)
      return rows[0]
    },
    async execute(sql: string, params: DbParams = []) {
      const [result] = await executor.execute<ResultSetHeader>(sql, normalizeParams(params))
      return result
    },
  }
}

async function applySchema(currentPool: Pool): Promise<void> {
  const distSchemaPath = path.resolve(__dirname, 'schema.mysql.sql')
  const srcSchemaPath = path.resolve(__dirname, '../../src/db/schema.mysql.sql')
  const schemaPath = fs.existsSync(srcSchemaPath) ? srcSchemaPath : distSchemaPath
  const schema = fs.readFileSync(schemaPath, 'utf-8')
  const statements = schema
    .split(/;\s*\n/g)
    .map(stmt => stmt.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await currentPool.query(statement)
  }

  await ensureEvidenceAuditColumns(currentPool)
  await ensureEvidenceReviewTable(currentPool)
  await ensureIssueDataSourceMigration(currentPool)
}

async function columnExists(currentPool: Pool, tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await currentPool.query<RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [config.mysql.database, tableName, columnName]
  )
  return rows.length > 0
}

async function ensureEvidenceAuditColumns(currentPool: Pool): Promise<void> {
  const tableName = 'evidence_submissions'
  const columnStatements: Array<{ name: string; sql: string }> = [
    {
      name: 'snapshot_json',
      sql: 'ALTER TABLE evidence_submissions ADD COLUMN snapshot_json JSON NULL AFTER attachment_urls',
    },
    {
      name: 'review_snapshot_json',
      sql: 'ALTER TABLE evidence_submissions ADD COLUMN review_snapshot_json JSON NULL AFTER review_comment',
    },
    {
      name: 'reviewed_at',
      sql: 'ALTER TABLE evidence_submissions ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by',
    },
  ]

  for (const column of columnStatements) {
    if (!(await columnExists(currentPool, tableName, column.name))) {
      await currentPool.query(column.sql)
    }
  }
}

async function tableExists(currentPool: Pool, tableName: string): Promise<boolean> {
  const [rows] = await currentPool.query<RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
     LIMIT 1`,
    [config.mysql.database, tableName]
  )
  return rows.length > 0
}

async function ensureIssueDataSourceMigration(currentPool: Pool): Promise<void> {
  const [rows] = await currentPool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM scoring_dimensions WHERE indicator_name = '线上问题系统解决数' AND data_source = 'feishu'`
  )
  if ((rows as any)[0]?.cnt > 0) {
    await currentPool.query(
      `UPDATE scoring_dimensions SET data_source = 'evidence' WHERE indicator_name = '线上问题系统解决数' AND data_source = 'feishu'`
    )
  }
}

async function ensureEvidenceReviewTable(currentPool: Pool): Promise<void> {
  if (await tableExists(currentPool, 'evidence_reviews')) {
    await ensureEvidenceReviewReviewerCollation(currentPool)
    return
  }

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS evidence_reviews (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      evidence_submission_id BIGINT NOT NULL,
      reviewer_id VARCHAR(191) NOT NULL,
      action ENUM('approved', 'rejected') NOT NULL,
      comment TEXT NULL,
      snapshot_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_evidence_reviews_submission (evidence_submission_id),
      KEY idx_evidence_reviews_reviewer (reviewer_id),
      CONSTRAINT fk_evidence_reviews_submission FOREIGN KEY (evidence_submission_id) REFERENCES evidence_submissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await ensureEvidenceReviewReviewerCollation(currentPool)
}

async function getColumnCollation(
  currentPool: Pool,
  tableName: string,
  columnName: string
): Promise<string | null> {
  const [rows] = await currentPool.query<RowDataPacket[]>(
    `SELECT COLLATION_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [config.mysql.database, tableName, columnName]
  )

  const value = rows[0]?.COLLATION_NAME
  return typeof value === 'string' && value ? value : null
}

async function ensureEvidenceReviewReviewerCollation(currentPool: Pool): Promise<void> {
  const usersIdCollation = await getColumnCollation(currentPool, 'users', 'id')
  const reviewerIdCollation = await getColumnCollation(currentPool, 'evidence_reviews', 'reviewer_id')

  if (!usersIdCollation || !reviewerIdCollation || usersIdCollation === reviewerIdCollation) {
    return
  }

  await currentPool.query(`
    ALTER TABLE evidence_reviews
    MODIFY reviewer_id VARCHAR(191)
    CHARACTER SET utf8mb4
    COLLATE ${usersIdCollation}
    NOT NULL
  `)
}

export async function initDb(): Promise<void> {
  if (pool) return

  pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: config.mysql.connectionLimit,
    queueLimit: 20,
    connectTimeout: 10000,
    charset: 'utf8mb4',
    decimalNumbers: true,
  })

  try {
    await pool.query('SELECT 1')
    await applySchema(pool)
  } catch (error) {
    await pool.end()
    pool = undefined

    if (error && typeof error === 'object' && 'code' in error) {
      const err = error as { code?: string; message?: string }
      if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        throw new Error(
          `MySQL 认证失败，请检查 .env 中的 MYSQL_USER/MYSQL_PASSWORD 或兼容别名 DB_USER/DB_PASSWORD。当前目标：${config.mysql.user}@${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`
        )
      }
      if (err.code === 'ER_BAD_DB_ERROR') {
        throw new Error(
          `MySQL 数据库不存在：${config.mysql.database}。请先创建库，或修改 .env 中的 MYSQL_DATABASE / DB_NAME。`
        )
      }
    }

    throw error
  }
}

export function getDb(): DbExecutor {
  if (!pool) {
    throw new Error('Database has not been initialized. Call initDb() first.')
  }
  return wrapExecutor(pool)
}

export async function withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error('Database has not been initialized. Call initDb() first.')
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await fn(wrapExecutor(connection))
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function closeDb(): Promise<void> {
  if (!pool) return
  await pool.end()
  pool = undefined
}
