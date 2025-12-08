'use client'

import { useEffect, useCallback, useRef } from 'react'

type KeyboardShortcutsOptions = {
  onEnter?: (e: KeyboardEvent) => void
  onEscape?: (e: KeyboardEvent) => void
  enabled?: boolean
  preventDefault?: boolean
  /** Allow handling Enter even when focus is inside inputs/selects (except textarea) */
  allowInInputs?: boolean
}

/**
 * Hook to handle keyboard shortcuts
 * @param options - Configuration for keyboard shortcuts
 * @param options.onEnter - Callback when Enter key is pressed
 * @param options.onEscape - Callback when Escape key is pressed
 * @param options.enabled - Whether shortcuts are enabled (default: true)
 * @param options.preventDefault - Whether to prevent default behavior (default: true)
 */
export function useKeyboardShortcuts({
  onEnter,
  onEscape,
  enabled = true,
  preventDefault = true,
  allowInInputs = false,
}: KeyboardShortcutsOptions) {
  // Use refs to always have latest callbacks
  const onEnterRef = useRef(onEnter)
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEnterRef.current = onEnter
    onEscapeRef.current = onEscape
  }, [onEnter, onEscape])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // Don't handle shortcuts when user is typing in inputs, textareas, or contenteditable
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT'
      const isTextarea = target.tagName === 'TEXTAREA'
      const isContentEditable = target.isContentEditable
      const isSelect = target.tagName === 'SELECT'

      // Allow Enter in textareas (let them handle it normally)
      if (e.key === 'Enter' && isTextarea) {
        return
      }

      // For inputs and selects, only handle Escape (not Enter)
      if ((isInput || isSelect) && e.key === 'Enter') {
        // Only handle Enter if it's a submit button or form submit
        const form = target.closest('form')
        if (form && e.key === 'Enter') {
          // Let form handle Enter naturally for submit
          return
        }
      }

      // Handle Escape key - works everywhere except when typing
      if (e.key === 'Escape' && onEscapeRef.current) {
        if (preventDefault && !isTextarea) {
          e.preventDefault()
        }
        onEscapeRef.current(e)
        return
      }

      // Handle Enter key
      if (e.key === 'Enter' && onEnterRef.current) {
        // When allowInInputs is true, allow Enter everywhere except textarea/contenteditable
        const canHandleEnter = allowInInputs
          ? !isTextarea && !isContentEditable
          : !isInput && !isTextarea && !isSelect && !isContentEditable

        if (!canHandleEnter) return

        if (preventDefault) e.preventDefault()
        onEnterRef.current(e)
        return
      }
    },
    [enabled, preventDefault, allowInInputs],
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, enabled])
}

