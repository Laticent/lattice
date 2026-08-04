/**
 * Unit: the shared boundary parser really is configured like the engine.
 *
 * `lib/core/boundary-parser.js` exists because three modules used to build their
 * own markdown-it beside a comment promising it "mirrors the lib/engine parser".
 * None of the three did. Consolidating them to one instance removes the drift
 * BETWEEN them, but it does not, on its own, keep that one instance in step with
 * the engine — it re-declares the engine's options rather than reading them, and
 * it has to: `lib/core` does not depend on `lib/engine` (the direction runs the
 * other way, e.g. `lib/engine/css.js` → `lib/core/leading-is`).
 *
 * So the promise is still a hand-copy. This file makes it a gate instead of a
 * comment — which is the standard the change that added the parser set for
 * itself.
 *
 * WHAT IS COMPARED, and why it is the block ruler. A slide boundary is decided by
 * BLOCK tokens: `hr` for a thematic break, `heading_open` for a `split: headings`
 * point, and the rules that make a run of lines OPAQUE (`fence`, `math_block`) so
 * the text inside them is never read as either. Every one of those is a block
 * rule, so an enabled-block-rule difference is exactly the class of divergence
 * that moves a boundary. Inline rules cannot: inline parsing runs inside a block
 * token that has already been placed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { installMath } = require('../../../lib/engine/math');
const { installSlidePipeline } = require('../../../lib/engine/slides');
const { createBoundaryParser, boundaryParser } = require('../../../lib/core/boundary-parser');

/**
 * The engine's parser, assembled the way `buildMd` (lib/engine/index.js) does.
 *
 * Deliberately re-stated here rather than obtained from `createEngine()`: the
 * engine keeps its markdown-it private behind a memo, and a test that reached in
 * to fish it out would break on any refactor of the memo. What this needs is the
 * OPTIONS, and those are what a reviewer diffs when `buildMd` changes.
 *
 * The pieces omitted are the ones that do not install a block rule: the
 * `highlight` callback (renderer), `registerMermaidHljs` (renderer), and the 15
 * `LATTICE_PLUGINS` (core rulers, which run after block parsing).
 */
function engineLikeParser() {
  const md = new MarkdownIt('commonmark', { html: true, breaks: true });
  md.enable(['table', 'strikethrough']);
  installSlidePipeline(md, {}, {});
  installMath(md, {});
  return md;
}

const enabledBlockRules = (md) =>
  md.block.ruler.__rules__.filter((r) => r.enabled).map((r) => r.name).sort();

describe('boundary-parser ≡ the engine, where boundaries are decided', () => {
  test('the same block rules are enabled, by name', () => {
    assert.deepEqual(enabledBlockRules(createBoundaryParser()), enabledBlockRules(engineLikeParser()),
      'a block rule the engine has and this does not (or vice versa) is a boundary the two '
      + 'disagree about — which is how a `$$…$$` equation came to invent a slide');
  });

  test('`math_block` is enabled — the rule whose absence was the defect', () => {
    // Named on its own because it is the one that has already gone wrong, and
    // because the comparison above would also pass if BOTH parsers lost it.
    assert.ok(enabledBlockRules(createBoundaryParser()).includes('math_block'));
  });

  test('`table` is enabled — a block rule, so it can move a boundary', () => {
    // The easy one to leave out, because "tables are not about slide splits".
    // They are: `table` decides whether a run of lines is one table or a
    // paragraph, and a paragraph is what a setext underline attaches to.
    assert.ok(enabledBlockRules(createBoundaryParser()).includes('table'));
  });

  test('the shared instance carries no state across parses', () => {
    // Three modules share ONE instance. That is only safe if a parse leaves
    // nothing behind — otherwise the answer for a deck would depend on which
    // deck was parsed before it, which is not a bug anyone would find quickly.
    const docs = [
      '# A\n\ntext\n',
      '```\n---\n```\n\n## B\n',
      '$$\nA\n=\nB\n$$\n\n---\n\n## C\n',
    ];
    const shape = (md, src) => JSON.stringify(md.parse(src, {}).map((t) => [t.type, t.map]));
    const sequential = docs.map((d) => shape(boundaryParser, d));
    const isolated = docs.map((d) => shape(createBoundaryParser(), d));
    assert.deepEqual(sequential, isolated);
    assert.equal(shape(boundaryParser, docs[0]), sequential[0], 're-parsing must be stable');
  });
});
