"use client"

import * as React from "react"
import { createPortal } from "react-dom"

/** The layer is gone by the time the tap's own `click` fires, so that click would land on whatever
 *  sat under it: a button, a tab, another trigger. Under a modal list the tap was never meant to
 *  reach the page, so the one click this gesture produces is dropped, and only that one. A swipe
 *  or long press produces no click at all, so the guard also stands down when the gesture is
 *  cancelled or the next one starts: the next real tap always gets through. */
function swallowNextClick() {
  const drop = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    done()
  }
  const done = () => {
    window.clearTimeout(timer)
    document.removeEventListener("click", drop, true)
    document.removeEventListener("pointercancel", done, true)
    document.removeEventListener("pointerdown", done, true)
  }
  document.addEventListener("click", drop, true)
  document.addEventListener("pointercancel", done, true)
  // Added while this gesture's own pointerdown is at its target, so only the NEXT one reaches it.
  document.addEventListener("pointerdown", done, true)
  // A tap's click follows within ~300ms. Never hold on longer.
  const timer = window.setTimeout(done, 800)
}

/**
 * A see-through layer under an open modal list (a Select, a DropdownMenu) that closes it on a
 * tap anywhere outside it.
 *
 * WHY. A modal Radix list sets `pointer-events: none` on `<body>` while it is open, so a tap
 * outside it only closes it. Chromium hands that tap to `<html>`, and Radix's outside handler
 * closes the list. WebKit hit-tests nothing and delivers NO event at all, so on iOS Safari and
 * iPadOS a tap on blank space or a label left the list open, and the next tap on another
 * trigger opened a second list over the first. Measured in Playwright WebKit on the phone's
 * Settings sheet: zero pointer, touch or click events reached the document for that tap.
 *
 * This layer is the tap's target. It sits one step below the list (`z-[49]` under the list's
 * `z-50`) with its own `pointer-events: auto`, and closes on `pointerdown`, the same moment a
 * mouse closes the list on desktop. A tap on another trigger, a tab or a button therefore only
 * closes the open list, which is how the desktop behaves too.
 */
export function TapAway({ onTap }: { onTap: () => void }) {
  if (typeof document === "undefined") return null
  return createPortal(
    <div
      aria-hidden
      data-slot="tap-away"
      className="pointer-events-auto fixed inset-0 z-[49]"
      onPointerDown={(e) => {
        e.preventDefault()
        swallowNextClick()
        onTap()
      }}
    />,
    document.body
  )
}

/** Open state for a Radix root that may or may not be controlled, so the root can draw a
 *  `TapAway` while it is open without taking control away from a caller that passes `open`. */
export function useOpenState(
  open: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined
): [boolean, (open: boolean) => void] {
  const [own, setOwn] = React.useState(defaultOpen ?? false)
  const value = open ?? own
  // The latest state, ahead of the next render. A tap on the layer closes the list, and Radix's
  // own outside-pointerdown handler sees the same press and closes it too, in the same event: the
  // owner hears one change, never a second `false` (a toggling owner would reopen the list).
  const latest = React.useRef(value)
  latest.current = value
  const set = React.useCallback(
    (next: boolean) => {
      if (next === latest.current) return
      latest.current = next
      if (open === undefined) setOwn(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange]
  )
  return [value, set]
}
