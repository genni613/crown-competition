import api from './client'
import type { ScoringDimension } from '../types/models'

export const getDimensions = () =>
  api.get<ScoringDimension[]>('/dimensions')

export const updateDimension = (id: number, data: Partial<ScoringDimension>) =>
  api.put<ScoringDimension>(`/dimensions/${id}`, data)
