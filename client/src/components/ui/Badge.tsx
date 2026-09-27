import React from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
  size?: 'sm' | 'md'
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-accent/20 text-accent border-accent/30',
      success: 'bg-green-900/30 text-green-300 border-green-500/30',
      warning: 'bg-yellow-900/30 text-yellow-300 border-yellow-500/30',
      danger: 'bg-red-900/30 text-red-300 border-red-500/30',
      info: 'bg-blue-900/30 text-blue-300 border-blue-500/30',
      outline: 'bg-transparent text-text2 border-border',
    }

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full border transition-colors',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'