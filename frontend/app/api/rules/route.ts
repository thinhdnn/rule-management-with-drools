import { NextRequest, NextResponse } from 'next/server'
import { mapRequestToBackend, transformRule } from './transform'

const BACKEND_URL = process.env.BACKEND_URL || 'https://rule.thinhnguyen.dev/be'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.toString()
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/rules?${query}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })
    
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch rules' },
        { status: res.status }
      )
    }
    
    const data = await res.json()
    
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
  } catch (error) {
    console.error('API proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const backendPayload = mapRequestToBackend(body)
    
    const res = await fetch(`${BACKEND_URL}/api/v1/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backendPayload),
    })
    
    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        { error: errorText || 'Failed to create rule' },
        { status: res.status }
      )
    }
    
    const data = await res.json()
    const transformed = transformRule(data)
    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error('API proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
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
