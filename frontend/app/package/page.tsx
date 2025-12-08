"use client"

import { useEffect, useState } from 'react'
import { fetchApi, api } from '@/lib/api'
import { Package, RefreshCw, Clock, User, Hash, FileText, Play, X, Server } from 'lucide-react'
import { UserTimeMeta } from '@/components/UserTimeMeta'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'

interface PackageInfo {
  version: number
  releaseId: string | null
  package?: string
  factType?: string
  rulesCount?: number
  rulesHash?: string
  changesDescription?: string
  ruleIds?: string
  ruleChanges?: {
    added?: Array<{ id: number; name: string }>
    removed?: Array<{ id: number; name: string }>
    updated?: Array<{ id: number; name: string }>
  }
  deployedAt?: string
  deployedBy?: string
  versionHistory?: Array<{
    version: number
    rulesCount: number
    releaseId: string | null
    changesDescription: string | null
    ruleIds?: string
    ruleChanges?: {
      added?: Array<{ id: number; name: string }>
      removed?: Array<{ id: number; name: string }>
      updated?: Array<{ id: number; name: string }>
    }
    deployedAt: string
    deployedBy: string | null
  }>
}

interface ContainerStatus {
  factType: string
  version: number
  rulesCount: number
  deployed: boolean
  releaseId?: string
}

