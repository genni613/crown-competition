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
  const schemaPath = fs.existsSync(distSchemaPath) ? distSchemaPath : srcSchemaPath
  const schema = fs.readFileSync(schemaPath, 'utf-8')
  const statements = schema
    .split(/;\s*\n/g)
    .map(stmt => stmt.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await currentPool.query(statement)
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
