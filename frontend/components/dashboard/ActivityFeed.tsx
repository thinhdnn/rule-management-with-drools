"use client"

import { Bell, CheckCircle2, Clock4, History, Loader2, TriangleAlert } from 'lucide-react'
import type { DashboardActivityItem } from '@/types/dashboard'
import { cn } from '@/lib/utils'
import type { ComponentType } from 'react'

interface ActivityFeedProps {
  items: DashboardActivityItem[]
  loading?: boolean
}

const statusStyles: Record<string, { badge: string; icon: ComponentType<{ className?: string }> }> = {
  pending: { badge: 'bg-amber-50 text-amber-700 ring-amber-100', icon: Clock4 },
  approved: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100', icon: CheckCircle2 },
  deployed: { badge: 'bg-sky-50 text-sky-700 ring-sky-100', icon: History },
  rejected: { badge: 'bg-rose-50 text-rose-700 ring-rose-100', icon: TriangleAlert },
}

function timeAgo(value?: string) {
  if (!value) return '—'
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return '—'
  }
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading activity…
      </div>
    )
  }

  if (!items?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500">
        <Bell className="mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
        <p className="font-medium">No activity yet</p>
        <p className="text-sm">Deploy rules or process change requests to see updates.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {items.map((item) => {
        const key = (item.status || '').toLowerCase()
        const status = statusStyles[key] || statusStyles.pending
        const Icon = status.icon

        return (
          <div key={item.id} className="flex items-start gap-4">
            <span
              className={cn(
                'rounded-full p-2 ring-1 ring-inset transition',
                status.badge,
                'bg-white/60 shadow-sm',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{item.title}</p>
                {item.status && (
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset',
                      status.badge,
                    )}
                  >
                    {item.status.toLowerCase()}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <span>{item.user || 'System'}</span>
                <span>•</span>
                <span>{timeAgo(item.timestamp)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

