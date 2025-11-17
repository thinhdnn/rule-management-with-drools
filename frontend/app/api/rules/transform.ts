const toNumber = (value: unknown) => {
  if (value == null) return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

export const transformRule = (rule: any) => {
  const ruleCondition = typeof rule?.ruleCondition === 'string'
    ? rule.ruleCondition
    : typeof rule?.whenExpr === 'string'
    ? rule.whenExpr
    : ''

  const conditions = Array.isArray(rule?.conditions) ? rule.conditions : []

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
    ruleCondition,
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


