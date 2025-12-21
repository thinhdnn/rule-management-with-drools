import { NextRequest } from 'next/server'
import { fetchApi } from '@/lib/api-client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fetchApi(`/api/v1/change-requests/${id}/notify-admin`, request, {
    method: 'POST',
  })
}

