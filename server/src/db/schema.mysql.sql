CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  open_id VARCHAR(191) NOT NULL UNIQUE COMMENT '飞书 open_id，登录标识',
  user_key VARCHAR(64) NULL COMMENT '飞书项目 user_key，关联 feishu_user 表',
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT NULL,
  email VARCHAR(255) NULL,
  department_id VARCHAR(191) NULL,
  department_name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  role ENUM('ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  job_role ENUM('product', 'design', 'tech') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_users_user_key (user_key)
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
  user_key VARCHAR(64) NOT NULL COMMENT '关联 feishu_user.user_key',
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
  UNIQUE KEY uniq_season_member (season_id, user_key),
  KEY idx_season_members_season (season_id),
  KEY idx_season_members_user (user_key),
  CONSTRAINT fk_season_members_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS season_indicator_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT NOT NULL,
  season_member_id BIGINT NOT NULL,
  scoring_dimension_id BIGINT NOT NULL,
  job_role ENUM('product', 'design', 'tech') NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  indicator_name VARCHAR(255) NOT NULL,
  raw_value DOUBLE NULL,
  threshold_score DOUBLE NULL,
  final_score DOUBLE NULL,
  source ENUM('feishu', 'admin', 'evidence') NOT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  calc_snapshot_json JSON NULL,
  notes TEXT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_season_member_dimension_result (season_member_id, scoring_dimension_id),
  KEY idx_sis_season_member (season_id, season_member_id),
  KEY idx_sis_dimension (scoring_dimension_id),
  CONSTRAINT fk_sis_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_sis_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_sis_dimension FOREIGN KEY (scoring_dimension_id) REFERENCES scoring_dimensions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS season_dimension_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT NOT NULL,
  season_member_id BIGINT NOT NULL,
  job_role ENUM('product', 'design', 'tech') NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  dimension_weight DOUBLE NOT NULL,
  raw_dimension_score DOUBLE NOT NULL,
  weighted_dimension_score DOUBLE NOT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_member_dimension_name (season_member_id, dimension_name),
  KEY idx_sds_season_member (season_id, season_member_id),
  CONSTRAINT fk_sds_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_sds_member FOREIGN KEY (season_member_id) REFERENCES season_members(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS feishu_workitem_gongshi (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  work_item_id BIGINT NOT NULL COMMENT '飞书工作项ID',
  work_description VARCHAR(255) NOT NULL DEFAULT '' COMMENT '工作描述(name)',
  work_item_type VARCHAR(64) NOT NULL DEFAULT '' COMMENT '工作项类型',
  work_item_status VARCHAR(32) NOT NULL DEFAULT '' COMMENT '状态',
  create_time DATETIME NULL COMMENT '创建时间(start_time)',
  work_hour_reporter VARCHAR(64) NOT NULL DEFAULT '' COMMENT '填报人(owner user_key)',
  actual_work_hours DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '实际投入时长(小时)',
  pd_count DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'PD数',
  work_date DATETIME NULL COMMENT '工作时间',
  related_project VARCHAR(64) DEFAULT '' COMMENT '关联项目ID',
  related_requirement VARCHAR(64) DEFAULT '' COMMENT '关联需求ID',
  specific_work_hour_type TEXT NULL COMMENT '工时具体类型',
  role VARCHAR(32) DEFAULT '' COMMENT '角色',
  business_domain_belonging VARCHAR(32) DEFAULT '' COMMENT '人员归属业务域',
  belonging_month VARCHAR(32) DEFAULT '' COMMENT '所属月份',
  work_start_time DATETIME NULL COMMENT '开始工作时间',
  work_content_description VARCHAR(512) DEFAULT '' COMMENT '工作内容描述',
  description TEXT NULL COMMENT '描述',
  priority VARCHAR(16) DEFAULT '' COMMENT '优先级',
  is_completed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否完成',
  is_auto_generated TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否自动生成',
  is_quality_related TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否属于质量',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间(updated_at)',
  UNIQUE KEY uk_work_item_id (work_item_id),
  KEY idx_create_time (create_time),
  KEY idx_reporter (work_hour_reporter)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 需求管理表
CREATE TABLE IF NOT EXISTS feishu_workitem_story (
  work_item_id BIGINT NOT NULL COMMENT '工作项ID',
  name VARCHAR(255) NULL COMMENT '需求名称',
  owner VARCHAR(64) NULL COMMENT '创建者',
  start_time DATETIME NULL COMMENT '提出时间',
  finish_time DATETIME NULL COMMENT '完成日期',
  work_item_type_key VARCHAR(64) NULL COMMENT '工作项类型',
  work_item_status VARCHAR(64) NULL COMMENT '需求状态',
  finish_status TINYINT(1) NULL COMMENT '是否完成',
  related_project VARCHAR(64) NULL COMMENT '关联项目',
  current_status_operator VARCHAR(512) NULL COMMENT '需求负责人',
  template_type VARCHAR(128) NULL COMMENT '需求类型',
  sub_stage VARCHAR(64) NULL COMMENT '需求状态(细分)',
  update_time DATETIME NULL COMMENT '更新时间',
  PRIMARY KEY (work_item_id),
  UNIQUE KEY u_work_item_id_index (work_item_id),
  KEY idx_start_time (start_time),
  KEY idx_owner (owner),
  KEY idx_related_project (related_project)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飞书需求工作项表';

-- 项目管理表
CREATE TABLE IF NOT EXISTS feishu_workitem_project (
  work_item_id BIGINT NOT NULL COMMENT '工作项ID',
  name VARCHAR(255) NULL COMMENT '项目名称',
  owner VARCHAR(64) NULL COMMENT '创建者',
  start_time DATETIME NULL COMMENT '创建时间',
  updated_at DATETIME NULL COMMENT '更新时间',
  current_status_operator VARCHAR(512) NULL COMMENT '当前负责人',
  business VARCHAR(64) NULL COMMENT '业务线',
  rd_business_domain VARCHAR(64) NULL COMMENT '产研业务域（原field_key: field_13b392）',
  project_level VARCHAR(64) NULL COMMENT '项目级别（原field_key: field_756485）',
  estimated_pd DECIMAL(10, 2) NULL COMMENT '精估PD（原field_key: field_00fbf0）',
  planned_pd DECIMAL(10, 2) NULL COMMENT '规划PD（原field_key: field_52cf0c）',
  scheduled_pd DECIMAL(10, 2) NULL COMMENT '排期PD（原field_key: field_e65389）',
  total_registered_pd DECIMAL(10, 2) NULL COMMENT '总登记工时PD（原field_key: field_f776a9）',
  feishu_total_registered_pd DECIMAL(10, 2) NULL COMMENT '飞书总登记工时PD（原field_key: field_1ce1e2）',
  PRIMARY KEY (work_item_id),
  UNIQUE KEY u_work_item_id_index (work_item_id),
  KEY idx_start_time (start_time),
  KEY idx_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飞书项目表';

-- 缺陷管理表
CREATE TABLE IF NOT EXISTS feishu_workitem_issue (
  work_item_id BIGINT NOT NULL COMMENT '工作项ID',
  name VARCHAR(255) NULL COMMENT '名称',
  description TEXT NULL COMMENT '描述',
  owner VARCHAR(64) NULL COMMENT '创建者',
  priority VARCHAR(32) NULL COMMENT '优先级',
  start_time DATETIME NULL COMMENT '提出时间',
  archiving_date DATETIME NULL COMMENT '完成日期',
  work_item_status VARCHAR(64) NULL COMMENT '状态',
  source VARCHAR(64) NULL COMMENT '缺陷来源(field_859a97)',
  root_cause VARCHAR(64) NULL COMMENT '问题原因(field_5040b1)',
  is_online_defect VARCHAR(32) NULL COMMENT '是否线上缺陷(field_f31c6f)',
  updated_by VARCHAR(64) NULL COMMENT '更新人',
  update_time DATETIME NULL COMMENT '更新时间',
  PRIMARY KEY (work_item_id),
  UNIQUE KEY u_work_item_id_index (work_item_id),
  KEY idx_start_time (start_time),
  KEY idx_owner (owner),
  KEY idx_archiving_date (archiving_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飞书缺陷工作项表';

-- 飞书用户表
CREATE TABLE IF NOT EXISTS feishu_user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_key VARCHAR(64) NOT NULL COMMENT '用户唯一标识',
  user_id BIGINT NOT NULL DEFAULT 0 COMMENT '用户ID',
  username VARCHAR(64) DEFAULT '' COMMENT '用户名',
  out_id VARCHAR(64) DEFAULT '' COMMENT '外部ID',
  name VARCHAR(255) DEFAULT '' COMMENT '中文名(name.zh_cn)',
  name_cn VARCHAR(255) DEFAULT '' COMMENT '中文名',
  name_en VARCHAR(255) DEFAULT '' COMMENT '英文名',
  email VARCHAR(255) DEFAULT '' COMMENT '邮箱',
  avatar_url TEXT NULL COMMENT '头像URL',
  status VARCHAR(32) DEFAULT '' COMMENT '状态',
  job_role ENUM('product', 'design', 'tech') NULL COMMENT '岗位',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_key (user_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飞书用户表';
