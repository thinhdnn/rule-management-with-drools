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
        className="flex items-center gap-2 px-3 py-1.5 bg-accent-bg text-accent rounded-lg hover:bg-accent-bg/80 transition-smooth focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
      >
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">Version {currentVersion.version}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-card-hover w-96 z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border bg-surfaceContainerHigh">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
              Version History
            </p>
          </div>
          
          <div className="overflow-y-auto flex-1">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => handleVersionSelect(v.id)}
                className={`w-full text-left px-3 py-2.5 hover:bg-surfaceContainerHigh border-b border-border transition-smooth cursor-pointer ${
                  v.id === currentVersion.id ? 'bg-accent-bg' : ''
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">
                        Version {v.version}
                      </p>
                      {v.isLatest && (
                        <span className="px-2 py-0.5 bg-success-bg text-success text-xs font-medium rounded-lg ring-1 ring-success/20">
                          Latest
                        </span>
                      )}
                      {v.id === currentVersion.id && (
                        <Check className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    
                    {v.versionNotes && (
                      <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                        {v.versionNotes}
                      </p>
                    )}
                    
                    <UserTimeMeta
                      user={v.updatedBy}
                      timestamp={v.updatedAt}
                      relative
                      className="mt-1"
                      fallbackUser={null}
                    />
                  </div>
                  
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

