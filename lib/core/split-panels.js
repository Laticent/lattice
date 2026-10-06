/**
 * Split-panel family DOM transform — HTML string rewrite for the two layouts
 * in the family: split-panel (featured left panel + supporting right zone) and
 * split-compare (frame + options + verdict). Each extracts a left-panel header
 * and pairs it with right-panel content; the CSS targets the .panel-left /
 * .panel-right wrappers (split-compare uses .compare-left / .compare-right).
 *
 * split-panel carries the variant set that used to be five separate components:
 *   default     — featured heading + findings list (was split-brief)
 *   .metric     — light-left polarity, hero-number feature (was split-metric)
 *   .pullquote  — pull-quote feature (was split-statement)
 *   .steps      — numbered step-timeline right zone (was split-steps)
 *   .watermark  — accent panel + letterform watermark + meta footer (was split-list)
 * The DOM these emit is one shape (panel-left / panel-right); the variant CSS
 * supplies the distinct finish. See engineering/decisions/2026-06-07-split-
 * family-analysis.md.
 *
 * Runs in the engine render path so the preview
 * preview and the export pipeline see identical DOM without a runtime <script>.
 *
 * Sibling implementations:
 *   - lattice-emulator.js — post-process per-slide transform
 *   - lattice-runtime.js  — DOM fallback for web export
 */

const { parseTopLevelLis, extractFirstList } = require('./html-lists');
const { mapSections } = require('./section-walk');
const { liftSlotLabel } = require('./slot-label-lift');
const { findFirstTag, topLevelElements } = require('./top-level-h2');

const SPLIT_LAYOUTS = ['split-panel', 'split-compare'];

// split-panel variant tokens that change the left-feature assembly. Right-zone
// differences (findings vs numbered steps) are pure CSS, keyed on the variant.
const PANEL_VARIANTS = ['metric', 'pullquote', 'steps', 'watermark'];

// Idempotent: lifts each top-level <li> of the first <ul>/<ol> in `html`
// via liftSlotLabel. Used by the right-panel rebuild paths so the engine
// works whether or not the slotLabelLift Marpit plugin has already run —
// the emulator and runtime contexts skip that plugin.
function liftFirstListItems(html) {
  const listResult = extractFirstList(html);
  if (!listResult) return html;
  const openTagEnd = html.indexOf('>', listResult.start) + 1;
  const openTag    = html.slice(listResult.start, openTagEnd);
  const closeTag   = html[listResult.start + 1] === 'o' ? '</ol>' : '</ul>';
  const items      = parseTopLevelLis(listResult.inner);
  const lifted     = items.map(item => `<li>${liftSlotLabel(item)}</li>`).join('');
  return html.slice(0, listResult.start) + openTag + lifted + closeTag + html.slice(listResult.end);
}

// ---------------------------------------------------------------------------
// Primitive extractors — each removes the first matching element from html
// and returns { matched, html }.
// ---------------------------------------------------------------------------

function extractHeader(html) {
  const m = html.match(/^(\s*<header[^>]*>[\s\S]*?<\/header>\s*)/);
  return m ? { matched: m[1], html: html.slice(m[0].length) } : { matched: '', html };
}

// The running footer is chrome, not content: it stays a DIRECT child of the section, after
// both panels, in every split layout. Nested inside `.panel-right` it escaped the
// `section.no-footer > footer` / `section.silent > footer` suppression (base.variants.css),
// and split-compare, which only re-emits what it recognizes, dropped it outright.
//
// Only the TRAILING footer is the running one. An author's quote attribution is a
// `<footer>` too (`<blockquote>…<footer>— Ada</footer></blockquote>`), and taking the first
// match promoted it to chrome while the real running footer stayed nested. So: the LAST
// `<footer>` in the section, and only when nothing but whitespace follows its close.
function extractFooter(html) {
  const i = html.lastIndexOf('<footer');
  if (i === -1) return { el: '', html };
  const tail = html.slice(i);
  if (!/^<footer\b[^>]*>(?:(?!<footer\b)[\s\S])*?<\/footer>\s*$/.test(tail)) return { el: '', html };
  return { el: tail.trim(), html: html.slice(0, i) };
}

function extractCodeP(html) {
  let codeText = '';
  const out = html.replace(/<p[^>]*>\s*<code[^>]*>([^<]+)<\/code>\s*<\/p>/, (_m, t) => {
    codeText = t;
    return '';
  });
  return { codeText, html: out };
}

function extractH2(html) {
  let el = '';
  const out = html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, (m) => { el = m; return ''; });
  return { el, html: out };
}

