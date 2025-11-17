'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Plus, Trash2, Edit } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { api, fetchApi } from '@/lib/api'
import { transformRule } from '@/app/api/rules/transform'

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
  ruleCondition: string
  description: string
  ruleAction: string | null
  ruleResult: string | null
  ruleScore: number | null
  conditions?: Condition[]
  output?: RuleOutput
}

type LogicalOperator = 'AND' | 'OR'

type Condition = {
  id: string
  field: string
  operator: string
  value: string
  logicalOp: LogicalOperator
}

type FieldDefinition = {
  name: string
  label: string
  type: string
  description?: string
}

type OperatorDefinition = {
  operator: string
  label: string
  description?: string
}

type FieldMetadata = {
  inputFields: FieldDefinition[]
  outputFields: FieldDefinition[]
  operatorsByType: Record<string, OperatorDefinition[]>
}

type RuleFormData = {
  ruleName: string
  label: string
  priority: number
  active: boolean
  output: Record<string, string> // Dynamic output fields from metadata
  versionNotes: string
  conditions: Condition[]
}

type Props = { params: Promise<{ id: string }> }

export default function EditRulePage({ params }: Props) {
  const router = useRouter()
  const { id } = use(params)
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [loadingMetadata, setLoadingMetadata] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<FieldMetadata | null>(null)
  
  const [formData, setFormData] = useState<RuleFormData>({
    ruleName: '',
    label: '',
    priority: 0,
    active: true,
    output: {}, // Will be initialized from metadata
    versionNotes: '',
    conditions: [{ id: crypto.randomUUID(), field: '', operator: '', value: '', logicalOp: 'AND' }],
  })

  // Initialize output fields from metadata (only for missing fields)
  useEffect(() => {
    if (metadata?.outputFields) {
      setFormData(prev => {
        const newOutput = { ...prev.output }
        // Only add fields that don't exist yet (don't overwrite existing values)
        metadata.outputFields.forEach(field => {
          if (!(field.name in newOutput)) {
            newOutput[field.name] = ''
          }
        })
        return {
          ...prev,
          output: newOutput
        }
      })
    }
  }, [metadata])

  // Fetch field metadata based on rule's factType
  // This will be called after rule is loaded
  const fetchMetadataForFactType = useCallback(async (factType: string) => {
    try {
      setLoadingMetadata(true)
      const data = await fetchApi<FieldMetadata>(api.rules.metadata(factType))
      setMetadata(data)
    } catch (err) {
      console.error('Failed to load metadata:', err)
    } finally {
      setLoadingMetadata(false)
    }
  }, [])

  // Fetch existing rule data
  useEffect(() => {
    const fetchRule = async () => {
      try {
        const data = await fetchApi(api.rules.get(id))
        const rule = transformRule((data as any)?.rule ?? data)

        const conditions = (rule.conditions && rule.conditions.length > 0)
          ? rule.conditions.map((condition: any) => ({
              id: crypto.randomUUID(),
              field: condition.field,
              operator: condition.operator,
              value: condition.value,
              logicalOp: (condition.logicalOp as 'AND' | 'OR') || 'AND',
            }))
          : parseRuleCondition(rule.ruleCondition)
        
        // Initialize output from rule.output or fallback to deprecated fields
        const output: Record<string, string> = {}
        if (rule.output) {
          Object.keys(rule.output).forEach(key => {
            const value = rule.output?.[key as keyof RuleOutput]
            output[key] = value !== null && value !== undefined ? String(value) : ''
          })
        } else {
          // Fallback to deprecated fields
          output.action = rule.ruleAction || ''
          output.result = rule.ruleResult || ''
          output.score = rule.ruleScore?.toString() || ''
          output.flag = ''
          output.documentType = ''
          output.documentId = ''
          output.description = ''
        }
        
        setFormData({
          ruleName: rule.ruleName,
          label: rule.label || '',
          priority: rule.priority,
          active: rule.status === 'ACTIVE',
          output,
          versionNotes: '',
          conditions: conditions.length > 0 ? conditions : [{ id: crypto.randomUUID(), field: '', operator: '', value: '', logicalOp: 'AND' }],
        })
        
        // Load metadata based on rule's factType
        const factType = rule.factType || 'Declaration'
        await fetchMetadataForFactType(factType)
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoadingData(false)
      }
    }
    fetchRule()
  }, [id, fetchMetadataForFactType])

  // Basic parser for ruleCondition (handles simple cases)
  const parseRuleCondition = (expr: string): Condition[] => {
    if (!expr || expr.trim() === '') return []
    
    // If condition has parentheses, it's too complex for simple parsing
    // Return empty array to require manual editing
    if (expr.includes('(') || expr.includes(')')) {
      return []
    }
    
    // Very basic parsing - handles simple cases like "field > value && field2 == value2"
    // This is a simplified version; for complex expressions, you'd need a proper parser
    const parts = expr.split(/\s+(&&|\|\|)\s+/)
    const conditions: Condition[] = []
    
    for (let i = 0; i < parts.length; i += 2) {
      const condition = parts[i]
      const logicalOp = parts[i + 1] === '||' ? 'OR' : 'AND'
      
      // Match pattern: field operator value
      const match = condition.match(/(\w+)\s*(==|!=|>|<|>=|<=|contains|startsWith|endsWith|matches)\s*(.+)/)
      if (match) {
        conditions.push({
          id: crypto.randomUUID(),
          field: match[1],
          operator: match[2],
          value: match[3].replace(/^["']|["']$/g, ''), // Remove quotes
          logicalOp,
        })
      }
    }
    
    return conditions
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate that at least one condition is filled
    const validConditions = formData.conditions.filter(c => c.field && c.operator && c.value)
    if (validConditions.length === 0) {
      setError('Please add at least one valid condition')
      setLoading(false)
      return
    }

    try {
      // Convert conditions to structured format matching DB schema
      const conditions = formData.conditions
        .filter(c => c.field && c.operator && c.value)
        .map(c => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
          logicalOp: c.logicalOp || 'AND'
        }))

      const payload = {
        ruleName: formData.ruleName,
        label: formData.label || formData.ruleName,
        priority: formData.priority,
        active: formData.active,
        conditions, // Send structured conditions array (not ruleCondition string)
        description: formData.label || formData.ruleName,
        output: Object.fromEntries(
          Object.entries(formData.output).map(([key, value]) => {
            // Convert numeric fields
            if (metadata?.outputFields) {
              const field = metadata.outputFields.find(f => f.name === key)
              if (field && (field.type === 'decimal' || field.type === 'number' || field.type === 'integer')) {
                return [key, value ? parseFloat(value) : null]
              }
            }
            return [key, value || null]
          })
        ),
        createNewVersion: true, // Always create new version on edit
        versionNotes: formData.versionNotes || null,
      }

      const updatedRule = await fetchApi(api.rules.update(id), {
        method: 'PUT',
        body: JSON.stringify(payload),
      }) as any
      
      // Navigate to the newly created version
      router.push(`/rules/${updatedRule.id}`)
    } catch (err: any) {
      // Extract error message from response if available
      let errorMessage = 'An error occurred'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      } else if (typeof err === 'string') {
        errorMessage = err
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const addCondition = () => {
    setFormData(prev => ({
      ...prev,
      conditions: [...prev.conditions, { id: crypto.randomUUID(), field: '', operator: '', value: '', logicalOp: 'AND' }],
    }))
  }

  const removeCondition = (id: string) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.filter(c => c.id !== id),
    }))
  }

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.map(c => c.id === id ? { ...c, ...updates } : c),
    }))
  }

  if (loadingData || loadingMetadata) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && loadingData) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  if (!metadata) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Failed to load field metadata</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 focus-ring rounded-md px-2 py-1"
        >
          <Edit className="w-4 h-4" />
          <ArrowLeft className="w-4 h-4" />
          Back to Rules
        </button>
        <h1 className="text-2xl font-semibold">Edit Rule</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-md border border-outlineVariant p-6">
          <div>
            <label htmlFor="ruleName" className="block text-sm font-medium text-slate-700 mb-1">
              Rule Name <span className="text-red-600">*</span>
            </label>
            <input
              id="ruleName"
              type="text"
              required
              value={formData.ruleName}
              onChange={(e) => setFormData(prev => ({ ...prev, ruleName: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
              placeholder="e.g., high_value_import_flag"
            />
            <p className="text-xs text-slate-500 mt-1">Internal identifier for the rule (use lowercase with underscores)</p>
          </div>
        </div>

        {/* Conditions (When) */}
        <section className="bg-surface rounded-md border border-outlineVariant p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Conditions (When)</h2>
            <button
              type="button"
              onClick={addCondition}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-ring"
            >
              <Plus size={16} /> Add Condition
            </button>
          </div>

          <div className="space-y-3">
            {formData.conditions.map((condition, idx) => {
              const selectedField = metadata.inputFields.find(f => f.name === condition.field)
              const operators = selectedField 
                ? (metadata.operatorsByType[selectedField.type] || [])
                : (metadata.operatorsByType['string'] || [])

              return (
                <div key={condition.id} className="flex items-start gap-2 bg-slate-50 p-3 rounded-md">
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    {idx > 0 && (
                      <select
                        value={formData.conditions[idx - 1]?.logicalOp || 'AND'}
                        onChange={(e) => updateCondition(formData.conditions[idx - 1].id, { logicalOp: e.target.value as LogicalOperator })}
                        className="col-span-2 h-9 px-2 text-sm rounded-md border border-outlineVariant focus-ring"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    )}
                    
                    <SearchableSelect
                      value={condition.field}
                      onChange={(value) => {
                        // Set default operator based on field type from metadata
                        const selectedField = metadata.inputFields.find(f => f.name === value)
                        const defaultOperators = selectedField 
                          ? (metadata.operatorsByType[selectedField.type] || [])
                          : (metadata.operatorsByType['string'] || [])
                        const defaultOperator = defaultOperators.length > 0 ? defaultOperators[0].operator : ''
                        updateCondition(condition.id, { field: value, operator: defaultOperator })
                      }}
                      options={metadata.inputFields}
                      placeholder="Select field..."
                      className={`${idx > 0 ? 'col-span-4' : 'col-span-6'}`}
                    />

                    <select
                      value={condition.operator && operators.some(op => op.operator === condition.operator) 
                        ? condition.operator 
                        : (operators.length > 0 ? operators[0].operator : '')}
                      onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                      className="col-span-3 h-9 px-2 text-sm rounded-md border border-outlineVariant focus-ring"
                      disabled={!condition.field || operators.length === 0}
                      title={operators.find(op => op.operator === condition.operator)?.description}
                    >
                      {operators.map(op => (
                        <option key={op.operator} value={op.operator} title={op.description}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type={selectedField?.type === 'integer' || selectedField?.type === 'decimal' ? 'number' : 'text'}
                      step={selectedField?.type === 'decimal' ? '0.01' : undefined}
                      value={condition.value}
                      onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                      placeholder="Value"
                      className="col-span-3 h-9 px-2 text-sm rounded-md border border-outlineVariant focus-ring"
                      disabled={!condition.field}
                      required
                    />
                  </div>

                  {formData.conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCondition(condition.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md focus-ring"
                      aria-label="Remove condition"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Outputs (Then) */}
        <section className="bg-surface rounded-md border border-outlineVariant p-6">
          <h2 className="text-lg font-semibold mb-4">Outputs (Then)</h2>
          <p className="text-sm text-slate-600 mb-4">
            Define what happens when this rule matches
          </p>

          {metadata?.outputFields && metadata.outputFields.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...metadata.outputFields]
                .sort((a, b) => {
                  // Sort by orderIndex if available, otherwise maintain insertion order
                  const orderA = (a as any).orderIndex ?? 999;
                  const orderB = (b as any).orderIndex ?? 999;
                  return orderA - orderB;
                })
                .map((field) => {
                const fieldValue = formData.output[field.name] || ''
                const isRequired = field.name === 'action'
                const isTextarea = field.type === 'text' || field.name === 'result' || field.name === 'description'
                const isNumber = field.type === 'decimal' || field.type === 'number' || field.type === 'integer'
                
                // Special handling for action field (dropdown)
                if (field.name === 'action') {
                  return (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {field.label} {isRequired && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        value={fieldValue}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          output: { ...prev.output, [field.name]: e.target.value }
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                        required={isRequired}
                      >
                        <option value="">-- Select {field.label} --</option>
                        <option value="FLAG">FLAG</option>
                        <option value="APPROVE">APPROVE</option>
                        <option value="REJECT">REJECT</option>
                        <option value="REVIEW">REVIEW</option>
                        <option value="HOLD">HOLD</option>
                      </select>
                      {field.description && (
                        <p className="text-xs text-slate-500 mt-1">{field.description}</p>
                      )}
                    </div>
                  )
                }

                // Textarea for text fields or specific fields
                if (isTextarea) {
                  return (
                    <div key={field.name} className={field.name === 'result' || field.name === 'description' ? 'md:col-span-2' : ''}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {field.label} {isRequired && <span className="text-red-600">*</span>}
                      </label>
                      <textarea
                        value={fieldValue}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          output: { ...prev.output, [field.name]: e.target.value }
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                        rows={field.name === 'description' ? 3 : 2}
                        placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                      />
                      {field.description && (
                        <p className="text-xs text-slate-500 mt-1">{field.description}</p>
                      )}
                    </div>
                  )
                }

                // Number input for decimal/number/integer
                if (isNumber) {
                  return (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {field.label} {isRequired && <span className="text-red-600">*</span>}
                      </label>
                      <input
                        type="number"
                        min={field.name === 'score' ? 0 : undefined}
                        max={field.name === 'score' ? 100 : undefined}
                        step={field.type === 'decimal' ? '0.01' : '1'}
                        value={fieldValue}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          output: { ...prev.output, [field.name]: e.target.value }
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                        placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                      />
                      {field.description && (
                        <p className="text-xs text-slate-500 mt-1">{field.description}</p>
                      )}
                    </div>
                  )
                }

                // Default text input
                return (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {field.label} {isRequired && <span className="text-red-600">*</span>}
                    </label>
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        output: { ...prev.output, [field.name]: e.target.value }
                      }))}
                      className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                      placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                    />
                    {field.description && (
                      <p className="text-xs text-slate-500 mt-1">{field.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading output fields...</p>
          )}
        </section>

        {/* Version Notes */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <label className="block text-sm font-medium text-blue-900 mb-2">
            Version Notes (Optional)
          </label>
          <textarea
            value={formData.versionNotes}
            onChange={(e) => setFormData(prev => ({ ...prev, versionNotes: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-blue-200 rounded-md focus-ring bg-white"
            rows={2}
            placeholder="Describe what changed in this version (e.g., Updated threshold values, Fixed condition logic)"
          />
          <p className="text-xs text-blue-700 mt-2">
            💡 Saving will create a new version of this rule. Add notes to help track changes.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 focus-ring disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-slate-50 focus-ring"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

