import { SessionData } from '../lib/session'

declare global {
  namespace Express {
    interface Request {
      session: SessionData & { save(): Promise<void>; destroy(): Promise<void> }
    }
  }
}

export {}
