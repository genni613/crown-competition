-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT,
  email TEXT,
  department_id TEXT,
  department_name TEXT,
  title TEXT,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  job_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 赛季表
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'ended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 赛季成员表
CREATE TABLE IF NOT EXISTS season_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_role TEXT,
  performance_grade TEXT CHECK(performance_grade IN ('A', 'B+', 'B', 'B-', 'C')),
  prev_raw_score REAL,
  raw_position_score REAL,
  growth REAL,
  linear_score REAL,
  final_position_score REAL,
  total_org_score REAL DEFAULT 0,
  total_score REAL,
  rank INTEGER,
  distribution TEXT CHECK(distribution IN ('2', '7', '1')),
  UNIQUE(season_id, user_id)
);

-- 评分维度配置表
CREATE TABLE IF NOT EXISTS scoring_dimensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_role TEXT NOT NULL CHECK(job_role IN ('product', 'design', 'tech')),
  dimension_name TEXT NOT NULL,
  dimension_weight REAL NOT NULL,
  indicator_name TEXT NOT NULL,
  indicator_weight REAL NOT NULL,
  data_source TEXT NOT NULL CHECK(data_source IN ('feishu', 'admin', 'evidence')),
  score_type TEXT NOT NULL DEFAULT 'threshold' CHECK(score_type IN ('threshold', 'deduction')),
  threshold_100 REAL,
  threshold_60 REAL,
  deduction_per_unit REAL,
  deduction_cap REAL,
  deduction_divisor REAL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 指标得分表
CREATE TABLE IF NOT EXISTS indicator_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_member_id INTEGER NOT NULL REFERENCES season_members(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES scoring_dimensions(id),
  raw_value REAL,
  threshold_score REAL,
  final_score REAL,
  source TEXT NOT NULL DEFAULT 'admin' CHECK(source IN ('feishu', 'admin', 'evidence')),
  approved INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(season_member_id, dimension_id)
);

-- 组织分类型表
CREATE TABLE IF NOT EXISTS org_score_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  points_per_unit REAL NOT NULL,
  max_per_season REAL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 组织分明细表
CREATE TABLE IF NOT EXISTS org_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_member_id INTEGER NOT NULL REFERENCES season_members(id) ON DELETE CASCADE,
  org_score_type_id INTEGER NOT NULL REFERENCES org_score_types(id),
  quantity REAL NOT NULL DEFAULT 1,
  points REAL NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  submitted_by TEXT REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id)
);

-- 举证提交表
CREATE TABLE IF NOT EXISTS evidence_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_member_id INTEGER NOT NULL REFERENCES season_members(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('indicator', 'org_score')),
  target_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  attachment_urls TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  review_comment TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 飞书数据缓存表
CREATE TABLE IF NOT EXISTS feishu_data_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value REAL NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(season_id, user_id, metric_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_season_members_season ON season_members(season_id);
CREATE INDEX IF NOT EXISTS idx_season_members_user ON season_members(user_id);
CREATE INDEX IF NOT EXISTS idx_indicator_scores_member ON indicator_scores(season_member_id);
CREATE INDEX IF NOT EXISTS idx_org_scores_member ON org_scores(season_member_id);
CREATE INDEX IF NOT EXISTS idx_evidence_member ON evidence_submissions(season_member_id);
CREATE INDEX IF NOT EXISTS idx_feishu_cache_season_user ON feishu_data_cache(season_id, user_id);
