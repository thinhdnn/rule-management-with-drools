"use client"
import { Menu } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

export function TopBar() {
  const { user, logout } = useAuth()

  return (
    <header className="h-16 bg-surface sticky top-0 z-40 elev-appbar border-b border-outlineVariant flex items-center px-4 gap-4" role="banner">
      <button
        className="lg:hidden p-2 rounded-md hover:bg-surfaceContainerHigh focus-ring"
        aria-label="Toggle navigation"
        onClick={() => (window as any).__toggleSidebar?.()}
      >
        <Menu size={20} />
      </button>
      <div className="flex flex-col">
        <div className="text-xl font-semibold" data-testid="topbar-title">Rule Management</div>
        <div className="text-xs text-slate-500">Worklist</div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{user?.displayName}</p>
          <p className="text-xs text-slate-500">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="px-3 py-1 text-sm rounded-md border border-slate-300 hover:bg-slate-50 focus-ring"
        >
          Logout
        </button>
      </div>
    </header>
  )
}

