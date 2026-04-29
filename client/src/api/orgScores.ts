import api from './client'
import type { OrgScoreType, OrgScore } from '../types/models'

export const getOrgScoreTypes = () => api.get<OrgScoreType[]>('/org-scores/types')
export const getOrgScores = (seasonId: number, memberId: number) =>
  api.get<OrgScore[]>(`/org-scores/${seasonId}/${memberId}`)
export const addOrgScore = (seasonId: number, memberId: number, data: any) =>
  api.post(`/org-scores/${seasonId}/${memberId}`, data)
export const updateOrgScore = (id: number, data: any) => api.put(`/org-scores/${id}`, data)
export const deleteOrgScore = (id: number) => api.delete(`/org-scores/${id}`)
export const getOrgScoreSummary = (seasonId: number) =>
  api.get(`/org-scores/${seasonId}/summary`)
