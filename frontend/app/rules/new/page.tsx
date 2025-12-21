"use client"
import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FilePlus } from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts'
import { ManualRuleForm } from '@/components/rules/ManualRuleForm'

type RuleFormData = {
  ruleName: string
  label: string
  factType: string
  priority: number
  output: Record<string, string>
  conditions: Array<{
    id: string
    field: string
    operator: string
    value: string
    logicalOp?: 'AND' | 'OR'
  }>
}

type FieldMetadata = {
  inputFields: Array<{
    name: string
    label: string
    type: string
    description: string
    orderIndex?: number
  }>
  outputFields: Array<{
  name: string
  label: string
  type: string
  description: string
    orderIndex?: number
  }>
  operatorsByType: Record<string, Array<{
  operator: string
  label: string
  description?: string
  }>>
}

export default function NewRulePage() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(false)

  // Extract object path from field path
  const getObjectPath = (fieldPath: string): string => {
    if (!fieldPath) return '';
    const parts = fieldPath.split('.');
    if (parts.length <= 1) return fieldPath;
    return parts.slice(0, -1).join('.');
  };

  const handleSave = async (formData: RuleFormData) => {
    setLoading(true);
    try {
      // Convert conditions to new ConditionsGroup format with nested structure
      // Group conditions by object path and logical operator, preserving order
      const validConditions = formData.conditions.filter((c) => c.field && c.operator && c.value);
      
      // Build conditions structure
      let conditions: any = null;
      if (validConditions.length === 1) {
        // Single condition: wrap in AND array
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
        const andConditions: any[] = [];
        const orConditions: any[] = [];
        
        // Group conditions sequentially by object path (preserve order)
        let currentGroup: any[] = [];
        let currentObjectPath: string | null = null;
        let currentGroupLogicalOp: 'AND' | 'OR' | null = null;
        let isFirstGroup = true;
        
        for (let i = 0; i < validConditions.length; i++) {
          const cond = validConditions[i];
          const objectPath = getObjectPath(cond.field);
          const logicalOp = cond.logicalOp || 'AND';
          
          // If object path changed, finalize current group and start new group
          if (currentObjectPath !== null && objectPath !== currentObjectPath) {
            // Add current group as nested ConditionsGroup if it has 2+ conditions
            if (currentGroup.length > 0) {
              if (currentGroup.length === 1) {
                // Single condition: add directly to parent
                if (isFirstGroup) {
                  andConditions.push(currentGroup[0]);
                } else {
                  // Create nested group for this single condition (will be added to parent AND)
                  const nestedGroup: any = {};
                  nestedGroup.AND = currentGroup;
                  andConditions.push(nestedGroup);
                }
              } else {
                // Multiple conditions: create nested ConditionsGroup
                const nestedGroup: any = {};
                if (currentGroupLogicalOp === 'OR') {
                  nestedGroup.OR = currentGroup;
                  orConditions.push(nestedGroup);
                } else {
                  nestedGroup.AND = currentGroup;
                  andConditions.push(nestedGroup);
                }
              }
            }
            // Start new group
            currentGroup = [];
            currentGroupLogicalOp = null;
            isFirstGroup = false;
          }
          
          // Add condition to current group
          currentGroup.push({
            field: cond.field,
            operator: cond.operator,
            value: cond.value,
          });
          
          // Set logical operator for this group (use the logicalOp of the second condition in the group)
          if (currentGroup.length === 2 && currentGroupLogicalOp === null) {
            currentGroupLogicalOp = logicalOp;
          }
          
          currentObjectPath = objectPath;
        }
        
        // Add final group
        if (currentGroup.length > 0) {
          if (currentGroup.length === 1) {
            // Single condition: add directly to parent
            if (isFirstGroup) {
              andConditions.push(currentGroup[0]);
            } else {
              // Create nested group for this single condition
              const nestedGroup: any = {};
              nestedGroup.AND = currentGroup;
              andConditions.push(nestedGroup);
            }
          } else {
            // Multiple conditions: create nested ConditionsGroup
            const nestedGroup: any = {};
            if (currentGroupLogicalOp === 'OR') {
              nestedGroup.OR = currentGroup;
              orConditions.push(nestedGroup);
            } else {
              nestedGroup.AND = currentGroup;
              andConditions.push(nestedGroup);
            }
          }
        }
        
        // Build ConditionsGroup (top level)
        conditions = {};
        if (andConditions.length > 0) {
          conditions.AND = andConditions;
        }
        if (orConditions.length > 0) {
          conditions.OR = orConditions;
        }
        
        // If both are empty, set to null
        if (andConditions.length === 0 && orConditions.length === 0) {
          conditions = null;
        }
      }

      // Fetch metadata to convert numeric fields properly
      let metadata: FieldMetadata | null = null;
      try {
        metadata = await fetchApi<FieldMetadata>(api.rules.metadata(formData.factType));
      } catch (err) {
        console.warn('Failed to fetch metadata for output conversion:', err);
      }

      const payload = {
        ruleName: formData.ruleName,
        label: formData.ruleName, // Auto-generate label from ruleName
        factType: formData.factType, // Include factType
        priority: 10, // Default priority
        conditions, // Send structured conditions array (not ruleCondition string)
        description: formData.ruleName, // Use ruleName as description
        output: Object.fromEntries(
          Object.entries(formData.output).map(([key, value]) => {
            // Convert numeric fields
            if (metadata?.outputFields) {
              const field = metadata.outputFields.find((f) => f.name === key);
              if (
                field &&
                (field.type === 'decimal' || field.type === 'number' || field.type === 'integer')
              ) {
                return [key, value ? parseFloat(value) : null];
              }
            }
            return [key, value || null];
          }),
        ),
      };

      await fetchApi(api.rules.create(), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.push('/rules');
    } catch (err: any) {
      throw err; // Let ManualRuleForm handle error display
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRef = useRef<(() => Promise<void>) | null>(null);

  // Update ref when handleSave changes
  useEffect(() => {
    handleSubmitRef.current = async () => {
      if (formRef.current) {
        formRef.current.requestSubmit();
      }
    };
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onEnter: (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA' && !loading && formRef.current && handleSubmitRef.current) {
        const form = formRef.current;
        if (form.checkValidity()) {
          handleSubmitRef.current();
        } else {
          form.reportValidity();
        }
      }
    },
    onEscape: () => {
      if (!loading) {
        router.back();
      }
    },
    enabled: true,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary focus-ring rounded-md px-2 py-1 transition-colors cursor-pointer"
        >
          <FilePlus className="w-4 h-4" />
          <ArrowLeft className="w-4 h-4" />
          Back to Rules
        </button>
      </div>

      <ManualRuleForm
        onSave={handleSave}
        onCancel={() => router.back()}
        loading={loading}
        showFactTypeToggle={true}
        formRef={formRef}
                    />
    </div>
  );
}
