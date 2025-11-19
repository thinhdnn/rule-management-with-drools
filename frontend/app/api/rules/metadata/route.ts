import { NextRequest } from 'next/server'
import { fetchApi } from '@/lib/api-client'

export async function GET(request: NextRequest) {
  return fetchApi('/api/v1/rules/metadata', request, {
    cache: 'no-store', // Don't cache - metadata can change when fields are added
  })
}

