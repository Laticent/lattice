/**
 * Integration: the split slots agree on both render paths in a REAL browser.
 *
 * test/unit/transformers/split-panels-chrome.test.js pins each raw-HTML parser shape against
 * jsdom, the parser the unit tier has. The DOM path (lib/transformers/split-panels.js) runs in
 * a browser, though, and parsers disagree at the edges: on `<p>C.<table>X<tr>…`, jsdom puts the
 * fostered text after the table and Chromium before it. So the same shapes run here through
 * Chromium: the DOM path applied to Chromium's parse of the slide, against the engine kernel's
 * output (lib/core/split-panels.js) parsed by Chromium. Both must give the same section.
 *
 * FALSIFIABLE: with #2538's walk reverted (lib/core/top-level-h2.mjs, lib/core/split-panels.js
 * and the DOM path from main), 17 of these 23 shapes disagree. The two markdown controls agree
 * either way. Needs Chromium.
 * followups.d/2478-p5-split-slot-parser-model-gaps.md (closed by #2538).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const kernel = require('../../../lib/core/split-panels');

const SIG = `function signature(node) {
  if (node.nodeType === 3) { const t = node.textContent.trim(); return t ? '#' + t : ''; }
  if (node.nodeType !== 1) return '';
  const cls = node.className ? '.' + [...node.classList].sort().join('.') : '';
  return node.tagName + cls + '(' + [...node.childNodes].map(signature).filter(Boolean).join(',') + ')';
}`;

const OPTS = '<ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>';
const CASES = [];
for (const cls of ['split-panel', 'split-compare']) {
  CASES.push([cls, `<h2>H</h2></p><p>C.</p>${OPTS}`]);                                  // a stray </p>
  CASES.push([cls, `<h2>H</h2><table><p>C.</p><tr><td>t</td></tr></table>${OPTS}`]);    // fostered paragraph
  CASES.push([cls, `<h2>H</h2><p>C.</p>stray${OPTS}`]);                                 // top-level text
}
CASES.push(['split-panel', '<h2>H</h2><table><p>C.<tr><td>t</td></tr></table><ul><li>one</li></ul>']);
CASES.push(['split-panel', '<h2>H</h2><p>C.<table>X<tr><td>t</td></tr></table><ul><li>one</li></ul>']);
CASES.push(['split-panel', '<h2>H</h2><a><ul><li>x</li></a></ul><p>C.</p>']);            // the adoption agency
CASES.push(['split-compare', `<h2>H</h2><a><div>x</a></div><p>C.</p>${OPTS}`]);
CASES.push(['split-panel', '<h2>H</h2><h3>sig</h3><p>C.</p><ul><li>one</li></ul>']);    // the lede's h3 boundary
CASES.push(['split-panel', '<h2>H</h2><blockquote><h3>nested</h3></blockquote><p>C.</p><ul><li>one</li></ul>']);
CASES.push(['split-compare', `<h2>H</h2><h6>eyebrow</h6><p>C.</p>${OPTS}`]);
for (const list of ['<ul><li><strong>A</strong><li><strong>B</strong></ul>', '<ul><li><strong>A</strong><li><strong>B</strong>']) {
  CASES.push(['split-compare', `<h2>H</h2><p>C.</p>${list}`]);                           // an omitted </li>, </ul>
  CASES.push(['split-panel', `<h2>H</h2><p>C.</p>${list}`]);
}
CASES.push(['split-compare', '<h2>H</h2><p>C.</p><em><ul><table><tr><td>Keep me</td></tr></em></table></ul>Tail']);
CASES.push(['split-panel', '<b><table></b><h2>X</h2><p>Lede</p></table><ul><li>one</li></ul>']);
CASES.push(['split-panel', '<h2>H</h2><table><p>C.</table><ul><li>one</li></ul><p>after</p>']);
CASES.push(['split-panel', '<h2>H</h2><p>C.</p><ul><li>A</li>stray<li>B</li></ul>']);
// Markdown-shaped controls: what every committed deck carries.
CASES.push(['split-panel', '<p><code>Eyebrow</code></p>\n<h2>Headline</h2>\n<p>Lede.</p>\n<ul>\n<li><strong>Point</strong>\n<ul>\n<li>body</li>\n</ul>\n</li>\n</ul>\n']);
CASES.push(['split-compare', '<p><code>Frame</code></p>\n<h2>Choice</h2>\n<p>Context.</p>\n<ul>\n<li><strong>A</strong></li>\n<li><strong>B</strong></li>\n</ul>\n<blockquote>\n<p>Pick B.</p>\n</blockquote>\n']);

let browser, page, bundle;
before(async () => {
  const esbuild = require('esbuild');
  bundle = esbuild.buildSync({
    stdin: { contents: "window.applySplitDom = (root) => require('./lib/transformers/split-panels').applyToDom(root);", resolveDir: path.join(__dirname, '..', '..', '..') },
    bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'error',
  }).outputFiles[0].text;
  const puppeteer = require('puppeteer');
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  page = await browser.newPage();
});
after(async () => { if (browser) await browser.close(); });

test('in Chromium, the DOM path and the engine kernel build the same split section on every parser shape', { timeout: 120_000 }, async () => {
  const off = [];
  for (const [cls, body] of CASES) {
    const html = `<section class="${cls}">${body}</section>`;
    await page.setContent(`<!DOCTYPE html><body>${html}</body>`);
    await page.addScriptTag({ content: bundle });
    const dom = await page.evaluate(`(() => { ${SIG}; applySplitDom(document); return signature(document.querySelector('section')); })()`);
    await page.setContent(`<!DOCTYPE html><body>${kernel.applyToRenderedHtml(html)}</body>`);
    const str = await page.evaluate(`(() => { ${SIG}; return signature(document.querySelector('section')); })()`);
    if (dom !== str) off.push(`${cls}: ${body}\n  DOM path ${dom}\n  kernel   ${str}`);
  }
  assert.deepEqual(off, [], `${off.length} of ${CASES.length} shapes disagree in Chromium`);
});
