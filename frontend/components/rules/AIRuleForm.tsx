'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ChevronRight, Save, FileText, Package, User } from 'lucide-react';
import { api, fetchApi } from '@/lib/api';

type AIGenerateRequest = {
  naturalLanguageInput: string;
  factType: string;
  additionalContext?: string;
  previewOnly: boolean;
};

type Condition = {
  field: string;
  operator: string;
  value: string;
  logicalOp?: 'AND' | 'OR';
};

type ConditionsGroup = {
  AND?: Array<Condition | { AND?: Condition[] } | { OR?: Condition[] }>;
  OR?: Array<Condition | { AND?: Condition[] } | { OR?: Condition[] }>;
};

type Output = {
  action?: string;
  result?: string;
  score?: number;
  flag?: string;
  description?: string;
};

type GeneratedRule = {
  ruleName: string;
  description?: string;
  factType: string;
  priority?: number;
  enabled?: boolean;
  conditions: Condition[] | ConditionsGroup | null;
  output: Output;
};

type ValidationStatus = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  autoCorrected: string[];
};

type AIGenerateResponse = {
  success: boolean;
  generatedRule: GeneratedRule | null;
  aiExplanation: string | null;
  validation: ValidationStatus | null;
  savedRuleId?: number;
  errorMessage?: string;
  suggestions?: string[];
};

type AIRuleFormProps = {
  onSave: (rule: GeneratedRule) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  onResponseChange?: (response: AIGenerateResponse | null) => void;
  onFactTypeChange?: (factType: string) => void;
  initialFactType?: string;
  initialNaturalInput?: string;
  onNaturalInputChange?: (input: string) => void;
};

