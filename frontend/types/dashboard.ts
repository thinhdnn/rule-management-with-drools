import type { LucideIcon } from 'lucide-react'

export interface DashboardStatsCardProps {
  title: string
  value: number
  icon: LucideIcon
  color?: DashboardAccent
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
}

export type DashboardAccent = 'indigo' | 'green' | 'blue' | 'orange' | 'pink'

export interface DashboardActivityItem {
  id: string | number
  type: string
  title: string
  status?: string
  user?: string
  timestamp?: string
}

export interface ContainerStatusItem {
  factType: string
  exists?: boolean | null
  valid?: boolean | null
  version?: number | null
  releaseId?: string | null
  rulesHash?: string | null
  ruleCount?: number | null
  message?: string | null
  error?: string | null
}

export interface ContainerStatusResponse {
  containers?: ContainerStatusItem[]
  totalContainers?: number | null
  factTypes?: string[]
}

export interface ScheduledDeploymentItem {
  id: string | number
  changeRequestId?: string | number
  factType?: string
  status?: string
  scheduledTime?: string
}

export interface DashboardData {
  totalRules: number
  activeRules: number
  pendingRequests: number
  upcomingDeployments: ScheduledDeploymentItem[]
  recentActivity: DashboardActivityItem[]
  containerStatus: ContainerStatusItem[]
}

