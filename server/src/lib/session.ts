import type { SessionOptions } from 'iron-session'
import { config } from '../config'

export interface SessionData {
  user?: {
    id: number
    name: string
    avatar_url?: string | null
    department_name?: string | null
    role: string
  }
  accessToken?: string
  refreshToken?: string
  state?: string
  redirectTo?: string
}

export const defaultSession: SessionData = {
  user: undefined,
  accessToken: undefined,
  refreshToken: undefined,
  state: undefined,
}

export const sessionOptions: SessionOptions = {
  password: config.session.secret,
  cookieName: 'crown_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
    httpOnly: true,
  },
}

declare module 'iron-session' {
  interface IronSessionData extends SessionData {}
}
