// The selectors + motion resolution that decide whether (and how) a preview surface animates a
// chart in place. Kept in a ZERO-DEPENDENCY leaf so both the host (anima-scenes.ts) and the
// DeckPreview host-load gate share ONE definition without pulling the heavy Anima backends into
// their bundle — a scene-less, motion-off preview never fires `import('@/playground/anima-scenes')`.
//
// Motion is THREE orthogonal axes, at full parity between the Studio controls, the deck front
// matter, and the per-slide classes (no magic — each axis is its own literal key/token):
//
//   axis   deck front-matter        slide class                          values (default first)
//   ────   ──────────────────       ──────────────────────────────────   ──────────────────────
//   Play   motion: on|off           motion-on / motion-off               off, on
//   Style  motion-style: <s>        motion-build/together/rise           build, together, rise
//   Speed  motion-speed: <p>        motion-auto/slow/normal/fast         auto, slow, normal, fast
//
// The axes are INDEPENDENT (no magic): Play is the sole animate switch — `motion-on` turns a slide
// on, `motion-off` forces it static, absence inherits the deck. A `motion-style`/`motion-speed`
// token is an inert PARAMETER that shapes the motion only when Play resolves on; it never flips Play
// on by itself. (The one exception is the legacy `chart-anima`, honored as `motion-on motion-build`.)
// Motion plays ONCE when the slide is entered — there is no replay control. Preview-only; export untouched.

import type { ChartAnimaStyle } from '@/lib/chart-anima'; // type-only: erased at build, no runtime dep

export type MotionSpeed = 'auto' | 'slow' | 'normal' | 'fast';

/** The closed style vocabulary (excludes `off`, which lives on the Play axis). */
export const MOTION_STYLES: readonly ChartAnimaStyle[] = ['build', 'together', 'rise'];
export const MOTION_SPEEDS: readonly MotionSpeed[] = ['auto', 'slow', 'normal', 'fast'];

/** The resolved motion for a section: the style + speed to animate with. `null` = no motion. */
export interface MotionConfig {
  style: ChartAnimaStyle;
  speed: MotionSpeed;
}

/** The deck-level defaults, read from front matter by the caller (the leaf never parses YAML). */
export interface DeckMotion {
  play: 'on' | 'off' | null;
  style: ChartAnimaStyle | null;
  speed: MotionSpeed | null;
}

/** A BAKED scene: a `scene` slide carrying a compiled ```anima spec (data-scene-spec). */
export const SCENE_SEL = 'section.scene[data-scene-spec]';

/** Sections that EXPLICITLY opt a chart into motion via a Play token — `motion-on` or the legacy
 *  `chart-anima`. A style/speed token is a PARAMETER, not an opt-in (Play is the sole switch), so it
 *  is NOT listed here; `motion-off` is the opt-OUT and is likewise excluded. A deck-level `motion: on`
 *  reaches class-less sections separately (see `hasAnimatableChart` + `resolveMotion`), because a
 *  front-matter default leaves no class on the section to select. */
export const MOTION_OPT_IN_SEL = 'section.motion-on, section.chart-anima';

/** The union a surface tests to LOAD the Anima host WITHOUT knowing the deck default — a baked scene
 *  or an explicit per-slide opt-in. When a deck sets `motion: on`, the gate also scans chart sections. */
export const ANIMA_HOST_SEL = `${SCENE_SEL}, ${MOTION_OPT_IN_SEL}`;

const asStyle = (v: string | null | undefined): ChartAnimaStyle | null => {
  const s = (v ?? '').trim().toLowerCase();
  return (MOTION_STYLES as readonly string[]).includes(s) ? (s as ChartAnimaStyle) : null;
};
const asSpeed = (v: string | null | undefined): MotionSpeed | null => {
  const s = (v ?? '').trim().toLowerCase();
  return (MOTION_SPEEDS as readonly string[]).includes(s) ? (s as MotionSpeed) : null;
};

/** Normalize the three deck front-matter values into a `DeckMotion`. `motion:` is the literal
 *  `on`/`off` (parity with the Studio Play control and the `motion-on`/`motion-off` slide tokens —
 *  no magic aliases); anything else → null (unset, inherit the built-in off). */
