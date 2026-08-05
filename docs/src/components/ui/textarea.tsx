import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * AUTOSIZE. shadcn's own growth mechanism is the `field-sizing-content` class in the base
 * style below — one CSS property, no JS, and exactly right where it works. It is
 * Chromium-only: Safari and Firefox have not shipped `field-sizing`, so on an iPad (a
 * first-class Studio surface) the box simply never grows. `autosize` adds the measured
 * fallback — set height from `scrollHeight`, clamped to `maxRows` — so the behavior is the
 * same everywhere, and turns the CSS off while it does so the two can't fight over height.
 *
 * Kept ON THE PRIMITIVE rather than in a per-surface wrapper (HARD RULE #15): the chat
 * composer is the first caller, not the only conceivable one.
 */
function Textarea({
  className,
  autosize = false,
  maxRows = 4,
  ref,
  value,
  ...props
}: React.ComponentProps<"textarea"> & {
  /** Grow with the content, measured in JS so it works outside Chromium too. */
  autosize?: boolean
  /** Ceiling, in rows, before the field scrolls internally. */
  maxRows?: number
}) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null)
  const attach = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el
    },
    [ref]
  )

  const measure = React.useCallback(() => {
    const el = inner.current
    if (!autosize || !el) return
    // A field that isn't laid out yet (a panel still closed, a sheet mid-transition) reports
    // a meaningless scrollHeight against a zero-ish width. Measuring then and never again
    // freezes the box at that wrong height, because the value hasn't changed since. Skip it
    // and let the ResizeObserver below fire once width becomes real.
    if (!el.offsetWidth) return
    const cs = getComputedStyle(el)
    // `line-height: normal` computes to that string, not a length — fall back to a ratio
    // rather than propagating NaN into the height (which collapses the field entirely).
    const line = Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.4 || 16
    const pad = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0)
    const border = (Number.parseFloat(cs.borderTopWidth) || 0) + (Number.parseFloat(cs.borderBottomWidth) || 0)
    const ceiling = line * maxRows + pad + border
    // Collapse first, so shrinking on delete works — `scrollHeight` never reports smaller
    // than the height already set.
    el.style.height = "auto"
    const wanted = el.scrollHeight + border
    el.style.height = `${Math.min(wanted, ceiling)}px`
    el.style.overflowY = wanted > ceiling ? "auto" : "hidden"
  }, [autosize, maxRows])

  // Re-measure on every value change. Layout effect, not effect: resizing after paint
  // shows the caret at the wrong height for a frame when a fast typist wraps a line.
  // `value` looks unused to the linter — `measure` reads the DOM, not the prop — but it is
  // the whole trigger: without it the box never re-measures as you type.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the intended trigger; `measure` reads the element.
  React.useLayoutEffect(measure, [measure, value])

  // WIDTH changes re-wrap the text, so they change the height as surely as typing does —
  // a resizable panel, a rotated tablet, a sheet opening. Value-only re-measurement leaves
  // the box at the old line count until the next keystroke.
  React.useLayoutEffect(() => {
    const el = inner.current
    if (!autosize || !el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [autosize, measure])

  return (
    <textarea
      ref={attach}
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        // The CSS mechanism, only when JS isn't doing the job — otherwise both set height.
        !autosize && "field-sizing-content",
        className
      )}
      value={value}
      {...props}
    />
  )
}

export { Textarea }
