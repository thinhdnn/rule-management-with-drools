import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://rule.thinhnguyen.dev'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/rules/metadata`, {
      cache: 'no-store', // Don't cache - metadata can change when fields are added
    })
    
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch metadata' },
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

