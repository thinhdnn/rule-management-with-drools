"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Sparkles, Loader2, CheckCircle2, AlertCircle, ChevronRight, Save, Eye, Zap, X } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { api, fetchApi } from '@/lib/api'

type AIGenerateRequest = {
  naturalLanguageInput: string
  factType: string
  additionalContext?: string
  previewOnly: boolean
}

type Condition = {
  field: string
  operator: string
  value: string
}

type Output = {
  action?: string
  result?: string
  score?: number
  flag?: string
  description?: string
}

type GeneratedRule = {
  ruleName: string
  description?: string
  factType: string
  priority?: number
  enabled?: boolean
  conditions: Condition[]
  output: Output
}

type ValidationStatus = {
  valid: boolean
  errors: string[]
  warnings: string[]
  autoCorrected: string[]
}

type AIGenerateResponse = {
  success: boolean
  generatedRule: GeneratedRule | null
  aiExplanation: string | null
  validation: ValidationStatus | null
  savedRuleId?: number
  errorMessage?: string
  suggestions?: string[]
}

export default function AIBuilderPage() {
  const router = useRouter()
  const [factTypes, setFactTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  
  // Form state
  const [selectedFactType, setSelectedFactType] = useState('Declaration')
  const [naturalInput, setNaturalInput] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  
  // Result state
  const [response, setResponse] = useState<AIGenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Batch generation state
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchResults, setBatchResults] = useState<Array<{
    prompt: string
    result: AIGenerateResponse | null
    error?: string
  }>>([])
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, phase: 'generating' as 'generating' | 'saving' })

  // Load fact types
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

  // Generate rule from natural language
  const handleGenerate = async () => {
    if (!naturalInput.trim()) {
      setError('Please enter a rule description')
      return
    }

    setError(null)
    setResponse(null)
    setGenerating(true)

    try {
      const request: AIGenerateRequest = {
        naturalLanguageInput: naturalInput,
        factType: selectedFactType,
        additionalContext: additionalContext || undefined,
        previewOnly: true, // Always preview first
      }

      const result = await fetchApi<AIGenerateResponse>(
        api.rules.aiGenerate(),
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      )

      setResponse(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate rule')
    } finally {
      setGenerating(false)
    }
  }

  // Example prompts for Declaration
  const declarationExamplePrompts = [
    {
      prompt: 'If totalGrossMassMeasure is greater than 5000kg then set score to 75 and flag as HIGH_WEIGHT',
      description: 'Total gross mass validation'
    },
    {
      prompt: 'If invoiceAmount is greater than 150000 USD and countryOfExportId equals CN, then set score to 90 and flag as HIGH_RISK',
      description: 'High-value import from China'
    },
    {
      prompt: 'If any goods item has hsId equals 610910 then set score to 80 and action is REVIEW',
      description: 'HS code specific validation'
    },
    {
      prompt: 'If transportMeansModeCode equals 1 and packageQuantity is greater than 100, then set score to 70 and flag as SUSPICIOUS_QUANTITY',
      description: 'Sea transport package validation'
    },
    {
      prompt: 'If any goods item has originCountryId equals CN and dutyRate is greater than 15, then set score to 85 and action is REVIEW',
      description: 'High duty rate from China'
    },
    {
      prompt: 'If incotermCode equals CIF and totalInsuranceAmount is less than 1000, then set score to 65 and flag as INSUFFICIENT_INSURANCE',
      description: 'CIF insurance validation'
    },
    {
      prompt: 'If packageQuantity is greater than 50 and totalGrossMassMeasure is less than 500, then set score to 80 and flag as WEIGHT_MISMATCH',
      description: 'Package weight validation'
    },
    {
      prompt: 'If consignorCountryId equals CN and consigneeCountryId equals VN and countryOfExportId not equals CN, then set score to 90 and flag as COUNTRY_MISMATCH',
      description: 'Country of export mismatch'
    },
    {
      prompt: 'If officeId equals VNHPH and invoiceAmount is greater than 200000, then set score to 75 and action is REVIEW',
      description: 'Office-specific high-value check'
    },
    {
      prompt: 'If invoiceCurrencyCode not equals USD and invoiceAmount is greater than 100000, then set score to 70 and flag as NON_STANDARD_CURRENCY',
      description: 'Currency validation'
    },
    {
      prompt: 'If any goods item has quantityQuantity is greater than 1000 and unitPriceAmount is less than 5, then set score to 85 and flag as SUSPICIOUS_PRICE',
      description: 'Low unit price validation'
    },
    {
      prompt: 'If totalFreightAmount is greater than 10000 and totalInsuranceAmount is greater than 2000, then set score to 80 and flag as HIGH_FREIGHT_COST',
      description: 'High freight and insurance cost check'
    }
  ]

  // Get example prompts for current fact type
  const getExamplePrompts = () => {
    if (selectedFactType === 'Declaration') {
      return declarationExamplePrompts
    }
    return []
  }

  // Generate all example prompts
  const handleGenerateAll = async () => {
    const prompts = getExamplePrompts()
    if (prompts.length === 0) return

    setBatchGenerating(true)
    setBatchSaving(false)
    setBatchResults([])
    setBatchProgress({ current: 0, total: prompts.length, phase: 'generating' })
    setError(null)

    const results: Array<{
      prompt: string
      result: AIGenerateResponse | null
      error?: string
    }> = []

    for (let i = 0; i < prompts.length; i++) {
      const { prompt, description } = prompts[i]
      setBatchProgress({ current: i + 1, total: prompts.length, phase: 'generating' })

      try {
        console.log(`[${i + 1}/${prompts.length}] Generating rule for: ${description}`)
        
        const request: AIGenerateRequest = {
          naturalLanguageInput: prompt,
          factType: selectedFactType,
          additionalContext: additionalContext || undefined,
          previewOnly: true,
        }

        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
        })

        const fetchPromise = fetchApi<AIGenerateResponse>(
          api.rules.aiGenerate(),
          {
            method: 'POST',
            body: JSON.stringify(request),
          }
        )

        const result = await Promise.race([fetchPromise, timeoutPromise])

        console.log(`[${i + 1}/${prompts.length}] Result:`, {
          success: result.success,
          valid: result.validation?.valid,
          hasRule: !!result.generatedRule,
          error: result.errorMessage,
          validationErrors: result.validation?.errors?.length || 0
        })

        results.push({ prompt, result })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to generate rule'
        console.error(`[${i + 1}/${prompts.length}] Error generating rule:`, errorMessage, err)
        
        // Even if there's an error, we still add it to results so user can see what failed
        results.push({
          prompt,
          result: null,
          error: errorMessage
        })
      }

      // Small delay to avoid overwhelming the API
      if (i < prompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log('Batch generation completed:', {
      total: results.length,
      successful: results.filter(r => r.result?.success && r.result?.validation?.valid).length,
      failed: results.filter(r => r.error || (r.result && !(r.result.success && r.result.validation?.valid))).length,
      withErrors: results.filter(r => r.error).length
    })

    setBatchResults(results)
    
    // Automatically save all valid rules
    const validResults = results.filter(
      r => r.result?.success && r.result?.validation?.valid && r.result?.generatedRule
    )
    
    if (validResults.length > 0) {
      console.log(`Auto-saving ${validResults.length} valid rules...`)
      setBatchSaving(true)
      setBatchProgress({ current: 0, total: validResults.length, phase: 'saving' })
      setError(null)
      
      let savedCount = 0
      let failedCount = 0
      const savedRuleIds: number[] = []
      
      for (let i = 0; i < validResults.length; i++) {
        const item = validResults[i]
        if (!item.result?.generatedRule) {
          console.warn(`Skipping item ${i + 1}: no generatedRule`)
          continue
        }
        
        setBatchProgress({ current: i + 1, total: validResults.length, phase: 'saving' })
        
        try {
          const ruleToSave = item.result.generatedRule
          console.log(`[${i + 1}/${validResults.length}] Saving rule: ${ruleToSave.ruleName}`)
          
          const savedRule = await fetchApi<any>(
            api.rules.create(),
            {
              method: 'POST',
              body: JSON.stringify({
                ruleName: ruleToSave.ruleName,
                label: ruleToSave.description || ruleToSave.ruleName,
                description: ruleToSave.description || ruleToSave.ruleName,
                factType: ruleToSave.factType,
                priority: ruleToSave.priority || 0,
                active: ruleToSave.enabled !== false,
                conditions: ruleToSave.conditions || [],
                output: ruleToSave.output || {},
                generatedByAi: true,
              }),
            }
          )
          
          if (savedRule?.id) {
            savedCount++
            savedRuleIds.push(savedRule.id)
            console.log(`[${i + 1}/${validResults.length}] Successfully saved rule ID: ${savedRule.id}`)
          } else {
            failedCount++
            console.warn(`[${i + 1}/${validResults.length}] Failed to save: no ID returned`, savedRule)
          }
        } catch (err) {
          failedCount++
          console.error(`[${i + 1}/${validResults.length}] Error saving rule:`, err)
        }
        
        // Small delay between saves
        if (i < validResults.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      
      console.log(`Auto-save completed: ${savedCount} saved, ${failedCount} failed`)
      
      if (savedCount > 0) {
        // Show success message
        setError(null)
        // Show success notification
        const successMessage = `Successfully saved ${savedCount} rule(s)${failedCount > 0 ? `. ${failedCount} failed.` : '!'}`
        alert(successMessage)
        // Navigate to rules page after a short delay
        setTimeout(() => {
          router.push('/rules')
        }, 500)
      } else if (failedCount > 0) {
        setError(`Failed to save rules. ${failedCount} error(s).`)
      }
    } else {
      setError('No valid rules to save. Please check the generation results.')
    }
    
    setBatchGenerating(false)
    setBatchSaving(false)
  }

  // Save generated rule
  const handleSave = async () => {
    if (!response?.generatedRule) return

    setLoading(true)
    setError(null)

    try {
      // Save the already-generated rule directly using the create rule API
      // This avoids calling OpenAI API again unnecessarily
      const ruleToSave = response.generatedRule
      
      const savedRule = await fetchApi<any>(
        api.rules.create(),
        {
          method: 'POST',
          body: JSON.stringify({
            ruleName: ruleToSave.ruleName,
            label: ruleToSave.description || ruleToSave.ruleName,
            description: ruleToSave.description || ruleToSave.ruleName,
            factType: ruleToSave.factType,
            priority: ruleToSave.priority || 0,
            active: ruleToSave.enabled !== false,
            conditions: ruleToSave.conditions || [],
            output: ruleToSave.output || {},
            generatedByAi: true, // Mark as AI-generated rule
          }),
        }
      )

      if (savedRule?.id) {
        // Navigate to rule detail page
        router.push(`/rules/${savedRule.id}`)
      } else {
        setError('Failed to save rule: No rule ID returned')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
          <Brain className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Rule Builder</h1>
          <p className="text-sm text-slate-600">Generate rules from natural language descriptions using AI</p>
        </div>
      </div>

      {/* Input Form */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="p-6 space-y-6">
          {/* Fact Type Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Fact Type
            </label>
            <SearchableSelect
              options={factTypes.map(ft => ({ name: ft, label: ft }))}
              value={selectedFactType}
              onChange={(value) => setSelectedFactType(value)}
              placeholder="Select fact type"
            />
            <p className="text-xs text-slate-500 mt-1">
              Data type that the rule will apply to
            </p>
          </div>

          {/* Natural Language Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Rule Description (English or Vietnamese)
            </label>
            <textarea
              value={naturalInput}
              onChange={(e) => setNaturalInput(e.target.value)}
              placeholder="Example: If total gross mass is greater than 1000kg then require inspection&#10;&#10;Or: Nếu tổng trọng lượng hàng hóa lớn hơn 1000kg thì cần kiểm tra"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={6}
            />
            <p className="text-xs text-slate-500 mt-1">
              Describe the rule in natural language. AI will convert it to a structured rule.
            </p>
          </div>

          {/* Additional Context (Optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Additional Context (Optional)
            </label>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Add context or special requirements for AI..."
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || !naturalInput.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {generating ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  <span>Generate Rule</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Generated Rule Preview */}
      {response && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="p-6 space-y-6">
            {/* Success/Error Header */}
            <div className="flex items-start gap-3">
              {response.success && response.validation?.valid ? (
                <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={24} />
              ) : (
                <AlertCircle className="text-orange-600 shrink-0 mt-0.5" size={24} />
              )}
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  {response.success && response.validation?.valid
                    ? 'Rule Generated Successfully'
                    : response.errorMessage
                    ? 'AI Generation Failed'
                    : 'Rule Has Validation Errors'}
                </h2>
                {response.aiExplanation && (
                  <p className="text-sm text-slate-600 mt-1">{response.aiExplanation}</p>
                )}
                {response.errorMessage && (
                  <p className="text-sm text-red-600 mt-1">{response.errorMessage}</p>
                )}
              </div>
            </div>

            {/* Error Message and Suggestions */}
            {response.errorMessage && (
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-900 mb-2">Error:</p>
                  <p className="text-sm text-red-700">{response.errorMessage}</p>
                </div>
                
                {response.suggestions && response.suggestions.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900 mb-2">Suggestions:</p>
                    <ul className="space-y-1">
                      {response.suggestions.map((sug, idx) => (
                        <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                          <ChevronRight size={16} className="shrink-0 mt-0.5" />
                          <span>{sug}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Validation Status */}
            {response.validation && (!response.validation.valid || response.validation.warnings.length > 0) && (
              <div className="space-y-3">
                {/* Errors */}
                {response.validation.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-900 mb-2">Validation Errors:</p>
                    <ul className="space-y-1">
                      {response.validation.errors.map((err, idx) => (
                        <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                          <ChevronRight size={16} className="shrink-0 mt-0.5" />
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {response.validation.warnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-yellow-900 mb-2">Warnings:</p>
                    <ul className="space-y-1">
                      {response.validation.warnings.map((warn, idx) => (
                        <li key={idx} className="text-sm text-yellow-700 flex items-start gap-2">
                          <ChevronRight size={16} className="shrink-0 mt-0.5" />
                          <span>{warn}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </div>
            )}

            {/* Generated Rule Details */}
            {response.generatedRule && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Rule Name */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Rule Name
                    </label>
                    <p className="text-sm text-slate-900 mt-1">{response.generatedRule.ruleName}</p>
                  </div>

                  {/* Fact Type */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Fact Type
                    </label>
                    <p className="text-sm text-slate-900 mt-1">{response.generatedRule.factType}</p>
                  </div>

                  {/* Description */}
                  {response.generatedRule.description && (
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Description
                      </label>
                      <p className="text-sm text-slate-900 mt-1">{response.generatedRule.description}</p>
                    </div>
                  )}
                </div>

                {/* Conditions */}
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
                    Conditions (WHEN)
                  </label>
                  <div className="space-y-2">
                    {response.generatedRule.conditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-xs font-medium text-slate-500">#{idx + 1}</span>
                        <code className="text-sm text-indigo-600 font-mono">
                          {cond.field}
                        </code>
                        <span className="text-sm font-medium text-slate-700">{cond.operator}</span>
                        <code className="text-sm text-green-600 font-mono">
                          {cond.value}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Output Section */}
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
                    Output (THEN)
                  </label>
                  {response.generatedRule.output && Object.keys(response.generatedRule.output).length > 0 ? (
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(response.generatedRule.output).map(([key, value]) => (
                          value !== null && value !== undefined && value !== '' && (
                            <div key={key}>
                              <dt className="text-xs font-medium text-slate-500">{key}</dt>
                              <dd className="text-sm text-slate-900 mt-0.5">{String(value)}</dd>
                            </div>
                          )
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">
                        ⚠️ No output actions specified. Please specify what should happen when conditions are met 
                        (e.g., "then set risk score to 90" or "then require inspection").
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {response.success && response.validation?.valid && response.generatedRule && (
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      <span>Save Rule</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setResponse(null)
                    setNaturalInput('')
                    setAdditionalContext('')
                  }}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Create New Rule
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Example Prompts - Dynamic based on Fact Type */}
      {!response && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              📝 Example Prompts for {selectedFactType}:
            </h3>
            {getExamplePrompts().length > 0 && (
              <button
                onClick={handleGenerateAll}
                disabled={batchGenerating || batchSaving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {batchGenerating || batchSaving ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>
                      {batchProgress.phase === 'generating' 
                        ? `Generating... (${batchProgress.current}/${batchProgress.total})`
                        : `Saving... (${batchProgress.current}/${batchProgress.total})`
                      }
                    </span>
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>Generate & Save All ({getExamplePrompts().length})</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedFactType === 'Declaration' ? (
              <>
                <button
                  onClick={() => setNaturalInput('If totalGrossMassMeasure is greater than 5000kg then set score to 75 and flag as HIGH_WEIGHT')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If totalGrossMassMeasure is greater than 5000kg then set score to 75 and flag as HIGH_WEIGHT
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Total gross mass validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If invoiceAmount is greater than 150000 USD and countryOfExportId equals CN, then set score to 90 and flag as HIGH_RISK')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If invoiceAmount &gt; 150000 USD and countryOfExportId equals CN, then score 90 and flag HIGH_RISK
                  </p>
                  <p className="text-xs text-slate-500 mt-1">High-value import from China</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If any goods item has hsId equals 610910 then set score to 80 and action is REVIEW')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If any goods item has hsId equals 610910 then set score to 80 and action is REVIEW
                  </p>
                  <p className="text-xs text-slate-500 mt-1">HS code specific validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If transportMeansModeCode equals 1 and packageQuantity is greater than 100, then set score to 70 and flag as SUSPICIOUS_QUANTITY')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If transportMeansModeCode equals 1 and packageQuantity &gt; 100, then score 70 and flag SUSPICIOUS_QUANTITY
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Sea transport package validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If any goods item has originCountryId equals CN and dutyRate is greater than 15, then set score to 85 and action is REVIEW')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If any goods item has originCountryId equals CN and dutyRate &gt; 15, then score 85 and REVIEW
                  </p>
                  <p className="text-xs text-slate-500 mt-1">High duty rate from China</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If incotermCode equals CIF and totalInsuranceAmount is less than 1000, then set score to 65 and flag as INSUFFICIENT_INSURANCE')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If incotermCode equals CIF and totalInsuranceAmount &lt; 1000, then score 65 and flag INSUFFICIENT_INSURANCE
                  </p>
                  <p className="text-xs text-slate-500 mt-1">CIF insurance validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If packageQuantity is greater than 50 and totalGrossMassMeasure is less than 500, then set score to 80 and flag as WEIGHT_MISMATCH')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If packageQuantity &gt; 50 and totalGrossMassMeasure &lt; 500, then score 80 and flag WEIGHT_MISMATCH
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Package weight validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If consignorCountryId equals CN and consigneeCountryId equals VN and countryOfExportId not equals CN, then set score to 90 and flag as COUNTRY_MISMATCH')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If consignorCountryId equals CN and consigneeCountryId equals VN and countryOfExportId not equals CN, then score 90
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Country of export mismatch</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If officeId equals VNHPH and invoiceAmount is greater than 200000, then set score to 75 and action is REVIEW')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If officeId equals VNHPH and invoiceAmount &gt; 200000, then score 75 and action REVIEW
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Office-specific high-value check</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If invoiceCurrencyCode not equals USD and invoiceAmount is greater than 100000, then set score to 70 and flag as NON_STANDARD_CURRENCY')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If invoiceCurrencyCode not equals USD and invoiceAmount &gt; 100000, then score 70 and flag NON_STANDARD_CURRENCY
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Currency validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If any goods item has quantityQuantity is greater than 1000 and unitPriceAmount is less than 5, then set score to 85 and flag as SUSPICIOUS_PRICE')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If any goods item has quantityQuantity &gt; 1000 and unitPriceAmount &lt; 5, then score 85 and flag SUSPICIOUS_PRICE
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Low unit price validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If totalFreightAmount is greater than 10000 and totalInsuranceAmount is greater than 2000, then set score to 80 and flag as HIGH_FREIGHT_COST')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If totalFreightAmount &gt; 10000 and totalInsuranceAmount &gt; 2000, then score 80 and flag HIGH_FREIGHT_COST
                  </p>
                  <p className="text-xs text-slate-500 mt-1">High freight and insurance cost check</p>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setNaturalInput('If container total weight exceeds 30000kg then flag as OVERWEIGHT with score 85')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-purple-700">
                    If container total weight exceeds 30000kg then flag as OVERWEIGHT with score 85
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Container weight check</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If number of packages in container is greater than 500 then REVIEW with score 75')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-purple-700">
                    If number of packages in container is greater than 500 then REVIEW with score 75
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Package count validation</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If transport equipment seal ID contains "DAMAGED" then reject with score 100')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-purple-700">
                    If transport equipment seal ID contains "DAMAGED" then reject with score 100
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Seal integrity check</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If consignment total cargo gross weight is over 25000kg and origin country is high-risk, then flag as SUSPICIOUS_CARGO')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-purple-700">
                    If consignment cargo weight &gt; 25000kg and origin is high-risk, flag as SUSPICIOUS_CARGO
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Combined risk assessment</p>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Batch Generation Results */}
      {batchResults.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                📊 Batch Generation Results
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Total: {batchResults.length} | 
                Successful: <span className="text-green-600 font-medium">
                  {batchResults.filter(r => r.result?.success && r.result?.validation?.valid).length}
                </span> | 
                Failed: <span className="text-red-600 font-medium">
                  {batchResults.filter(r => r.error || (r.result && !(r.result.success && r.result.validation?.valid))).length}
                </span>
              </p>
            </div>
            <button
              onClick={() => {
                setBatchResults([])
                setBatchProgress({ current: 0, total: 0, phase: 'generating' })
              }}
              className="text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {batchResults.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No results yet</p>
            ) : (
              batchResults.map((item, idx) => {
                const success = item.result?.success && item.result?.validation?.valid
                const failed = item.error || (item.result && !success)
              
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    success
                      ? 'bg-green-50 border-green-200'
                      : failed
                      ? 'bg-red-50 border-red-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {success ? (
                      <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
                    ) : failed ? (
                      <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
                    ) : (
                      <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-500 mb-1">
                        #{idx + 1} - {getExamplePrompts()[idx]?.description || 'Unknown'}
                      </p>
                      <p className="text-sm text-slate-700 mb-2 line-clamp-2">
                        {item.prompt}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-700 mt-1">Error: {item.error}</p>
                      )}
                      {item.result && !item.error && (
                        <div className="mt-2 space-y-1">
                          {item.result.generatedRule && (
                            <p className="text-xs text-slate-600">
                              <span className="font-medium">Rule:</span> {item.result.generatedRule.ruleName}
                            </p>
                          )}
                          {item.result.validation && (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                item.result.validation.valid
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {item.result.validation.valid ? 'Valid' : 'Invalid'}
                              </span>
                              {item.result.validation.errors.length > 0 && (
                                <span className="text-xs text-red-600">
                                  {item.result.validation.errors.length} error(s)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {item.result?.generatedRule && (
                      <button
                        onClick={() => {
                          setNaturalInput(item.prompt)
                          setResponse(item.result)
                        }}
                        className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors shrink-0"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              )
            }))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-slate-600">
                  <span className="font-medium text-green-600">
                    {batchResults.filter(r => r.result?.success && r.result?.validation?.valid).length}
                  </span> successful
                </span>
                <span className="text-slate-600">
                  <span className="font-medium text-red-600">
                    {batchResults.filter(r => r.error || (r.result && !(r.result.success && r.result.validation?.valid))).length}
                  </span> failed
                </span>
              </div>
              {batchSaving && (
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg">
                  <Loader2 className="animate-spin" size={16} />
                  <span>Saving valid rules... ({batchProgress.current}/{batchProgress.total})</span>
                </div>
              )}
              {!batchSaving && !batchGenerating && batchResults.filter(r => r.result?.success && r.result?.validation?.valid).length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 text-sm rounded-lg">
                  <CheckCircle2 size={16} />
                  <span>Valid rules have been saved automatically</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-indigo-900 mb-3">💡 Tips for Creating Effective Rules:</h3>
        <ul className="space-y-2 text-sm text-indigo-800">
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5" />
            <span>Clearly describe the conditions and desired outcomes</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5" />
            <span>Use exact field names from metadata (see <code className="text-xs bg-indigo-100 px-1 py-0.5 rounded">GET /api/v1/rules/metadata</code>)</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5" />
            <span>Can write in English or Vietnamese</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5" />
            <span>AI will automatically validate and suggest if there are errors</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5" />
            <span>Click on example prompts above to quickly test</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

