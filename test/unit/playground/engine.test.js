/**
 * Unit: the browser playground engine (lib/playground/index.js).
 *
 * The playground runs the owned engine client-side (Marp was retired in P4;
 * this entry no longer bundles marp-core — see lib/playground/index.js). This
 * test imports the SHIPPING engine module and asserts it produces the same
 * structural output the build path does — so the playground can't silently
 * drift from the PDF:
 *
 *   1. verdict-grid badges (a shared kernel token plugin) appear in the render,
 *      proving the shared plugins (lib/integrations/markdown-it/plugins.js) are wired.
 *   2. slide count matches the number of `---`-separated slides.
 *   3. render() returns { html, css } for the requested theme.
 *
 * The owned engine works in Node (the same way
 * test/unit/parsing/markdown-it-plugins.test.js uses it), so the engine
 * module imports and renders here without a browser.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeCss = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
const cuoioCss = fs.readFileSync(path.join(ROOT, 'themes', 'cuoio.css'), 'utf8');

// lib/playground/index.js is an ESM module; dynamic import() loads it from CJS.
// In Node `typeof window === 'undefined'`, so the window.LatticePlayground
// assignment is skipped and the default export is the engine API.
async function loadEngine() {
  const mod = await import('../../../lib/playground/index.js');
  const pg = mod.default;
  pg.addThemes([latticeCss, cuoioCss]);
  return pg;
}

describe('playground engine', () => {
  test('renders verdict-grid badges (token plugins are wired)', async () => {
    const pg = await loadEngine();
    const md = [
      '<!-- _class: verdict-grid -->',
      '',
      '## Which option meets the criteria.',
      '',
      '- **Folder shape.**',
      '  - [x] Self-contained per component',
      '  - [-] Familiar pattern',
      '  - [ ] No room for transform.js',
    ].join('\n');
    const { html, css } = pg.render(md, 'cuoio');
    assert.ok(typeof html === 'string' && html.length > 0, 'html produced');
    assert.ok(typeof css === 'string' && css.length > 0, 'css produced');
    // verdictGridBadges wraps each [x]/[-]/[ ] item in a state badge span.
    assert.match(html, /class="badge pass state-full"/, 'pass badge present');
    assert.match(html, /class="badge warn state-half"/, 'warn badge present');
    assert.match(html, /class="badge fail state-empty"/, 'fail badge present');
  });

  test('slide count matches `---` separators', async () => {
    const pg = await loadEngine();
    const md = ['# One', '', '---', '', '# Two', '', '---', '', '# Three'].join('\n');
    const { html } = pg.render(md, 'cuoio');
    const slides = (html.match(/<\/section>/g) || []).length;
    assert.equal(slides, 3, 'three slides rendered');
  });

  test('checklist state markers are decoded (shared plugin parity)', async () => {
    const pg = await loadEngine();
    const md = ['<!-- _class: checklist -->', '', '## Done', '', '- [x] Shipped', '- [ ] Pending'].join('\n');
    const { html } = pg.render(md, 'cuoio');
    assert.match(html, /class="[^"]*state pass state-full[^"]*"/, 'checklist pass state applied');
  });

  test('hasTheme reflects registered themes', async () => {
    const pg = await loadEngine();
    assert.equal(pg.hasTheme('cuoio'), true);
    assert.equal(pg.hasTheme('does-not-exist'), false);
  });

  test('render() reports the @size box so hosts fit-scale the real slide', async () => {
    const pg = await loadEngine();
    const hd = pg.render('# A\n', 'cuoio');
    assert.deepEqual({ width: hd.width, height: hd.height }, { width: 1280, height: 720 });
    // A `size: 4K` deck reports its 3840-wide box — the preview divides by this,
    // not a hardcoded 1280 (the bug where 4K previewed 3× oversized + exported
    // a cropped page). cuoio.css declares `@size 4K 3840px 2160px`.
    const k = pg.render('---\nsize: 4K\n---\n# A\n', 'cuoio');
    assert.deepEqual({ width: k.width, height: k.height }, { width: 3840, height: 2160 });
  });
});
