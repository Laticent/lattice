import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import * as React from "react"
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
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
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
  const { onOpenAutoFocus, onCloseAutoFocus } = props
  const returnTo = React.useRef<HTMLElement | null>(null)
  return (
    <SheetPortal>
      {overlay && <SheetOverlay className={overlayClassName} />}
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
        onOpenAutoFocus={(e) => {
          const active = document.activeElement
          returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
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
          el.focus({ preventScroll: true })
        }}
      >
        {children}
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
