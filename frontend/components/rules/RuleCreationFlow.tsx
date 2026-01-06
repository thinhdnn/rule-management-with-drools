'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Circle,
  ClipboardList,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { ManualRuleForm } from './ManualRuleForm';
import { AIRuleForm } from './AIRuleForm';
import { ChangeRequestForm } from '../change-requests/ChangeRequestForm';
import { api, fetchApi } from '@/lib/api';
import { useGuideDraft } from '@/lib/useGuideDraft';

type CreationMethod = 'manual' | 'ai';
type StepId = 'method' | 'build' | 'validate' | 'change' | 'done';

type Step = {
  id: StepId;
  title: string;
  description: string;
};

type Status = 'idle' | 'running' | 'success' | 'error';

const steps: Step[] = [
  {
    id: 'method',
    title: 'Choose method',
    description: 'Pick manual form or AI assistant.',
  },
  {
    id: 'build',
    title: 'Draft rule',
    description: 'Fill basics or let AI draft fields.',
  },
  {
    id: 'validate',
    title: 'Validate',
    description: 'Run quick check on sample data.',
  },
  {
    id: 'change',
    title: 'Change request',
    description: 'Plan deployment and reviewer.',
  },
  {
    id: 'done',
    title: 'Finish',
    description: 'Share and notify reviewers.',
  },
];

const stepLabel = (status: Status, current: boolean) => {
  if (status === 'success') {
    return 'Completed';
  }
  if (status === 'error') {
    return 'Needs attention';
  }
  if (current) {
    return 'In progress';
  }
  return 'Upcoming';
};

const statusIcon = (status: Status, current: boolean) => {
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (status === 'error') {
    return <AlertTriangle className="h-4 w-4 text-error" />;
  }
  if (current) {
    return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
  }
  return <Circle className="h-4 w-4 text-text-muted" />;
};

