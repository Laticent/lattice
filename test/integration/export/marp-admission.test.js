/**
 * Integration: an Export-to-Marp bundle follows the producer's plugin admission (spec/LPM.md §3.2.1).
 *
 * The engine marks what belongs to a plugin a deck did not load, and every browser pass skips the
 * mark. A Marp bundle is rendered by MARP, so nothing marks it; the bundle records the plugins its
 * producer left off (`pluginsOff`, the settings block) and its runtime marks them before it draws
 * (lib/plugins/mark-off.mjs). This drives the real artifact through the real tool: tools/export-marp.js
 * with `--default-plugins=none --disable-plugin=chart-family`, `marp --html` from the registry, then the page in Chromium — and,
 * as the control, the same deck on the default set, where the diagram and the chart draw.
 *
 * Local runs skip when marp-cli cannot be fetched; CI fails instead (marp-kit-render.test.js
 * explains why a self-skipping gate is not a gate).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const { MARP_CLI_RANGE } = require(path.join(ROOT, 'lib', 'core', 'marp-bundle.js'));
const EXPORT_CLI = path.join(ROOT, 'tools', 'export-marp.js');
const OUT_ROOT = path.join(ROOT, '.scratch', 'marp-admission');
const TIMEOUT = 300000;

const DECK = `---
marp: true
theme: indaco
---

# Admission

\`\`\`mermaid
flowchart LR
  A[Deck] --> B[Bundle]
\`\`\`

---

<!-- _class: bar -->

## Revenue by region

- North \`42\`
- South \`30\`
`;

function marp(args, cwd, timeout = TIMEOUT) {
  const env = { ...process.env, npm_config_ignore_scripts: 'true', CHROME_NO_SANDBOX: '1' };
  if (!env.CHROME_PATH) {
    try { env.CHROME_PATH = require('puppeteer').executablePath(); } catch { /* marp-cli finds its own */ }
  }
  return spawnSync('npx', ['-y', `@marp-team/marp-cli@${MARP_CLI_RANGE}`, ...args], { cwd, encoding: 'utf8', env, timeout });
}

describe('Export-to-Marp follows the deck\'s plugin admission — real marp-cli, real Chromium', () => {
  let skip = null;
  let browser;
  const pages = {};

  before(async () => {
    const probe = marp(['--version'], ROOT, 90000);
    if (probe.status !== 0) {
      const reason = `could not fetch marp-cli (exit ${probe.status}): ${String(probe.stderr || '').slice(0, 300)}`;
      if (process.env.CI) throw new Error(`[marp-admission] ${reason}`);
      skip = reason;
      return;
    }
    browser = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const [arm, flags] of [['default', []], ['none', ['--default-plugins=none', '--disable-plugin=chart-family']]]) {
      const dir = path.join(OUT_ROOT, arm);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'admission.md'), DECK);
      const r = spawnSync(process.execPath, [EXPORT_CLI, path.join(dir, 'admission.md'), path.join(dir, 'out'), '--no-agent', ...flags], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
      assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
      const bundle = path.join(dir, 'out', 'admission');
      const m = marp(['admission.md', '--config-file', 'marp.config.cjs', '--allow-local-files', '--html', '-o', 'out.html'], bundle);
      assert.equal(m.status, 0, `marp --html failed:\n${m.stdout}\n${m.stderr}`);
      const page = await browser.newPage();
      await page.goto(require('node:url').pathToFileURL(path.join(bundle, 'out.html')).href, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.documentElement.getAttribute('data-lattice-runtime') === 'loaded', { timeout: 30000 });
      // Two frames after boot, and past the runtime's mutation debounce, for any pass to act.
      await new Promise((r) => setTimeout(r, 1500));
      pages[arm] = { page, md: fs.readFileSync(path.join(bundle, 'admission.md'), 'utf8') };
    }
  });

  after(async () => {
    if (browser) await browser.close();
  });

  test('the default set: no pluginsOff, the diagram draws and the chart builds', async (t) => {
    if (skip) return t.skip(skip);
    const { page, md } = pages.default;
    assert.ok(!md.includes('pluginsOff'), 'a default-set bundle carries no pluginsOff');
    await page.waitForFunction(() => document.querySelector('[data-lattice-figure] svg') !== null, { timeout: 30000 });
    assert.equal(await page.$$eval('section.chart-frame .bar-figure', (e) => e.length), 1);
    assert.equal(await page.$$eval('[data-lattice-off]', (e) => e.length), 0);
  });

  // The bar slide's class would load the chart family even on an empty default set (filling its slot
  // is requiring it), so the chart arm switches the family off outright, as a host can.
  test('--default-plugins=none --disable-plugin=chart-family: the fence stays source, the chart its list', async (t) => {
    if (skip) return t.skip(skip);
    const { page, md } = pages.none;
    assert.match(md, /"pluginsOff":\["anima","chart-family","function-plot","math","mermaid"\]/);
    assert.equal(await page.$$eval(':is(pre,marp-pre)[data-lattice-off="mermaid"]', (e) => e.length), 1, 'the mermaid <pre> is marked');
    assert.equal(await page.$$eval('[data-lattice-figure]', (e) => e.length), 0, 'no diagram drawn');
    assert.match(await page.$eval('[data-lattice-off="mermaid"] code', (e) => e.textContent), /flowchart LR/);
    assert.equal(await page.$$eval('section.bar[data-lattice-off="chart-family"]', (e) => e.length), 1, 'the bar section is marked');
    assert.equal(await page.$$eval('.bar-figure, section.chart-frame', (e) => e.length), 0, 'no chart built');
    if (process.env.ADMISSION_EVIDENCE) {
      fs.mkdirSync(process.env.ADMISSION_EVIDENCE, { recursive: true });
      for (const [arm, p] of Object.entries(pages)) {
        await p.page.setViewport({ width: 1280, height: 720 });
        await p.page.screenshot({ path: path.join(process.env.ADMISSION_EVIDENCE, `marp-${arm}.png`) });
      }
    }
  });
});
