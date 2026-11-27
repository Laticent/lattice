/**
 * lib/core/align-words.js — the `align:` register's WORDS: the two axes, parsing a value, and
 * splitting a compound class. No catalog and no front-matter reader, so a surface that only reads
 * classes (lib/core/slide-class-spans.js, loaded eagerly by the Studio) carries just this.
 * The resolver that adds each component's default is lib/core/resolve-align.js.
 */

/** Up-and-down words, in menu order, and the flexbox value each one means. */
const VERTICAL = Object.freeze(['top', 'middle', 'bottom', 'spread', 'fill']);
/** Side-to-side words, in menu order. `center` alone also means `middle`. */
const HORIZONTAL = Object.freeze(['left', 'center', 'right', 'full']);

const ALIGN_CSS = Object.freeze({
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
  spread: 'space-evenly',
  fill: 'stretch',
});

const VERTICAL_SET = new Set(VERTICAL);
const HORIZONTAL_SET = new Set(HORIZONTAL);
const VERTICAL_TOKENS = Object.freeze(VERTICAL.map((w) => `align-${w}`));
const HORIZONTAL_TOKENS = Object.freeze(HORIZONTAL.map((w) => `align-${w}`));
/** Every atomic per-slide class the register owns. */
const ALIGN_TOKENS = Object.freeze([...VERTICAL_TOKENS, ...HORIZONTAL_TOKENS]);
const ALIGN_TOKEN_SET = new Set(ALIGN_TOKENS);

/**
 * Parse a value (`bottom right`, `center`, `left top`) into its two axes. Words are matched
 * without case; an unknown word, and a second word for an axis already named, are reported, and
 * the first word for each axis wins. `center` names the horizontal axis; when it is the only
 * word, the vertical axis is `middle` as well.
 * @returns {{ v: string|null, h: string|null, unknown: string[], duplicate: string[] }}
 */
function parseAlign(value) {
  const out = { v: null, h: null, unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  const words = value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  for (const w of words) {
    if (VERTICAL_SET.has(w)) {
      if (out.v) out.duplicate.push(w);
      else out.v = w;
    } else if (HORIZONTAL_SET.has(w)) {
      if (out.h) out.duplicate.push(w);
      else out.h = w;
    } else out.unknown.push(w);
  }
  if (words.length === 1 && out.h === 'center') out.v = 'middle';
  return out;
}

/** The per-slide classes a value stands for (`bottom right` → `align-bottom align-right`). */
function alignClasses(value) {
  const { v, h } = parseAlign(value);
  const out = [];
  if (v) out.push(`align-${v}`);
  if (h) out.push(`align-${h}`);
  return out;
}

/**
 * Split compound per-slide classes (`align-bottom-right`, `align-left-top`) into their atomic
 * classes, leaving every other class as it is. A compound whose words are not one per axis is
 * left alone, so lint can name it.
 */
function expandAlignClasses(classes) {
  if (!Array.isArray(classes)) return [];
  const out = [];
  for (const c of classes) {
    const m = /^align-([a-z]+)-([a-z]+)$/.exec(c);
    if (m) {
      const p = parseAlign(`${m[1]} ${m[2]}`);
      if (p.v && p.h && !p.unknown.length) {
        out.push(`align-${p.v}`, `align-${p.h}`);
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

/** The axis an atomic class names: 'v', 'h', or null. `align-center` names 'h'. */
function alignTokenAxis(token) {
  if (!ALIGN_TOKEN_SET.has(token)) return null;
  return VERTICAL_SET.has(token.slice('align-'.length)) ? 'v' : 'h';
}

module.exports = {
  VERTICAL,
  HORIZONTAL,
  ALIGN_CSS,
  ALIGN_TOKENS,
  VERTICAL_TOKENS,
  HORIZONTAL_TOKENS,
  parseAlign,
  alignClasses,
  expandAlignClasses,
  alignTokenAxis,
};
