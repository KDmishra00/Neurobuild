import React from 'react'
import { cn } from '../../lib/utils'

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'block text-sm font-medium text-text2 mb-1.5',
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
    </label>
  )
)

Label.displayName = 'Label'