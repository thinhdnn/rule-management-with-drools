'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Edit, Trash2, AlertTriangle, FileText } from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { transformRule } from '@/app/api/rules/transform'
import { SearchableSelect } from '@/components/SearchableSelect'
import { VersionDropdown, type RuleVersion } from '@/components/VersionDropdown'
import { VersionTimeline } from '@/components/VersionTimeline'
import { VersionCompare } from '@/components/VersionCompare'
import { UserTimeMeta } from '@/components/UserTimeMeta'
import { formatDateTime } from '@/lib/datetime'
import { useToast } from '@/components/Toast'

type RuleOutput = {
  action: string | null
  score: number | null
  result: string | null
  flag: string | null
  documentType: string | null
  documentId: string | null
  description: string | null
}

type Rule = {
  id: number
  ruleName: string
  label: string | null
  priority: number
  status: string
  description: string
  ruleAction: string | null
  ruleResult: string | null
  ruleScore: number | null
  version: number
  parentRuleId: number | null
  isLatest: boolean
  versionNotes: string | null
  createdAt: string | null
  updatedAt: string | null
  createdBy: string | null
  updatedBy: string | null
  conditions?: Condition[]
  output?: RuleOutput
  ruleContent?: string
}

type Condition = {
  id: string
  field: string
  operator: string
  value: string
  logicalOp: 'AND' | 'OR'
}

type FieldDefinition = {
  name: string
  label: string
  type: string
  description?: string
}

type OperatorDefinition = {
  operator: string
  label: string
  description?: string
}

type FieldMetadata = {
  inputFields: FieldDefinition[]
  outputFields: FieldDefinition[]
  operatorsByType: Record<string, OperatorDefinition[]>
}

type Props = { params: Promise<{ id: string }> }

