/**
 * `--disable-plugin` switches a plugin off for the ENGINE AND its CLI BAKE, from one list.
 *
 * Before plugin-system phase D's last consumers moved, the CLI handed `bakeDeck` no `disabled`
 * at all, so a plugin the engine had switched off still baked its figures into the deck — the
 * export carried a drawing the run had asked to leave out. `lattice.js` now builds one
 * `PLUGINS_DISABLED` list and hands it to both (`lib/plugins/host-bake.js`, `createEngine`).
 *
 * ASSERTED ON THE REAL CLI (HARD RULE #23): the wiring is what a unit test cannot see — dropping
 * either hand-off leaves every unit test green. Both directions, so the arm can fail: the same
 * deck WITHOUT the flag must bake its diagram and typeset its math.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('--disable-plugin', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice.js');
  const TIMEOUT = 180000;
  const DECK = '# Flow\n\n```mermaid\ngraph LR; A-->B\n```\n\nThe area is $\\pi r^2$.\n';

  function render(...extra) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-disable-plugin-'));
    const md = path.join(dir, 'deck.md');
    fs.writeFileSync(md, DECK);
    const out = path.join(dir, 'deck.html');
    const r = spawnSync(process.execPath, [EMULATOR, md, '-o', out, '--fluid', '-q', ...extra], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    return { r, html: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '' };
  }
  const count = (html, needle) => html.split(needle).length - 1;

  test('without it, the bake draws the diagram and the engine typesets the math', { timeout: TIMEOUT }, () => {
    const { r, html } = render();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(count(html, 'class="mermaid-svg'), 1, 'the bake drew one diagram');
    assert.ok(count(html, 'data-lattice-figure="mermaid"') >= 1, 'carrying the host figure marker');
    assert.equal(count(html, 'class="katex"'), 1);
  });

  test('with it (repeated, both spellings), neither runs: the fence and the TeX ship as source', { timeout: TIMEOUT }, () => {
    const { r, html } = render('--disable-plugin', 'mermaid', '--disable-plugin=math');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(count(html, 'class="mermaid-svg'), 0, 'a switched-off plugin bakes nothing');
    assert.equal(count(html, 'class="katex"'), 0);
    assert.ok(html.includes('language-mermaid'), 'the fence ships as its highlighted source');
  });

  test('a name no plugin has fails the run', { timeout: TIMEOUT }, () => {
    const { r } = render('--disable-plugin', 'mermiad');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no plugin is named "mermiad"/);
  });
});
