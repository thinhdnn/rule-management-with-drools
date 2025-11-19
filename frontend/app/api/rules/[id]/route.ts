import { NextRequest, NextResponse } from 'next/server'
import { mapRequestToBackend, transformRule } from '../transform'
import { fetchApi } from '@/lib/api-client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const response = await fetchApi(`/api/v1/rules/${id}`, request)
  
  if (!response.ok) {
    return response
  }
  
  const data = await response.json()
  const rule = data?.rule ?? data
  const transformed = transformRule(rule)

  if (data?.metadata) {
    return NextResponse.json({ ...transformed, metadata: data.metadata })
  }

  return NextResponse.json(transformed)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const backendPayload = mapRequestToBackend(body)

  const response = await fetchApi(`/api/v1/rules/${id}`, request, {
    method: 'PUT',
    body: backendPayload,
  })
  
  if (!response.ok) {
    return response
  }
  
  const data = await response.json()
  const transformed = transformRule(data)
  return NextResponse.json(transformed)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fetchApi(`/api/v1/rules/${id}`, request, {
    method: 'DELETE',
  })
}

