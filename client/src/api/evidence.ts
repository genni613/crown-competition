import api from './client'
import type { EvidenceSubmission } from '../types/models'

export const getPendingEvidence = () => api.get<EvidenceSubmission[]>('/evidence/pending')
export const getMyEvidence = (seasonId: number) => api.get<EvidenceSubmission[]>(`/evidence/mine/${seasonId}`)
export const submitEvidence = (data: any) => api.post('/evidence', data)
export const reviewEvidence = (id: number, status: string, review_comment?: string) =>
  api.put(`/evidence/${id}/status`, { status, review_comment })
export const getEvidenceDetail = (id: number) => api.get(`/evidence/${id}`)
export const deleteEvidence = (id: number) => api.delete(`/evidence/${id}`)
