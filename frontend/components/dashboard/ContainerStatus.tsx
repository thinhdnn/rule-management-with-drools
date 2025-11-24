"use client"

import { AlertCircle, CheckCircle2, RefreshCcw, Shield, TriangleAlert } from 'lucide-react'
import type { ContainerStatusItem } from '@/types/dashboard'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface ContainerStatusProps {
  containers: ContainerStatusItem[]
}

type ContainerHealthState = 'healthy' | 'warning' | 'error'

const badgeByState: Record<ContainerHealthState, string> = {
  healthy: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  error: 'bg-rose-50 text-rose-700 ring-rose-100',
}

function resolveState(container: ContainerStatusItem): ContainerHealthState {
  if (!container.exists || container.error) return 'error'
  if (!container.valid) return 'warning'
  return 'healthy'
}

export function ContainerStatus({ containers }: ContainerStatusProps) {
  const summary = useMemo(() => {
    return containers.reduce(
      (acc, container) => {
        const state = resolveState(container)
        acc[state] += 1
        return acc
      },
      { healthy: 0, warning: 0, error: 0 },
    )
  }, [containers])

  const cleanMessage = (message?: string | null) => {
    if (!message) return null
    if (message.trim() === 'Container is valid and can create sessions') {
      return null
    }
    return message
  }

  if (!containers?.length) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-500">
        <Shield className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="font-medium">No containers detected</p>
        <p className="text-sm">Deploy at least one fact type to monitor its health.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Summary Panel */}
      <div className="rounded-xl border border-slate-100 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-xs font-medium text-slate-500">Healthy</p>
              <p className="text-lg font-semibold text-slate-900">{summary.healthy}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs font-medium text-slate-500">Warning</p>
              <p className="text-lg font-semibold text-slate-900">{summary.warning}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-rose-500" />
            <div>
              <p className="text-xs font-medium text-slate-500">Error</p>
              <p className="text-lg font-semibold text-slate-900">{summary.error}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs font-medium text-slate-500">Total</p>
              <p className="text-lg font-semibold text-slate-900">{containers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Container List */}
      <div className="flex-1 rounded-xl border border-slate-100 bg-white p-4 overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2">
          {containers.map((container) => {
            const state = resolveState(container)
            return (
              <div key={container.factType} className="flex flex-col gap-2 rounded-lg bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {container.factType}
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {container.ruleCount ?? 0} rules
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset',
                      badgeByState[state],
                    )}
                  >
                    {state === 'healthy' && <CheckCircle2 className="h-4 w-4" />}
                    {state === 'warning' && <AlertCircle className="h-4 w-4" />}
                    {state === 'error' && <TriangleAlert className="h-4 w-4" />}
                    {state}
                  </span>
                </div>
                {cleanMessage(container.message) && (
                  <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500">
                    <RefreshCcw className="mr-2 inline h-3.5 w-3.5 text-slate-400" />
                    {cleanMessage(container.message)}
                  </div>
                )}
                {container.error && (
                  <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {container.error}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

