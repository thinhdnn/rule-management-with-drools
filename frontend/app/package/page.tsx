"use client"

import { useEffect, useState } from 'react'
import { fetchApi, api } from '@/lib/api'
import { Package, RefreshCw, Clock, User, Hash, FileText, Rocket, Play, X, Server } from 'lucide-react'

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
  const [factTypes, setFactTypes] = useState<string[]>([])
  const [selectedFactType, setSelectedFactType] = useState<string>('Declaration')
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load package info')
    } finally {
      setLoading(false)
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

  const handleDeploy = async () => {
    try {
      setDeploying(true)
      setError(null)
      await fetchApi(api.rules.deploy(selectedFactType), { method: 'POST' })
      // Reload package info after deploy
      await loadPackageInfo(selectedFactType)
      alert('Rules deployed successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy rules')
    } finally {
      setDeploying(false)
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
      
      // Execute rules
      const result = await fetchApi(executeUrl, {
        method: 'POST',
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
          <div className="text-slate-500">Loading package information...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
          Error: {error}
        </div>
      </div>
    )
  }

  if (!packageInfo) {
    return (
      <div className="p-6">
        <div className="text-slate-500">No package information available</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server size={24} className="text-indigo-600" />
          <h1 className="text-2xl font-semibold">KieContainer Packages</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing || deploying}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleDeploy}
            disabled={deploying || refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
          >
            <Rocket size={16} className={deploying ? 'animate-pulse' : ''} />
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
          <button
            onClick={() => {
              setTestData(getTestData(selectedFactType))
              setSelectedTestVersion(packageInfo?.version || null)
              setShowTestModal(true)
            }}
            disabled={deploying || refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
          >
            <Play size={16} />
            Test
          </button>
        </div>
      </div>

      {/* Fact Type Tabs */}
      {factTypes.length > 0 && (
        <div className="bg-white border border-outlineVariant rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={18} className="text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Fact Type:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {factTypes.map((factType) => (
              <button
                key={factType}
                onClick={() => setSelectedFactType(factType)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedFactType === factType
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {factType}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current Version Info */}
      <div className="bg-white border border-outlineVariant rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package size={20} className="text-indigo-600" />
          Current Version {packageInfo.factType && `(${packageInfo.factType})`}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-500 mb-1">Fact Type</div>
              <div className="text-lg font-semibold">{packageInfo.factType || selectedFactType}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Version</div>
              <div className="text-lg font-semibold">v{packageInfo.version}</div>
            </div>
            {packageInfo.package && (
              <div>
                <div className="text-sm text-slate-500 mb-1">Package</div>
                <div className="text-lg font-semibold font-mono">{packageInfo.package}</div>
              </div>
            )}
            {packageInfo.releaseId && (
              <div>
                <div className="text-sm text-slate-500 mb-1">Release ID</div>
                <div className="text-sm font-mono bg-slate-50 p-2 rounded border">
                  {packageInfo.releaseId}
                </div>
              </div>
            )}
            {packageInfo.rulesCount !== undefined && (
              <div>
                <div className="text-sm text-slate-500 mb-1">Rules Count</div>
                <div className="text-lg font-semibold">{packageInfo.rulesCount}</div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {packageInfo.deployedAt && (
              <div className="flex items-start gap-2">
                <Clock size={16} className="text-slate-400 mt-1" />
                <div>
                  <div className="text-sm text-slate-500 mb-1">Deployed At</div>
                  <div className="text-sm">
                    {new Date(packageInfo.deployedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
            {packageInfo.deployedBy && (
              <div className="flex items-start gap-2">
                <User size={16} className="text-slate-400 mt-1" />
                <div>
                  <div className="text-sm text-slate-500 mb-1">Deployed By</div>
                  <div className="text-sm">{packageInfo.deployedBy}</div>
                </div>
              </div>
            )}
            {packageInfo.changesDescription && (
              <div className="flex items-start gap-2">
                <FileText size={16} className="text-slate-400 mt-1" />
                <div>
                  <div className="text-sm text-slate-500 mb-1">Changes</div>
                  <div className="text-sm">{packageInfo.changesDescription}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        {packageInfo.rulesHash && (
          <div className="mt-4 pt-4 border-t border-outlineVariant">
            <div className="flex items-start gap-2">
              <Hash size={16} className="text-slate-400 mt-1" />
              <div>
                <div className="text-sm text-slate-500 mb-1">Rules Hash</div>
                <div className="text-xs font-mono bg-slate-50 p-2 rounded border">
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
          <div className="bg-white border border-outlineVariant rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText size={20} className="text-indigo-600" />
              Rule Changes (v{packageInfo.version})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outlineVariant">
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Type</th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Rule Name</th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Rule ID</th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Added Rules */}
                  {packageInfo.ruleChanges.added && packageInfo.ruleChanges.added.map((rule) => (
                    <tr key={`added-${rule.id}`} className="border-b border-outlineVariant">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                          Added
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium">{rule.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{rule.id}</td>
                      <td className="py-3 px-4">
                        <a
                          href={`/rules/${rule.id}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm"
                        >
                          View Rule
                        </a>
                      </td>
                    </tr>
                  ))}
                  {/* Updated Rules */}
                  {packageInfo.ruleChanges.updated && packageInfo.ruleChanges.updated.map((rule) => (
                    <tr key={`updated-${rule.id}`} className="border-b border-outlineVariant">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                          Updated
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium">{rule.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{rule.id}</td>
                      <td className="py-3 px-4">
                        <a
                          href={`/rules/${rule.id}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm"
                        >
                          View Rule
                        </a>
                      </td>
                    </tr>
                  ))}
                  {/* Removed Rules */}
                  {packageInfo.ruleChanges.removed && packageInfo.ruleChanges.removed.map((rule) => (
                    <tr key={`removed-${rule.id}`} className="border-b border-outlineVariant">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                          Removed
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-500">{rule.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-500">{rule.id}</td>
                      <td className="py-3 px-4">
                        <span className="text-slate-400 text-sm">N/A</span>
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
        <div className="bg-white border border-outlineVariant rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Version History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outlineVariant">
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Version</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Rules</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Release ID</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Changes</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Rule Details</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Deployed At</th>
                  <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Deployed By</th>
                </tr>
              </thead>
              <tbody>
                {packageInfo.versionHistory.map((version, idx) => (
                  <tr
                    key={version.version}
                    className={`border-b border-outlineVariant ${
                      idx === 0 ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span className="font-semibold">v{version.version}</span>
                      {idx === 0 && (
                        <span className="ml-2 text-xs bg-indigo-600 text-white px-2 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">{version.rulesCount}</td>
                    <td className="py-3 px-4">
                      {version.releaseId ? (
                        <span className="text-xs font-mono bg-slate-50 p-1 rounded">
                          {version.releaseId.length > 30
                            ? version.releaseId.substring(0, 30) + '...'
                            : version.releaseId}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {version.changesDescription ? (
                        <span className="text-sm">{version.changesDescription}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {version.ruleChanges ? (
                        <div className="text-xs space-y-2">
                          {version.ruleChanges.added && version.ruleChanges.added.length > 0 && (
                            <div>
                              <div className="text-green-600 font-semibold mb-1">
                                +{version.ruleChanges.added.length} Added:
                              </div>
                              <div className="pl-2 space-y-1">
                                {version.ruleChanges.added.map((rule) => (
                                  <div key={rule.id} className="text-green-700">
                                    <a 
                                      href={`/rules/${rule.id}`}
                                      className="hover:underline"
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
                              <div className="text-red-600 font-semibold mb-1">
                                -{version.ruleChanges.removed.length} Removed:
                              </div>
                              <div className="pl-2 space-y-1">
                                {version.ruleChanges.removed.map((rule) => (
                                  <div key={rule.id} className="text-red-700">
                                    {rule.name} (ID: {rule.id})
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {version.ruleChanges.updated && version.ruleChanges.updated.length > 0 && (
                            <div>
                              <div className="text-blue-600 font-semibold mb-1">
                                ~{version.ruleChanges.updated.length} Updated:
                              </div>
                              <div className="pl-2 space-y-1">
                                {version.ruleChanges.updated.map((rule) => (
                                  <div key={rule.id} className="text-blue-700">
                                    <a 
                                      href={`/rules/${rule.id}`}
                                      className="hover:underline"
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
                            <span className="text-slate-400">No changes</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {new Date(version.deployedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {version.deployedBy || <span className="text-slate-400">-</span>}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Play size={20} className="text-green-600" />
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
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Version Selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Test Version
                </label>
                <select
                  value={selectedTestVersion || ''}
                  onChange={(e) => setSelectedTestVersion(e.target.value ? Number(e.target.value) : null)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedTestVersion ? `Testing with version ${selectedTestVersion}` : 'Testing with current deployed version'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Declaration Data (JSON)
                </label>
                <textarea
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  className="w-full h-80 p-3 border border-slate-300 rounded font-mono text-sm"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !testData.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>

              {testResult && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded">
                  <h3 className="font-semibold mb-2 text-green-700">✓ Test Results</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Success:</span>{' '}
                      <span className={testResult.success ? 'text-green-600' : 'text-red-600'}>
                        {testResult.success ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {testResult.declarationId && (
                      <div>
                        <span className="font-medium">Declaration ID:</span> {testResult.declarationId}
                      </div>
                    )}
                    {testResult.totalScore !== undefined && (
                      <div>
                        <span className="font-medium">Total Score:</span> {testResult.totalScore}
                      </div>
                    )}
                    {testResult.finalAction && (
                      <div>
                        <span className="font-medium">Final Action:</span>{' '}
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs">
                          {testResult.finalAction}
                        </span>
                      </div>
                    )}
                    {testResult.finalFlag && (
                      <div>
                        <span className="font-medium">Final Flag:</span>{' '}
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                          {testResult.finalFlag}
                        </span>
                      </div>
                    )}
                    {testResult.hitsCount !== undefined && (
                      <div>
                        <span className="font-medium">Rules Matched:</span> {testResult.hitsCount}
                      </div>
                    )}
                    {testResult.hits && testResult.hits.length > 0 && (
                      <div className="mt-4">
                        <span className="font-medium">Rule Hits:</span>
                        <div className="mt-2 space-y-2">
                          {testResult.hits.map((hit: any, index: number) => (
                            <div key={index} className="p-2 bg-white border border-slate-200 rounded text-xs">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">Action:</span>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                  {hit.action || 'N/A'}
                                </span>
                                {hit.score !== undefined && (
                                  <>
                                    <span className="font-medium ml-2">Score:</span>
                                    <span>{hit.score}</span>
                                  </>
                                )}
                              </div>
                              {hit.result && (
                                <div className="text-slate-600 mt-1">{hit.result}</div>
                              )}
                              {hit.flag && (
                                <div className="mt-1">
                                  <span className="text-slate-500">Flag:</span>{' '}
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                                    {hit.flag}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <details className="cursor-pointer">
                        <summary className="font-medium text-slate-700">View Raw JSON</summary>
                        <pre className="mt-2 p-3 bg-slate-800 text-green-400 rounded text-xs overflow-x-auto">
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
    </div>
  )
}

