"use client"

import type { ComponentType } from 'react'
import { Bell, CheckCircle2, Clock4, History, Loader2, TriangleAlert } from 'lucide-react'
import { UserTimeMeta } from '@/components/UserTimeMeta'
import type { DashboardActivityItem } from '@/types/dashboard'
import { cn } from '@/lib/utils'

interface ActivityFeedProps {
  items: DashboardActivityItem[]
  loading?: boolean
}

const statusStyles: Record<string, { badge: string; icon: ComponentType<{ className?: string }> }> = {
  pending: { badge: 'bg-warning-bg text-warning ring-warning/20', icon: Clock4 },
  approved: { badge: 'bg-success-bg text-success ring-success/20', icon: CheckCircle2 },
  deployed: { badge: 'bg-accent-bg text-accent ring-accent/20', icon: History },
  rejected: { badge: 'bg-error-bg text-error ring-error/20', icon: TriangleAlert },
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-tertiary">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading activity…
      </div>
    )
  }

  if (!items?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-text-tertiary">
        <Bell className="mb-3 h-10 w-10 text-text-muted" strokeWidth={1.5} />
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
                'rounded-lg p-2.5 ring-1 ring-inset transition-smooth',
                status.badge,
                'bg-surface shadow-sm',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-text-primary">{item.title}</p>
                {item.status && (
                  <span
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset',
                      status.badge,
                    )}
                  >
                    {item.status.toLowerCase()}
                  </span>
                )}
              </div>
              <UserTimeMeta
                user={item.user}
                timestamp={item.timestamp}
                relative
                className="mt-1"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

