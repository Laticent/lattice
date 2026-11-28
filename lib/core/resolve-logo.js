/**
 * lib/core/resolve-logo.js
 *
 * The deck front-matter `logo:` line names the logo file and styles it on ONE line: the file plus
 * up to one word per axis, in any order (the `image-card:` / `card-tag:` shape), and the editor
 * completes each word:
 *
 *   logo: brand.svg bottom-center         → `logo-bottom-center`        the berth; its band's chrome hides
 *   logo: lattice accent-ink lg           → `logo-accent-ink logo-lg`   a palette blend, larger
 *   logo: title brand ./mark.svg          → `logo-title logo-brand`     the first slide only, original colors
 *
 * Five axes:
 *   placement  the six berths a logo goes in — a corner, or top / bottom center. Explicitly naming
 *              one makes the header, footer or page number in that band stand down (base.modifiers.css).
 *   color      `auto` is the faint watermark that flips on a dark canvas. A palette role (`accent`
 *              `ink` `muted` `canvas` `inverse`) or a closed blend (`accent-ink` `accent-canvas`
 *              `ink-canvas`, 50/50) paints the mark that color through a per-slide SVG filter, so it
 *              follows light and dark. `brand` keeps the file's own colors, with nothing behind them.
 *   plate      `no-plate` (default) or `plate`: the file's own colors on a soft surface plate. Off unless asked for, so a logo
 *              with a transparent background stays transparent; the deck line or one slide's `_class` turns it on.
 *   size       `md` (default) / `sm` / `lg`.
 *   scope      `all` (default) or `title` — the deck's first slide and any `title` slide.
 *
 * The FILE is every word on the line that is not an axis word (`splitLogoValue`), so a path, a URL, a
 * built-in name (`lattice`) or a data URI reads the same with or without words around it. The
 * `logo-finish:` key that once carried the words is retired (lint's `key-renamed` merges it). Per slide, `_class: no-logo` removes the mark; a
 * slide's own word on an axis evicts the deck's word on THAT axis only, like every axis register.
 * The words are class tokens on the section, so both render paths and the runtime read the one
 * register (HARD RULE #1). Replaces `logo-on` / `logo-x` / `logo-y` / `logo-scale`, which lint
 * migrates (`retired-logo-key`).
 */

const { switchOn } = require('./switches');
const { makeRegister } = require('./register-factory');

const REGISTER = makeRegister('logo', [
  { axis: 'placement', names: ['top-right', 'top-left', 'top-center', 'bottom-left', 'bottom-center', 'bottom-right'], prefix: 'logo-' },
  { axis: 'color', names: ['auto', 'accent', 'ink', 'muted', 'canvas', 'inverse', 'brand', 'accent-ink', 'accent-canvas', 'ink-canvas'], prefix: 'logo-' },
  { axis: 'plate', names: ['no-plate', 'plate'], prefix: 'logo-' },
  { axis: 'size', names: ['md', 'sm', 'lg'], prefix: 'logo-' },
  { axis: 'scope', names: ['all', 'title'], prefix: 'logo-' },
]);

/** The color words that paint the mark through the tint filter (not `auto`, not `brand`). */
const TINT_TOKENS = Object.freeze(['accent', 'ink', 'muted', 'canvas', 'inverse', 'accent-ink', 'accent-canvas', 'ink-canvas'].map((w) => `logo-${w}`));

/** True when a class list asks for the tint filter. */
const hasLogoTint = (cls) => cls.some((c) => TINT_TOKENS.includes(c));

/** The deck's scope and the slide's, from a final class list: `title` shows the mark only on the
 *  deck's first slide or a `title` slide; `no-logo` hides it and `with-logo` brings it back. */
function logoShownOn(cls, { isFirst, isTitle }) {
  if (!switchOn('logo', cls)) return false;
  if (cls.includes('logo-title') && !isFirst && !isTitle) return false;
  return true;
}

/**
 * A `logo:` value split into its FILE and its axis WORDS. A token is a word when it is one of the
 * register's words (any case); every other token is the file, rejoined with one space, so a path
 * with a space in it still reads whole. A wrapping quote pair on the file comes off.
 *
 *   splitLogoValue('brand.svg top-left sm') → { file: 'brand.svg', words: ['top-left', 'sm'], others: ['brand.svg'] }
 *
 * `others` is the file's tokens, for the linter (a second one is usually a misspelled word).
 */
function splitLogoValue(value) {
  if (typeof value !== 'string') return { file: value, words: [], others: [] };
  const words = [];
  const others = [];
  for (const token of value.trim().split(/\s+/).filter(Boolean)) {
    if (REGISTER.NAMES.includes(token.toLowerCase())) words.push(token.toLowerCase());
    else others.push(token);
  }
  let file = others.join(' ');
  if (file.length > 1 && (file[0] === '"' || file[0] === "'") && file.endsWith(file[0])) file = file.slice(1, -1);
  return { file, words, others };
}

/** Where a trailing YAML `# comment` starts on a line (a `#` after a space or a tab), or -1. Linear, no regex. */
function commentAt(line) {
  const s = String(line);
  for (let i = 1; i < s.length; i++) if (s[i] === '#' && (s[i - 1] === ' ' || s[i - 1] === '\t')) return i;
  return -1;
}

/** The logo FILE from a `logo:` value (its axis words off), or the value itself when it is not a string. */
const logoFile = (value) => (typeof value === 'string' ? splitLogoValue(value).file : value);

module.exports = { LOGO_REGISTER: REGISTER, TINT_TOKENS, hasLogoTint, logoShownOn, splitLogoValue, logoFile, commentAt };
