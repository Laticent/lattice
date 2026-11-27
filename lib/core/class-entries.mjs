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

/**
 * The class words ONE slide applies, in either spelling, as the engine resolves them: last wins, a record outside a list
 * item or blockquote, and a comment that sets two directives (`<!-- footer: Q3\n_class: kpi -->`) reads as the engine
 * reads it (the footer takes the whole value, so no class). `''` when the slide sets none. For READERS; an editor that
 * needs the setting's span uses lib/core/meta-edit.mjs `readMetaField`, which reads a `_class:` line anywhere in a
 * comment so it can write back to it.
 *
 * @param {string} source one slide's markdown
 * @returns {string}
 */
export function slideClassValue(source) {
  return scanMetaSource(source).slides.at(-1)?.resolved.get('class')?.value ?? '';
}
