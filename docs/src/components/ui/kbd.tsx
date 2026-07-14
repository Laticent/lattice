import * as React from "react"

import { cn } from "@/lib/utils"

// The one keyboard-shortcut chip. Replaces the copy-pasted
// `rounded border border-border bg-background px-1.5 font-mono text-[…]` spans
// scattered across the Studio + site chrome (the ⌘K hints on StudioShell,
// NavActions, the command palette). Not a Radix primitive — a shortcut chip is
// a styled semantic `<kbd>`, nothing more. Color rides the token bridge
// (`border`, `bg-muted`, `text-muted-foreground`), so it respects palette +
// color mode. `KbdGroup` lays out a multi-key combo (⌘ + K) with even spacing.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
