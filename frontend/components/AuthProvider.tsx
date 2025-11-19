"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'

type UserProfile = {
  id: string
  email: string
  displayName: string
  roles: string[]
}

type AuthContextValue = {
  user: UserProfile | null
  token: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(token: string): Promise<UserProfile> {
  const response = await fetch(api.auth.me(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Unable to fetch profile')
  }

  return response.json()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null
    if (!storedToken) {
      setLoading(false)
      return
    }

    setToken(storedToken)
    fetchProfile(storedToken)
      .then((profile) => {
        setUser(profile)
      })
      .catch(() => {
        window.localStorage.removeItem('accessToken')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const response = await fetch(api.auth.login(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const message = await response.text()
      const friendly = message || 'Invalid credentials'
      setError(friendly)
      throw new Error(friendly)
    }

    const data = await response.json()
    window.localStorage.setItem('accessToken', data.accessToken)
    setToken(data.accessToken)
    setUser(data.user)
    setError(null)
  }, [])

  const logout = useCallback(() => {
    window.localStorage.removeItem('accessToken')
    setToken(null)
    setUser(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!token) return
    const profile = await fetchProfile(token)
    setUser(profile)
  }, [token])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      error,
      login,
      logout,
      refreshProfile,
    }),
    [user, token, loading, error, login, logout, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}


