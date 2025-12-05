'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

type Toast = {
  id: string
  message: string
  type: ToastType
  duration?: number
}

type ToastContextValue = {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  showSuccess: (message: string, duration?: number) => void
  showError: (message: string, duration?: number) => void
  showWarning: (message: string, duration?: number) => void
  showInfo: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 5000) => {
      const id = crypto.randomUUID()
      const toast: Toast = { id, message, type, duration }

      setToasts((prev) => [...prev, toast])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast],
  )

  const showSuccess = useCallback(
    (message: string, duration?: number) => showToast(message, 'success', duration),
    [showToast],
  )

  const showError = useCallback(
    (message: string, duration?: number) => showToast(message, 'error', duration),
    [showToast],
  )

  const showWarning = useCallback(
    (message: string, duration?: number) => showToast(message, 'warning', duration),
    [showToast],
  )

  const showInfo = useCallback(
    (message: string, duration?: number) => showToast(message, 'info', duration),
    [showToast],
  )

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const iconMap = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
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
  }

  const Icon = iconMap[toast.type]
  const colors = colorMap[toast.type]

  // Backend already formats messages with line breaks, just return as-is
  const formatMessage = (message: string) => message

  return (
    <div
      className={cn(
        'min-w-[320px] max-w-xl bg-surface rounded-lg border shadow-card p-4 flex items-start gap-3 pointer-events-auto transition-all duration-300',
        colors.bg,
        colors.border,
      )}
      role="alert"
      style={{
        animation: 'slideInRight 0.3s ease-out',
      }}
    >
      <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', colors.icon)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className={cn('text-body-sm font-medium break-words whitespace-pre-line leading-relaxed', colors.text)}>
          {formatMessage(toast.message)}
        </p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className={cn(
          'shrink-0 p-1 rounded-lg hover:bg-surfaceContainerHigh transition-smooth cursor-pointer',
          colors.text,
        )}
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

