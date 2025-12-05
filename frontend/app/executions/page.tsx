"use client"
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, RefreshCw, Filter } from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { useAuth } from '@/components/AuthProvider'

export type Execution = {
  id: number
  declarationId: string
  ruleId: number
  ruleName: string
  matched: boolean
  ruleAction?: string
  ruleResult?: string
  ruleScore?: number
  executedAt: string
  executionSource: string
}

export default function ExecutionsPage() {
  const { user, loading: authLoading } = useAuth()
  const [selectedSource, setSelectedSource] = useState<string>('All')
  const [refreshing, setRefreshing] = useState(false)

  const { data: executions, isLoading, error, refetch } = useQuery<Execution[]>({
    queryKey: ['executions', selectedSource],
    queryFn: async () => {
      const source = selectedSource !== 'All' ? selectedSource : undefined
      return fetchApi<Execution[]>(api.rules.executions(source, 200))
    },
    staleTime: 10_000,
    enabled: !authLoading && !!user, // Only fetch when user is loaded and authenticated
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } catch (err) {
      console.error('Failed to refresh executions:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const ActionColor: Record<string, string> = {
    FLAG: 'bg-error-bg text-error ring-1 ring-error/20',
    APPROVE: 'bg-success-bg text-success ring-1 ring-success/20',
    REJECT: 'bg-error-bg text-error ring-1 ring-error/20',
    REVIEW: 'bg-warning-bg text-warning ring-1 ring-warning/20',
    HOLD: 'bg-warning-bg text-warning ring-1 ring-warning/20',
  }

  const SourceColor: Record<string, string> = {
    API: 'bg-accent-bg text-accent ring-1 ring-accent/20',
    UI: 'bg-secondary-bg text-secondary ring-1 ring-secondary/20',
  }

  const getActionColor = (action?: string) => {
    if (!action) return 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border'
    return ActionColor[action] || 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border'
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-error-bg border border-error/20 rounded-lg p-4 text-error">
          Error loading executions. Please try again.
          <button
            onClick={() => refetch()}
            className="ml-4 px-3 py-1.5 bg-error text-white rounded-lg hover:bg-error-light transition-smooth cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Play className="w-6 h-6 text-primary" />
          Rule Executions
        </h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-smooth shadow-sm cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border p-4 shadow-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-tertiary" />
            <span className="text-body-sm font-medium text-text-secondary">Source:</span>
          </div>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="h-9 px-3 border border-border rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth text-text-primary cursor-pointer hover:border-primary/30"
          >
            <option value="All">All</option>
            <option value="API">API</option>
            <option value="UI">UI</option>
          </select>
          {executions && (
            <span className="text-body-sm text-text-tertiary">
              {executions.length} execution{executions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surfaceContainerHigh border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Executed At
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Declaration ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">
                    Loading executions...
                  </td>
                </tr>
              ) : executions && executions.length > 0 ? (
                executions.map((execution) => (
                  <tr key={execution.id} className="hover:bg-surfaceContainerHigh transition-smooth cursor-pointer">
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {formatDateTime(execution.executedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {execution.ruleName}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {execution.declarationId}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {execution.ruleAction ? (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getActionColor(execution.ruleAction)}`}>
                          {execution.ruleAction}
                        </span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {execution.ruleScore !== null && execution.ruleScore !== undefined
                        ? execution.ruleScore.toFixed(2)
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${SourceColor[execution.executionSource] || 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border'}`}>
                        {execution.executionSource}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary max-w-md truncate" title={execution.ruleResult}>
                      {execution.ruleResult || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">
                    No executions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

