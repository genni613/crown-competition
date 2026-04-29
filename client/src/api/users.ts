import api from './client'
import type { User } from '../types/models'

export const getUsers = () => api.get<User[]>('/users')
export const getUser = (id: string) => api.get<User>(`/users/${id}`)
export const updateUser = (id: string, data: any) => api.put(`/users/${id}`, data)
