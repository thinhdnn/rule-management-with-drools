'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Calendar,
  Filter,
  FileCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import type { Execution } from '@/app/executions/page'
import type { ChangeRequest } from '@/app/change-requests/page'

interface ReportStats {
  totalExecutions: number
  executionsBySource: Record<string, number>
  executionsByAction: Record<string, number>
  executionsByDay: Array<{ date: string; count: number }>
  totalChangeRequests: number
  changeRequestsByStatus: Record<string, number>
  changeRequestsByFactType: Record<string, number>
  averageScore: number
  totalRules: number
  activeRules: number
}

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth()
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const [selectedFactType, setSelectedFactType] = useState<string>('All')
  const [refreshing, setRefreshing] = useState(false)
  const [factTypes, setFactTypes] = useState<string[]>([])

  // Load fact types
  useEffect(() => {
    const loadFactTypes = async () => {
      try {
        const types = await fetchApi<string[]>(api.rules.factTypes())
        setFactTypes(types.length > 0 ? types : ['Declaration'])
      } catch (err) {
        console.error('Failed to load fact types:', err)
        setFactTypes(['Declaration'])
      }
    }
    loadFactTypes()
  }, [])

  // Fetch executions
  const { data: executions, isLoading: executionsLoading, refetch: refetchExecutions } = useQuery<Execution[]>({
    queryKey: ['executions', dateRange],
    queryFn: async () => {
      return fetchApi<Execution[]>(api.rules.executions(undefined, 1000))
    },
    staleTime: 30_000,
    enabled: !authLoading && !!user,
  })

  // Fetch change requests
  const { data: changeRequests, isLoading: changeRequestsLoading } = useQuery<ChangeRequest[]>({
    queryKey: ['changeRequests', 'all'],
    queryFn: async () => {
      return fetchApi<ChangeRequest[]>(api.changeRequests.list())
    },
    staleTime: 30_000,
    enabled: !authLoading && !!user,
  })

  // Fetch rules
  const { data: rules, isLoading: rulesLoading } = useQuery<any[]>({
    queryKey: ['rules', 'all'],
    queryFn: async () => {
      return fetchApi<any[]>(api.rules.list())
    },
    staleTime: 30_000,
    enabled: !authLoading && !!user,
  })

  // Calculate statistics
  const stats: ReportStats = (() => {
    if (!executions || !changeRequests || !rules) {
      return {
        totalExecutions: 0,
        executionsBySource: {},
        executionsByAction: {},
        executionsByDay: [],
        totalChangeRequests: 0,
        changeRequestsByStatus: {},
        changeRequestsByFactType: {},
        averageScore: 0,
        totalRules: 0,
        activeRules: 0,
      }
    }

    // Filter by date range
    const now = new Date()
    const dateFilter = (date: string) => {
      if (dateRange === 'all') return true
      const execDate = new Date(date)
      const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      return execDate >= new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    }

    const filteredExecutions = executions.filter((e) => dateFilter(e.executedAt))

    // Executions by source
    const executionsBySource: Record<string, number> = {}
    filteredExecutions.forEach((e) => {
      executionsBySource[e.executionSource] = (executionsBySource[e.executionSource] || 0) + 1
    })

    // Executions by action
    const executionsByAction: Record<string, number> = {}
    filteredExecutions.forEach((e) => {
      const action = e.ruleAction || 'NONE'
      executionsByAction[action] = (executionsByAction[action] || 0) + 1
    })

    // Executions by day
    const executionsByDayMap: Record<string, number> = {}
    filteredExecutions.forEach((e) => {
      const date = new Date(e.executedAt).toISOString().split('T')[0]
      executionsByDayMap[date] = (executionsByDayMap[date] || 0) + 1
    })
    const executionsByDay = Object.entries(executionsByDayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14) // Last 14 days

    // Change requests by status
    const changeRequestsByStatus: Record<string, number> = {}
    changeRequests.forEach((cr) => {
      changeRequestsByStatus[cr.status] = (changeRequestsByStatus[cr.status] || 0) + 1
    })

    // Change requests by fact type
    const changeRequestsByFactType: Record<string, number> = {}
    changeRequests.forEach((cr) => {
      changeRequestsByFactType[cr.factType] = (changeRequestsByFactType[cr.factType] || 0) + 1
    })

    // Average score
    const scores = filteredExecutions
      .map((e) => e.ruleScore)
      .filter((s): s is number => s !== null && s !== undefined)
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

    // Rules stats
    const activeRules = rules.filter((r) => r.status === 'ACTIVE').length

    return {
      totalExecutions: filteredExecutions.length,
      executionsBySource,
      executionsByAction,
      executionsByDay,
      totalChangeRequests: changeRequests.length,
      changeRequestsByStatus,
      changeRequestsByFactType,
      averageScore,
      totalRules: rules.length,
      activeRules,
    }
  })()

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetchExecutions()])
    } catch (err) {
      console.error('Failed to refresh reports:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const isLoading = executionsLoading || changeRequestsLoading || rulesLoading

  // Calculate max value for bar charts
  const maxExecutionsByDay = Math.max(...stats.executionsByDay.map((d) => d.count), 1)
  const maxExecutionsBySource = Math.max(...Object.values(stats.executionsBySource), 1)
  const maxExecutionsByAction = Math.max(...Object.values(stats.executionsByAction), 1)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Reports & Analytics
          </h1>
          <p className="page-subtitle">
            Comprehensive insights into rule executions, change requests, and system performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-smooth shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border p-4 shadow-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-text-tertiary" />
            <span className="text-body-sm font-medium text-text-secondary">Date Range:</span>
          </div>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
            className="h-9 px-3 border border-border rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth text-text-primary bg-surface cursor-pointer hover:border-primary/30"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-tertiary" />
            <span className="text-body-sm font-medium text-text-secondary">Fact Type:</span>
          </div>
          <select
            value={selectedFactType}
            onChange={(e) => setSelectedFactType(e.target.value)}
            className="h-9 px-3 border border-border rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth text-text-primary bg-surface cursor-pointer hover:border-primary/30"
          >
            <option value="All">All</option>
            {factTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Executions"
              value={stats.totalExecutions.toLocaleString()}
              icon={Activity}
              color="indigo"
              trend={{ value: '+12%', positive: true }}
            />
            <MetricCard
              title="Change Requests"
              value={stats.totalChangeRequests.toLocaleString()}
              icon={BarChart3}
              color="blue"
            />
            <MetricCard
              title="Active Rules"
              value={`${stats.activeRules} / ${stats.totalRules}`}
              icon={CheckCircle}
              color="green"
            />
            <MetricCard
              title="Average Score"
              value={stats.averageScore.toFixed(2)}
              icon={TrendingUp}
              color="purple"
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Executions Over Time */}
            <ChartCard title="Executions Over Time" icon={TrendingUp}>
              {stats.executionsByDay.length > 0 ? (
                <div className="space-y-3">
                  {stats.executionsByDay.map((day) => (
                    <div key={day.date} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-text-tertiary">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex-1">
                        <div className="relative h-6 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-full overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{ width: `${(day.count / maxExecutionsByDay) * 100}%` }}
                          >
                            <span className="text-xs font-medium text-white">{day.count}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-text-tertiary">
                  <p>No execution data available for the selected period</p>
                </div>
              )}
            </ChartCard>

            {/* Executions by Source */}
            <ChartCard title="Executions by Source" icon={Activity}>
              {Object.keys(stats.executionsBySource).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.executionsBySource)
                    .sort(([, a], [, b]) => b - a)
                    .map(([source, count]) => (
                      <div key={source} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-text-secondary font-medium">{source}</div>
                        <div className="flex-1">
                          <div className="relative h-6 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                              style={{ width: `${(count / maxExecutionsBySource) * 100}%` }}
                            >
                              <span className="text-xs font-medium text-white">{count}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-text-tertiary">
                  <p>No source data available</p>
                </div>
              )}
            </ChartCard>

            {/* Executions by Action */}
            <ChartCard title="Executions by Action" icon={AlertCircle}>
              {Object.keys(stats.executionsByAction).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.executionsByAction)
                    .sort(([, a], [, b]) => b - a)
                    .map(([action, count]) => {
                      const color =
                        action === 'APPROVE'
                          ? 'bg-success'
                          : action === 'REJECT' || action === 'FLAG'
                          ? 'bg-error'
                          : action === 'REVIEW' || action === 'HOLD'
                          ? 'bg-warning'
                          : 'bg-primary'
                      return (
                        <div key={action} className="flex items-center gap-3">
                          <div className="w-24 text-sm text-text-secondary font-medium">{action}</div>
                          <div className="flex-1">
                            <div className="relative h-6 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-full overflow-hidden">
                              <div
                                className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                                style={{ width: `${(count / maxExecutionsByAction) * 100}%` }}
                              >
                                <span className="text-xs font-medium text-white">{count}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="text-center py-8 text-text-tertiary">
                  <p>No action data available</p>
                </div>
              )}
            </ChartCard>

            {/* Change Requests by Status */}
            <ChartCard title="Change Requests by Status" icon={FileCheck}>
              {Object.keys(stats.changeRequestsByStatus).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.changeRequestsByStatus)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const color =
                        status === 'Approved'
                          ? 'bg-success'
                          : status === 'Rejected'
                          ? 'bg-error'
                          : status === 'Pending'
                          ? 'bg-warning'
                          : 'bg-surfaceContainerHigh'
                      return (
                        <div key={status} className="flex items-center gap-3">
                          <div className="w-24 text-sm text-text-secondary font-medium">{status}</div>
                          <div className="flex-1">
                            <div className="relative h-6 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-full overflow-hidden">
                              <div
                                className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                                style={{ width: `${(count / stats.totalChangeRequests) * 100}%` }}
                              >
                                <span className="text-xs font-medium text-white">{count}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="text-center py-8 text-text-tertiary">
                  <p>No change request data available</p>
                </div>
              )}
            </ChartCard>
          </div>

          {/* Change Requests by Fact Type */}
          {Object.keys(stats.changeRequestsByFactType).length > 0 && (
            <ChartCard title="Change Requests by Fact Type" icon={BarChart3} fullWidth>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(stats.changeRequestsByFactType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([factType, count]) => (
                    <div
                      key={factType}
                      className="bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-lg p-4 border border-border"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-primary">{factType}</span>
                        <span className="text-lg font-bold text-primary">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string
  icon: LucideIcon
  color: 'indigo' | 'blue' | 'green' | 'purple' | 'orange' | 'red'
  trend?: { value: string; positive: boolean }
}

function MetricCard({ title, value, icon: Icon, color, trend }: MetricCardProps) {
  const colorClasses = {
    indigo: 'bg-indigo-500 text-white',
    blue: 'bg-blue-500 text-white',
    green: 'bg-green-500 text-white',
    purple: 'bg-purple-500 text-white',
    orange: 'bg-orange-500 text-white',
    red: 'bg-red-500 text-white',
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-6 shadow-card cursor-pointer hover:shadow-card-hover transition-smooth">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon size={20} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs ${trend.positive ? 'text-success' : 'text-error'}`}>
            {trend.positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trend.value}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-text-primary mb-1">{value}</div>
      <div className="text-sm text-text-tertiary">{title}</div>
    </div>
  )
}

interface ChartCardProps {
  title: string
  icon: LucideIcon
  children: React.ReactNode
  fullWidth?: boolean
}

function ChartCard({ title, icon: Icon, children, fullWidth }: ChartCardProps) {
  return (
    <div className={`bg-surface rounded-lg border border-border p-6 shadow-card ${fullWidth ? 'col-span-1 lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 mb-6">
        <Icon className="w-5 h-5 text-primary" />
        <h2 className="section-title">{title}</h2>
      </div>
      {children}
    </div>
  )
}

