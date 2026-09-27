"use client"

import * as React from "react"

/**
 * Helpers for a surface that STAYS MOUNTED once it has been shown, and is only hidden after that:
 * `PersistentSurface`, the Studio's settings dock and Present's slide overview. They exist for one
 * reason — WebKit never frees a preview document whose frame is destroyed, so a surface of live
 * slide previews that unmounts on close strands its documents on every reopen
 * (`engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md` §5).
 */

/** True from the first render where `on` is true, for the rest of the component's life. */
export function useEverTrue(on: boolean): boolean {
  const [ever, setEver] = React.useState(on)
  if (on && !ever) setEver(true)
  return ever || on
}

/**
 * A counter that goes up each time `on` turns true. Key a kept surface's CONTENT on it, and every
 * show starts that content fresh — open sections, local toggles, a half-typed field — exactly as the
 * remount on main did, while whatever sits OUTSIDE the key (a `PreviewPool` and its frames) lives on.
 */
export function useShowCount(on: boolean): number {
  const [count, setCount] = React.useState(on ? 1 : 0)
  const [was, setWas] = React.useState(on)
  if (was !== on) {
    setWas(on)
    if (on) setCount((c) => c + 1)
  }
  return count
}

/**
 * Renders `children`, but skips every re-render while `active` stays false. A kept surface is
 * built from its parent's state, so without this every keystroke in the editor re-rendered a
 * hidden gallery nobody could see (Add slide measured 1.10 s of script for 49 characters against
 * 0.69 s on main). It catches up in the render that turns it active.
 */
export const Frozen = React.memo(
  function Frozen({ children }: { active: boolean; children: React.ReactNode }) {
    return <>{children}</>
  },
  (prev, next) => !prev.active && !next.active
)

/**
 * Scrolls `target` to the top when it mounts. Key it on a show counter and render it INSIDE the
 * kept content, not beside it: it then runs in the render where that content is visible again. A
 * reset run from the parent can land while the content is still `display: none` — the settings dock
 * becomes visible one render after it opens — and scrolling a box with no layout does nothing.
 */
export function ScrollTopOnMount({ target }: { target: React.RefObject<HTMLElement | null> }) {
  React.useLayoutEffect(() => {
    if (target.current) target.current.scrollTop = 0
  }, [target])
  return null
}
