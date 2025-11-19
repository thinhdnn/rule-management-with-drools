import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://rule.thinhnguyen.dev'

/**
 * POST /api/rules/:id/versions/restore
 * Restore an old version (creates a new version with the same content)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const res = await fetch(`${BACKEND_URL}/api/v1/rules/${id}/versions/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to restore version' },
        { status: res.status }
      )
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('API proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

