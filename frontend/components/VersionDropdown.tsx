'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Clock, Check } from 'lucide-react'
import { UserTimeMeta } from '@/components/UserTimeMeta'

export type RuleVersion = {
  id: number
  version: number
  isLatest: boolean
  versionNotes: string | null
  updatedAt: string
  updatedBy: string | null
}

type Props = {
  currentVersion: RuleVersion
  versions: RuleVersion[]
  onVersionChange?: (versionId: number) => void
}

export function VersionDropdown({ currentVersion, versions, onVersionChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleVersionSelect = (versionId: number) => {
    setIsOpen(false)
    if (onVersionChange) {
      onVersionChange(versionId)
    } else {
      router.push(`/rules/${versionId}`)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 h-9 bg-surface border rounded-lg transition-all duration-200 cursor-pointer ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20 shadow-sm'
            : 'border-border hover:bg-surfaceContainerHigh hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-sm font-medium text-text-primary">
          v{currentVersion.version}
        </span>
        {currentVersion.isLatest && (
          <span className="px-1.5 py-0.5 bg-success-bg text-success text-[10px] font-semibold uppercase tracking-wide rounded ring-1 ring-success/20">
            Latest
          </span>
        )}
        <ChevronDown 
          className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          
          {/* Dropdown */}
          <div 
            role="listbox"
            className="absolute top-full left-0 mt-1.5 bg-surface border border-border rounded-lg shadow-lg backdrop-blur-sm bg-surface/95 w-72 z-50 max-h-[24rem] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <div className="px-3 py-2.5 border-b border-border bg-surfaceContainerHigh/50">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Select Version
              </p>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar">
              {versions.map((v, idx) => {
                const isSelected = v.id === currentVersion.id
                
                return (
                  <button
                    key={v.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleVersionSelect(v.id)}
                    className={`w-full text-left px-3 py-3 transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-primary-bg text-primary'
                        : 'text-text-primary hover:bg-surfaceContainerHigh'
                    } ${idx < versions.length - 1 ? 'border-b border-border/50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-semibold">
                          v{v.version}
                        </span>
                        {v.isLatest && (
                          <span className="px-1.5 py-0.5 bg-success-bg text-success text-[10px] font-semibold uppercase tracking-wide rounded ring-1 ring-success/20 flex-shrink-0">
                            Latest
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                      )}
                    </div>
                    
                    {v.versionNotes && (
                      <p className="text-xs text-text-tertiary line-clamp-1 mb-1.5">
                        {v.versionNotes}
                      </p>
                    )}
                    
                    <div>
                      <UserTimeMeta
                        user={v.updatedBy}
                        timestamp={v.updatedAt}
                        relative
                        className="text-[11px]"
                        fallbackUser={null}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

