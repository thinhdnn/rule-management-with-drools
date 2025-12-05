'use client'

import { useEffect, useState } from 'react'
import { LayoutDashboard, Play, FileText, Calendar, AlertCircle, Bell } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { ContainerStatus } from '@/components/dashboard/ContainerStatus'
import { api, fetchApi } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import type {
  ContainerStatusResponse,
  DashboardActivityItem,
  DashboardData,
} from '@/types/dashboard'

interface RuleSummary {
  status?: string
}

interface ChangeRequestSummary {
  id: string
  title: string
  status: string
  createdBy?: string
  createdAt?: string
  changeRequestId?: string | number
  factType?: string
  scheduledTime?: string
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData>({
    totalRules: 0,
    activeRules: 0,
    pendingRequests: 0,
    upcomingDeployments: [],
    recentActivity: [],
    containerStatus: [],
  })

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true)

        // Fetch all data in parallel
        const [
          rules,
          pendingRequests,
          upcomingDeployments,
          allRequests,
          containerStatusResponse
        ] = await Promise.all([
          fetchApi<RuleSummary[]>(api.rules.list()),
          fetchApi<ChangeRequestSummary[]>(api.changeRequests.list(undefined, 'PENDING')),
          fetchApi<ChangeRequestSummary[]>(api.changeRequests.scheduledDeployments.upcoming()),
          fetchApi<ChangeRequestSummary[]>(api.changeRequests.list()),
          fetchApi<ContainerStatusResponse>(api.rules.containersStatus())
        ])

        // Process data
        const activeRulesCount = rules.filter((r) => r.status === 'ACTIVE').length

        // Format recent activity
        const recentActivity: DashboardActivityItem[] = allRequests.slice(0, 5).map((req) => ({
          id: req.id,
          type: 'CHANGE_REQUEST',
          title: req.title,
          status: req.status,
          user: req.createdBy || 'Unknown', // API might not return user name directly, using ID for now
          timestamp: req.createdAt
        }))

        setData({
          totalRules: rules.length,
          activeRules: activeRulesCount,
          pendingRequests: pendingRequests.length,
          upcomingDeployments: upcomingDeployments.map((dep) => ({
            id: dep.id,
            changeRequestId: dep.changeRequestId,
            factType: dep.factType,
            status: dep.status,
            scheduledTime: dep.scheduledTime,
          })),
          recentActivity,
          containerStatus: containerStatusResponse.containers || []
        })
        setLastUpdated(new Date().toLocaleTimeString())
      } catch (err: any) {
        console.error('Failed to load dashboard data:', err)
        setError(err.message || 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-error-bg border border-error/20 rounded-lg p-4 flex items-center text-error">
          <AlertCircle className="mr-2" size={20} />
          <p>Error loading dashboard: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
        {/* Header Section */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, here's what's happening with your rules.
          </p>
          </div>
          <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm text-text-tertiary shadow-sm">
              Last updated: {lastUpdated}
            </span>
          )}
          </div>
        </div>

        {/* Stats Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Rules"
            value={data.totalRules}
            icon={LayoutDashboard}
            color="indigo"
            trend={{ value: 12, label: 'vs last month', positive: true }}
          />
          <StatsCard
            title="Active Rules"
            value={data.activeRules}
            icon={Play}
            color="green"
            trend={{ value: 5, label: 'new this week', positive: true }}
          />
        <StatsCard title="Pending Requests" value={data.pendingRequests} icon={FileText} color="orange" />
          <StatsCard
            title="Upcoming Deployments"
            value={data.upcomingDeployments.length}
            icon={Calendar}
            color="blue"
          />
        </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        {/* System Health */}
        <section className="flex flex-col">
          <div className="mb-6">
            <h2 className="section-title">System Health</h2>
          </div>
          <div className="flex-1 rounded-xl border border-border bg-surface p-6 shadow-card">
            <ContainerStatus containers={data.containerStatus} />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 items-stretch">
          {/* Change Request Activity */}
          <section className="flex flex-col">
            <div className="mb-6">
              <h2 className="section-title">Change Request Activity</h2>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-surface p-6 shadow-card">
              <ActivityFeed items={data.recentActivity} loading={loading} />
            </div>
          </section>

          {/* Scheduled Deployments */}
          <section className="flex flex-col">
            <div className="mb-6">
              <h2 className="section-title">Scheduled Deployments</h2>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-surface p-6 shadow-card">
              {data.upcomingDeployments.length ? (
                <ul className="space-y-4">
                  {data.upcomingDeployments.slice(0, 4).map((deployment) => (
                    <li key={deployment.id} className="rounded-lg border border-border bg-surfaceContainerHigh p-3">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {deployment.factType || 'Unknown Type'}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            CR #{deployment.changeRequestId ?? deployment.id}
                          </p>
                        </div>
                        <span className="rounded-lg bg-success-bg px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-success/20">
                          {deployment.status?.toLowerCase()}
                        </span>
                      </div>
                      {deployment.scheduledTime && (
                        <p className="mt-2 text-xs text-text-tertiary">
                          {formatDateTime(deployment.scheduledTime) || '-'}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-text-tertiary">
                  <Bell className="mb-3 h-10 w-10 text-text-muted" strokeWidth={1.5} />
                  <p className="font-medium">No upcoming deployments</p>
                  <p className="text-sm">
                    Approve a change request with scheduled deploy to see it here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

