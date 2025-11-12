"use client"
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FilterRow } from '@/components/FilterRow'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/Pagination'
import { api, fetchApi } from '@/lib/api'
import { FileText, Package } from 'lucide-react'

export type Rule = {
  id: string
  name: string
  factType: string
  documentType: 'Import Declaration' | 'Valuation' | 'Container'
  ruleType: 'Risk' | 'Classification' | 'Compliance' | 'Valuation'
  outputType: 'Score' | 'Channel' | 'Flag' | 'Notification'
  status: 'Active' | 'Draft' | 'Inactive'
  updatedAt: string
}

type Filters = {
  query: string
  factType: string
  docType: string
  ruleType: string
  status: string
}

export default function RulesPage() {
  const [factTypes, setFactTypes] = useState<string[]>([])
  const [selectedFactType, setSelectedFactType] = useState<string>('All')
  const [filters, setFilters] = useState<Filters>({ query: '', factType: '', docType: '', ruleType: '', status: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sort, setSort] = useState<'name' | 'updatedAt'>('updatedAt')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

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

  const params = useMemo(() => {
    const s = new URLSearchParams()
    if (filters.query) s.set('query', filters.query)
    if (filters.factType) s.set('factType', filters.factType)
    if (filters.docType) s.set('docType', filters.docType)
    if (filters.ruleType) s.set('ruleType', filters.ruleType)
    if (filters.status) s.set('status', filters.status)
    s.set('page', String(page))
    s.set('pageSize', String(pageSize))
    s.set('sort', sort)
    s.set('dir', dir)
    return s.toString()
  }, [filters, page, pageSize, sort, dir])

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ items: Rule[]; total: number }>({
    queryKey: ['rules', params, selectedFactType],
    queryFn: async () => {
      const rules = await fetchApi<any[]>(api.rules.list())
      // Transform backend format to frontend format
      let items: Rule[] = rules.map((rule: any) => ({
        id: rule.id?.toString() || '',
        name: rule.ruleName || 'Unnamed Rule',
        factType: rule.factType || 'Declaration',
        documentType: 'Import Declaration' as const,
        ruleType: inferRuleTypeFromExpression(rule.whenExpr || rule.ruleCondition),
        outputType: inferOutputTypeFromExpression(rule.ruleResult || rule.description),
        status: rule.active ? 'Active' as const : 'Draft' as const,
        updatedAt: rule.lastModifiedDate || rule.createdDate || rule.updatedAt || rule.createdAt || new Date().toISOString(),
      }))
      
      // Filter by selected fact type
      if (selectedFactType !== 'All') {
        items = items.filter(rule => rule.factType === selectedFactType)
      }
      
      return { items, total: items.length }
    },
    staleTime: 10_000,
  })

  // Infer rule type from rule condition content
  function inferRuleTypeFromExpression(ruleCondition: string): Rule['ruleType'] {
    if (!ruleCondition) return 'Compliance'
    const expr = ruleCondition.toLowerCase()
    if (expr.includes('score') || expr.includes('risk')) return 'Risk'
    if (expr.includes('hscode') || expr.includes('classification')) return 'Classification'
    if (expr.includes('valuation') || expr.includes('value') || expr.includes('amount')) return 'Valuation'
    return 'Compliance'
  }

  // Infer output type from description content
  function inferOutputTypeFromExpression(description: string): Rule['outputType'] {
    if (!description) return 'Notification'
    const expr = description.toLowerCase()
    if (expr.includes('score') || expr.includes('risk')) return 'Score'
    if (expr.includes('flag')) return 'Flag'
    if (expr.includes('approve') || expr.includes('reject') || expr.includes('channel')) return 'Channel'
    return 'Notification'
  }

  const handleFactTypeChange = (factType: string) => {
    setSelectedFactType(factType)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Rules
        </h1>
      </div>

      {/* Fact Type Tabs */}
      {factTypes.length > 0 && (
        <div className="bg-white border border-outlineVariant rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package size={18} className="text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Fact Type:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFactTypeChange('All')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedFactType === 'All'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FileText size={16} />
              All Rules
            </button>
            {factTypes.map((factType) => (
              <button
                key={factType}
                onClick={() => handleFactTypeChange(factType)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedFactType === factType
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {factType === 'Declaration' ? <FileText size={16} /> : <Package size={16} />}
                {factType}
              </button>
            ))}
          </div>
          {selectedFactType !== 'All' && (
            <div className="mt-3 text-xs text-slate-500">
              Showing {data?.items.length || 0} rule(s) for <span className="font-semibold text-slate-700">{selectedFactType}</span>
            </div>
          )}
        </div>
      )}

      <FilterRow
        onChange={(f) => { setPage(1); setFilters({...f, factType: filters.factType}) }}
        defaults={filters}
      />

      <DataTable
        data-testid="table-rules"
        items={data?.items ?? []}
        loading={isLoading || isFetching}
        error={isError}
        onRetry={() => refetch()}
        sortField={sort}
        sortDir={dir}
        onSortChange={(field) => {
          if (sort === field) setDir(dir === 'asc' ? 'desc' : 'asc')
          else { setSort(field); setDir(field === 'updatedAt' ? 'desc' : 'asc') }
        }}
      />

      <PaginationBar
        data-testid="pagination-root"
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPage(1); setPageSize(n) }}
      />
    </div>
  )
}


