import api from './client'

export const getScores = (seasonId: number, memberId: number) =>
  api.get(`/scores/${seasonId}/${memberId}`)
export const updateScore = (seasonId: number, memberId: number, dimensionId: number, data: any) =>
  api.put(`/scores/${seasonId}/${memberId}/${dimensionId}`, data)
export const batchUpdateScores = (seasonId: number, memberId: number, scores: any[]) =>
  api.put(`/scores/${seasonId}/${memberId}/batch`, { scores })
export const getScoreSummary = (seasonId: number) =>
  api.get(`/scores/${seasonId}/summary`)