// The lede is the paragraph immediately following the heading, in the LEFT
// panel — never a paragraph that's fallen after a later heading (e.g. the
// `proof` variant's `### signal` label). Bounding the search to before the
// next h3–h6 keeps a right-zone paragraph like `proof`'s scenario callout
// from being mistaken for the (omitted) lede when no lede was authored.
//
// And only a TOP-LEVEL paragraph. The first `<p>` anywhere used to match the one inside a
// `<blockquote>` or a list item, so a quote with no lede above it lost its text to the left
// panel and kept an empty shell (plus its attribution) on the right. The DOM path only ever
// looked at direct children; the parity test in split-panels-chrome.test.js caught the drift.
//
// Every slot is read through `topLevelElements` (lib/core/top-level-h2.mjs), the tokenizer and
// open-element stack the masthead and topic-track read their headings with. A hand-rolled mask
// of named blocks (`div`, `table`, …) stood here before: it missed every container it did not
// name (`<span>`, `<main>`, `<dd>`, a stray `<li>`, `<template>`, `<svg><foreignObject>`) and
// read a `<script>`/`<style>`/`<textarea>` body and attribute values as markup, so a quote in
// any of those was the slot on this path and not on the DOM path's `:scope > blockquote`
// (followups.d/2478-p4-split-slot-mask-coverage.md). The stack also closes what a parser closes
// implicitly: an unclosed `<p>` ends where the next block starts.
function firstTopLevel(html, names, before = Infinity) {
  for (const el of topLevelElements(html)) {
    if (el.start >= before) return null;
    if (names.includes(el.name)) return el;
  }
  return null;
}

// The lede is bounded by the first h3-h6 (`proof`'s `### signal` label), found through the same
// tokenizer so a heading named in a comment or an attribute bounds nothing.
function headingBoundary(html) {
  const at = ['h3', 'h4', 'h5', 'h6'].map(h => findFirstTag(html, h)).filter(i => i !== -1);
  return at.length ? Math.min(...at) : Infinity;
}

function cut(html, el) {
  if (!el) return { el: '', html };
  return { el: html.slice(el.start, el.end), html: html.slice(0, el.start) + html.slice(el.end) };
}

function extractFirstP(html, { headingBoundary: bounded = true } = {}) {
  return cut(html, firstTopLevel(html, ['p'], bounded ? headingBoundary(html) : Infinity));
}

// The first TOP-LEVEL `<blockquote>`, whole: the verdict (split-compare) and the pull quote
// (split-panel `pullquote`), as the DOM path reads them (`:scope > blockquote`). Whole means to
// the close the parser finds: a nested quote does not end it, and an unclosed one runs to the end.
function extractFirstBlockquote(html) {
  return cut(html, firstTopLevel(html, ['blockquote']));
}

// ---------------------------------------------------------------------------
// split-panel — one transform, three left-assembly modes; the right zone is
// always the lifted list. The variant CSS supplies the per-variant finish.
// ---------------------------------------------------------------------------

function applyPanel(inner, variant) {
  if (inner.includes('class="panel-left"')) return inner;
  const { matched: header, html: rh } = extractHeader(inner);
  const { el: footer, html: r0 } = extractFooter(rh);

  let leftInner;
  let rest;

  if (variant === 'pullquote') {
    // pull-quote feature: blockquote + optional inline-code cite.
    const { el: bq,       html: r1 } = extractFirstBlockquote(r0);
    const { codeText,     html: r2 } = extractCodeP(r1);
    const cite = codeText ? `<cite>${codeText}</cite>` : '';
    leftInner = `${bq}${cite}`;
    rest = r2;
  } else if (variant === 'watermark') {
    // accent panel: first-letter watermark glyph + code-eyebrow + h5 + h2;
    // everything after goes to the right panel.
    const h2Match    = r0.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const h5Match    = r0.match(/<h5[^>]*>[\s\S]*?<\/h5>/);
    const codePMatch = r0.match(/<p[^>]*>\s*<code[^>]*>[^<]+<\/code>\s*<\/p>/);
    const h2    = h2Match ? h2Match[0] : '';
    const h5    = h5Match ? h5Match[0] : '';
    const codeP = codePMatch ? codePMatch[0] : '';
    const h2Text = h2Match ? h2Match[1].replace(/<[^>]+>/g, '').trim() : '';
    const watermarkLetter = h2Text ? h2Text[0] : 'S';
    let rr = r0;
    if (h2)    rr = rr.replace(h2,    '');
    if (h5)    rr = rr.replace(h5,    '');
    if (codeP) rr = rr.replace(codeP, '');
    leftInner = `<div class="watermark">${watermarkLetter}</div>${codeP}${h5}${h2}`;
    rest = rr;
  } else {
    // default (heading) + metric (hero number) + steps (phase) all share this
    // shape: code-eyebrow + h2 + lede paragraph. The variant CSS restyles the
    // h2 (number vs heading) and the eyebrow (phase watermark vs mono label).
    const { codeText, html: r1 } = extractCodeP(r0);
    const { el: h2,   html: r2 } = extractH2(r1);
    const { el: introP, html: r3 } = extractFirstP(r2);
    const eyebrow = codeText ? `<span class="panel-eyebrow">${codeText}</span>` : '';
    leftInner = `${eyebrow}${h2}${introP}`;
    rest = r3;
  }

  return header +
    `<div class="panel-left">${leftInner}</div>` +
    `<div class="panel-right">${liftFirstListItems(rest.trim())}</div>` +
    footer;
}

