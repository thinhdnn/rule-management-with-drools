import { NextRequest, NextResponse } from 'next/server'
import { mapRequestToBackend, transformRule } from './transform'
import { fetchApi } from '@/lib/api-client'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.toString()
  const path = `/api/v1/rules${query ? `?${query}` : ''}`
  
  const response = await fetchApi(path, request)
  
  if (!response.ok) {
    return response
  }
  
  const data = await response.json()
  
  // Transform backend data to frontend format
  // New lean design: DecisionRule only has metadata + expressions (no business fields!)
  const items = Array.isArray(data) ? data : []
  const transformed = items.map((rule: any) => ({
    id: rule.id?.toString() || '',
    name: rule.ruleName || 'Unnamed Rule',
    factType: rule.factType || 'Declaration', // Map factType from backend
    documentType: 'Import Declaration', // Default (rules apply to all declaration types)
    ruleType: inferRuleTypeFromExpression(rule.whenExpr || rule.ruleCondition), // Support both formats
    outputType: inferOutputTypeFromExpression(rule.ruleResult || rule.description), // Use ruleResult or description
    status: rule.status === 'ACTIVE' ? 'Active' as const : 
            rule.status === 'INACTIVE' ? 'Inactive' as const : 
            'Draft' as const,
    updatedAt: rule.lastModifiedDate || rule.createdDate || rule.updatedAt || rule.createdAt || new Date().toISOString(),
  }))
  
  return NextResponse.json({
    items: transformed,
    total: transformed.length,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const backendPayload = mapRequestToBackend(body)
  
  const response = await fetchApi('/api/v1/rules', request, {
    method: 'POST',
    body: backendPayload,
  })
  
  if (!response.ok) {
    return response
  }
  
  const data = await response.json()
  const transformed = transformRule(data)
  return NextResponse.json(transformed, { status: 201 })
}

// Infer rule type from rule condition content
function inferRuleTypeFromExpression(ruleCondition: string): string {
  if (!ruleCondition) return 'Compliance'
  
  const expr = ruleCondition.toLowerCase()
  if (expr.includes('score') || expr.includes('risk')) return 'Risk'
  if (expr.includes('hscode') || expr.includes('classification')) return 'Classification'
  if (expr.includes('valuation') || expr.includes('value') || expr.includes('amount')) return 'Valuation'
  return 'Compliance'
}

// Infer output type from description content
function inferOutputTypeFromExpression(description: string): string {
  if (!description) return 'Notification'
  
  const expr = description.toLowerCase()
  if (expr.includes('score') || expr.includes('risk')) return 'Score'
  if (expr.includes('flag')) return 'Flag'
  if (expr.includes('approve') || expr.includes('reject') || expr.includes('channel')) return 'Channel'
  return 'Notification'
}
