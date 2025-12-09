"use client"
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Sparkles, Loader2, CheckCircle2, AlertCircle, ChevronRight, Save, Eye, Zap, X } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { api, fetchApi } from '@/lib/api'
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts'
import { useToast } from '@/components/Toast'

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
  logicalOp?: 'AND' | 'OR'
}

type ConditionsGroup = {
  AND?: Array<Condition | { AND?: Condition[] } | { OR?: Condition[] }>
  OR?: Array<Condition | { AND?: Condition[] } | { OR?: Condition[] }>
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
  conditions: Condition[] | ConditionsGroup | null
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
  const toast = useToast()
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
    saveError?: string
    savedRuleId?: number
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

  // Helper functions to generate random values
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
  const randomFloat = (min: number, max: number, decimals: number = 0) => {
    const value = Math.random() * (max - min) + min
    return decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.floor(value)
  }

  // Generate example prompts for Declaration with random values
  const generateDeclarationExamplePrompts = () => {
    const weight = randomInt(100, 10000)
    const invoiceAmount1 = randomInt(50000, 300000)
    const invoiceAmount2 = randomInt(50000, 300000)
    const invoiceAmount3 = randomInt(50000, 300000)
    const hsCode = randomInt(100000, 999999)
    const packageQty1 = randomInt(10, 500)
    const packageQty2 = randomInt(10, 200)
    const dutyRate = randomFloat(5, 30, 1)
    const insuranceAmount1 = randomInt(500, 5000)
    const insuranceAmount2 = randomInt(1000, 10000)
    const weight2 = randomInt(100, 2000)
    const freightAmount = randomInt(5000, 50000)
    const quantity = randomInt(100, 5000)
    const unitPrice = randomFloat(1, 20, 2)
    const score1 = randomInt(65, 95)
    const score2 = randomInt(70, 95)
    const score3 = randomInt(70, 90)
    const score4 = randomInt(65, 85)
    const score5 = randomInt(75, 95)
    const score6 = randomInt(60, 80)
    const score7 = randomInt(70, 90)
    const score8 = randomInt(85, 95)
    const score9 = randomInt(70, 85)
    const score10 = randomInt(65, 80)
    const score11 = randomInt(80, 95)
    const score12 = randomInt(75, 90)

    return [
      {
        prompt: `If totalGrossMassMeasure is greater than ${weight}kg then set score to ${score1} and flag as HIGH_WEIGHT`,
        description: 'Total gross mass validation'
      },
      {
        prompt: `If invoiceAmount is greater than ${invoiceAmount1} USD and countryOfExportId equals CN, then set score to ${score2} and flag as HIGH_RISK`,
        description: 'High-value import from China'
      },
      {
        prompt: `If any goods item has hsId equals ${hsCode} then set score to ${score3} and action is REVIEW`,
        description: 'HS code specific validation'
      },
      {
        prompt: `If transportMeansModeCode equals 1 and packageQuantity is greater than ${packageQty1}, then set score to ${score4} and flag as SUSPICIOUS_QUANTITY`,
        description: 'Sea transport package validation'
      },
      {
        prompt: `If any goods item has originCountryId equals CN and dutyRate is greater than ${dutyRate}, then set score to ${score5} and action is REVIEW`,
        description: 'High duty rate from China'
      },
      {
        prompt: `If incotermCode equals CIF and totalInsuranceAmount is less than ${insuranceAmount1}, then set score to ${score6} and flag as INSUFFICIENT_INSURANCE`,
        description: 'CIF insurance validation'
      },
      {
        prompt: `If packageQuantity is greater than ${packageQty2} and totalGrossMassMeasure is less than ${weight2}, then set score to ${score7} and flag as WEIGHT_MISMATCH`,
        description: 'Package weight validation'
      },
      {
        prompt: 'If consignorCountryId equals CN and consigneeCountryId equals VN and countryOfExportId not equals CN, then set score to 90 and flag as COUNTRY_MISMATCH',
        description: 'Country of export mismatch'
      },
      {
        prompt: `If officeId equals VNHPH and invoiceAmount is greater than ${invoiceAmount2}, then set score to ${score9} and action is REVIEW`,
        description: 'Office-specific high-value check'
      },
      {
        prompt: `If invoiceCurrencyCode not equals USD and invoiceAmount is greater than ${invoiceAmount3}, then set score to ${score10} and flag as NON_STANDARD_CURRENCY`,
        description: 'Currency validation'
      },
      {
        prompt: `If any goods item has quantityQuantity is greater than ${quantity} and unitPriceAmount is less than ${unitPrice}, then set score to ${score11} and flag as SUSPICIOUS_PRICE`,
        description: 'Low unit price validation'
      },
      {
        prompt: `If totalFreightAmount is greater than ${freightAmount}, totalInsuranceAmount is greater than ${insuranceAmount2} and goods item has hsId equals ${hsCode}, then set score to ${score12} and flag as HIGH_FREIGHT_COST`,
        description: 'High freight and insurance cost check'
      }
    ]
  }

  // Generate example prompts for CargoReport with random values
  const generateCargoReportExamplePrompts = () => {
    const containerWeight = randomInt(10000, 50000)
    const packageCount = randomInt(100, 1000)
    const cargoWeight = randomInt(15000, 40000)
    const score1 = randomInt(80, 95)
    const score2 = randomInt(70, 85)

    return [
      {
        prompt: `If container total weight exceeds ${containerWeight}kg then flag as OVERWEIGHT with score ${score1}`,
        description: 'Container weight check'
      },
      {
        prompt: `If number of packages in container is greater than ${packageCount} then REVIEW with score ${score2}`,
        description: 'Package count validation'
      },
      {
        prompt: 'If transport equipment seal ID contains "DAMAGED" then reject with score 100',
        description: 'Seal integrity check'
      },
      {
        prompt: `If consignment total cargo gross weight is over ${cargoWeight}kg and origin country is high-risk, then flag as SUSPICIOUS_CARGO`,
        description: 'Combined risk assessment'
      }
    ]
  }

  // Generate example prompts for Traveler with random values
  const generateTravelerExamplePrompts = () => {
    const baggageWeight = randomFloat(20, 50, 1)
    const age = randomInt(18, 65)
    const score1 = randomInt(75, 95)
    const score2 = randomInt(70, 90)
    const score3 = randomInt(80, 95)
    const score4 = randomInt(65, 85)
    const score5 = randomInt(70, 90)

    return [
      {
        prompt: `If baggageWeightMeasure is greater than ${baggageWeight}kg then set score to ${score1} and flag as EXCESS_BAGGAGE`,
        description: 'Baggage weight validation'
      },
      {
        prompt: `If inadmissibleIndicatorCode equals Y then set score to ${score2} and action is REJECT`,
        description: 'Inadmissible passenger check'
      },
      {
        prompt: `If transitIndicatorCode equals Y and nationalityCountryID not equals VN then set score to ${score3} and flag as TRANSIT_RISK`,
        description: 'Transit passenger validation'
      },
      {
        prompt: `If travelDocumentExpiryDate is less than 6 months from today then set score to ${score4} and action is REVIEW`,
        description: 'Passport expiry validation'
      },
      {
        prompt: `If visaExpiryDate is less than 30 days from today then set score to ${score5} and flag as VISA_EXPIRING`,
        description: 'Visa expiry check'
      },
      {
        prompt: 'If deporteeIndicatorCode equals Y then set score to 100 and action is REJECT',
        description: 'Deportee check'
      },
      {
        prompt: `If unaccompaniedMinorIndicatorCode equals Y and age is less than ${age} then set score to 85 and action is REVIEW`,
        description: 'Unaccompanied minor validation'
      },
      {
        prompt: 'If nationalityCountryID equals high-risk country and transitIndicatorCode equals Y then set score to 90 and flag as HIGH_RISK_TRANSIT',
        description: 'High-risk transit passenger'
      }
    ]
  }

  // Get example prompts for current fact type (with random values)
  // Use useMemo to ensure prompts are consistent during render but regenerate when fact type changes
  const examplePrompts = useMemo(() => {
    if (selectedFactType === 'Declaration') {
      return generateDeclarationExamplePrompts()
    }
    if (selectedFactType === 'CargoReport') {
      return generateCargoReportExamplePrompts()
    }
    if (selectedFactType === 'Traveler') {
      return generateTravelerExamplePrompts()
    }
    return []
  }, [selectedFactType])

  // Generate all example prompts
  const handleGenerateAll = async () => {
    const prompts = examplePrompts
    if (prompts.length === 0) return

    setBatchGenerating(true)
    setBatchSaving(false)
    setBatchResults([])
    setBatchProgress({ current: 0, total: prompts.length, phase: 'generating' })
    setError(null)

    let results: Array<{
      prompt: string
      result: AIGenerateResponse | null
      error?: string
      saveError?: string
      savedRuleId?: number
    }> = []

    try {
      console.log(`Generating ${prompts.length} rules using batch API...`)
      
      // Prepare batch request
      const batchRequest = {
        requests: prompts.map(({ prompt }) => ({
          naturalLanguageInput: prompt,
          factType: selectedFactType,
          additionalContext: additionalContext || undefined,
          previewOnly: true,
        })),
        factType: selectedFactType,
        additionalContext: additionalContext || undefined,
      }

      // Add timeout to prevent hanging requests (longer for batch)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 120 seconds')), 120000)
      })

      const fetchPromise = fetchApi<{
        success: boolean
        total: number
        successful: number
        failed: number
        results: AIGenerateResponse[]
      }>(
        api.rules.aiGenerateBatch(),
        {
          method: 'POST',
          body: JSON.stringify(batchRequest),
        }
      )

      const batchResponse = await Promise.race([fetchPromise, timeoutPromise])

      console.log('Batch generation response:', {
        total: batchResponse.total,
        successful: batchResponse.successful,
        failed: batchResponse.failed,
      })

      // Map results back to prompts
      results = prompts.map(({ prompt }, index) => {
        const response = batchResponse.results[index]
        if (!response) {
          return {
            prompt,
            result: null,
            error: 'No response received for this rule'
          }
        }
        
        if (response.errorMessage) {
          return {
            prompt,
            result: response,
            error: response.errorMessage
          }
        }
        
        return {
          prompt,
          result: response,
        }
      })

      console.log('Batch generation completed:', {
        total: results.length,
        successful: results.filter((r: { result: AIGenerateResponse | null; error?: string }) => r.result?.success && r.result?.validation?.valid).length,
        failed: results.filter((r: { result: AIGenerateResponse | null; error?: string }) => r.error || (r.result && !(r.result.success && r.result.validation?.valid))).length,
        withErrors: results.filter((r: { result: AIGenerateResponse | null; error?: string }) => r.error).length
      })

      setBatchResults(results)
      setBatchProgress({ current: prompts.length, total: prompts.length, phase: 'generating' })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate rules'
      console.error('Error in batch generation:', errorMessage, err)
      setError(`Failed to generate rules: ${errorMessage}`)
      
      // Mark all as failed
      results = prompts.map(({ prompt }) => ({
        prompt,
        result: null,
        error: errorMessage
      }))
      setBatchResults(results)
    }
    
    // Automatically save all valid rules
    const validResults = results.filter(
      (r: { result: AIGenerateResponse | null; error?: string }) => r.result?.success && r.result?.validation?.valid && r.result?.generatedRule
    )
    
    if (validResults.length > 0) {
      console.log(`Auto-saving ${validResults.length} valid rules using batch API...`)
      setBatchSaving(true)
      setBatchProgress({ current: 0, total: validResults.length, phase: 'saving' })
      setError(null)
      
      // Create updatedResults from results (local variable from batch generation, not state)
      // This ensures we can map errors back to the correct items
      // IMPORTANT: Use local 'results' variable, not 'batchResults' state (state may not be updated yet)
      const updatedResults = [...results]
      
      try {
        // Prepare rules array for batch save
        const rulesToSave = validResults.map((item: { prompt: string; result: AIGenerateResponse | null; error?: string }) => {
          const ruleToSave = item.result!.generatedRule!
          return {
            ruleName: ruleToSave.ruleName,
            label: ruleToSave.description || ruleToSave.ruleName,
            description: ruleToSave.description || ruleToSave.ruleName,
            factType: ruleToSave.factType,
            priority: ruleToSave.priority || 0,
            active: ruleToSave.enabled !== false,
            conditions: ruleToSave.conditions || null,
            output: ruleToSave.output || {},
            generatedByAi: true,
          }
        })
        
        console.log(`Calling batch save API with ${rulesToSave.length} rules...`)
        
        // Call batch save API
        const batchResponse = await fetchApi<{
          success: boolean
          total: number
          successful: number
          failed: number
          results: Array<{
            index: number
            ruleName: string
            success: boolean
            ruleId?: number
            error?: string
            errorType?: string
          }>
        }>(
          api.rules.batchCreate(),
          {
            method: 'POST',
            body: JSON.stringify({ rules: rulesToSave }),
          }
        )
        
        console.log('=== BATCH SAVE RESPONSE ===')
        console.log('Batch save response:', batchResponse)
        console.log('Valid results count:', validResults.length, 'Updated results count:', updatedResults.length)
        console.log('Valid results (index: ruleName):', validResults.map((r, i) => `${i}: "${r.result?.generatedRule?.ruleName || 'N/A'}"`))
        console.log('Batch save response results (index: ruleName):', batchResponse.results.map((r, i) => `${i}: "${r.ruleName}" (success: ${r.success}, error: ${r.error || 'none'})`))
        console.log('Rules to save count:', rulesToSave.length)
        console.log('Rules to save (index: ruleName):', rulesToSave.map((r, i) => `${i}: "${r.ruleName}"`))
        
        // Create a map from ruleName to index in updatedResults for fast lookup
        // Use normalized rule names (trimmed, case-insensitive) for matching
        const ruleNameToIndexMap = new Map<string, number>()
        const normalizedRuleNameToIndexMap = new Map<string, number>()
        updatedResults.forEach((r, idx) => {
          const ruleName = r.result?.generatedRule?.ruleName
          if (ruleName) {
            ruleNameToIndexMap.set(ruleName, idx)
            // Also create normalized version for fuzzy matching
            const normalized = ruleName.trim().toLowerCase()
            if (!normalizedRuleNameToIndexMap.has(normalized)) {
              normalizedRuleNameToIndexMap.set(normalized, idx)
            }
          }
        })
        
        console.log('Rule name to index map (first 10):', Array.from(ruleNameToIndexMap.entries()).slice(0, 10))
        console.log('All rule names in updatedResults:', updatedResults.map((r, i) => `${i}: "${r.result?.generatedRule?.ruleName || 'N/A'}"`))
        
        // Also create a map from index in validResults to index in updatedResults
        const validResultIndexToUpdatedIndexMap = new Map<number, number>()
        validResults.forEach((validResult, validIdx) => {
          const updatedIdx = updatedResults.findIndex(r => r.prompt === validResult.prompt)
          if (updatedIdx >= 0) {
            validResultIndexToUpdatedIndexMap.set(validIdx, updatedIdx)
          }
        })
        
        console.log('Valid result index to updated index map:', Array.from(validResultIndexToUpdatedIndexMap.entries()).slice(0, 5))
        
        // Update results based on batch save response
        // IMPORTANT: result.index is the index in the rulesToSave array (which corresponds to validResults)
        console.log('=== STARTING MAPPING ===')
        let mappedCount = 0
        batchResponse.results.forEach((result) => {
          console.log(`\n[Processing] Rule "${result.ruleName}" at batch response index ${result.index}`)
          
          // result.index directly corresponds to index in validResults array
          if (result.index >= 0 && result.index < validResults.length) {
            const correspondingValidResult = validResults[result.index]
            console.log(`  ✓ Found validResult at index ${result.index}: "${correspondingValidResult.result?.generatedRule?.ruleName}"`)
            
            if (correspondingValidResult) {
              // Find this result in updatedResults by matching prompt
              const resultIndex = updatedResults.findIndex(r => r.prompt === correspondingValidResult.prompt)
              
              if (resultIndex >= 0) {
                console.log(`  ✓ Found in updatedResults at index ${resultIndex}`)
                mappedCount++
                if (result.success && result.ruleId) {
                  updatedResults[resultIndex] = {
                    ...updatedResults[resultIndex],
                    savedRuleId: result.ruleId,
                    saveError: undefined
                  }
                  console.log(`  [Save Success] Rule "${result.ruleName}" saved with ID ${result.ruleId}`)
                } else {
                  const errorMsg = result.error || 'Failed to save rule'
                  updatedResults[resultIndex] = {
                    ...updatedResults[resultIndex],
                    saveError: errorMsg
                  }
                  console.log(`  [Save Error] Rule "${result.ruleName}": ${errorMsg}`)
                }
              } else {
                console.error(`  ✗ [Mapping Failed] Could not find in updatedResults by prompt`)
                console.log(`  ValidResult prompt: "${correspondingValidResult.prompt.substring(0, 80)}..."`)
                // Fallback: try to find by rule name
                const fallbackIndex = ruleNameToIndexMap.get(result.ruleName) || 
                                     normalizedRuleNameToIndexMap.get(result.ruleName?.trim().toLowerCase() || '')
                if (fallbackIndex !== undefined) {
                  console.log(`  ✓ Found by rule name fallback at index ${fallbackIndex}`)
                  mappedCount++
                  if (result.success && result.ruleId) {
                    updatedResults[fallbackIndex] = {
                      ...updatedResults[fallbackIndex],
                      savedRuleId: result.ruleId,
                      saveError: undefined
                    }
                  } else {
                    updatedResults[fallbackIndex] = {
                      ...updatedResults[fallbackIndex],
                      saveError: result.error || 'Failed to save rule'
                    }
                  }
                } else {
                  console.error(`  ✗ [Mapping Failed] Could not find by rule name either`)
                }
              }
            } else {
              console.error(`  ✗ [Mapping Failed] No validResult at index ${result.index}`)
            }
          } else {
            console.error(`  ✗ [Mapping Failed] Index ${result.index} out of range (validResults length: ${validResults.length})`)
            // Fallback: try to find by rule name
            const resultIndex = ruleNameToIndexMap.get(result.ruleName) || 
                             normalizedRuleNameToIndexMap.get(result.ruleName?.trim().toLowerCase() || '')
            if (resultIndex !== undefined) {
              console.log(`  ✓ Found by rule name fallback at index ${resultIndex}`)
              mappedCount++
              if (result.success && result.ruleId) {
                updatedResults[resultIndex] = {
                  ...updatedResults[resultIndex],
                  savedRuleId: result.ruleId,
                  saveError: undefined
                }
              } else {
                updatedResults[resultIndex] = {
                  ...updatedResults[resultIndex],
                  saveError: result.error || 'Failed to save rule'
                }
              }
            } else {
              console.error(`  ✗ [Mapping Failed] Could not find by rule name either`)
            }
          }
        })
        
        console.log(`\n=== MAPPING SUMMARY ===`)
        console.log(`Mapped ${mappedCount} out of ${batchResponse.results.length} results`)
        
        console.log(`[Mapping Summary] Mapped ${mappedCount} out of ${batchResponse.results.length} results`)
        const errorsSet = updatedResults.filter(r => r.saveError).length
        console.log(`[Verification] Total rules with saveError: ${errorsSet} (expected: ${batchResponse.failed})`)
        
        if (errorsSet !== batchResponse.failed) {
          console.warn(`[Warning] Mismatch: ${errorsSet} errors set but ${batchResponse.failed} failed in response`)
          console.log('Rules with saveError:', updatedResults.filter(r => r.saveError).map(r => ({
            ruleName: r.result?.generatedRule?.ruleName,
            saveError: r.saveError
          })))
        }
        
        // Update state with all results
        setBatchResults([...updatedResults])
        setBatchProgress({ current: validResults.length, total: validResults.length, phase: 'saving' })
        
        const savedCount = batchResponse.successful
        const failedCount = batchResponse.failed
        
        console.log(`Auto-save completed: ${savedCount} saved, ${failedCount} failed`)
        
        // Build detailed error message for failed saves
        const failedResults = updatedResults.filter(r => r.saveError)
        let detailedErrorMessage = ''
        if (failedCount > 0 && failedResults.length > 0) {
          detailedErrorMessage = `\n\nFailed rules:\n${failedResults.map((r, idx) => {
            const ruleName = r.result?.generatedRule?.ruleName || 'Unknown'
            return `${idx + 1}. "${ruleName}": ${r.saveError}`
          }).join('\n')}`
        }
        
        if (savedCount > 0) {
          // Show success message
          setError(null)
          // Show success notification
          const successMessage = `Successfully saved ${savedCount} rule(s)${failedCount > 0 ? `. ${failedCount} failed.` : '!'}`
          toast.showSuccess(successMessage)
          
          // Show detailed error if there are failures
          if (failedCount > 0 && detailedErrorMessage) {
            setError(`Some rules failed to save:${detailedErrorMessage}`)
          }
          
          // Navigate to rules page after a short delay (only if all saved)
          if (failedCount === 0) {
            setTimeout(() => {
              router.push('/rules')
            }, 500)
          }
        } else if (failedCount > 0) {
          setError(`Failed to save all rules. ${failedCount} error(s).${detailedErrorMessage}`)
        }
      } catch (err) {
        // Handle batch API error
        console.error('Error calling batch save API:', err)
        let errorMessage = 'Failed to save rules'
        
        if (err instanceof Error) {
          errorMessage = err.message
        } else if (typeof err === 'string') {
          errorMessage = err
        } else if (err && typeof err === 'object' && 'error' in err) {
          errorMessage = String(err.error)
        }
        
        setError(`Failed to save rules: ${errorMessage}`)
        
        // Mark all rules as failed
        validResults.forEach((item: { prompt: string; result: AIGenerateResponse | null; error?: string }) => {
          const resultIndex = updatedResults.findIndex(r => r.prompt === item.prompt)
          if (resultIndex >= 0) {
            updatedResults[resultIndex] = {
              ...updatedResults[resultIndex],
              saveError: errorMessage
            }
          }
        })
        setBatchResults([...updatedResults])
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
        // Backend should always return an ID, but if not, use error from response
        const errorMsg = savedRule?.error || 'Failed to save rule: Invalid response from server'
        setError(errorMsg)
      }
    } catch (err) {
      // Extract detailed error message from backend ErrorResponse
      let errorMessage = 'Failed to save rule'
      
      if (err instanceof Error) {
        // fetchApi throws Error with message extracted from ErrorResponse.error
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        // Try to extract error from ErrorResponse structure (error field)
        if ('error' in err) {
          errorMessage = String(err.error)
        } else if ('message' in err) {
          errorMessage = String(err.message)
        } else if ('errorMessage' in err) {
          errorMessage = String(err.errorMessage)
        }
      }
      
      // Add validation errors if available (from generation, not save)
      if (response?.validation?.errors && response.validation.errors.length > 0) {
        errorMessage += `\n\nValidation errors:\n${response.validation.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
      }
      
      // Log full error for debugging
      console.error('Error saving rule:', errorMessage, err)
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-secondary to-primary flex items-center justify-center">
          <Brain className="text-white" size={24} />
        </div>
        <div>
          <h1 className="page-title">AI Rule Builder</h1>
          <p className="page-subtitle">Generate rules from natural language descriptions using AI</p>
        </div>
      </div>

      {/* Input Form */}
      <div className="bg-surface rounded-lg border border-border shadow-card">
        <div className="p-6 space-y-6">
          {/* Fact Type Selector */}
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">
              Fact Type
            </label>
            <SearchableSelect
              options={factTypes.map(ft => ({ name: ft, label: ft }))}
              value={selectedFactType}
              onChange={(value) => setSelectedFactType(value)}
              placeholder="Select fact type"
            />
            <p className="text-body-xs text-text-tertiary mt-1">
              Data type that the rule will apply to
            </p>
          </div>

          {/* Natural Language Input */}
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">
              Rule Description (English or Vietnamese)
            </label>
            <textarea
              value={naturalInput}
              onChange={(e) => setNaturalInput(e.target.value)}
              placeholder="Example: If total gross mass is greater than 1000kg then require inspection&#10;&#10;Or: Nếu tổng trọng lượng hàng hóa lớn hơn 1000kg thì cần kiểm tra"
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth resize-none text-body text-text-primary placeholder:text-text-muted"
              rows={6}
            />
            <p className="text-body-xs text-text-tertiary mt-1">
              Describe the rule in natural language. AI will convert it to a structured rule.
            </p>
          </div>

          {/* Additional Context (Optional) */}
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">
              Additional Context (Optional)
            </label>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Add context or special requirements for AI..."
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth resize-none text-body text-text-primary placeholder:text-text-muted"
              rows={3}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-error-bg border border-error/20 rounded-lg">
              <AlertCircle className="text-error shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-body-sm font-medium text-error">Error</p>
                <p className="text-body-sm text-error mt-1 whitespace-pre-wrap">{error}</p>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || !naturalInput.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-secondary to-primary text-white rounded-lg hover:from-secondary-light hover:to-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-smooth shadow-sm cursor-pointer"
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
        <div className="bg-surface rounded-lg border border-outlineVariant shadow-card">
          <div className="p-6 space-y-6">
            {/* Success/Error Header */}
            <div className="flex items-start gap-3">
              {response.success && response.validation?.valid ? (
                <CheckCircle2 className="text-success shrink-0 mt-0.5" size={24} />
              ) : (
                <AlertCircle className="text-warning shrink-0 mt-0.5" size={24} />
              )}
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-text-primary">
                  {response.success && response.validation?.valid
                    ? 'Rule Generated Successfully'
                    : response.errorMessage
                    ? 'AI Generation Failed'
                    : 'Rule Has Validation Errors'}
                </h2>
                {response.aiExplanation && (
                  <p className="text-sm text-text-secondary mt-1">{response.aiExplanation}</p>
                )}
                {response.errorMessage && (
                  <p className="text-sm text-error mt-1">{response.errorMessage}</p>
                )}
              </div>
            </div>

            {/* Error Message and Suggestions */}
            {response.errorMessage && (
              <div className="space-y-3">
                <div className="bg-error-bg dark:bg-error/10 border border-error/30 rounded-lg p-4">
                  <p className="text-sm font-medium text-error dark:text-error-light mb-2">Error:</p>
                  <p className="text-sm text-error dark:text-error-light">{response.errorMessage}</p>
                </div>
                
                {response.suggestions && response.suggestions.length > 0 && (
                  <div className="bg-accent-bg dark:bg-accent/10 border border-accent/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-accent dark:text-accent-light mb-2">Suggestions:</p>
                    <ul className="space-y-1">
                      {response.suggestions.map((sug, idx) => (
                        <li key={idx} className="text-sm text-accent dark:text-accent-light flex items-start gap-2">
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
                  <div className="bg-error-bg dark:bg-error/10 border border-error/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-error dark:text-error-light mb-2">Validation Errors:</p>
                    <ul className="space-y-1">
                      {response.validation.errors.map((err, idx) => (
                        <li key={idx} className="text-sm text-error dark:text-error-light flex items-start gap-2">
                          <ChevronRight size={16} className="shrink-0 mt-0.5" />
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {response.validation.warnings.length > 0 && (
                  <div className="bg-warning-bg dark:bg-warning/10 border border-warning/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-warning dark:text-warning-light mb-2">Warnings:</p>
                    <ul className="space-y-1">
                      {response.validation.warnings.map((warn, idx) => (
                        <li key={idx} className="text-sm text-warning dark:text-warning-light flex items-start gap-2">
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
                    <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                      Rule Name
                    </label>
                    <p className="text-sm text-text-primary mt-1">{response.generatedRule.ruleName}</p>
                  </div>

                  {/* Fact Type */}
                  <div>
                    <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                      Fact Type
                    </label>
                    <p className="text-sm text-text-primary mt-1">{response.generatedRule.factType}</p>
                  </div>

                  {/* Description */}
                  {response.generatedRule.description && (
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                        Description
                      </label>
                      <p className="text-sm text-text-primary mt-1">{response.generatedRule.description}</p>
                    </div>
                  )}
                </div>

                {/* Conditions */}
                <div>
                  <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2 block">
                    Conditions (WHEN)
                  </label>
                  <div className="space-y-2">
                    {(() => {
                      // Convert ConditionsGroup to array for display, handling nested structure
                      type ConditionWithOp = Condition & { logicalOp: 'AND' | 'OR' }
                      let conditionsArray: ConditionWithOp[] = []
                      const conditions = response.generatedRule.conditions
                      
                      if (Array.isArray(conditions)) {
                        // Old format: array with logicalOp
                        conditionsArray = conditions.map(c => ({
                          ...c,
                          logicalOp: (c as any).logicalOp || 'AND' as 'AND' | 'OR'
                        }))
                      } else if (conditions && typeof conditions === 'object') {
                        const conditionsGroup = conditions as ConditionsGroup
                        
                        // Helper to extract conditions from nested groups with logical operator
                        const extractConditions = (
                          items: Array<Condition | { AND?: Condition[] } | { OR?: Condition[] }>,
                          logicalOp: 'AND' | 'OR'
                        ): ConditionWithOp[] => {
                          const result: ConditionWithOp[] = []
                          for (const item of items) {
                            if (item && typeof item === 'object') {
                              // Check if it's a nested group
                              if ('AND' in item && Array.isArray(item.AND)) {
                                // Nested AND group - all conditions inside are AND
                                result.push(...item.AND.map(c => ({ ...c, logicalOp: 'AND' as const })))
                              } else if ('OR' in item && Array.isArray(item.OR)) {
                                // Nested OR group - all conditions inside are OR
                                result.push(...item.OR.map(c => ({ ...c, logicalOp: 'OR' as const })))
                              } else if ('field' in item && 'operator' in item && 'value' in item) {
                                // Direct condition (backward compatibility)
                                result.push({ ...(item as Condition), logicalOp })
                              }
                            }
                          }
                          return result
                        }
                        
                        if (conditionsGroup.AND) {
                          conditionsArray.push(...extractConditions(conditionsGroup.AND, 'AND'))
                        }
                        if (conditionsGroup.OR) {
                          conditionsArray.push(...extractConditions(conditionsGroup.OR, 'OR'))
                        }
                      }
                      
                      if (conditionsArray.length === 0) {
                        return (
                          <div className="p-3 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-lg border border-outlineVariant text-sm text-text-tertiary">
                            No conditions specified
                          </div>
                        )
                      }
                      
                      // Group conditions by logical operator for better display
                      const groupedConditions: { op: 'AND' | 'OR', conditions: ConditionWithOp[] }[] = []
                      let currentGroup: { op: 'AND' | 'OR', conditions: ConditionWithOp[] } | null = null
                      
                      for (const cond of conditionsArray) {
                        if (!currentGroup || currentGroup.op !== cond.logicalOp) {
                          // Start new group
                          currentGroup = { op: cond.logicalOp, conditions: [] }
                          groupedConditions.push(currentGroup)
                        }
                        currentGroup.conditions.push(cond)
                      }
                      
                      return (
                        <div className="space-y-3">
                          {groupedConditions.map((group, groupIdx) => (
                            <div key={groupIdx} className="space-y-2">
                              {groupIdx > 0 && (
                                <div className="flex items-center justify-center py-1">
                                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                    group.op === 'AND' 
                                      ? 'bg-accent-bg text-accent dark:bg-accent/20 dark:text-accent-light border border-accent/30' 
                                      : 'bg-secondary-bg text-secondary dark:bg-secondary/20 dark:text-secondary-light border border-secondary/30'
                                  }`}>
                                    {group.op}
                                  </span>
                                </div>
                              )}
                              <div className="space-y-2">
                                {group.conditions.map((cond, idx) => (
                                  <div key={idx} className="flex items-center gap-3 p-3 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-lg border border-outlineVariant">
                                    <span className="text-xs font-medium text-text-tertiary">#{conditionsArray.indexOf(cond) + 1}</span>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                      cond.logicalOp === 'AND' 
                                        ? 'bg-accent-bg text-accent dark:bg-accent/20 dark:text-accent-light' 
                                        : 'bg-secondary-bg text-secondary dark:bg-secondary/20 dark:text-secondary-light'
                                    }`}>
                                      {cond.logicalOp}
                                    </span>
                                    <code className="text-sm text-primary font-mono">
                                      {cond.field}
                                    </code>
                                    <span className="text-sm font-medium text-text-primary">{cond.operator}</span>
                                    <code className="text-sm text-success font-mono">
                                      {String(cond.value)}
                                    </code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Output Section */}
                <div>
                  <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2 block">
                    Output (THEN)
                  </label>
                  {response.generatedRule.output && Object.keys(response.generatedRule.output).length > 0 ? (
                    <div className="p-4 bg-surfaceContainerHigh dark:bg-surfaceContainerHighest rounded-lg border border-outlineVariant">
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(response.generatedRule.output).map(([key, value]) => (
                          value !== null && value !== undefined && value !== '' && (
                            <div key={key}>
                              <dt className="text-xs font-medium text-text-tertiary">{key}</dt>
                              <dd className="text-sm text-text-primary mt-0.5">{String(value)}</dd>
                            </div>
                          )
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <div className="p-4 bg-warning-bg dark:bg-warning/10 rounded-lg border border-warning/30">
                      <p className="text-sm text-warning dark:text-warning-light">
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
              <div className="flex gap-3 pt-4 border-t border-outlineVariant">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                  className="px-6 py-3 border border-outlineVariant text-text-primary rounded-lg hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors cursor-pointer"
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
        <div className="bg-surface rounded-lg border border-outlineVariant shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              📝 Example Prompts for {selectedFactType}:
            </h3>
            {examplePrompts.length > 0 && (
              <button
                onClick={handleGenerateAll}
                disabled={batchGenerating || batchSaving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-secondary to-primary text-white text-sm rounded-lg hover:from-secondary-light hover:to-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                    <span>Generate & Save All ({examplePrompts.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {examplePrompts.map((example, idx) => {
              const isDeclaration = selectedFactType === 'Declaration'
              return (
                <button
                  key={idx}
                  onClick={() => setNaturalInput(example.prompt)}
                  className={`text-left p-4 border border-outlineVariant rounded-lg transition-colors group hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest cursor-pointer ${
                    isDeclaration
                      ? 'hover:border-primary/50'
                      : 'hover:border-secondary/50'
                  }`}
                >
                  <p className={`text-sm text-text-primary line-clamp-2 ${
                    isDeclaration
                      ? 'group-hover:text-primary'
                      : 'group-hover:text-secondary'
                  }`}>
                    {example.prompt}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">{example.description}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Batch Generation Results */}
      {batchResults.length > 0 && (
        <div className="bg-surface rounded-lg border border-outlineVariant shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                📊 Batch Generation Results
              </h3>
              <p className="text-xs text-text-tertiary mt-1">
                Total: {batchResults.length} | 
                Generated: <span className="text-success font-medium">
                  {batchResults.filter(r => r.result?.success && r.result?.validation?.valid).length}
                </span> | 
                Saved: <span className="text-success font-medium">
                  {batchResults.filter(r => r.savedRuleId).length}
                </span> | 
                Failed: <span className="text-error font-medium">
                  {batchResults.filter(r => r.error || r.saveError || (r.result && !(r.result.success && r.result.validation?.valid))).length}
                </span>
              </p>
            </div>
            <button
              onClick={() => {
                setBatchResults([])
                setBatchProgress({ current: 0, total: 0, phase: 'generating' })
              }}
              className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {batchResults.length === 0 ? (
              <p className="text-sm text-text-tertiary text-center py-4">No results yet</p>
            ) : (
              batchResults.map((item, idx) => {
                const success = item.result?.success && item.result?.validation?.valid && !item.saveError
                const failed = item.error || item.saveError || (item.result && !success)
                const hasSaveError = !!item.saveError
                const hasGenerationError = !!item.error
              
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    success && !hasSaveError
                      ? 'bg-success-bg dark:bg-success/10 border-success/30'
                      : failed
                      ? 'bg-error-bg dark:bg-error/10 border-error/30'
                      : 'bg-warning-bg dark:bg-warning/10 border-warning/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {success && !hasSaveError ? (
                      <CheckCircle2 className="text-success shrink-0 mt-0.5" size={20} />
                    ) : failed ? (
                      <AlertCircle className="text-error shrink-0 mt-0.5" size={20} />
                    ) : (
                      <AlertCircle className="text-warning shrink-0 mt-0.5" size={20} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-tertiary mb-1">
                        #{idx + 1} - {examplePrompts[idx]?.description || 'Unknown'}
                      </p>
                      <p className="text-sm text-text-primary mb-2 line-clamp-2">
                        {item.prompt}
                      </p>
                      
                      {/* Generation Error */}
                      {hasGenerationError && (
                        <div className="mt-2 p-2 bg-error/10 dark:bg-error/20 border border-error/30 rounded text-xs">
                          <p className="font-medium text-error dark:text-error-light mb-1">Generation Error:</p>
                          <p className="text-error dark:text-error-light">{item.error}</p>
                        </div>
                      )}
                      
                      {/* Save Error */}
                      {hasSaveError && (
                        <div className="mt-2 p-2 bg-error/10 dark:bg-error/20 border border-error/30 rounded text-xs">
                          <p className="font-medium text-error dark:text-error-light mb-1">Save Error:</p>
                          <p className="text-error dark:text-error-light whitespace-pre-wrap">{item.saveError}</p>
                        </div>
                      )}
                      
                      {/* Successfully Saved */}
                      {item.savedRuleId && (
                        <div className="mt-2 p-2 bg-success/10 dark:bg-success/20 border border-success/30 rounded text-xs">
                          <p className="font-medium text-success dark:text-success-light">
                            ✓ Saved (ID: {item.savedRuleId})
                          </p>
                        </div>
                      )}
                      
                      {item.result && !item.error && !hasSaveError && (
                        <div className="mt-2 space-y-1">
                          {item.result.generatedRule && (
                            <p className="text-xs text-text-secondary">
                              <span className="font-medium">Rule:</span> {item.result.generatedRule.ruleName}
                            </p>
                          )}
                          {item.result.validation && (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                item.result.validation.valid
                                  ? 'bg-success-bg text-success dark:bg-success/20 dark:text-success-light'
                                  : 'bg-error-bg text-error dark:bg-error/20 dark:text-error-light'
                              }`}>
                                {item.result.validation.valid ? 'Valid' : 'Invalid'}
                              </span>
                              {item.result.validation.errors.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-error">
                                    {item.result.validation.errors.length} validation error(s)
                                  </span>
                                  <ul className="text-xs text-error list-disc list-inside">
                                    {item.result.validation.errors.map((err, errIdx) => (
                                      <li key={errIdx}>{err}</li>
                                    ))}
                                  </ul>
                                </div>
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
                        className="text-xs px-3 py-1 bg-primary text-white rounded hover:bg-primary-light transition-colors shrink-0 cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              )
            }))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-outlineVariant">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-text-secondary">
                  <span className="font-medium text-success">
                    {batchResults.filter(r => r.savedRuleId).length}
                  </span> saved
                </span>
                <span className="text-text-secondary">
                  <span className="font-medium text-success">
                    {batchResults.filter(r => r.result?.success && r.result?.validation?.valid && !r.saveError).length}
                  </span> generated
                </span>
                <span className="text-text-secondary">
                  <span className="font-medium text-error">
                    {batchResults.filter(r => r.error || r.saveError || (r.result && !(r.result.success && r.result.validation?.valid))).length}
                  </span> failed
                </span>
              </div>
              {batchSaving && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm rounded-lg">
                  <Loader2 className="animate-spin" size={16} />
                  <span>Saving valid rules... ({batchProgress.current}/{batchProgress.total})</span>
                </div>
              )}
              {!batchSaving && !batchGenerating && batchResults.filter(r => r.result?.success && r.result?.validation?.valid).length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-success-bg dark:bg-success/20 text-success dark:text-success-light text-sm rounded-lg">
                  <CheckCircle2 size={16} />
                  <span>Valid rules have been saved automatically</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="bg-gradient-to-br from-primary-bg to-secondary-bg dark:from-primary/10 dark:to-secondary/10 border border-primary/30 dark:border-primary/20 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-primary dark:text-primary-light mb-3">💡 Tips for Creating Effective Rules:</h3>
        <ul className="space-y-2 text-sm text-text-primary">
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5 text-primary" />
            <span>Clearly describe the conditions and desired outcomes</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5 text-primary" />
            <span>Use exact field names from metadata (see <code className="text-xs bg-primary-bg dark:bg-primary/20 text-primary px-1 py-0.5 rounded">GET /api/v1/rules/metadata</code>)</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5 text-primary" />
            <span>Can write in English or Vietnamese</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5 text-primary" />
            <span>AI will automatically validate and suggest if there are errors</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="shrink-0 mt-0.5 text-primary" />
            <span>Click on example prompts above to quickly test</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

