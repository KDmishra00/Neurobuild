import React from 'react'
import { cn } from '../../lib/utils'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const selectId = id || props.name

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-text2 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full px-3 py-2 pr-8 rounded-lg bg-surface2 border border-border text-text placeholder-text3 appearance-none',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
              'disabled:bg-surface disabled:cursor-not-allowed disabled:opacity-50',
              'transition-colors duration-150',
              error && 'border-red-500 focus:ring-red-500',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          >
            {!!placeholder && <option value="" disabled>Select a value</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value} className="bg-surface text-text">
                {option.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-400" role="alert">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'