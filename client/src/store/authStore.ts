import { create } from 'zustand'
import type { User } from '../types/models'
import { getMe } from '../api/auth'

interface AuthState {
  user: User | null
  loading: boolean
  fetchUser: () => Promise<void>
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  fetchUser: async () => {
    try {
      const res = await getMe()
      set({ user: res.data.user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  setUser: (user) => set({ user }),
}))
