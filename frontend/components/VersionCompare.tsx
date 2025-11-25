'use client'

import React, { useMemo } from 'react'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { UserTimeMeta } from '@/components/UserTimeMeta'

type Condition = {
  id: string
  field: string
  operator: string
  value: string
  logicalOp: 'AND' | 'OR'
}

type RuleOutput = {
  action: string | null
  score: number | null
  result: string | null
  flag: string | null
  documentType: string | null
  documentId: string | null
  description: string | null
}

type Rule = {
  id: number
  ruleName: string
  label: string | null
  priority: number
  status: string
  version: number
  versionNotes: string | null
  updatedAt: string
  updatedBy: string | null
  conditions?: Condition[]
  output?: RuleOutput
}

type FieldDefinition = {
  name: string
  label: string
  type: string
  description?: string
}

type Metadata = {
  inputFields?: FieldDefinition[]
  outputFields?: FieldDefinition[]
}

type Props = {
  oldVersion: Rule
  newVersion: Rule
  metadata?: Metadata
}

type FieldDiff = {
  field: string
  label: string
  oldValue: any
  newValue: any
  changed: boolean
  isComplex?: boolean
}

export function VersionCompare({ oldVersion, newVersion, metadata }: Props) {
  const diffs = useMemo<FieldDiff[]>(() => {
    const fields: FieldDiff[] = [
      {
        field: 'ruleName',
        label: 'Rule Name',
        oldValue: oldVersion.ruleName,
        newValue: newVersion.ruleName,
        changed: oldVersion.ruleName !== newVersion.ruleName,
      },
      {
        field: 'label',
        label: 'Label',
        oldValue: oldVersion.label,
        newValue: newVersion.label,
        changed: oldVersion.label !== newVersion.label,
      },
      {
        field: 'priority',
        label: 'Priority',
        oldValue: oldVersion.priority,
        newValue: newVersion.priority,
        changed: oldVersion.priority !== newVersion.priority,
      },
      {
        field: 'status',
        label: 'Status',
        oldValue: oldVersion.status,
        newValue: newVersion.status,
        changed: oldVersion.status !== newVersion.status,
      },
      {
        field: 'conditions',
        label: 'Conditions',
        oldValue: oldVersion.conditions || [],
        newValue: newVersion.conditions || [],
        changed: JSON.stringify(oldVersion.conditions || []) !== JSON.stringify(newVersion.conditions || []),
        isComplex: true,
      },
      {
        field: 'output',
        label: 'Output',
        oldValue: oldVersion.output || {},
        newValue: newVersion.output || {},
        changed: JSON.stringify(oldVersion.output || {}) !== JSON.stringify(newVersion.output || {}),
        isComplex: true,
      },
    ]

    return fields
  }, [oldVersion, newVersion])

  const changedFields = diffs.filter((d) => d.changed)
  const hasChanges = changedFields.length > 0

  const getFieldLabel = (fieldName: string): string => {
    if (!metadata?.inputFields) return fieldName
    const field = metadata.inputFields.find(f => f.name === fieldName)
    return field?.label || fieldName
  }

  const getOutputFieldLabel = (fieldName: string): string => {
    if (!metadata?.outputFields) return fieldName
    const field = metadata.outputFields.find(f => f.name === fieldName)
    return field?.label || fieldName
  }

  const getOperatorLabel = (operator: string): string => {
    // Map common operators to readable labels
    const operatorMap: Record<string, string> = {
      '==': 'Equal to',
      '!=': 'Not equal to',
      '>': 'Greater than',
      '<': 'Less than',
      '>=': 'Greater than or equal',
      '<=': 'Less than or equal',
      'contains': 'Contains',
      'startsWith': 'Starts with',
      'endsWith': 'Ends with',
      'matches': 'Matches',
      'isEmpty': 'Is empty',
      'isNotEmpty': 'Is not empty',
    }
    return operatorMap[operator] || operator
  }

  const formatValue = (value: any, isComplex: boolean = false): string | React.ReactNode => {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? 'Active' : 'Inactive'
    if (isComplex) {
      if (Array.isArray(value)) {
        if (value.length === 0) return 'No conditions'
        return (
          <div className="space-y-2">
            {value.map((condition: Condition, idx: number) => (
              <div key={condition.id || idx} className="text-xs bg-slate-50 p-2 rounded border border-slate-200">
                {idx > 0 && <span className="text-slate-400 mr-2">{condition.logicalOp}</span>}
                <span className="font-medium">{getFieldLabel(condition.field)}</span>
                <span className="mx-1 text-slate-400">{getOperatorLabel(condition.operator)}</span>
                <span>{condition.value}</span>
              </div>
            ))}
          </div>
        )
      }
      if (typeof value === 'object') {
        const entries = Object.entries(value).filter(([_, v]) => v !== null && v !== undefined)
        if (entries.length === 0) return 'No output configured'
        return (
          <div className="space-y-1">
            {entries.map(([key, val]) => (
              <div key={key} className="text-xs">
                <span className="font-medium text-slate-600">{getOutputFieldLabel(key)}:</span>{' '}
                <span className="text-slate-800">{String(val)}</span>
              </div>
            ))}
          </div>
        )
      }
    }
    if (typeof value === 'string' && value.length > 200) return value.substring(0, 200) + '...'
    return String(value)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-50 rounded-md p-4 border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">Old Version</p>
            <p className="text-lg font-semibold text-slate-900">v{oldVersion.version}</p>
            <div className="mt-1">
              <UserTimeMeta
                user={oldVersion.updatedBy}
                timestamp={oldVersion.updatedAt}
                fallbackUser={null}
                hideUser={false}
              />
            </div>
          </div>
          
          <ArrowRight className="w-5 h-5 text-slate-400" />
          
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">New Version</p>
            <p className="text-lg font-semibold text-slate-900">v{newVersion.version}</p>
            <div className="mt-1">
              <UserTimeMeta
                user={newVersion.updatedBy}
                timestamp={newVersion.updatedAt}
                fallbackUser={null}
                hideUser={false}
              />
            </div>
          </div>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{changedFields.length} fields changed</span>
          </div>
        )}
      </div>

      {/* Version notes */}
      {newVersion.versionNotes && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-xs font-semibold text-blue-900 mb-1">Change Notes:</p>
          <p className="text-sm text-blue-800">{newVersion.versionNotes}</p>
        </div>
      )}

      {/* Changes table */}
      {!hasChanges ? (
        <div className="text-center py-8 text-slate-500">
          <p>No changes detected between these versions</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700 w-1/4">Field</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700 w-3/8 bg-red-50">
                  Old Value (v{oldVersion.version})
                </th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700 w-3/8 bg-green-50">
                  New Value (v{newVersion.version})
                </th>
              </tr>
            </thead>
            <tbody>
              {changedFields.map((diff) => (
                <tr key={diff.field} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{diff.label}</td>
                  <td className="px-4 py-3 bg-red-50/50 border-l-2 border-red-300">
                    <div className={`text-xs text-slate-700 ${diff.isComplex ? '' : 'font-mono whitespace-pre-wrap break-words'}`}>
                      {formatValue(diff.oldValue, diff.isComplex)}
                    </div>
                  </td>
                  <td className="px-4 py-3 bg-green-50/50 border-l-2 border-green-300">
                    <div className={`text-xs text-slate-700 ${diff.isComplex ? '' : 'font-mono whitespace-pre-wrap break-words'}`}>
                      {formatValue(diff.newValue, diff.isComplex)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unchanged fields (collapsed by default) */}
      <details className="border border-slate-200 rounded-md">
        <summary className="px-4 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100 text-sm text-slate-600">
          Show unchanged fields ({diffs.length - changedFields.length})
        </summary>
        <div className="p-4 space-y-2">
          {diffs
            .filter((d) => !d.changed)
            .map((diff) => (
              <div key={diff.field} className="flex items-start gap-2 text-sm">
                <span className="font-medium text-slate-700 w-1/4">{diff.label}:</span>
                <div className="text-slate-600 text-xs flex-1">
                  {typeof formatValue(diff.oldValue, diff.isComplex) === 'string' 
                    ? <span className="font-mono">{formatValue(diff.oldValue, diff.isComplex) as string}</span>
                    : formatValue(diff.oldValue, diff.isComplex)
                  }
                </div>
              </div>
            ))}
        </div>
      </details>
    </div>
  )
}

