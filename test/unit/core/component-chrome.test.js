/**
 * lib/core/component-chrome.js: a component's chrome defaults (manifest `chrome`) land as the band's own
 * `no-X` switch, and the author's `with-X` keeps the last word
 * (engineering/decisions/2026-11-08-anchor-chrome.md).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyComponentChrome } = require('../../../lib/core/component-chrome.js');
const { settleSwitches } = require('../../../lib/core/switches.js');
const { NO_HEADER, NO_PAGINATION } = require('../../../lib/packages/chrome.generated.js');
const { slidePaginates } = require('../../../lib/core/pagination.js');
const { createEngine } = require('../../../lib/engine');

test('the title drops the running header; no anchor drops the footer', () => {
  assert.deepEqual([...NO_HEADER], ['title']);
  assert.deepEqual(applyComponentChrome(['title']), ['title', 'no-header']);
  for (const c of ['title', 'divider', 'topic', 'closing']) {
    assert.ok(!applyComponentChrome([c]).includes('no-footer'), `${c} keeps the footer`);
  }
});

test('every anchor drops the page number', () => {
  for (const c of ['title', 'divider', 'topic', 'closing']) {
    assert.ok(NO_PAGINATION.includes(c), c);
    assert.equal(slidePaginates([c], true), false, c);
  }
  assert.equal(slidePaginates(['topic', 'with-pagination'], true), true);
});

test('with-header on the slide wins, and a content slide is untouched', () => {
  const cur = ['title', 'with-header'];
  assert.equal(applyComponentChrome(cur), cur);
  assert.ok(!settleSwitches(applyComponentChrome(cur)).includes('no-header'));
  const content = ['content', 'form'];
  assert.equal(applyComponentChrome(content), content);
});

test('the engine renders the header on a divider and hides it on a title, with the footer on both', () => {
  const md = '---\nheader: Deck\nfooter: Confidential\n---\n\n<!-- _class: title -->\n\n# T\n\n---\n\n<!-- _class: divider numbered -->\n\n## D\n';
  const html = createEngine().render(md, 'lattice').html;
  const sections = html.split(/<section\b/).slice(1);
  assert.match(sections[0], /^[^>]*class="[^"]*\bno-header\b/);
  assert.doesNotMatch(sections[1], /^[^>]*class="[^"]*\bno-header\b/);
  for (const s of sections) assert.match(s, /<footer>Confidential<\/footer>/);
});

test('Export to Marp writes `_header: \'\'` where the component drops the header, and nowhere else', () => {
  const { withMarpScope } = require('../../../lib/core/marp-bundle-scope.js');
  const deck = '---\nheader: Deck\n---\n\n<!-- _class: title -->\n\n# T\n\n---\n\n<!-- _class: title with-header -->\n\n# T2\n\n---\n\n## C\n';
  const out = withMarpScope(deck);
  assert.equal((out.match(/<!-- _header: '' -->/g) || []).length, 1);
  assert.ok(out.indexOf("<!-- _header: '' -->") < out.indexOf('# T\n'));
  // A deck with no header has nothing to drop.
  assert.doesNotMatch(withMarpScope('---\nfooter: x\n---\n\n<!-- _class: title -->\n\n# T\n'), /_header/);
});
