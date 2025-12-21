'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Client, IMessage } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

type WebSocketMessage = {
  type: string
  payload: any
}

type UseWebSocketOptions = {
  url: string
  token: string | null
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: any) => void
  onMessage?: (message: WebSocketMessage) => void
  enabled?: boolean
}

export function useWebSocket({
  url,
  token,
  onConnect,
  onDisconnect,
  onError,
  onMessage,
  enabled = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const clientRef = useRef<Client | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000 // 3 seconds

  // Store callbacks in refs to avoid dependency issues
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const onErrorRef = useRef(onError)
  const onMessageRef = useRef(onMessage)

  // Update refs when callbacks change
  useEffect(() => {
    onConnectRef.current = onConnect
    onDisconnectRef.current = onDisconnect
    onErrorRef.current = onError
    onMessageRef.current = onMessage
  }, [onConnect, onDisconnect, onError, onMessage])

  const connect = useCallback(() => {
    if (!enabled || !token) {
      if (!token) {
        console.warn('WebSocket: Cannot connect without token')
      }
      return
    }
    
    // Prevent multiple connections - check both connected and active states
    if (clientRef.current?.connected || clientRef.current?.active) {
      console.log('WebSocket: Already connected or connecting, skipping duplicate connection')
      return
    }

    // Clean up existing client if any
    if (clientRef.current) {
      try {
        clientRef.current.deactivate()
      } catch (e) {
        // Ignore errors during cleanup
      }
      clientRef.current = null
    }

    if (!url) {
      console.error('WebSocket: URL is empty, cannot connect')
      return
    }
    
    console.log('WebSocket: Connecting to', url)
    console.log('WebSocket: Token present:', !!token, 'Token length:', token?.length)
    
    const client = new Client({
      webSocketFactory: () => {
        try {
          const sock = new SockJS(url) as any
          // Add error listeners to SockJS
          sock.onerror = (error: any) => {
            console.error('SockJS error:', error)
          }
          sock.onclose = (event: any) => {
            console.log('SockJS closed:', event.code, event.reason)
          }
          return sock
        } catch (error) {
          console.error('Failed to create SockJS connection:', error)
          throw error
        }
      },
      reconnectDelay: 0, // We handle reconnection manually
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log('WebSocket: Connected successfully')
        setIsConnected(true)
        setConnectionError(null)
        reconnectAttemptsRef.current = 0
        onConnectRef.current?.()
      },
      onDisconnect: () => {
        console.log('WebSocket: Disconnected')
        setIsConnected(false)
        onDisconnectRef.current?.()
      },
      onStompError: (frame) => {
        console.error('WebSocket STOMP error:', frame)
        // Check if it's an authentication error
        if (frame.headers && frame.headers['message']) {
          const message = frame.headers['message']
          if (message.includes('authentication') || message.includes('unauthorized')) {
            console.error('WebSocket authentication failed. Please log in again.')
            // Don't reconnect on auth errors - user needs to re-login
            onErrorRef.current?.(frame)
            return
          }
        }
        onErrorRef.current?.(frame)
        // Try to reconnect for other errors
        scheduleReconnect()
      },
      onWebSocketError: (event) => {
        // Log detailed error information
        const errorInfo = {
          type: event?.type || 'unknown',
          target: event?.target ? {
            readyState: event.target.readyState,
            url: event.target.url,
            protocol: event.target.protocol,
          } : null,
          message: event?.message || 'Unknown WebSocket error',
          error: event?.error || null,
          event: event,
        }
        console.error('WebSocket connection error:', errorInfo)
        
        // Check if it's a connection refused error
        if (event?.target?.readyState === WebSocket.CLOSED || event?.target?.readyState === 3) {
          const errorMsg = 'WebSocket connection closed. Check if backend is running and WebSocket endpoint is accessible.'
          console.error(errorMsg)
          setConnectionError(errorMsg)
        } else {
          setConnectionError('WebSocket connection error. Check console for details.')
        }
        
        onErrorRef.current?.(event)
        // Try to reconnect
        scheduleReconnect()
      },
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
    })

    clientRef.current = client
    client.activate()
  }, [url, token, enabled]) // Remove callbacks from deps - use refs instead

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (clientRef.current) {
      clientRef.current.deactivate()
      clientRef.current = null
    }
    setIsConnected(false)
    reconnectAttemptsRef.current = 0
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn('Max reconnection attempts reached')
      return
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    reconnectAttemptsRef.current++
    reconnectTimeoutRef.current = setTimeout(() => {
      // Check again before reconnecting
      if (enabled && token && !clientRef.current?.connected && !clientRef.current?.active) {
        console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`)
        connect()
      }
    }, reconnectDelay)
  }, [enabled, token]) // Remove connect from deps

  const subscribe = useCallback(
    (destination: string, callback: (message: IMessage) => void) => {
      if (!clientRef.current?.connected) {
        console.warn('WebSocket not connected, cannot subscribe')
        return () => {}
      }

      const subscription = clientRef.current.subscribe(destination, (message) => {
        callback(message)
      })

      return () => {
        subscription.unsubscribe()
      }
    },
    []
  )

  useEffect(() => {
    if (enabled && token) {
      // Only connect if not already connected or connecting
      if (!clientRef.current?.connected && !clientRef.current?.active) {
        connect()
      }
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, token]) // Remove connect/disconnect from deps to prevent loops

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    subscribe,
    client: clientRef.current,
  }
}

