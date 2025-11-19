"use client"
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api, fetchApi } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import { FileCheck, Plus, CheckCircle, XCircle, Package, Clock, Eye, ExternalLink } from 'lucide-react'

export type ChangeRequest = {
  id: number
  factType: string
  title: string
  description?: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
  changesJson?: string
  approvedBy?: string
  approvedDate?: string
  rejectedBy?: string
  rejectedDate?: string
  rejectionReason?: string
  createdAt?: string
  createdBy?: string
}

export default function ChangeRequestsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [factTypes, setFactTypes] = useState<string[]>([])
  const [selectedFactType, setSelectedFactType] = useState<string>('All')
  const [selectedStatus, setSelectedStatus] = useState<string>('All')
  const [currentTab, setCurrentTab] = useState<'requests' | 'scheduled'>('requests')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequest | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showDeploymentModal, setShowDeploymentModal] = useState(false)
  const [deploymentOption, setDeploymentOption] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE')
  const [scheduledTime, setScheduledTime] = useState<string>('')
  const [deploymentNotes, setDeploymentNotes] = useState<string>('')
  const [changeRequestRules, setChangeRequestRules] = useState<Map<number, any>>(new Map())
  const [createForm, setCreateForm] = useState({
    factType: 'Declaration',
    title: '',
    description: '',
  })
  const [previewChanges, setPreviewChanges] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRules, setPreviewRules] = useState<Map<number, any>>(new Map())

  // Check if current user is administrator
  const isAdministrator = user?.roles?.includes('RULE_ADMINISTRATOR') ?? false

  // Load fact types on mount
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

  // Fetch change requests
  const { data: changeRequests, isLoading, refetch } = useQuery<ChangeRequest[]>({
    queryKey: ['changeRequests', selectedFactType, selectedStatus],
    queryFn: async () => {
      const factType = selectedFactType !== 'All' ? selectedFactType : undefined
      const status = selectedStatus !== 'All' ? selectedStatus : undefined
      return fetchApi<ChangeRequest[]>(api.changeRequests.list(factType, status))
    },
    staleTime: 10_000,
  })

  // Load preview changes when fact type changes
  useEffect(() => {
    if (showCreateModal) {
      loadPreviewChanges()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createForm.factType, showCreateModal])

  const loadPreviewChanges = async () => {
    setPreviewLoading(true)
    try {
      const response = await fetchApi<any>(api.changeRequests.previewChanges(createForm.factType))
      setPreviewChanges(response)
      
      // Load rules for preview
      if (response?.changes) {
        const allRuleIds = [
          ...(response.changes.rulesToInclude || []),
          ...(response.changes.rulesToExclude || [])
        ]
        
        if (allRuleIds.length > 0) {
          const rulesData = await fetchApi<any[]>(api.rules.list())
          const rulesMap = new Map()
          rulesData.forEach((rule: any) => {
            if (allRuleIds.includes(rule.id)) {
              rulesMap.set(rule.id, rule)
            }
          })
          setPreviewRules(rulesMap)
        }
      }
    } catch (err) {
      console.error('Failed to load preview:', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Query for scheduled deployments
  const { data: scheduledDeployments, refetch: refetchScheduled } = useQuery<any[]>({
    queryKey: ['scheduled-deployments'],
    queryFn: async () => {
      const response = await fetchApi<any[]>(api.changeRequests.scheduledDeployments.list())
      return response
    },
    enabled: currentTab === 'scheduled',
  })

  const handleCreate = async () => {
    try {
      const payload = {
        factType: createForm.factType,
        title: createForm.title,
        description: createForm.description,
      }

      const response = await fetchApi<any>(api.changeRequests.create(), {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setShowCreateModal(false)
      setCreateForm({
        factType: 'Declaration',
        title: '',
        description: '',
      })
      refetch()
      alert(response.message || 'Change request created successfully!')
    } catch (err) {
      console.error('Failed to create change request:', err)
      alert(err instanceof Error ? err.message : 'Failed to create change request')
    }
  }

  const handleApprove = async (id: number) => {
    // Find the change request to approve
    const crToApprove = changeRequests?.find((cr: ChangeRequest) => cr.id === id)
    if (!crToApprove) return
    
    // Show deployment options modal
    setSelectedChangeRequest(crToApprove)
    setDeploymentOption('IMMEDIATE')
    setScheduledTime('')
    setDeploymentNotes('')
    setShowDeploymentModal(true)
  }

  const handleConfirmApprove = async () => {
    if (!selectedChangeRequest) return

    // Validate scheduled deployment
    if (deploymentOption === 'SCHEDULED') {
      if (!scheduledTime) {
        alert('Please select a scheduled time')
        return
      }
      const scheduled = new Date(scheduledTime)
      if (scheduled <= new Date()) {
        alert('Scheduled time must be in the future')
        return
      }
    }

    try {
      const requestBody: any = {
        deploymentOption,
      }

      if (deploymentOption === 'SCHEDULED') {
        requestBody.scheduledTime = new Date(scheduledTime).toISOString()
        if (deploymentNotes) {
          requestBody.deploymentNotes = deploymentNotes
        }
      }

      await fetchApi(api.changeRequests.approve(selectedChangeRequest.id), {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      setShowDeploymentModal(false)
      setSelectedChangeRequest(null)
      refetch()

      if (deploymentOption === 'IMMEDIATE') {
        alert('Change request approved and rules deployed successfully!')
      } else {
        alert(`Change request approved! Deployment scheduled for ${new Date(scheduledTime).toLocaleString()}`)
      }
    } catch (err) {
      console.error('Failed to approve change request:', err)
      alert(err instanceof Error ? err.message : 'Failed to approve change request')
    }
  }

  const handleReject = async (id: number) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      await fetchApi(api.changeRequests.reject(id), {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: reason }),
      })
      refetch()
      alert('Change request rejected successfully!')
    } catch (err) {
      console.error('Failed to reject change request:', err)
      alert(err instanceof Error ? err.message : 'Failed to reject change request')
    }
  }

  const handleCancel = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this change request?')) {
      return
    }

    try {
      await fetchApi(api.changeRequests.cancel(id), {
        method: 'POST',
      })
      refetch()
      alert('Change request cancelled successfully!')
    } catch (err) {
      console.error('Failed to cancel change request:', err)
      alert(err instanceof Error ? err.message : 'Failed to cancel change request')
    }
  }

  const handleViewDetail = async (changeRequest: ChangeRequest) => {
    setSelectedChangeRequest(changeRequest)
    setShowDetailModal(true)

    // Parse changes JSON and load rule details
    if (changeRequest.changesJson) {
      try {
        const changes = JSON.parse(changeRequest.changesJson)
        const allRuleIds = [
          ...(changes.rulesToAdd || []),
          ...(changes.rulesToUpdate || []),
          ...(changes.rulesToDelete || []),
        ]

        // Load rule details for all rule IDs
        const rulesMap = new Map<number, any>()
        await Promise.all(
          allRuleIds.map(async (ruleId: number) => {
            try {
              const rule = await fetchApi(api.rules.get(ruleId.toString()))
              rulesMap.set(ruleId, rule)
            } catch (err) {
              console.error(`Failed to load rule ${ruleId}:`, err)
            }
          })
        )
        setChangeRequestRules(rulesMap)
      } catch (err) {
        console.error('Failed to parse changes JSON:', err)
      }
    }
  }

  const handleViewRule = (ruleId: number) => {
    router.push(`/rules/${ruleId}`)
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium'
    switch (status) {
      case 'Pending':
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <Clock className="w-3 h-3" />
            Pending
          </span>
        )
      case 'Approved':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        )
      case 'Rejected':
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        )
      case 'Cancelled':
        return (
          <span className={`${baseClasses} bg-slate-100 text-slate-800`}>
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        )
      default:
        return <span className={baseClasses}>{status}</span>
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileCheck className="w-6 h-6" />
          Change Requests
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus-ring"
        >
          <Plus size={16} />
          New Change Request
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setCurrentTab('requests')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            currentTab === 'requests'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          Change Requests
          {changeRequests && changeRequests.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
              {changeRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setCurrentTab('scheduled')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            currentTab === 'scheduled'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Clock className="w-4 h-4 inline mr-2" />
          Scheduled Deployments
          {scheduledDeployments && scheduledDeployments.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
              {scheduledDeployments.length}
            </span>
          )}
        </button>
      </div>

      {/* Filters (only show for change requests tab) */}
      {currentTab === 'requests' && (
        <div className="flex items-center gap-4 bg-white border border-outlineVariant rounded-md p-4">
        {/* Fact Type Filter */}
        <div className="flex items-center gap-2">
          <Package size={16} className="text-slate-500" />
          <label className="text-sm font-medium text-slate-700">Fact Type:</label>
          <select
            value={selectedFactType}
            onChange={(e) => setSelectedFactType(e.target.value)}
            className="px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
          >
            <option value="All">All</option>
            {factTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Status:</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
          >
            <option value="All">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      )}

      {/* Change Requests List */}
      {currentTab === 'requests' && (
      <div className="bg-white border border-outlineVariant rounded-md overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : !changeRequests || changeRequests.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No change requests found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-outlineVariant">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Fact Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outlineVariant">
                {changeRequests.map((cr) => (
                  <tr
                    key={cr.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => handleViewDetail(cr)}
                  >
                    <td className="px-4 py-3 text-sm text-slate-900">#{cr.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{cr.title}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{cr.factType}</td>
                    <td className="px-4 py-3">{getStatusBadge(cr.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {cr.createdAt ? new Date(cr.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewDetail(cr)}
                          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 focus-ring flex items-center gap-1"
                          title="View Details"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                        {cr.status === 'Pending' && isAdministrator && (
                          <>
                            <button
                              onClick={() => handleApprove(cr.id)}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 focus-ring"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(cr.id)}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 focus-ring"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {cr.status === 'Pending' && user?.id === cr.createdBy && (
                          <button
                            onClick={() => handleCancel(cr.id)}
                            className="px-3 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-700 focus-ring"
                          >
                            Cancel
                          </button>
                        )}
                        {cr.status === 'Rejected' && cr.rejectionReason && (
                          <span className="text-xs text-red-600" title={cr.rejectionReason}>
                            {cr.rejectionReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Scheduled Deployments View */}
      {currentTab === 'scheduled' && (
        <div className="bg-white border border-outlineVariant rounded-md overflow-hidden">
          {!scheduledDeployments ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : scheduledDeployments.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Clock className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p>No scheduled deployments found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-outlineVariant">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Fact Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Scheduled Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Retries</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Notes</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outlineVariant">
                  {scheduledDeployments.map((deployment: any) => (
                    <tr key={deployment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900">#{deployment.id}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                          {deployment.factType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {new Date(deployment.scheduledTime).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {deployment.status === 'PENDING' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </span>
                        )}
                        {deployment.status === 'EXECUTING' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Clock className="w-3 h-3 mr-1 animate-spin" />
                            Executing
                          </span>
                        )}
                        {deployment.status === 'COMPLETED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </span>
                        )}
                        {deployment.status === 'FAILED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3 mr-1" />
                            Failed
                          </span>
                        )}
                        {deployment.status === 'CANCELLED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                            Cancelled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {deployment.retryCount} / {deployment.maxRetries}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {deployment.deploymentNotes || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {deployment.status === 'PENDING' && (
                          <button
                            onClick={async () => {
                              if (confirm('Cancel this scheduled deployment?')) {
                                try {
                                  await fetchApi(api.changeRequests.scheduledDeployments.cancel(deployment.id), {
                                    method: 'POST',
                                  })
                                  refetchScheduled()
                                  alert('Deployment cancelled successfully')
                                } catch (err) {
                                  console.error('Failed to cancel deployment:', err)
                                  alert(err instanceof Error ? err.message : 'Failed to cancel deployment')
                                }
                              }
                            }}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Cancel
                          </button>
                        )}
                        {deployment.status === 'FAILED' && deployment.errorMessage && (
                          <span className="text-xs text-red-600" title={deployment.errorMessage}>
                            Error: {deployment.errorMessage.substring(0, 50)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-outlineVariant">
              <h2 className="text-xl font-semibold">Create Change Request</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Fact Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fact Type</label>
                <select
                  value={createForm.factType}
                  onChange={(e) => setCreateForm({ ...createForm, factType: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                >
                  {factTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                  placeholder="e.g., Update Declaration Rules for Q1 2025"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                  rows={4}
                  placeholder="Describe what was changed and why (e.g., Added new high-risk rules for Q1 2025, Updated threshold values, Deactivated obsolete rules...)"
                />
              </div>

              {/* Preview Changes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Detected Changes (vs Last Deployed Version)
                </label>
                
                {previewLoading ? (
                  <div className="border border-outlineVariant rounded-md p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <p className="text-sm text-slate-600 mt-2">Detecting changes...</p>
                  </div>
                ) : previewChanges ? (
                  <>
                    {/* Summary */}
                    <div className="bg-slate-50 border border-outlineVariant rounded-md p-3 mb-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 font-medium">Total Changes:</span>
                        <span className="text-slate-900 font-semibold">{previewChanges.totalChanges || 0}</span>
                      </div>
                      {previewChanges.totalChanges > 0 && (
                        <div className="mt-2 flex gap-4 text-xs">
                          {previewChanges.changes?.rulesToInclude?.length > 0 && (
                            <span className="text-green-700">
                              ✓ {previewChanges.changes.rulesToInclude.length} Added/Modified
                            </span>
                          )}
                          {previewChanges.changes?.rulesToExclude?.length > 0 && (
                            <span className="text-red-700">
                              ✗ {previewChanges.changes.rulesToExclude.length} Removed
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Changes Table */}
                    {previewChanges.totalChanges > 0 ? (
                      <div className="border border-outlineVariant rounded-md overflow-hidden">
                        <div className="overflow-x-auto max-h-64 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-outlineVariant sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase">Change</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase">Rule ID</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase">Rule Name</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outlineVariant">
                              {previewChanges.changes?.rulesToInclude?.map((ruleId: number) => {
                                const rule = previewRules.get(ruleId)
                                return (
                                  <tr key={`include-${ruleId}`} className="hover:bg-slate-50">
                                    <td className="px-3 py-2">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        Added/Modified
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-900">#{ruleId}</td>
                                    <td className="px-3 py-2 text-slate-900">
                                      {rule?.ruleName || rule?.name || `Rule #${ruleId}`}
                                    </td>
                                    <td className="px-3 py-2">
                                      {rule?.status === 'ACTIVE' ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          Active
                                        </span>
                                      ) : rule?.status === 'DRAFT' ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                          Draft
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                          Inactive
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                              {previewChanges.changes?.rulesToExclude?.map((ruleId: number) => {
                                const rule = previewRules.get(ruleId)
                                return (
                                  <tr key={`exclude-${ruleId}`} className="hover:bg-slate-50">
                                    <td className="px-3 py-2">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        Removed
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-900">#{ruleId}</td>
                                    <td className="px-3 py-2 text-slate-900">
                                      {rule?.ruleName || rule?.name || `Rule #${ruleId}`}
                                    </td>
                                    <td className="px-3 py-2">
                                      {rule?.status === 'ACTIVE' ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          Active
                                        </span>
                                      ) : rule?.status === 'DRAFT' ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                          Draft
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                          Inactive
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-outlineVariant rounded-md p-6 text-center">
                        <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-slate-600">No changes detected</p>
                        <p className="text-xs text-slate-500 mt-1">All rules are same as deployed version</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="border border-outlineVariant rounded-md p-6 text-center text-sm text-slate-500">
                    Select a fact type to preview changes
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-outlineVariant flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setPreviewChanges(null)
                  setPreviewRules(new Map())
                }}
                className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-slate-50 focus-ring"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.title || !createForm.factType || previewLoading}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
              >
                Create Change Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Request Detail Modal */}
      {showDetailModal && selectedChangeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-outlineVariant">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Change Request Details</h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false)
                    setSelectedChangeRequest(null)
                    setChangeRequestRules(new Map())
                  }}
                  className="text-slate-500 hover:text-slate-700 focus-ring"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <div className="text-sm text-slate-900">{selectedChangeRequest.title}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fact Type</label>
                  <div className="text-sm text-slate-900">{selectedChangeRequest.factType}</div>
                </div>
                {selectedChangeRequest.description && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <div className="text-sm text-slate-900 whitespace-pre-wrap">{selectedChangeRequest.description}</div>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <div>{getStatusBadge(selectedChangeRequest.status)}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Created</label>
                    <div className="text-sm text-slate-600">
                      {selectedChangeRequest.createdAt ? new Date(selectedChangeRequest.createdAt).toLocaleString() : '-'}
                    </div>
                  </div>
                  {selectedChangeRequest.createdBy && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Created By</label>
                      <div className="text-sm text-slate-600">{selectedChangeRequest.createdBy}</div>
                    </div>
                  )}
                </div>
                {selectedChangeRequest.status === 'Approved' && selectedChangeRequest.approvedBy && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Approved</label>
                    <div className="text-sm text-slate-600">
                      By {selectedChangeRequest.approvedBy} on{' '}
                      {selectedChangeRequest.approvedDate
                        ? new Date(selectedChangeRequest.approvedDate).toLocaleString()
                        : '-'}
                    </div>
                  </div>
                )}
                {selectedChangeRequest.status === 'Rejected' && selectedChangeRequest.rejectedBy && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Rejected</label>
                    <div className="text-sm text-slate-600">
                      By {selectedChangeRequest.rejectedBy} on{' '}
                      {selectedChangeRequest.rejectedDate
                        ? new Date(selectedChangeRequest.rejectedDate).toLocaleString()
                        : '-'}
                    </div>
                    {selectedChangeRequest.rejectionReason && (
                      <div className="mt-1 text-sm text-red-600">{selectedChangeRequest.rejectionReason}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Changes Table */}
              {selectedChangeRequest.changesJson && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Detected Changes (vs Last Deployed Version)
                  </label>
                  <div className="border border-outlineVariant rounded-md overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-outlineVariant">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Action</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Rule ID</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Rule Name</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Status</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-slate-700 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outlineVariant">
                          {(() => {
                            try {
                              const changes = JSON.parse(selectedChangeRequest.changesJson)
                              const rows: Array<{ action: string; ruleId: number; color: string }> = []

                              // New format: Include/Exclude
                              if (changes.rulesToInclude || changes.rulesToExclude) {
                                // Rules to Include (New or Modified rules)
                                if (changes.rulesToInclude && Array.isArray(changes.rulesToInclude)) {
                                  changes.rulesToInclude.forEach((ruleId: number) => {
                                    rows.push({ action: 'Added/Modified', ruleId, color: 'green' })
                                  })
                                }

                                // Rules to Exclude (Removed/Deactivated rules)
                                if (changes.rulesToExclude && Array.isArray(changes.rulesToExclude)) {
                                  changes.rulesToExclude.forEach((ruleId: number) => {
                                    rows.push({ action: 'Removed', ruleId, color: 'red' })
                                  })
                                }
                              } else {
                                // Old format: Add/Update/Delete (backward compatibility)
                                if (changes.rulesToAdd && Array.isArray(changes.rulesToAdd)) {
                                  changes.rulesToAdd.forEach((ruleId: number) => {
                                    rows.push({ action: 'Add', ruleId, color: 'green' })
                                  })
                                }

                                if (changes.rulesToUpdate && Array.isArray(changes.rulesToUpdate)) {
                                  changes.rulesToUpdate.forEach((ruleId: number) => {
                                    rows.push({ action: 'Update', ruleId, color: 'blue' })
                                  })
                                }

                                if (changes.rulesToDelete && Array.isArray(changes.rulesToDelete)) {
                                  changes.rulesToDelete.forEach((ruleId: number) => {
                                    rows.push({ action: 'Delete', ruleId, color: 'red' })
                                  })
                                }
                              }

                              // Show summary if no detailed rows
                              if (rows.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center">
                                      <div className="text-slate-500 text-sm">
                                        <div className="mb-2">No changes detected</div>
                                        <div className="text-xs">All rules are same as deployed version</div>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              }

                              return rows.map((row) => {
                                const rule = changeRequestRules.get(row.ruleId)
                                const ruleName = rule?.ruleName || rule?.name || `Rule #${row.ruleId}`

                                return (
                                  <tr key={`${row.action}-${row.ruleId}`} className="hover:bg-slate-50">
                                    <td className="px-4 py-2">
                                      <span
                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                          row.color === 'green'
                                            ? 'bg-green-100 text-green-800'
                                            : row.color === 'blue'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                      >
                                        {row.action}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-slate-900">#{row.ruleId}</td>
                                    <td className="px-4 py-2 text-sm text-slate-900">{ruleName}</td>
                                    <td className="px-4 py-2">
                                      {rule?.status === 'ACTIVE' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          Active
                                        </span>
                                      ) : rule?.status === 'DRAFT' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                          Draft
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                          Inactive
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      <button
                                        onClick={() => handleViewRule(row.ruleId)}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 focus-ring"
                                        title="View Rule Details"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        View Rule
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })
                            } catch (err) {
                              return (
                                <tr>
                                  <td colSpan={5} className="px-4 py-4 text-sm text-slate-500 text-center">
                                    Failed to parse changes
                                  </td>
                                </tr>
                              )
                            }
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons for Pending Requests */}
              {selectedChangeRequest.status === 'Pending' && (
                <div className="flex justify-end gap-2 pt-4 border-t border-outlineVariant">
                  {isAdministrator && (
                    <>
                      <button
                        onClick={() => {
                          setShowDetailModal(false)
                          handleApprove(selectedChangeRequest.id)
                        }}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus-ring"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setShowDetailModal(false)
                          handleReject(selectedChangeRequest.id)
                        }}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus-ring"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {user?.id === selectedChangeRequest.createdBy && (
                    <button
                      onClick={() => {
                        setShowDetailModal(false)
                        handleCancel(selectedChangeRequest.id)
                      }}
                      className="px-4 py-2 text-sm bg-slate-600 text-white rounded-md hover:bg-slate-700 focus-ring"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deployment Options Modal */}
      {showDeploymentModal && selectedChangeRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Deployment Options
                </h2>
                <button
                  onClick={() => setShowDeploymentModal(false)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Change Request:</span> {selectedChangeRequest.title}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Only <span className="font-semibold">active</span> and <span className="font-semibold">latest</span> rules will be deployed
                </p>
              </div>

              <div className="space-y-4">
                {/* Deployment Option Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Deployment Option
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input
                        type="radio"
                        name="deploymentOption"
                        value="IMMEDIATE"
                        checked={deploymentOption === 'IMMEDIATE'}
                        onChange={(e) => setDeploymentOption(e.target.value as 'IMMEDIATE' | 'SCHEDULED')}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <div>
                        <div className="font-medium text-slate-900">Deploy Now</div>
                        <div className="text-xs text-slate-500">Rules will be deployed immediately</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input
                        type="radio"
                        name="deploymentOption"
                        value="SCHEDULED"
                        checked={deploymentOption === 'SCHEDULED'}
                        onChange={(e) => setDeploymentOption(e.target.value as 'IMMEDIATE' | 'SCHEDULED')}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <div>
                        <div className="font-medium text-slate-900">Schedule Deployment</div>
                        <div className="text-xs text-slate-500">Deploy at a specific date and time</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Scheduled Time (only shown if SCHEDULED is selected) */}
                {deploymentOption === 'SCHEDULED' && (
                  <>
                    <div>
                      <label htmlFor="scheduledTime" className="block text-sm font-medium text-slate-700 mb-2">
                        Scheduled Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        id="scheduledTime"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Deployment will run every minute, starting at the scheduled time
                      </p>
                    </div>

                    <div>
                      <label htmlFor="deploymentNotes" className="block text-sm font-medium text-slate-700 mb-2">
                        Deployment Notes (Optional)
                      </label>
                      <textarea
                        id="deploymentNotes"
                        value={deploymentNotes}
                        onChange={(e) => setDeploymentNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Add notes about this deployment..."
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDeploymentModal(false)}
                  className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmApprove}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus-ring flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {deploymentOption === 'IMMEDIATE' ? 'Approve & Deploy Now' : 'Approve & Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

