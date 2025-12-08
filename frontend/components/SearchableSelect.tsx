'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'

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
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
        className={`flex items-center justify-between w-full h-9 px-3 text-sm border rounded-lg transition-all duration-200 cursor-pointer bg-surface ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20 shadow-sm'
            : 'border-border hover:border-primary/40 hover:shadow-sm focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary'
        }`}
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
            aria-label="Search options"
          />
        ) : (
          <span className={`flex-1 truncate ${!selectedOption ? 'text-text-muted' : 'text-text-primary'}`}>
            {selectedOption?.label || placeholder}
          </span>
        )}
        
        <div className="flex items-center gap-1.5 ml-2">
          {value && !isOpen && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-surfaceContainerHigh rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20"
              type="button"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5 text-text-tertiary hover:text-text-primary" />
            </button>
          )}
          <ChevronDown 
            className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop for better focus */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => {
              setIsOpen(false)
              setSearchTerm('')
            }}
            aria-hidden="true"
          />
          
          {/* Dropdown Menu */}
          <div 
            role="listbox"
            className="absolute z-50 w-full mt-1.5 bg-surface border border-border rounded-lg shadow-lg backdrop-blur-sm bg-surface/95 max-h-60 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <div className="overflow-y-auto max-h-60 custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-sm text-text-tertiary text-center">
                  No options found
                </div>
              ) : (
                filteredOptions.map((option, idx) => {
                  const isSelected = value === option.name
                  const isHighlighted = idx === highlightedIndex
                  
                  return (
                    <div
                      key={`${option.name}-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(option.name)
                        setIsOpen(false)
                        setSearchTerm('')
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3 py-2.5 text-sm cursor-pointer transition-all duration-150 ${
                        isHighlighted || isSelected
                          ? 'bg-primary-bg text-primary'
                          : 'text-text-primary hover:bg-surfaceContainerHigh'
                      } ${idx < filteredOptions.length - 1 ? 'border-b border-border/50' : ''}`}
                    >
                      <div className="font-medium flex items-center gap-2">
                        {option.label}
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-primary ml-auto" aria-hidden="true" />
                        )}
                      </div>
                      {option.description && (
                        <div className="text-xs text-text-tertiary mt-1 leading-relaxed">
                          {option.description}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

