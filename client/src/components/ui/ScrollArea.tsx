import React from 'react'
import { cn } from '../../lib/utils'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  className?: string
}

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative', className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

function ScrollBar() {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar orientation="vertical" className="flex h-full w-2.5">
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border/50 hover:bg-border transition-colors" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

interface ScrollAreaHorizontalProps extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  className?: string
}

export const ScrollAreaHorizontal = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaHorizontalProps
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative', className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.ScrollAreaScrollbar orientation="horizontal" className="flex w-full h-2.5">
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative h-full flex-1 rounded-full bg-border/50 hover:bg-border transition-colors" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))