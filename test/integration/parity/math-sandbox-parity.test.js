/**
 * Integration: the math plugin, rendered by KaTeX inside the LOCKED sandbox page, is byte-identical to
 * the engine's Node-side render (followups.d/2749-p3-migrate-in-tree-plugins-to-sandbox-model.md).
 *
 * The owner's rule is one model for every plugin: it renders in the sandbox and returns a fragment
 * (engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 rows 3 and 4). `math.render.js` loads
 * KaTeX into the engine's own Node process instead. Moving it changes export bytes unless the sandbox
 * output is identical, and an export change stops for the owner's sign-off. This test is the evidence
 * for that sign-off and the ratchet the move must keep: every formula the shipped docs, fixtures,
 * examples and gallery hold, rendered both ways, must match byte for byte.
 *
 * Needs Chromium. One sandbox launch.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { launchSandboxBrowser, openPackageSandbox, runPackage } = require('../../../lib/core/code-sandbox.js');
const { renderTex } = require('../../../lib/plugins/math/math.render.js');

const ROOT = path.join(__dirname, '../../..');
const TIMEOUT = 300000;

/** Every `$$…$$` and `$…$` formula in the files a math render is judged by. */
function formulas() {
  const files = [
    'lib/plugins/math/math.fixtures.md',
    'lib/plugins/math/math.docs.md',
    'test/integration/baseline-decks/gallery.md',
    ...fs
      .readdirSync(path.join(ROOT, 'examples'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `examples/${f}`),
  ];
  const out = new Map();
  for (const f of files) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of t.matchAll(/\$\$([\s\S]+?)\$\$/g)) out.set(`D${m[1].trim()}`, [m[1].trim(), true]);
    for (const m of t.replace(/\$\$[\s\S]+?\$\$/g, '').matchAll(/(?<![\\$\w])\$([^$\n]+?)\$(?!\w)/g)) out.set(`I${m[1]}`, [m[1], false]);
  }
  // A malformed formula, so the error path (KaTeX's own error markup, `errorColor`) is compared too.
  out.set('Ierr', ['\\frac{1}{', false]);
  return [...out.values()];
}

test('KaTeX in the locked sandbox page renders every shipped formula byte-identical to the Node path', { timeout: TIMEOUT }, async () => {
  const list = formulas();
  assert.ok(list.length >= 40, `only ${list.length} formulas found: the corpus moved, so this proves less than it did`);
  const katex = fs.readFileSync(path.join(ROOT, 'lib/plugins/math/vendor/katex/katex.min.js'), 'utf8');
  // The same options `renderTex` passes (math.render.js), as a fence renderer the door could run.
  const code = `${katex}\nfunction render(f){ var j = JSON.parse(f.body); return self.katex.renderToString(j.s, { displayMode: j.d, throwOnError: false, output: 'htmlAndMathml', errorColor: 'var(--warn)' }); }\nexport { render as default };`;
  const browser = await launchSandboxBrowser(puppeteer, { headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const differ = [];
  try {
    const sandbox = await openPackageSandbox(browser, code, { fence: true, loadTimeoutMs: 30000 });
    try {
      for (const [s, d] of list) {
        const node = renderTex(s, d);
        const boxed = await runPackage(sandbox, { body: JSON.stringify({ s, d }), id: 'm' }, { fence: true, timeoutMs: 10000 });
        if (boxed !== node) differ.push(`${d ? 'display' : 'inline'} ${JSON.stringify(s.slice(0, 60))}`);
      }
    } finally {
      await sandbox.close();
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(differ, [], `${differ.length} of ${list.length} formulas differ`);
});
