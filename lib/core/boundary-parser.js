/**
 * lib/core/boundary-parser.js
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
 * Pure (markdown-it only, no fs, no katex), so it bundles into the browser
 * playground alongside its callers.
 */

const MarkdownIt = require('markdown-it');
const { installMathBlockRule } = require('./math-block-rule');

/**
 * Build a parser whose BLOCK token stream matches the engine's. Exported for a
 * caller that wants its own instance; everything in-tree shares the singleton
 * below, because a markdown-it instance carries no cross-parse state.
 */
function createBoundaryParser() {
  const md = new MarkdownIt('commonmark', { html: true, breaks: true });
  md.enable(['table', 'strikethrough']);
  installMathBlockRule(md);
  return md;
}

/** The shared instance. Parsing is stateless, so one is enough for the process. */
const boundaryParser = createBoundaryParser();

/** The front-matter block, as every boundary caller strips it. */
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

module.exports = { createBoundaryParser, boundaryParser, FRONT_MATTER };
