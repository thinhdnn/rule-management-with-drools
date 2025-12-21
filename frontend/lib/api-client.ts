import { NextRequest, NextResponse } from 'next/server'

/**
 * Get API base URL
 * Server-side: Uses API_URL environment variable (for Next.js API routes)
 * Falls back to BACKEND_URL for backward compatibility
 * 
 * Note: Next.js doesn't have a built-in API_URL variable.
 * In server-side API routes, we need an absolute URL to fetch from backend.
 * 
 * If no env var is set:
 * - Development: defaults to http://localhost:8080
 * - Production: throws error (must be configured via env var)
 */
function getApiBaseUrl(): string {
  const apiUrl = process.env.API_URL || process.env.BACKEND_URL
  
  if (apiUrl) {
    return apiUrl
  }
  
  // Development fallback
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8080'
  }
  
  // Production: must be configured
  // Note: Can't use relative URLs here because server-side fetch needs absolute URL
  throw new Error(
    'API_URL or BACKEND_URL environment variable must be set in production. ' +
    'Next.js API routes require an absolute URL to fetch from backend.'
  )
}

/**
 * Fetch from the API (server-side proxy)
 * This is the single source of truth for all API calls from Next.js API routes
 */
export async function fetchApi(
  path: string,
  request: NextRequest,
  options?: {
    method?: string
    body?: any
    headers?: Record<string, string>
    cache?: RequestCache
  }
): Promise<NextResponse> {
  try {
    const baseUrl = getApiBaseUrl()
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    
    // Forward Authorization header from original request
    const authHeader = request.headers.get('Authorization')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    }
    if (authHeader) {
      headers['Authorization'] = authHeader
    }
    
    // Debug logging for authentication
    if (process.env.NODE_ENV === 'development') {
      console.log('[api-client] Forwarding request:', {
        url,
        hasAuthHeader: !!authHeader,
        method: options?.method || request.method,
      })
    }

    const fetchOptions: RequestInit = {
      method: options?.method || request.method,
      headers,
      cache: options?.cache || 'no-store',
    }

    // Add body if provided in options
    if (options?.body !== undefined) {
      fetchOptions.body = typeof options.body === 'string' 
        ? options.body 
        : JSON.stringify(options.body)
    } else if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Try to clone and read request body if not already provided
      try {
        const clonedRequest = request.clone()
        const body = await clonedRequest.json()
        fetchOptions.body = JSON.stringify(body)
      } catch {
        // No body or invalid JSON, skip
      }
    }

    const res = await fetch(url, fetchOptions)

    if (!res.ok) {
      const errorText = await res.text()
      let errorMessage = errorText
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorJson.message || errorText
      } catch {
        // Keep original errorText if not JSON
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('API client error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Simple GET request to API
 */
export async function fetchApiGet(path: string, cache?: RequestCache): Promise<NextResponse> {
  const request = new NextRequest(new URL('http://localhost'))
  return fetchApi(path, request, { method: 'GET', cache })
}

