"use client"

import { Dialog as DialogPrimitive } from "radix-ui"
import { DismissableLayer } from "radix-ui/internal"
import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * A modal surface that STAYS MOUNTED after its first open — hidden while closed, never torn down.
 *
 * WHY. WebKit never frees a preview document once its frame is destroyed, so a surface full of
 * live slide previews (Add slide's gallery) stranded ~45 MB on every close and reopen on Safari and
 * iPad (`engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md` §5). Kept mounted,
 * its frames — and their documents — are simply reused on the next open. The frames stay INSIDE the
 * surface's own scroller, so iOS scrolls them natively with their tiles: the design this replaced
 * kept them in a shared layer outside the surface and pinned them to their tiles with CSS anchor
 * positioning, and on a real iPad the previews trailed their cards and snapped back on every fast
 * scroll.
 *
 * WHY NOT A FORCE-MOUNTED RADIX DIALOG. A Radix modal content runs `hideOthers` on mount, so a closed
 * one would hide the whole Studio from assistive tech. A non-modal one still mounts a
 * DismissableLayer, and a closed layer that happens to be the highest one answers Escape for the
 * whole page and calls `preventDefault()` on it — the Studio's deck navigation honors
 * `defaultPrevented`, so a hidden layer would quietly eat keys. So this renders its OWN dialog
 * element and does the modal work itself, only while open:
 *  - `inert` on every other child of `<body>`: keyboard focus and assistive tech stay inside;
 *  - focus moves in on open and returns to where it came from on close;
 *  - the backdrop closes it on a click;
 *  - the backdrop is a Radix DismissableLayer, mounted ONLY while open. It holds no state, so
 *    mounting it costs nothing, and it puts this surface on top of Radix's layer stack. That stack
 *    is why it is needed: the phone opens Add slide over the Deck sheet, a Radix modal. Outside the
 *    stack, the Deck sheet stayed the highest layer — it took Escape, it read a tap on a tile as a
 *    tap outside itself, and its pointer lock on `<body>` reached this surface (measured on the
 *    phone viewport before the layer was added). As the top layer this surface takes Escape
 *    first — after any menu opened from inside it, which sits higher still — and shields the
 *    layers below from its taps. Outside-pointer dismissal is left to the backdrop's own click.
 * It still sits inside a Radix `Dialog.Root`, which renders no DOM, so the shared `DialogTitle`,
 * `SheetTitle` and `*Close` pieces keep working inside it; the titles take their ids from here.
 */
const IdsCtx = React.createContext<{ titleId: string; descriptionId: string } | null>(null)

/** The ids a Title / Description inside a persistent surface must carry. Null elsewhere. */
export function usePersistentIds() {
  return React.useContext(IdsCtx)
}

/** True from the first render where `open` is true, for the rest of the component's life. */
function useEverOpened(open: boolean): boolean {
  const [ever, setEver] = React.useState(open)
  if (open && !ever) setEver(true)
  return ever || open
}

export function PersistentSurface({
  open,
  onOpenChange,
  className,
  overlayClassName,
  onInteractOutside,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The dialog box itself — position, size, animation. `data-state` is `open` or `closed`. */
  className?: string
  overlayClassName?: string
  /** Called on a backdrop click, before the close — `PanelSheet`'s "take me to what I can see". */
  onInteractOutside?: () => void
  children: React.ReactNode
}) {
  const ever = useEverOpened(open)
  const titleId = React.useId()
  const descriptionId = React.useId()
  const ids = React.useMemo(() => ({ titleId, descriptionId }), [titleId, descriptionId])
  const rootRef = React.useRef<HTMLDivElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const root = rootRef.current
    const box = boxRef.current
    if (!root || !box) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const others = [...document.body.children].filter((el) => el !== root && !el.hasAttribute("inert"))
    for (const el of others) el.setAttribute("inert", "")
    // Into the dialog, unless the caller already put focus somewhere inside it.
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true })
    return () => {
      for (const el of others) el.removeAttribute("inert")
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true })
    }
  }, [open])

  if (!ever || typeof document === "undefined") return null
  const state = open ? "open" : "closed"
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      {createPortal(
        <div ref={rootRef} data-slot="persistent-surface" className="contents">
          {open && (
            <DismissableLayer.Root
              aria-hidden
              data-state={state}
              disableOutsidePointerEvents
              onEscapeKeyDown={() => onOpenChange(false)}
              // Taps inside the box, and in anything opened from it, are not "outside"; the
              // backdrop's click below is the one outside dismissal.
              onPointerDownOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
              onClick={() => {
                onInteractOutside?.()
                onOpenChange(false)
              }}
              className={cn(
                "fixed inset-0 z-50 bg-black/50 animate-in fade-in-0",
                overlayClassName
              )}
            />
          )}
          <div
            ref={boxRef}
            // A dialog only while open. Closed, it is a hidden subtree that merely keeps its frames
            // alive — nothing should find it as a dialog, including a `[role=dialog]` selector.
            data-slot="persistent-surface-box"
            {...(open
              ? { role: "dialog", "aria-modal": true, "aria-labelledby": titleId, "aria-describedby": descriptionId }
              : {})}
            tabIndex={-1}
            data-state={state}
            // `auto`: the layer above sets `pointer-events: none` on <body> while open, as every
            // Radix modal does, and this box is not inside the layer's own element.
            style={open ? { pointerEvents: "auto" } : undefined}
            className={cn("lx-ui outline-none data-[state=closed]:hidden", className)}
          >
            <IdsCtx.Provider value={ids}>{children}</IdsCtx.Provider>
          </div>
        </div>,
        document.body
      )}
    </DialogPrimitive.Root>
  )
}
