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
  /** The slide the chart sits on (in the preview frame): the body is drawn with its CSS. */
  section?: Element | null;
  x?: number;
  y?: number;
};

/**
 * THE DECK'S CSS, ONCE PER STYLESHEET STATE. A row's description is rich Markdown (pills, sparks,
 * lists), and their styling lives in the deck's stylesheets inside the preview frame, not in this
 * page. The popover draws the body inside a shadow root that adopts ONE constructed sheet built
 * from the frame's own `<style>` text and same-origin `<link>` rules, so a pill or a spark looks as
 * it does on the slide and the app's CSS cannot reach in.
 *
 * Cached per frame document AND the text of its `<style>` elements: the Playground restyles a
 * theme or a light/dark flip IN PLACE (`deck-render.js` `restyleDocument` swaps the style text in
 * the same document), so a cache keyed on the document alone kept the old theme's rules for the
 * rest of the session (the inversion review). Comparing the text is one string compare per open;
 * a rebuild is one `replaceSync`.
 */
const deckSheets = new WeakMap<Document, { key: string; sheet: CSSStyleSheet }>();
function styleKey(doc: Document): string {
  let key = '';
  for (const el of doc.querySelectorAll('style, link[rel~="stylesheet"]')) {
    key += el.tagName === 'LINK' ? `@${(el as HTMLLinkElement).href}\n` : `${el.textContent ?? ''}\n`;
  }
  return key;
}
function deckSheetFor(doc: Document): CSSStyleSheet | null {
  const key = styleKey(doc);
  const hit = deckSheets.get(doc);
  if (hit && hit.key === key) return hit.sheet;
  try {
    const parts: string[] = [];
    for (const sheet of [...doc.styleSheets]) {
      try {
        parts.push([...sheet.cssRules].map((r) => r.cssText).join('\n'));
      } catch {
        /* a cross-origin sheet (a webfont host) cannot be read; its fonts still load in the page */
      }
    }
    // The body sits inside a copy of the slide's own ancestor chain (`DeckHtml`), so a deck rule
    // scoped `article.lattice > section …` (4,485 of the Playground's 4,679) matches it. None of
    // those wrappers may take a slide's box: size, padding, background, position. `all: unset`
    // resets those and leaves custom properties alone, so the deck's tokens still paint the pills
    // and sparks; the text takes the popover's own color, which keeps it legible on either theme.
    parts.push(
      '.lat-desc-chain{all:unset!important;display:block!important;color:inherit!important;' +
        'font:inherit!important;line-height:1.45!important;}' +
        // The slide's own chrome hangs off its pseudo-elements: the page number is `section::after`,
        // and it drew a stray "2" in the card on a paginated deck (the owner's phone test).
        '.lat-desc-chain::before,.lat-desc-chain::after{content:none!important;display:none!important}' +
        'section.lat-desc>:first-child{margin-top:0}section.lat-desc>:last-child{margin-bottom:0}' +
        // A list in a description reads as a plain list: the deck's own list rules are scoped
        // `article.lattice > section ul` and outrank these, and on a slide they draw a column of
        // dashes and pills laid out for a full-width row, not a card.
        'section.lat-desc ul{list-style:disc outside!important;padding:0 0 0 1.2em!important;margin:0.25em 0 0!important}' +
        'section.lat-desc ol{list-style:decimal outside!important;padding:0 0 0 1.4em!important;margin:0.25em 0 0!important}' +
        'section.lat-desc li{display:list-item!important;padding:0!important;margin:0!important}' +
        'section.lat-desc li::before{content:none!important}',
    );
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(parts.join('\n'));
    deckSheets.set(doc, { key, sheet });
    return sheet;
  } catch {
    return null;
  }
}

/**
 * An empty copy of `el` in this page: its tag, its classes and attributes (not its id or inline
 * style), marked `lat-desc-chain` so the reset above takes its box away. `extra` adds a class.
 */
function shallowCopy(el: Element, extra: string): HTMLElement {
  const copy = document.createElement(el.tagName.toLowerCase());
  for (const { name, value } of [...el.attributes]) {
    if (name === 'id' || name === 'style' || name.startsWith('on')) continue;
    copy.setAttribute(name, value);
  }
  copy.classList.add('lat-desc-chain');
  if (extra) copy.classList.add(extra);
  return copy;
}

/** Every custom property the slide resolves, so `var(--…)` in the deck's rules finds a value. */
function slideVars(section: Element): string {
  const cs = section.ownerDocument.defaultView?.getComputedStyle(section);
  if (!cs) return '';
  const out: string[] = [];
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i];
    if (name.startsWith('--')) out.push(`${name}:${cs.getPropertyValue(name)}`);
  }
  return out.join(';');
}

