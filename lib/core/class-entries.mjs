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
 * EVERY class setting the engine reads, in source order, each with its slide: one entry per `<!-- _class: … -->`,
 * `<!-- class: … -->` and per slide record that sets a class (`<!-- @meta{layout=cards, class=dark} -->` gives
 * `cards dark`, the words the engine applies). A tool that used to count or read `_class` comments with its own regex
 * reads this instead, so it sees a deck written in records exactly as it sees one written in comments
 * (engineering/decisions/2026-10-17-meta-record.md §15, slice A). `slide` is indexed as `splitTopLevel` indexes
 * chunks, like `slideClassDirectives`; `spot` is false for the running global form, and `nested` is true for a comment
 * inside a list item or a blockquote (the engine applies a nested comment; it never reads a nested record, D1).
 *
 * @param {string} source
 * @returns {{slide: number, line: number, value: string, spot: boolean, record: boolean, nested: boolean, text: string}[]}
 */
export function classEntries(source) {
  const out = [];
  scanMetaSource(source).slides.forEach(({ comments }, slide) => {
    for (const c of comments) {
      if (c.kind !== 'directive' || c.key !== 'class') continue;
      out.push({ slide, line: c.line, value: c.value, spot: !!c.spot, record: !!c.record, nested: !!c.nested, text: c.raw });
    }
  });
  return out;
}
