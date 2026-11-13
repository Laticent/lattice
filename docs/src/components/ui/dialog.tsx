"use client"

import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import type * as React from "react"
import { Button } from "@/components/ui/button"
import { usePersistentIds } from "@/components/ui/persistent-surface"
import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// THE OVERLAY LEAVES LAST. Radix portals the overlay and the box SEPARATELY, each kept mounted until its own exit
// animation ends. The overlay's fade (150 ms) used to end before the box's zoom (`duration-200`), so a dialog opened
// again inside that gap reused the box still on its way out and mounted a NEW overlay, appended to <body> after the
// box: same z-index, later in the page, so the dimming sat ON the dialog and a click on its button closed it instead
// (adding photos one after another, e2e/library-images-render.spec.ts). Exiting after the box keeps the order right in
// every case: inside the gap both are reused, past it only the overlay is, and it is still the earlier node. Animations
// on one document timeline end in the order of their end times, so this does not depend on the machine's speed.
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/** The box every centered dialog draws — shared with the persistent Add slide dialog. */
export const DIALOG_BOX =
  "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg"

/** The corner close control, shared with the persistent Add slide dialog. */
export function DialogCloseButton() {
  return (
      <DialogPrimitive.Close
        data-slot="dialog-close"
        // DEVIATION from the vendored shadcn base (like `sonner.tsx`'s two, marked
        // in place). The base is `absolute top-4 right-4` around a bare 16px glyph —
        // a 16×16 hit area, well under the 44px touch floor the rest of the chrome
        // holds, on EVERY dialog in the app. On a coarse pointer the button becomes a
        // 44×44 grid and its inset drops 16px→2px, which leaves the glyph's center
        // exactly where it was (24px from each edge) while the target reaches the
        // floor. Fine pointers keep the base verbatim. (#1211)
        className="absolute top-3 right-3 grid size-6 place-items-center rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground pointer-coarse:top-0.5 pointer-coarse:right-0.5 pointer-coarse:grid pointer-coarse:size-11 pointer-coarse:place-items-center [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  alert = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** A confirmation whose text IS the question ("Delete everything? … It cannot be undone."):
   *  `role="alertdialog"`, and its DialogDescription stays wired, so it is read when the dialog
   *  opens. Only a button or two follow, so nothing is repeated at length. */
  alert?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        // NO DESCRIPTION ON THE DIALOG. On an iPhone, VoiceOver read a dialog's description again after every
        // control inside it (owner, PR #3108: "Run a command or jump somewhere in the Studio" after each
        // palette row). So a dialog is named, not described: a visible description stays on screen and is
        // reached by swiping, but is not wired as the dialog's `aria-describedby`. A caller can still pass
        // one; a confirmation (`alert`) keeps Radix's, because there the text IS the question.
        // engineering/gotchas/studio-playground.md "A dialog's description is read after every control".
        {...(alert ? { role: "alertdialog" } : { "aria-describedby": undefined })}
        data-slot="dialog-content"
        className={cn(
          // lx-ui carries the scoped reset (tailwind.css) into the Radix portal,
          // which mounts outside the island root. Keep first.
          "lx-ui",
          DIALOG_BOX,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && <DialogCloseButton />}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const persistentIds = usePersistentIds()
  return (
    <DialogPrimitive.Title
      // Inside a PersistentSurface the dialog element is ours, so its label ids are too.
      {...(persistentIds ? { id: persistentIds.titleId } : {})}
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
