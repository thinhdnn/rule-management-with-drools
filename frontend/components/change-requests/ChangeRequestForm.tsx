'use client';

import { useState, useEffect } from 'react';
import { api, fetchApi } from '@/lib/api';

type ChangeRequestFormData = {
  factType: string;
  title: string;
  description: string;
};

type ChangeRequestValidationResult = {
  success: boolean;
  message: string;
  error?: string;
  releaseId?: string;
  compiledRuleCount?: number;
  rulesToInclude?: number;
  rulesToExclude?: number;
};

type ChangeRequestFormProps = {
  initialFactType?: string;
  onSave: (data: ChangeRequestFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  showPreview?: boolean;
  showValidation?: boolean;
  hideFactType?: boolean;
  ruleIds?: number[]; // Optional: specific rule IDs to include (rule guide mode)
};

export function ChangeRequestForm({
  initialFactType = 'Declaration',
  onSave,
  onCancel,
  loading = false,
  showPreview = true,
  showValidation = true,
  hideFactType = false,
  ruleIds,
}: ChangeRequestFormProps) {
  const [factTypes, setFactTypes] = useState<string[]>([]);
  const [formData, setFormData] = useState<ChangeRequestFormData>({
    factType: initialFactType,
    title: '',
    description: '',
  });
  const [previewChanges, setPreviewChanges] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRules, setPreviewRules] = useState<Map<number, any>>(new Map());
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ChangeRequestValidationResult | null>(null);

  // Load fact types on mount
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

  // Update formData when initialFactType changes
  useEffect(() => {
    if (initialFactType) {
      setFormData((prev) => ({ ...prev, factType: initialFactType }));
    }
  }, [initialFactType]);

  // Load preview when factType changes
  useEffect(() => {
    if (showPreview && formData.factType) {
      loadPreview();
    }
  }, [formData.factType, showPreview]);

  const loadPreview = async () => {
    if (!formData.factType) return;

    setPreviewLoading(true);
    setPreviewChanges(null);
    setPreviewRules(new Map());
    try {
      // If ruleIds are provided (rule guide mode), include them in the request
      let url = api.changeRequests.previewChanges(formData.factType);
      if (ruleIds && ruleIds.length > 0) {
        const params = new URLSearchParams();
        ruleIds.forEach((id) => params.append('ruleIds', id.toString()));
        url = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;
      }
      
      const response = await fetchApi<any>(url);

      setPreviewChanges(response);

      // Load rules for preview
      if (response?.changes) {
        const allRuleIds = [
          ...(response.changes.rulesToInclude || []),
          ...(response.changes.rulesToExclude || []),
        ];

        if (allRuleIds.length > 0) {
          const rulesMap = new Map<number, any>();
          await Promise.all(
            allRuleIds.map(async (ruleId: number) => {
              try {
                const rule = await fetchApi(api.rules.get(ruleId.toString()));
                rulesMap.set(ruleId, rule);
              } catch (err) {
                console.error(`Failed to load rule ${ruleId}:`, err);
              }
            }),
          );
          setPreviewRules(rulesMap);
        }
      }
    } catch (err) {
      console.error('Failed to load preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const validateCurrentChanges = async (): Promise<ChangeRequestValidationResult | null> => {
    if (!formData.factType) {
      return null;
    }

    setValidationLoading(true);
    setValidationResult(null);
    try {
      // If ruleIds are provided (rule guide mode), send them; otherwise send factType
      const requestBody: any = ruleIds && ruleIds.length > 0
        ? { ruleIds }
        : { factType: formData.factType };
      
      const response = await fetchApi<ChangeRequestValidationResult>(api.changeRequests.validate(), {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      setValidationResult(response);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate change request';
      const failure: ChangeRequestValidationResult = { success: false, message };
      setValidationResult(failure);
      return failure;
    } finally {
      setValidationLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.factType || !formData.title) {
      return;
    }

    if (showValidation) {
      const validation = await validateCurrentChanges();
      if (!validation || !validation.success) {
        return;
      }
    }

    // Include ruleIds in formData if provided (rule guide mode)
    await onSave({
      ...formData,
      ruleIds: ruleIds && ruleIds.length > 0 ? ruleIds : undefined,
    } as any);
  };

  const handleValidateBuild = async () => {
    await validateCurrentChanges();
  };

  const renderPreviewChanges = () => {
    if (!showPreview) return null;

    if (previewLoading) {
      return (
        <div className="border border-outlineVariant rounded-md p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-text-secondary mt-2">Detecting changes...</p>
        </div>
      );
    }

    if (!previewChanges) {
      return (
        <div className="border border-outlineVariant rounded-md p-6 text-center text-sm text-text-tertiary">
          Select a fact type to preview changes
        </div>
      );
    }

    const includeIds: number[] = previewChanges.changes?.rulesToInclude || [];
    const excludeIds: number[] = previewChanges.changes?.rulesToExclude || [];

    const getFamilyId = (ruleId: number) => {
      const rule = previewRules.get(ruleId);
      if (rule && typeof rule.parentRuleId === 'number' && rule.parentRuleId > 0) {
        return rule.parentRuleId;
      }
      return ruleId;
    };

    const matchedExcludes = new Set<number>();
    const addedRuleIds: number[] = [];
    const updatedPairs: Array<{ newRuleId: number; oldRuleId: number | null }> = [];

    includeIds.forEach((ruleId) => {
      const familyId = getFamilyId(ruleId);
      const matchedExcludeId = excludeIds.find((excludeId) => {
        if (matchedExcludes.has(excludeId)) return false;
        return getFamilyId(excludeId) === familyId;
      });

      if (typeof matchedExcludeId === 'number') {
        matchedExcludes.add(matchedExcludeId);
        updatedPairs.push({ newRuleId: ruleId, oldRuleId: matchedExcludeId });
      } else {
        addedRuleIds.push(ruleId);
      }
    });

    const removedRuleIds = excludeIds.filter((ruleId) => !matchedExcludes.has(ruleId));
    const displayTotalChanges = addedRuleIds.length + updatedPairs.length + removedRuleIds.length;

    return (
      <>
        {/* Summary */}
        <div className="bg-surfaceContainerHigh dark:bg-surfaceContainerHighest border border-outlineVariant rounded-md p-3 mb-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-primary font-medium">Total Changes:</span>
            <span className="text-text-primary font-semibold">{displayTotalChanges}</span>
          </div>
          {displayTotalChanges > 0 && (
            <div className="mt-2 flex gap-4 text-xs">
              {(addedRuleIds.length > 0 || updatedPairs.length > 0) && (
                <span className="text-success">
                  ✓ {addedRuleIds.length + updatedPairs.length} Added/Updated
                </span>
              )}
              {removedRuleIds.length > 0 && (
                <span className="text-error">✗ {removedRuleIds.length} Removed</span>
              )}
            </div>
          )}
        </div>

        {/* Changes Table */}
        {displayTotalChanges > 0 ? (
          <div className="border border-outlineVariant rounded-md overflow-hidden">
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surfaceContainerHigh dark:bg-surfaceContainerHighest border-b border-outlineVariant sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-primary uppercase">
                      Change
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-primary uppercase">
                      Rule ID
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-primary uppercase">
                      Rule Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-primary uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outlineVariant">
                  {/* Added rules */}
                  {addedRuleIds.map((ruleId) => {
                    const rule = previewRules.get(ruleId);
                    return (
                      <tr
                        key={`added-${ruleId}`}
                        className="hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors"
                      >
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success dark:bg-success/20 dark:text-success-light">
                            Added
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-primary">#{ruleId}</td>
                        <td className="px-3 py-2 text-text-primary">
                          {rule?.ruleName || rule?.name || `Rule #${ruleId}`}
                        </td>
                        <td className="px-3 py-2">
                          {rule?.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success dark:bg-success/20 dark:text-success-light">
                              Active
                            </span>
                          ) : rule?.status === 'DRAFT' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-bg text-warning dark:bg-warning/20 dark:text-warning-light">
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surfaceContainerHigh text-text-secondary dark:bg-surfaceContainerHighest dark:text-text-tertiary">
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Updated rules */}
                  {updatedPairs.map(({ newRuleId, oldRuleId }) => {
                    const rule = previewRules.get(newRuleId);
                    return (
                      <tr
                        key={`updated-${newRuleId}-${oldRuleId}`}
                        className="hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors"
                      >
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-bg text-accent dark:bg-accent/20 dark:text-accent-light">
                            Updated
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-primary">#{newRuleId}</td>
                        <td className="px-3 py-2 text-text-primary">
                          {rule?.ruleName || rule?.name || `Rule #${newRuleId}`}
                        </td>
                        <td className="px-3 py-2">
                          {rule?.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success dark:bg-success/20 dark:text-success-light">
                              Active
                            </span>
                          ) : rule?.status === 'DRAFT' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-bg text-warning dark:bg-warning/20 dark:text-warning-light">
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surfaceContainerHigh text-text-secondary dark:bg-surfaceContainerHighest dark:text-text-tertiary">
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Removed rules */}
                  {removedRuleIds.map((ruleId) => {
                    const rule = previewRules.get(ruleId);
                    return (
                      <tr
                        key={`removed-${ruleId}`}
                        className="hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest transition-colors"
                      >
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-error-bg text-error dark:bg-error/20 dark:text-error-light">
                            Removed
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-primary">#{ruleId}</td>
                        <td className="px-3 py-2 text-text-primary">
                          {rule?.ruleName || rule?.name || `Rule #${ruleId}`}
                        </td>
                        <td className="px-3 py-2">
                          {rule?.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success dark:bg-success/20 dark:text-success-light">
                              Active
                            </span>
                          ) : rule?.status === 'DRAFT' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-bg text-warning dark:bg-warning/20 dark:text-warning-light">
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surfaceContainerHigh text-text-secondary dark:bg-surfaceContainerHighest dark:text-text-tertiary">
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border border-outlineVariant rounded-md p-6 text-center">
            <svg
              className="w-12 h-12 mx-auto text-text-muted mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-text-secondary">No changes detected</p>
            <p className="text-xs text-text-tertiary mt-1">All rules are same as deployed version</p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Target Object */}
      {!hideFactType && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Target Object</label>
          <select
            value={formData.factType}
            onChange={(e) => setFormData({ ...formData, factType: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring bg-surface text-text-primary"
          >
            {factTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      )}
      {hideFactType && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Target Object</label>
          <div className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md bg-surfaceContainerHigh text-text-primary">
            {formData.factType}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring bg-surface text-text-primary placeholder:text-text-muted"
          placeholder="e.g., Update Declaration Rules for Q1 2025"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-1.5 text-sm border border-outlineVariant rounded-md focus-ring bg-surface text-text-primary placeholder:text-text-muted"
          rows={4}
          placeholder="Describe what was changed and why (e.g., Added new high-risk rules for Q1 2025, Updated threshold values, Deactivated obsolete rules...)"
        />
      </div>

      {/* Preview Changes */}
      {showPreview && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Detected Changes (vs Last Deployed Version)
          </label>
          {renderPreviewChanges()}
        </div>
      )}

      {/* Validation Result */}
      {showValidation && validationResult && (
        <div
          className={`border rounded-md p-4 text-sm ${
            validationResult.success
              ? 'border-success/30 bg-success-bg dark:bg-success/10'
              : 'border-error/30 bg-error-bg dark:bg-error/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-semibold ${
                validationResult.success
                  ? 'text-success dark:text-success-light'
                  : 'text-error dark:text-error-light'
              }`}
            >
              {validationResult.success ? 'Validation succeeded' : 'Validation failed'}
            </span>
            {validationResult.releaseId && (
              <span className="text-xs text-text-tertiary">ReleaseId: {validationResult.releaseId}</span>
            )}
          </div>
          <p className="mt-1 text-text-primary">{validationResult.message}</p>
          {validationResult.error && !validationResult.success && (
            <p className="mt-2 text-xs text-error break-words">{validationResult.error}</p>
          )}
          <div className="mt-2 text-xs text-text-secondary flex flex-wrap gap-4">
            <span>
              Compiled rules: {validationResult.compiledRuleCount ?? previewChanges?.totalChanges ?? 0}
            </span>
            {typeof validationResult.rulesToInclude === 'number' && (
              <span>Include: {validationResult.rulesToInclude}</span>
            )}
            {typeof validationResult.rulesToExclude === 'number' && (
              <span>Exclude: {validationResult.rulesToExclude}</span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-4 border-t border-outlineVariant">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh focus-ring transition-colors cursor-pointer text-text-primary"
          >
            Cancel
          </button>
        )}
        {showValidation && (
          <button
            type="button"
            onClick={handleValidateBuild}
            disabled={previewLoading || validationLoading}
            className="px-4 py-2 text-sm border border-primary/30 text-primary rounded-md hover:bg-primary-bg dark:hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed focus-ring flex items-center gap-2 transition-colors"
          >
            {validationLoading && (
              <span className="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            )}
            Validate Build
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!formData.title || !formData.factType || previewLoading || validationLoading || loading}
          className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed focus-ring transition-colors cursor-pointer"
        >
          {loading ? 'Creating...' : 'Create Change Request'}
        </button>
      </div>
    </div>
  );
}

