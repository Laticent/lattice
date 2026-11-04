/**
 * Unit: the settings block — one home for each deck-wide key in an exported Marp bundle
 * (lib/core/deck-front-matter.js; engineering/decisions/2026-11-03-marp-bundle-live-front-matter.md).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { readFrontMatterBlock } = require('../../../lib/core/deck-front-matter');
const { keyGroups, mergeFrontMatter, settingsBlock, readSettingsBlock } = require('../../../lib/core/settings-block');
const { foldSettingsBlock } = require('../../../lib/core/settings-block-fold');
const { MARP_FRONT_MATTER_KEYS, splitFrontMatter, withBundleFrontMatter } = require('../../../lib/export/bundle-front-matter');

const FM = [
  'marp: true', 'theme: indaco', '# the deck look', 'color-mode: dark', 'class: no-progress',
  'meta: |', '  Q3 board', '', '  second paragraph', 'header: "H"', 'logo: assets/x.png',
].join('\n');

test('keyGroups is lossless and keeps a block scalar (blank line included) with its key', () => {
  const { groups } = keyGroups(FM);
  assert.equal(groups.map((g) => g.text).join('\n'), FM);
  assert.deepEqual(groups.map((g) => g.key), ['marp', 'theme', 'color-mode', 'class', 'meta', 'header', 'logo']);
  assert.equal(groups.find((g) => g.key === 'meta').text, 'meta: |\n  Q3 board\n\n  second paragraph');
  assert.match(groups.find((g) => g.key === 'color-mode').text, /^# the deck look\n/, 'a comment rides with the key after it');
});

test('splitFrontMatter keeps Marp\'s keys on top and moves every Lattice key — class included — to the block', () => {
  const { top, settings } = splitFrontMatter(FM);
  assert.equal(top, 'marp: true\ntheme: indaco\nheader: "H"');
  assert.match(settings, /^class: no-progress$/m);
  assert.match(settings, /^color-mode: dark$/m);
  assert.match(settings, /^logo: assets\/x\.png$/m);
});

test('a key that could end its <script> early stays on top', () => {
  for (const bad of ['meta: "a </script> b"', 'meta: "a <!-- b"', 'meta: "<script>"', 'meta: "</pre>"']) {
    const { top, settings } = splitFrontMatter(`theme: indaco\n${bad}`);
    assert.match(top, /^meta:/m, bad);
    assert.equal(settings, '', bad);
  }
  assert.match(splitFrontMatter('meta: "a < b"').settings, /a < b/, 'a lone "<" is harmless and moves');
});

test('mergeFrontMatter: the block wins a shared key, class is the union, either side may be unknown', () => {
  assert.equal(mergeFrontMatter('theme: a\nclass: [dark, no-header]', 'class: no-progress\ntheme: b'),
    'class: dark no-header no-progress\ntheme: b');
  assert.equal(mergeFrontMatter('class:\n  - lead-in\n  - no-footer', 'class: x'), 'class: lead-in no-footer x');
  assert.equal(mergeFrontMatter('marp: true', null), 'marp: true');
  assert.equal(mergeFrontMatter(null, 'class: a'), 'class: a');
  assert.equal(mergeFrontMatter(null, null), null);
});

test('foldSettingsBlock gives back one front matter and keeps every later line on its number', () => {
  const src = withBundleFrontMatter(`---\n${FM}\n---\n\n# Title\n\nBody\n`);
  const folded = foldSettingsBlock(src);
  const fm = readFrontMatterBlock(folded);
  for (const k of ['marp: true', 'theme: indaco', 'class: no-progress', 'color-mode: dark', 'logo: assets/x.png']) assert.ok(fm.includes(k), k);
  assert.equal(folded.split('\n').indexOf('Body'), src.split('\n').indexOf('Body'));
  // EVERY line keeps its number, keys included — a lint fix edits by line, so a key must be where the
  // author sees it (an earlier draft compacted the front matter and moved them).
  assert.equal(folded.split('\n').length, src.split('\n').length);
  for (const k of ['color-mode: dark', 'logo: assets/x.png']) assert.equal(folded.split('\n').indexOf(k), src.split('\n').indexOf(k), k);
  // A key the top shares with the block: the block wins, `class` is the union, and the top's line is
  // commented out in place.
  const both = src.replace('theme: indaco\n', 'theme: indaco\nclass: lead\ncolor-mode: light\n');
  const f2 = readFrontMatterBlock(foldSettingsBlock(both));
  assert.match(f2, /^class: lead no-progress$/m);
  assert.match(f2, /^#color-mode: light$/m);
  assert.match(f2, /^color-mode: dark$/m);
  assert.equal(foldSettingsBlock('# no front matter\n'), '# no front matter\n');
  assert.equal(foldSettingsBlock('---\ntheme: a\n---\n# A\n'), '---\ntheme: a\n---\n# A\n', 'no block, no change');
  // A deck that SHOWS a bundle in a fenced example: the example's fences and block are slide content.
  // A first draft's lazy regex walked past the real closing fence to the example's, and the whole
  // deck up to it read as front matter (it rendered as ONE slide).
  const shows = '---\ntheme: a\nclass: no-progress\n---\n\n# One\n\n---\n\n## Two\n\n```markdown\n---\nmarp: true\n---\n'
    + `${settingsBlock('class: x')}\`\`\`\n`;
  assert.equal(foldSettingsBlock(shows), shows);
  // Only the block directly under the front matter is the deck's; one an author wrote on a slide is theirs.
  const later = `---\ntheme: a\n---\n# A\n\n${settingsBlock('class: x')}`;
  assert.equal(foldSettingsBlock(later), later);
});

test('withBundleFrontMatter writes the block, adds marp: true, and drops a local logo the bundle lacks', () => {
  const out = withBundleFrontMatter('---\ntheme: indaco\nlogo: brand/m.svg\nclass: dark\n---\n# A\n', { localAssets: false });
  assert.equal(out, '---\nmarp: true\ntheme: indaco\n---\n<script type="application/lattice-settings">\nclass: dark\n</script>\n# A\n');
  assert.equal(withBundleFrontMatter('# A\n'), '---\nmarp: true\n---\n# A\n', 'no front matter → one that says marp: true');
  assert.match(withBundleFrontMatter('---\nmarp: false\n---\n'), /^---\nmarp: false\n---/, 'an explicit marp: is the author\'s');
});

test('readSettingsBlock reads raw YAML or the engine\'s JSON form, takes the FIRST block, and removes all', () => {
  const doc = new JSDOM(`<section>${settingsBlock('class: a\nmeta: x')}</section>`
    + '<section><script type="application/lattice-settings">"class: b \\u003c c"</script></section>').window.document;
  assert.equal(readSettingsBlock(doc), 'class: a\nmeta: x');
  assert.equal(doc.querySelectorAll('script').length, 0);
  const json = new JSDOM('<script type="application/lattice-settings">"class: b \\u003c c"</script>').window.document;
  assert.equal(readSettingsBlock(json), 'class: b < c');
  assert.equal(readSettingsBlock(new JSDOM('<p>x</p>').window.document), null);
});

test('every Marp-native key in the directive registry stays on top (pinned against meta.manifest.json)', async () => {
  const { META_FIELDS } = await import('../../../lib/plugins/meta.generated.mjs');
  // The registry's keys that are LATTICE's, not Marp's, plus `class`, which moves on purpose.
  const lattice = new Set(['logo', 'focus', 'focusStyle', 'focusSteps', 'build', 'debug', 'lens', 'track', 'class']);
  for (const key of Object.keys(META_FIELDS)) {
    if (lattice.has(key)) continue;
    assert.ok(MARP_FRONT_MATTER_KEYS.has(key), `${key} is a Marp directive in meta.manifest.json but would move into the settings block`);
  }
  assert.ok(!MARP_FRONT_MATTER_KEYS.has('class'));
});

test('lint reads a bundle deck\'s settings block as front matter, and reports a key at its own line', () => {
  const { lintText } = require('../../../lib/authoring/lint');
  const { applyFix } = require('../../../lib/authoring/lint-core');
  const src = withBundleFrontMatter('---\ntheme: indaco\nfinish: atriumm\n---\n\n# A\n');
  const f = lintText(src).find((x) => x.rule === 'unknown-finish');
  assert.ok(f, 'the bad finish inside the block is found');
  // …and its fix edits THAT line, in the block, in the source the author has: the fix locates by
  // line on the folded text, whose lines are the source's.
  assert.equal(applyFix(src, f), src.replace('finish: atriumm', 'finish: atrium'));
});

// CodeQL js/polynomial-redos on PR #3023: `/[ \t\r]+$/` per line made the fold quadratic on a long run
// of tabs (measured 2.2 s on 40 000). The fold, the block writer and the reader all trim with the
// built-ins now; a hostile deck must stay linear.
test('a long run of tabs or spaces cannot make the fold, the writer or the reader slow', () => {
  const tabs = `${'\t'.repeat(60000)}x`;
  const spaces = `${' '.repeat(60000)}x`;
  const t0 = Date.now();
  foldSettingsBlock(`---\na: 1\n---\n<script type="application/lattice-settings">\n${tabs}\n</script>\n`);
  foldSettingsBlock(`---\na: 1\n---\n${' \t\r\n'.repeat(30000)}`);
  settingsBlock(spaces);
  withBundleFrontMatter(`---\nmeta: ${spaces}\n---\n`);
  readSettingsBlock(new JSDOM(`<script type="application/lattice-settings">${spaces}</script>`).window.document);
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
});

test('the fold reads the same open tag the writer writes (it keeps its own copy to stay out of the merge module)', () => {
  const { foldSettingsBlock: fold } = require('../../../lib/core/settings-block-fold');
  const deck = `---\ntheme: indaco\n---\n${settingsBlock('class: no-progress')}\n# A\n`;
  assert.match(fold(deck), /^class: no-progress$/m);
  assert.doesNotMatch(fold(deck), /lattice-settings/);
});
