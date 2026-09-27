import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: string
  description?: string
}

export function Dialog({ open, onOpenChange, children, title, description }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-xl shadow-xl p-0 animate-slide-up"
        >
          {(title || description) && (
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
              <div>
                {title && <DialogPrimitive.Title className="text-lg font-semibold text-text">{title}</DialogPrimitive.Title>}
                {description && <DialogPrimitive.Description className="text-sm text-text2 mt-1">{description}</DialogPrimitive.Description>}
              </div>
              <DialogPrimitive.Close
                className="flex-shrink-0 p-1 rounded-lg text-text3 hover:text-text hover:bg-surface2 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>
          )}
          <div className="p-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  variant?: 'default' | 'destructive'
}

export function AlertDialog({ open, onOpenChange, title, description, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, variant = 'default' }: AlertDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-xl shadow-xl p-0 animate-slide-up">
          <div className="px-6 py-4 border-b border-border">
            <DialogPrimitive.Title className="text-lg font-semibold text-text">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-text2 mt-1">{description}</DialogPrimitive.Description>
          </div>
          <div className="px-6 py-4 flex justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-text2 bg-surface2 border border-border rounded-lg hover:bg-surface3 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => { onConfirm(); onOpenChange(false); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                variant === 'destructive'
                  ? 'bg-red-900/50 text-red-100 border border-red-500 hover:bg-red-900/70'
                  : 'bg-accent text-white hover:bg-accent2'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}