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
    FLAG: 'bg-red-100 text-red-700',
    APPROVE: 'bg-green-100 text-green-700',
    REJECT: 'bg-red-100 text-red-700',
    REVIEW: 'bg-yellow-100 text-yellow-700',
    HOLD: 'bg-orange-100 text-orange-700',
  }

  const SourceColor: Record<string, string> = {
    API: 'bg-blue-100 text-blue-700',
    UI: 'bg-purple-100 text-purple-700',
  }

  const getActionColor = (action?: string) => {
    if (!action) return 'bg-slate-100 text-slate-700'
    return ActionColor[action] || 'bg-slate-100 text-slate-700'
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
          Error loading executions. Please try again.
          <button
            onClick={() => refetch()}
            className="ml-4 px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Play className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Rule Executions</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Source:</span>
          </div>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="px-3 py-1 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All</option>
            <option value="API">API</option>
            <option value="UI">UI</option>
          </select>
          {executions && (
            <span className="text-sm text-slate-500">
              {executions.length} execution{executions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Executed At
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Declaration ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading executions...
                  </td>
                </tr>
              ) : executions && executions.length > 0 ? (
                executions.map((execution) => (
                  <tr key={execution.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {formatDateTime(execution.executedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {execution.ruleName}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {execution.declarationId}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {execution.ruleAction ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(execution.ruleAction)}`}>
                          {execution.ruleAction}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {execution.ruleScore !== null && execution.ruleScore !== undefined
                        ? execution.ruleScore.toFixed(2)
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${SourceColor[execution.executionSource] || 'bg-slate-100 text-slate-700'}`}>
                        {execution.executionSource}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-md truncate" title={execution.ruleResult}>
                      {execution.ruleResult || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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

