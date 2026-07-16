---
status: in-progress
summary: The chart detail reveal (hover/tap a mark → its detail card) was a hand-rolled `.db-pp-chartpop` div positioned by Floating UI under the chart's disc, shared by the Playground and the frozen Drawing Board. Owner direction: use the real shadcn component (the richer one — Popover), and put the card at the cursor, not the chart centre. Fix keeps `chart-interact.js` as the cross-iframe geometry/data engine but inverts the popover RENDER: it now freezes the cursor point at reveal (parent-viewport coords, mapped through the frame offset for the preview iframe) and, when the host passes an `onDetail(detail|null)` hook, hands it `{ label, value, dot, body, meta, lean, x, y }` instead of drawing its own div. The React Playground renders the real shadcn `Popover` — a controlled, non-modal, focus-inert, pointer-transparent `PopoverContent` anchored to a virtual element at (x,y) with `updatePositionStrategy="always"`. Verified on the real Playground: dx=0, dy=14 from the cursor on both funnel and state-chart. The frozen Drawing Board (no `onDetail`) keeps its vanilla card, now also cursor-anchored via the same frozen point. body/meta are deck-authored HTML already sanitized upstream (#22).
---

# Chart detail reveal — real shadcn Popover, anchored at the cursor

## Symptom / direction

The chart detail popover (the "details-on-demand" card a mark reveals on hover/tap)
anchored under the chart's disc — calm, but far from where you're looking — and it was
a hand-rolled div, not the design system's component. Owner direction: **use the proper
shadcn popup/tooltip component (the richer one — Popover), and keep it in close proximity
to the pointer when revealed.**

## Decision

Keep `chart-interact.js` as the shared, parent-hosted **geometry + data engine** (it must
be vanilla + cross-iframe: it reads the mark geometry and the inert `<template>` detail out
of a same-origin `srcdoc` iframe, over a pointer-capture overlay). Invert only the popover
**rendering**:

- **Cursor anchor.** On reveal, freeze the cursor point (`anchorPt`) in parent-viewport
  coords — Present's hit-surface events are already parent coords; the Preview binds on the
  iframe document, so its coords are mapped through the frame's offset. Frozen (not
  live-following) so the card holds its spot instead of sliding as the cursor drifts within
  a mark. Falls back to the disc when there's no live pointer (keyboard / presenter window).
- **`onDetail` render hook.** When the host passes `onDetail`, `chart-interact` calls it with
  `{ label, value, dot, body, meta, lean, x, y }` on reveal and `null` on clear, and its own
  vanilla card stays dormant. Omit it (the frozen Drawing Board) and the vanilla card renders
  as before — now also cursor-anchored.
- **Real shadcn Popover (Playground).** `PlaygroundApp` holds the reveal in state and renders
  a controlled `Popover` whose `PopoverAnchor` points at a virtual element at (x,y).
  `PopoverContent` is `side="bottom" align="start" sideOffset={14}`, focus-inert
  (`onOpenAutoFocus`/`onCloseAutoFocus` prevented), `pointer-events-none`, and
  `updatePositionStrategy="always"` so it re-anchors when the cursor moves to a new mark.

Popover over Tooltip because it's the richer primitive (the card carries a header + value +
body + meta), and the reveal is controlled imperatively (not a DOM trigger), which the
Popover's virtual-anchor + controlled-`open` model fits.

## Safety

`body`/`meta` are HTML fragments from the deck's own chart-detail `<template>`s, which reach
the preview iframe only through `sanitizeSlideHtml` (HARD RULE #22), so they are already
sanitized when `chart-interact` reads them; rendering them via `dangerouslySetInnerHTML` in
the parent matches the vanilla card's existing `innerHTML` and adds no new sink.

## Files

- `docs/src/playground/chart-interact.js` — cursor anchor (frozen `anchorPt`, iframe→parent
  mapping); `onDetail` render hook; vanilla card suppressed when a host renders.
- `docs/src/components/playground/PlaygroundApp.tsx` — the shadcn `Popover` + virtual cursor
  anchor, driven by `onDetail`.

## Verification

Driven on the real Playground (HARD RULE #23): hover a funnel band and a state node — the
shadcn `[data-slot="popover-content"]` opens with the mark's detail at dx=0, dy=14 from the
cursor. `PlaygroundApp` component test green.
