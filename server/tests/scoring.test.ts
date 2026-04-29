import { describe, it, expect } from 'vitest'
import {
  calculateThresholdScore,
  assignLinearScores,
  applyProtection,
  calculate271,
  calculateGrowth,
} from '../src/utils/scoringFormulas'

describe('calculateThresholdScore', () => {
  it('达到100分阈值返回100', () => {
    expect(calculateThresholdScore(95, 95, 80)).toBe(100)
  })

  it('超过100分阈值仍返回100', () => {
    expect(calculateThresholdScore(100, 95, 80)).toBe(100)
  })

  it('达到60分阈值返回60', () => {
    expect(calculateThresholdScore(80, 95, 80)).toBe(60)
  })

  it('在60和100之间线性插值', () => {
    // (90 - 80) / (95 - 80) * 40 + 60 = 10/15 * 40 + 60 = 26.67 + 60 = 86.67
    const score = calculateThresholdScore(90, 95, 80)
    expect(score).toBeCloseTo(86.67, 1)
  })

  it('低于60分阈值返回0', () => {
    expect(calculateThresholdScore(50, 95, 80)).toBe(0)
  })

  it('0值返回0', () => {
    expect(calculateThresholdScore(0, 5, 1)).toBe(0)
  })
})

describe('assignLinearScores', () => {
  it('1人时返回100', () => {
    const scores = assignLinearScores([{ id: 1, growth: 0.2 }])
    expect(scores.get(1)).toBe(100)
  })

  it('多人时正确线性赋分', () => {
    const members = [
      { id: 1, growth: 0.3 },
      { id: 2, growth: 0.2 },
      { id: 3, growth: 0.1 },
    ]
    const scores = assignLinearScores(members)
    expect(scores.get(1)).toBe(100)
    expect(scores.get(2)).toBe(80)
    expect(scores.get(3)).toBe(60)
  })

  it('按增长率降序排列', () => {
    const members = [
      { id: 1, growth: 0.1 },
      { id: 2, growth: 0.3 },
      { id: 3, growth: 0.2 },
    ]
    const scores = assignLinearScores(members)
    expect(scores.get(2)).toBe(100)  // 最高增长
    expect(scores.get(3)).toBe(80)
    expect(scores.get(1)).toBe(60)   // 最低增长
  })

  it('2人时正确赋分', () => {
    const members = [
      { id: 1, growth: 0.1 },
      { id: 2, growth: 0.05 },
    ]
    const scores = assignLinearScores(members)
    expect(scores.get(1)).toBe(100)
    expect(scores.get(2)).toBe(60)
  })

  it('空数组返回空Map', () => {
    const scores = assignLinearScores([])
    expect(scores.size).toBe(0)
  })
})

describe('applyProtection', () => {
  it('原始分>=85时取MAX', () => {
    expect(applyProtection(90, 80)).toBe(90)
    expect(applyProtection(85, 80)).toBe(85)
  })

  it('原始分>=85但赋分更高时取赋分', () => {
    expect(applyProtection(85, 95)).toBe(95)
  })

  it('原始分<85时取赋分', () => {
    expect(applyProtection(70, 80)).toBe(80)
    expect(applyProtection(50, 65)).toBe(65)
  })

  it('原始分<85且赋分更低时仍取赋分', () => {
    expect(applyProtection(70, 60)).toBe(60)
  })
})

describe('calculate271', () => {
  it('10人正确分布', () => {
    const result = calculate271(10)
    const twos = result.filter(v => v === '2').length
    const sevens = result.filter(v => v === '7').length
    const ones = result.filter(v => v === '1').length
    expect(twos).toBe(2)     // 20%
    expect(ones).toBe(1)     // 10%
    expect(sevens).toBe(7)   // 70%
  })

  it('5人保底1个2和1个1', () => {
    const result = calculate271(5)
    expect(result[0]).toBe('2')
    expect(result[4]).toBe('1')
    expect(result.filter(v => v === '2').length).toBe(1)
    expect(result.filter(v => v === '1').length).toBe(1)
  })

  it('3人保底分布', () => {
    const result = calculate271(3)
    expect(result[0]).toBe('2')
    expect(result[2]).toBe('1')
    expect(result[1]).toBe('7')
  })

  it('1人返回2', () => {
    // 1人时 topCount=1, bottomCount=1, 超过总数，走特殊逻辑
    const result = calculate271(1)
    expect(result[0]).toBe('2')
  })

  it('2人时正确处理', () => {
    const result = calculate271(2)
    expect(result[0]).toBe('2')
    expect(result[1]).toBe('1')
  })

  it('0人返回空数组', () => {
    expect(calculate271(0)).toEqual([])
  })

  it('15人分布（设计文档示例）', () => {
    const result = calculate271(15)
    expect(result.filter(v => v === '2').length).toBe(3)   // round(15*0.2)=3
    expect(result.filter(v => v === '1').length).toBe(2)   // round(15*0.1)=2
    expect(result.filter(v => v === '7').length).toBe(10)
  })
})

describe('calculateGrowth', () => {
  it('正常增长率', () => {
    expect(calculateGrowth(80, 69)).toBeCloseTo(0.1594, 3)
  })

  it('上赛手分为0返回0', () => {
    expect(calculateGrowth(80, 0)).toBe(0)
  })

  it('负增长', () => {
    expect(calculateGrowth(60, 80)).toBe(-0.25)
  })
})
