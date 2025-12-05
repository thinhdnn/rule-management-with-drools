'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

type Option = {
  name: string
  label: string
  description?: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
}

export function SearchableSelect({ value, onChange, options, placeholder = 'Select...', className = '' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find(opt => opt.name === value)

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setIsOpen(true)
      return
    }

    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => (prev + 1) % filteredOptions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length)
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].name)
          setIsOpen(false)
          setSearchTerm('')
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSearchTerm('')
        break
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSearchTerm('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full h-9 px-3 text-sm border border-border rounded-lg focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary transition-smooth cursor-pointer bg-surface hover:border-primary/30"
      >
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 outline-none bg-transparent text-sm text-text-primary placeholder:text-text-muted"
            placeholder={placeholder}
          />
        ) : (
          <span className={`flex-1 truncate ${!selectedOption ? 'text-text-muted' : 'text-text-primary'}`}>
            {selectedOption?.label || placeholder}
          </span>
        )}
        
        <div className="flex items-center gap-1">
          {value && !isOpen && (
            <button
              onClick={handleClear}
              className="p-0.5 hover:bg-surfaceContainerHigh rounded-lg transition-smooth"
              type="button"
            >
              <X className="w-3.5 h-3.5 text-text-tertiary" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-lg shadow-card-hover max-h-60 overflow-auto">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-tertiary">No options found</div>
          ) : (
            filteredOptions.map((option, idx) => (
              <div
                key={`${option.name}-${idx}`}
                onClick={() => {
                  onChange(option.name)
                  setIsOpen(false)
                  setSearchTerm('')
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer transition-smooth ${
                  idx === highlightedIndex
                    ? 'bg-primary-bg text-primary'
                    : value === option.name
                    ? 'bg-primary-bg text-primary'
                    : 'text-text-primary hover:bg-surfaceContainerHigh'
                }`}
              >
                <div className="font-medium">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-text-tertiary mt-0.5">{option.description}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