// ---------------------------------------------------------------------------
// split-compare — the one structurally-distinct member: frame + heading +
// context on the left; a 2-option grid + a verdict card on the right.
// ---------------------------------------------------------------------------

// Every comment out, to a fixed point: one pass can stitch a new `<!--` out of the text around a
// removed one (`<!<!-- x -->--`), and an unterminated `<!--` runs to the end, as it does in HTML.
// `--!>` closes a comment too, as it does in HTML.
function dropComments(html) {
  let prev;
  let out = html;
  do {
    prev = out;
    // `<!-->` and `<!--->` are complete (empty) comments in HTML, so they must not open a span
    // that eats the content after them.
    out = out.replace(/<!--(?:-?>|[\s\S]*?(?:--!?>|$))/g, '');
  } while (out !== prev);
  return out;
}

// The CLOSED comments `dropComments` removes on its first pass, in source order: the speaker notes,
// `describe:` / `caption:` channels and pragmas (`<!-- stress-slide -->`) a slide carries at this
// point in the render. An unterminated `<!--` and the empty `<!-->` / `<!--->` are not kept: the
// first says nothing notes-core can read, and re-emitted ahead of the panels it would swallow them.
function closedComments(html) {
  const out = [];
  for (const m of html.matchAll(/<!--(?:-?>|[\s\S]*?(?:--!?>|$))/g)) {
    if (/^<!--[\s\S]*--!?>$/.test(m[0]) && !/^<!---?>$/.test(m[0])) out.push(m[0]);
  }
  return out;
}

function applyCompare(inner) {
  if (inner.includes('class="compare-left"')) return inner;
  // The engine emits the header first, so the plain read is the byte-stable one. A comment AHEAD of
  // the header (hand-built HTML) hid it from that read, and it was dropped, so retry without them.
  let { matched: header, html: rh } = extractHeader(inner);
  let notes = closedComments(rh);
  if (!header) {
    ({ matched: header, html: rh } = extractHeader(dropComments(inner)));
    notes = closedComments(inner);
  }
  // Comments go before any CONTENT slot is read, and come back after the header, ahead of both
  // panels. A speaker note is still a raw comment here, and a note that merely MENTIONS
  // `<blockquote>` or `<ul>` otherwise reads as markup to every extractor below: it emptied the
  // option cards and leaked ` -->`. So they are LIFTED, not read in place: `notes` holds them
  // whole, and notes-core (`extractSlideNotes`) reads them from the rebuilt section like any other
  // slide's. Ahead of the panels is where the DOM path leaves them too — it moves the slots into
  // the panels and the comment nodes stay where they were. The strip runs after the header, not
  // before: the header match takes the whitespace behind it, and a comment there is what has
  // always bounded it, so a section with no comments keeps its bytes.
  const { el: footer, html: r0 }      = extractFooter(dropComments(rh));
  const { codeText, html: r1 }        = extractCodeP(r0);
  const { el: h2,   html: r2 }        = extractH2(r1);
  // No heading boundary: that stop exists for `proof`'s `### signal` label, and split-compare has
  // no such slot. With it, a `###### eyebrow` above the context paragraph sent the paragraph to the
  // options zone here while the DOM path (`findFirstNonCodeP`) kept it in the dark panel.
  const { el: introP, html: r3 }      = extractFirstP(r2, { headingBoundary: false });
  const frameLabel = codeText ? `<span class="frame-label">${codeText}</span>` : '';

  // Both slots are TOP-LEVEL, as the DOM path reads them (`:scope > ul, :scope > ol` and
  // `:scope > blockquote`). The option list is the first list outside every nesting block, so a
  // verdict written above the options keeps its own bullets and a list in raw HTML above them (a
  // `<div>`, a table cell) stays where it is. It comes out before the verdict is read, so a
  // blockquote nested inside an option stays in its option.
  let optionDivs = '';
  let r4 = r3;
  const located = firstTopLevel(r3, ['ul', 'ol']);
  const listResult = located && extractFirstList(r3.slice(located.start));
  if (listResult) {
    listResult.start += located.start;
    listResult.end += located.start;
    const items = parseTopLevelLis(listResult.inner);
    optionDivs = items.map((item, i) => {
      const cls = i === 1 ? 'option preferred' : 'option';
      return `<div class="${cls}">${liftSlotLabel(item)}</div>`;
    }).join('');
    r4 = r3.slice(0, listResult.start) + r3.slice(listResult.end);
  }
  const { el: bq, html: r5 } = extractFirstBlockquote(r4);
  const unclaimed = r5;

  // A block no slot claims (a second paragraph, a note under the options) rides in the options
  // zone after the options and before the verdict, in source order: split-panel sends its own
  // unclaimed blocks to its supporting zone the same way. It used to be dropped here, while the
  // DOM path (lib/transformers/split-panels.js) left it in front of both panels.
  const verdictHtml = bq ? `<div class="verdict">${bq}</div>` : '';
  return header + notes.join('') +
    `<div class="compare-left">${frameLabel}${h2}${introP}</div>` +
    `<div class="compare-right"><div class="options">${optionDivs}</div>${unclaimed.trim()}${verdictHtml}</div>` +
    footer;
}

