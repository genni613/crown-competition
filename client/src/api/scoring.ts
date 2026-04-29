import api from './client'
import type { ScoringDimension, SeasonMember } from '../types/models'

export const getDimensions = (jobRole: string) => api.get<ScoringDimension[]>(`/scoring/dimensions/${jobRole}`)
export const calculateSeason = (seasonId: number) => api.post(`/scoring/calculate/${seasonId}`)
export const getBreakdown = (seasonId: number, memberId: number) => api.get(`/scoring/breakdown/${seasonId}/${memberId}`)
export const getRankings = (seasonId: number, jobRole?: string) =>
  api.get<SeasonMember[]>(jobRole ? `/scoring/rankings/${seasonId}/${jobRole}` : `/scoring/rankings/${seasonId}`)
