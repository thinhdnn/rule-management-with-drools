'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, RotateCcw, GitBranch } from 'lucide-react'
import type { RuleVersion } from './VersionDropdown'
import { UserTimeMeta } from '@/components/UserTimeMeta'

type Props = {
  versions: RuleVersion[]
  currentVersionId: number
  onRestore?: (versionId: number) => Promise<void>
}

export function VersionTimeline({ versions, currentVersionId, onRestore }: Props) {
  const router = useRouter()
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const handleRestore = async (versionId: number) => {
    if (!onRestore) return
    
    if (!confirm('Are you sure you want to restore this version? This will create a new version with the same content.')) {
      return
    }

    setRestoringId(versionId)
    try {
      await onRestore(versionId)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-text-secondary mb-6">
        <GitBranch className="w-5 h-5" />
        <h2 className="text-lg font-semibold text-text-primary">Version History</h2>
        <span className="text-sm text-text-tertiary">({versions.length} versions)</span>
      </div>

      <div className="space-y-0">
        {versions.map((version, idx) => (
          <div key={version.id} className="relative pl-8 pb-8 last:pb-0">
            {/* Timeline line */}
            {idx < versions.length - 1 && (
              <div className="absolute left-2 top-6 bottom-0 w-0.5 bg-border"></div>
            )}

            {/* Timeline dot */}
            <div
              className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-surface ${
                version.isLatest
                  ? 'bg-success ring-2 ring-success/20'
                  : version.id === currentVersionId
                  ? 'bg-primary ring-2 ring-primary/20'
                  : 'bg-surfaceContainerHighest'
              }`}
            ></div>

            {/* Version card */}
            <div
              className={`bg-surface border rounded-md p-4 hover:shadow-card-hover transition-shadow cursor-pointer ${
                version.id === currentVersionId ? 'border-primary/30 shadow-card' : 'border-border'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-text-primary">Version {version.version}</h3>
                    {version.isLatest && (
                      <span className="px-2 py-0.5 bg-success-bg text-success ring-1 ring-success/20 text-xs font-medium rounded">
                        Current
                      </span>
                    )}
                    {version.id === currentVersionId && !version.isLatest && (
                      <span className="px-2 py-0.5 bg-primary-bg text-primary ring-1 ring-primary/20 text-xs font-medium rounded">
                        Viewing
                      </span>
                    )}
                  </div>

                  <UserTimeMeta
                    label="Updated"
                    user={version.updatedBy}
                    timestamp={version.updatedAt}
                    className="mt-1"
                    fallbackUser={null}
                  />
                </div>
              </div>

              {version.versionNotes && (
                <p className="text-sm text-text-secondary mb-3 bg-surfaceContainerHigh rounded px-3 py-2 border-l-2 border-border">
                  {version.versionNotes}
                </p>
              )}

              <div className="flex gap-2">
                {version.id !== currentVersionId && (
                  <button
                    onClick={() => router.push(`/rules/${version.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary-bg rounded-md transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                )}

                {!version.isLatest && onRestore && (
                  <button
                    onClick={() => handleRestore(version.id)}
                    disabled={restoringId === version.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-success hover:bg-success-bg rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${restoringId === version.id ? 'animate-spin' : ''}`} />
                    {restoringId === version.id ? 'Restoring...' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

