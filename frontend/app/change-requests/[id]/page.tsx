'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  ExternalLink,
  FileCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { UserTimeMeta } from '@/components/UserTimeMeta'
import { formatDateTime } from '@/lib/datetime'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/components/AuthProvider'
import { cn } from '@/lib/utils'
import type { ChangeRequest } from '../page'

type Props = { params: Promise<{ id: string }> }

export default function ChangeRequestDetailPage({ params }: Props) {
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()
  const { id } = use(params)
  const [changeRequest, setChangeRequest] = useState<ChangeRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [changeRequestRules, setChangeRequestRules] = useState<Map<number, any>>(new Map())
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string>('')
  const [showDeploymentModal, setShowDeploymentModal] = useState(false)
  const [deploymentOption, setDeploymentOption] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE')
  const [scheduledTime, setScheduledTime] = useState<string>('')
  const [deploymentNotes, setDeploymentNotes] = useState<string>('')

  const isAdministrator = user?.roles?.includes('RULE_ADMINISTRATOR') ?? false

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const data = await fetchApi<ChangeRequest>(api.changeRequests.get(id))
        setChangeRequest(data)

        if (data.changesJson) {
          try {
            const changes = JSON.parse(data.changesJson)
            const allRuleIds = new Set<number>()

            ;(changes.rulesToAdd || []).forEach((ruleId: number) => allRuleIds.add(ruleId))
            ;(changes.rulesToUpdate || []).forEach((ruleId: number) => allRuleIds.add(ruleId))
            ;(changes.rulesToDelete || []).forEach((ruleId: number) => allRuleIds.add(ruleId))
            ;(changes.rulesToInclude || []).forEach((ruleId: number) => allRuleIds.add(ruleId))
            ;(changes.rulesToExclude || []).forEach((ruleId: number) => allRuleIds.add(ruleId))

            if (allRuleIds.size > 0) {
              const rulesMap = new Map<number, any>()
              await Promise.all(
                Array.from(allRuleIds).map(async (ruleId: number) => {
                  try {
                    const rule = await fetchApi(api.rules.get(ruleId.toString()))
                    rulesMap.set(ruleId, rule)
                  } catch (err) {
                    console.error(`Failed to load rule ${ruleId}:`, err)
                  }
                })
              )
              setChangeRequestRules(rulesMap)
            }
          } catch (err) {
            console.error('Failed to parse changes JSON:', err)
          }
        }
      } catch (err) {
        console.error('Failed to fetch change request:', err)
        setError(err instanceof Error ? err.message : 'Failed to load change request')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const handleApprove = async () => {
    if (!changeRequest) return

    if (deploymentOption === 'SCHEDULED') {
      if (!scheduledTime) {
        toast.showWarning('Please select a scheduled time')
        return
      }
      const scheduled = new Date(scheduledTime)
      if (scheduled <= new Date()) {
        toast.showWarning('Scheduled time must be in the future')
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

      await fetchApi(api.changeRequests.approve(changeRequest.id), {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      setShowDeploymentModal(false)
      toast.showSuccess(
        deploymentOption === 'IMMEDIATE'
          ? 'Change request approved and rules deployed successfully!'
          : `Change request approved! Deployment scheduled for ${new Date(scheduledTime).toLocaleString()}`
      )
      router.push('/change-requests')
    } catch (err) {
      console.error('Failed to approve change request:', err)
      toast.showError(err instanceof Error ? err.message : 'Failed to approve change request')
    }
  }

  const handleReject = async () => {
    if (!changeRequest || !rejectionReason.trim()) {
      toast.showWarning('Please provide a reason for rejection')
      return
    }

    try {
      await fetchApi(api.changeRequests.reject(changeRequest.id), {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      })
      toast.showSuccess('Change request rejected successfully!')
      router.push('/change-requests')
    } catch (err) {
      console.error('Failed to reject change request:', err)
      toast.showError(err instanceof Error ? err.message : 'Failed to reject change request')
    }
  }

  const handleCancel = async () => {
    if (!changeRequest) return

    try {
      await fetchApi(api.changeRequests.cancel(changeRequest.id), {
        method: 'POST',
      })
      toast.showSuccess('Change request cancelled successfully!')
      router.push('/change-requests')
    } catch (err) {
      console.error('Failed to cancel change request:', err)
      toast.showError(err instanceof Error ? err.message : 'Failed to cancel change request')
    }
  }

  const handleViewRule = (ruleId: number) => {
    router.push(`/rules/${ruleId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !changeRequest) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary focus-ring rounded-md px-2 py-1 transition-colors cursor-pointer"
        >
          <FileCheck className="w-4 h-4" />
          <ArrowLeft className="w-4 h-4" />
          Back to Change Requests
        </button>
        <div className="bg-error-bg border border-error/30 rounded-md p-4">
          <p className="text-error">{error || 'Change request not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary focus-ring rounded-md px-2 py-1 transition-colors cursor-pointer"
        >
          <FileCheck className="w-4 h-4" />
          <ArrowLeft className="w-4 h-4" />
          Back to Change Requests
        </button>

        {changeRequest.status === 'Pending' && (
          <div className="flex gap-2">
            {isAdministrator && (
              <>
                <button
                  onClick={() => setShowDeploymentModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-success text-white rounded-md hover:bg-success-light focus-ring transition-colors cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-error text-white rounded-md hover:bg-error-light focus-ring transition-colors cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </>
            )}
            {user?.id === changeRequest.createdBy && (
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-text-tertiary text-white rounded-md hover:bg-text-secondary focus-ring transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Change Request Details */}
      <div className="bg-surface rounded-md border border-outlineVariant p-6 space-y-6">
        {/* Title, Status */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-text-primary">{changeRequest.title}</h1>
            <p className="text-body-sm text-text-tertiary mt-1">ID: {changeRequest.id}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={cn(
                'inline-flex items-center h-9 px-3 rounded-full text-sm font-medium ring-1',
                changeRequest.status === 'Pending'
                  ? 'bg-warning-bg text-warning ring-warning/20'
                  : changeRequest.status === 'Approved'
                  ? 'bg-success-bg text-success ring-success/20'
                  : changeRequest.status === 'Rejected'
                  ? 'bg-error-bg text-error ring-error/20'
                  : 'bg-surfaceContainerHigh text-text-tertiary ring-border'
              )}
            >
              {changeRequest.status === 'Pending' && <Clock className="w-4 h-4 mr-1.5" />}
              {changeRequest.status === 'Approved' && <CheckCircle className="w-4 h-4 mr-1.5" />}
              {changeRequest.status === 'Rejected' && <XCircle className="w-4 h-4 mr-1.5" />}
              {changeRequest.status === 'Cancelled' && <XCircle className="w-4 h-4 mr-1.5" />}
              {changeRequest.status}
            </span>
          </div>
        </div>

        {/* Rejection Reason Alert */}
        {changeRequest.status === 'Rejected' && changeRequest.rejectionReason && (
          <div className="bg-error-bg border border-error/30 rounded-md p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-error">Rejection Reason</p>
              <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap">
                {changeRequest.rejectionReason}
              </p>
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div className="space-y-4 pt-6 border-t border-outlineVariant">
          <h2 className="text-lg font-semibold">Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Target Object</label>
              <div className="px-3 py-2 text-sm border border-outlineVariant rounded-md bg-surfaceContainerHigh text-text-primary">
                {changeRequest.factType}
              </div>
            </div>
            {changeRequest.description && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
                <div className="px-3 py-2 text-sm border border-outlineVariant rounded-md bg-surfaceContainerHigh text-text-primary whitespace-pre-wrap">
                  {changeRequest.description}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Status */}
        {changeRequest.validationStatus && (
          <div className="space-y-4 pt-6 border-t border-outlineVariant">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Build Validation</h2>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
                  changeRequest.validationStatus === 'SUCCESS'
                    ? 'bg-success-bg text-success ring-1 ring-success/20'
                    : 'bg-error-bg text-error ring-1 ring-error/20'
                )}
              >
                {changeRequest.validationStatus}
              </span>
            </div>
            {changeRequest.validationMessage && (
              <p className="text-sm text-text-primary">{changeRequest.validationMessage}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {changeRequest.validationCheckedAt && (
                <div>
                  <label className="block text-text-tertiary mb-1">Checked at</label>
                  <div className="text-text-primary">{formatDateTime(changeRequest.validationCheckedAt)}</div>
                </div>
              )}
              {typeof changeRequest.validationRuleCount === 'number' && (
                <div>
                  <label className="block text-text-tertiary mb-1">Compiled rules</label>
                  <div className="text-text-primary font-medium">{changeRequest.validationRuleCount}</div>
                </div>
              )}
              {changeRequest.validationReleaseId && (
                <div>
                  <label className="block text-text-tertiary mb-1">Release ID</label>
                  <div className="text-text-primary font-mono text-xs">{changeRequest.validationReleaseId}</div>
                </div>
              )}
            </div>
            {changeRequest.validationError && (
              <div className="bg-error-bg border border-error/30 rounded-md p-3 mt-2">
                <p className="text-xs text-error font-medium mb-1">Error Details</p>
                <p className="text-xs text-text-primary whitespace-pre-wrap break-words">
                  {changeRequest.validationError}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Execution Test */}
        {changeRequest.executionTestStatus && (
          <div className="space-y-4 pt-6 border-t border-outlineVariant">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Execution Test</h2>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
                  changeRequest.executionTestStatus === 'PASSED'
                    ? 'bg-success-bg text-success ring-1 ring-success/20'
                    : changeRequest.executionTestStatus === 'FAILED'
                    ? 'bg-error-bg text-error ring-1 ring-error/20'
                    : 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border'
                )}
              >
                {changeRequest.executionTestStatus}
              </span>
            </div>
            {changeRequest.executionTestMessage && (
              <p className="text-sm text-text-primary">{changeRequest.executionTestMessage}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {typeof changeRequest.executionTestHitsCount === 'number' && (
                <div>
                  <label className="block text-text-tertiary mb-1">Rule hits</label>
                  <div className="text-text-primary font-medium">{changeRequest.executionTestHitsCount}</div>
                </div>
              )}
              {typeof changeRequest.executionTestTotalScore === 'number' && (
                <div>
                  <label className="block text-text-tertiary mb-1">Total score</label>
                  <div className="text-text-primary font-medium">
                    {changeRequest.executionTestTotalScore.toFixed(2)}
                  </div>
                </div>
              )}
              {changeRequest.executionTestFinalAction && (
                <div>
                  <label className="block text-text-tertiary mb-1">Final action</label>
                  <div className="text-text-primary font-medium">{changeRequest.executionTestFinalAction}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Changes Table */}
        {changeRequest.changesJson && (
          <div className="space-y-4 pt-6 border-t border-outlineVariant">
            <h2 className="text-lg font-semibold">Detected Changes</h2>
            <p className="text-sm text-text-tertiary">Changes compared to last deployed version</p>
            <div className="border border-outlineVariant rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surfaceContainerHigh dark:bg-surfaceContainerHighest border-b border-outlineVariant">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary uppercase">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary uppercase">
                        Rule ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary uppercase">
                        Rule Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-text-primary uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outlineVariant">
                    {(() => {
                      try {
                        const changes = JSON.parse(changeRequest.changesJson)
                        const rows: Array<{
                          action: string
                          ruleId: number
                          color: string
                          replacedRuleId?: number
                        }> = []

                        const getFamilyId = (ruleId: number) => {
                          const rule = changeRequestRules.get(ruleId)
                          if (rule && typeof rule.parentRuleId === 'number' && rule.parentRuleId > 0) {
                            return rule.parentRuleId
                          }
                          return ruleId
                        }

                        if (changes.rulesToInclude || changes.rulesToExclude) {
                          const includeIds: number[] = changes.rulesToInclude || []
                          const excludeIds: number[] = changes.rulesToExclude || []
                          const matchedExcludes = new Set<number>()

                          includeIds.forEach((ruleId: number) => {
                            const familyId = getFamilyId(ruleId)
                            const matchedExcludeId = excludeIds.find((excludeId: number) => {
                              if (matchedExcludes.has(excludeId)) return false
                              return getFamilyId(excludeId) === familyId
                            })

                            if (typeof matchedExcludeId === 'number') {
                              matchedExcludes.add(matchedExcludeId)
                              rows.push({
                                action: 'Updated',
                                ruleId,
                                color: 'blue',
                                replacedRuleId: matchedExcludeId,
                              })
                            } else {
                              rows.push({ action: 'Added', ruleId, color: 'green' })
                            }
                          })

                          excludeIds.forEach((ruleId: number) => {
                            if (!matchedExcludes.has(ruleId)) {
                              rows.push({ action: 'Removed', ruleId, color: 'red' })
                            }
                          })
                        } else {
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

                        if (rows.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center">
                                <div className="text-text-tertiary text-sm">No changes detected</div>
                                <div className="text-xs text-text-muted mt-1">
                                  All rules are same as deployed version
                                </div>
                              </td>
                            </tr>
                          )
                        }

                        return rows.map((row) => {
                          const rule = changeRequestRules.get(row.ruleId)
                          const ruleName = rule?.ruleName || rule?.name || `Rule #${row.ruleId}`

                          return (
                            <tr
                              key={`${row.action}-${row.ruleId}`}
                              className="hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
                                    row.color === 'green'
                                      ? 'bg-success-bg text-success ring-1 ring-success/20'
                                      : row.color === 'blue'
                                      ? 'bg-accent-bg text-accent ring-1 ring-accent/20'
                                      : 'bg-error-bg text-error ring-1 ring-error/20'
                                  )}
                                >
                                  {row.action}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm font-mono text-text-primary">#{row.ruleId}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-text-primary font-medium">{ruleName}</span>
                              </td>
                              <td className="px-4 py-3">
                                {rule?.status === 'ACTIVE' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success ring-1 ring-success/20">
                                    Active
                                  </span>
                                ) : rule?.status === 'DRAFT' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-bg text-warning ring-1 ring-warning/20">
                                    Draft
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border">
                                    Inactive
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleViewRule(row.ruleId)
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary-light focus-ring transition-colors cursor-pointer"
                                  title="View Rule Details"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  View
                                </button>
                              </td>
                            </tr>
                          )
                        })
                      } catch (err) {
                        return (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center">
                              <div className="text-error text-sm">Failed to parse changes</div>
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

        {/* Timestamps */}
        <div className="grid grid-cols-1 gap-4 pt-6 text-sm text-text-secondary border-t border-outlineVariant md:grid-cols-2">
          <UserTimeMeta
            label="Created"
            user={changeRequest.createdBy}
            timestamp={changeRequest.createdAt}
            fallbackUser={null}
          />
          {changeRequest.status === 'Approved' && changeRequest.approvedBy && (
            <UserTimeMeta
              label="Approved"
              user={changeRequest.approvedBy}
              timestamp={changeRequest.approvedDate}
              fallbackUser={null}
            />
          )}
          {changeRequest.status === 'Rejected' && changeRequest.rejectedBy && (
            <UserTimeMeta
              label="Rejected"
              user={changeRequest.rejectedBy}
              timestamp={changeRequest.rejectedDate}
              fallbackUser={null}
            />
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowRejectModal(false)
            setRejectionReason('')
          }}
        >
          <div
            className="bg-surface rounded-lg border border-outlineVariant shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Reject Change Request</h3>
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason('')
                }}
                className="p-1 rounded-md hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors cursor-pointer text-text-tertiary hover:text-text-primary"
                aria-label="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <p className="text-body-sm text-text-secondary mb-4">
              Please provide a reason for rejection. This will be visible to the requester.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full h-32 px-3 py-2 rounded-md bg-surface border border-outlineVariant focus-ring transition-colors text-text-primary text-body-sm placeholder:text-text-muted hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason('')
                }}
                className="px-4 py-2 text-sm font-medium text-text-primary border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest focus-ring transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="px-4 py-2 text-sm font-medium bg-error text-white rounded-md hover:bg-error-light focus-ring transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deployment Modal */}
      {showDeploymentModal && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDeploymentModal(false)}
        >
          <div
            className="bg-surface rounded-lg border border-outlineVariant shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-text-primary">Deployment Options</h2>
                <button
                  onClick={() => setShowDeploymentModal(false)}
                  className="p-1 rounded-md hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors cursor-pointer text-text-tertiary hover:text-text-primary"
                  aria-label="Close"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6 p-4 bg-accent-bg dark:bg-accent/10 border border-accent/20 rounded-md">
                <p className="text-sm font-medium text-accent dark:text-accent-light mb-1">
                  {changeRequest.title}
                </p>
                <p className="text-xs text-text-tertiary">
                  Only <span className="font-semibold">active</span> and <span className="font-semibold">latest</span>{' '}
                  rules will be deployed
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-3">Deployment Option</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-4 border-2 border-outlineVariant rounded-md cursor-pointer hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-all has-[:checked]:border-primary has-[:checked]:bg-primary-bg dark:has-[:checked]:bg-primary/10">
                      <input
                        type="radio"
                        name="deploymentOption"
                        value="IMMEDIATE"
                        checked={deploymentOption === 'IMMEDIATE'}
                        onChange={(e) => setDeploymentOption(e.target.value as 'IMMEDIATE' | 'SCHEDULED')}
                        className="w-4 h-4 text-primary focus-ring cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-text-primary">Deploy Now</div>
                        <div className="text-xs text-text-tertiary mt-0.5">Rules will be deployed immediately</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 border-2 border-outlineVariant rounded-md cursor-pointer hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-all has-[:checked]:border-primary has-[:checked]:bg-primary-bg dark:has-[:checked]:bg-primary/10">
                      <input
                        type="radio"
                        name="deploymentOption"
                        value="SCHEDULED"
                        checked={deploymentOption === 'SCHEDULED'}
                        onChange={(e) => setDeploymentOption(e.target.value as 'IMMEDIATE' | 'SCHEDULED')}
                        className="w-4 h-4 text-primary focus-ring cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-text-primary">Schedule Deployment</div>
                        <div className="text-xs text-text-tertiary mt-0.5">
                          Deploy at a specific date and time
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {deploymentOption === 'SCHEDULED' && (
                  <div className="space-y-4 pt-2 border-t border-outlineVariant">
                    <div>
                      <label htmlFor="scheduledTime" className="block text-sm font-medium text-text-primary mb-2">
                        Scheduled Time <span className="text-error">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        id="scheduledTime"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="w-full px-3 py-2 border border-outlineVariant rounded-md focus-ring bg-surface text-text-primary hover:border-primary/30 focus:border-primary transition-colors"
                        required
                      />
                      <p className="text-xs text-text-tertiary mt-1.5">
                        Deployment will run every minute, starting at the scheduled time
                      </p>
                    </div>

                    <div>
                      <label htmlFor="deploymentNotes" className="block text-sm font-medium text-text-primary mb-2">
                        Deployment Notes <span className="text-text-tertiary">(Optional)</span>
                      </label>
                      <textarea
                        id="deploymentNotes"
                        value={deploymentNotes}
                        onChange={(e) => setDeploymentNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-outlineVariant rounded-md focus-ring bg-surface text-text-primary placeholder:text-text-muted hover:border-primary/30 focus:border-primary transition-colors resize-none"
                        placeholder="Add notes about this deployment..."
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-outlineVariant">
                <button
                  onClick={() => setShowDeploymentModal(false)}
                  className="px-4 py-2 text-sm font-medium text-text-primary border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest focus-ring transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  className="px-4 py-2 text-sm font-medium bg-success text-white rounded-md hover:bg-success-light focus-ring transition-colors cursor-pointer flex items-center gap-2"
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
