import type { PerformanceGrade } from '../types/entities'

/** 绩效等级 → 上赛季岗位分映射（首赛季使用） */
export const PERFORMANCE_SCORE_MAP: Record<PerformanceGrade, number> = {
  'A': 72,
  'B+': 69,
  'B': 66,
  'B-': 63,
  'C': 60,
}

export function getPerformanceScore(grade: string): number {
  return PERFORMANCE_SCORE_MAP[grade as PerformanceGrade] ?? 66
}

/** 组织分封顶 */
export const ORG_SCORE_CAP = 25

/** 271 分布比例 */
export const TOP_RATIO = 0.2
export const BOTTOM_RATIO = 0.1
