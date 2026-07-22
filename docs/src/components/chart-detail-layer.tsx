import * as React from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { createChartInteract } from '@/playground/chart-interact.js';
// The hit-surface + popover chrome CSS ships WITH this component, so every surface that mounts it (the
// Studio editing preview + Present, not just the Playground/Drawing-Board that import it per-page) gets
// the pinned hit-surface's `pointer-events:auto` — without it the surface's own pointer-events:none swipe
// box swallows the hover and the reveal never fires.
import '@/styles/chart-interact.css';

// The SHARED chart mark-detail reveal — one widget across every live surface (the Playground, the
// Studio's live preview, and Present), so the popover chrome + the parent-hosted `chart-interact`
// wiring live in ONE place instead of a fork per surface (HARD RULE #15). `chart-interact.js` is the
// parent-hosted hit layer (it reads each mark's inert `<template class="chart-detail" data-mark>` by
// index and reports the hovered detail + cursor point); this component renders that detail as the
// real shadcn Popover, anchored to a virtual element at the reported point so it reads as a hover
// tooltip. `body`/`meta` are HTML fragments from the deck's OWN detail templates, which entered the
// preview frame already sanitized by the render path (#22) — we re-render that already-sanitized
// fragment; we never sanitize raw author markup here.
//
// MOTION COEXISTENCE: when a chart animates, the Anima host hides the original poster SVG and mounts
// an animated clone (built from the poster's markup, so it keeps every `data-mark`). `chart-interact`
// hit-tests whatever is VISIBLE — so it targets the clone, during and after the build — and the
// popover anchors to the CURSOR, not the mark, so a mid-build reveal reads the correct detail without
// chasing the moving geometry. The two subsystems compose with no special handshake (verified on the
// real Studio: static, mid-build, and settled all reveal; a `data-anima-state`-gated suppression was
// tried and removed — it was unnecessary AND stranded a later reveal after a mid-build hover).

export type ChartDetail = {
  label: string;
  value?: string;
  dot?: string;
  body?: string;
  meta?: string;
  lean?: boolean;
  x?: number;
  y?: number;
  /** The preview frame's render scale, so the card sizes WITH the slide (a heavily-scaled mobile
   *  preview otherwise gets a full-size card that dwarfs the tiny chart). */
  scale?: number;
};

/** The imperative surface a host drives after each preview paint / slide change. */
export interface ChartDetailHandle {
  /** Re-bind the hit layer to the (possibly new) iframe document — call after every render. */
  rebind(): void;
  /** Pinned mode only: point the layer at slide `idx`'s chart. */
  onSlide(idx: number): void;
  /** Pinned mode only: number-key reveal (1–9 → mark, 0/Esc clears). Returns true if handled. */
  handleKey(e: KeyboardEvent): boolean;
}

export interface ChartDetailLayerProps {
  /** The live slide iframe (a thunk — it may be replaced on a srcdoc rewrite). */
  getFrame: () => HTMLIFrameElement | null;
  /** The positioning context the interaction chrome mounts into (the frame's stage wrapper). */
  getStage: () => HTMLElement | null;
  /** PREVIEW mode — reveal whichever chart is under the pointer as the author edits (Playground /
   *  Studio live preview). Omit (false) for PINNED mode — a hit-surface over one `onSlide()` chart
   *  (Present). */
  hoverAny?: boolean;
  /** Interaction-coupled tilt (lifts/tips toward the open mark, settles flat). Default true, matching
   *  `chart-interact` (so the Playground keeps its reveal tilt). `chart-interact` itself skips the
   *  lift/tilt on an ANIMATED chart — that chart's marks carry the renderer's baked frame — so tilt
   *  never fights motion regardless of this flag. */
  tilt?: boolean;
  /** Fired when a mark opens (Present/Practice uses it to pause autoplay). */
  onReveal?: () => void;
  /** Gate the whole layer off (e.g. a thumbnail host that must not sprout popovers). Default true. */
  enabled?: boolean;
}

/**
 * The parent-hosted chart-detail layer + its popover, as one component. Mounts `createChartInteract`
 * over the preview frame and renders the reported detail as a shadcn Popover. Drive it through the
 * ref: `rebind()` after each paint; `onSlide()` / `handleKey()` in pinned (Present) mode.
 */
