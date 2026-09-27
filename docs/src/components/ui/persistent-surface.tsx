"use client"

import { Dialog as DialogPrimitive } from "radix-ui"
import { DismissableLayer } from "radix-ui/internal"
import * as React from "react"
import { createPortal, flushSync } from "react-dom"

import { useEverTrue } from "@/components/ui/keep-mounted"
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

/**
 * Make everything outside `keep` inert, except live regions — the toaster among them — which stay
 * reachable so a toast raised while the surface is open is still announced. That is the rule Radix's
 * own `hideOthers` follows for `aria-hidden`. The walk goes down only along the path to a kept node
 * and marks that path's siblings, so an element that merely CONTAINS a live region is not marked
 * whole. Returns what it marked, to be unmarked on close.
 */
function inertOthers(keep: Element): Element[] {
  const kept = [keep, ...document.querySelectorAll("[aria-live]")].filter((el) => !keep.contains(el) || el === keep)
  const onPath = new Set<Element>()
  for (const k of kept) for (let n: Element | null = k; n && n !== document.body; n = n.parentElement) onPath.add(n)
  const marked: Element[] = []
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (kept.includes(child)) continue
      if (onPath.has(child)) walk(child)
      else if (!child.hasAttribute("inert")) {
        child.setAttribute("inert", "")
        marked.push(child)
      }
    }
  }
  walk(document.body)
  return marked
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
  /** The dialog box itself — position, size, animation. `data-state` is `open` or `closed`; a
   *  `data-[state=closed]` exit animation plays before the box is hidden. */
  className?: string
  overlayClassName?: string
  /** Called on a backdrop click, before the close — `PanelSheet`'s "take me to what I can see". */
  onInteractOutside?: () => void
  children: React.ReactNode
}) {
  const ever = useEverTrue(open)
  const titleId = React.useId()
  const descriptionId = React.useId()
  const ids = React.useMemo(() => ({ titleId, descriptionId }), [titleId, descriptionId])
  const rootRef = React.useRef<HTMLDivElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const returnTo = React.useRef<HTMLElement | null>(null)
  // CLOSING: from the close until the exit animation ends, the box stays drawn and stays a
  // dialog, as a Radix dialog does until its Presence unmounts it. Hiding at once dropped main's
  // fade-and-zoom out, and it let a test's "wait until the dialog is gone" pass before the insert
  // it had just made reached the editor.
  const [closing, setClosing] = React.useState(false)
  const [lastOpen, setLastOpen] = React.useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    setClosing(!open)
  }
  React.useEffect(() => {
    if (!closing) return
    // No exit animation to wait for (reduced motion, a class without one): don't strand it drawn.
    const t = window.setTimeout(() => setClosing(false), 400)
    return () => window.clearTimeout(t)
  }, [closing])

  React.useEffect(() => {
    if (!open) return
    const root = rootRef.current
    const box = boxRef.current
    if (!root || !box) return
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // SEEN AGAIN, if a Radix modal hid it. A Radix modal opened after this surface first mounted —
    // the phone's drawer, which is how Add slide is reached there — runs `hideOthers` and marks
    // every child of <body> `aria-hidden`, this root included, because a closed surface is still in
    // the page. Its snapshot is not revisited, so on the second open the gallery was on screen and
    // absent to VoiceOver: `getByRole('dialog', { name: 'Add a slide' })` found nothing (measured by
    // the inversion review). Lift the mark while open and put it back on close, so the modal's own
    // bookkeeping still balances when it closes.
    const hiddenBy = root.getAttribute("aria-hidden")
    if (hiddenBy !== null) root.removeAttribute("aria-hidden")
    const others = inertOthers(root)
    // Into the dialog, unless the caller already put focus somewhere inside it.
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true })
    return () => {
      for (const el of others) el.removeAttribute("inert")
      if (hiddenBy !== null && root.isConnected) root.setAttribute("aria-hidden", hiddenBy)
    }
  }, [open])

  const drawn = open || closing
  // FOCUS GOES BACK once the box is hidden, as Radix does when its Presence unmounts — and only
  // if nothing else took it meanwhile. An insert moves the caret into the new slide a frame after
  // the close; returning focus to the launcher as the close STARTED pulled it back to the old
  // slide, and Compose's view of the deck fell behind the insert (three Compose e2e tests).
  React.useEffect(() => {
    if (drawn) return
    const to = returnTo.current
    returnTo.current = null
    const box = boxRef.current
    const active = document.activeElement
    const unclaimed = !active || active === document.body || (box?.contains(active) ?? false)
    if (to?.isConnected && unclaimed) to.focus({ preventScroll: true })
  }, [drawn])

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
          {closing && (
            <div
              aria-hidden
              data-state="closed"
              className={cn(
                "pointer-events-none fixed inset-0 z-50 bg-black/50 animate-out fade-out-0 [animation-fill-mode:forwards]",
                overlayClassName
              )}
            />
          )}
          <div
            ref={boxRef}
            // A dialog only while open. Closed, it is a hidden subtree that merely keeps its frames
            // alive — nothing should find it as a dialog, including a `[role=dialog]` selector.
            data-slot="persistent-surface-box"
            {...(drawn
              ? { role: "dialog", "aria-modal": true, "aria-labelledby": titleId, "aria-describedby": descriptionId }
              : {})}
            tabIndex={-1}
            data-state={state}
            data-hidden={drawn ? undefined : ""}
            // THE LAST FRAME HOLDS until the box is hidden, as Radix's Presence does it. When an exit
            // animation ends, CSS drops its end state, so for the frame or three before the hide
            // landed, the dialog snapped back to full size and opacity and the sheet back to its open
            // position — a flash like a TV switching off (reported on an iPad; measured on both
            // engines). `forwards` keeps the end state, and flushSync hides the box in the same frame.
            onAnimationEnd={(e) => {
              if (!open && e.target === e.currentTarget) flushSync(() => setClosing(false))
            }}
            // `auto`: the layer above sets `pointer-events: none` on <body> while open, as every
            // Radix modal does, and this box is not inside the layer's own element.
            style={open ? { pointerEvents: "auto" } : undefined}
            className={cn("lx-ui outline-none data-[hidden]:hidden data-[state=closed]:[animation-fill-mode:forwards]", className)}
          >
            <IdsCtx.Provider value={ids}>{children}</IdsCtx.Provider>
          </div>
        </div>,
        document.body
      )}
    </DialogPrimitive.Root>
  )
}