export function RuleCreationFlow() {
  const router = useRouter();
  const { saveDraft, loadDraft, clearDraft } = useGuideDraft();
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const loadDraftOnMount = async () => {
      const draft = await loadDraft();
      if (draft && !hasRestoredDraft) {
        setShowDraftBanner(true);
      }
    };
    loadDraftOnMount();
  }, []);

  const [method, setMethod] = useState<CreationMethod | null>(null);
  const [step, setStep] = useState<StepId>('method');
  const [savedRuleId, setSavedRuleId] = useState<number | null>(null);
  const [savedChangeRequestId, setSavedChangeRequestId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [validationStatus, setValidationStatus] = useState<Status>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [changeStatus, setChangeStatus] = useState<Status>('idle');
  const [savedFactType, setSavedFactType] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [selectedFactTypeForExamples, setSelectedFactTypeForExamples] = useState<string>('Declaration');
  const [selectedExamplePrompt, setSelectedExamplePrompt] = useState<string>('');
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{
    prompt: string;
    result: any | null;
    error?: string;
    saveError?: string;
    savedRuleId?: number;
  }>>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, phase: 'generating' as 'generating' | 'saving' });
  const [selectedExamplePrompts, setSelectedExamplePrompts] = useState<Set<number>>(new Set());
  const [hasNotifiedAdmin, setHasNotifiedAdmin] = useState(false);

  // Restore draft
  const restoreDraft = async () => {
    const draft = await loadDraft();
    if (draft) {
      if (draft.method) setMethod(draft.method);
      if (draft.step) setStep(draft.step);
      // Restore validation and change status to maintain step status
      if (draft.validationStatus) setValidationStatus(draft.validationStatus);
      if (draft.changeStatus) setChangeStatus(draft.changeStatus);
      // Don't restore validationMessage - it's UI state that can be regenerated
      if (draft.savedRuleId) setSavedRuleId(draft.savedRuleId);
      if (draft.batchResults) setBatchResults(draft.batchResults);
      if (draft.selectedFactTypeForExamples) setSelectedFactTypeForExamples(draft.selectedFactTypeForExamples);
      setShowDraftBanner(false);
      setHasRestoredDraft(true);
      // Note: Form components (ManualRuleForm/AIRuleForm) will auto-load their own drafts on mount
    }
  };

  // Auto-save draft when state changes
  useEffect(() => {
    if (hasRestoredDraft || step !== 'method') {
      saveDraft({
        method,
        step,
        // Save validationStatus and changeStatus to maintain step status when restoring
        validationStatus,
        changeStatus,
        // Don't save validationMessage - it's UI state that can be regenerated
        savedRuleId,
        batchResults: batchResults.length > 0 ? batchResults : undefined,
        selectedFactTypeForExamples: selectedFactTypeForExamples || undefined,
      });
    }
  }, [method, step, validationStatus, changeStatus, savedRuleId, batchResults, selectedFactTypeForExamples, hasRestoredDraft]);

  // Auto-notify admin when step reaches 'done'
  useEffect(() => {
    if (step === 'done' && savedChangeRequestId && !hasNotifiedAdmin && !notifying) {
      handleNotifyAdmin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, savedChangeRequestId, hasNotifiedAdmin]);

  const currentIndex = useMemo(
    () => steps.findIndex((item) => item.id === step),
    [step],
  );

  const stepStatus = (id: StepId): Status => {
    if (id === 'validate') {
      return validationStatus;
    }
    if (id === 'change') {
      return changeStatus;
    }
    if (id === 'done') {
      return step === 'done' ? 'success' : 'idle';
    }
    const idx = steps.findIndex((item) => item.id === id);
    if (idx < currentIndex) {
      return 'success';
    }
    return idx === currentIndex ? 'running' : 'idle';
  };

  const resetFlow = () => {
    setMethod(null);
    setStep('method');
    setSavedRuleId(null);
    setSavedChangeRequestId(null);
    setSavedFactType(null);
    setSaving(false);
    setNotifying(false);
    setValidationStatus('idle');
    setValidationMessage('');
    setChangeStatus('idle');
    setShowExamples(false);
    setBatchResults([]);
    setSelectedExamplePrompt('');
    setSelectedFactTypeForExamples('Declaration');
    setSelectedExamplePrompts(new Set());
    setHasNotifiedAdmin(false);
    clearDraft();
    // Also clear form drafts
    try {
      localStorage.removeItem('rule-guide-manual-form-draft');
      localStorage.removeItem('rule-guide-ai-form-draft');
    } catch (err) {
      console.warn('Failed to clear form drafts:', err);
    }
    setShowDraftBanner(false);
    setHasRestoredDraft(false);
  };

  const goToBuild = (selected: CreationMethod) => {
    setMethod(selected);
    setStep('build');
  };

  const handleManualSave = async (formData: any) => {
    setSaving(true);
    try {
      // Convert conditions to new ConditionsGroup format
      const validConditions = formData.conditions.filter(
        (c: any) => c.field && c.operator && c.value,
      );
      if (validConditions.length === 0) {
        throw new Error('Please add at least one valid condition');
      }

      // Build conditions structure (simplified - same logic as new rule page)
      let conditions: any = null;
      if (validConditions.length === 1) {
        conditions = {
          AND: [
            {
              field: validConditions[0].field,
              operator: validConditions[0].operator,
              value: validConditions[0].value,
            },
          ],
        };
      } else if (validConditions.length > 1) {
        // Simplified grouping - just wrap all in AND for now
        conditions = {
          AND: validConditions.map((c: any) => ({
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
        };
      }

      // Fetch metadata to convert numeric fields properly
      let metadata: any = null;
      try {
        metadata = await fetchApi(api.rules.metadata(formData.factType));
      } catch (err) {
        console.warn('Failed to fetch metadata for output conversion:', err);
      }

      const payload = {
        ruleName: formData.ruleName,
        label: formData.ruleName,
        factType: formData.factType,
        priority: 10,
        conditions,
        description: formData.ruleName,
        output: Object.fromEntries(
          Object.entries(formData.output).map(([key, value]) => {
            // Convert numeric fields
            if (metadata?.outputFields) {
              const field = metadata.outputFields.find((f: any) => f.name === key);
              if (field && (field.type === 'decimal' || field.type === 'number' || field.type === 'integer')) {
                return [key, value ? parseFloat(value as string) : null];
              }
            }
            return [key, value || null];
          }),
        ),
      };

      const data = await fetchApi(api.rules.create(), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSavedRuleId((data as any)?.id || null);
      setSavedFactType(formData.factType || 'Declaration');
      setStep('validate');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleAISave = async (generatedRule: any) => {
    setSaving(true);
    try {
      const savedRule = await fetchApi(api.rules.create(), {
        method: 'POST',
        body: JSON.stringify({
          ruleName: generatedRule.ruleName,
          label: generatedRule.description || generatedRule.ruleName,
          description: generatedRule.description || generatedRule.ruleName,
          factType: generatedRule.factType,
          priority: generatedRule.priority || 0,
          active: generatedRule.enabled !== false,
          conditions: generatedRule.conditions || [],
          output: generatedRule.output || {},
          generatedByAi: true,
        }),
      });

      setSavedRuleId((savedRule as any)?.id || null);
      setSavedFactType(generatedRule.factType || 'Declaration');
      setStep('validate');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const runValidation = async () => {
    setValidationStatus('running');
    setValidationMessage('');

    // Debug log
    console.log('[Validation] savedRuleId:', savedRuleId);
    console.log('[Validation] savedFactType:', savedFactType);

    // Get factType from saved rule, draft form data, or default
    let factType: string | null = savedFactType;
    
    // If we have saved rule, get factType from it (most reliable)
    if (savedRuleId) {
      try {
        const rule = await fetchApi(api.rules.get(savedRuleId));
        factType = (rule as any)?.factType || factType;
        console.log('[Validation] Got factType from saved rule:', factType);
      } catch (err) {
        console.warn('Failed to fetch rule for factType:', err);
      }
    }
    
    // If still no factType, try to get from draft form data
    if (!factType) {
      try {
        // Try to get from manual form draft
        const manualDraft = localStorage.getItem('rule-guide-manual-form-draft');
        if (manualDraft) {
          const draft = JSON.parse(manualDraft);
          if (draft.factType) {
            factType = draft.factType;
            console.log('[Validation] Got factType from manual form draft:', factType);
          }
        }
        
        // If not found, try AI form draft
        if (!factType) {
          const aiDraft = localStorage.getItem('rule-guide-ai-form-draft');
          if (aiDraft) {
            const draft = JSON.parse(aiDraft);
            if (draft.factType) {
              factType = draft.factType;
              console.log('[Validation] Got factType from AI form draft:', factType);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to get factType from draft:', err);
      }
    }
    
    // Default to Declaration if still not found
    if (!factType) {
      factType = 'Declaration';
      console.log('[Validation] Using default factType: Declaration');
    }

    // Collect all rule IDs from batchResults (draft rules) or savedRuleId
    // Priority: batchResults > savedRuleId > factType
    let requestBody: any;
    const savedRuleIds = batchResults
      .filter((r) => r && r.savedRuleId)
      .map((r) => r.savedRuleId!)
      .filter((id): id is number => id !== undefined);
    
    if (savedRuleIds.length > 0) {
      // Validate all draft rules from batchResults
      console.log('[Validation] Calling API with ruleIds from batchResults:', savedRuleIds);
      requestBody = { ruleIds: savedRuleIds };
    } else if (savedRuleId) {
      // Validate single saved rule
      console.log('[Validation] Calling API with ruleId:', savedRuleId);
      requestBody = { ruleIds: [savedRuleId] };
    } else {
      // Validate all changes for factType (change request mode)
      console.log('[Validation] Calling API with factType:', factType);
      requestBody = { factType };
    }

    // Otherwise, call real validation API
    try {
      const response = await fetchApi(api.changeRequests.validate(), {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      console.log('[Validation] API response:', response);

      const validationResponse = response as any;
      if (validationResponse.success) {
        console.log('[Validation] Validation passed');
        setValidationStatus('success');
        setValidationMessage(
          validationResponse.message || '✓ No issues found. Ready for change request.',
        );
      } else {
        console.log('[Validation] Validation failed:', validationResponse.message || validationResponse.error);
        setValidationStatus('error');
        setValidationMessage(
          validationResponse.message ||
            validationResponse.error ||
            'Validation failed. Please check your rule configuration.',
        );
      }
    } catch (err: any) {
      console.error('[Validation] API error:', err);
      setValidationStatus('error');
      setValidationMessage(
        err?.message ||
          err?.error ||
          'Failed to validate rule. Please try again.',
      );
    }
  };

  const handleChangeRequest = async (formData: { factType: string; title: string; description: string; ruleIds?: number[] }) => {
    setChangeStatus('running');
    setValidationMessage('');

    try {
      const payload: any = {
        factType: formData.factType,
        title: formData.title,
        description: formData.description,
      };
      
      // Include ruleIds if provided (rule guide mode)
      if (formData.ruleIds && formData.ruleIds.length > 0) {
        payload.ruleIds = formData.ruleIds;
      }

      const response = await fetchApi<any>(api.changeRequests.create(), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Save change request ID if available
      if (response?.id) {
        setSavedChangeRequestId(response.id);
      }

      setChangeStatus('success');
      setStep('done');
      setValidationMessage('Change request created successfully.');
    } catch (err: any) {
      setChangeStatus('error');
      setValidationMessage(
        err?.message || err?.error || 'Failed to create change request. Please try again.',
      );
    }
  };

  const handleNotifyAdmin = async () => {
    if (!savedChangeRequestId || hasNotifiedAdmin) {
      return;
    }

    setNotifying(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
        : '/api/v1';
      const response = await fetchApi<any>(
        `${API_BASE}/change-requests/${savedChangeRequestId}/notify-admin`,
        {
          method: 'POST',
        }
      );

      if (response?.success) {
        setHasNotifiedAdmin(true);
        setValidationMessage(
          response.message || `Notifications sent to ${response.notificationCount || 0} administrator(s)`
        );
      }
    } catch (err: any) {
      setValidationMessage(
        err?.message || err?.error || 'Failed to notify administrators. Please try again.'
      );
    } finally {
      setNotifying(false);
    }
  };

  const renderStepper = () => (
    <ol className="space-y-3 rounded-lg border border-outlineVariant bg-surface p-4">
      {steps.map((item, idx) => {
        const current = idx === currentIndex;
        const status = stepStatus(item.id);

        return (
          <li
            key={item.id}
            className="flex items-start gap-3 rounded-md p-2 transition-colors"
          >
            <div className="mt-0.5">{statusIcon(status, current)}</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {item.title}
                </span>
                <span className="text-xs text-text-tertiary">
                  {stepLabel(status, current)}
                </span>
              </div>
              <p className="text-sm text-text-secondary">{item.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );

  // Helper functions to generate random values for examples
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomFloat = (min: number, max: number, decimals: number = 0) => {
    const value = Math.random() * (max - min) + min;
    return decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.floor(value);
  };

  // Generate example prompts for Declaration
  const generateDeclarationExamplePrompts = () => {
    const weight = randomInt(100, 10000);
    const invoiceAmount1 = randomInt(50000, 300000);
    const invoiceAmount2 = randomInt(50000, 300000);
    const invoiceAmount3 = randomInt(50000, 300000);
    const hsCode = randomInt(100000, 999999);
    const packageQty1 = randomInt(10, 500);
    const packageQty2 = randomInt(10, 200);
    const dutyRate = randomFloat(5, 30, 1);
    const insuranceAmount1 = randomInt(500, 5000);
    const insuranceAmount2 = randomInt(1000, 10000);
    const weight2 = randomInt(100, 2000);
    const freightAmount = randomInt(5000, 50000);
    const quantity = randomInt(100, 5000);
    const unitPrice = randomFloat(1, 20, 2);
    const score1 = randomInt(65, 95);
    const score2 = randomInt(70, 95);
    const score3 = randomInt(70, 90);
    const score4 = randomInt(65, 85);
    const score5 = randomInt(75, 95);
    const score6 = randomInt(60, 80);
    const score7 = randomInt(70, 90);
    const score8 = randomInt(85, 95);
    const score9 = randomInt(70, 85);
    const score10 = randomInt(65, 80);
    const score11 = randomInt(80, 95);
    const score12 = randomInt(75, 90);

    return [
      {
        prompt: `If totalGrossMassMeasure is greater than ${weight}kg then set score to ${score1} and flag as HIGH_WEIGHT`,
        description: 'Total gross mass validation',
      },
      {
        prompt: `If invoiceAmount is greater than ${invoiceAmount1} USD and countryOfExportId equals CN, then set score to ${score2} and flag as HIGH_RISK`,
        description: 'High-value import from China',
      },
      {
        prompt: `If any goods item has hsId equals ${hsCode} then set score to ${score3} and action is REVIEW`,
        description: 'HS code specific validation',
      },
      {
        prompt: `If transportMeansModeCode equals 1 and packageQuantity is greater than ${packageQty1}, then set score to ${score4} and flag as SUSPICIOUS_QUANTITY`,
        description: 'Sea transport package validation',
      },
      {
        prompt: `If any goods item has originCountryId equals CN and dutyRate is greater than ${dutyRate}, then set score to ${score5} and action is REVIEW`,
        description: 'High duty rate from China',
      },
      {
        prompt: `If incotermCode equals CIF and totalInsuranceAmount is less than ${insuranceAmount1}, then set score to ${score6} and flag as INSUFFICIENT_INSURANCE`,
        description: 'CIF insurance validation',
      },
      {
        prompt: `If packageQuantity is greater than ${packageQty2} and totalGrossMassMeasure is less than ${weight2}, then set score to ${score7} and flag as WEIGHT_MISMATCH`,
        description: 'Package weight validation',
      },
      {
        prompt: 'If consignorCountryId equals CN and consigneeCountryId equals VN and countryOfExportId not equals CN, then set score to 90 and flag as COUNTRY_MISMATCH',
        description: 'Country of export mismatch',
      },
      {
        prompt: `If officeId equals VNHPH and invoiceAmount is greater than ${invoiceAmount2}, then set score to ${score9} and action is REVIEW`,
        description: 'Office-specific high-value check',
      },
      {
        prompt: `If invoiceCurrencyCode not equals USD and invoiceAmount is greater than ${invoiceAmount3}, then set score to ${score10} and flag as NON_STANDARD_CURRENCY`,
        description: 'Currency validation',
      },
      {
        prompt: `If any goods item has quantityQuantity is greater than ${quantity} and unitPriceAmount is less than ${unitPrice}, then set score to ${score11} and flag as SUSPICIOUS_PRICE`,
        description: 'Low unit price validation',
      },
      {
        prompt: `If totalFreightAmount is greater than ${freightAmount}, totalInsuranceAmount is greater than ${insuranceAmount2} and goods item has hsId equals ${hsCode}, then set score to ${score12} and flag as HIGH_FREIGHT_COST`,
        description: 'High freight and insurance cost check',
      },
    ];
  };

  // Generate example prompts for CargoReport
  const generateCargoReportExamplePrompts = () => {
    const containerWeight = randomInt(10000, 50000);
    const packageCount = randomInt(100, 1000);
    const cargoWeight = randomInt(15000, 40000);
    const score1 = randomInt(80, 95);
    const score2 = randomInt(70, 85);

    return [
      {
        prompt: `If container total weight exceeds ${containerWeight}kg then flag as OVERWEIGHT with score ${score1}`,
        description: 'Container weight check',
      },
      {
        prompt: `If number of packages in container is greater than ${packageCount} then REVIEW with score ${score2}`,
        description: 'Package count validation',
      },
      {
        prompt: 'If transport equipment seal ID contains "DAMAGED" then reject with score 100',
        description: 'Seal integrity check',
      },
      {
        prompt: `If consignment total cargo gross weight is over ${cargoWeight}kg and origin country is high-risk, then flag as SUSPICIOUS_CARGO`,
        description: 'Combined risk assessment',
      },
    ];
  };

  // Generate example prompts for Traveler
  const generateTravelerExamplePrompts = () => {
    const baggageWeight = randomFloat(20, 50, 1);
    const age = randomInt(18, 65);
    const score1 = randomInt(75, 95);
    const score2 = randomInt(70, 90);
    const score3 = randomInt(80, 95);
    const score4 = randomInt(65, 85);
    const score5 = randomInt(70, 90);

    return [
      {
        prompt: `If baggageWeightMeasure is greater than ${baggageWeight}kg then set score to ${score1} and flag as EXCESS_BAGGAGE`,
        description: 'Baggage weight validation',
      },
      {
        prompt: `If inadmissibleIndicatorCode equals Y then set score to ${score2} and action is REJECT`,
        description: 'Inadmissible passenger check',
      },
      {
        prompt: `If transitIndicatorCode equals Y and nationalityCountryID not equals VN then set score to ${score3} and flag as TRANSIT_RISK`,
        description: 'Transit passenger validation',
      },
      {
        prompt: `If travelDocumentExpiryDate is less than 6 months from today then set score to ${score4} and action is REVIEW`,
        description: 'Passport expiry validation',
      },
      {
        prompt: `If visaExpiryDate is less than 30 days from today then set score to ${score5} and flag as VISA_EXPIRING`,
        description: 'Visa expiry check',
      },
      {
        prompt: 'If deporteeIndicatorCode equals Y then set score to 100 and action is REJECT',
        description: 'Deportee check',
      },
      {
        prompt: `If unaccompaniedMinorIndicatorCode equals Y and age is less than ${age} then set score to 85 and action is REVIEW`,
        description: 'Unaccompanied minor validation',
      },
      {
        prompt: 'If nationalityCountryID equals high-risk country and transitIndicatorCode equals Y then set score to 90 and flag as HIGH_RISK_TRANSIT',
        description: 'High-risk transit passenger',
      },
    ];
  };

  // Get example prompts for current fact type
  const examplePrompts = useMemo(() => {
    if (selectedFactTypeForExamples === 'Declaration') {
      return generateDeclarationExamplePrompts();
    } else if (selectedFactTypeForExamples === 'CargoReport') {
      return generateCargoReportExamplePrompts();
    } else if (selectedFactTypeForExamples === 'Traveler') {
      return generateTravelerExamplePrompts();
    }
    return [];
  }, [selectedFactTypeForExamples]);

  // Reset selection when fact type changes
  useEffect(() => {
    setSelectedExamplePrompts(new Set());
  }, [selectedFactTypeForExamples]);

  // Handle generate all examples
  const handleGenerateAll = async () => {
    const prompts = examplePrompts;
    if (prompts.length === 0) return;

    // If no prompts are selected, select all; otherwise use selected ones
    const selectedIndices = selectedExamplePrompts.size > 0
      ? Array.from(selectedExamplePrompts)
      : prompts.map((_, idx) => idx);
    
    const promptsToGenerate = selectedIndices.map(idx => prompts[idx]);
    if (promptsToGenerate.length === 0) return;

    setBatchGenerating(true);
    setBatchSaving(false);
    setBatchResults([]);
    setBatchProgress({ current: 0, total: promptsToGenerate.length, phase: 'generating' });

    let results: Array<{
      prompt: string;
      result: any | null;
      error?: string;
      saveError?: string;
      savedRuleId?: number;
    }> = [];

    try {
      // Prepare batch request
      const batchRequest = {
        requests: promptsToGenerate.map(({ prompt }) => ({
          naturalLanguageInput: prompt,
          factType: selectedFactTypeForExamples,
          additionalContext: undefined,
          previewOnly: true,
        })),
        factType: selectedFactTypeForExamples,
        additionalContext: undefined,
      };

      const batchResponse = await fetchApi<{
        success: boolean;
        total: number;
        successful: number;
        failed: number;
        results: any[];
      }>(api.rules.aiGenerateBatch(), {
        method: 'POST',
        body: JSON.stringify(batchRequest),
      });

      // Map results back to prompts (maintain original indices)
      const originalResults = new Array(prompts.length).fill(null);
      selectedIndices.forEach((originalIdx, batchIdx) => {
        const response = batchResponse.results[batchIdx];
        if (!response) {
          originalResults[originalIdx] = {
            prompt: prompts[originalIdx].prompt,
            result: null,
            error: 'No response received for this rule',
          };
        } else if (response.errorMessage) {
          originalResults[originalIdx] = {
            prompt: prompts[originalIdx].prompt,
            result: response,
            error: response.errorMessage,
          };
        } else {
          originalResults[originalIdx] = {
            prompt: prompts[originalIdx].prompt,
            result: response,
          };
        }
      });
      results = originalResults;

      setBatchResults(results);
      setBatchProgress({ current: promptsToGenerate.length, total: promptsToGenerate.length, phase: 'generating' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate rules';
      console.error('Error in batch generation:', errorMessage, err);

      // Mark selected ones as failed
      const originalResults = new Array(prompts.length).fill(null);
      selectedIndices.forEach((originalIdx) => {
        originalResults[originalIdx] = {
          prompt: prompts[originalIdx].prompt,
          result: null,
          error: errorMessage,
        };
      });
      results = originalResults;
      setBatchResults(results);
    }

    // Automatically save all valid rules
    const validResults = results.filter(
      (r) => r && r.result?.success && r.result?.validation?.valid && r.result?.generatedRule,
    );

    if (validResults.length > 0) {
      setBatchSaving(true);
      setBatchProgress({ current: 0, total: validResults.length, phase: 'saving' });

      const updatedResults = [...results];

      try {
        // Prepare rules array for batch save
        const rulesToSave = validResults.map((item) => {
          const ruleToSave = item.result!.generatedRule!;
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
          };
        });

        // Call batch save API
        const batchResponse = await fetchApi<{
          success: boolean;
          total: number;
          successful: number;
          failed: number;
          results: Array<{
            index: number;
            ruleName: string;
            success: boolean;
            ruleId?: number;
            error?: string;
            errorType?: string;
          }>;
        }>(api.rules.batchCreate(), {
          method: 'POST',
          body: JSON.stringify({ rules: rulesToSave }),
        });

        // Update results based on batch save response
        batchResponse.results.forEach((result) => {
          if (result.index >= 0 && result.index < validResults.length) {
            const correspondingValidResult = validResults[result.index];
            if (!correspondingValidResult) return;
            
            const resultIndex = updatedResults.findIndex((r) => r && r.prompt === correspondingValidResult.prompt);

            if (resultIndex >= 0) {
              if (result.success && result.ruleId) {
                updatedResults[resultIndex] = {
                  ...updatedResults[resultIndex],
                  savedRuleId: result.ruleId,
                  saveError: undefined,
                };
              } else {
                updatedResults[resultIndex] = {
                  ...updatedResults[resultIndex],
                  saveError: result.error || 'Failed to save rule',
                };
              }
            }
          }
        });

        setBatchResults([...updatedResults]);
        setBatchProgress({ current: validResults.length, total: validResults.length, phase: 'saving' });

        // If we have saved rules, navigate to draft rules view
        const savedCount = updatedResults.filter((r) => r && r.savedRuleId).length;
        if (savedCount > 0) {
          setMethod('ai');
          setStep('build');
          setShowExamples(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to save rules';
        console.error('Error calling batch save API:', err);

        validResults.forEach((item) => {
          const resultIndex = updatedResults.findIndex((r) => r.prompt === item.prompt);
          if (resultIndex >= 0) {
            updatedResults[resultIndex] = {
              ...updatedResults[resultIndex],
              saveError: errorMessage,
            };
          }
        });
        setBatchResults([...updatedResults]);
      }
    }

    setBatchGenerating(false);
    setBatchSaving(false);
  };

  // Load fact types for examples
  const [factTypes, setFactTypes] = useState<string[]>([]);
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

  const renderMethodStep = () => {
    if (showExamples) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              📝 Example Prompts for {selectedFactTypeForExamples}:
            </h3>
            <button
              type="button"
              onClick={() => setShowExamples(false)}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              ← Back
            </button>
          </div>

          {/* Fact Type Selector and Generate All Button */}
          <div className="flex flex-col gap-3">
            {factTypes.length > 0 && (
              <div className="flex items-center gap-2 bg-surface border border-outlineVariant rounded-md p-2">
                <div className="flex gap-1 flex-wrap">
                  {factTypes.map((factType) => (
                    <button
                      key={factType}
                      type="button"
                      onClick={() => setSelectedFactTypeForExamples(factType)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        selectedFactTypeForExamples === factType
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-surfaceContainerHigh text-text-secondary hover:bg-surfaceContainerHighest'
                      }`}
                    >
                      {factType}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 self-start flex-wrap sm:flex-nowrap">
              {examplePrompts.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedExamplePrompts.size === examplePrompts.length) {
                        setSelectedExamplePrompts(new Set());
                      } else {
                        setSelectedExamplePrompts(new Set(examplePrompts.map((_, idx) => idx)));
                      }
                    }}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer px-2 py-1 whitespace-nowrap"
                  >
                    {selectedExamplePrompts.size === examplePrompts.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedExamplePrompts.size > 0 && (
                    <span className="text-sm text-text-secondary whitespace-nowrap">
                      ({selectedExamplePrompts.size} selected)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateAll}
                    disabled={batchGenerating || batchSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-secondary to-primary text-white text-sm rounded-lg hover:from-secondary-light hover:to-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    {batchGenerating || batchSaving ? (
                      <>
                        <RefreshCw className="animate-spin" size={16} />
                        <span>
                          {batchProgress.phase === 'generating'
                            ? `Generating... (${batchProgress.current}/${batchProgress.total})`
                            : `Saving... (${batchProgress.current}/${batchProgress.total})`}
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>
                          Generate & Save All
                          {selectedExamplePrompts.size > 0 ? ` (${selectedExamplePrompts.size})` : ` (${examplePrompts.length})`}
                        </span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Batch Results */}
          {batchResults.length > 0 && (
            <div className="bg-surface rounded-lg border border-outlineVariant p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    📊 Batch Generation Results
                  </h3>
                  <p className="text-xs text-text-tertiary mt-1">
                    Total: {batchResults.length} | Generated:{' '}
                    <span className="text-success font-medium">
                      {batchResults.filter((r) => r && r.result?.success && r.result?.validation?.valid).length}
                    </span>{' '}
                    | Saved:{' '}
                    <span className="text-success font-medium">
                      {batchResults.filter((r) => r && r.savedRuleId).length}
                    </span>{' '}
                    | Failed:{' '}
                    <span className="text-error font-medium">
                      {batchResults.filter(
                        (r) => r && (r.error || r.saveError || (r.result && !(r.result.success && r.result.validation?.valid))),
                      ).length}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBatchResults([]);
                    setBatchProgress({ current: 0, total: 0, phase: 'generating' });
                  }}
                  className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {batchResults.map((item, idx) => {
                  if (!item) return null;
                  
                  const success = item.result?.success && item.result?.validation?.valid && !item.saveError;
                  const failed = item.error || item.saveError || (item.result && !success);

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-sm ${
                        success && !item.saveError
                          ? 'bg-success-bg border-success/30'
                          : failed
                            ? 'bg-error-bg border-error/30'
                            : 'bg-warning-bg border-warning/30'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {success && !item.saveError ? (
                          <CheckCircle2 className="text-success shrink-0 mt-0.5" size={16} />
                        ) : failed ? (
                          <AlertTriangle className="text-error shrink-0 mt-0.5" size={16} />
                        ) : (
                          <AlertTriangle className="text-warning shrink-0 mt-0.5" size={16} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-tertiary mb-1">
                            #{idx + 1} - {examplePrompts[idx]?.description || 'Unknown'}
                          </p>
                          <p className="text-sm text-text-primary mb-1 line-clamp-2">{item.prompt}</p>
                          {item.error && (
                            <p className="text-xs text-error mt-1">Generation Error: {item.error}</p>
                          )}
                          {item.saveError && (
                            <p className="text-xs text-error mt-1">Save Error: {item.saveError}</p>
                          )}
                          {item.savedRuleId && (
                            <p className="text-xs text-success mt-1">✓ Saved (ID: {item.savedRuleId})</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Example Prompts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {examplePrompts.map((example, idx) => {
              const batchResult = batchResults[idx];
              const isGenerated = batchResult?.result;
              const isSuccess = batchResult?.result?.success && batchResult?.result?.validation?.valid;
              const isSaved = !!batchResult?.savedRuleId;
              const isSelected = selectedExamplePrompts.has(idx);

              return (
                <div
                  key={idx}
                  className={`text-left p-4 border rounded-lg transition-colors group ${
                    isSaved
                      ? 'border-success/50 bg-success-bg hover:bg-success-bg/80'
                      : isGenerated
                        ? isSuccess
                          ? 'border-primary/50 bg-primary-bg hover:bg-primary-bg/80'
                          : 'border-error/50 bg-error-bg hover:bg-error-bg/80'
                        : isSelected
                          ? 'border-primary bg-primary-bg/50 hover:bg-primary-bg/80'
                          : 'border-outlineVariant hover:bg-surfaceContainerHigh dark:hover:bg-surfaceContainerHighest hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        const newSet = new Set(selectedExamplePrompts);
                        if (e.target.checked) {
                          newSet.add(idx);
                        } else {
                          newSet.delete(idx);
                        }
                        setSelectedExamplePrompts(newSet);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p
                          className={`text-sm line-clamp-2 flex-1 ${
                            isSaved
                              ? 'text-success group-hover:text-success'
                              : isGenerated
                                ? isSuccess
                                  ? 'text-primary group-hover:text-primary'
                                  : 'text-error group-hover:text-error'
                                : 'text-text-primary group-hover:text-primary'
                          }`}
                        >
                          {example.prompt}
                        </p>
                        {isSaved && <CheckCircle2 className="text-success shrink-0" size={16} />}
                        {isGenerated && !isSuccess && <AlertTriangle className="text-error shrink-0" size={16} />}
                      </div>
                      <p className="text-xs text-text-tertiary">{example.description}</p>
                      {batchResult?.savedRuleId && (
                        <p className="text-xs text-success mt-1">✓ Saved (ID: {batchResult.savedRuleId})</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // Set the example prompt and switch to AI form
                      setSelectedExamplePrompt(example.prompt);
                      setMethod('ai');
                      setStep('build');
                      setShowExamples(false);
                    }}
                    className="w-full mt-2 px-3 py-1.5 text-xs bg-surfaceContainerHigh hover:bg-surfaceContainerHighest rounded-md transition-colors cursor-pointer"
                  >
                    Use this prompt
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Pick how you want to start. You can switch later.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => goToBuild('manual')}
            className="flex h-full flex-col gap-2 rounded-lg border border-outlineVariant bg-surface p-4 text-left transition-colors hover:border-primary focus-ring cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Create manually</span>
            </div>
            <p className="text-sm text-text-secondary">
              Structured form with guardrails and previews.
            </p>
          </button>

          <button
            type="button"
            onClick={() => goToBuild('ai')}
            className="flex h-full flex-col gap-2 rounded-lg border border-outlineVariant bg-surface p-4 text-left transition-colors hover:border-primary focus-ring cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              <span className="text-sm font-semibold">Use AI assistant</span>
            </div>
            <p className="text-sm text-text-secondary">
              Describe your intent; we draft the rule for you.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setShowExamples(true)}
            className="flex h-full flex-col gap-2 rounded-lg border border-outlineVariant bg-surface p-4 text-left transition-colors hover:border-primary focus-ring cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-secondary" />
              <span className="text-sm font-semibold">AI Example Prompts</span>
            </div>
            <p className="text-sm text-text-secondary">
              Browse example prompts by fact type.
            </p>
          </button>
        </div>
      </div>
    );
  };

  const renderManualBuild = () => (
    <ManualRuleForm
      onSave={handleManualSave}
      onCancel={resetFlow}
      loading={saving}
    />
  );

  const renderAiBuild = () => {
    // Clear selected prompt after passing to form (so it doesn't persist on next render)
    const promptToUse = selectedExamplePrompt;
    if (promptToUse) {
      // Clear it after a brief moment to allow form to initialize
      setTimeout(() => setSelectedExamplePrompt(''), 100);
    }

    return (
      <AIRuleForm
        onSave={handleAISave}
        onCancel={resetFlow}
        loading={saving}
        initialNaturalInput={promptToUse}
        initialFactType={selectedFactTypeForExamples}
      />
    );
  };

  const renderValidate = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-outlineVariant bg-surface p-4">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-text-primary">
            Run quick check on sample data
          </p>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          We will simulate validation and return guidance. Toggle failure to see
          the fallback path.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runValidation}
            disabled={validationStatus === 'running'}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-ring disabled:opacity-50"
          >
            {validationStatus === 'running' ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Run validation
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStep('change')}
            className="text-sm text-text-secondary underline transition-colors hover:text-text-primary"
          >
            Skip validation
          </button>
        </div>
      </div>

      {validationMessage && (
        <div
          className={`rounded-md border p-3 text-sm ${
            validationStatus === 'error'
              ? 'border-error/40 bg-error-bg text-error'
              : 'border-success/40 bg-success-bg text-success'
          }`}
        >
          {validationMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep('change')}
          disabled={validationStatus !== 'success'}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-ring disabled:opacity-50"
        >
          <ClipboardList className="h-4 w-4" />
          Continue to change request
        </button>
        <button
          type="button"
          onClick={() => setStep('build')}
          className="text-sm text-text-secondary underline transition-colors hover:text-text-primary"
        >
          Edit draft
        </button>
      </div>
    </div>
  );

  const renderChangeRequest = () => {
    // Determine factType from savedRuleId, savedFactType, or default
    const factType = savedFactType || 'Declaration';
    
    // Collect all rule IDs from batchResults (draft rules) or savedRuleId
    const savedRuleIds = batchResults
      .filter((r) => r && r.savedRuleId)
      .map((r) => r.savedRuleId!)
      .filter((id): id is number => id !== undefined);
    const ruleIds = savedRuleIds.length > 0 ? savedRuleIds : (savedRuleId ? [savedRuleId] : undefined);
    
    return (
      <div className="space-y-4">
        <ChangeRequestForm
          initialFactType={factType}
          onSave={handleChangeRequest}
          onCancel={() => setStep('validate')}
          loading={changeStatus === 'running'}
          showPreview={true}
          showValidation={true}
          hideFactType={true}
          ruleIds={ruleIds}
        />

        {validationMessage && (
          <div
            className={`rounded-md border p-3 text-sm ${
              changeStatus === 'error'
                ? 'border-error/40 bg-error-bg text-error'
                : 'border-success/40 bg-success-bg text-success'
            }`}
          >
            {validationMessage}
          </div>
        )}
      </div>
    );
  };

  const renderDone = () => {
    const firstSavedRuleId = savedRuleId ?? batchResults.find((r) => r?.savedRuleId)?.savedRuleId ?? null;

    const handleViewRule = () => {
      if (firstSavedRuleId) {
        router.push(`/rules/${firstSavedRuleId}`);
      } else {
        router.push('/rules');
      }
    };

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-success/40 bg-success-bg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-sm font-semibold text-success">
              Rule created and change request submitted.
            </p>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {notifying ? (
              'Sending notifications to administrators...'
            ) : hasNotifiedAdmin ? (
              'Administrators have been notified automatically.'
            ) : (
              'Administrators will be notified automatically.'
            )}
          </p>
        </div>
        {validationMessage && (
          <div className="rounded-lg border border-outlineVariant bg-surface p-4">
            <p className="text-sm text-text-secondary">{validationMessage}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleViewRule}
            className="inline-flex items-center gap-2 rounded-md border border-outlineVariant px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surfaceContainerHigh focus-ring"
          >
            <ShieldCheck className="h-4 w-4" />
            View rule details
          </button>
          <button
            type="button"
            onClick={resetFlow}
            className="text-sm text-text-secondary underline transition-colors hover:text-text-primary"
          >
            Create another
          </button>
        </div>
      </div>
    );
  };

  const renderDraftRulesTable = () => {
    const savedRules = batchResults.filter((r) => r && r.savedRuleId);
    if (savedRules.length === 0) {
      return (
        <div className="text-center py-8 text-text-secondary">
          <p>No draft rules created yet.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Draft Rules</h2>
            <p className="text-sm text-text-secondary mt-1">
              {savedRules.length} rule(s) created from example prompts
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBatchResults([]);
              setMethod(null);
              setStep('method');
            }}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            Create more rules
          </button>
        </div>

        <div className="rounded-lg border border-outlineVariant bg-surface overflow-hidden">
          <table className="w-full">
            <thead className="bg-surfaceContainerHigh">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                  Rule Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                  Target Object
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outlineVariant">
              {savedRules.map((item, idx) => {
                const rule = item.result?.generatedRule;
                if (!rule) return null;

                return (
                  <tr key={item.savedRuleId || idx} className="hover:bg-surfaceContainerHigh transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{rule.ruleName}</span>
                        {item.savedRuleId && (
                          <span className="text-xs text-text-tertiary">(ID: {item.savedRuleId})</span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-xs text-text-tertiary mt-1 line-clamp-1">{rule.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">{rule.factType || selectedFactTypeForExamples}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-success-bg text-success">
                        <CheckCircle2 size={12} />
                        Saved
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.savedRuleId && (
                          <button
                            type="button"
                            onClick={() => {
                              router.push(`/rules/${item.savedRuleId}`);
                            }}
                            className="text-sm text-primary hover:underline cursor-pointer"
                          >
                            View
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            // Set this rule for validation
                            setSavedRuleId(item.savedRuleId || null);
                            setSavedFactType(rule.factType || selectedFactTypeForExamples);
                            setStep('validate');
                          }}
                          className="text-sm text-text-secondary hover:text-text-primary cursor-pointer"
                        >
                          Validate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep('validate')}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-ring"
          >
            <ShieldCheck className="h-4 w-4" />
            Validate All Rules
          </button>
          <button
            type="button"
            onClick={() => {
              setBatchResults([]);
              setMethod(null);
              setStep('method');
            }}
            className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh focus-ring transition-colors cursor-pointer"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (step === 'method') return renderMethodStep();
    if (step === 'build') {
      // If we have batch results with saved rules, show draft rules table
      const hasSavedRules = batchResults.some((r) => r && r.savedRuleId);
      if (hasSavedRules && method === 'ai') {
        return renderDraftRulesTable();
      }
      return method === 'ai' ? renderAiBuild() : renderManualBuild();
    }
    if (step === 'validate') return renderValidate();
    if (step === 'change') return renderChangeRequest();
    return renderDone();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {renderStepper()}
      <div className="space-y-6">
        <header className="rounded-lg border border-outlineVariant bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Guided rule creation
              </p>
              <p className="text-sm text-text-secondary">
                Clear steps from method choice to change request and handoff.
              </p>
            </div>
            <button
              type="button"
              onClick={resetFlow}
              className="text-sm text-text-secondary underline transition-colors hover:text-text-primary"
            >
              Reset flow
            </button>
          </div>
        </header>
        
        {/* Draft Restore Banner */}
        {showDraftBanner && (
          <div className="rounded-lg border border-primary/30 bg-primary-bg p-4">
            <div className="flex items-start gap-3">
              <RotateCcw className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">
                  Draft found
                </p>
                <p className="text-sm text-text-secondary mt-1">
                  You have an unfinished guide draft. Would you like to continue where you left off?
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={restoreDraft}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 focus-ring transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore draft
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDraftBanner(false);
                      clearDraft();
                    }}
                    className="px-4 py-2 text-sm border border-outlineVariant rounded-md hover:bg-surfaceContainerHigh focus-ring transition-colors cursor-pointer"
                  >
                    Start fresh
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="rounded-lg border border-outlineVariant bg-surface p-4">
          {renderContent()}
        </section>
      </div>
    </div>
  );
}

type InfoPillProps = {
  label: string;
  value: string;
};

function InfoPill({ label, value }: InfoPillProps) {
  if (!value) return null;

  return (
    <div className="rounded-md border border-outlineVariant bg-surface px-3 py-2">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