export function parseDeckMotion(motion: string | null | undefined, style?: string | null, speed?: string | null): DeckMotion {
  const m = (motion ?? '').trim().toLowerCase();
  const play: 'on' | 'off' | null = m === 'on' ? 'on' : m === 'off' ? 'off' : null;
  return { play, style: asStyle(style), speed: asSpeed(speed) };
}

// ── per-slide token readers (each axis independent) ──────────────────────────────────────────────
function slideStyle(section: Element): ChartAnimaStyle | null {
  const c = section.classList;
  if (c.contains('motion-build')) return 'build';
  if (c.contains('motion-together')) return 'together';
  if (c.contains('motion-rise')) return 'rise';
  if (c.contains('chart-anima')) return 'build'; // legacy alias
  return null;
}
function slideSpeed(section: Element): MotionSpeed | null {
  const c = section.classList;
  for (const sp of MOTION_SPEEDS) if (c.contains(`motion-${sp}`)) return sp;
  return null;
}
/** The slide's own Play state: `off` (explicit suppressor `motion-off`), `on` (explicit `motion-on`,
 *  or the legacy `chart-anima` alias), or null (inherit the deck default). A style/speed token does
 *  NOT imply on — Play is the sole switch. */
function slidePlay(section: Element): 'on' | 'off' | null {
  const c = section.classList;
  if (c.contains('motion-off')) return 'off';
  if (c.contains('motion-on') || c.contains('chart-anima')) return 'on';
  return null;
}

/** The EFFECTIVE motion for a section, applying the per-axis cascade (slide token → deck default →
 *  built-in default). Returns the {style, speed} to animate with, or null when Play resolves off. */
export function resolveMotion(section: Element, deck: DeckMotion): MotionConfig | null {
  const play = slidePlay(section) ?? deck.play ?? 'off';
  if (play === 'off') return null;
  const style = slideStyle(section) ?? deck.style ?? 'build';
  const speed = slideSpeed(section) ?? deck.speed ?? 'auto';
  return { style, speed };
}

/** Total motion duration in ms for a speed. `auto` scales to the mark count so each mark keeps a
 *  steady pace (a 3-band and an 8-band funnel feel alike), clamped to a sane band. */
export function speedToDurationMs(speed: MotionSpeed, markCount: number): number {
  if (speed === 'slow') return 5400;
  if (speed === 'normal') return 3600;
  if (speed === 'fast') return 2000;
  // auto: ~640ms per mark on top of a base, clamped to [2400, 5400].
  return Math.max(2400, Math.min(5400, 1600 + Math.max(0, markCount) * 640));
}

/** The parts `chartToScene` treats as animation candidates: a chart's per-mark index (`data-mark`) or
 *  a declared motion role (`data-anima-role`). The second arm is what a Mermaid diagram carries — it
 *  has no popover marks, only the roles `lib/integrations/mermaid/motion-roles.js` writes. */
const ANIMATABLE_PART_SEL = 'svg [data-mark], svg [data-anima-role]';

/** Whether a section holds an animatable chart — used to find the sections a deck-level `motion: on`
 *  applies to, since those carry no `motion-*` class. Keys on the SAME candidate set `chartToScene`'s
 *  geometry loop reads. jsdom-safe (no CSS `:has`). */
export function hasAnimatableChart(section: Element): boolean {
  return section.querySelector(ANIMATABLE_PART_SEL) != null;
}

/** Whether an svg is a rendered Mermaid diagram. The runtime writes every diagram into a
 *  `div.mermaid` (the HTML player's baked copy keeps that host), and a chart never lives there. */
export function isMermaidSvg(svg: Element): boolean {
  return svg.closest('.mermaid, .mermaid-svg') != null;
}

/** How many marks a section's chart builds — the `auto` speed's pacing input. A chart counts its
 *  `data-mark` indices, exactly as before. A Mermaid diagram has none, so it counts its non-label
 *  roles instead; without this every diagram would pace as a zero-mark chart. */
export function motionMarkCount(section: Element): number {
  const marks = section.querySelectorAll('svg [data-mark]').length;
  if (marks > 0) return marks;
  return section.querySelectorAll('svg [data-anima-role]:not([data-anima-role="label"])').length;
}

