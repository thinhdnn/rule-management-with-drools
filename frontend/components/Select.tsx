'use client'

import { ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  className?: string
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div className={`relative ${className}`}>
        <select
          ref={ref}
          {...props}
          className="appearance-none w-full h-9 px-3 pr-9 text-sm rounded-lg border border-border bg-surface text-text-primary transition-all duration-200 cursor-pointer hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border"
        >
          {children}
        </select>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none"
          aria-hidden="true"
        />
      </div>
    )
  }
)

Select.displayName = 'Select'

