CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT NULL,
  email VARCHAR(255) NULL,
  department_id VARCHAR(191) NULL,
  department_name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  role ENUM('ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  job_role ENUM('product', 'design', 'tech') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seasons (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('draft', 'active', 'ended') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS season_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  job_role ENUM('product', 'design', 'tech') NULL,
  performance_grade ENUM('A', 'B+', 'B', 'B-', 'C') NULL,
  prev_raw_score DOUBLE NULL,
  raw_position_score DOUBLE NULL,
  growth DOUBLE NULL,
  linear_score DOUBLE NULL,
  final_position_score DOUBLE NULL,
  total_org_score DOUBLE NOT NULL DEFAULT 0,
  total_score DOUBLE NULL,
  `rank` INT NULL,
  distribution ENUM('2', '7', '1') NULL,
  UNIQUE KEY uniq_season_member (season_id, user_id),
  KEY idx_season_members_season (season_id),
  KEY idx_season_members_user (user_id),
  CONSTRAINT fk_season_members_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_season_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scoring_dimensions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_role ENUM('product', 'design', 'tech') NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  dimension_weight DOUBLE NOT NULL,
  indicator_name VARCHAR(255) NOT NULL,
  indicator_weight DOUBLE NOT NULL,
  data_source ENUM('feishu', 'admin', 'evidence') NOT NULL,
  score_type ENUM('threshold', 'deduction') NOT NULL DEFAULT 'threshold',
  threshold_100 DOUBLE NULL,
  threshold_60 DOUBLE NULL,
  deduction_per_unit DOUBLE NULL,
  deduction_cap DOUBLE NULL,
  deduction_divisor DOUBLE NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS indicator_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_member_id BIGINT NOT NULL,
  dimension_id BIGINT NOT NULL,
  raw_value DOUBLE NULL,
  threshold_score DOUBLE NULL,
  final_score DOUBLE NULL,
  source ENUM('feishu', 'admin', 'evidence') NOT NULL DEFAULT 'admin',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  UNIQUE KEY uniq_member_dimension (season_member_id, dimension_id),
  KEY idx_indicator_scores_member (season_member_id),
  CONSTRAINT fk_indicator_scores_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_indicator_scores_dimension FOREIGN KEY (dimension_id) REFERENCES scoring_dimensions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_score_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  points_per_unit DOUBLE NOT NULL,
  max_per_season DOUBLE NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_member_id BIGINT NOT NULL,
  org_score_type_id BIGINT NOT NULL,
  quantity DOUBLE NOT NULL DEFAULT 1,
  points DOUBLE NOT NULL,
  description TEXT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  submitted_by VARCHAR(191) NULL,
  reviewed_by VARCHAR(191) NULL,
  KEY idx_org_scores_member (season_member_id),
  CONSTRAINT fk_org_scores_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_scores_type FOREIGN KEY (org_score_type_id) REFERENCES org_score_types(id),
  CONSTRAINT fk_org_scores_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT fk_org_scores_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidence_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_member_id BIGINT NOT NULL,
  target_type ENUM('indicator', 'org_score') NOT NULL,
  target_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  attachment_urls JSON NULL,
  snapshot_json JSON NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_evidence_member (season_member_id),
  CONSTRAINT fk_evidence_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feishu_data_cache (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  metric_key VARCHAR(191) NOT NULL,
  metric_value DOUBLE NOT NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_feishu_cache (season_id, user_id, metric_key),
  KEY idx_feishu_cache_season_user (season_id, user_id),
  CONSTRAINT fk_feishu_cache_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
