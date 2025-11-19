"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Sparkles, Loader2, CheckCircle2, AlertCircle, ChevronRight, Save, Eye } from 'lucide-react'
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
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            📝 Example Prompts for {selectedFactType}:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedFactType === 'Declaration' ? (
              <>
                <button
                  onClick={() => setNaturalInput('If total gross mass is greater than 1000kg then require inspection')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If total gross mass is greater than 1000kg then require inspection
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Weight validation rule</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If invoice amount is greater than 100000 USD and country of export is China, then flag as HIGH_RISK with score 90')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If invoice amount is greater than 100000 USD and country of export is China, then flag as HIGH_RISK
                  </p>
                  <p className="text-xs text-slate-500 mt-1">High-value from China</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If HS code is 610910 then score is 80 and action is REVIEW')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If HS code is 610910 then score is 80 and action is REVIEW
                  </p>
                  <p className="text-xs text-slate-500 mt-1">HS code specific rule</p>
                </button>
                
                <button
                  onClick={() => setNaturalInput('If transport mode is Air and package quantity is greater than 100, then REVIEW with score 70 and flag SUSPICIOUS_QUANTITY')}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-sm text-slate-700 group-hover:text-indigo-700">
                    If transport mode is Air and package quantity &gt; 100, flag as SUSPICIOUS_QUANTITY
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Air transport validation</p>
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

