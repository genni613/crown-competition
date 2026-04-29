import { getDb } from '../db'
import {
  calculateThresholdScore,
  assignLinearScores,
  applyProtection,
  calculate271,
} from '../utils/scoringFormulas'
import type { IndicatorScore, ScoringDimension, SeasonMember } from '../types/entities'

export function calculateSeasonScores(seasonId: number): SeasonMember[] {
  const db = getDb()

  const members = db.prepare(
    'SELECT * FROM season_members WHERE season_id = ?'
  ).all(seasonId) as SeasonMember[]

  if (members.length === 0) return []

  const jobGroups = new Map<string, SeasonMember[]>()
  for (const member of members) {
    const key = member.job_role || 'unknown'
    if (!jobGroups.has(key)) jobGroups.set(key, [])
    jobGroups.get(key)!.push(member)
  }

  const transaction = db.transaction(() => {
    for (const [jobRole, group] of jobGroups) {
      for (const member of group) {
        const dimensions = db.prepare(
          'SELECT * FROM scoring_dimensions WHERE job_role = ? ORDER BY sort_order'
        ).all(jobRole) as ScoringDimension[]

        const dimMap = new Map<string, { dim: ScoringDimension; scores: IndicatorScore[] }>()
        for (const dim of dimensions) {
          const key = dim.dimension_name
          if (!dimMap.has(key)) dimMap.set(key, { dim, scores: [] })
          const score = db.prepare(
            'SELECT * FROM indicator_scores WHERE season_member_id = ? AND dimension_id = ?'
          ).get(member.id, dim.id) as IndicatorScore | undefined
          if (score) dimMap.get(key)!.scores.push(score)
        }

        let totalDeduction = 0
        let rawPositionScore = 0
        const dimScores: { name: string; weight: number; score: number }[] = []

        for (const [, { dim, scores }] of dimMap) {
          if (dim.score_type === 'deduction') {
            for (const score of scores) {
              const rawVal = score.raw_value || 0
              const divisor = dim.deduction_divisor || 1
              const perUnit = dim.deduction_per_unit || 1
              const cap = dim.deduction_cap || 0
              const deduction = Math.min(rawVal * perUnit / divisor, cap)
              totalDeduction += deduction

              db.prepare(
                'UPDATE indicator_scores SET threshold_score = ?, final_score = ? WHERE id = ?'
              ).run(0, -deduction, score.id)
            }
          } else {
            let dimScore = 0
            for (const score of scores) {
              const rawVal = score.raw_value || 0
              const t100 = dim.threshold_100
              const t60 = dim.threshold_60
              const thresholdScore = (t100 != null && t60 != null)
                ? calculateThresholdScore(rawVal, t100, t60)
                : rawVal
              db.prepare(
                'UPDATE indicator_scores SET threshold_score = ?, final_score = ? WHERE id = ?'
              ).run(thresholdScore, thresholdScore, score.id)
              dimScore += thresholdScore * dim.indicator_weight
            }
            const weightedDimScore = dim.dimension_weight > 0
              ? dimScore / dim.dimension_weight
              : dimScore
            dimScores.push({
              name: dim.dimension_name,
              weight: dim.dimension_weight,
              score: weightedDimScore,
            })
            rawPositionScore += weightedDimScore * dim.dimension_weight
          }
        }

        rawPositionScore -= totalDeduction

        db.prepare(
          'UPDATE season_members SET raw_position_score = ? WHERE id = ?'
        ).run(rawPositionScore, member.id)
      }

      const withRaw = db.prepare(
        'SELECT * FROM season_members WHERE season_id = ? AND job_role = ?'
      ).all(seasonId, jobRole) as SeasonMember[]

      const growthMembers = withRaw
        .filter(member => member.raw_position_score != null && member.prev_raw_score != null && member.prev_raw_score > 0)
        .map(member => ({
          id: member.id,
          growth: (member.raw_position_score! - member.prev_raw_score!) / member.prev_raw_score!,
        }))

      const linearMap = assignLinearScores(growthMembers)

      for (const member of withRaw) {
        const linearScore = linearMap.get(member.id) ?? member.raw_position_score ?? 0
        const finalScore = applyProtection(member.raw_position_score ?? 0, linearScore)
        const growth = growthMembers.find(item => item.id === member.id)?.growth ?? null

        db.prepare(
          'UPDATE season_members SET growth = ?, linear_score = ?, final_position_score = ? WHERE id = ?'
        ).run(growth, linearScore, finalScore, member.id)
      }

      const ranked = db.prepare(
        'SELECT * FROM season_members WHERE season_id = ? AND job_role = ? ORDER BY final_position_score + total_org_score DESC'
      ).all(seasonId, jobRole) as SeasonMember[]

      const distributions = calculate271(ranked.length)
      const updateRank = db.prepare(
        'UPDATE season_members SET total_score = final_position_score + total_org_score, rank = ?, distribution = ? WHERE id = ?'
      )

      for (let i = 0; i < ranked.length; i++) {
        updateRank.run(i + 1, distributions[i], ranked[i].id)
      }
    }
  })

  transaction()

  return db.prepare(
    'SELECT * FROM season_members WHERE season_id = ? ORDER BY rank'
  ).all(seasonId) as SeasonMember[]
}
