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
// A slide overrides any subset per-axis; the presence of ANY style/speed token (or the legacy
// `chart-anima`) also turns Play ON for that slide, and `motion-off` forces it static. Motion plays
// ONCE when the slide is entered — there is no replay control. Preview-only; the export is untouched.

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

/** Sections that EXPLICITLY opt a chart into motion via a class — `motion-on`, any style/speed
 *  token, or the legacy `chart-anima`. `motion-off` is the opt-OUT and is excluded. A deck-level
 *  `motion: on` reaches class-less sections separately (see `hasAnimatableChart` + `resolveMotion`),
 *  because a front-matter default leaves no class on the section to select. */
export const MOTION_OPT_IN_SEL =
  'section.motion-on, section.motion-build, section.motion-together, section.motion-rise, section.motion-auto, section.motion-slow, section.motion-normal, section.motion-fast, section.chart-anima';

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

/** Normalize the three deck front-matter values into a `DeckMotion`. `motion:` accepts on/off
 *  (with `true`/`yes`/`none`/`false` as friendly aliases); unknown → null (unset). */
export function parseDeckMotion(motion: string | null | undefined, style?: string | null, speed?: string | null): DeckMotion {
  const m = (motion ?? '').trim().toLowerCase();
  const play: 'on' | 'off' | null = m === 'on' || m === 'true' || m === 'yes' ? 'on' : m === 'off' || m === 'none' || m === 'false' ? 'off' : null;
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
/** The slide's own Play state: `off` (explicit suppressor), `on` (explicit, or IMPLIED by any
 *  style/speed token / legacy `chart-anima`), or null (inherit the deck default). */
function slidePlay(section: Element): 'on' | 'off' | null {
  const c = section.classList;
  if (c.contains('motion-off')) return 'off';
  if (c.contains('motion-on') || c.contains('chart-anima') || slideStyle(section) != null || slideSpeed(section) != null) return 'on';
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

/** Whether a section holds an animatable chart — used to find the sections a deck-level `motion: on`
 *  applies to, since those carry no `motion-*` class. Keys on `[data-mark]`, the SAME handle
 *  `chartToScene`'s geometry loop requires. jsdom-safe (no CSS `:has`). */
export function hasAnimatableChart(section: Element): boolean {
  return section.querySelector('svg [data-mark]') != null;
}
