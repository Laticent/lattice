/**
 * Re-scope a stepping slide's walk to the units it actually holds.
 *
 * The step contract (engineering/decisions/2026-11-09-steps-as-a-behavior.md): the resolvers
 * (lib/transformers/focus.js, lib/transformers/build.js) tag each unit with its step, and the slide with its walk
 * (`data-steps`, `data-step-kind`, for focus `data-step-axes` / `data-step-styles`). Two things can leave a walk
 * that is longer than what the slide shows, and every extra step is a press that changes nothing on screen:
 *
 *   - a step that lights NOTHING here: `_focusSteps: row 1 | item 9` on a two-item list, or a step whose axis the
 *     slide does not have. Its press only dims the slide, or does nothing at all;
 *   - a slide the structural split (lib/engine/structural-split.js) cut into pages. Each page keeps the section's
 *     open tag, so each page carried the WHOLE walk while holding one unit of it: a build page sat blank until its
 *     own item's step, and a focus page dimmed its one item for the whole walk (found by the red team, 2026-11-09).
 *
 * So the walk is renumbered to the steps that light (focus) or reveal (build) something on THIS section, in order;
 * recede marks for dropped steps go; a section with no step left loses its walk and reads as a plain slide. A walk
 * that already fits returns the input unchanged, so no slide without a gap moves a byte.
 *
 * Two forms, one rule (HARD RULE #1): `rescopeSectionHtml` for the engine's string path and the split, and
 * `rescopeSectionDom` for the live-DOM resolvers.
 */

const { readAttr } = require('@laticent/markup');
const { setAttr } = require('./collections');

const WALK_ATTRS = ['data-steps', 'data-step-kind', 'data-step-axes', 'data-step-styles', 'data-build-steps'];

const tokens = (v) => String(v || '').split(/\s+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const dropAttr = (tag, name) => tag.replace(new RegExp(`\\s${name}="[^"]*"`), '');

/** The plan for one walk: which old steps survive, and their new numbers. `null` when nothing changes. */
function planFor(count, units) {
  const live = new Set();
  for (const u of units) for (const k of tokens(u.step)) live.add(k);
  const kept = [...live].filter((k) => k <= count).sort((a, b) => a - b);
  const same = kept.length === count && kept.every((k, i) => k === i + 1);
  if (same) return null;
  return { kept, map: new Map(kept.map((k, i) => [k, i + 1])) };
}

const remap = (value, map) => tokens(value).filter((k) => map.has(k)).map((k) => map.get(k)).join(' ');
const pick = (list, kept) => {
  const parts = String(list || '').split(' ');
  return kept.map((k) => parts[k - 1] || '-').join(' ');
};

// A unit is an opening tag that carries a step mark.
const isUnit = (tag) => / data-step(?:-recede)?="/.test(tag);
// Every opening tag (`<` then a letter, up to the next `>`), rewritten by `fn`. A hand walk, not a global regex: a
// `/<[a-zA-Z][^>]*>/g` scan is polynomial on `<A<A<A…` (the regex census, tools/regex-census.json).
function mapOpenTags(html, fn) {
  let out = '';
  let i = 0;
  for (;;) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    const c = html.charCodeAt(lt + 1);
    const letter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    const gt = letter ? html.indexOf('>', lt) : -1;
    if (gt < 0) {
      out += html.slice(i, lt + 1);
      i = lt + 1;
      if (letter) break; // an unclosed tag: the rest is text
      continue;
    }
    out += html.slice(i, lt) + fn(html.slice(lt, gt + 1));
    i = gt + 1;
  }
  return out + html.slice(i);
}

/**
 * @param {string} openTag the `<section …>` open tag
 * @param {string} inner the section's inner HTML
 * @returns {{ openTag: string, inner: string }}
 */