export default function PackagePage() {
  const toast = useToast()
  const [factTypes, setFactTypes] = useState<string[]>([])
  const [selectedFactType, setSelectedFactType] = useState<string>('Declaration')
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [availableVersions, setAvailableVersions] = useState<number[]>([])
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [selectedVersionToActivate, setSelectedVersionToActivate] = useState<number | null>(null)
  const [activationMode, setActivationMode] = useState<'new' | 'rebuild'>('new')
  const [activationNotes, setActivationNotes] = useState<string>('')
  const [activating, setActivating] = useState(false)
  const getTestData = (factType: string) => `{
  "factType": "${factType}",
  "declarationId": "23IM123456",
  "functionCode": "1",
  "typeCode": "IM",
  "officeId": "VNHPH",
  "ucr": "UCR20250115001",
  "declarantId": "BROKER001",
  "declarantName": "ABC Customs Broker",
  "declarantCountryId": "VN",
  "consignorId": "CNSELLER001",
  "consignorName": "XYZ Trading Co., Ltd.",
  "consignorCountryId": "CN",
  "consigneeId": "VNIMPORTER001",
  "consigneeName": "ABC Import Company",
  "consigneeCountryId": "VN",
  "importerId": "VNIMPORTER001",
  "importerName": "ABC Import Company",
  "importerCountryId": "VN",
  "countryOfExportId": "CN",
  "countryOfImportId": "VN",
  "countryOfDestinationId": "VN",
  "incotermCode": "CIF",
  "invoiceId": "INV-2025-001",
  "invoiceCurrencyCode": "USD",
  "invoiceAmount": 150000.00,
  "transportMeansModeCode": "1",
  "transportMeansId": "IMO1234567",
  "transportMeansJourneyId": "V001",
  "loadingLocationId": "CNSHA",
  "unloadingLocationId": "VNHPH",
  "locationOfGoodsId": "WH001",
  "warehouseId": "WH001",
  "packageQuantity": 100,
  "totalGrossMassMeasure": 5000.00,
  "totalNetMassMeasure": 4500.00,
  "totalFreightAmount": 5000.00,
  "totalInsuranceAmount": 1500.00,
  "governmentAgencyGoodsItems": [
    {
      "sequenceNumeric": 1,
      "hsId": "610910",
      "description": "Cotton T-shirts, men's",
      "originCountryId": "CN",
      "netWeightMeasure": 500.00,
      "grossWeightMeasure": 550.00,
      "quantityQuantity": 1000,
      "quantityUnitCode": "NMB",
      "invoiceLineNumberId": "1",
      "unitPriceAmount": 5.00,
      "statisticalValueAmount": 5000.00,
      "customsValueAmount": 5000.00,
      "procedureCode": "4000",
      "preferenceCode": "000",
      "valuationMethodCode": "1",
      "dutyRate": 12.0,
      "dutyAmount": 600.00
    },
    {
      "sequenceNumeric": 2,
      "hsId": "620342",
      "description": "Cotton trousers, men's",
      "originCountryId": "CN",
      "netWeightMeasure": 800.00,
      "grossWeightMeasure": 880.00,
      "quantityQuantity": 500,
      "quantityUnitCode": "NMB",
      "invoiceLineNumberId": "2",
      "unitPriceAmount": 10.00,
      "statisticalValueAmount": 5000.00,
      "customsValueAmount": 5000.00,
      "procedureCode": "4000",
      "preferenceCode": "000",
      "valuationMethodCode": "1",
      "dutyRate": 15.0,
      "dutyAmount": 750.00
    }
  ]
}`
  const [testData, setTestData] = useState(getTestData('Declaration'))
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [selectedTestVersion, setSelectedTestVersion] = useState<number | null>(null)

  const loadFactTypes = async () => {
    try {
      const types = await fetchApi<string[]>(api.rules.factTypes())
      setFactTypes(types.length > 0 ? types : ['Declaration'])
      // Set default selected fact type if not already set
      if (types.length > 0 && !types.includes(selectedFactType)) {
        setSelectedFactType(types[0])
      }
    } catch (err) {
      console.error('Failed to load fact types:', err)
      // Fallback to default
      setFactTypes(['Declaration'])
    }
  }

  const loadPackageInfo = async (factType?: string) => {
    try {
      setLoading(true)
      setError(null)
      const type = factType || selectedFactType
      const data = await fetchApi<PackageInfo>(api.rules.packageInfo(type))
      setPackageInfo(data)
      
      // Load available versions for activation
      await loadAvailableVersions(type)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load package info')
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableVersions = async (factType: string) => {
    try {
      const response = await fetchApi<{ factType: string; versions: number[] }>(
        `${api.rules.list()}/versions?factType=${encodeURIComponent(factType)}`
      )
      setAvailableVersions(response.versions || [])
    } catch (err) {
      console.error('Failed to load available versions:', err)
      setAvailableVersions([])
    }
  }

  const handleActivateVersion = async () => {
    if (!selectedVersionToActivate) return

    setActivating(true)
    try {
      const response = await fetchApi<any>(
        `${api.rules.list()}/versions/${selectedVersionToActivate}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({
            factType: selectedFactType,
            createNewVersion: activationMode === 'new',
            activationNotes: activationNotes || undefined
          })
        }
      )

      setShowActivateModal(false)
      setSelectedVersionToActivate(null)
      setActivationNotes('')
      
      // Reload package info
      await loadPackageInfo(selectedFactType)
      
      const message = `${response.message}\n\nDeactivated: ${response.deactivatedRules} rules\nActivated: ${response.activatedRules} rules${response.notFoundRules > 0 ? `\nNot found: ${response.notFoundRules} rules` : ''}`
      toast.showSuccess(message)
    } catch (err) {
      console.error('Failed to activate version:', err)
      toast.showError('Failed to activate version: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActivating(false)
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await fetchApi(`${api.rules.list()}/refresh?factType=${encodeURIComponent(selectedFactType)}`, { method: 'POST' })
      // Reload package info after refresh
      await loadPackageInfo(selectedFactType)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh rules')
    } finally {
      setRefreshing(false)
    }
  }

  const handleTest = async () => {
    try {
      setTesting(true)
      setError(null)
      setTestResult(null)
      
      // Parse JSON from textarea
      let declarationData: any
      try {
        declarationData = JSON.parse(testData)
      } catch (e) {
        throw new Error('Invalid JSON format. Please check your Declaration data.')
      }
      
      // Add factType if not provided (default to "Declaration")
      if (!declarationData.factType) {
        declarationData.factType = 'Declaration'
      }
      
      // Build URL with version parameter if selected
      let executeUrl = api.rules.execute()
      if (selectedTestVersion !== null && selectedTestVersion > 0) {
        executeUrl += `?version=${selectedTestVersion}`
      }
      
      // Execute rules with UI source header to track execution source
      const result = await fetchApi(executeUrl, {
        method: 'POST',
        headers: {
          'X-Execution-Source': 'UI',
        },
        body: JSON.stringify(declarationData),
      })
      
      setTestResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test rules')
      setTestResult(null)
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    loadFactTypes().then(() => {
      loadPackageInfo(selectedFactType)
    })
  }, [])

  useEffect(() => {
    if (selectedFactType) {
      loadPackageInfo(selectedFactType)
    }
  }, [selectedFactType])

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-text-tertiary">Loading package information...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-error-bg dark:bg-error/10 border border-error/30 rounded-md p-4 text-error dark:text-error-light">
          Error: {error}
        </div>
      </div>
    )
  }

  if (!packageInfo) {
    return (
      <div className="p-6">
        <div className="text-text-tertiary">No package information available</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Server className="w-6 h-6 text-primary" />
          KieContainer Packages
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-smooth shadow-sm cursor-pointer"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => {
              setTestData(getTestData(selectedFactType))
              setSelectedTestVersion(packageInfo?.version || null)
              setShowTestModal(true)
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg hover:bg-success-light disabled:opacity-50 disabled:cursor-not-allowed transition-smooth shadow-sm cursor-pointer"
          >
            <Play size={16} />
            Test
          </button>
        </div>
      </div>

      {/* Fact Type Tabs - Compact */}
      {factTypes.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4 shadow-card">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
              <Package size={14} />
              <span>Fact Type:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {factTypes.map((factType) => (
                <button
                  key={factType}
                  onClick={() => setSelectedFactType(factType)}
                  className={`px-2.5 py-1 rounded-lg text-body-sm font-medium transition-smooth cursor-pointer ${
                    selectedFactType === factType
                      ? 'bg-primary text-white shadow-sm hover:bg-primary-light'
                      : 'bg-surfaceContainerHigh text-text-secondary hover:bg-surfaceContainerHighest hover:text-text-primary'
                  }`}
                >
                  {factType}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Current Version Info */}
      <div className="bg-surface rounded-lg border border-border p-6 shadow-card">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Package size={20} className="text-primary" />
          Current Version {packageInfo.factType && `(${packageInfo.factType})`}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-body-sm text-text-tertiary mb-1">Fact Type</div>
              <div className="h4">{packageInfo.factType || selectedFactType}</div>
            </div>
            <div>
              <div className="text-body-sm text-text-tertiary mb-1">Version</div>
              <div className="h4">v{packageInfo.version}</div>
            </div>
            {packageInfo.package && (
              <div>
                <div className="text-body-sm text-text-tertiary mb-1">Package</div>
                <div className="h4 font-mono">{packageInfo.package}</div>
              </div>
            )}
            {packageInfo.releaseId && (
              <div>
                <div className="text-body-sm text-text-tertiary mb-1">Release ID</div>
                <div className="text-body-sm font-mono bg-surfaceContainerHigh p-2 rounded-lg border border-border">
                  {packageInfo.releaseId}
                </div>
              </div>
            )}
            {packageInfo.rulesCount !== undefined && (
              <div>
                <div className="text-body-sm text-text-tertiary mb-1">Rules Count</div>
                <div className="h4">{packageInfo.rulesCount}</div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <UserTimeMeta
              label="Deployed"
              user={packageInfo.deployedBy}
              timestamp={packageInfo.deployedAt}
              fallbackUser={null}
            />
            {packageInfo.changesDescription && (
              <div className="flex items-start gap-2">
                <FileText size={16} className="text-text-muted mt-1" />
                <div>
                  <div className="text-sm text-text-tertiary mb-1">Changes</div>
                  <div className="text-sm text-text-primary">{packageInfo.changesDescription}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        {packageInfo.rulesHash && (
          <div className="mt-4 pt-4 border-t border-outlineVariant">
            <div className="flex items-start gap-2">
              <Hash size={16} className="text-text-muted mt-1" />
              <div>
                <div className="text-sm text-text-tertiary mb-1">Rules Hash</div>
                <div className="text-xs font-mono bg-surfaceContainerHigh dark:bg-surfaceContainerHighest p-2 rounded border border-outlineVariant text-text-primary">
                  {packageInfo.rulesHash.substring(0, 16)}...
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rule Changes Table */}
      {packageInfo.ruleChanges && (
        (packageInfo.ruleChanges.added && packageInfo.ruleChanges.added.length > 0) ||
        (packageInfo.ruleChanges.removed && packageInfo.ruleChanges.removed.length > 0) ||
        (packageInfo.ruleChanges.updated && packageInfo.ruleChanges.updated.length > 0) ? (
          <div className="bg-surface rounded-lg border border-border p-6 shadow-card">
            <h2 className="section-title mb-4 flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              Rule Changes (v{packageInfo.version})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-4 text-body-sm font-semibold text-text-secondary">Type</th>
                    <th className="text-left py-2 px-4 text-body-sm font-semibold text-text-secondary">Rule Name</th>
                    <th className="text-left py-2 px-4 text-body-sm font-semibold text-text-secondary">Rule ID</th>
                    <th className="text-left py-2 px-4 text-body-sm font-semibold text-text-secondary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Added Rules */}
                  {packageInfo.ruleChanges.added && packageInfo.ruleChanges.added.map((rule) => (
                    <tr key={`added-${rule.id}`} className="border-b border-border hover:bg-surfaceContainerHigh transition-smooth">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-body-xs font-semibold bg-success-bg text-success ring-1 ring-success/20">
                          Added
                        </span>
                      </td>
                      <td className="py-3 px-4 text-body-sm font-medium text-text-primary">{rule.name}</td>
                      <td className="py-3 px-4 text-body-sm text-text-secondary">{rule.id}</td>
                      <td className="py-3 px-4">
                        <a
                          href={`/rules/${rule.id}`}
                          className="text-primary hover:text-primary-light hover:underline text-body-sm transition-smooth cursor-pointer"
                        >
                          View Rule
                        </a>
                      </td>
                    </tr>
                  ))}
                  {/* Updated Rules */}
                  {packageInfo.ruleChanges.updated && packageInfo.ruleChanges.updated.map((rule) => (
                    <tr key={`updated-${rule.id}`} className="border-b border-border hover:bg-surfaceContainerHigh transition-smooth">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-body-xs font-semibold bg-accent-bg text-accent ring-1 ring-accent/20">
                          Updated
                        </span>
                      </td>
                      <td className="py-3 px-4 text-body-sm font-medium text-text-primary">{rule.name}</td>
                      <td className="py-3 px-4 text-body-sm text-text-secondary">{rule.id}</td>
                      <td className="py-3 px-4">
                        <a
                          href={`/rules/${rule.id}`}
                          className="text-primary hover:text-primary-light hover:underline text-body-sm transition-smooth cursor-pointer"
                        >
                          View Rule
                        </a>
                      </td>
                    </tr>
                  ))}
                  {/* Removed Rules */}
                  {packageInfo.ruleChanges.removed && packageInfo.ruleChanges.removed.map((rule) => (
                    <tr key={`removed-${rule.id}`} className="border-b border-border hover:bg-surfaceContainerHigh transition-smooth">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-body-xs font-semibold bg-error-bg text-error ring-1 ring-error/20">
                          Removed
                        </span>
                      </td>
                      <td className="py-3 px-4 text-body-sm font-medium text-text-tertiary">{rule.name}</td>
                      <td className="py-3 px-4 text-body-sm text-text-tertiary">{rule.id}</td>
                      <td className="py-3 px-4">
                        <span className="text-text-muted text-body-sm">N/A</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* Version History */}
      {packageInfo.versionHistory && packageInfo.versionHistory.length > 0 && (
        <div className="bg-surface border border-outlineVariant rounded-lg p-6 shadow-card">
          <h2 className="section-title mb-4">Version History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outlineVariant bg-surfaceContainerHigh dark:bg-surfaceContainerHighest">
                  <th className="text-left py-2 px-4 text-sm font-semibold text-text-primary">Version</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-text-primary">Rules</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-text-primary">Release ID</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-text-primary">Changes</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-text-primary">Rule Details</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-text-primary">Deployed</th>
                  <th className="text-right py-2 px-4 text-sm font-semibold text-text-primary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packageInfo.versionHistory.map((version, idx) => (
                  <tr
                    key={version.version}
                    className={`border-b border-outlineVariant hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors ${
                      idx === 0 ? 'bg-primary-bg dark:bg-primary/10' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span className="font-semibold text-text-primary">v{version.version}</span>
                      {idx === 0 && (
                        <span className="ml-2 text-xs bg-primary text-white px-2 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-text-primary">{version.rulesCount}</td>
                    <td className="py-3 px-4">
                      {version.releaseId ? (
                        <span className="text-xs font-mono bg-surfaceContainerHigh dark:bg-surfaceContainerHighest p-1 rounded text-text-primary border border-outlineVariant">
                          {version.releaseId.length > 30
                            ? version.releaseId.substring(0, 30) + '...'
                            : version.releaseId}
                        </span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {version.changesDescription ? (
                        <span className="text-sm text-text-primary">{version.changesDescription}</span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {version.ruleChanges ? (
                        <div className="text-xs space-y-2">
                          {version.ruleChanges.added && version.ruleChanges.added.length > 0 && (
                            <div>
                              <div className="text-success dark:text-success-light font-semibold mb-1">
                                +{version.ruleChanges.added.length} Added:
                              </div>
                              <div className="pl-2 space-y-1">
                                {version.ruleChanges.added.map((rule) => (
                                  <div key={rule.id} className="text-success dark:text-success-light">
                                    <a 
                                      href={`/rules/${rule.id}`}
                                      className="hover:underline cursor-pointer"
                                    >
                                      {rule.name} (ID: {rule.id})
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {version.ruleChanges.removed && version.ruleChanges.removed.length > 0 && (
                            <div>
                              <div className="text-error dark:text-error-light font-semibold mb-1">
                                -{version.ruleChanges.removed.length} Removed:
                              </div>
                              <div className="pl-2 space-y-1">
                                {version.ruleChanges.removed.map((rule) => (
                                  <div key={rule.id} className="text-error dark:text-error-light">
                                    {rule.name} (ID: {rule.id})
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {version.ruleChanges.updated && version.ruleChanges.updated.length > 0 && (
                            <div>
                              <div className="text-accent dark:text-accent-light font-semibold mb-1">
                                ~{version.ruleChanges.updated.length} Updated:
                              </div>
                              <div className="pl-2 space-y-1">
                                {version.ruleChanges.updated.map((rule) => (
                                  <div key={rule.id} className="text-accent dark:text-accent-light">
                                    <a 
                                      href={`/rules/${rule.id}`}
                                      className="hover:underline cursor-pointer"
                                    >
                                      {rule.name} (ID: {rule.id})
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {(!version.ruleChanges.added || version.ruleChanges.added.length === 0) &&
                           (!version.ruleChanges.removed || version.ruleChanges.removed.length === 0) &&
                           (!version.ruleChanges.updated || version.ruleChanges.updated.length === 0) && (
                            <span className="text-text-muted">No changes</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <UserTimeMeta
                        user={version.deployedBy}
                        timestamp={version.deployedAt}
                        fallbackUser={null}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {idx === 0 ? (
                        <span className="text-xs text-text-tertiary italic">Active</span>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedVersionToActivate(version.version)
                            setActivationMode('new')
                            setActivationNotes('')
                            setShowActivateModal(true)
                          }}
                          className="text-sm px-3 py-1 bg-primary text-white rounded hover:bg-primary-light transition-colors cursor-pointer"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-outlineVariant shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2">
                <Play size={20} className="text-success" />
                Test KieContainer
              </h2>
              <button
                onClick={() => {
                  setShowTestModal(false)
                  setTestData('')
                  setTestResult(null)
                  setError(null)
                  setSelectedTestVersion(null)
                }}
                className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Version Selector */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Test Version
                </label>
                <Select
                  value={selectedTestVersion || ''}
                  onChange={(e) => setSelectedTestVersion(e.target.value ? Number(e.target.value) : null)}
                  className="w-full"
                >
                  <option value="">Current Version (v{packageInfo?.version || 'N/A'})</option>
                  {packageInfo?.versionHistory && packageInfo.versionHistory.length > 0 && 
                    packageInfo.versionHistory.map((version) => (
                      <option key={version.version} value={version.version}>
                        v{version.version} - {version.rulesCount} rules
                        {version.changesDescription ? ` (${version.changesDescription})` : ''}
                      </option>
                    ))
                  }
                </Select>
                <p className="text-xs text-text-tertiary mt-1">
                  {selectedTestVersion ? `Testing with version ${selectedTestVersion}` : 'Testing with current deployed version'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Declaration Data (JSON)
                </label>
                <textarea
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  className="w-full h-80 p-3 border border-outlineVariant rounded font-mono text-sm bg-surface text-text-primary focus-ring"
                />
              </div>

              {error && (
                <div className="p-3 bg-error-bg dark:bg-error/10 border border-error/30 rounded text-error dark:text-error-light text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !testData.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded hover:bg-success-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Play size={16} className={testing ? 'animate-pulse' : ''} />
                  {testing ? 'Testing...' : 'Run Test'}
                </button>
                <button
                  onClick={() => {
                    setShowTestModal(false)
                    setTestData('')
                    setTestResult(null)
                    setError(null)
                    setSelectedTestVersion(null)
                  }}
                  className="px-4 py-2 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest text-text-primary rounded hover:bg-surfaceContainerHighest dark:hover:bg-surfaceContainerHigh transition-colors cursor-pointer border border-outlineVariant"
                >
                  Cancel
                </button>
              </div>

              {testResult && (
                <div className="mt-4 p-4 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest border border-outlineVariant rounded">
                  <h3 className="font-semibold mb-2 text-success dark:text-success-light">✓ Test Results</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-text-primary">Success:</span>{' '}
                      <span className={testResult.success ? 'text-success' : 'text-error'}>
                        {testResult.success ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {testResult.declarationId && (
                      <div className="text-text-primary">
                        <span className="font-medium">Declaration ID:</span> {testResult.declarationId}
                      </div>
                    )}
                    {testResult.totalScore !== undefined && (
                      <div className="text-text-primary">
                        <span className="font-medium">Total Score:</span> {testResult.totalScore}
                      </div>
                    )}
                    {testResult.finalAction && (
                      <div>
                        <span className="font-medium text-text-primary">Final Action:</span>{' '}
                        <span className="px-2 py-1 bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light rounded text-xs">
                          {testResult.finalAction}
                        </span>
                      </div>
                    )}
                    {testResult.finalFlag && (
                      <div>
                        <span className="font-medium text-text-primary">Final Flag:</span>{' '}
                        <span className="px-2 py-1 bg-warning-bg dark:bg-warning/20 text-warning dark:text-warning-light rounded text-xs">
                          {testResult.finalFlag}
                        </span>
                      </div>
                    )}
                    {testResult.hitsCount !== undefined && (
                      <div className="text-text-primary">
                        <span className="font-medium">Rules Matched:</span> {testResult.hitsCount}
                      </div>
                    )}
                    {testResult.hits && testResult.hits.length > 0 && (
                      <div className="mt-4">
                        <span className="font-medium text-text-primary">Rule Hits:</span>
                        <div className="mt-2 space-y-2">
                          {testResult.hits.map((hit: any, index: number) => (
                            <div key={index} className="p-2 bg-surface border border-outlineVariant rounded text-xs">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-text-primary">Action:</span>
                                <span className="px-2 py-0.5 bg-accent-bg dark:bg-accent/20 text-accent dark:text-accent-light rounded">
                                  {hit.action || 'N/A'}
                                </span>
                                {hit.score !== undefined && (
                                  <>
                                    <span className="font-medium ml-2 text-text-primary">Score:</span>
                                    <span className="text-text-primary">{hit.score}</span>
                                  </>
                                )}
                              </div>
                              {hit.result && (
                                <div className="text-text-secondary mt-1">{hit.result}</div>
                              )}
                              {hit.flag && (
                                <div className="mt-1">
                                  <span className="text-text-tertiary">Flag:</span>{' '}
                                  <span className="px-2 py-0.5 bg-warning-bg dark:bg-warning/20 text-warning dark:text-warning-light rounded">
                                    {hit.flag}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-outlineVariant">
                      <details className="cursor-pointer">
                        <summary className="font-medium text-text-primary">View Raw JSON</summary>
                        <pre className="mt-2 p-3 bg-surfaceContainerHighest dark:bg-surfaceContainerHigh border border-outlineVariant text-success dark:text-success-light rounded text-xs overflow-x-auto">
                          {JSON.stringify(testResult, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Activate Version Modal */}
      {showActivateModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-outlineVariant">
            <div className="p-6 border-b border-outlineVariant">
              <div className="flex items-center justify-between">
                <h2 className="section-title">
                  Activate Version {selectedVersionToActivate}
                </h2>
                <button
                  onClick={() => {
                    setShowActivateModal(false)
                    setSelectedVersionToActivate(null)
                    setActivationNotes('')
                  }}
                  className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Warning Message */}
              <div className="bg-warning-bg dark:bg-warning/10 border border-warning/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-warning dark:text-warning-light mt-0.5">⚠️</div>
                  <div>
                    <h3 className="font-semibold text-warning dark:text-warning-light mb-1">Version Activation</h3>
                    <p className="text-sm text-warning dark:text-warning-light">
                      This will activate all rules from version <strong>v{selectedVersionToActivate}</strong> for{' '}
                      <strong>{selectedFactType}</strong>. Current active rules will be deactivated.
                    </p>
                  </div>
                </div>
              </div>

              {/* Activation Mode */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-3">
                  Activation Mode
                </label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 border border-outlineVariant rounded-lg cursor-pointer hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors">
                    <input
                      type="radio"
                      name="activationMode"
                      value="new"
                      checked={activationMode === 'new'}
                      onChange={() => setActivationMode('new')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-text-primary">Create New Version (Recommended)</div>
                      <div className="text-sm text-text-secondary mt-1">
                        Creates a new KieContainer version (e.g., v{(packageInfo?.version || 0) + 1}) with rules from v{selectedVersionToActivate}.
                        Preserves full history and allows easy rollback.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 border border-outlineVariant rounded-lg cursor-pointer hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors">
                    <input
                      type="radio"
                      name="activationMode"
                      value="rebuild"
                      checked={activationMode === 'rebuild'}
                      onChange={() => setActivationMode('rebuild')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-text-primary">Rebuild Current Version</div>
                      <div className="text-sm text-text-secondary mt-1">
                        Replaces current version (v{packageInfo?.version || 0}) with rules from v{selectedVersionToActivate}.
                        Does not increment version number. Use only for testing or quick fixes.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Activation Notes */}
              <div>
                <label htmlFor="activationNotes" className="block text-sm font-medium text-text-primary mb-2">
                  Activation Notes (Optional)
                </label>
                <textarea
                  id="activationNotes"
                  value={activationNotes}
                  onChange={(e) => setActivationNotes(e.target.value)}
                  placeholder="e.g., 'Rollback due to production issue' or 'Reactivating stable version'"
                  className="w-full px-3 py-2 border border-outlineVariant rounded-md focus-ring bg-surface text-text-primary placeholder:text-text-muted"
                  rows={3}
                />
              </div>
            </div>

            <div className="p-6 border-t border-outlineVariant flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowActivateModal(false)
                  setSelectedVersionToActivate(null)
                  setActivationNotes('')
                }}
                disabled={activating}
                className="px-4 py-2 border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest disabled:opacity-50 transition-colors cursor-pointer text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleActivateVersion}
                disabled={activating}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors cursor-pointer"
              >
                {activating && <RefreshCw size={16} className="animate-spin" />}
                {activating ? 'Activating...' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

