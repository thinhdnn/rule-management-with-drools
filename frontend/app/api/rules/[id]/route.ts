import { NextRequest, NextResponse } from 'next/server'
import { mapRequestToBackend, transformRule } from '../transform'

const BACKEND_URL = process.env.BACKEND_URL || 'https://rule.thinhnguyen.dev'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/rules/${id}`, {
      cache: 'no-store',
    })
    
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: res.status }
      )
    }
    
    const data = await res.json()
    const rule = data?.rule ?? data
    const transformed = transformRule(rule)

    if (data?.metadata) {
      return NextResponse.json({ ...transformed, metadata: data.metadata })
    }

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('API proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const backendPayload = mapRequestToBackend(body)

    const res = await fetch(`${BACKEND_URL}/api/v1/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendPayload),
    })
    
    if (!res.ok) {
      const errorData = await res.text()
      return NextResponse.json(
        { error: errorData || 'Failed to update rule' },
        { status: res.status }
      )
    }
    
    const data = await res.json()
    const transformed = transformRule(data)
    return NextResponse.json(transformed)
  } catch (error) {
    console.error('API proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/rules/${id}`, {
      method: 'DELETE',
    })
    
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to delete rule' },
        { status: res.status }
      )
    }
    
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('API proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

