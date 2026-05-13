import api from './client'
import type { MemberDirectoryItem, MemberSeasonHistoryItem, User } from '../types/models'

export const getUsers = () => api.get<User[]>('/users')
export const getUser = (id: string) => api.get<User>(`/users/${id}`)
export const updateUser = (id: string, data: any) => api.put(`/users/${id}`, data)

export const getMemberDirectory = (params: {
  seasonId?: number
  jobRole?: string
  department?: string
  keyword?: string
  anomalyOnly?: boolean
}) => api.get<MemberDirectoryItem[]>('/users/member-directory', { params })

export const getMemberSeasonHistory = (userKey: string) =>
  api.get<MemberSeasonHistoryItem[]>(`/users/member-directory/${encodeURIComponent(userKey)}/history`)

export const updateMemberDirectoryJobRole = (
  userKey: string,
  data: {
    job_role: string | null
    sub_role: string | null
    syncDraftSeasonMembers?: boolean
  }
) => api.put(`/users/member-directory/${encodeURIComponent(userKey)}/job-role`, data)