export const ChartDetailLayer = React.forwardRef<ChartDetailHandle, ChartDetailLayerProps>(function ChartDetailLayer(
  { getFrame, getStage, hoverAny = false, tilt = true, onReveal, enabled = true },
  ref,
) {
  const [detail, setDetail] = React.useState<ChartDetail | null>(null);
  const detailRef = React.useRef<ChartDetail | null>(null);
  detailRef.current = detail;

  // A virtual anchor at the reported cursor point — Floating UI positions the popover against it.
  const anchorRef = React.useRef({
    getBoundingClientRect: () => {
      const d = detailRef.current;
      const x = d?.x ?? -9999;
      const y = d?.y ?? -9999;
      return { x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    },
  });

  // Keep the latest prop thunks/flags in refs so the mount logic stays identity-stable across renders
  // (the parent passes fresh inline arrows each render).
  const cfg = React.useRef({ getFrame, getStage, hoverAny, tilt, onReveal, enabled });
  cfg.current = { getFrame, getStage, hoverAny, tilt, onReveal, enabled };

  // The live interact controller, constructed LAZILY the first time both the stage and the live frame
  // exist. Two host shapes need this: the Playground's iframe is a React ref present at mount, but a
  // DeckPreview host appends `iframe.live` IMPERATIVELY after the first paint — so a mount-once effect
  // would find no frame and never bind. Constructing on the first rebind() (which the host calls after
  // every paint) covers both.
  const ci = React.useRef<{ rebind(): void; onSlide(i: number): void; handleKey(e: KeyboardEvent): boolean; destroy(): void } | null>(null);
  const ensureMounted = React.useCallback(() => {
    if (ci.current || !cfg.current.enabled) return;
    const stage = cfg.current.getStage();
    const frame = cfg.current.getFrame();
    if (!stage || !frame) return;
    ci.current = createChartInteract({
      stage,
      getFrame: () => cfg.current.getFrame() ?? frame,
      hoverAny: cfg.current.hoverAny,
      tilt: cfg.current.tilt,
      onReveal: cfg.current.onReveal,
      // chart-interact types the hook as `(detail: object|null) => void`; the payload IS the
      // ChartDetail shape, so coerce at the boundary.
      onDetail: (d: object | null) => setDetail(d as ChartDetail | null),
    });
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      rebind: () => {
        ensureMounted();
        ci.current?.rebind();
      },
      onSlide: (i: number) => {
        ensureMounted();
        ci.current?.onSlide(i);
      },
      handleKey: (e: KeyboardEvent) => ci.current?.handleKey(e) ?? false,
    }),
    [ensureMounted],
  );

  // Try an eager mount (the Playground case: frame present at mount) and tear down on unmount.
  React.useEffect(() => {
    ensureMounted();
    return () => {
      ci.current?.destroy();
      ci.current = null;
    };
  }, [ensureMounted]);

  if (!enabled) return null;
  // Size the card WITH the slide: the preview iframe is transform-scaled to fit its pane (≈0.6 on
  // desktop, much smaller on mobile), so a full-size card dwarfs the chart. Scale the visible card by
  // the frame's render scale, floored so it stays readable on a heavily-scaled mobile preview. The
  // OUTER PopoverContent stays a transparent positioning wrapper (Radix owns placement + open
  // animation); the INNER div is the visible card.
  // Scale via `zoom`, NOT a child `transform`: `zoom` shrinks the element's LAYOUT box, so the outer
  // PopoverContent that Radix/Floating-UI measures for collision/flip/shift is the SAME size the user
  // sees. A child `transform: scale()` leaves the measured box full-size, so Radix reserves ~320px,
  // spuriously collision-shifts a near-edge card left, and the visible half-size card detaches from the
  // mark (visible on a 390px mobile preview). `zoom` keeps layout == visual, so it stays pinned.
  const cardScale = Math.min(1, Math.max(detail?.scale ?? 1, 0.5));
  return (
    <Popover open={!!detail}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={14 * cardScale}
        collisionPadding={8}
        updatePositionStrategy="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="pointer-events-none w-auto border-0 bg-transparent p-0 shadow-none"
      >
        {detail && (
          <div
            className="max-w-[20rem] rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
            style={{ zoom: cardScale }}
          >
            <div className="flex items-center gap-2 font-medium text-foreground">
              {detail.dot ? <span className="size-2 shrink-0 rounded-full" style={{ background: detail.dot }} /> : null}
              <span>{detail.label}</span>
              {detail.value ? <span className="ml-auto tabular-nums text-muted-foreground">{detail.value}</span> : null}
            </div>
            {detail.body ? (
              // biome-ignore lint/security/noDangerouslySetInnerHtml: deck-authored detail, sanitized upstream by the render path (#22).
              <p className="mt-1.5 text-sm text-foreground/90" dangerouslySetInnerHTML={{ __html: detail.body }} />
            ) : null}
            {detail.meta ? (
              // biome-ignore lint/security/noDangerouslySetInnerHtml: deck-authored detail, sanitized upstream by the render path (#22).
              <div className="mt-1.5 text-xs uppercase tracking-wide text-muted-foreground" dangerouslySetInnerHTML={{ __html: detail.meta }} />
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
