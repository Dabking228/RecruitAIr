'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface UseUserReturn {
  user: User | null
  loading: boolean
  role: string | null
  name: string | null
}

/**
 * Hook for client components that need the current user.
 * For server components, use createClient() from @/lib/supabase/server directly.
 *
 * Usage:
 *   const { user, loading, role, name } = useUser()
 */
export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get the current session immediately
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // Then listen for future auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Clean up the listener when the component unmounts
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return {
    user,
    loading,
    role: user?.user_metadata?.role ?? null,
    name: user?.user_metadata?.name ?? null,
  }
}