export default function RuleDetailPage({ params }: Props) {
  const router = useRouter()
  const toast = useToast()
  const { id } = use(params) // Unwrap params Promise using React.use()
  const [rule, setRule] = useState<Rule | null>(null)
  const [versions, setVersions] = useState<RuleVersion[]>([])
  const [metadata, setMetadata] = useState<FieldMetadata | null>(null)
  const [conditions, setConditions] = useState<Condition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'compare' | 'drl'>('details')
  const [compareVersion1, setCompareVersion1] = useState<number | null>(null)
  const [compareVersion2, setCompareVersion2] = useState<number | null>(null)
  const [compareData1, setCompareData1] = useState<Rule | null>(null)
  const [compareData2, setCompareData2] = useState<Rule | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)

  // Parse ruleCondition to conditions

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch rule and versions in parallel
        const [ruleData, versionsData] = await Promise.all([
          fetchApi(api.rules.get(id)).then((data: any) => {
            const rule = data?.rule ?? data
            return transformRule(rule)
          }),
          fetchApi(api.rules.versions(id)).catch(() => [])
        ])
        
        setRule(ruleData)
        
        // Transform versions
        const transformedVersions: RuleVersion[] = Array.isArray(versionsData) ? versionsData.map((v: any) => ({
          id: v.id,
          version: v.version,
          isLatest: v.isLatest,
          versionNotes: v.versionNotes,
          updatedAt: v.updatedAt || v.createdAt,
          updatedBy: v.updatedBy || v.createdBy,
        })) : []
        setVersions(transformedVersions)
        
        // Load metadata based on rule's factType
        const factType = ruleData?.factType || 'Declaration'
        fetchApi(api.rules.metadata(factType))
          .then((metadataData) => setMetadata(metadataData as any))
          .catch(() => setMetadata(null))
        
        // Parse conditions
        const parsedConditions = (ruleData.conditions && ruleData.conditions.length > 0)
          ? ruleData.conditions.map((condition: any) => ({
              id: crypto.randomUUID(),
              field: condition.field,
              operator: condition.operator,
              value: condition.value,
              logicalOp: condition.logicalOp as 'AND' | 'OR' ?? 'AND',
            }))
          : []
        setConditions(parsedConditions)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleRestore = async (versionId: number) => {
    try {
      const restoredRule = await fetchApi(api.rules.restore(versionId), {
        method: 'POST',
        body: JSON.stringify({ 
          versionNotes: `Restored from version ${versions.find(v => v.id === versionId)?.version}` 
        }),
      }) as any
      
      // Navigate to the newly created version
      router.push(`/rules/${restoredRule.id}`)
      router.refresh()
      toast.showSuccess('Version restored successfully!')
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Failed to restore version')
    }
  }

  // Reset comparison state when leaving compare tab
  useEffect(() => {
    if (activeTab !== 'compare') {
      setCompareVersion1(null)
      setCompareVersion2(null)
      setCompareData1(null)
      setCompareData2(null)
    }
  }, [activeTab])

  // Auto-load comparison when switching to compare tab
  useEffect(() => {
    if (activeTab === 'compare' && rule && versions.length > 1) {
      // Sort versions by version number descending (newest first)
      const sortedVersions = [...versions].sort((a, b) => b.version - a.version)
      
      // Find current version - prefer by rule.id, fallback to latest
      const currentVersion = versions.find(v => v.id === rule.id) || sortedVersions[0]
      
      // Find previous version (version - 1)
      // If current is at index 0 (latest), previous is at index 1
      const currentIndex = sortedVersions.findIndex(v => v.id === currentVersion?.id)
      const previousVersion = currentIndex >= 0 && currentIndex < sortedVersions.length - 1 
        ? sortedVersions[currentIndex + 1] 
        : null

      // Only load if we have both versions and they're different, and data not already loaded
      if (currentVersion && previousVersion && currentVersion.id !== previousVersion.id && !compareData1 && !compareData2) {
        // Set versions first
        setCompareVersion1(previousVersion.id)
        setCompareVersion2(currentVersion.id)

        // Auto-load comparison data
        setCompareLoading(true)
        Promise.all([
          fetchApi(api.rules.get(previousVersion.id.toString())).then((d: any) => transformRule(d?.rule ?? d)),
          fetchApi(api.rules.get(currentVersion.id.toString())).then((d: any) => transformRule(d?.rule ?? d)),
        ])
          .then(([data1, data2]) => {
            setCompareData1(data1)
            setCompareData2(data2)
          })
          .catch((err) => {
            console.error('Failed to load versions for comparison:', err)
            toast.showError(err instanceof Error ? err.message : 'Failed to load versions')
          })
          .finally(() => {
            setCompareLoading(false)
          })
      }
    }
  }, [activeTab, rule, versions, id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !rule) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-error-bg border border-error/30 rounded-md p-4">
          <p className="text-error">{error || 'Rule not found'}</p>
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
          <FileText className="w-4 h-4" />
          <ArrowLeft className="w-4 h-4" />
          Back to Rules
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/rules/${id}/edit`)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 focus-ring"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this rule?')) {
                // TODO: Implement delete
                toast.showInfo('Delete not implemented yet')
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-error text-white rounded-md hover:bg-error-light focus-ring transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Rule Details */}
      <div className="bg-surface rounded-md border border-outlineVariant p-6 space-y-6">
        {/* Title, Status & Version */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-text-primary">{rule.label || rule.ruleName}</h1>
              <p className="text-body-sm text-text-tertiary mt-1">ID: {rule.id}</p>
            </div>
            
            {/* Version Dropdown */}
            {versions.length > 0 && (
              <div className="flex-shrink-0">
                <VersionDropdown
                  currentVersion={{
                    id: rule.id,
                    version: rule.version,
                    isLatest: rule.isLatest,
                    versionNotes: rule.versionNotes,
                    updatedAt: rule.updatedAt || '',
                    updatedBy: rule.updatedBy,
                  }}
                  versions={versions}
                />
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`inline-flex items-center h-9 px-3 rounded-full text-sm font-medium ${
              rule.status === 'ACTIVE' 
                ? 'bg-success-bg text-success ring-1 ring-success/20' 
                : rule.status === 'REVIEW'
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : rule.status === 'DRAFT'
                ? 'bg-warning-bg text-warning ring-1 ring-warning/20'
                : 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border'
            }`}>
              {rule.status === 'ACTIVE' ? 'Active' : rule.status === 'REVIEW' ? 'Review' : rule.status === 'DRAFT' ? 'Draft' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Old Version Warning */}
        {!rule.isLatest && (
          <div className="bg-warning-bg border border-warning/30 rounded-md p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">Viewing old version</p>
              <p className="text-sm text-warning/80 mt-1">
                This is version {rule.version}. A newer version is available.
              </p>
              <button
                onClick={() => {
                  const latestVersion = versions.find(v => v.isLatest)
                  if (latestVersion) router.push(`/rules/${latestVersion.id}`)
                }}
                className="mt-2 text-sm text-warning hover:text-warning-light underline transition-colors cursor-pointer"
              >
                View latest version
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab('details')}
              className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'details'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Version History
              {versions.length > 1 && (
                <span className="ml-2 px-2 py-0.5 bg-surfaceContainerHigh text-text-tertiary text-xs rounded-full">
                  {versions.length}
                </span>
              )}
            </button>
            {versions.length > 1 && (
              <button
                onClick={() => setActiveTab('compare')}
                className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'compare'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                Compare Versions
              </button>
            )}
            <button
              onClick={() => setActiveTab('drl')}
              className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'drl'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              DRL
            </button>
          </nav>
        </div>


        {/* Tab Content */}
        {activeTab === 'details' ? (
          <>
            {/* Conditions Section */}
            <div className="space-y-4 pt-6 border-t border-outlineVariant">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Conditions</h2>
              </div>

              {/* Show parsed conditions if simple, otherwise show raw expression */}
              {conditions.length > 0 && metadata ? (
                <div className="space-y-3">
                  {conditions.map((condition, idx) => {
                    const selectedField = metadata.inputFields.find(f => f.name === condition.field)
                    const operators = selectedField && metadata.operatorsByType
                      ? (metadata.operatorsByType[selectedField.type] || [])
                      : []

                    return (
                      <div key={condition.id} className="flex gap-2 items-start opacity-75">
                        {idx > 0 && (
                          <select
                            value={conditions[idx - 1].logicalOp}
                            disabled
                            className="px-2 py-2 border border-outlineVariant rounded-md text-sm w-20 bg-surfaceContainerHigh cursor-not-allowed text-text-secondary"
                          >
                            <option value="AND">AND</option>
                            <option value="OR">OR</option>
                          </select>
                        )}
                        {idx === 0 && <div className="w-20"></div>}

                        <div className="flex-1 pointer-events-none">
                          <SearchableSelect
                            value={condition.field}
                            onChange={() => {}}
                            options={metadata.inputFields}
                            placeholder="Select field..."
                            className="flex-1"
                          />
                        </div>

                        <select
                          value={condition.operator}
                          disabled
                          className="px-3 py-2 border border-outlineVariant rounded-md text-sm w-40 bg-surfaceContainerHigh cursor-not-allowed text-text-secondary"
                        >
                          {operators.map(op => (
                            <option key={op.operator} value={op.operator}>
                              {op.label}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          value={condition.value}
                          disabled
                          className="flex-1 px-3 py-2 border border-outlineVariant rounded-md text-sm bg-surfaceContainerHigh cursor-not-allowed text-text-secondary"
                          placeholder="Value"
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Show message if no conditions */
                <div className="bg-surfaceContainerHigh rounded-md p-4 border border-border">
                  <div className="text-sm text-text-secondary">No conditions configured</div>
                </div>
              )}
            </div>

            {/* Output Section */}
            <div className="space-y-4 pt-6 border-t border-outlineVariant">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Output</h2>
              </div>

              {rule.output && metadata ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {metadata.outputFields.map((field) => {
                    const fieldValue = rule.output?.[field.name as keyof RuleOutput]
                    const displayValue = fieldValue !== null && fieldValue !== undefined ? String(fieldValue) : '—'
                    
                    return (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                          {field.label}
                        </label>
                        <div className="px-3 py-2 text-sm border border-outlineVariant rounded-md bg-surfaceContainerHigh text-text-primary">
                          {displayValue}
                        </div>
                        {field.description && (
                          <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-surfaceContainerHigh rounded-md p-4 border border-border">
                  <div className="text-sm text-text-secondary">No output configured</div>
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 gap-4 pt-6 text-sm text-text-secondary border-t border-outlineVariant md:grid-cols-2">
              <UserTimeMeta
                label="Created"
                user={rule.createdBy}
                timestamp={rule.createdAt}
                fallbackUser={null}
              />
              <UserTimeMeta
                label="Last Updated"
                user={rule.updatedBy}
                timestamp={rule.updatedAt}
                fallbackUser={null}
              />
            </div>
          </>
        ) : activeTab === 'history' ? (
          /* Version History Tab */
          <div className="py-4">
            <VersionTimeline
              versions={versions}
              currentVersionId={rule.id}
              onRestore={handleRestore}
            />
          </div>
        ) : activeTab === 'compare' ? (
          /* Compare Versions Tab */
          <div className="py-4 space-y-6">
            <div className="bg-surfaceContainerHigh rounded-md p-4 border border-border">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Select Versions to Compare</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Version 1 (Old)
                  </label>
                  <select
                    value={compareVersion1 || ''}
                    onChange={async (e) => {
                      const versionId = e.target.value ? Number(e.target.value) : null
                      setCompareVersion1(versionId)
                      setCompareData1(null)
                      
                      // Auto-load if both versions are selected
                      if (versionId && compareVersion2 && versionId !== compareVersion2) {
                        setCompareLoading(true)
                        try {
                          const [data1, data2] = await Promise.all([
                            fetchApi(api.rules.get(versionId.toString())).then((d: any) => transformRule(d?.rule ?? d)),
                            fetchApi(api.rules.get(compareVersion2.toString())).then((d: any) => transformRule(d?.rule ?? d)),
                          ])
                          setCompareData1(data1)
                          setCompareData2(data2)
                        } catch (err) {
                          toast.showError(err instanceof Error ? err.message : 'Failed to load versions')
                        } finally {
                          setCompareLoading(false)
                        }
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-outlineVariant rounded-md focus-ring"
                  >
                    <option value="">Select version...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} {v.isLatest && '(Latest)'} - {formatDateTime(v.updatedAt, { month: 'short', day: '2-digit', year: 'numeric' }) || '-'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Version 2 (New)
                  </label>
                  <select
                    value={compareVersion2 || ''}
                    onChange={async (e) => {
                      const versionId = e.target.value ? Number(e.target.value) : null
                      setCompareVersion2(versionId)
                      setCompareData2(null)
                      
                      // Auto-load if both versions are selected
                      if (versionId && compareVersion1 && versionId !== compareVersion1) {
                        setCompareLoading(true)
                        try {
                          const [data1, data2] = await Promise.all([
                            fetchApi(api.rules.get(compareVersion1.toString())).then((d: any) => transformRule(d?.rule ?? d)),
                            fetchApi(api.rules.get(versionId.toString())).then((d: any) => transformRule(d?.rule ?? d)),
                          ])
                          setCompareData1(data1)
                          setCompareData2(data2)
                        } catch (err) {
                          toast.showError(err instanceof Error ? err.message : 'Failed to load versions')
                        } finally {
                          setCompareLoading(false)
                        }
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-outlineVariant rounded-md focus-ring"
                  >
                    <option value="">Select version...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} {v.isLatest && '(Latest)'} - {formatDateTime(v.updatedAt, { month: 'short', day: '2-digit', year: 'numeric' }) || '-'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Load comparison data */}
            {compareVersion1 && compareVersion2 && compareVersion1 !== compareVersion2 && (
              <div>
                {compareLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : compareData1 && compareData2 ? (
                  <VersionCompare 
                    oldVersion={{...compareData1, updatedAt: compareData1.updatedAt || ''}} 
                    newVersion={{...compareData2, updatedAt: compareData2.updatedAt || ''}} 
                    metadata={metadata as any} 
                  />
                ) : (
                  <button
                    onClick={async () => {
                      setCompareLoading(true)
                      try {
                        const [data1, data2] = await Promise.all([
                          fetchApi(api.rules.get(compareVersion1.toString())).then((d: any) => transformRule(d?.rule ?? d)),
                          fetchApi(api.rules.get(compareVersion2.toString())).then((d: any) => transformRule(d?.rule ?? d)),
                        ])
                        setCompareData1(data1)
                        setCompareData2(data2)
                      } catch (err) {
                        toast.showError(err instanceof Error ? err.message : 'Failed to load versions')
                      } finally {
                        setCompareLoading(false)
                      }
                    }}
                    className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 focus-ring"
                  >
                    Load Comparison
                  </button>
                )}
              </div>
            )}

            {compareVersion1 && compareVersion2 && compareVersion1 === compareVersion2 && (
              <div className="bg-warning-bg border border-warning/30 rounded-md p-4 text-center text-warning">
                Please select two different versions to compare.
              </div>
            )}

            {versions.length === 1 && (
              <div className="bg-surfaceContainerHigh border border-border rounded-md p-4 text-center text-text-secondary">
                Only one version available. Create a new version to compare.
              </div>
            )}
          </div>
        ) : activeTab === 'drl' ? (
          /* DRL Tab */
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">Drools Rule Language (DRL)</h3>
              <button
                onClick={() => {
                  if (rule.ruleContent) {
                    navigator.clipboard.writeText(rule.ruleContent)
                    toast.showSuccess('DRL content copied to clipboard!')
                  }
                }}
                className="px-3 py-1.5 text-sm bg-surfaceContainerHigh text-text-secondary rounded-md hover:bg-surfaceContainerHighest focus-ring transition-colors cursor-pointer"
              >
                Copy DRL
              </button>
            </div>
            
            {rule.ruleContent ? (
              <div className="bg-slate-900 dark:bg-slate-950 rounded-md border border-slate-700 dark:border-slate-800 overflow-hidden">
                <pre className="p-4 text-sm text-slate-100 dark:text-slate-50 overflow-x-auto">
                  <code className="font-mono whitespace-pre-wrap break-words">
                    {rule.ruleContent}
                  </code>
                </pre>
              </div>
            ) : (
              <div className="bg-surfaceContainerHigh border border-border rounded-md p-4">
                <div className="text-sm text-text-secondary">DRL content not available for this rule.</div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}


