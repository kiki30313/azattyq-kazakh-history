import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type Profile = {
  id: string
  display_name: string
  role: 'student' | 'admin'
}

export type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  error: string
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
