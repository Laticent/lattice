import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import type * as React from "react"

import { cn } from "@/lib/utils"

// The one "pick EXACTLY one" primitive — a real ARIA `radiogroup` (Radix
// RadioGroup.Root emits role="radiogroup"; items get role="radio"), unlike
// ToggleGroup (role="group" + zero-or-one). Use this for segmented controls that
// must always keep one selected and never deselect; use ui/toggle-group for the
// zero-or-one chip case. Deliberately UNOPINIONATED about item styling — callers
// render segments/pills and set the `data-[state=checked]` look — so one primitive
// serves the Studio's several segmented controls (see engineering/decisions/
// 2026-07-13-native-widget-shadcn-ownership.md).
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-colors",
        // Inset ring so a joined/segmented container's `overflow-hidden` can't clip it.
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