/** Preview-only marker: the live host stamps this on a motion-eligible chart FIGURE so it starts HIDDEN
 *  instead of flashing the static poster while the heavy Anima host imports. It is added ONLY by the live
 *  parent host (never by engine output or any export/capture builder) → inert in every export even if the
 *  CSS rule that hides it leaks into an export sheet. The matching rule lives in the PREVIEW-ONLY srcdoc
 *  CSS (`single-slide-render.ts`). Cleared on the animated clone's first (zero-state) frame
 *  (`hydrate.ts mount()`), or by the host's fallback if it declines / never runs. */
export const PREHIDE_CLASS = 'anima-prehide';

/** The chart FIGURE (`svg.parentElement`, e.g. `.funnel-figure`) for a section — the node that later
 *  gets `.anima-live`, so the pre-hide target and the reveal target are the same element. Uses the SAME
 *  `querySelector('svg')` handle `chart-anima-hydrate` resolves the figure from (the FIRST svg), so
 *  pre-hide and reveal can never target different nodes (a preceding non-chart svg would otherwise
 *  strand the wrong figure). `hasAnimatableChart` already gated that the section holds a roled chart. */
function chartFigureOf(section: Element): Element | null {
  return section.querySelector('svg')?.parentElement ?? null;
}

/** Synchronously hide every motion-eligible chart figure under `root` (a live iframe document), BEFORE
 *  `import('@/playground/anima-scenes')` resolves — closing the static-poster flash window. The set
 *  matches EXACTLY what `rebind` will mount (charts whose Play cascade resolves on); a Play-off / motion-off
 *  chart is left visible, and a still-tier / no-backend chart is revealed by the host's decline-fallback.
 *  Returns the figures it hid. Idempotent (adding a present class is a no-op). */
export function prehideEligibleCharts(root: ParentNode, deck: DeckMotion): Element[] {
  const sections = deck.play === 'on'
    ? Array.from(root.querySelectorAll('section')).filter(hasAnimatableChart)
    : Array.from(root.querySelectorAll(MOTION_OPT_IN_SEL));
  const hidden: Element[] = [];
  for (const section of sections) {
    if (!hasAnimatableChart(section) || resolveMotion(section, deck) === null) continue;
    const figure = chartFigureOf(section);
    // NEVER re-hide a figure that has ALREADY mounted (it carries `.anima-live`, added by hydrate before
    // it reveals). A rebind runs on EVERY render, and one that PRESERVED the section node (a restyle /
    // palette swap) leaves that chart in the host's `live` map → Phase 2 skips it → its mount (which owns
    // the reveal) never re-runs. Re-hiding it here would strand a settled chart hidden with nothing to
    // reveal it. Only figures still awaiting their first mount are pre-hidden (the actual flash window).
    if (figure && !figure.classList.contains('anima-live')) { figure.classList.add(PREHIDE_CLASS); hidden.push(figure); }
  }
  return hidden;
}

/** Clear the pre-hide from every figure under `root` — the fallback when the host never runs (import
 *  failure / hung bundle). Idempotent. */
export function revealPrehiddenCharts(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll(`.${PREHIDE_CLASS}`))) el.classList.remove(PREHIDE_CLASS);
}

/** The event the runtime fires on the host's <iframe> element each time a Mermaid diagram draws
 *  (`announceDiagramDrawn` in lib/runtime/index.js). */
export const DIAGRAM_DRAWN_EVENT = 'lattice:diagram-drawn';

/** Call `onDrawn` whenever a Mermaid diagram inside `frame` finishes drawing. The runtime draws a
 *  diagram AFTER the preview render the hosts rebind on, so without this a diagram under
 *  `motion: on` is never seen: at rebind time it is still source. The listener sits on the <iframe>
 *  ELEMENT, not its document, because the element survives a srcdoc rewrite and the document does
 *  not — a watch on the document was measured landing on the frame's initial document, which the
 *  deck's document then replaced. The runtime fires the event synchronously, so the host pre-hides
 *  the fresh diagram before the browser paints its still frame. Returns the unbind. */
export function watchDiagramDrawn(frame: EventTarget, onDrawn: () => void): () => void {
  const listener = (): void => onDrawn();
  frame.addEventListener(DIAGRAM_DRAWN_EVENT, listener);
  return () => frame.removeEventListener(DIAGRAM_DRAWN_EVENT, listener);
}
