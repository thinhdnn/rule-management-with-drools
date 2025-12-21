"use client"
import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Rule } from '@/app/rules/page'
import { MoreVertical } from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { UserTimeMeta } from '@/components/UserTimeMeta'

type Props = {
  items: Rule[]
  loading: boolean
  error: boolean
  onRetry: () => void
  sortField: 'name' | 'updatedAt'
  sortDir: 'asc' | 'desc'
  onSortChange: (f: 'name' | 'updatedAt') => void
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
}

const RuleTypeColor: Record<Rule['ruleType'], string> = {
  Risk: 'bg-primary-bg text-primary ring-1 ring-primary/20',
  Classification: 'bg-secondary-bg text-secondary ring-1 ring-secondary/20',
  Compliance: 'bg-accent-bg text-accent ring-1 ring-accent/20',
  Valuation: 'bg-warning-bg text-warning ring-1 ring-warning/20',
}

const StatusColor: Record<Rule['status'], string> = {
  Active: 'bg-success-bg text-success ring-1 ring-success/20',
  Draft: 'bg-warning-bg text-warning ring-1 ring-warning/20',
  Inactive: 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border',
}

const FactTypeColor: Record<string, string> = {
  Declaration: 'bg-accent-bg text-accent ring-1 ring-accent/20',
  CargoReport: 'bg-secondary-bg text-secondary ring-1 ring-secondary/20',
  Traveler: 'bg-tertiary-bg text-tertiary ring-1 ring-tertiary/20',
}

