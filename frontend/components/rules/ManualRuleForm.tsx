'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, FileText, Package, User, Save, Loader2 } from 'lucide-react';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Select } from '@/components/Select';
import { api, fetchApi } from '@/lib/api';

type LogicalOperator = 'AND' | 'OR';

type Condition = {
  id: string;
  field: string;
  operator: string;
  value: string;
  logicalOp?: LogicalOperator;
};

type RuleFormData = {
  ruleName: string;
  label: string;
  factType: string;
  priority: number;
  output: Record<string, string>;
  conditions: Condition[];
};

type FieldDefinition = {
  name: string;
  label: string;
  type: string;
  description: string;
  orderIndex?: number;
};

type OperatorDefinition = {
  operator: string;
  label: string;
  description?: string;
};

type FieldMetadata = {
  inputFields: FieldDefinition[];
  outputFields: FieldDefinition[];
  operatorsByType: Record<string, OperatorDefinition[]>;
};

type ManualRuleFormProps = {
  onSave: (formData: RuleFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  showFactTypeToggle?: boolean;
  formRef?: React.RefObject<HTMLFormElement>;
};

export function ManualRuleForm({
  onSave,
  onCancel,
  loading: externalLoading,
  showFactTypeToggle = true,
  formRef: externalFormRef,
}: ManualRuleFormProps) {
  const [loading, setLoading] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<FieldMetadata | null>(null);
  const [factTypes, setFactTypes] = useState<string[]>([]);

  const MANUAL_FORM_DRAFT_KEY = 'rule-guide-manual-form-draft';

  // Load draft on mount
  const loadFormDraft = (): Partial<RuleFormData> | null => {
    try {
      const stored = localStorage.getItem(MANUAL_FORM_DRAFT_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (err) {
      console.warn('Failed to load manual form draft:', err);
      return null;
    }
  };

  // Save draft
  const saveFormDraft = (data: RuleFormData) => {
    try {
      localStorage.setItem(MANUAL_FORM_DRAFT_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save manual form draft:', err);
    }
  };

  const clearFormDraft = () => {
    try {
      localStorage.removeItem(MANUAL_FORM_DRAFT_KEY);
    } catch (err) {
      console.warn('Failed to clear manual form draft:', err);
    }
  };

  const draftData = loadFormDraft();
  const [formData, setFormData] = useState<RuleFormData>({
    ruleName: draftData?.ruleName || '',
    label: draftData?.label || '',
    factType: draftData?.factType || 'Declaration',
    priority: draftData?.priority || 0,
    output: draftData?.output || {},
    conditions: draftData?.conditions?.length
      ? draftData.conditions
      : [{ id: crypto.randomUUID(), field: '', operator: '', value: '', logicalOp: 'AND' }],
  });

  // Initialize output fields from metadata
  useEffect(() => {
    if (metadata?.outputFields) {
      const initialOutput: Record<string, string> = {};
      metadata.outputFields.forEach((field) => {
        initialOutput[field.name] = '';
      });
      setFormData((prev) => ({
        ...prev,
        output: { ...prev.output, ...initialOutput },
      }));
    }
  }, [metadata]);

  // Fetch metadata function
  const fetchMetadata = async (factType?: string) => {
    try {
      setLoadingMetadata(true);
      const type = factType || formData.factType || 'Declaration';
      const data = await fetchApi<FieldMetadata>(api.rules.metadata(type));
      setMetadata(data);
    } catch (err) {
      console.error('Failed to load metadata:', err);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // Fetch field metadata and fact types from backend
  useEffect(() => {
    const fetchFactTypes = async () => {
      try {
        const types = await fetchApi<string[]>(api.rules.factTypes());
        setFactTypes(types.length > 0 ? types : ['Declaration']);
      } catch (err) {
        console.error('Failed to load fact types:', err);
        setFactTypes(['Declaration']);
      }
    };

    fetchFactTypes().then(() => {
      fetchMetadata(formData.factType);
    });
  }, []);

  // Reload metadata when factType changes
  useEffect(() => {
    if (formData.factType) {
      fetchMetadata(formData.factType);
    }
  }, [formData.factType]);

  // Auto-save form data to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.ruleName || formData.conditions.some((c) => c.field || c.operator || c.value)) {
        saveFormDraft(formData);
      }
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timeoutId);
  }, [formData]);

  const internalFormRef = useRef<HTMLFormElement>(null);
  const formRef = externalFormRef || internalFormRef;

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const isLoading = externalLoading || loading;
    if (isLoading) return;

    setLoading(true);
    setError(null);

    // Validate that at least one condition is filled
    const validConditions = formData.conditions.filter((c) => c.field && c.operator && c.value);
    if (validConditions.length === 0) {
      setError('Please add at least one valid condition');
      setLoading(false);
      return;
    }

    try {
      await onSave(formData);
      // Clear draft after successful save
      clearFormDraft();
    } catch (err: any) {
      let errorMessage = 'An error occurred';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.error) {
        errorMessage = err.error;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const addCondition = () => {
    setFormData((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { id: crypto.randomUUID(), field: '', operator: '', value: '', logicalOp: 'AND' },
      ],
    }));
  };

  const removeCondition = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((c) => c.id !== id),
    }));
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  };

  // Extract object path from field path
  const getObjectPath = (fieldPath: string): string => {
    if (!fieldPath) return '';
    const parts = fieldPath.split('.');
    if (parts.length <= 1) return fieldPath;
    return parts.slice(0, -1).join('.');
  };

  // Check if two conditions have the same object path
  const hasSameObjectPath = (field1: string, field2: string): boolean => {
    if (!field1 || !field2) return false;
    return getObjectPath(field1) === getObjectPath(field2);
  };

  if (loadingMetadata) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-center text-error py-10">
        Failed to load field metadata. Please refresh the page.
      </div>
    );
  }

  const isLoading = externalLoading || loading;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* Fact Type Toggle */}
      {showFactTypeToggle && factTypes.length > 0 && (
        <div className="flex items-center gap-2 bg-surface border border-outlineVariant rounded-md p-2">
          <Package size={16} className="text-text-tertiary" />
          <div className="flex gap-1">
            {factTypes.map((factType) => (
              <button
                key={factType}
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, factType }))}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  formData.factType === factType
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

      {error && (
        <div className="bg-error-bg border border-error/30 rounded-md p-4">
          <p className="text-error">{error}</p>
        </div>
      )}

      {/* Basic Information */}
      <div className="bg-surface rounded-md border border-outlineVariant p-6 space-y-4">
        <div>
          <label htmlFor="ruleName" className="block text-sm font-medium text-text-secondary mb-1">
            Rule Name <span className="text-error">*</span>
          </label>
          <input
            id="ruleName"
            type="text"
            required
            value={formData.ruleName}
            onChange={(e) => setFormData((prev) => ({ ...prev, ruleName: e.target.value }))}
            className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
            placeholder="e.g., high_value_import_flag"
          />
          <p className="text-xs text-text-tertiary mt-1">
            Internal identifier for the rule (use lowercase with underscores)
          </p>
        </div>
      </div>

      {/* Conditions (When) */}
      <section className="bg-surface rounded-md border border-outlineVariant p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Conditions (When)</h2>
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-ring cursor-pointer"
          >
            <Plus size={16} /> Add Condition
          </button>
        </div>

        <div className="space-y-3">
          {formData.conditions.map((condition, idx) => {
            const selectedField = metadata.inputFields.find((f) => f.name === condition.field);
            const operators = selectedField
              ? metadata.operatorsByType[selectedField.type] || []
              : metadata.operatorsByType['string'] || [];

            // Check if we should show logical operator for this condition
            const prevCondition = idx > 0 ? formData.conditions[idx - 1] : null;
            const showLogicalOp =
              prevCondition?.field &&
              condition?.field &&
              hasSameObjectPath(prevCondition.field, condition.field);

            return (
              <div key={condition.id} className="flex items-start gap-2 bg-surfaceContainerHigh p-3 rounded-md">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
                  {idx > 0 && showLogicalOp && (
                    <Select
                      value={prevCondition?.logicalOp || 'AND'}
                      onChange={(e) =>
                        updateCondition(prevCondition.id, {
                          logicalOp: e.target.value as LogicalOperator,
                        })
                      }
                      className="col-span-12 md:col-span-2 text-sm"
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </Select>
                  )}

                  <SearchableSelect
                    value={condition.field}
                    onChange={(value) => {
                      // Set default operator based on field type from metadata
                      const selectedField = metadata.inputFields.find((f) => f.name === value);
                      const defaultOperators = selectedField
                        ? metadata.operatorsByType[selectedField.type] || []
                        : metadata.operatorsByType['string'] || [];
                      const defaultOperator = defaultOperators.length > 0 ? defaultOperators[0].operator : '';

                      // Check if this field has a different object path than the previous condition
                      const prevCondition = idx > 0 ? formData.conditions[idx - 1] : null;
                      const hasDifferentObjectPath =
                        prevCondition &&
                        prevCondition.field &&
                        !hasSameObjectPath(value, prevCondition.field);

                      // If different object path, remove logicalOp (start new group)
                      const updates: Partial<Condition> = { field: value, operator: defaultOperator };
                      if (hasDifferentObjectPath) {
                        updates.logicalOp = undefined;
                      }

                      updateCondition(condition.id, updates);
                    }}
                    options={metadata.inputFields}
                    placeholder="Select field..."
                    className={idx > 0 && showLogicalOp ? 'col-span-12 md:col-span-4' : 'col-span-12 md:col-span-6'}
                  />

                  <Select
                    value={
                      condition.operator && operators.some((op) => op.operator === condition.operator)
                        ? condition.operator
                        : operators.length > 0
                          ? operators[0].operator
                          : ''
                    }
                    onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                    className="col-span-12 md:col-span-3 text-sm"
                    disabled={!condition.field || operators.length === 0}
                    title={operators.find((op) => op.operator === condition.operator)?.description}
                  >
                    {operators.map((op) => (
                      <option key={op.operator} value={op.operator} title={op.description}>
                        {op.label}
                      </option>
                    ))}
                  </Select>

                  <input
                    type={
                      selectedField?.type === 'integer' || selectedField?.type === 'decimal'
                        ? 'number'
                        : 'text'
                    }
                    step={selectedField?.type === 'decimal' ? '0.01' : undefined}
                    value={condition.value}
                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                    placeholder="Value"
                    className="col-span-12 md:col-span-3 h-9 px-2 text-sm rounded-md border border-outlineVariant focus-ring"
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
            );
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
                const orderA = a.orderIndex ?? 999;
                const orderB = b.orderIndex ?? 999;
                return orderA - orderB;
              })
              .map((field) => {
                const fieldValue = formData.output[field.name] || '';
                const isRequired = field.name === 'action';
                const isTextarea =
                  field.type === 'text' ||
                  field.name === 'result' ||
                  field.name === 'description';
                const isNumber =
                  field.type === 'decimal' || field.type === 'number' || field.type === 'integer';

                // Special handling for action field (dropdown)
                if (field.name === 'action') {
                  return (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {field.label} {isRequired && <span className="text-error">*</span>}
                      </label>
                      <Select
                        value={fieldValue}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            output: { ...prev.output, [field.name]: e.target.value },
                          }))
                        }
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
                  );
                }

                // Textarea for text fields or specific fields
                if (isTextarea) {
                  return (
                    <div
                      key={field.name}
                      className={
                        field.name === 'result' || field.name === 'description' ? 'md:col-span-2' : ''
                      }
                    >
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {field.label} {isRequired && <span className="text-error">*</span>}
                      </label>
                      <textarea
                        value={fieldValue}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            output: { ...prev.output, [field.name]: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                        rows={field.name === 'description' ? 3 : 2}
                        placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                      />
                      {field.description && (
                        <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                      )}
                    </div>
                  );
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
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            output: { ...prev.output, [field.name]: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                        placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                      />
                      {field.description && (
                        <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                      )}
                    </div>
                  );
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
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          output: { ...prev.output, [field.name]: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring"
                      placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                    />
                    {field.description && (
                      <p className="text-xs text-text-tertiary mt-1">{field.description}</p>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">Loading output fields...</p>
        )}
      </section>

      {/* Submit */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 focus-ring disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save draft & continue
            </>
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh focus-ring transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

