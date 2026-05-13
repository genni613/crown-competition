export interface User {
  id: string
  user_key: string | null
  name: string
  avatar_url: string | null
  email: string | null
  department_name: string | null
  title: string | null
  role: 'ADMIN' | 'MEMBER'
  job_role: 'product' | 'design' | 'tech' | null
  sub_role: 'client' | 'frontend' | 'backend' | null
}

export interface Season {
  id: number
  name: string
  start_date: string
  end_date: string
  status: 'draft' | 'active' | 'ended'
}

export interface SeasonMember {
  id: number
  season_id: number
  user_key: string
  job_role: 'product' | 'design' | 'tech' | null
  sub_role: 'client' | 'frontend' | 'backend' | null
  performance_grade: string | null
  prev_raw_score: number | null
  raw_position_score: number | null
  growth: number | null
  linear_score: number | null
  final_position_score: number | null
  total_org_score: number
  total_score: number | null
  rank: number | null
  distribution: '2' | '7' | '1' | null
  user_name?: string
  user_avatar_url?: string | null
}

export interface ScoringDimension {
  id: number
  job_role: string
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
  source: string
  approved: number
  notes: string | null
  dimension_name?: string
  indicator_name?: string
  dimension_weight?: number
  indicator_weight?: number
  data_source?: string
  score_type?: string
}

export interface OrgScoreType {
  id: number
  name: string
  display_name: string
  points_per_unit: number
  max_per_season: number | null
}

export interface OrgScore {
  id: number
  season_member_id: number
  org_score_type_id: number
  quantity: number
  points: number
  description: string | null
  display_name?: string
}

export interface EvidenceSubmission {
  id: number
  season_member_id: number
  season_id?: number
  season_name?: string
  target_type: string
  target_id: number | null
  title: string
  description: string | null
  snapshot_json?: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  review_comment: string | null
  review_snapshot_json?: Record<string, unknown> | null
  reviewed_at?: string | null
  reviewer_name?: string
  attachment_urls: string[]
  user_name?: string
  created_at?: string
  review_history?: EvidenceReview[]
}

export interface EvidenceReview {
  id: number
  evidence_submission_id: number
  reviewer_id: string
  reviewer_name?: string
  action: 'approved' | 'rejected'
  comment: string | null
  snapshot_json?: Record<string, unknown> | null
  created_at: string
}

export type JobRole = 'product' | 'design' | 'tech'
export type SubRole = 'client' | 'frontend' | 'backend'

export interface MemberDirectoryItem {
  user_id: number | null
  user_key: string | null
  open_id: string | null
  name: string
  avatar_url: string | null
  email: string | null
  department_name: string | null
  title: string | null
  role: 'ADMIN' | 'MEMBER' | null
  job_role: JobRole | null
  sub_role: SubRole | null
  system_job_role: JobRole | null
  system_sub_role: SubRole | null
  selected_season_id: number | null
  selected_season_name: string | null
  selected_season_status: 'draft' | 'active' | 'ended' | null
  selected_season_member_id: number | null
  selected_total_score: number | null
  selected_final_position_score: number | null
  selected_total_org_score: number | null
  selected_rank: number | null
  selected_distribution: '2' | '7' | '1' | null
  latest_ended_total_score: number | null
  season_count: number
  last_sync_at: string | null
  anomalies: string[]
}

export interface MemberSeasonHistoryItem {
  season_id: number
  season_name: string
  season_status: 'draft' | 'active' | 'ended'
  start_date: string
  end_date: string
  season_member_id: number
  job_role: JobRole | null
  sub_role: SubRole | null
  performance_grade: string | null
  final_position_score: number | null
  total_org_score: number
  total_score: number | null
  rank: number | null
  distribution: '2' | '7' | '1' | null
}
