/**
 * 评分公式引擎 — 核心算法
 */

/**
 * 阈值得分计算
 * - value >= threshold100 → 100 分
 * - value >= threshold60 → 60 + 线性插值(60~100)
 * - value < threshold60 → 0 分
 */
export function calculateThresholdScore(
  value: number,
  threshold100: number,
  threshold60: number,
): number {
  if (value >= threshold100) return 100
  if (value >= threshold60) {
    return 60 + ((value - threshold60) / (threshold100 - threshold60)) * 40
  }
  return 0
}

/**
 * 线性赋分 — 按增长率排名
 * 第1名 = 100 分，末名 = 60 分，线性插值
 */
export function assignLinearScores(
  members: { id: number; growth: number }[],
): Map<number, number> {
  const sorted = [...members].sort((a, b) => b.growth - a.growth)
  const N = sorted.length
  const scores = new Map<number, number>()

  sorted.forEach((m, i) => {
    if (N <= 1) {
      scores.set(m.id, 100)
    } else {
      scores.set(m.id, 100 - (i * (100 - 60)) / (N - 1))
    }
  })

  return scores
}

/**
 * 保护机制
 * 若原始岗位分 ≥ 85，取 MAX(原始分, 赋分分)
 * 否则取赋分分
 */
export function applyProtection(rawScore: number, linearScore: number): number {
  if (rawScore >= 85) {
    return Math.max(rawScore, linearScore)
  }
  return linearScore
}

/**
 * 271 分布
 * 前 20% → "2"（优秀），中间 70% → "7"（达标），后 10% → "1"（待改进）
 * 保底：最少 1 人 "2"，最少 1 人 "1"
 */
export function calculate271(totalMembers: number): string[] {
  if (totalMembers <= 0) return []

  const topCount = Math.max(1, Math.round(totalMembers * 0.2))
  const bottomCount = Math.max(1, Math.round(totalMembers * 0.1))

  // 确保顶部 + 底部不超过总人数
  if (topCount + bottomCount > totalMembers) {
    return Array.from({ length: totalMembers }, (_, i) => {
      if (i === 0) return '2'
      if (i === totalMembers - 1) return '1'
      return '7'
    })
  }

  return Array.from({ length: totalMembers }, (_, i) => {
    if (i < topCount) return '2'
    if (i >= totalMembers - bottomCount) return '1'
    return '7'
  })
}

/**
 * 增长率计算
 */
export function calculateGrowth(currentScore: number, prevScore: number): number {
  if (prevScore <= 0) return 0
  return (currentScore - prevScore) / prevScore
}
