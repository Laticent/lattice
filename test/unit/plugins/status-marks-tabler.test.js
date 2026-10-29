/**
 * The six status marks (`--mark-*`, lib/base/base.tokens.css) are generated from the pinned Tabler Icons by
 * tools/build-icons-data.js, from lib/plugins/_icons-source/marks.json (engineering/decisions/2026-10-18-checks.md
 * §20). `--check` holds the block to its generator; this holds the block to its CONTRACT: every token the stylesheets
 * read exists, each is one colorless, `#`-free SVG mask, and each draws a Tabler icon, not a hand-made path.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const tokens = fs.readFileSync(path.join(ROOT, 'lib/base/base.tokens.css'), 'utf8');
const block = /BEGIN GENERATED STATUS MARKS[\s\S]*?END GENERATED STATUS MARKS/.exec(tokens)?.[0] ?? '';
const marks = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/plugins/_icons-source/marks.json'), 'utf8'));
const tabler = (set) => JSON.parse(fs.readFileSync(path.join(ROOT, `node_modules/@tabler/icons/tabler-nodes-${set}.json`), 'utf8'));

test('the generated block defines every mark token the stylesheets read, and only once', () => {
  assert.ok(block, 'the GENERATED STATUS MARKS block is missing');
  const defined = [...block.matchAll(/^\s+(--mark-[a-z-]+):/gm)].map((m) => m[1]);
  assert.equal(new Set(defined).size, defined.length, 'a mark token is defined twice');
  const css = ['lib/base/base.modifiers.css', 'lib/plugins/checks/checks.styles.css', 'lib/plugins/chart-family/chart-family.styles.css',
    'lib/components/evidence/kpi/kpi.styles.css', 'lib/components/chart/roadmap/roadmap.styles.css']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  // Only the MASKS: `--mark-ink` and its kin share the prefix but are colors.
  const read = new Set([...css.matchAll(/var\((--mark-(?:check|dash|x|slash|question|dot)(?:-bold)?)\)/g)].map((m) => m[1]));
  assert.ok(read.size >= 8, 'the readers moved');
  for (const t of read) assert.ok(defined.includes(t), `${t} is read but not generated`);
  // Nothing outside the block defines one: the hand-drawn set is gone.
  const outside = tokens.replace(block, '');
  assert.deepEqual([...outside.matchAll(/^\s+(--mark-[a-z-]+):\s*url/gm)].map((m) => m[1]), []);
});

test('each mark is a colorless, #-free mask drawing its Tabler icon', () => {
  for (const e of marks) {
    const nodes = tabler(e.set || 'outline')[e.tabler];
    assert.ok(nodes, `${e.mark}: Tabler has no ${e.set || 'outline'} "${e.tabler}"`);
    for (const name of [e.boldOnly ? null : `--mark-${e.mark}`, `--mark-${e.mark}-bold`].filter(Boolean)) {
      const value = new RegExp(`^\\s+${name}: (url\\("[^"]*"\\));`, 'm').exec(block)?.[1];
      assert.ok(value, `${name} is not generated`);
      assert.doesNotMatch(value, /#/, `${name} carries a #`);
      assert.doesNotMatch(value, /(fill|stroke)='(?!black|none)/, `${name} carries a color`);
      for (const [, attrs] of nodes) assert.ok(value.includes(`d='${attrs.d}'`), `${name} does not draw Tabler's ${e.tabler}`);
    }
  }
});
