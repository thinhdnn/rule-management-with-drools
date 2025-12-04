const toNumber = (value: unknown) => {
  if (value == null) return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

// Helper to flatten nested ConditionsGroup to flat array for UI
const flattenConditionsGroup = (conditionsGroup: any, logicalOp: 'AND' | 'OR' = 'AND'): any[] => {
  const result: any[] = []
  
  if (Array.isArray(conditionsGroup)) {
    // Array of conditions or nested groups
    for (const item of conditionsGroup) {
      if (item && typeof item === 'object') {
        if (item.field && item.operator && item.value !== undefined) {
          // Regular condition
          result.push({ ...item, logicalOp })
        } else if (item.AND || item.OR) {
          // Nested group
          const nestedOp = item.OR ? 'OR' : 'AND'
          const nestedConditions = item.AND || item.OR || []
          result.push(...flattenConditionsGroup(nestedConditions, nestedOp))
        }
      }
    }
  } else if (conditionsGroup && typeof conditionsGroup === 'object') {
    // ConditionsGroup object { AND: [...], OR: [...] }
    if (conditionsGroup.AND) {
      result.push(...flattenConditionsGroup(conditionsGroup.AND, 'AND'))
    }
    if (conditionsGroup.OR) {
      result.push(...flattenConditionsGroup(conditionsGroup.OR, 'OR'))
    }
  }
  
  return result
}

export const transformRule = (rule: any) => {
  // Convert ConditionsGroup (new format with nested support) to flat array (UI format)
  let conditions: any[] = []
  if (rule?.conditions) {
    if (Array.isArray(rule.conditions)) {
      // Old format: array with logicalOp
      conditions = rule.conditions
    } else if (typeof rule.conditions === 'object') {
      // New format: { AND: [...], OR: [...] } with possible nested structure
      conditions = flattenConditionsGroup(rule.conditions)
    }
  }

  const rawOutput = (rule?.output && typeof rule.output === 'object') ? rule.output : {}

  const output = {
    action: rawOutput.action ?? rule?.ruleAction ?? null,
    score: toNumber(rawOutput.score ?? rule?.ruleScore),
    result: rawOutput.result ?? rule?.ruleResult ?? null,
    flag: rawOutput.flag ?? null,
    documentType: rawOutput.documentType ?? null,
    documentId: rawOutput.documentId ?? null,
    description: rawOutput.description ?? null,
  }

  return {
    id: rule?.id ?? null,
    ruleName: rule?.ruleName ?? '',
    factType: rule?.factType ?? 'Declaration', // Map factType from backend
    label: rule?.label ?? null,
    priority: rule?.priority ?? 0,
    status: rule?.status ?? 'DRAFT',
    conditions,
    description: rule?.description ?? '',
    output,
    ruleAction: rule?.ruleAction ?? null,
    ruleResult: rule?.ruleResult ?? null,
    ruleScore: toNumber(rule?.ruleScore),
    version: rule?.version ?? 1,
    parentRuleId: rule?.parentRuleId ?? null,
    isLatest: rule?.isLatest ?? true,
    versionNotes: rule?.versionNotes ?? null,
    createdAt: rule?.createdAt ?? rule?.createdDate ?? null,
    updatedAt: rule?.updatedAt ?? rule?.lastModifiedDate ?? null,
    createdBy: rule?.createdBy ?? null,
    updatedBy: rule?.updatedBy ?? rule?.lastModifiedBy ?? null,
    ruleContent: rule?.ruleContent ?? null,
  }
}

export const mapRequestToBackend = (payload: any) => {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const backendPayload: any = { ...payload }

  if (payload.output && typeof payload.output === 'object') {
    const output = payload.output as Record<string, unknown>
    if (backendPayload.ruleAction == null && output.action !== undefined) {
      backendPayload.ruleAction = output.action
    }
    if (backendPayload.ruleResult == null && output.result !== undefined) {
      backendPayload.ruleResult = output.result
    }
    if (backendPayload.ruleScore == null && output.score !== undefined) {
      backendPayload.ruleScore = output.score
    }
  }

  return backendPayload
}


