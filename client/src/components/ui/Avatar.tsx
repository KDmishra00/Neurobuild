import React from 'react'
import { cn } from '../../lib/utils'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

interface AvatarProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  className?: string
}

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root ref={ref} className={cn('relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full', className)} {...props} />
))

Avatar.displayName = AvatarPrimitive.Root.displayName

interface AvatarImageProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> {
  className?: string
}

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  AvatarImageProps
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
))

AvatarImage.displayName = AvatarPrimitive.Image.displayName

interface AvatarFallbackProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> {
  className?: string
}

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  AvatarFallbackProps
>(({ className, children, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-surface2 text-text2 font-medium',
      className
    )}
    {...props}
  >
    {children}
  </AvatarPrimitive.Fallback>
))

AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName