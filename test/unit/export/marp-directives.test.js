/**
 * The export to Marp's bridge (engineering/decisions/2026-10-17-meta-record.md §7, step 4):
 *   · `withMarpDirectivesOnly` removes a comment of Lattice-only directives, which Marp would show as a speaker note;
 *   · `recordsToComments` reports a record field it leaves out rather than truncate;
 *   · both producers run the one pass list (`MARP_PASSES`) in order.
 * The Marp behavior itself (which comments become notes) was measured with `@marp-team/marp-core` and marp-cli; the
 * PR body carries that run. These pins hold what this repo controls.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { MARP_DIRECTIVE_KEYS, MARP_PASSES, withMarpDirectivesOnly } = require('../../../lib/export/marp-directives.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('a comment of Lattice-only keys goes, its lines left blank; one with a Marp key, a note and code stay', () => {
  const deck = [
    '---', 'marp: true', '---', '',
    '<!-- _class: kpi -->', '<!-- _focusSteps: 3 -->', '', '<!-- _build -->', '', '# A', '',
    '<!-- _track: x', '_class: lead -->', '', '```', '<!-- _build -->', '```', '', '<!-- a note -->', '',
  ].join('\n');
  const { markdown, dropped } = withMarpDirectivesOnly(deck);
  assert.deepEqual(dropped, ['focusSteps', 'build']);
  assert.equal(markdown.split('\n').length, deck.split('\n').length, 'no line moves');
  assert.doesNotMatch(markdown, /^<!-- _focusSteps/m);
  assert.doesNotMatch(markdown.split('```')[0], /_build/);
  for (const kept of ['<!-- _class: kpi -->', '<!-- _track: x\n_class: lead -->', '```\n<!-- _build -->\n```', '<!-- a note -->']) assert.ok(markdown.includes(kept), kept);
});

test('a nested directive and a `hide:` note are left as written (the checker and the red team, 2026-11-11)', () => {
  const quote = '> a\n> <!-- _build -->\n> b\n';
  assert.equal(withMarpDirectivesOnly(quote).markdown, quote);
  const list = '- a\n- <!-- _build -->\n- c\n';
  assert.equal(withMarpDirectivesOnly(list).markdown, list);
  const note = '# A\n\n<!-- hide: when presenting to the board, skip -->\n';
  assert.equal(withMarpDirectivesOnly(note).markdown, note);
  assert.deepEqual(withMarpDirectivesOnly('# A\n\n<!-- _hide: true -->\n').dropped, ['hide']);
});

test('a deck with nothing to remove comes back byte for byte, and the front matter is never read', () => {
  const deck = '---\nmarp: true\nfocus: x\n---\n\n<!-- _class: kpi -->\n\n# A\n';
  assert.equal(withMarpDirectivesOnly(deck).markdown, deck);
  assert.ok(MARP_DIRECTIVE_KEYS.has('class') && !MARP_DIRECTIVE_KEYS.has('focusSteps'));
});

test('a record field holding `-->` is left out and reported with its line, never written truncated (§7 meta-comment-unsafe)', async () => {
  const { recordsToComments } = await import('../../../lib/core/meta-door.mjs');
  const report = [];
  // Written with the authored escape (`--\>`, record note §10): a raw `-->` would end the comment itself.
  const out = recordsToComments('# A\n\n<!-- {layout=kpi, footer="a --\\> b"} -->\n', report);
  assert.equal(out, '# A\n\n<!-- _class: kpi -->\n');
  assert.deepEqual(report.map((d) => [d.code, d.line]), [['meta-comment-unsafe', 3]]);
  // A note may hold one: the bridge writes it `-- >`, which ends nothing.
  assert.equal(recordsToComments('<!-- {note="a --\\> b"} -->\n'), '<!-- a -- > b -->\n');
});

test('both Marp producers run the one pass list, in order (record note §7: one compile, first, in both producers)', () => {
  for (const rel of ['tools/export-marp.js', 'docs/src/components/studio/export/deck-export.js']) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // The CALL sites (`name(`, `marp.name(`, the Studio's `nameOrSame(`), outside comments. Each producer writes one
    // pass per statement, so source order is run order; the last two nest (`withRuntimeScriptsReport(withSlideOnlySpotted(`).
    // A nested pass would read backward here, which is why the producers do not nest.
    const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const calls = MARP_PASSES.slice(0, -1).map((name) => {
      const m = [...body.matchAll(new RegExp(`(?<!\\w)${name}(?:OrSame)?\\(`, 'g'))];
      assert.ok(m.length, `${rel} never calls ${name}`);
      // The LAST call is the pass: an earlier one is a pre-check on a copy (`everySlideHidden(appendAutoGlossary(src))`).
      return m[m.length - 1].index;
    });
    for (let i = 1; i < calls.length; i++) assert.ok(calls[i] > calls[i - 1], `${rel}: ${MARP_PASSES[i]} must run after ${MARP_PASSES[i - 1]}`);
    assert.match(body, /withRuntimeScriptsReport\(\s*withSlideOnlySpotted\(/, `${rel}: withRuntimeScriptsReport takes what withSlideOnlySpotted wrote`);
  }
});
