"use client"

import { type DashboardStatsCardProps, type DashboardAccent } from '@/types/dashboard'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

const accentStyles: Record<DashboardAccent, string> = {
  indigo:
    'bg-primary-bg text-primary ring-1 ring-inset ring-primary/20',
  green:
    'bg-success-bg text-success ring-1 ring-inset ring-success/20',
  blue:
    'bg-accent-bg text-accent ring-1 ring-inset ring-accent/20',
  orange:
    'bg-warning-bg text-warning ring-1 ring-inset ring-warning/20',
  pink:
    'bg-secondary-bg text-secondary ring-1 ring-inset ring-secondary/20',
}

const formatter = new Intl.NumberFormat('en-US')

export function StatsCard({
  title,
  value,
  icon: Icon,
  color = 'indigo',
  trend,
}: DashboardStatsCardProps) {
  const formattedValue = useMemo(() => formatter.format(value ?? 0), [value])
  const trendPrefix = trend?.positive === false ? '−' : '+'

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-card transition-smooth hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-text-primary tracking-tight">{formattedValue}</p>
        </div>
        <div className={cn('rounded-lg p-3', accentStyles[color])}>
          <Icon className="h-6 w-6" strokeWidth={1.6} />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-sm text-text-tertiary">
          <span
            className={cn(
              'mr-2 rounded-lg px-2.5 py-1 text-xs font-medium',
              trend.positive === false ? 'bg-error-bg text-error' : 'bg-success-bg text-success',
            )}
          >
            {trendPrefix}
            {Math.abs(trend.value)}
          </span>
          <span>{trend.label}</span>
        </div>
      )}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-4 bottom-0 h-24 rounded-t-[48px] blur-3xl opacity-30 transition-opacity group-hover:opacity-40',
          color === 'indigo' && 'bg-primary-lighter',
          color === 'green' && 'bg-success-light',
          color === 'blue' && 'bg-accent-light',
          color === 'orange' && 'bg-warning-light',
          color === 'pink' && 'bg-secondary-light',
        )}
      />
    </div>
  )
}

