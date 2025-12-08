"use client"
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/Pagination'
import { Select } from '@/components/Select'
import { api, fetchApi } from '@/lib/api'
import { FileText, Package, Search } from 'lucide-react'

export type Rule = {
  id: string
  name: string
  factType: string
  documentType: 'Import Declaration' | 'Valuation' | 'Container' | 'Cargo Report'
  ruleType: 'Risk' | 'Classification' | 'Compliance' | 'Valuation'
  outputType: 'Score' | 'Channel' | 'Flag' | 'Notification'
  status: 'Active' | 'Draft' | 'Inactive'
  updatedAt: string
  generatedByAi?: boolean
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
      let items: Rule[] = rules.map((rule: any) => {
        // Map documentType based on factType
        const factType = rule.factType || 'Declaration'
        const documentType = factType === 'CargoReport' ? 'Cargo Report' : 'Import Declaration'
        
        return {
          id: rule.id?.toString() || '',
          name: rule.ruleName || 'Unnamed Rule',
          factType,
          documentType: documentType as 'Import Declaration' | 'Valuation' | 'Container' | 'Cargo Report',
          ruleType: inferRuleTypeFromExpression(rule.whenExpr || ''),
          outputType: inferOutputTypeFromExpression(rule.ruleResult || rule.description),
          status: rule.status === 'ACTIVE' ? 'Active' as const : 
                  rule.status === 'INACTIVE' ? 'Inactive' as const : 
                  'Draft' as const,
          generatedByAi: rule.generatedByAi || false,
          updatedAt: rule.lastModifiedDate || rule.createdDate || rule.updatedAt || rule.createdAt || new Date().toISOString(),
        }
      })
      
      // Filter by selected fact type
      if (selectedFactType !== 'All') {
        items = items.filter(rule => rule.factType === selectedFactType)
      }
      
      return { items, total: items.length }
    },
    staleTime: 10_000,
  })

  // Apply filters, sorting, and pagination
  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return []
    
    let result = [...data.items]
    
    // Apply text search filter
    if (filters.query) {
      const query = filters.query.toLowerCase()
      result = result.filter(rule => 
        rule.name.toLowerCase().includes(query) ||
        rule.ruleType.toLowerCase().includes(query) ||
        rule.outputType.toLowerCase().includes(query)
      )
    }
    
    // Apply document type filter
    if (filters.docType) {
      result = result.filter(rule => rule.documentType === filters.docType)
    }
    
    // Apply rule type filter
    if (filters.ruleType) {
      result = result.filter(rule => rule.ruleType === filters.ruleType)
    }
    
    // Apply status filter
    if (filters.status) {
      result = result.filter(rule => rule.status === filters.status)
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number
      
      if (sort === 'name') {
        aVal = a.name.toLowerCase()
        bVal = b.name.toLowerCase()
      } else {
        aVal = new Date(a.updatedAt).getTime()
        bVal = new Date(b.updatedAt).getTime()
      }
      
      if (dir === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      }
    })
    
    return result
  }, [data?.items, filters, sort, dir])

  // Apply pagination
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    const end = start + pageSize
    return filteredAndSortedItems.slice(start, end)
  }, [filteredAndSortedItems, page, pageSize])

  const totalFiltered = filteredAndSortedItems.length

  // Reset to page 1 if current page is out of bounds after filtering
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalFiltered / pageSize))
    if (page > maxPage && maxPage > 0) {
      setPage(1)
    }
  }, [totalFiltered, pageSize, page])

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Rules
        </h1>
      </div>

      {/* Fact Types and Filters - Combined Row */}
      <div className="bg-surface rounded-lg border border-border p-4 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Fact Type Tabs - Left Side */}
          {factTypes.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
              <div className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
                <Package size={14} />
                <span>Fact Type:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleFactTypeChange('All')}
                  className={`px-2.5 py-1 rounded-lg text-body-sm font-medium transition-smooth cursor-pointer ${
                    selectedFactType === 'All'
                      ? 'bg-primary text-white shadow-sm hover:bg-primary-light'
                      : 'bg-surfaceContainerHigh text-text-secondary hover:bg-surfaceContainerHighest hover:text-text-primary'
                  }`}
                >
                  All
                </button>
                {factTypes.map((factType) => (
                  <button
                    key={factType}
                    onClick={() => handleFactTypeChange(factType)}
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
              {selectedFactType !== 'All' && (
                <span className="text-body-xs text-text-tertiary">
                  ({data?.items.length || 0} rules)
                </span>
              )}
            </div>
          )}

          {/* Divider - Only visible on large screens */}
          {factTypes.length > 0 && (
            <div className="hidden lg:block w-px h-8 bg-border flex-shrink-0"></div>
          )}

          {/* Filters - Right Side */}
          <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
            <div className="relative flex-1 min-w-0" data-testid="filter-search">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} aria-hidden="true" />
              <input
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-surface border border-border focus-ring transition-smooth text-body-sm text-text-primary placeholder:text-text-muted hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10"
                placeholder="Search by name/type…"
                value={filters.query}
                onChange={(e) => { setPage(1); setFilters({...filters, query: e.target.value}) }}
              />
            </div>

            <Select 
              className="flex-shrink-0 text-body-sm" 
              value={filters.docType} 
              onChange={(e) => { setPage(1); setFilters({...filters, docType: e.target.value}) }} 
              data-testid="filter-doc" 
              aria-label="Document Type"
            >
              <option value="">Doc: All</option>
              <option>Import Declaration</option>
              <option>Valuation</option>
              <option>Container</option>
            </Select>

            <Select 
              className="flex-shrink-0 text-body-sm" 
              value={filters.ruleType} 
              onChange={(e) => { setPage(1); setFilters({...filters, ruleType: e.target.value}) }} 
              data-testid="filter-type" 
              aria-label="Rule Type"
            >
              <option value="">Type: All</option>
              <option>Risk</option>
              <option>Classification</option>
              <option>Compliance</option>
              <option>Valuation</option>
            </Select>

            <Select 
              className="flex-shrink-0 text-body-sm" 
              value={filters.status} 
              onChange={(e) => { setPage(1); setFilters({...filters, status: e.target.value}) }} 
              data-testid="filter-status" 
              aria-label="Status"
            >
              <option value="">Status: All</option>
              <option>Active</option>
              <option>Draft</option>
              <option>Inactive</option>
            </Select>

            <a 
              href="/rules/new" 
              data-testid="btn-new-rule" 
              className="h-9 inline-flex items-center justify-center px-3 rounded-lg bg-primary text-white text-body-sm font-medium focus-ring transition-smooth hover:bg-primary-light shadow-sm cursor-pointer flex-shrink-0 whitespace-nowrap"
            >
              New Rule
            </a>
          </div>
        </div>
      </div>

      <DataTable
        data-testid="table-rules"
        items={paginatedItems}
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
        total={totalFiltered}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPage(1); setPageSize(n) }}
      />
    </div>
  )
}


