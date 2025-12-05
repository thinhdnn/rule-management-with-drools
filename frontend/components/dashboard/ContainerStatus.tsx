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
  healthy: 'bg-success-bg text-success ring-success/20',
  warning: 'bg-warning-bg text-warning ring-warning/20',
  error: 'bg-error-bg text-error ring-error/20',
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
      <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-tertiary">
        <Shield className="mx-auto mb-3 h-10 w-10 text-text-muted" />
        <p className="font-medium">No containers detected</p>
        <p className="text-sm">Deploy at least one fact type to monitor its health.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Summary Panel */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-xs font-medium text-text-tertiary">Healthy</p>
              <p className="text-lg font-semibold text-text-primary">{summary.healthy}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            <div>
              <p className="text-xs font-medium text-text-tertiary">Warning</p>
              <p className="text-lg font-semibold text-text-primary">{summary.warning}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-error" />
            <div>
              <p className="text-xs font-medium text-text-tertiary">Error</p>
              <p className="text-lg font-semibold text-text-primary">{summary.error}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Shield className="h-5 w-5 text-text-muted" />
            <div>
              <p className="text-xs font-medium text-text-tertiary">Total</p>
              <p className="text-lg font-semibold text-text-primary">{containers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Container List */}
      <div className="flex-1 rounded-xl border border-border bg-surface p-4 overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2">
          {containers.map((container) => {
            const state = resolveState(container)
            return (
              <div key={container.factType} className="flex flex-col gap-2 rounded-lg bg-surfaceContainerHigh p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {container.factType}
                    </p>
                    <p className="text-lg font-semibold text-text-primary">
                      {container.ruleCount ?? 0} rules
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium ring-1 ring-inset',
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
                  <div className="rounded-lg bg-surface px-3 py-2 text-xs text-text-tertiary">
                    <RefreshCcw className="mr-2 inline h-3.5 w-3.5 text-text-muted" />
                    {cleanMessage(container.message)}
                  </div>
                )}
                {container.error && (
                  <div className="rounded-lg border border-error/20 bg-error-bg px-3 py-2 text-xs text-error">
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

