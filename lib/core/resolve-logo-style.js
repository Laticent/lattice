/**
 * lib/core/resolve-logo-style.js
 *
 * The deck front-matter `logo-style:` register styles the deck logo on ONE line, up to one word
 * per axis (the `image-card:` / `tag:` shape), and the editor completes each word:
 *
 *   logo-style: bottom-center            → `logo-bottom-center`        the berth; its band's chrome hides
 *   logo-style: accent-ink lg            → `logo-accent-ink logo-lg`   a palette blend, larger
 *   logo-style: title brand              → `logo-title logo-brand`     the first slide only, original colors
 *
 * Four axes:
 *   placement  the six berths a logo goes in — a corner, or top / bottom center. Explicitly naming
 *              one makes the header, footer or page number in that band stand down (base.modifiers.css).
 *   color      `auto` is the faint watermark that flips on a dark canvas. A palette role (`accent`
 *              `ink` `muted` `canvas` `inverse`) or a closed blend (`accent-ink` `accent-canvas`
 *              `ink-canvas`, 50/50) paints the mark that color through a per-slide SVG filter, so it
 *              follows light and dark. `brand` keeps the original colors on a soft plate.
 *   size       `md` (default) / `sm` / `lg`.
 *   scope      `all` (default) or `title` — the deck's first slide and any `title` slide.
 *
 * `logo:` (the file) is the only other logo key. Per slide, `_class: no-logo` removes the mark; a
 * slide's own word on an axis evicts the deck's word on THAT axis only, like every axis register.
 * The words are class tokens on the section, so both render paths and the runtime read the one
 * register (HARD RULE #1). Replaces `logo-on` / `logo-x` / `logo-y` / `logo-scale`, which lint
 * migrates (`retired-logo-key`).
 */

const { makeRegister } = require('./register-factory');

const REGISTER = makeRegister('logo-style', [
  { axis: 'placement', names: ['top-right', 'top-left', 'top-center', 'bottom-left', 'bottom-center', 'bottom-right'], prefix: 'logo-' },
  { axis: 'color', names: ['auto', 'accent', 'ink', 'muted', 'canvas', 'inverse', 'brand', 'accent-ink', 'accent-canvas', 'ink-canvas'], prefix: 'logo-' },
  { axis: 'size', names: ['md', 'sm', 'lg'], prefix: 'logo-' },
  { axis: 'scope', names: ['all', 'title'], prefix: 'logo-' },
]);

/** The color words that paint the mark through the tint filter (not `auto`, not `brand`). */
const TINT_TOKENS = Object.freeze(['accent', 'ink', 'muted', 'canvas', 'inverse', 'accent-ink', 'accent-canvas', 'ink-canvas'].map((w) => `logo-${w}`));

/** True when a class list asks for the tint filter. */
const hasLogoTint = (cls) => cls.some((c) => TINT_TOKENS.includes(c));

/** The deck's scope and the slide's, from a final class list: `title` shows the mark only on the
 *  deck's first slide or a `title` slide; `no-logo` always hides it. */
function logoShownOn(cls, { isFirst, isTitle }) {
  if (cls.includes('no-logo')) return false;
  if (cls.includes('logo-title') && !isFirst && !isTitle) return false;
  return true;
}

module.exports = { LOGO_STYLE_REGISTER: REGISTER, TINT_TOKENS, hasLogoTint, logoShownOn };