function rescopeSectionHtml(openTag, inner) {
  const kind = readAttr(openTag, 'data-step-kind');
  if (kind !== 'build' && kind !== 'focus') return { openTag, inner };
  const count = Number(readAttr(openTag, 'data-steps')) || 0;
  const units = [];
  mapOpenTags(inner, (tag) => {
    if (isUnit(tag)) units.push({ step: readAttr(tag, 'data-step') });
    return tag;
  });
  const plan = planFor(count, units);
  if (!plan) return { openTag, inner };
  const { kept, map } = plan;
  const newInner = mapOpenTags(inner, (tag) => {
    if (!isUnit(tag)) return tag;
    let t = tag;
    for (const name of ['data-step', 'data-build-step', 'data-step-recede']) {
      const v = readAttr(t, name);
      if (v == null) continue;
      const next = remap(v, map);
      t = next ? setAttr(t, name, next) : dropAttr(t, name);
    }
    return t;
  });
  let newOpen = openTag;
  if (!kept.length) {
    for (const name of WALK_ATTRS) newOpen = dropAttr(newOpen, name);
    return { openTag: newOpen, inner: newInner };
  }
  newOpen = setAttr(newOpen, 'data-steps', String(kept.length));
  if (readAttr(newOpen, 'data-build-steps') != null) newOpen = setAttr(newOpen, 'data-build-steps', String(kept.length));
  for (const name of ['data-step-axes', 'data-step-styles']) {
    const v = readAttr(newOpen, name);
    if (v != null) newOpen = setAttr(newOpen, name, pick(v, kept));
  }
  return { openTag: newOpen, inner: newInner };
}

/** The live-DOM twin. @param {Element} sec */
function rescopeSectionDom(sec) {
  const kind = sec.getAttribute('data-step-kind');
  if (kind !== 'build' && kind !== 'focus') return;
  const count = Number(sec.getAttribute('data-steps')) || 0;
  const els = [...sec.querySelectorAll('[data-step], [data-step-recede]')];
  const plan = planFor(count, els.map((el) => ({ step: el.getAttribute('data-step') })));
  if (!plan) return;
  const { kept, map } = plan;
  for (const el of els) {
    for (const name of ['data-step', 'data-build-step', 'data-step-recede']) {
      if (!el.hasAttribute(name)) continue;
      const next = remap(el.getAttribute(name), map);
      if (next) el.setAttribute(name, next);
      else el.removeAttribute(name);
    }
  }
  if (!kept.length) {
    for (const name of WALK_ATTRS) sec.removeAttribute(name);
    return;
  }
  sec.setAttribute('data-steps', String(kept.length));
  if (sec.hasAttribute('data-build-steps')) sec.setAttribute('data-build-steps', String(kept.length));
  for (const name of ['data-step-axes', 'data-step-styles']) {
    if (sec.hasAttribute(name)) sec.setAttribute(name, pick(sec.getAttribute(name), kept));
  }
}

/**
 * The string twin of step-pages.mjs `expandStepPages`, for a document's BOOKKEEPING: the CLI expands the step pages
 * in its settled browser page (painted there), and expands a COPY of its HTML string here by the same rule, for the
 * readers that count PRINTED pages (the PDF's and, under --steps, the office files' notes per page). Captions, the
 * --fluid sidecar and narration keep the unexpanded string: they describe the deck as presented. Copies
 * are not painted; nothing reads their classes. Same rule: a top-level, shown section with a walk of N steps becomes
 * N copies, each stamped `data-step-page`. Anything before the first section (the head) is left alone.
 *
 * @param {string} docHtml @returns {string}
 */
function expandStepPagesHtml(docHtml) {
  if (typeof docHtml !== 'string' || docHtml.indexOf('data-step-kind="') === -1) return docHtml;
  const { splitSections } = require('@laticent/markup');
  const stamp = docHtml.indexOf('data-lattice-slide=');
  const at = stamp < 0 ? docHtml.indexOf('<section') : docHtml.lastIndexOf('<section', stamp);
  if (at < 0) return docHtml;
  return docHtml.slice(0, at) + splitSections(docHtml.slice(at)).map((p) => {
    if (p.type !== 'section') return p.text;
    const kind = readAttr(p.openTag, 'data-step-kind');
    const n = Number(readAttr(p.openTag, 'data-steps')) || 0;
    if ((kind !== 'build' && kind !== 'focus') || n < 1 || readAttr(p.openTag, 'data-lattice-hidden') === 'true') {
      return `${p.openTag}${p.inner}</section>`;
    }
    let out = '';
    for (let k = 1; k <= n; k++) out += `${setAttr(p.openTag, 'data-step-page', String(k))}${p.inner}</section>`;
    return out;
  }).join('');
}

module.exports = { rescopeSectionHtml, rescopeSectionDom, expandStepPagesHtml };