/**
 * Rich deck HTML in a shadow root styled by the deck.
 *
 * The detail left the sandboxed preview frame to get here, so it lands in the APP's origin, and
 * three guards keep it a card (HARD RULE #22; the red team's repro painted a 9000px fixed link
 * over the page):
 *   - it is parsed inert (a `<template>`), and every `style` attribute in it is removed: the engine
 *     writes none on a pill, a spark or a list, so any there is the author's, and an author style
 *     is what positioned the overlay;
 *   - it always renders in a shadow root, so an `id` or `name` in it cannot clobber page globals;
 *   - the light-DOM wrapper this returns has paint containment, which the adopted deck CSS cannot
 *     reach: whatever a `:host` rule or a fixed position does, nothing paints or takes a click
 *     outside the card.
 * The markup itself was sanitized by the render path that built the frame (`sanitizeSlideHtml`).
 * Without the deck's CSS (no section, or no constructable stylesheets) it draws unstyled.
 */
function DeckHtml({ html, section, className }: { html: string; section?: Element | null; className?: string }) {
  const host = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const styled of tpl.content.querySelectorAll('[style]')) styled.removeAttribute('style');
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    const sheet = section && 'adoptedStyleSheets' in Document.prototype ? deckSheetFor(section.ownerDocument) : null;
    if (!sheet || !section) {
      if ('adoptedStyleSheets' in root) root.adoptedStyleSheets = [];
      root.replaceChildren(tpl.content);
      return;
    }
    root.adoptedStyleSheets = [sheet];
    const wrap = shallowCopy(section, 'lat-desc');
    // The slide's resolved custom properties, so `var(--…)` finds the value it has on the slide.
    wrap.setAttribute('style', slideVars(section));
    wrap.append(tpl.content);
    // The slide's ancestors up to <body>, as empty copies: the selector chain each surface scopes
    // its deck CSS with (`article.lattice > section` on the Playground) then matches in the card.
    let outer: Element = wrap;
    for (let a = section.parentElement; a && a.tagName !== 'BODY' && a.tagName !== 'HTML'; a = a.parentElement) {
      const copy = shallowCopy(a, '');
      copy.appendChild(outer);
      outer = copy;
    }
    root.replaceChildren(outer);
  }, [html, section]);
  return (
    <div className={className} style={{ contain: 'paint', overflow: 'clip' }}>
      <div ref={host} />
    </div>
  );
}

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
  /** The geometric half of the reveal emphasis — a pie slice steps out along its bisector, a dot
   *  grows about its center. Default true, matching `chart-interact`. The dim and the elevation
   *  shadow apply either way, and `chart-interact` skips all of it on an ANIMATED chart (that chart's
   *  marks carry the renderer's baked frame), so the emphasis never fights motion. */
  lift?: boolean;
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
  { getFrame, getStage, hoverAny = false, lift = true, onReveal, enabled = true },
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
  const cfg = React.useRef({ getFrame, getStage, hoverAny, lift, onReveal, enabled });
  cfg.current = { getFrame, getStage, hoverAny, lift, onReveal, enabled };

  // The live interact controller, constructed LAZILY the first time both the stage and the live frame
  // exist. Two host shapes need this: the Playground's iframe is a React ref present at mount, but a
  // DeckPreview host appends `iframe.live` IMPERATIVELY after the first paint — so a mount-once effect
  // would find no frame and never bind. Constructing on the first rebind() (which the host calls after
  // every paint) covers both.
  const ci = React.useRef<{ rebind(): void; onSlide(i: number): void; handleKey(e: KeyboardEvent): boolean; clear(): void; destroy(): void } | null>(null);
  // Set once the component unmounts, so a late imperative call (a host firing rebind/onSlide/handleKey
  // after React tore us down) can't lazily re-create a controller with no effect left to free it.
  const disposed = React.useRef(false);
  const ensureMounted = React.useCallback(() => {
    if (ci.current || disposed.current || !cfg.current.enabled) return;
    const stage = cfg.current.getStage();
    const frame = cfg.current.getFrame();
    if (!stage || !frame) return;
    ci.current = createChartInteract({
      stage,
      getFrame: () => cfg.current.getFrame() ?? frame,
      hoverAny: cfg.current.hoverAny,
      lift: cfg.current.lift,
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
      handleKey: (e: KeyboardEvent) => {
        // Mirror rebind/onSlide: a number key (or Esc-to-dismiss) can arrive before the frame exists in
        // a loader-backed host (Present), so mount first or the keypress falls through unhandled.
        ensureMounted();
        return ci.current?.handleKey(e) ?? false;
      },
    }),
    [ensureMounted],
  );

  // Try an eager mount (the Playground case: frame present at mount) and tear down on unmount.
  React.useEffect(() => {
    disposed.current = false; // (re)mount — clear the tombstone (also covers a StrictMode remount)
    ensureMounted();
    return () => {
      disposed.current = true;
      ci.current?.destroy();
      ci.current = null;
    };
  }, [ensureMounted]);

  // `enabled` is a real off-switch: when it flips false on a STILL-MOUNTED layer, tear the controller
  // down (its observers/listeners would otherwise keep running) and clear any open detail so it can't
  // re-open with a stale card; on flip BACK to true it re-mounts (the mount effect above runs only on the
  // first mount, so a toggle-while-mounted needs its own re-mount here). A host that unmounts on disable
  // (Present) hits the effect cleanup above instead; this covers the toggle-WITHOUT-unmount case both ways.
  React.useEffect(() => {
    if (enabled) {
      ensureMounted();
    } else {
      ci.current?.destroy();
      ci.current = null;
      setDetail(null);
    }
  }, [enabled, ensureMounted]);

  // ONE dismiss path. `clear()` resets the open mark's lift/dim in the frame and reports `null` back
  // through `onDetail`; `setDetail(null)` covers a layer with no controller yet.
  const dismiss = React.useCallback(() => {
    ci.current?.clear();
    setDetail(null);
  }, []);

  // The card belongs to the preview it came from, and it lives in the PAGE, not the frame. The hit
  // layer only hears events inside the frame, so a tap anywhere else (the Edit tab, a toolbar, another
  // pane) never reached it and the card stayed on top of whatever replaced the preview (the owner's
  // phone test). Close it whenever attention leaves the stage:
  //   - the frame leaves the screen (a hidden tab panel, a closed pane),
  //   - a press or a focus lands outside the stage,
  //   - the page is backgrounded (an app switch, a hidden browser tab),
  //   - Escape, on the hover path only: Present routes Escape through `handleKey` and exits when it
  //     returns false, so a listener here would eat the press that should only close the card.
  // NOT window `blur`: tapping a mark focuses the iframe, which blurs the parent window, and that
  // would close the card the same gesture opened.
  React.useEffect(() => {
    if (!detail) return;
    const outside = (t: EventTarget | null) => {
      const stage = cfg.current.getStage();
      return !(t instanceof Node && stage?.contains(t));
    };
    const onPress = (e: Event) => {
      if (outside(e.target)) dismiss();
    };
    // A press on a non-focusable part of the stage focuses its nearest focusable ANCESTOR (the app's
    // `<main tabindex=-1>`); that is the gesture that opened the card, not focus leaving it.
    const onFocus = (e: Event) => {
      const stage = cfg.current.getStage();
      if (outside(e.target) && !(e.target instanceof Node && e.target.contains(stage))) dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') dismiss();
    };
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('focusin', onFocus, true);
    if (cfg.current.hoverAny) document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', dismiss);
    let io: IntersectionObserver | undefined;
    const target = cfg.current.getFrame() ?? cfg.current.getStage();
    if (target && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => !e.isIntersecting)) dismiss();
      });
      io.observe(target);
    }
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', dismiss);
      io?.disconnect();
    };
  }, [detail, dismiss]);

  if (!enabled) return null;
  // READABLE-FIRST sizing. This is a detail TOOLTIP — an on-demand readout whose whole job is to be
  // legible. The preview iframe is transform-scaled to fit its pane (≈0.6 desktop, ≈0.28 on a 390px
  // mobile pane), but we deliberately do NOT shrink the card to match: a card scaled into a tiny mobile
  // slide is unreadable, defeating the tooltip. Instead it stays a normal, legible size and may overflow
  // the (small) slide bounds — fine for a transient, dismissible popover — with `collisionPadding` keeping
  // it on-screen. On full-screen Present the slide is large, so it already reads as proportionate. It uses
  // the app popover tokens (bg-popover/border/shadow) so it's clean and consistent, not alien.
  return (
    <Popover open={!!detail}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={12}
        collisionPadding={8}
        updatePositionStrategy="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // z-[140]: the popover portals to <body>, but PRESENT is a fullscreen overlay at z-[100]/z-[102]
        // (PresentOverlay) — at the default popover z-50 the card renders BEHIND it (the chart binds and
        // the tap fires, but nothing is visible). Sit above Present's whole stack, including its lens menu
        // (z-[130]). Harmless on the editing preview / Playground, which have no such overlay. tailwind-merge
        // (via cn in PopoverContent) makes this win over the base z-50.
        // `lat-chart-detail-pop` is the hook chart-interact.css uses to take the pointer off Radix's
        // positioning WRAPPER as well. `pointer-events-none` here covers the card; the wrapper around
        // it stays `auto`, and that box is what steals the pointer from the mark underneath and shuts
        // the card the same gesture opened.
        className="lat-chart-detail-pop pointer-events-none z-[140] max-w-[18rem] p-3"
      >
        {detail && (
          <>
            <div className="flex items-center gap-2 font-medium text-foreground">
              {detail.dot ? <span className="size-2 shrink-0 rounded-full" style={{ background: detail.dot }} /> : null}
              <span>{detail.label}</span>
              {detail.value ? <span className="ml-auto tabular-nums text-muted-foreground">{detail.value}</span> : null}
            </div>
            {detail.body ? (
              <DeckHtml html={detail.body} section={detail.section} className="mt-1.5 text-sm text-foreground/90" />
            ) : null}
            {detail.meta ? (
              <DeckHtml html={detail.meta} section={detail.section} className="mt-1.5 text-xs uppercase tracking-wide text-muted-foreground" />
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
});
