import api from './client'
import type { EvidenceSubmission } from '../types/models'

export interface SubmitEvidencePayload {
  season_member_id: number
  target_type: string
  target_id?: number | null
  title: string
  description: string
  attachment_urls?: string[]
}

export interface UploadEvidenceAttachmentResponse {
  url: string
  filename: string
  originalName: string
  size: number
  mimetype: string
}

export const getPendingEvidence = () => api.get<EvidenceSubmission[]>('/evidence/pending')
export const getReviewedEvidence = () => api.get<EvidenceSubmission[]>('/evidence/reviewed')
export const getMyEvidence = (seasonId?: number) =>
  api.get<EvidenceSubmission[]>(seasonId ? `/evidence/mine/${seasonId}` : '/evidence/mine')
export const submitEvidence = (data: SubmitEvidencePayload) => api.post('/evidence', data)
export const uploadEvidenceAttachment = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post<UploadEvidenceAttachmentResponse>('/evidence/attachments', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
export const reviewEvidence = (id: number, status: string, review_comment?: string) =>
  api.put(`/evidence/${id}/status`, { status, review_comment })
export const getEvidenceDetail = (id: number) => api.get<EvidenceSubmission>(`/evidence/${id}`)
export const deleteEvidence = (id: number) => api.delete(`/evidence/${id}`)
