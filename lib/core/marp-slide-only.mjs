/**
 * lib/core/marp-slide-only.mjs — the export-to-Marp boundary for the slide-only directives.
 *
 * Lattice reads `header` and `footer` as SLIDE-ONLY keys: a slide comment sets that
 * slide alone, in either spelling (`<!-- header: H -->` or `<!-- _header: H -->`), and only front
 * matter sets them for every slide (lib/core/meta-keys.mjs `SLIDE_ONLY_KEYS`, the owner's ruling,
 * audit §11r). Marp reads the plain spelling as a running global that carries onto every later
 * slide. So a deck exported to Marp as written would render a plain header on every slide after
 * its own, which is not the deck the author saw.
 *
 * This rewrites each plain slide-only directive comment into its underscore spelling, which Marp
 * scopes to its slide as Lattice does, so the bundle renders the same deck in both. A comment the
 * engine does not read as a directive (prose, anything in code) is left alone. Front matter is not
 * touched.
 *
 * Pure: string in, string out, and a deck with nothing to rewrite comes back byte-identical.
 *
 * NOT IN THE ENGINE BUNDLE, on purpose. `marp-bundle.js` ships in the browser engine every route loads, and this
 * rewrite in it put the getting-started route 164 bytes over its engine ceiling. So each producer of a Marp bundle calls
 * it on the deck it hands `withRuntimeScriptsReport`: the CLI (tools/export-marp.js) directly, the Studio
 * (docs/src/components/studio/export/deck-export.js) through a dynamic import, which lands it in a chunk only an export
 * loads. test/unit/core/marp-slide-only.test.js pins both call sites, so a third producer cannot forget it.
 *
 * ESM, so the docs site imports it as source; CJS callers use the `.js` door beside it.
 */

import { FRONT_MATTER, boundaryParser as md, normalizeSource } from './boundary-parser.mjs';
import { readDirectiveComment } from './comment-directive.mjs';
import { DIRECTIVE_VOCAB, SLIDE_ONLY_KEYS } from './meta-keys.mjs';

/** A slide-only key at the start of a line of a directive comment: the opening `<!-- header:` (after any blockquote
 *  marker) or a later line of a comment that holds several keys. */
const KEY = new RegExp(`^([\\s>]*(?:<!--\\s*)?)(${[...SLIDE_ONLY_KEYS].join('|')})(\\s*:)`);

/**
 * The deck with every plain `header:` / `footer:` directive comment written as `_header:` / `_footer:`.
 * Page numbers are not a slide directive; lib/core/marp-bundle-scope.js says them in Marp's terms.
 *
 * FOUND THE WAY THE ENGINE FINDS THEM: a directive is an `html_block` token of the shared boundary parser
 * (lib/core/boundary-parser.js), the parser `bakeSplits` uses, never a line pattern. So fenced and indented code, code
 * inside a list or a blockquote, inline code, and an inline comment mid-paragraph (which the engine does not read as a
 * directive either) are left exactly as written. A first draft modelled fences by hand and a checker found four shapes
 * it rewrote and one (a value holding a backtick) it skipped, which Marp then carried.
 *
 * A comment that holds several keys on separate lines has each slide-only key rewritten, so Marp scopes all of them.
 * @param {string} deck
 * @returns {string}
 */
export function withSlideOnlySpotted(deck) {
  const source = String(deck ?? '');
  if (!source.includes('<!--')) return source;
  const src = normalizeSource(source);
  const fm = (src.match(FRONT_MATTER) || [''])[0];
  const lines = src.slice(fm.length).split('\n');
  let changed = false;
  for (const t of md.parse(lines.join('\n'), {})) {
    const dir = t.type === 'html_block' && t.map && readDirectiveComment(t.content.trim(), DIRECTIVE_VOCAB);
    if (!dir || dir.spot || !SLIDE_ONLY_KEYS.has(dir.key)) continue;
    for (let n = t.map[0]; n < t.map[1]; n++) lines[n] = lines[n].replace(KEY, '$1_$2$3');
    changed = true;
  }
  return changed ? fm + lines.join('\n') : source;
}
