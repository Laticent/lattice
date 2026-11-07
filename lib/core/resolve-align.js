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

const {
  VERTICAL, HORIZONTAL, ALIGN_CSS, ALIGN_TOKENS, VERTICAL_TOKENS, HORIZONTAL_TOKENS,
  parseAlign, alignClasses, expandAlignClasses, alignTokenAxis,
} = require('./align-words');

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
