/**
 * Integration: an Export-to-Marp bundle follows the producer's plugin admission (spec/LPM.md §3.2.1).
 *
 * The engine marks what belongs to a plugin a deck did not load, and every browser pass skips the
 * mark. A Marp bundle is rendered by MARP, so nothing marks it; the bundle records the plugins its
 * producer left off (`pluginsOff`, the settings block) and its runtime marks them before it draws
 * (lib/plugins/mark-off.mjs). This drives the real artifact through the real tool: tools/export-marp.js
 * with `--default-plugins=none --disable-plugin=chart-family`, `marp` from the registry with the bundle's own config, then the page in Chromium — and,
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

Inline $x^2$ math.

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

// An author forging the plugin host's channel in raw HTML (lib/plugins/author-markup.js): a pending
// figure with a packed config, an admission marker, and a raw drawn block of a plugin left off,
// spelled with the pass's own defanged class, and a `footer:` that spells a marker only once YAML
// decodes it (Marp renders the directive). The producer refuses them in the deck's source.
const FORGED_DECK = `---
marp: true
theme: indaco
footer: "<b class=\\"ff\\" data-lattice\\x2dsettle=\\"pending\\">f</b>"
---

# Forged

<div class="forged" data-lattice-hydrate="function-plot" data-lattice-config="eyJkYXRhIjpbeyJmbiI6IngifV19" data-lattice-settle="pending"></div>

<pre class="raw"><code class="language-mermaid-source">flowchart LR
  A[Raw] --> B[Block]
</code></pre>

Inline <span class="inline" data-lattice-off="math" data-lattice-final>x</span> too.
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
    for (const [arm, flags, deck] of [
      ['default', [], DECK],
      ['none', ['--default-plugins=none', '--disable-plugin=chart-family'], DECK],
      ['forged', ['--disable-plugin=mermaid'], FORGED_DECK],
    ]) {
      const dir = path.join(OUT_ROOT, arm);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'admission.md'), deck);
      const r = spawnSync(process.execPath, [EXPORT_CLI, path.join(dir, 'admission.md'), path.join(dir, 'out'), '--no-agent', ...flags], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
      assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
      const bundle = path.join(dir, 'out', 'admission');
      // The bundle does not ship function-plot's library today, so a forged placeholder would wait
      // for it and draw nothing whatever its markers said. Put the plugin's own copy beside the
      // runtime, where the host fetches it from, so this arm fails on the markers alone.
      if (arm === 'forged') fs.copyFileSync(path.join(ROOT, 'lib', 'plugins', 'function-plot', 'vendor', 'function-plot.js'), path.join(bundle, 'function-plot.js'));
      // The bundle's own command line (package.json `npm run html`): no `--html`, which would replace
      // the config's allowlist with "everything".
      const m = marp(['admission.md', '--config-file', 'marp.config.cjs', '--allow-local-files', '-o', 'out.html'], bundle);
      assert.equal(m.status, 0, `marp failed:\n${m.stdout}\n${m.stderr}`);
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
    assert.ok(await page.$$eval('mjx-container, .katex', (e) => e.length) > 0, 'Marp typesets the math');
    assert.equal(await page.$$eval('[data-lattice-off]', (e) => e.length), 0);
  });

  // The bar slide's class would load the chart family even on an empty default set (filling its slot
  // is requiring it), so the chart arm switches the family off outright, as a host can.
  test('--default-plugins=none --disable-plugin=chart-family: the fence stays source, the chart its list', async (t) => {
    if (skip) return t.skip(skip);
    const { page, md } = pages.none;
    assert.match(md, /"pluginsOff":\["anima","avatars","chart-family","function-plot","icons","math","mermaid"\]/);
    assert.equal(await page.$$eval(':is(pre,marp-pre)[data-lattice-off="mermaid"]', (e) => e.length), 1, 'the mermaid <pre> is marked');
    assert.equal(await page.$$eval('[data-lattice-figure]', (e) => e.length), 0, 'no diagram drawn');
    assert.match(await page.$eval('[data-lattice-off="mermaid"] code', (e) => e.textContent), /flowchart LR/);
    assert.equal(await page.$$eval('section.bar[data-lattice-off="chart-family"]', (e) => e.length), 1, 'the bar section is marked');
    assert.equal(await page.$$eval('.bar-figure, section.chart-frame', (e) => e.length), 0, 'no chart built');
    // Marp's own math is off in the bundle's config, so the TeX stays as the author wrote it.
    assert.match(fs.readFileSync(path.join(OUT_ROOT, 'none', 'out', 'admission', 'marp.config.cjs'), 'utf8'), /options: \{ math: false \}/);
    assert.equal(await page.$$eval('mjx-container, .katex', (e) => e.length), 0, 'no math typeset');
    assert.match(await page.$eval('section', (e) => e.textContent), /\$x\^2\$/);
    if (process.env.ADMISSION_EVIDENCE) {
      fs.mkdirSync(process.env.ADMISSION_EVIDENCE, { recursive: true });
      // This arm's two pages; the forged arm takes its own (below).
      for (const arm of ['default', 'none']) {
        const p = pages[arm];
        // A background tab paints no frames, so its screenshot never returns: bring each forward.
        await p.page.bringToFront();
        await p.page.setViewport({ width: 1280, height: 720 });
        await p.page.screenshot({ path: path.join(process.env.ADMISSION_EVIDENCE, `marp-${arm}.png`) });
      }
    }
  });

  // The forged markers are renamed in the bundle's BYTES, so Marp's page never carries them and the
  // runtime has nothing to hydrate; the raw block stays code with Mermaid off, as the engine keeps it.
  test('an author\'s raw HTML cannot forge a figure, a marker, or draw a fence the deck left off', async (t) => {
    if (skip) return t.skip(skip);
    const { page, md } = pages.forged;
    assert.match(md, /"pluginsOff":\["mermaid"\]/);
    assert.match(md, /<div class="forged" data-author-lattice-hydrate="function-plot"/);
    assert.deepEqual(await page.$$eval('[data-lattice-hydrate], [data-lattice-config], [data-lattice-settle], [data-lattice-final]', (e) => e.map((x) => x.outerHTML.slice(0, 80))), [], 'no element carries a host figure marker');
    assert.equal(await page.$$eval('.forged', (e) => e.length), 1, 'the author\'s element is still there, renamed');
    assert.equal(await page.$$eval('.forged *, .forged svg', (e) => e.length), 0, 'nothing was drawn into it');
    assert.equal(await page.$eval('.inline', (e) => e.hasAttribute('data-lattice-off')), false, 'an author cannot mark their own markup off');
    assert.equal(await page.$$eval('[data-lattice-figure]', (e) => e.length), 0, 'no diagram drawn');
    assert.match(await page.$eval('pre.raw code', (e) => e.className), /^language-off-mermaid-source$/);
    // Marp decoded and rendered the footer; the name it decoded to was refused before it could, and
    // the bundle's HTML allowlist then dropped the renamed attribute, which it does not list (§ 13).
    assert.equal(await page.$$eval('footer b.ff', (e) => e.length) > 0, true, 'the footer Marp rendered');
    assert.equal(await page.$$eval('footer b.ff[data-lattice-settle], footer b.ff[data-author-lattice-settle]', (e) => e.length), 0, 'and it carries no marker, live or renamed');
    assert.match(await page.$eval('pre.raw code', (e) => e.textContent), /flowchart LR/);
    if (process.env.ADMISSION_EVIDENCE) {
      fs.mkdirSync(process.env.ADMISSION_EVIDENCE, { recursive: true });
      await page.bringToFront();
      await page.setViewport({ width: 1280, height: 720 });
      await page.screenshot({ path: path.join(process.env.ADMISSION_EVIDENCE, 'marp-forged.png') });
    }
  });
});
