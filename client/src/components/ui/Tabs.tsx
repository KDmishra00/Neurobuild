import React from 'react'
import { cn } from '../../lib/utils'
import * as TabsPrimitive from '@radix-ui/react-tabs'

interface TabsProps {
  defaultValue: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultValue, onValueChange, children, className }: TabsProps) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue} onValueChange={onValueChange} className={cn('w-full', className)}>
      {children}
    </TabsPrimitive.Root>
  )
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'flex gap-1 bg-surface2 p-1 rounded-lg',
      className
    )}
{...props}
  >
    {children}
  </TabsPrimitive.List>
))

TabsList.displayName = TabsPrimitive.List.displayName

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  icon?: React.ReactNode
}

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, icon, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex items-center gap-2 px-4 py-2 text-sm font-medium text-text3 rounded-md',
      'hover:text-text hover:bg-surface3 transition-colors',
      'data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
      className
    )}
    {...props}
  >
    {icon && <span className="flex-shrink-0">{icon}</span>}
    {children}
  </TabsPrimitive.Trigger>
))

TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-2 ring-0 focus-visible:ring-0', className)}
    {...props}
  />
))

TabsContent.displayName = TabsPrimitive.Content.displayName