export function AIRuleForm({
  onSave,
  onCancel,
  loading: externalLoading,
  onResponseChange,
  onFactTypeChange,
  initialFactType = 'Declaration',
  initialNaturalInput = '',
  onNaturalInputChange,
}: AIRuleFormProps) {
  const AI_FORM_DRAFT_KEY = 'rule-guide-ai-form-draft';

  // Load draft on mount
  const loadFormDraft = (): { naturalInput: string; additionalContext: string; factType: string } | null => {
    try {
      const stored = localStorage.getItem(AI_FORM_DRAFT_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (err) {
      console.warn('Failed to load AI form draft:', err);
      return null;
    }
  };

  // Save draft
  const saveFormDraft = (data: { naturalInput: string; additionalContext: string; factType: string }) => {
    try {
      localStorage.setItem(AI_FORM_DRAFT_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save AI form draft:', err);
    }
  };

  const clearFormDraft = () => {
    try {
      localStorage.removeItem(AI_FORM_DRAFT_KEY);
    } catch (err) {
      console.warn('Failed to clear AI form draft:', err);
    }
  };

  const draftData = loadFormDraft();
  const [factTypes, setFactTypes] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  // Prioritize initialFactType if provided, otherwise use draft
  const [selectedFactType, setSelectedFactType] = useState(
    initialFactType || draftData?.factType || 'Declaration',
  );
  // Prioritize initialNaturalInput if provided (from example prompt), otherwise use draft
  const [naturalInput, setNaturalInput] = useState(
    initialNaturalInput || draftData?.naturalInput || '',
  );
  const [additionalContext, setAdditionalContext] = useState(
    draftData?.additionalContext || '',
  );
  const [response, setResponse] = useState<AIGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load fact types
  useEffect(() => {
    const loadFactTypes = async () => {
      try {
        const types = await fetchApi<string[]>(api.rules.factTypes());
        setFactTypes(types.length > 0 ? types : ['Declaration']);
      } catch (err) {
        console.error('Failed to load fact types:', err);
        setFactTypes(['Declaration']);
      }
    };
    loadFactTypes();
  }, []);

  // Update selectedFactType when initialFactType changes
  useEffect(() => {
    if (initialFactType !== selectedFactType) {
      setSelectedFactType(initialFactType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFactType]);

  // Notify parent when factType changes
  useEffect(() => {
    onFactTypeChange?.(selectedFactType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFactType]);

  // Update naturalInput when initialNaturalInput changes (e.g., from example prompt)
  useEffect(() => {
    if (initialNaturalInput && initialNaturalInput.trim() && initialNaturalInput !== naturalInput) {
      setNaturalInput(initialNaturalInput);
      // Clear draft when new prompt is provided from example
      clearFormDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNaturalInput]);

  // Notify parent when naturalInput changes
  useEffect(() => {
    onNaturalInputChange?.(naturalInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalInput]);

  // Auto-save form data to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (naturalInput.trim() || additionalContext.trim()) {
        saveFormDraft({
          naturalInput,
          additionalContext,
          factType: selectedFactType,
        });
      }
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timeoutId);
  }, [naturalInput, additionalContext, selectedFactType]);

  // Generate rule from natural language
  const handleGenerate = async () => {
    if (!naturalInput.trim()) {
      setError('Please enter a rule description');
      return;
    }

    setError(null);
    setResponse(null);
    setGenerating(true);

    try {
      const request: AIGenerateRequest = {
        naturalLanguageInput: naturalInput,
        factType: selectedFactType,
        additionalContext: additionalContext || undefined,
        previewOnly: true,
      };

      const result = await fetchApi<AIGenerateResponse>(api.rules.aiGenerate(), {
        method: 'POST',
        body: JSON.stringify(request),
      });

      setResponse(result);
      onResponseChange?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate rule');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!response?.generatedRule) return;

    try {
      await onSave(response.generatedRule);
      // Clear draft after successful save
      clearFormDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const isLoading = externalLoading || generating;

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="space-y-4">
        {/* Fact Type Toggle */}
        {factTypes.length > 0 && (
          <div className="flex items-center gap-2 bg-surface border border-outlineVariant rounded-md p-2">
            <Package size={16} className="text-text-tertiary" />
            <div className="flex gap-1">
              {factTypes.map((factType) => (
                <button
                  key={factType}
                  type="button"
                  onClick={() => setSelectedFactType(factType)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                    selectedFactType === factType
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-surfaceContainerHigh text-text-secondary hover:bg-surfaceContainerHighest'
                  }`}
                >
                  {factType === 'Declaration' ? (
                    <FileText size={14} />
                  ) : factType === 'Traveler' ? (
                    <User size={14} />
                  ) : (
                    <Package size={14} />
                  )}
                  {factType}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Natural Language Input */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Rule Description (English or Vietnamese)
          </label>
          <textarea
            value={naturalInput}
            onChange={(e) => setNaturalInput(e.target.value)}
            placeholder="Example: If total gross mass is greater than 1000kg then require inspection"
            className="w-full px-4 py-3 border border-outlineVariant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth resize-none text-sm text-text-primary placeholder:text-text-muted"
            rows={6}
          />
          <p className="text-xs text-text-tertiary mt-1">
            Describe the rule in natural language. AI will convert it to a structured rule.
          </p>
        </div>

        {/* Additional Context (Optional) */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Additional Context (Optional)
          </label>
          <textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Add context or special requirements for AI..."
            className="w-full px-4 py-3 border border-outlineVariant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-smooth resize-none text-sm text-text-primary placeholder:text-text-muted"
            rows={3}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-error-bg border border-error/20 rounded-lg">
            <AlertCircle className="text-error shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-sm font-medium text-error">Error</p>
              <p className="text-sm text-error mt-1 whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex gap-3">
          <button
            type="button"
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

      {/* Generated Rule Preview */}
      {response && (
        <div className="bg-surface rounded-lg border border-outlineVariant p-6 space-y-6">
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
              <div className="bg-error-bg border border-error/30 rounded-lg p-4">
                <p className="text-sm font-medium text-error mb-2">Error:</p>
                <p className="text-sm text-error">{response.errorMessage}</p>
              </div>

              {response.suggestions && response.suggestions.length > 0 && (
                <div className="bg-accent-bg border border-accent/30 rounded-lg p-4">
                  <p className="text-sm font-medium text-accent mb-2">Suggestions:</p>
                  <ul className="space-y-1">
                    {response.suggestions.map((sug, idx) => (
                      <li key={idx} className="text-sm text-accent flex items-start gap-2">
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
                <div className="bg-error-bg border border-error/30 rounded-lg p-4">
                  <p className="text-sm font-medium text-error mb-2">Validation Errors:</p>
                  <ul className="space-y-1">
                    {response.validation.errors.map((err, idx) => (
                      <li key={idx} className="text-sm text-error flex items-start gap-2">
                        <ChevronRight size={16} className="shrink-0 mt-0.5" />
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {response.validation.warnings.length > 0 && (
                <div className="bg-warning-bg border border-warning/30 rounded-lg p-4">
                  <p className="text-sm font-medium text-warning mb-2">Warnings:</p>
                  <ul className="space-y-1">
                    {response.validation.warnings.map((warn, idx) => (
                      <li key={idx} className="text-sm text-warning flex items-start gap-2">
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

                {/* Target Object */}
                <div>
                  <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                    Target Object
                  </label>
                  <p className="text-sm text-text-primary mt-1">{response.generatedRule.factType}</p>
                </div>

                {/* Description */}
                {response.generatedRule.description && (
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                      Description
                    </label>
                    <p className="text-sm text-text-primary mt-1">
                      {response.generatedRule.description}
                    </p>
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
                    type ConditionWithOp = Condition & { logicalOp: 'AND' | 'OR' };
                    let conditionsArray: ConditionWithOp[] = [];
                    const conditions = response.generatedRule.conditions;

                    if (Array.isArray(conditions)) {
                      conditionsArray = conditions.map((c) => ({
                        ...c,
                        logicalOp: (c as any).logicalOp || ('AND' as 'AND' | 'OR'),
                      }));
                    } else if (conditions && typeof conditions === 'object') {
                      const conditionsGroup = conditions as ConditionsGroup;

                      const extractConditions = (
                        items: Array<Condition | { AND?: Condition[] } | { OR?: Condition[] }>,
                        logicalOp: 'AND' | 'OR',
                      ): ConditionWithOp[] => {
                        const result: ConditionWithOp[] = [];
                        for (const item of items) {
                          if (item && typeof item === 'object') {
                            if ('AND' in item && Array.isArray(item.AND)) {
                              result.push(...item.AND.map((c) => ({ ...c, logicalOp: 'AND' as const })));
                            } else if ('OR' in item && Array.isArray(item.OR)) {
                              result.push(...item.OR.map((c) => ({ ...c, logicalOp: 'OR' as const })));
                            } else if ('field' in item && 'operator' in item && 'value' in item) {
                              result.push({ ...(item as Condition), logicalOp });
                            }
                          }
                        }
                        return result;
                      };

                      if (conditionsGroup.AND) {
                        conditionsArray.push(...extractConditions(conditionsGroup.AND, 'AND'));
                      }
                      if (conditionsGroup.OR) {
                        conditionsArray.push(...extractConditions(conditionsGroup.OR, 'OR'));
                      }
                    }

                    if (conditionsArray.length === 0) {
                      return (
                        <div className="p-3 bg-surfaceContainerHigh rounded-lg border border-outlineVariant text-sm text-text-tertiary">
                          No conditions specified
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {conditionsArray.map((cond, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-surfaceContainerHigh rounded-lg border border-outlineVariant"
                          >
                            <span className="text-xs font-medium text-text-tertiary">#{idx + 1}</span>
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                cond.logicalOp === 'AND'
                                  ? 'bg-accent-bg text-accent'
                                  : 'bg-secondary-bg text-secondary'
                              }`}
                            >
                              {cond.logicalOp}
                            </span>
                            <code className="text-sm text-primary font-mono">{cond.field}</code>
                            <span className="text-sm font-medium text-text-primary">{cond.operator}</span>
                            <code className="text-sm text-success font-mono">{String(cond.value)}</code>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Output Section */}
              <div>
                <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2 block">
                  Output (THEN)
                </label>
                {response.generatedRule.output && Object.keys(response.generatedRule.output).length > 0 ? (
                  <div className="p-4 bg-surfaceContainerHigh rounded-lg border border-outlineVariant">
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(response.generatedRule.output).map(
                        ([key, value]) =>
                          value !== null && value !== undefined && value !== '' && (
                            <div key={key}>
                              <dt className="text-xs font-medium text-text-tertiary">{key}</dt>
                              <dd className="text-sm text-text-primary mt-0.5">{String(value)}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                  </div>
                ) : (
                  <div className="p-4 bg-warning-bg rounded-lg border border-warning/30">
                    <p className="text-sm text-warning">
                      ⚠️ No output actions specified. Please specify what should happen when conditions
                      are met.
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
                type="button"
                onClick={handleSave}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    <span>Save draft & continue</span>
                  </>
                )}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-6 py-3 border border-outlineVariant text-text-primary rounded-lg hover:bg-surfaceContainerHigh transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

