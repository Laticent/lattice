/**
 * lib/core/class-directive-scan.mjs
 *
 * WHICH CLASS GOVERNS THIS SLIDE — answered from raw source, by a LINE SCAN, for
 * the two AUTHORING surfaces that cannot run the render pipeline: the deck linter
 * (`lib/authoring/lint-core.js`, pure and fs-free by HARD RULE #7) and the
 * editor's autocomplete (`docs/src/playground/slide-context.js`, which runs on
 * every keystroke).
 *
 * WHAT IT REPLACES, and why one regex was three defects:
 *
 *     const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;
 *
 *   1. THE GLOBAL FORM IS INVISIBLE. Marp has two class directives — the spot
 *      `<!-- _class: … -->` (this slide) and the bare `<!-- class: … -->` (a
 *      running global, in force from its slide to the end of the deck). This
 *      matches only the spot form, so on a deck using the bare form the linter
 *      and the renderer disagree about every slide from the directive onward.
 *   2. WITH THE REAL DIRECTIVE INVISIBLE, A QUOTED ONE TAKES ITS PLACE. The regex
 *      is non-global and used with `.match()`, so it takes the FIRST `_class:` on
 *      the slide — which, on a slide whose real directive is the global form, is
 *      whatever the prose happens to quote. A deck teaching its own syntax
 *      (`` The docs write `<!-- _class: kpi -->` when they mean… ``) linted as
 *      `kpi`.
 *   3. AND THE WRONG CLASS IS NOT JUST A FALSE POSITIVE. The class selects the
 *      per-component slot rules — the card-shape checks, the bodyless-item rules,
 *      the variant vocabulary — so a slide linted as the wrong component is
 *      checked against the wrong contract in BOTH directions.
 *
 * A LINE SCAN FOR THE DIRECTIVES, THE PARSER FOR THE BOUNDARIES. Where a slide
 * BEGINS is not decided here — `chunkBoundaryLines` (lib/core/slide-boundaries.mjs)
 * decides it, by asking the engine's own markdown-it (#1271). That is the whole
 * reason this function can promise it indexes exactly like `splitTopLevel`: both
 * read the same derivation, so the promise is structural rather than a comment
 * two files have to keep agreeing on.
 *
 * The first cut of this module scanned for boundaries too, with its own
 * `/^---$/`, on the grounds that pulling markdown-it into the browser bundle
 * (`tools/build-authoring-core.js`) roughly tripled it. Two things changed. The
 * cores now reach markdown-it anyway through `slide-boundaries.mjs`, and it is
 * marked EXTERNAL there, so it resolves to the copy the docs site already loads
 * rather than being inlined — the bundle is 126KB, smaller than before. And the
 * scan's `---`-only rule was WRONG in both directions: it missed `***`, `___`,
 * `- - -`, `--- ` with a trailing space, `----` and an indented `---` (all
 * top-level `hr`, all slide breaks to the engine), and it split on a setext
 * underline, which is a HEADING. Every finding after such a line was attributed
 * to the wrong slide.
 *
 * WHAT ELSE IS SHARED, so this is not a fourth spelling of the grammar:
 *
 *   · the `<!-- key: value -->` GRAMMAR is `lib/core/comment-directive.mjs` — the
 *     same parse the render pipeline binds its vocabulary to;
 *   · the SPOT-REPLACES-GLOBAL resolution is the engine's own rule
 *     (`lib/engine/slides.js`: `{ ...runningGlobal, ...slideLocal }`).
 *
 * WHAT IT STILL CANNOT SEE, stated rather than glossed: `split: headings`, which
 * injects extra boundaries the raw source does not carry. On a deck using it the
 * linter's slide NUMBERING diverges from the renderer's, and this changes nothing
 * about that — it is a property of `splitTopLevel`, which every lint finding's
 * `slide` field is counted from.
 *
 * THE WALK MOVED. The fence, comment-block and boundary tracking this module began as is now
 * `walkComments` in lib/core/meta-record.mjs, generalized from `class` to every directive key
 * (engineering/decisions/2026-10-17-meta-record.md §9, step 1). This module keeps its two exports
 * as views over it, so every caller and the corpus gate (test/unit/core/class-directive-scan.test.js)
 * are unchanged: it is the same walk asked one key. The long reasons for each rule in the walk
 * (the container prefixes, the `-->`-only close, the O(n) close test, the fence-close hoist) live
 * beside the code in meta-record.mjs.
 *
 * ESM so the editor can import it directly (Vite serves a source CJS module
 * untransformed in `astro dev` — the defect `authoring-core.generated.js` exists
 * to work around); the CJS linter `require()`s it, the way the emulator already
 * requires `lib/core/glossary-auto.mjs`.
 */

import { metaAt, scanMetaSource } from './meta-record.mjs';

/**
 * The class directive in force on every chunk of `source`, indexed EXACTLY as
 * `splitTopLevel(source)` indexes its chunks, front-matter chunks included, so a caller's existing
 * `idx - fmChunks + 1` slide numbering is untouched. "Exactly" is structural: both count from
 * `chunkBoundaryLines`.
 *
 * Each entry carries the resolved `payload`, the raw `text` of the winning directive (what a lint
 * finding quotes back to the author, and on a slide governed by a running global that is the
 * global's line, which is where the author has to go to change it), and its 1-based document `line`.
 *
 * @param {string} source
 * @returns {{payload: string, text: string, line: number}[]}
 */
export function slideClassDirectives(source) {
  return scanMetaSource(source).slides.map(({ resolved }) => {
    const e = resolved.get('class');
    return e ? { payload: e.value, text: e.text, line: e.line } : { payload: '', text: '', line: 0 };
  });
}

/**
 * The class directive governing the slide that line `lineNo` sits on, `null` when none does.
 *
 * BOUNDARIES COME FROM THE PREFIX, not from the whole document, and that is not an approximation:
 * the walk only ever reads lines 1..`lineNo`, and CommonMark decides a line's block role from the
 * lines at or before it plus the immediately following one. It also matches the editor's contract,
 * "the directive ABOVE the cursor", on a document being typed.
 *
 * @param {(n: number) => string} getLine  1-based line accessor
 * @param {number} lineNo  the cursor's line
 * @returns {{payload: string, text: string, line: number} | null}
 */
export function classDirectiveAt(getLine, lineNo) {
  const e = metaAt(getLine, lineNo, 'class');
  return e ? { payload: e.value, text: e.text, line: e.line } : null;
}

export default { slideClassDirectives, classDirectiveAt };
