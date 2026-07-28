import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import type * as React from "react"

import { cn } from "@/lib/utils"

// The one segmented / chip single-select primitive. Replaces the hand-rolled
// `role="radiogroup"` button rows in the Studio (see engineering/decisions/
// 2026-07-13-native-widget-shadcn-ownership.md). Radix supplies the roving
// tabindex, roles, and keyboard nav. Deliberately UNOPINIONATED about the
// selected-item color — a segmented control (bg-primary) and a chip row
// (accent-soft) style `data-[state=on]` differently, so each caller sets it and
// there's no Tailwind on-state collision.
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors",
        // Inset ring so a joined/segmented container's `overflow-hidden` can't clip it.
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
