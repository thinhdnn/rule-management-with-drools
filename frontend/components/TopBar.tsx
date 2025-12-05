"use client"
import { Menu } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

export function TopBar() {
  const { user, logout } = useAuth()

  return (
    <header className="h-16 bg-surface sticky top-0 z-40 elev-appbar border-b border-border flex items-center px-6 gap-4" role="banner">
      <button
        className="lg:hidden p-2 rounded-lg hover:bg-surfaceContainerHigh focus-ring transition-smooth cursor-pointer text-text-secondary hover:text-text-primary"
        aria-label="Toggle navigation"
        onClick={() => (window as any).__toggleSidebar?.()}
      >
        <Menu size={20} />
      </button>
      <div className="flex flex-col">
        <div className="h4 text-text-primary" data-testid="topbar-title">Rule Management</div>
        <div className="text-body-xs text-text-tertiary">Worklist</div>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-text-primary">{user?.displayName}</p>
          <p className="text-xs text-text-tertiary">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surfaceContainerHigh focus-ring transition-smooth cursor-pointer text-text-secondary hover:text-text-primary"
        >
          Logout
        </button>
      </div>
    </header>
  )
}