export function DataTable({ items, loading, error, onRetry, sortField, sortDir, onSortChange, selectedIds = new Set(), onSelectionChange }: Props) {
  const router = useRouter()
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const menuRefs = useRef<(HTMLDivElement | null)[]>([])

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return
    if (checked) {
      onSelectionChange(new Set(items.map(item => item.id)))
    } else {
      onSelectionChange(new Set())
    }
  }

  const handleSelectItem = (id: string, checked: boolean) => {
    if (!onSelectionChange) return
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    onSelectionChange(newSelected)
  }

  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id))
  const someSelected = items.some(item => selectedIds.has(item.id))

  const caret = (field: 'name' | 'updatedAt') => (
    <span aria-hidden className={`ml-1 ${sortField === field ? '' : 'opacity-0'}`}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  )

  const skeletonRows = useMemo(() => Array.from({ length: 5 }).map((_, i) => i), [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuIndex !== null) {
        const menuElement = menuRefs.current[menuIndex]
        const target = event.target as Node
        
        // Check if click is outside the menu and its trigger button
        if (menuElement && !menuElement.contains(target)) {
          setMenuIndex(null)
        }
      }
    }

    if (menuIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuIndex])

  return (
    <section className="bg-surface rounded-lg border border-border shadow-card overflow-hidden" role="region" aria-label="Rules table">
      {error && (
        <div className="bg-error-bg text-error px-4 py-3 flex items-center justify-between border-b border-border" data-testid="state-error">
          <span className="font-medium">Couldn't load rules.</span>
          <button className="px-4 py-1.5 rounded-lg bg-error text-white focus-ring transition-smooth hover:bg-error-light cursor-pointer" onClick={onRetry}>Retry</button>
        </div>
      )}
      <div className="overflow-x-auto min-h-[400px]">
        <table className="w-full text-sm" role="table" aria-label="Rules" data-testid="table-rules">
          <thead className="bg-surfaceContainerHigh text-text-secondary" role="rowgroup">
            <tr role="row" className="h-12 border-b border-border">
              {onSelectionChange && (
                <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[3%]" data-testid="col-select">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected && !allSelected
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                    aria-label="Select all rules"
                  />
                </th>
              )}
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[20%]" data-testid="col-name">
                <button className="font-semibold focus-ring transition-smooth hover:text-text-primary cursor-pointer" aria-sort={sortField==='name'? (sortDir==='asc'?'ascending':'descending'):'none'} onClick={() => onSortChange('name')}>Rule Name {caret('name')}</button>
              </th>
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[10%] font-semibold" data-testid="col-fact-type">Target Object</th>
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[10%] font-semibold" data-testid="col-doc">Document Type</th>
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[10%] font-semibold" data-testid="col-type">Rule Type</th>
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[10%] font-semibold" data-testid="col-output">Output</th>
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[10%] font-semibold" data-testid="col-status">Status</th>
              <th role="columnheader" scope="col" className="text-left px-4 py-3 w-[15%]" data-testid="col-updated">
                <button className="font-semibold focus-ring transition-smooth hover:text-text-primary cursor-pointer" aria-sort={sortField==='updatedAt'? (sortDir==='asc'?'ascending':'descending'):'none'} onClick={() => onSortChange('updatedAt')}>Updated {caret('updatedAt')}</button>
              </th>
              <th role="columnheader" scope="col" className="text-right px-2 py-3 w-[15%] font-semibold" data-testid="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {loading && skeletonRows.map((k) => (
              <tr key={k} className="h-13 animate-pulse border-b border-border" data-testid="state-loading">
                {Array.from({ length: onSelectionChange ? 9 : 8 }).map((_, i) => (
                  <td key={i} className="px-4 py-3">
                    <div className="h-4 bg-surfaceContainerHigh rounded-lg" />
                  </td>
                ))}
              </tr>
            ))}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={onSelectionChange ? 9 : 8} className="px-4 py-10 text-center" data-testid="state-empty">
                  <div className="mx-auto w-12 h-12 rounded-lg bg-surfaceContainerHigh mb-3" />
                  <div className="text-text-primary font-medium mb-2">No rules found</div>
                  <button className="px-4 py-2 rounded-lg border border-border hover:bg-surfaceContainerHigh focus-ring transition-smooth text-text-secondary hover:text-text-primary cursor-pointer" onClick={() => window.location.reload()}>Clear filters</button>
                </td>
              </tr>
            )}

            {!loading && items.map((r, idx) => (
              <tr 
                key={r.id} 
                className="h-13 hover:bg-surfaceContainerHigh transition-smooth border-b border-border cursor-pointer"
                onDoubleClick={() => router.push(`/rules/${r.id}`)}
              >
                {onSelectionChange && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleSelectItem(r.id, e.target.checked)
                      }}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                      aria-label={`Select rule ${r.name}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold truncate-tooltip text-text-primary" title={r.name}>{r.name}</div>
                    {r.generatedByAi && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-secondary-bg text-secondary ring-1 ring-secondary/20" title="Generated by AI">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13 7H7v6h6V7z"/>
                          <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd"/>
                        </svg>
                        AI
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${FactTypeColor[r.factType] || 'bg-surfaceContainerHigh text-text-tertiary ring-1 ring-border'}`}>
                    {r.factType}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{r.documentType}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${RuleTypeColor[r.ruleType]}`}>{r.ruleType}</span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{r.outputType}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${StatusColor[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  <UserTimeMeta
                    timestamp={r.updatedAt}
                    hideUser={true}
                  />
                </td>
                <td className="px-2 py-3 text-right relative">
                  <div 
                    className="relative inline-block" 
                    ref={(el) => { menuRefs.current[idx] = el }}
                  >
                    <button
                      aria-haspopup="menu"
                      aria-expanded={menuIndex===idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuIndex(menuIndex === idx ? null : idx);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === 'Escape') setMenuIndex(null) }}
                      className="p-2 rounded-lg hover:bg-surfaceContainerHigh focus-ring transition-smooth text-text-tertiary hover:text-text-primary cursor-pointer"
                      data-testid="menu-row-actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuIndex === idx && (
                      <div 
                        role="menu" 
                        className={`absolute right-0 w-40 bg-surface border border-border rounded-lg shadow-card-hover z-[100] overflow-hidden ${
                          idx === 0 ? 'top-full mt-1' : idx >= items.length - 2 ? 'bottom-full mb-1' : 'top-full mt-1'
                        }`}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          <a 
                            href={`/rules/${r.id}`} 
                            className="flex items-center px-4 py-2.5 text-sm text-text-primary hover:bg-surfaceContainerHigh transition-smooth cursor-pointer" 
                            data-testid="action-view"
                          >
                            View
                          </a>
                          <a 
                            href={`/rules/${r.id}/edit`} 
                            className="flex items-center px-4 py-2.5 text-sm text-text-primary hover:bg-surfaceContainerHigh transition-smooth cursor-pointer" 
                            data-testid="action-edit"
                          >
                            Edit
                          </a>
                          <div className="border-t border-border"></div>
                          <button 
                            className="w-full flex items-center px-4 py-2.5 text-sm text-error hover:bg-error-bg transition-smooth cursor-pointer" 
                            data-testid="action-delete" 
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this rule?')) {
                                await fetchApi(api.rules.delete(r.id), { method: 'DELETE' })
                                window.location.reload()
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}


