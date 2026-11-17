import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import * as React from "react"
import { focusLauncher, raisesTouchKeyboard, tappedLauncher } from "@/components/ui/focus-return"
import { usePersistentIds } from "@/components/ui/persistent-surface"
import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // Leaves AFTER the sheet (300 ms), for the reason `DialogOverlay` gives (ui/dialog.tsx): an overlay that
        // finished first was mounted again after a sheet still sliding out, on top of it.
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-[400ms] data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/** The box a sheet draws on each side — shared with `PanelSheet`'s persistent variant. */
export function sheetBox(side: "top" | "right" | "bottom" | "left") {
  return cn(
    "fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500",
    side === "right" &&
      "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
    side === "left" &&
      "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
    side === "top" &&
      "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
    side === "bottom" &&
      "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
  )
}

/**
 * WHICH POINTERS ARE DOWN ON A SCRIM, kept outside any one sheet: the scrim a finger touched can be replaced by the next
 * sheet's before the finger lifts (see `SheetContent`). A tap is exactly one pointer, down and up on a scrim, that did not
 * move past `TAP_SLOP` and was not held past `TAP_MAX_MS`. A second finger spoils it, a pointercancel (a scroll) ends it,
 * and every entry carries its event time, so a stale entry (a finger that lifted somewhere else) never matches a later
 * pointer that reuses its id: it is pruned at the next pointerdown. When the last scrim unmounts, the record is cleared,
 * unless another mounted in its place in the same commit (the swap a tap has to survive).
 */
const scrimPointers = new Map<number, number>()
let scrimTap: { id: number; x: number; y: number; t: number } | null = null
let scrimsMounted = 0
/** How far a pointer may move between down and up and still be a tap, in CSS pixels. */
const TAP_SLOP = 10
/** How long a pointer may stay down and still be a tap, in ms; longer is a press, and older entries are pruned. */
const TAP_MAX_MS = 1000

function scrimPointerDown(e: React.PointerEvent): void {
  for (const [id, t] of scrimPointers) if (e.timeStamp - t > TAP_MAX_MS) scrimPointers.delete(id)
  scrimPointers.set(e.pointerId, e.timeStamp)
  scrimTap = scrimPointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null
}

/** Whether this pointerup completes a tap; it consumes the record either way. */
function scrimPointerUp(e: React.PointerEvent): boolean {
  scrimPointers.delete(e.pointerId)
  const tap = scrimTap
  if (!tap || tap.id !== e.pointerId) return false
  scrimTap = null
  if (scrimPointers.size > 0) return false
  if (e.timeStamp - tap.t > TAP_MAX_MS) return false
  return Math.abs(e.clientX - tap.x) <= TAP_SLOP && Math.abs(e.clientY - tap.y) <= TAP_SLOP
}

function scrimPointerCancel(e: React.PointerEvent): void {
  scrimPointers.delete(e.pointerId)
  scrimTap = null
}

/** A scrim mounted; the returned function is its unmount. */
function scrimMounted(): () => void {
  scrimsMounted++
  return () => {
    scrimsMounted--
    queueMicrotask(() => {
      if (scrimsMounted > 0) return
      scrimPointers.clear()
      scrimTap = null
    })
  }
}

