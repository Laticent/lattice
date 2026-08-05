/**
 * lib/core/boundary-parser.mjs
 *
 * ONE markdown-it instance, configured exactly like the engine's, for every
 * module that has to answer "where does a slide begin?" from raw source.
 *
 * Three modules ask that question outside the render (`bake-splits.js`,
 * `section-source-split.js`, `slide-class-spans.js`), and each used to build its
 * own `new MarkdownIt('commonmark', { html: true })` beside a comment promising
 * it "mirrors the lib/engine parser". It did not, and the promise is the kind
 * that cannot be kept by comment: the engine's parser is assembled in
 * lib/engine/index.js `buildMd`, and every option there that changes the BLOCK
 * token stream changes where a slide starts.
 *
 * WHAT MOVES A BOUNDARY, and so what this has to match:
 *
 *   - `commonmark` + `html: true` — the preset the engine builds on, and the
 *     option that keeps `<!-- … -->` directives as `html_block` tokens with line
 *     maps (`headingSplitPoints` pulls a boundary back over them).
 *   - `enable(['table', 'strikethrough'])` — `table` is a BLOCK rule. Without
 *     it a table's rows are one paragraph, and a paragraph is what a setext
 *     underline attaches to.
 *   - `math_block` — the rule that makes a `$$…$$` body opaque. Its absence is
 *     the defect this module was created to close: a display equation
 *     containing a lone `=` line parsed as a setext H1, which in a
 *     `split: headings` deck is a slide boundary the engine does not have. See
 *     lib/core/math-block-rule.js for the reproduction.
 *
 * `breaks: true` is set for fidelity even though it is an INLINE option: the
 * point of this module is that the configuration is copied from one place, not
 * curated by judgment about which options "could" matter.
 *
 * WHAT IS DELIBERATELY LEFT OUT. The engine's core rulers — `installSlidePipeline`
 * and the 15 `LATTICE_PLUGINS` — run AFTER block parsing and rewrite tokens.
 * Two of them move slide boundaries, and each is handled explicitly rather than
 * by installing the plugin:
 *
 *   - `headingSplit` injects `hr` tokens; callers get the same boundaries from
 *     the shared `headingSplitPoints` it is itself built on.
 *   - `focusSteps` EXPANDS one slide into several. Nothing source-side models
 *     that, and it does not need to: expansion copies a slide, so every copy
 *     carries the class of the source-side slide the offset already resolves to.
 *     (`test/unit/core/slide-class-span-parity.test.js` documents the count
 *     divergence a focus deck therefore shows.)
 *
 * One core ruler is left out that COULD matter later, so it is named rather than
 * silently omitted: `lattice_clean_inline` (lib/engine/slides.js) strips empty
 * `text` children from inline tokens, and `headingSplitPoints` inspects inline
 * children to recognize an eyebrow paragraph (`isEyebrowInline`, which requires
 * exactly one child). The commonmark preset does leave `text('')` tokens around
 * EMPHASIS, so the two would disagree the moment the eyebrow definition widened
 * past `code_inline` — it is safe today only because a lone inline-code span is
 * the one shape that comes back clean without the ruler.
 *
 * `test/unit/core/boundary-parser.test.js` turns the promise above into a gate:
 * it diffs the ENABLED BLOCK RULES against an engine-configured parser, which is
 * the class of difference that can move a boundary.
 *
 * Pure (markdown-it only, no fs, no katex), so it bundles into the browser
 * playground alongside its callers.
 */

import MarkdownIt from 'markdown-it';
import { installMathBlockRule } from './math-block-rule.mjs';

/**
 * Build a parser whose BLOCK token stream matches the engine's. Exported for a
 * caller that wants its own instance; everything in-tree shares the singleton
 * below, because a markdown-it instance carries no cross-parse state.
 */
export function createBoundaryParser() {
  const md = new MarkdownIt('commonmark', { html: true, breaks: true });
  md.enable(['table', 'strikethrough']);
  installMathBlockRule(md);
  return md;
}

/** The shared instance. Parsing is stateless, so one is enough for the process. */
export const boundaryParser = createBoundaryParser();

/**
 * The front-matter block, as every boundary caller strips it.
 *
 * Two things it does that `parseFrontMatter` (lib/engine/directives.js) does not
 * need to, because the engine normalizes at its door and this runs on raw bytes:
 *
 *   - A LONE `\r` counts as a line terminator. Old-Mac line endings are rare but
 *     real, and `\r?\n` does not match one — so the whole front matter read as
 *     BODY, which is a slide of raw YAML the engine never renders.
 *   - The TRAILING terminator is optional, matching `parseFrontMatter`'s `\r?\n?`.
 *     Requiring it made a front-matter-only file (no body at all) report a slide.
 */
export const FRONT_MATTER = /^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---(?:\r\n|\r|\n)?/;

/**
 * The engine's door normalization, in `lib/core` so the boundary path can apply
 * the same one.
 *
 * `lib/engine/index.js` strips a leading BOM and folds `\r\n` / lone `\r` to `\n`
 * before it parses anything (#1357: a lone CR changed 118 of 119 committed decks,
 * and a BOM defeats the `^---` anchor so front matter reads as body). The boundary
 * modules reconciled their markdown-it OPTIONS with the engine's and left the
 * INPUT unreconciled, which is the same divergence one level up: markdown-it folds
 * `\r` internally, so its `token.map` counts normalized lines while a caller's own
 * `split('\n')` does not, and the two desync.
 *
 * Spelled identically to the engine's line rather than imported from it, because
 * the dependency runs `lib/engine` → `lib/core`. `test/unit/core/boundary-parser.test.js`
 * pins the two spellings together.
 */
export function normalizeSource(text) {
  return typeof text === 'string' ? text.replace(/^﻿/, '').replace(/\r\n?/g, '\n') : '';
}
