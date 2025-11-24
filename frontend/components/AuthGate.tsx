"use client"

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'

const PUBLIC_ROUTES = new Set(['/login'])

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isPublicRoute = PUBLIC_ROUTES.has(pathname)

  useEffect(() => {
    if (loading) return

    if (!user && !isPublicRoute) {
      router.replace('/login')
    } else if (user && pathname === '/login') {
      router.replace('/')
    }
  }, [loading, user, isPublicRoute, pathname, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading workspace...
      </div>
    )
  }

  if (!user && !isPublicRoute) {
    return null
  }

  if (user && pathname === '/login') {
    return null
  }

  return <>{children}</>
}


