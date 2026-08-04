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
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');
const { installMath } = require('../../../lib/engine/math');
const { installSlidePipeline } = require('../../../lib/engine/slides');
const { createBoundaryParser, boundaryParser, normalizeSource } = require('../../../lib/core/boundary-parser');

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
  md.block.ruler.__rules__.filter((r) => r.enabled).map((r) => r.name);

describe('boundary-parser ≡ the engine, where boundaries are decided', () => {
  test('the same block rules are enabled, in the same ORDER', () => {
    assert.deepEqual(enabledBlockRules(createBoundaryParser()), enabledBlockRules(engineLikeParser()),
      'a block rule the engine has and this does not (or vice versa) is a boundary the two '
      + 'disagree about — which is how a `$$…$$` equation came to invent a slide');
  });

  test('the same markdown-it OPTIONS, which the rule names cannot show', () => {
    // The rule-name comparison alone is not enough, and the hole is the big one:
    // flipping `html: true` to `false` deletes every `html_block` token — i.e.
    // every directive this parser exists to read — while leaving the enabled rule
    // NAMES identical. Options are half the configuration being hand-copied.
    const mine = { ...createBoundaryParser().options };
    const theirs = { ...engineLikeParser().options };
    // `highlight` is a renderer callback the engine supplies and this does not.
    // It cannot move a block boundary, and comparing function identity would
    // fail for a reason that means nothing.
    delete mine.highlight;
    delete theirs.highlight;
    assert.deepEqual(mine, theirs);
  });

  test('the door normalization is spelled the same as the engine door', () => {
    // `normalizeSource` is a hand-copy of lib/engine/index.js's own line. The
    // boundary path reconciled its parser OPTIONS with the engine's and left the
    // INPUT unreconciled, which is the same divergence one level up: a lone `\r`
    // desyncs markdown-it's folded `token.map` from a caller's raw line offsets,
    // and a BOM defeats the `^---` anchor so front matter reads as body.
    const engineDoor = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'engine', 'index.js'), 'utf8');
    assert.match(engineDoor, /\.replace\(\/\^\uFEFF\/, ''\)\.replace\(\/\\r\\n\?\/g, '\\n'\)/,
      "the engine's door normalization moved — lib/core/boundary-parser.js copies it");
    assert.equal(normalizeSource('\uFEFFa\r\nb\rc\nd'), 'a\nb\nc\nd');
    assert.equal(normalizeSource(undefined), '');
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
