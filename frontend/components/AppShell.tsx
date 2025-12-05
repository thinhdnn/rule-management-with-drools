"use client"

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { useAuth } from '@/components/AuthProvider'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const hideChrome = pathname === '/login'

  if (hideChrome) {
    return <>{children}</>
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex min-h-screen bg-surfaceContainer">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 md:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  )
}


