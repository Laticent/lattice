/**
 * The exported player's reader view (the prose article) and a tinted deck logo.
 *
 * `logo-finish: <color>` injects `<svg class="deck-logo-tint">` beside the mark. The reader projection
 * lifted it as an empty figure, and — because the logo's own words ride every section ahead of the
 * default component — read `logo-top-left` / `no-logo` as the slide's LAYOUT ("This slide's `logo-top-left`
 * is a visual layout"). Found by the independent checker on the branch that introduced `logo-finish:`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

test('the reader article carries no tint svg and names no logo word as a slide layout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-finish-reader-'));
  const md = path.join(dir, 'deck.md');
  const out = path.join(dir, 'deck.html');
  fs.writeFileSync(md, [
    '---', 'marp: true', 'theme: indaco', 'logo: lattice', 'logo-finish: top-left accent', '---', '',
    '<!-- _class: title -->', '', '# Cover', '', '---', '', '## A plain slide', '',
    'Some words.', '', '---', '', '<!-- _class: no-logo -->', '', '## No mark here', '', 'More words.', '',
  ].join('\n'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, out, '--player'], { encoding: 'utf8', timeout: 300000 });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(out, 'utf8');
  const article = html.slice(html.indexOf('id="lp-article"'));
  assert.doesNotMatch(article.slice(0, article.indexOf('</article>')), /deck-logo-tint/, 'the tint svg is chrome, not content');
  assert.doesNotMatch(article, /is a visual layout[^<]*`?(?:logo-|no-logo)/, 'a logo word is not the slide\'s layout');
  assert.doesNotMatch(article, /<code>(?:logo-(?:top|bottom|accent|ink|sm|md|lg|all|title)[a-z-]*|no-logo)<\/code> is a visual layout/);
});
