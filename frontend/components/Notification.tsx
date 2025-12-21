'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Bell, X, CheckCircle2, AlertCircle, AlertTriangle, Info, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, fetchApi } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import { useWebSocket } from '@/lib/useWebSocket'

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'system'

export type Notification = {
  id: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  createdAt: number
  actionUrl?: string
  actionLabel?: string
}

type NotificationContextValue = {
  notifications: Notification[]
  unreadCount: number
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearAll: () => void
  isLoading: boolean
  refreshNotifications: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

// Helper to convert backend notification type to frontend type
function mapNotificationType(type: string): NotificationType {
  switch (type) {
    case 'SUCCESS':
      return 'success'
    case 'ERROR':
      return 'error'
    case 'WARNING':
      return 'warning'
    case 'INFO':
      return 'info'
    case 'SYSTEM':
      return 'system'
    default:
      return 'info'
  }
}

// Helper to convert backend notification to frontend format
function mapNotification(backendNotif: any): Notification {
  return {
    id: backendNotif.id,
    title: backendNotif.title,
    message: backendNotif.message,
    type: mapNotificationType(backendNotif.type),
    read: backendNotif.read || false,
    createdAt: backendNotif.createdAt ? new Date(backendNotif.createdAt).getTime() : Date.now(),
    actionUrl: backendNotif.actionUrl,
    actionLabel: backendNotif.actionLabel,
  }
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, token, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const unsubscribeRef = useRef<(() => void)[]>([])

  // Get WebSocket URL
  const WS_URL = typeof window !== 'undefined' 
    ? (() => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL
        if (apiUrl) {
          // Use the API URL directly
          return `${apiUrl}/ws`
        }
        // Fallback: use same origin (for nginx proxy or same server)
        // SockJS will handle protocol conversion (http -> ws, https -> wss)
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
        const host = window.location.host
        return `${protocol}//${host}/ws`
      })()
    : ''

  // Load notifications from API
  const loadNotifications = useCallback(async () => {
    // Only load if user is authenticated
    if (!user || authLoading) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetchApi<Notification[]>(api.notifications.list())
      if (response) {
        const mapped = response.map(mapNotification)
        setNotifications(mapped)
      }
    } catch (error) {
      console.error('Failed to load notifications from API:', error)
      setNotifications([])
    } finally {
      setIsLoading(false)
    }
  }, [user, authLoading])

  // Memoize callbacks to prevent reconnection loops
  const handleWebSocketConnect = useCallback(() => {
    console.log('WebSocket connected for notifications')
    // Load initial notifications when connected
    loadNotifications()
  }, [loadNotifications])
  
  const handleWebSocketDisconnect = useCallback(() => {
    console.log('WebSocket disconnected for notifications')
  }, [])
  
  const handleWebSocketError = useCallback((error: any) => {
    console.error('WebSocket error in NotificationProvider:', error)
    // Don't show error to user - WebSocket is optional for notifications
    // Fallback to polling if WebSocket fails
  }, [])

  // WebSocket connection
  const { isConnected, subscribe } = useWebSocket({
    url: WS_URL,
    token: token,
    enabled: !!user && !authLoading && !!token,
    onConnect: handleWebSocketConnect,
    onDisconnect: handleWebSocketDisconnect,
    onError: handleWebSocketError,
  })

  // Subscribe to notifications when WebSocket is connected
  useEffect(() => {
    if (!isConnected || !user) {
      return
    }

    // Clean up previous subscriptions
    unsubscribeRef.current.forEach((unsub) => unsub())
    unsubscribeRef.current = []

    // Subscribe to new notifications
    const unsub1 = subscribe(`/topic/notifications/${user.id}`, (message) => {
      try {
        const data = JSON.parse(message.body)
        const newNotification = mapNotification(data)
        setNotifications((prev) => {
          // Check if notification already exists
          const exists = prev.some((n) => n.id === newNotification.id)
          if (exists) {
            return prev.map((n) => (n.id === newNotification.id ? newNotification : n))
          }
          return [newNotification, ...prev]
        })
      } catch (error) {
        console.error('Failed to parse notification message:', error)
      }
    })

    // Subscribe to unread count updates
    const unsub2 = subscribe(`/topic/notifications/${user.id}/unread-count`, (message) => {
      try {
        const count = parseInt(message.body, 10)
        // Refresh notifications when unread count changes
        loadNotifications()
      } catch (error) {
        console.error('Failed to parse unread count message:', error)
      }
    })

    unsubscribeRef.current.push(unsub1, unsub2)

    return () => {
      unsubscribeRef.current.forEach((unsub) => unsub())
      unsubscribeRef.current = []
    }
  }, [isConnected, user, subscribe, loadNotifications])

  // Load notifications when user is authenticated
  useEffect(() => {
    if (!authLoading) {
      if (user) {
        loadNotifications()
      } else {
        // Clear notifications when user logs out
        setNotifications([])
        setIsLoading(false)
      }
    }
  }, [user, authLoading, loadNotifications])

  const refreshNotifications = useCallback(async () => {
    await loadNotifications()
  }, [loadNotifications])

  // Client-side only notification (for toasts, etc.)
  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        read: false,
        createdAt: Date.now(),
      }
      setNotifications((prev) => [newNotification, ...prev])
    },
    [],
  )

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )

    // Sync with API
    try {
      await fetchApi<void>(api.notifications.markAsRead(id), {
        method: 'PUT',
      })
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
      // Revert on error
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      )
    }
  }, [user])

  const markAllAsRead = useCallback(async () => {
    if (!user) return

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))

    // Sync with API
    try {
      await fetchApi<void>(api.notifications.markAllAsRead(), {
        method: 'PUT',
      })
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
      // Revert on error - reload from server
      await loadNotifications()
    }
  }, [user, loadNotifications])

  const removeNotification = useCallback(async (id: string) => {
    if (!user) return

    // Optimistic update
    const removed = notifications.find((n) => n.id === id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))

    // Sync with API
    try {
      await fetchApi<void>(api.notifications.delete(id), {
        method: 'DELETE',
      })
    } catch (error) {
      console.error('Failed to delete notification:', error)
      // Revert on error
      if (removed) {
        setNotifications((prev) => [...prev, removed])
      }
    }
  }, [user, notifications])

  const clearAll = useCallback(async () => {
    if (!user) return

    // Optimistic update
    const previous = notifications
    setNotifications([])

    // Sync with API
    try {
      await fetchApi<void>(api.notifications.clearAll(), {
        method: 'DELETE',
      })
    } catch (error) {
      console.error('Failed to clear all notifications:', error)
      // Revert on error
      setNotifications(previous)
    }
  }, [user, notifications])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
        isLoading,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useNotification()
  const [isOpen, setIsOpen] = useState(false)

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl
    }
  }

  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-surfaceContainerHigh focus-ring transition-smooth cursor-pointer text-text-secondary hover:text-text-primary"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-12 w-96 max-h-[600px] bg-surface border border-border rounded-lg shadow-card z-50 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="h6 text-text-primary">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 rounded-lg hover:bg-surfaceContainerHigh transition-smooth cursor-pointer text-text-secondary hover:text-text-primary"
                    aria-label="Mark all as read"
                    title="Mark all as read"
                  >
                    <CheckCheck size={16} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="p-1.5 rounded-lg hover:bg-surfaceContainerHigh transition-smooth cursor-pointer text-text-secondary hover:text-text-primary"
                    aria-label="Clear all"
                    title="Clear all"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell size={48} className="mx-auto mb-4 text-text-tertiary" />
                  <p className="text-body-sm text-text-secondary">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onClick={() => handleNotificationClick(notification)}
                      onMarkAsRead={() => markAsRead(notification.id)}
                      onRemove={() => removeNotification(notification.id)}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NotificationItem({
  notification,
  onClick,
  onMarkAsRead,
  onRemove,
  formatTime,
}: {
  notification: Notification
  onClick: () => void
  onMarkAsRead: () => void
  onRemove: () => void
  formatTime: (timestamp: number) => string
}) {
  const iconMap = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    system: Bell,
  }

  const colorMap = {
    success: {
      bg: 'bg-success-bg',
      border: 'border-success/20',
      text: 'text-success',
      icon: 'text-success',
    },
    error: {
      bg: 'bg-error-bg',
      border: 'border-error/20',
      text: 'text-error',
      icon: 'text-error',
    },
    warning: {
      bg: 'bg-warning-bg',
      border: 'border-warning/20',
      text: 'text-warning',
      icon: 'text-warning',
    },
    info: {
      bg: 'bg-accent-bg',
      border: 'border-accent/20',
      text: 'text-accent',
      icon: 'text-accent',
    },
    system: {
      bg: 'bg-surfaceContainer',
      border: 'border-border',
      text: 'text-text-primary',
      icon: 'text-text-secondary',
    },
  }

  const Icon = iconMap[notification.type]
  const colors = colorMap[notification.type]

  return (
    <div
      className={cn(
        'p-4 hover:bg-surfaceContainerHigh transition-smooth cursor-pointer relative group',
        !notification.read && 'bg-surfaceContainer/50',
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            colors.bg,
            colors.border,
            'border',
          )}
        >
          <Icon className={cn('w-5 h-5', colors.icon)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className={cn('text-body-sm font-semibold', colors.text)}>
              {notification.title}
            </h4>
            {!notification.read && (
              <span className="w-2 h-2 bg-accent rounded-full shrink-0 mt-1.5" />
            )}
          </div>
          <p className="text-body-sm text-text-secondary mb-2 whitespace-pre-line break-words">
            {notification.message}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-body-xs text-text-tertiary">
              {formatTime(notification.createdAt)}
            </span>
            {notification.actionLabel && (
              <span className="text-body-xs text-accent font-medium">
                {notification.actionLabel} →
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkAsRead()
              }}
              className="p-1 rounded hover:bg-surfaceContainerHigh transition-smooth cursor-pointer text-text-tertiary hover:text-text-primary"
              aria-label="Mark as read"
              title="Mark as read"
            >
              <CheckCheck size={14} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-1 rounded hover:bg-surfaceContainerHigh transition-smooth cursor-pointer text-text-tertiary hover:text-text-primary"
            aria-label="Remove notification"
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

