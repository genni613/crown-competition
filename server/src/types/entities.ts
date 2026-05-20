// ============ 数据库实体类型 ============

export interface User {
  id: number
  open_id: string
  user_key: string | null
  name: string
  avatar_url: string | null
  email: string | null
  department_id: string | null
  department_name: string | null
  title: string | null
  role: 'ADMIN' | 'MEMBER'
  job_role: 'product' | 'design' | 'tech' | null
  sub_role: 'client' | 'frontend' | 'backend' | null
  created_at: string
  updated_at: string
}

export interface Season {
  id: number
  name: string
  start_date: string
  end_date: string
  status: 'draft' | 'active' | 'ended'
  created_at: string
  updated_at: string
}

export interface SeasonMember {
  id: number
  season_id: number
  user_key: string
  job_role: 'product' | 'design' | 'tech' | null
  sub_role: 'client' | 'frontend' | 'backend' | null
  performance_grade: 'A' | 'B+' | 'B' | 'B-' | 'C' | null
  prev_raw_score: number | null
  raw_position_score: number | null
  growth: number | null
  linear_score: number | null
  final_position_score: number | null
  total_org_score: number
  total_score: number | null
  rank: number | null
  distribution: '2' | '7' | '1' | null
}

export interface ScoringDimension {
  id: number
  job_role: 'product' | 'design' | 'tech'
  dimension_name: string
  dimension_weight: number
  indicator_name: string
  indicator_weight: number
  data_source: 'feishu' | 'admin' | 'evidence'
  score_type: 'threshold' | 'deduction'
  threshold_100: number | null
  threshold_60: number | null
  deduction_per_unit: number | null
  deduction_cap: number | null
  deduction_divisor: number | null
  sort_order: number
}

export interface IndicatorScore {
  id: number
  season_member_id: number
  dimension_id: number
  raw_value: number | null
  threshold_score: number | null
  final_score: number | null
  source: 'feishu' | 'admin' | 'evidence'
  approved: number
  notes: string | null
}

export interface OrgScoreType {
  id: number
  name: string
  display_name: string
  points_per_unit: number
  max_per_season: number | null
  sort_order: number
}

export interface OrgScore {
  id: number
  season_member_id: number
  org_score_type_id: number
  quantity: number
  points: number
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  submitted_by: number | null
  reviewed_by: number | null
}

export interface EvidenceSubmission {
  id: number
  season_member_id: number
  target_type: 'indicator' | 'org_score'
  target_id: number | null
  title: string
  description: string | null
  attachment_urls: string // JSON array string
  snapshot_json: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export interface EvidenceReview {
  id: number
  evidence_submission_id: number
  reviewer_id: number
  action: 'approved' | 'rejected'
  comment: string | null
  snapshot_json: string | null
  created_at: string
}

export interface FeishuDataCache {
  id: number
  season_id: number
  user_id: string
  metric_key: string
  metric_value: number
  fetched_at: string
}

// ============ 聚合类型 ============

export type JobRole = 'product' | 'design' | 'tech'
export type SubRole = 'client' | 'frontend' | 'backend'
export type SeasonStatus = 'draft' | 'active' | 'ended'
export type UserRole = 'ADMIN' | 'MEMBER'
export type PerformanceGrade = 'A' | 'B+' | 'B' | 'B-' | 'C'

/** 赛季成员详情（关联用户信息） */
export interface SeasonMemberDetail extends SeasonMember {
  user_name: string
  user_avatar_url: string | null
}

/** 指标得分详情（关联维度信息） */
export interface IndicatorScoreDetail extends IndicatorScore {
  dimension_name: string
  indicator_name: string
  dimension_weight: number
  indicator_weight: number
  data_source: string
  score_type: string
}
