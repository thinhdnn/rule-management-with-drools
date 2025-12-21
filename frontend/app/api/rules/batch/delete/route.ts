import { NextRequest, NextResponse } from 'next/server'
import { fetchApi } from '@/lib/api-client'

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const response = await fetchApi('/api/v1/rules/batch/delete', request, {
    method: 'POST',
    body: body,
  })
  
  return response
}

