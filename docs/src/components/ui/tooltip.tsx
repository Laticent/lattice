import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// The one hover/focus hint primitive. Replaces native `title=` on icon-only
// controls across the live Studio + site chrome (see engineering/decisions/
// 2026-07-13-native-widget-shadcn-ownership.md). Native `title` is accessible
// but unstyled, color-mode-blind, and touch-blind; Radix Tooltip gives a
// themed surface, a hover/focus delay, and keyboard reachability.
//
// Surface deliberately matches the popover/dropdown language — `bg-popover`,
// `border`, `shadow-md` on the token bridge — so every floating surface reads as
// one system in both color modes (no loud accent fill on a utilitarian hint).
// No arrow: a bordered translucent surface can't render a seamless arrow, and a
// clean floating chip is the more boardroom-restrained choice.

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  // Self-provide so a caller can drop in a single <Tooltip> without wiring a
  // root <TooltipProvider>; nesting providers is safe (Radix dedupes context).
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // lx-ui carries the scoped reset into the Radix portal (mounted
          // outside the island root). Keep first — same as popover-content.
          "lx-ui",
          "z-50 max-w-64 rounded-md border bg-popover px-2 py-1 text-[12px] font-medium text-popover-foreground shadow-md",
          "origin-(--radix-tooltip-content-transform-origin) outline-hidden",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

// Convenience wrapper for the overwhelmingly common case: a single icon control
// that wants a themed hint in place of a native `title=`. Keeps the migration a
// one-line wrap (`<Tip label="Collapse">{button}</Tip>`) instead of a four-node
// Tooltip tree at every call site. Keep the child's own `aria-label` for the
// accessible NAME — the tooltip is the DESCRIPTION (Radix wires aria-describedby).
function Tip({
  label,
  children,
  side,
  align,
  sideOffset,
  delayDuration,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
  sideOffset?: number
  delayDuration?: number
  className?: string
}) {
  if (label == null || label === "") return <>{children}</>
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset} className={className}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Tip }
