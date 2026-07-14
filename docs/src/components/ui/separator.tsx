import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// The one divider primitive. Replaces hand-rolled `border-t`/`border-b` rule
// <div>s across the Studio (see engineering/decisions/2026-07-13-native-widget-
// shadcn-ownership.md). Radix supplies the correct role: a decorative rule is
// aria-hidden (`decorative`, the default here), a semantic one gets
// `role="separator"` + orientation. Color rides the token bridge (`bg-border`
// → var(--border)), so it respects the palette + color mode like every other
// primitive.
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // Set only the THICKNESS + color; the caller (or a flex parent's
        // stretch) owns the LENGTH. shadcn's default hardcodes w-full/h-full,
        // which fights our callers that size a rule explicitly (a `flex-1`
        // header rule, a fixed `h-5` toolbar tick) via a Tailwind class clash.
        // Leaving length to the caller makes one primitive fit every divider.
        "shrink-0 bg-border",
        "data-[orientation=horizontal]:h-px data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
