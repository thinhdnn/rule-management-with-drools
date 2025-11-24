"use client"

import { type DashboardStatsCardProps, type DashboardAccent } from '@/types/dashboard'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

const accentStyles: Record<DashboardAccent, string> = {
  indigo:
    'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-200',
  green:
    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-200',
  blue:
    'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/20 dark:text-sky-200',
  orange:
    'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/20 dark:text-amber-200',
  pink:
    'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-100 dark:bg-fuchsia-950/20 dark:text-fuchsia-200',
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
    <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900 tracking-tight">{formattedValue}</p>
        </div>
        <div className={cn('rounded-2xl p-3 text-xl', accentStyles[color])}>
          <Icon className="h-6 w-6" strokeWidth={1.6} />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-sm text-slate-500">
          <span
            className={cn(
              'mr-2 rounded-full px-2 py-0.5 text-xs font-medium',
              trend.positive === false ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
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
          'pointer-events-none absolute inset-x-4 bottom-0 h-24 rounded-t-[48px] blur-3xl transition',
          color === 'indigo' && 'bg-indigo-200/40 group-hover:bg-indigo-300/60',
          color === 'green' && 'bg-emerald-200/40 group-hover:bg-emerald-300/60',
          color === 'blue' && 'bg-sky-200/40 group-hover:bg-sky-300/60',
          color === 'orange' && 'bg-amber-200/40 group-hover:bg-amber-300/60',
          color === 'pink' && 'bg-fuchsia-200/40 group-hover:bg-fuchsia-300/60',
        )}
      />
    </div>
  )
}

