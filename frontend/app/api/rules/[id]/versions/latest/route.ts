import { NextRequest } from 'next/server'
import { fetchApi } from '@/lib/api-client'

/**
 * GET /api/rules/:id/versions/latest
 * Get the latest version of a rule
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fetchApi(`/api/v1/rules/${id}/versions/latest`, request)
}

