import { NextRequest } from 'next/server'
import { fetchApi } from '@/lib/api-client'

/**
 * POST /api/rules/:id/versions/restore
 * Restore an old version (creates a new version with the same content)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return fetchApi(`/api/v1/rules/${id}/versions/restore`, request, {
    method: 'POST',
    body,
  })
}