/** For tests: forget every pointer, as a fresh page would. */
export function resetScrimPointers(): void {
  scrimPointers.clear()
  scrimTap = null
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  overlay = true,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  /** Render the dimming backdrop. Set false for a non-modal sheet (`modal={false}`
   * on the Root) so the page behind stays interactive and is NOT scroll-locked —
   * a modal scroll-lock lingers on iOS Safari and freezes the surface behind. */
  overlay?: boolean
  /** Extra classes for the backdrop — e.g. switching its fade-in off. */
  overlayClassName?: string
}) {
  // FOCUS GOES BACK TO WHAT OPENED THE SHEET. A modal Radix dialog returns focus only to its
  // <SheetTrigger>, and most sheets here open from a plain button (the phone's ⋯ Menu, the bar
  // icons), so closing one dropped focus to <body>: a keyboard or screen-reader user lost their
  // place. Measured on the phone drawer, Escape left `document.activeElement` on <body>
  // (e2e/studio-mount-on-open.spec.ts). So remember what held focus when the sheet opened and
  // return there, when it is still in the page AND nothing else has taken focus since: a click
  // into the editor that dismissed a non-modal sheet keeps the editor focused (Radix's own
  // non-modal rule), and a child sheet opened from a drawer row keeps its focus. That is the
  // `PersistentSurface` rule (persistent-surface.tsx, "only if nothing else took it meanwhile").
  // A caller that handles the close itself (calls preventDefault) keeps the last word; an opener
  // that is gone (a drawer row that launched this sheet) falls back to Radix's own behavior.
  const { onOpenAutoFocus, onCloseAutoFocus, onPointerDownOutside, onInteractOutside } = props
  const returnTo = React.useRef<HTMLElement | null>(null)
  const launcher = React.useRef<HTMLElement | null>(null)
  // A TAP ON THE SCRIM IS AN OUTSIDE TAP FROM THE SHEET'S FIRST FRAME, AND IT IS READ FROM THE POINTER, NOT FROM A CLICK.
  // Radix starts listening for a pointer down outside the dialog only a `setTimeout(0)` after it mounts
  // (@radix-ui/react-dismissable-layer), and on touch it waits for the `click` that follows. A sheet that mounts already in
  // place has no motion to hide that gap: a lazy panel's real sheet replaces its loading sheet with the enter animation off
  // (`PanelLoader`), so the scrim a finger went down on is gone before the finger lifts. Mobile Safari then sends no `click`
  // at all (the iOS Simulator logged pointerdown, touchstart, pointerup, touchend and nothing after, on every lost tap), and
  // a phone's deck tap on a just-loaded Library did nothing (e2e/back-gesture.spec.ts:172; the iOS deck-tap probe).
  // So the tap is the pointer's own sequence. A scrim's pointers are tracked OUTSIDE any one sheet (`scrimPointers`), so a
  // pointerup on the scrim that replaced it completes the tap; a moved, held, cancelled or second finger is not a tap.
  // The tap is put through the SAME decision Radix would have made: the caller's `onPointerDownOutside` and
  // `onInteractOutside` see an outside event, and the sheet closes through Radix's own Close only if neither prevented it.
  // When Radix reports the tap first (a mouse, once it listens), it decides and the record is dropped; when it reports the
  // same tap after this did (its touch path, on the click), its report is prevented and not passed on, so a caller hears
  // each tap once and the sheet never closes twice.
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const closeRef = React.useRef<HTMLButtonElement | null>(null)
  const decided = React.useRef(false)
  type Outside = Parameters<NonNullable<typeof onPointerDownOutside>>[0]
  React.useEffect(() => (overlay ? scrimMounted() : undefined), [overlay])
  const onScrimPointerUp = (e: React.PointerEvent) => {
    if (!scrimPointerUp(e)) return
    if (contentRef.current?.getAttribute("data-state") !== "open") return
    const outside = new CustomEvent("dismissableLayer.pointerDownOutside", { bubbles: false, cancelable: true, detail: { originalEvent: e.nativeEvent } })
    decided.current = true
    onPointerDownOutside?.(outside as unknown as Outside)
    onInteractOutside?.(outside as unknown as Outside)
    if (!outside.defaultPrevented) closeRef.current?.click()
  }
  return (
    <SheetPortal>
      {overlay && (
        <SheetOverlay
          className={overlayClassName}
          onPointerDown={(e) => {
            decided.current = false
            scrimPointerDown(e)
          }}
          onPointerUp={onScrimPointerUp}
          onPointerCancel={scrimPointerCancel}
        />
      )}
      <SheetPrimitive.Content
        // NO DESCRIPTION ON THE DIALOG. On an iPhone, VoiceOver read a dialog's description again after every
        // control inside it (owner, PR #3108: "Run a command or jump somewhere in the Studio" after each
        // palette row). So a dialog is named, not described: a visible description stays on screen and is
        // reached by swiping, but is not wired as the dialog's `aria-describedby`. A caller can still pass
        // one; an AlertDialog (ui/alert-dialog.tsx) keeps Radix's, because there the text IS the question.
        // engineering/gotchas/studio-playground.md "A dialog's description is read after every control".
        aria-describedby={undefined}
        data-slot="sheet-content"
        className={cn(
          // lx-ui carries the scoped reset (tailwind.css) into the Radix portal,
          // which mounts outside the island root. Keep first.
          "lx-ui",
          sheetBox(side),
          className
        )}
        {...props}
        ref={(el: HTMLDivElement | null) => {
          contentRef.current = el
          // A caller's own ref (a prop in React 19) still gets the element.
          const callerRef = (props as { ref?: React.Ref<HTMLDivElement> }).ref
          if (typeof callerRef === "function") callerRef(el)
          else if (callerRef) (callerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        onPointerDownOutside={(e) => {
          // This tap was already decided on the scrim's pointerup: Radix's later report of it changes nothing.
          if (decided.current) {
            e.preventDefault()
            return
          }
          // Radix saw this tap first: it decides, and the scrim's record stands down.
          scrimTap = null
          onPointerDownOutside?.(e)
        }}
        onInteractOutside={(e) => {
          if (decided.current) {
            decided.current = false
            e.preventDefault()
            return
          }
          onInteractOutside?.(e)
        }}
        onOpenAutoFocus={(e) => {
          // A tap decided on the scrim that Radix never reported (no click came) is not carried into the next opening.
          decided.current = false
          const active = document.activeElement
          returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
          launcher.current = tappedLauncher()
          onOpenAutoFocus?.(e)
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          const el = returnTo.current
          returnTo.current = null
          if (e.defaultPrevented || !el?.isConnected) return
          const active = document.activeElement
          const box = e.currentTarget
          const unclaimed = !active || active === document.body || (box instanceof Node && box.contains(active))
          if (!unclaimed) return
          e.preventDefault()
          // Not into a text field on a touch screen: it can raise the keyboard. The control that opened the sheet
          // takes focus instead, when it is still there (focus-return.ts).
          const from = launcher.current
          launcher.current = null
          if (raisesTouchKeyboard(el)) {
            focusLauncher(from)
            return
          }
          el.focus({ preventScroll: true })
        }}
      >
        {children}
        {/* The scrim's close (above): Radix's own Close, so a close it makes is reported as Radix reports any. */}
        <SheetPrimitive.Close ref={closeRef} hidden tabIndex={-1} aria-hidden="true" />
        {/* DEVIATION from the vendored base, matching `dialog.tsx`: on a coarse
            pointer the close grows to a 44×44 target with the glyph left exactly
            where it was. See that file for the reasoning. (#1211)

            SECOND DEVIATION: the BASE target is 24×24, not the vendored bare 16px
            glyph. `pointer-coarse` covers a phone, but the mobile menu is also the
            navigation at a 390px-wide window on a laptop — a FINE pointer, where the
            close stayed 16×16 and missed WCAG 2.2's 2.5.8 minimum (measured with axe
            `target-size` on the opened menu, which is a surface no first-paint scan
            reaches). `top-3 right-3` + `size-6` re-centers a 24px box on the glyph's
            old position, so nothing moves. */}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-3 right-3 grid size-6 place-items-center rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary pointer-coarse:top-0.5 pointer-coarse:right-0.5 pointer-coarse:grid pointer-coarse:size-11 pointer-coarse:place-items-center">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  const persistentIds = usePersistentIds()
  return (
    <SheetPrimitive.Title
      // Inside a PersistentSurface the dialog element is ours, so its label ids are too.
      {...(persistentIds ? { id: persistentIds.titleId } : {})}
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
}
