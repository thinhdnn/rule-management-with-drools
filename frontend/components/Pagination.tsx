"use client"
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
  onPageSizeChange: (n: number) => void
}

export function PaginationBar({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)

  return (
    <div className="h-14 bg-surface border border-border rounded-lg flex items-center justify-end px-4 gap-4 shadow-card" role="navigation" aria-label="Pagination" data-testid="pagination-root">
      <div className="flex items-center gap-2">
        <label className="text-sm text-text-secondary">Rows per page</label>
        <select className="h-9 px-3 rounded-lg bg-surface border border-border focus-ring transition-smooth text-text-primary hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} data-testid="rows-per-page">
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </div>
      <div className="text-sm text-text-secondary">{start}–{end} of {total}</div>
      <div className="flex items-center gap-1">
        <button
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-surfaceContainerHigh focus-ring transition-smooth disabled:opacity-50 disabled:cursor-not-allowed text-text-secondary hover:text-text-primary cursor-pointer"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          data-testid="btn-prev"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-surfaceContainerHigh focus-ring transition-smooth disabled:opacity-50 disabled:cursor-not-allowed text-text-secondary hover:text-text-primary cursor-pointer"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
          data-testid="btn-next"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}


