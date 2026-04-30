import { getDb, withTransaction } from '../db'
import {
  calculateThresholdScore,
  assignLinearScores,
  applyProtection,
  calculate271,
} from '../utils/scoringFormulas'
import type { IndicatorScore, ScoringDimension, SeasonMember } from '../types/entities'

export async function calculateSeasonScores(seasonId: number): Promise<SeasonMember[]> {
  const db = getDb()
  const members = await db.query<SeasonMember>(
    'SELECT * FROM season_members WHERE season_id = ?',
    [seasonId]
  )

  if (members.length === 0) return []

  const jobGroups = new Map<string, SeasonMember[]>()
  for (const member of members) {
    const key = member.job_role || 'unknown'
    if (!jobGroups.has(key)) jobGroups.set(key, [])
    jobGroups.get(key)!.push(member)
  }

  await withTransaction(async tx => {
    for (const [jobRole, group] of jobGroups) {
      for (const member of group) {
        const dimensions = await tx.query<ScoringDimension>(
          'SELECT * FROM scoring_dimensions WHERE job_role = ? ORDER BY sort_order',
          [jobRole]
        )

        const dimMap = new Map<string, { dim: ScoringDimension; scores: IndicatorScore[] }>()
        for (const dim of dimensions) {
          const key = dim.dimension_name
          if (!dimMap.has(key)) dimMap.set(key, { dim, scores: [] })
          const score = await tx.queryOne<IndicatorScore>(
            'SELECT * FROM indicator_scores WHERE season_member_id = ? AND dimension_id = ?',
            [member.id, dim.id]
          )
          if (score) dimMap.get(key)!.scores.push(score)
        }

        let totalDeduction = 0
        let rawPositionScore = 0

        for (const [, { dim, scores }] of dimMap) {
          if (dim.score_type === 'deduction') {
            for (const score of scores) {
              const rawVal = score.raw_value || 0
              const divisor = dim.deduction_divisor || 1
              const perUnit = dim.deduction_per_unit || 1
              const cap = dim.deduction_cap || 0
              const deduction = Math.min(rawVal * perUnit / divisor, cap)
              totalDeduction += deduction

              await tx.execute(
                'UPDATE indicator_scores SET threshold_score = ?, final_score = ? WHERE id = ?',
                [0, -deduction, score.id]
              )
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
              await tx.execute(
                'UPDATE indicator_scores SET threshold_score = ?, final_score = ? WHERE id = ?',
                [thresholdScore, thresholdScore, score.id]
              )
              dimScore += thresholdScore * dim.indicator_weight
            }

            const weightedDimScore = dim.dimension_weight > 0
              ? dimScore / dim.dimension_weight
              : dimScore
            rawPositionScore += weightedDimScore * dim.dimension_weight
          }
        }

        rawPositionScore -= totalDeduction
        await tx.execute(
          'UPDATE season_members SET raw_position_score = ? WHERE id = ?',
          [rawPositionScore, member.id]
        )
      }

      const withRaw = await tx.query<SeasonMember>(
        'SELECT * FROM season_members WHERE season_id = ? AND job_role = ?',
        [seasonId, jobRole]
      )

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

        await tx.execute(
          'UPDATE season_members SET growth = ?, linear_score = ?, final_position_score = ? WHERE id = ?',
          [growth, linearScore, finalScore, member.id]
        )
      }

      const ranked = await tx.query<SeasonMember>(
        'SELECT * FROM season_members WHERE season_id = ? AND job_role = ? ORDER BY final_position_score + total_org_score DESC',
        [seasonId, jobRole]
      )

      const distributions = calculate271(ranked.length)
      for (let i = 0; i < ranked.length; i++) {
        await tx.execute(
          'UPDATE season_members SET total_score = final_position_score + total_org_score, `rank` = ?, distribution = ? WHERE id = ?',
          [i + 1, distributions[i], ranked[i].id]
        )
      }
    }
  })

  return db.query<SeasonMember>(
    'SELECT * FROM season_members WHERE season_id = ? ORDER BY `rank`',
    [seasonId]
  )
}
