"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Puzzle, Brain, BarChart3, Settings, Package, FileCheck, Play } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, testId: 'sidebar-dashboard-item' },
  { href: '/rules', label: 'Rules', icon: Puzzle, testId: 'sidebar-rules-item' },
  { href: '/package', label: 'Package', icon: Package, testId: 'sidebar-package-item' },
  { href: '/change-requests', label: 'Change Request', icon: FileCheck, testId: 'sidebar-change-request-item' },
  { href: '/executions', label: 'Executions', icon: Play, testId: 'sidebar-executions-item' },
  { href: '/ai', label: 'AI Builder', icon: Brain, testId: 'sidebar-ai-item' },
  { href: '/reports', label: 'Reports', icon: BarChart3, testId: 'sidebar-reports-item' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Hide permanent drawer on <1280; use button on TopBar to toggle via custom event
  // Listen for toggle events from TopBar
  if (typeof window !== 'undefined') {
    // simple event bridge
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__toggleSidebar = () => setOpen((o) => !o)
  }

  const Drawer = (
    <aside
      className="w-[260px] shrink-0 bg-surface border-r border-border h-screen sticky top-0 hidden lg:block"
      aria-label="Sidebar Navigation"
    >
      <nav className="p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href) && item.href !== '/'
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  data-testid={item.testId}
                  href={item.href}
                  className={`group flex items-center gap-3 h-11 px-3 rounded-lg focus-ring transition-smooth cursor-pointer ${
                    active
                      ? 'bg-primary-bg text-primary border-l-2 border-primary shadow-sm'
                      : 'text-text-secondary hover:bg-surfaceContainerHigh hover:text-text-primary'
                  }`}
                >
                  <Icon size={20} className={active ? 'text-primary' : ''} />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              </li>
            )
          })}
          <li><div className="my-3 h-px bg-border-light" /></li>
          <li>
            <Link 
              href="/settings" 
              data-testid="sidebar-settings-item" 
              className="flex items-center gap-3 h-11 px-3 rounded-lg text-text-secondary hover:bg-surfaceContainerHigh hover:text-text-primary focus-ring transition-smooth cursor-pointer"
            >
              <Settings size={20} />
              <span className="text-sm font-medium">Settings</span>
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  )

  const Sheet = (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={() => setOpen(false)} />
      <aside className={`absolute top-0 left-0 h-full w-[260px] bg-surface border-r border-border transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="p-4">
          <button className="mb-4 text-sm text-text-secondary hover:text-text-primary focus-ring transition-smooth rounded-lg px-3 py-2 hover:bg-surfaceContainerHigh" onClick={() => setOpen(false)}>Close</button>
          <ul className="space-y-1">
            {navItems.concat([{ href: '/settings', label: 'Settings', icon: Settings, testId: 'sidebar-settings-item' }]).map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href) && item.href !== '/'
              return (
                <li key={item.href}>
                  <Link 
                    data-testid={item.testId} 
                    href={item.href} 
                    onClick={() => setOpen(false)} 
                    className={`group flex items-center gap-3 h-11 px-3 rounded-lg focus-ring transition-smooth cursor-pointer ${
                      active 
                        ? 'bg-primary-bg text-primary border-l-2 border-primary shadow-sm' 
                        : 'text-text-secondary hover:bg-surfaceContainerHigh hover:text-text-primary'
                    }`}
                  >
                    <Icon size={20} className={active ? 'text-primary' : ''} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </div>
  )

  return (
    <>
      {Drawer}
      {Sheet}
    </>
  )
}


