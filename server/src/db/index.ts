import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { config } from '../config'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    // 确保数据目录存在
    const dbDir = path.dirname(config.dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    db = new Database(config.dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // 执行 schema 初始化
    const distSchemaPath = path.resolve(__dirname, 'schema.sql')
    const srcSchemaPath = path.resolve(__dirname, '../../src/db/schema.sql')
    const schemaPath = fs.existsSync(distSchemaPath) ? distSchemaPath : srcSchemaPath
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = undefined as any
  }
}
