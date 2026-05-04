import api from './client'
import type { Season, SeasonMember } from '../types/models'

export const getSeasons = () => api.get<Season[]>('/seasons')
export const getSeason = (id: number) => api.get<Season>(`/seasons/${id}`)
export const createSeason = (data: any) => api.post<Season>('/seasons', data)
export const updateSeason = (id: number, data: any) => api.put<Season>(`/seasons/${id}`, data)
export const activateSeason = (id: number) => api.post(`/seasons/${id}/activate`)
export const endSeason = (id: number) => api.post(`/seasons/${id}/end`)
export const getMembers = (seasonId: number) => api.get<SeasonMember[]>(`/seasons/${seasonId}/members`)
export const addMember = (seasonId: number, data: any) => api.post(`/seasons/${seasonId}/members`, data)
export const updateMember = (seasonId: number, memberId: number, data: any) => api.put(`/seasons/${seasonId}/members/${memberId}`, data)
export const removeMember = (seasonId: number, memberId: number) => api.delete(`/seasons/${seasonId}/members/${memberId}`)

export interface BatchAddResult {
  added: number
  skipped: { user_key: string; name?: string; reason: string }[]
}

export const addMembersBatch = (seasonId: number, data: { members: { user_key: string; performance_grade?: string }[] }) =>
  api.post<BatchAddResult>(`/seasons/${seasonId}/members/batch`, data)
