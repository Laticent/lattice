/**
 * lib/core/resolve-align.js — the `align:` register: where a slide's content sits, on both axes.
 *
 * One key, two axes, everyday words modeled on flexbox (owner, 2026-11-06,
 * engineering/decisions/2026-11-06-unified-align.md). It replaced the `cards:` register outright.
 *
 *   up and down    top · middle · bottom · spread · fill
 *   side to side   left · center · right · full
 *
 * One word or two, in any order (`align: bottom right`). Each word belongs to one axis, except
 * `center` ALONE, which centers both. Per slide the same words are classes: `_class: align-top`,
 * `align-center`, and the compound `align-bottom-right`, which `expandAlignClasses` splits into
 * its two atomic classes before anything reads the list.
 *
 * WHO READS WHAT.
 * - UP AND DOWN, for a component whose manifest declares an `align` default (the components
 *   that place a row or stack of members): the engine resolves the word, slide over deck over
 *   the manifest's default, and stamps it as `data-align`; base.tokens.css turns that into
 *   `--align-v` (and its companions `--align-grow`, `--align-track`, `--align-basis`), which
 *   the component's stylesheet reads. Every other component reads the class itself, through the
 *   stage rules in lib/forms/cell/stage/stage.css.
 * - SIDE TO SIDE is the stage's `align-items`, set by the `align-left|center|right|full` classes
 *   in stage.css, for every component.
 *
 * A deck with no `align:` line keeps each component's own default, so omitting the key keeps
 * every deck looking as it did.
 */

const { frontMatterValue } = require('./front-matter-key');
const ALIGN_CATALOG = require('./align-catalog.generated.js');

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

/** The deck's `align:` value, read from a source's front matter, or null. */
function readFrontMatterAlign(md) {
  if (!md) return null;
  const m = md.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  return frontMatterValue(m[1], 'align');
}

function alignClassesFromSource(md) {
  return alignClasses(readFrontMatterAlign(md) || '');
}

/** Is every word in this value one the register knows (and no axis named twice)? */
function isKnownAlign(value) {
  const p = parseAlign(value);
  return typeof value === 'string' && value.trim() !== '' && !p.unknown.length && !p.duplicate.length;
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

/**
 * Merge a deck's align classes into a slide's: a slide that names an axis keeps its own word for
 * it, and `align-center` alone on the slide counts as naming both axes. Returns the deck tokens
 * that survive.
 */
function deckAlignTokensFor(slideClasses, deckTokens) {
  const list = expandAlignClasses(slideClasses);
  const own = new Set(list.map(alignTokenAxis).filter(Boolean));
  if (list.includes('align-center') && !own.has('v')) own.add('v');
  return deckTokens.filter((t) => !own.has(alignTokenAxis(t)));
}

function governedComponent(classes) {
  if (!Array.isArray(classes)) return null;
  for (const c of classes) if (ALIGN_CATALOG[c]) return c;
  return null;
}

/** The component's declared up-and-down default, by coda, class and shape family. */
function componentAlign(component, { family, hasCoda, classes } = {}) {
  const entry = ALIGN_CATALOG[component];
  if (!entry) return null;
  if (hasCoda && entry.withCoda) return entry.withCoda;
  if (entry.byClass && Array.isArray(classes)) {
    for (const [cls, v] of Object.entries(entry.byClass)) if (classes.includes(cls)) return v;
  }
  if (family && entry.byFamily?.[family]) return entry.byFamily[family];
  return entry.default || null;
}

/**
 * The up-and-down word a governed component's slide uses: the slide's (or deck's) own class,
 * then a split body page's centered default, then the manifest. `align-center` alone means
 * `middle`. Null for a component that declares no default.
 */
function resolveAlign({ classes, family, hasCoda, splitBody } = {}) {
  const list = expandAlignClasses(classes || []);
  const component = governedComponent(list);
  if (!component) return null;
  const v = list.find((c) => alignTokenAxis(c) === 'v');
  if (v) return v.slice('align-'.length);
  if (list.includes('align-center')) return 'middle';
  if (splitBody) return 'middle';
  return componentAlign(component, { family: family || 'wide', hasCoda, classes: list });
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
  readFrontMatterAlign,
  alignClassesFromSource,
  isKnownAlign,
  expandAlignClasses,
  alignTokenAxis,
  deckAlignTokensFor,
  governedComponent,
  componentAlign,
  resolveAlign,
};
