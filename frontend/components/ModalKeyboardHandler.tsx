'use client'

import { useEffect, type ReactNode } from 'react'
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts'

type ModalKeyboardHandlerProps = {
  children: ReactNode
  onEscape: () => void
  onEnter?: () => void
}

/**
 * Component to handle keyboard shortcuts in modals
 * Wraps modal content and provides Escape to close, Enter to submit
 */
export function ModalKeyboardHandler({ children, onEscape, onEnter }: ModalKeyboardHandlerProps) {
  useKeyboardShortcuts({
    onEscape,
    onEnter,
    enabled: true,
  })

  return <>{children}</>
}

