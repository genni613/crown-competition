import api from './client'
import type { User } from '../types/models'

export const getMe = () => api.get<{ user: User }>('/auth/me')
export const logout = () => api.post('/auth/logout')
