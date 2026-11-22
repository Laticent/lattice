/**
 * lib/core/class-entries.mjs
 *
 * A view over `scanMetaSource` (lib/core/meta-scan.mjs) for TOOLS and the Studio: every class setting a deck makes, in
 * either spelling. Its own module, not a third export of class-directive-scan.mjs, because the linter's browser bundle
 * reaches that module and is a route-budget metric; nothing in the lint core needs this view.
 *
 * Pure, fs-free, ESM.
 */

import { scanMetaSource } from './meta-scan.mjs';

/**
 * EVERY class setting the deck writes, in source order, each with its slide: one entry per `<!-- _class: … -->`,
 * `<!-- class: … -->` and per slide record that sets a class (`<!-- @meta{layout=cards, class=dark} -->` gives
 * `cards dark`, the words the engine applies). A tool that used to count or read `_class` comments with its own regex
 * reads this instead, so it sees a deck written in records exactly as it sees one written in comments
 * (engineering/decisions/2026-10-17-meta-record.md §15, slice A). `slide` is indexed as `splitTopLevel` indexes
 * chunks, like `slideClassDirectives`; `spot` is false for the running global form, and `nested` is true for a comment
 * inside a list item or a blockquote (the engine applies a nested comment; it never reads a nested record, D1).
 * `folded` is true for a comment inside a larger HTML block, which the engine applies nothing from; it is listed because
 * the regexes this replaces counted it too, and a caller that wants only what applies drops it.
 *
 * @param {string} source
 * @returns {{slide: number, line: number, value: string, spot: boolean, record: boolean, nested: boolean, folded: boolean, text: string}[]}
 */
export function classEntries(source) {
  const out = [];
  scanMetaSource(source).slides.forEach(({ comments }, slide) => {
    for (const c of comments) {
      if (c.kind !== 'directive' || c.key !== 'class') continue;
      out.push({ slide, line: c.line, value: c.value, spot: !!c.spot, record: !!c.record, nested: !!c.nested, folded: !!c.folded, text: c.raw });
    }
  });
  return out;
}

/** A line that could hold a class setting: a `_class`/`class` comment or a record opener. A cheap superset. */
const mayHoldClass = (line) => line.includes('<!--') && (line.includes('class') || line.includes('{'));

/**
 * The first SPOT class of `source` (`classEntries(source).find((e) => e.spot)?.value`), reading only the PREFIX through
 * the first line that sets one, and on to that comment's `-->` for a record that wraps. Exact, not a guess: a line's
 * block role, and so every boundary above it, is decided by the lines above it (the contract `classDirectiveAt` rests
 * on). The Playground's picker asks this on every keystroke; on a 120-slide deck the whole-deck scan cost 1.8 ms and
 * this 0.14 ms. After three candidates that set nothing (fenced examples, plain comments) it reads the whole source.
 *
 * @param {string} source
 * @returns {string}
 */
export function firstSpotClass(source) {
  const src = String(source ?? '');
  const lines = src.split('\n');
  let tries = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!mayHoldClass(lines[i])) continue;
    if (++tries > 3) break;
    let end = i;
    while (end < lines.length - 1 && !lines[end].includes('-->')) end++;
    const hit = classEntries(lines.slice(0, end + 1).join('\n')).find((e) => e.spot);
    if (hit) return hit.value;
    i = end;
  }
  return classEntries(src).find((e) => e.spot)?.value ?? '';
}
