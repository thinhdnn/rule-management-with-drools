'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Plus, Trash2, Edit } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Select } from '@/components/Select'
import { api, fetchApi } from '@/lib/api'
import { transformRule } from '@/app/api/rules/transform'
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts'

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
          : []
        
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



  const formRef = useRef<HTMLFormElement>(null)
  const handleSubmitRef = useRef<((e?: React.FormEvent) => Promise<void>) | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (loading) return
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
      // Convert conditions to new ConditionsGroup format with nested structure
      // Group conditions by object path and logical operator, preserving order
      const validConditions = formData.conditions.filter(c => c.field && c.operator && c.value)
      
      // Build conditions structure
      let conditions: any = null
      if (validConditions.length === 1) {
        // Single condition: wrap in AND array
        conditions = {
          AND: [{
            field: validConditions[0].field,
            operator: validConditions[0].operator,
            value: validConditions[0].value
          }]
        }
      } else if (validConditions.length > 1) {
        const andConditions: any[] = []
        const orConditions: any[] = []
        
        // Group conditions sequentially by object path (preserve order)
        let currentGroup: any[] = []
        let currentObjectPath: string | null = null
        let currentGroupLogicalOp: LogicalOperator | null = null
        let isFirstGroup = true
        
        for (let i = 0; i < validConditions.length; i++) {
          const cond = validConditions[i]
          const objectPath = getObjectPath(cond.field)
          const logicalOp = cond.logicalOp || 'AND'
          
          // If object path changed, finalize current group and start new group
          if (currentObjectPath !== null && objectPath !== currentObjectPath) {
            // Add current group as nested ConditionsGroup if it has 2+ conditions
            if (currentGroup.length > 0) {
              if (currentGroup.length === 1) {
                // Single condition: add directly to parent
                if (isFirstGroup) {
                  andConditions.push(currentGroup[0])
                } else {
                  // Create nested group for this single condition (will be added to parent AND)
                  const nestedGroup: any = {}
                  nestedGroup.AND = currentGroup
                  andConditions.push(nestedGroup)
                }
              } else {
                // Multiple conditions: create nested ConditionsGroup
                const nestedGroup: any = {}
                if (currentGroupLogicalOp === 'OR') {
                  nestedGroup.OR = currentGroup
                  orConditions.push(nestedGroup)
                } else {
                  nestedGroup.AND = currentGroup
                  andConditions.push(nestedGroup)
                }
              }
            }
            // Start new group
            currentGroup = []
            currentGroupLogicalOp = null
            isFirstGroup = false
          }
          
          // Add condition to current group
          currentGroup.push({
            field: cond.field,
            operator: cond.operator,
            value: cond.value
          })
          
          // Set logical operator for this group (use the logicalOp of the second condition in the group)
          if (currentGroup.length === 2 && currentGroupLogicalOp === null) {
            currentGroupLogicalOp = logicalOp
          }
          
          currentObjectPath = objectPath
        }
        
        // Add final group
        if (currentGroup.length > 0) {
          if (currentGroup.length === 1) {
            // Single condition: add directly to parent
            if (isFirstGroup) {
              andConditions.push(currentGroup[0])
            } else {
              // Create nested group for this single condition
              const nestedGroup: any = {}
              nestedGroup.AND = currentGroup
              andConditions.push(nestedGroup)
            }
          } else {
            // Multiple conditions: create nested ConditionsGroup
            const nestedGroup: any = {}
            if (currentGroupLogicalOp === 'OR') {
              nestedGroup.OR = currentGroup
              orConditions.push(nestedGroup)
            } else {
              nestedGroup.AND = currentGroup
              andConditions.push(nestedGroup)
            }
          }
        }
        
        // Build ConditionsGroup (top level)
        conditions = {}
        if (andConditions.length > 0) {
          conditions.AND = andConditions
        }
        if (orConditions.length > 0) {
          conditions.OR = orConditions
        }
        
        // If both are empty, set to null
        if (andConditions.length === 0 && orConditions.length === 0) {
          conditions = null
        }
      }

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

  // Update ref when handleSubmit changes
  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  }, [handleSubmit])

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onEnter: (e) => {
      // Only submit if not in textarea and form is valid
      const target = e.target as HTMLElement
      if (target.tagName !== 'TEXTAREA' && !loading && formRef.current && handleSubmitRef.current) {
        const form = formRef.current
        if (form.checkValidity()) {
          handleSubmitRef.current()
        } else {
          form.reportValidity()
        }
      }
    },
    onEscape: () => {
      if (!loading && !loadingData && !loadingMetadata) {
        router.back()
      }
    },
    enabled: !loadingData && !loadingMetadata,
    allowInInputs: true,
  })

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

  // Extract object path from field path
  // Example: "declaration.invoiceAmount" -> "declaration"
  // Example: "declaration.governmentAgencyGoodsItems.netWeightMeasure" -> "declaration.governmentAgencyGoodsItems"
  const getObjectPath = (fieldPath: string): string => {
    if (!fieldPath) return ''
    const parts = fieldPath.split('.')
    if (parts.length <= 1) return fieldPath
    // Return all parts except the last one (the actual field name)
    return parts.slice(0, -1).join('.')
  }

  // Check if two conditions have the same object path
  const hasSameObjectPath = (field1: string, field2: string): boolean => {
    if (!field1 || !field2) return false
    return getObjectPath(field1) === getObjectPath(field2)
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
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-error-bg border border-error/30 rounded-md p-4">
          <p className="text-error">{error}</p>
        </div>
      </div>
    )
  }

  if (!metadata) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-error-bg border border-error/30 rounded-md p-4">
          <p className="text-error">Failed to load field metadata</p>
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
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary focus-ring rounded-md px-2 py-1 transition-colors cursor-pointer"
        >
          <Edit className="w-4 h-4" />
          <ArrowLeft className="w-4 h-4" />
          Back to Rules
        </button>
        <h1 className="page-title">Edit Rule</h1>
      </div>

      {error && (
        <div className="bg-error-bg border border-error/30 rounded-md p-4">
          <p className="text-error">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-surface rounded-md border border-outlineVariant p-6">
          <div>
            <label htmlFor="ruleName" className="block text-sm font-medium text-text-secondary mb-1">
              Rule Name <span className="text-error">*</span>
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
            <p className="text-xs text-text-tertiary mt-1">Internal identifier for the rule (use lowercase with underscores)</p>
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

              // Check if we should show logical operator for this condition
              const prevCondition = idx > 0 ? formData.conditions[idx - 1] : null
              const showLogicalOp = prevCondition?.field && condition?.field && 
                                   hasSameObjectPath(prevCondition.field, condition.field)

              return (
                <div key={condition.id} className="flex items-start gap-2 bg-surfaceContainerHigh p-3 rounded-md">
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    {idx > 0 && showLogicalOp && (
                      <Select
                        value={prevCondition?.logicalOp || 'AND'}
                        onChange={(e) => updateCondition(prevCondition.id, { logicalOp: e.target.value as LogicalOperator })}
                        className="col-span-2 text-sm"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </Select>
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
                        
                        // Check if this field has a different object path than the previous condition
                        const prevCondition = idx > 0 ? formData.conditions[idx - 1] : null
                        const hasDifferentObjectPath = prevCondition && prevCondition.field && !hasSameObjectPath(value, prevCondition.field)
                        
                        // If different object path, remove logicalOp (start new group)
                        const updates: Partial<Condition> = { field: value, operator: defaultOperator }
                        if (hasDifferentObjectPath) {
                          updates.logicalOp = undefined
                        }
                        
                        updateCondition(condition.id, updates)
                      }}
                      options={metadata.inputFields}
                      placeholder="Select field..."
                      className={idx > 0 && showLogicalOp ? 'col-span-4' : 'col-span-6'}
                    />

                    <Select
                      value={condition.operator && operators.some(op => op.operator === condition.operator) 
                        ? condition.operator 
                        : (operators.length > 0 ? operators[0].operator : '')}
                      onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                      className="col-span-3 text-sm"
                      disabled={!condition.field || operators.length === 0}
                      title={operators.find(op => op.operator === condition.operator)?.description}
                    >
                      {operators.map(op => (
                        <option key={op.operator} value={op.operator} title={op.description}>
                          {op.label}
                        </option>
                      ))}
                    </Select>

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
                      className="p-2 text-error hover:bg-error-bg rounded-md focus-ring transition-colors cursor-pointer"
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
          <p className="text-sm text-text-secondary mb-4">
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
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {field.label} {isRequired && <span className="text-error">*</span>}
                      </label>
                      <Select
                        value={fieldValue}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          output: { ...prev.output, [field.name]: e.target.value }
                        }))}
                        className="w-full text-sm"
                        required={isRequired}
                      >
                        <option value="">-- Select {field.label} --</option>
                        <option value="FLAG">FLAG</option>
                        <option value="APPROVE">APPROVE</option>
                        <option value="REJECT">REJECT</option>
                        <option value="REVIEW">REVIEW</option>
                        <option value="HOLD">HOLD</option>
                      </Select>
                      {field.description && (
                        <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                      )}
                    </div>
                  )
                }

                // Textarea for text fields or specific fields
                if (isTextarea) {
                  return (
                    <div key={field.name} className={field.name === 'result' || field.name === 'description' ? 'md:col-span-2' : ''}>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {field.label} {isRequired && <span className="text-error">*</span>}
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
                        <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                      )}
                    </div>
                  )
                }

                // Number input for decimal/number/integer
                if (isNumber) {
                  return (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {field.label} {isRequired && <span className="text-error">*</span>}
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
                        <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                      )}
                    </div>
                  )
                }

                // Default text input
                return (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {field.label} {isRequired && <span className="text-error">*</span>}
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
                      <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">Loading output fields...</p>
          )}
        </section>

        {/* Version Notes */}
        <div className="bg-primary-bg border border-primary/30 rounded-md p-4">
          <label className="block text-sm font-medium text-primary mb-2">
            Version Notes (Optional)
          </label>
          <textarea
            value={formData.versionNotes}
            onChange={(e) => setFormData(prev => ({ ...prev, versionNotes: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-primary/30 rounded-md focus-ring bg-surface"
            rows={2}
            placeholder="Describe what changed in this version (e.g., Updated threshold values, Fixed condition logic)"
          />
          <p className="text-xs text-primary/80 mt-2">
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
            className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh focus-ring transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

