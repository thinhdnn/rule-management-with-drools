import { useEffect, useRef } from 'react';
import { api, fetchApi } from './api';

type BatchResult = {
  prompt: string;
  result: any | null;
  error?: string;
  saveError?: string;
  savedRuleId?: number;
};

type GuideDraftState = {
  method: 'manual' | 'ai' | null;
  step: 'method' | 'build' | 'validate' | 'change' | 'done';
  changeRequest: {
    environment: string;
    window: string;
    reviewer: string;
  };
  validationStatus: 'idle' | 'running' | 'success' | 'error';
  validationMessage: string;
  changeStatus: 'idle' | 'running' | 'success' | 'error';
  savedRuleId?: number | null;
  batchResults?: BatchResult[];
  selectedFactTypeForExamples?: string;
};

type GuideDraftResponse = {
  id: string;
  step: string;
  method: string | null;
  flowState: {
    changeRequest?: {
      environment: string;
      window: string;
      reviewer: string;
    };
    validationStatus?: string;
    validationMessage?: string;
    changeStatus?: string;
    batchResults?: BatchResult[];
    selectedFactTypeForExamples?: string;
  } | null;
  manualFormData: any;
  aiFormData: any;
  savedRuleId?: number | null;
  createdAt: string;
  updatedAt: string;
};

export function useGuideDraft() {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveDraft = async (state: Partial<GuideDraftState>) => {
    // Debounce saves to avoid too many API calls
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = {
          step: state.step,
          method: state.method,
          flowState: {
            ...(state.changeRequest ? { changeRequest: state.changeRequest } : {}),
            // Save validationStatus and changeStatus to maintain step status when restoring
            ...(state.validationStatus ? { validationStatus: state.validationStatus } : {}),
            ...(state.changeStatus ? { changeStatus: state.changeStatus } : {}),
            // Don't save validationMessage - it's UI state that can be regenerated
            ...(state.batchResults ? { batchResults: state.batchResults } : {}),
            ...(state.selectedFactTypeForExamples ? { selectedFactTypeForExamples: state.selectedFactTypeForExamples } : {}),
          },
          savedRuleId: state.savedRuleId,
        };

        await fetchApi(api.guideDrafts.save(), {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn('Failed to save guide draft:', err);
        // Fallback to localStorage if API fails
        try {
          localStorage.setItem('rule-guide-draft-fallback', JSON.stringify({ ...state, savedAt: Date.now() }));
        } catch (localErr) {
          console.warn('Failed to save to localStorage fallback:', localErr);
        }
      }
    }, 500); // Debounce 500ms
  };

  const loadDraft = async (): Promise<Partial<GuideDraftState> | null> => {
    try {
      const response = await fetchApi<GuideDraftResponse>(api.guideDrafts.get());
      
      if (!response) return null;

      const draft: Partial<GuideDraftState> = {
        step: response.step as GuideDraftState['step'],
        method: response.method as GuideDraftState['method'] | null,
        savedRuleId: response.savedRuleId,
      };

      if (response.flowState) {
        const flowState = response.flowState as any;
        if (flowState.changeRequest) {
          draft.changeRequest = flowState.changeRequest;
        }
        if (flowState.validationStatus) {
          draft.validationStatus = flowState.validationStatus as GuideDraftState['validationStatus'];
        }
        if (flowState.validationMessage) {
          draft.validationMessage = flowState.validationMessage;
        }
        if (flowState.changeStatus) {
          draft.changeStatus = flowState.changeStatus as GuideDraftState['changeStatus'];
        }
        if (flowState.batchResults) {
          draft.batchResults = flowState.batchResults as BatchResult[];
        }
        if (flowState.selectedFactTypeForExamples) {
          draft.selectedFactTypeForExamples = flowState.selectedFactTypeForExamples as string;
        }
      }

      return draft;
    } catch (err: any) {
      // If 404, no draft exists
      if (err?.status === 404) {
        return null;
      }
      
      console.warn('Failed to load guide draft from API:', err);
      
      // Fallback to localStorage if API fails
      try {
        const fallback = localStorage.getItem('rule-guide-draft-fallback');
        if (fallback) {
          const draft = JSON.parse(fallback);
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (draft.savedAt && draft.savedAt < sevenDaysAgo) {
            localStorage.removeItem('rule-guide-draft-fallback');
            return null;
          }
          return draft;
        }
      } catch (localErr) {
        console.warn('Failed to load from localStorage fallback:', localErr);
      }
      
      return null;
    }
  };

  const clearDraft = async () => {
    try {
      await fetchApi(api.guideDrafts.delete(), {
        method: 'DELETE',
      });
      // Also clear localStorage fallback
      localStorage.removeItem('rule-guide-draft-fallback');
    } catch (err) {
      console.warn('Failed to delete guide draft:', err);
      // Clear localStorage fallback anyway
      localStorage.removeItem('rule-guide-draft-fallback');
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return { saveDraft, loadDraft, clearDraft };
}

