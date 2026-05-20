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
  await ensureFkColumnTypes(currentPool)
  await ensureUsersCollation(currentPool)
  await checkOrphanedMembers(currentPool)
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
    return
  }

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS evidence_reviews (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      evidence_submission_id BIGINT NOT NULL,
      reviewer_id BIGINT NOT NULL,
      action ENUM('approved', 'rejected') NOT NULL,
      comment TEXT NULL,
      snapshot_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_evidence_reviews_submission (evidence_submission_id),
      KEY idx_evidence_reviews_reviewer (reviewer_id),
      CONSTRAINT fk_evidence_reviews_submission FOREIGN KEY (evidence_submission_id) REFERENCES evidence_submissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function getColumnType(
  currentPool: Pool,
  tableName: string,
  columnName: string
): Promise<string | null> {
  const [rows] = await currentPool.query<RowDataPacket[]>(
    `SELECT DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [config.mysql.database, tableName, columnName]
  )
  const value = rows[0]?.DATA_TYPE
  return typeof value === 'string' && value ? value : null
}

async function migrateFkColumn(
  currentPool: Pool,
  table: string,
  column: string,
  nullable: boolean,
  fkName: string
): Promise<void> {
  const colType = await getColumnType(currentPool, table, column)
  if (!colType || colType === 'bigint') return

  const tempCol = `new_${column}`
  const colDef = nullable ? 'BIGINT NULL' : 'BIGINT NOT NULL'

  try {
    await currentPool.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fkName}`)
  } catch {
    // FK may not exist
  }

  await currentPool.query(`ALTER TABLE ${table} ADD COLUMN ${tempCol} ${colDef} AFTER ${column}`)
  await currentPool.query(`UPDATE ${table} t JOIN users u ON t.${column} = u.id SET t.${tempCol} = u.id`)
  await currentPool.query(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  await currentPool.query(`ALTER TABLE ${table} CHANGE COLUMN ${tempCol} ${column} ${colDef}`)

  try {
    await currentPool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${fkName} FOREIGN KEY (${column}) REFERENCES users(id)`)
  } catch {
    // FK creation may fail if data has orphans, non-blocking
  }

  console.log(`[DB] Migrated ${table}.${column}: VARCHAR → BIGINT`)
}

async function ensureFkColumnTypes(currentPool: Pool): Promise<void> {
  if (!(await tableExists(currentPool, 'org_scores'))) return

  await migrateFkColumn(currentPool, 'org_scores', 'submitted_by', true, 'fk_org_scores_submitted_by')
  await migrateFkColumn(currentPool, 'org_scores', 'reviewed_by', true, 'fk_org_scores_reviewed_by')

  if (await tableExists(currentPool, 'evidence_reviews')) {
    await migrateFkColumn(currentPool, 'evidence_reviews', 'reviewer_id', false, 'fk_evidence_reviews_reviewer')
  }
}

async function checkOrphanedMembers(currentPool: Pool): Promise<void> {
  if (!(await tableExists(currentPool, 'season_members'))) return

  const [rows] = await currentPool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM season_members sm
     LEFT JOIN feishu_user fu ON sm.user_key = fu.user_key
     WHERE fu.user_key IS NULL`
  )

  const orphaned = (rows[0] as RowDataPacket)?.cnt ?? 0
  if (orphaned > 0) {
    console.warn(`[DB] WARNING: ${orphaned} season_members rows have user_key not found in feishu_user`)
  }
}

async function ensureUsersCollation(currentPool: Pool): Promise<void> {
  const varcharColumns: Array<{ column: string; definition: string }> = [
    { column: 'open_id', definition: 'VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL' },
    { column: 'user_key', definition: 'VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
    { column: 'name', definition: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL' },
    { column: 'avatar_url', definition: 'TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
    { column: 'email', definition: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
    { column: 'department_id', definition: 'VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
    { column: 'department_name', definition: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
    { column: 'title', definition: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
  ]

  let fixed = 0
  for (const { column, definition } of varcharColumns) {
    const col = await getColumnType(currentPool, 'users', column)
    if (col) {
      const [rows] = await currentPool.query<RowDataPacket[]>(
        `SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ? LIMIT 1`,
        [config.mysql.database, column]
      )
      const collation = (rows[0] as RowDataPacket)?.COLLATION_NAME
      if (collation && collation !== 'utf8mb4_unicode_ci') {
        await currentPool.query(`ALTER TABLE users MODIFY ${column} ${definition}`)
        fixed++
      }
    }
  }

  if (fixed > 0) {
    console.log(`[DB] Fixed collation for ${fixed} columns in users table → utf8mb4_unicode_ci`)
  }
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