// ---------------------------------------------------------------------------
// Section dispatcher
// ---------------------------------------------------------------------------

function transformSplitSection(innerHtml, cls) {
  const tokens = cls.trim().split(/\s+/);
  if (tokens.includes('split-compare')) return applyCompare(innerHtml);
  if (tokens.includes('split-panel')) {
    const variant = PANEL_VARIANTS.find(v => tokens.includes(v)) || '';
    return applyPanel(innerHtml, variant);
  }
  return innerHtml;
}

/**
 * Walk every `<section>` in Marpit's rendered HTML output and rewrite
 * split-* family slides in place. Non-split sections pass through unchanged.
 */
// ── proof sequencing ──────────────────────────────────────────────────────
// A `proof` slide is, by definition, one entry in a SEQUENCE — a leveled
// progression, a staged rollout. Its position in that sequence is what picks
// its categorical tint, and the deck already states that position: it's the
// order the slides appear in. Making the author also type `cat-6` is the same
// defect as a hand-typed `01` ordinal — redundant, and silently wrong the
// moment a slide is reordered or one is inserted ahead of it. So the engine
// assigns it.
//
// `capstone` IMPLIES `proof`: capstone only re-skins proof's three-item shape,
// it has no DOM of its own, so `split-panel capstone` alone is enough.
//
// An explicitly authored `cat-N` always wins — the escape hatch for a deck that
// wants a specific hue on a specific slide (or the same hue twice).
const CAT_SLOTS = 8;
const HAS_CAT_RE = /(?<![\w-])cat-[1-8](?![\w-])/;

function sequenceProofPanels(openTag, cls, seq) {
  const tokens = cls.trim().split(/\s+/);
  if (!tokens.includes('split-panel')) return openTag;
  const isCapstone = tokens.includes('capstone');
  if (!isCapstone && !tokens.includes('proof')) return openTag;

  const add = [];
  if (isCapstone && !tokens.includes('proof')) add.push('proof');
  // Count every proof slide, including one that pinned its own cat-N, so an
  // explicit override doesn't shift the hue of every slide after it.
  const n = seq.next();
  if (!HAS_CAT_RE.test(cls)) add.push(`cat-${((n - 1) % CAT_SLOTS) + 1}`);
  if (!add.length) return openTag;

  const next = `${cls} ${add.join(' ')}`.trim();
  // Rewrite BOTH `class` and the `data-class` mirror the engine stamps, so the
  // runtime/preview paths that read either see the same resolved class list.
  return openTag
    .replace(/\sclass="[^"]*"/, () => ` class="${next}"`) // a function: `next` holds the author's class words
    .replace(/\sdata-class="([^"]*)"/, (_m, d) => ` data-class="${`${d} ${add.join(' ')}`.trim()}"`);
}

function applyToRenderedHtml(html) {
  let count = 0;
  const seq = { next: () => ++count };
  return mapSections(html, (openTag, cls, inner) => {
    const isSplit = SPLIT_LAYOUTS.some(l => cls.trim().split(/\s+/).includes(l));
    if (!isSplit) return null;
    const nextOpen = sequenceProofPanels(openTag, cls, seq);
    const nextCls = (nextOpen.match(/\sclass="([^"]*)"/) || [undefined, cls])[1];
    return { openTag: nextOpen, inner: transformSplitSection(inner, nextCls) };
  });
}

module.exports = {
  SPLIT_LAYOUTS,
  PANEL_VARIANTS,
  applyToRenderedHtml,
  // Exposed for unit tests
  transformSplitSection,
  applyPanel,
  applyCompare,
};
