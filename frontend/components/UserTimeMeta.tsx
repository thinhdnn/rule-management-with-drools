'use client'

import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelativeTime } from '@/lib/datetime'

type UserTimeMetaProps = {
  user?: string | null
  timestamp?: string | null
  label?: string
  relative?: boolean
  fallbackUser?: string | null
  hideUser?: boolean
  hideTime?: boolean
  className?: string
}

export function UserTimeMeta({
  user,
  timestamp,
  label,
  relative = false,
  fallbackUser = 'System',
  hideUser = false,
  hideTime = false,
  className,
}: UserTimeMetaProps) {
  const resolvedUser = (user && user.trim()) || fallbackUser || null
  const timeText = relative ? formatRelativeTime(timestamp) : formatDateTime(timestamp)

  const showUser = !hideUser && Boolean(resolvedUser)
  const showTime = !hideTime && Boolean(timeText)

  if (!showUser && !showTime) {
    if (!label) {
      return null
    }
    return (
      <div className={cn('flex items-center gap-1.5 text-sm text-text-secondary', className)}>
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-tertiary">—</span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-sm text-text-secondary', className)}>
      {label && <span className="font-medium text-text-primary">{label}</span>}
      {showUser && (
        <span className="font-medium">by {resolvedUser}</span>
      )}
      {showTime && (
        <span className="inline-flex items-center gap-1 font-medium">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {timeText}
        </span>
      )}
    </div>
  )
}

