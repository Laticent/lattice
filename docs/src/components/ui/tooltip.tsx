import { Tooltip as TooltipPrimitive } from "radix-ui"
import * as React from "react"

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
  ...props
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
  sideOffset?: number
  delayDuration?: number
  className?: string
}) {
  if (label == null || label === "") return <>{props.children}</>
  return <KeyboardFocusTip label={label} {...props} />
}

function KeyboardFocusTip({
  label,
  children,
  side,
  align,
  sideOffset,
  delayDuration,
  className,
}: React.ComponentProps<typeof Tip>) {
  // ON FOCUS, ONLY A KEYBOARD FOCUS. Radix opens a tooltip on any focus that no pointer press just
  // preceded, and that includes focus a surface hands BACK on close: a kept-mounted sheet
  // (ui/persistent-surface.tsx) returns focus to its launcher, and after a tap on a phone the
  // launcher's hint popped up over the toolbar. `:focus-visible` is the browser's own answer to
  // "did this focus come from the keyboard". The open that such a focus asks for is dropped here,
  // in the tooltip's own state, rather than by `preventDefault` on the focus event, which would also
  // switch off the focus handling of any Radix trigger nested in the child (checker review). The
  // test reads the element that took focus, which may be inside a wrapping span. Hover is untouched.
  const [open, setOpen] = React.useState(false)
  const dropOpen = React.useRef(false)
  const onFocusCapture = React.useCallback((e: React.FocusEvent) => {
    let keyboard = true
    try {
      keyboard = (e.target as Element).matches(":focus-visible")
    } catch {
      // An engine without `:focus-visible` keeps Radix's default.
    }
    if (keyboard) return
    // Radix asks to open synchronously, from its own focus handler in this same event.
    dropOpen.current = true
    window.setTimeout(() => {
      dropOpen.current = false
    }, 0)
  }, [])
  const onOpenChange = React.useCallback((next: boolean) => {
    if (next && dropOpen.current) return
    setOpen(next)
  }, [])
  return (
    <Tooltip delayDuration={delayDuration} open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild onFocusCapture={onFocusCapture}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset} className={className}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
