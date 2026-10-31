import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type Profile } from '../lib/authContext'
import { supabase } from '../lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const activeUserId = useRef<string | null>(null)

  const loadProfile = async (userId: string) => {
    if (!supabase) return
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', userId)
      .maybeSingle()

    if (activeUserId.current !== userId) return
    if (profileError) {
      setError('Профильді жүктеу мүмкін болмады. Дерекқор саясатын тексеріңіз.')
      setProfile(null)
      return
    }
    setError('')
    setProfile(data)
  }

  const refreshProfile = async () => {
    if (session?.user.id) await loadProfile(session.user.id)
  }

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    const initialize = async () => {
      const { data, error: sessionError } = await client.auth.getSession()
      if (!active) return
      if (sessionError) setError('Сессияны қалпына келтіру мүмкін болмады.')
      activeUserId.current = data.session?.user.id ?? null
      setSession(data.session)
      if (data.session?.user.id) await loadProfile(data.session.user.id)
      if (active) setIsLoading(false)
    }

    void initialize()
    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      activeUserId.current = nextSession?.user.id ?? null
      setSession(nextSession)
      setProfile(null)
      if (!nextSession) {
        setError('')
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      window.setTimeout(async () => {
        if (!active) return
        await loadProfile(nextSession.user.id)
        if (active && activeUserId.current === nextSession.user.id) setIsLoading(false)
      }, 0)
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, isLoading, error, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
