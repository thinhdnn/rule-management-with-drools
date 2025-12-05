"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

type Props = {
  onChange: (f: { query: string; docType: string; ruleType: string; status: string }) => void
  defaults: { query: string; docType: string; ruleType: string; status: string }
}

export function FilterRow({ onChange, defaults }: Props) {
  const [query, setQuery] = useState(defaults.query)
  const [docType, setDocType] = useState(defaults.docType)
  const [ruleType, setRuleType] = useState(defaults.ruleType)
  const [status, setStatus] = useState(defaults.status)
  const debounceRef = useRef<number | null>(null)

  const payload = useMemo(() => ({ query, docType, ruleType, status }), [query, docType, ruleType, status])

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => onChange(payload), 250)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [payload, onChange])

  return (
    <section className="bg-surface rounded-lg border border-border p-4 flex flex-col md:flex-row gap-3 items-stretch shadow-card" aria-label="Filters">
      <div className="relative flex-1" data-testid="filter-search">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} aria-hidden="true" />
        <input
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface border border-border focus-ring transition-smooth text-text-primary placeholder:text-text-muted hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10"
          placeholder="Search by name/type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <select className="h-10 px-3 rounded-lg bg-surface border border-border focus-ring transition-smooth text-text-primary hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer" value={docType} onChange={(e) => setDocType(e.target.value)} data-testid="filter-doc" aria-label="Document Type">
        <option value="">Document Type: All</option>
        <option>Import Declaration</option>
        <option>Valuation</option>
        <option>Container</option>
      </select>

      <select className="h-10 px-3 rounded-lg bg-surface border border-border focus-ring transition-smooth text-text-primary hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer" value={ruleType} onChange={(e) => setRuleType(e.target.value)} data-testid="filter-type" aria-label="Rule Type">
        <option value="">Rule Type: All</option>
        <option>Risk</option>
        <option>Classification</option>
        <option>Compliance</option>
        <option>Valuation</option>
      </select>

      <select className="h-10 px-3 rounded-lg bg-surface border border-border focus-ring transition-smooth text-text-primary hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-status" aria-label="Status">
        <option value="">Status: All</option>
        <option>Active</option>
        <option>Draft</option>
        <option>Inactive</option>
      </select>

      <a href="/rules/new" data-testid="btn-new-rule" className="h-10 inline-flex items-center justify-center px-4 rounded-lg bg-primary text-white font-medium focus-ring transition-smooth hover:bg-primary-light shadow-sm cursor-pointer">New Rule</a>
    </section>
  )
}


