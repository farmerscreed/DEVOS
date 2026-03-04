import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useAppStore } from '../lib/store'

interface User {
  id: string
  email: string
  role: string
  organisation_id: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { setUser: setStoreUser } = useAppStore()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const userData = {
          id: session.user.id,
          email: session.user.email || '',
          role: session.user.app_metadata?.role || 'org_admin',
          organisation_id: session.user.app_metadata?.organisation_id
        }
        setUser(userData)
        setStoreUser(userData)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const userData = {
          id: session.user.id,
          email: session.user.email || '',
          role: session.user.app_metadata?.role || 'org_admin',
          organisation_id: session.user.app_metadata?.organisation_id
        }
        setUser(userData)
        setStoreUser(userData)
      } else {
        setUser(null)
        setStoreUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, loading, signIn, signOut }
}