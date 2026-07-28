import { Switch as SwitchPrimitive } from "radix-ui"
import type * as React from "react"

import { cn } from "@/lib/utils"

// The one on/off toggle primitive. Replaces six hand-rolled `role="switch"`
// buttons across the Studio (see engineering/decisions/2026-07-13-native-widget-
// shadcn-ownership.md). Radix supplies the switch role, aria-checked, and
// keyboard handling; the visual matches the studio's pill toggle, with the
// accent-filled track keyed to the palette through the tailwind.css token bridge
// (`bg-primary` → var(--accent)). Same 22×38 geometry as the buttons it retires.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-border",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-[18px] rounded-full bg-white shadow transition-transform",
          "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[2px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
