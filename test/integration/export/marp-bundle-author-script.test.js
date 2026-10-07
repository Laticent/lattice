/**
 * The Export-to-Marp bundle runs none of the deck's own script — real marp-cli, real Chromium
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 11).
 *
 * The bundle's `marp.config.cjs` sets `html: true` so the Lattice runtime loads, and before § 11 that
 * same flag ran a deck's `<script>`, `on…` handlers and `srcdoc` frames in the recipient's marp-cli.
 * This deck carries every shape the review found (the strip's own cases, the cut that joins its
 * neighbors, the `<svg><style>` breakout, a `<base>` that would hijack the runtime tags) and each one
 * sets a flag on `top`. The bundle is built by `tools/export-marp.js`, rendered by marp-cli with the
 * bundle's own config, and opened in Chromium: no flag may be set, the runtime must still load, and
 * the quoted code must still show.
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
const OUT = path.join(ROOT, '.scratch', 'marp-bundle-author-script');
const TIMEOUT = 300000;

// Each payload sets `top.__hit_<n>`. Quoted code (inline and fenced) must survive as text.
const DECK = `---
marp: true
theme: indaco
---

# Probe

<script>top.__hit_script = 1</script>

<img src="nope.png" onerror="top.__hit_onerror = 1">

<iframe srcdoc="<script>top.parent.__hit_srcdoc = 1</script>"></iframe>

<scr<script>x</script>ipt>top.__hit_joined = 1</scr<script>y</script>ipt>

<svg><style><img src=x onerror="top.__hit_svgstyle = 1"></style></svg>

<base href="https://evil.invalid/">

a <img title="\`" onerror="top.__hit_backtick = 1"> b \`c\`

Quoted: \`<script>alert(1)</script>\` stays code.

\`\`\`html
<img src=x onerror="alert(1)">
\`\`\`
`;

function marp(args, cwd, timeout = TIMEOUT) {
  const env = { ...process.env, npm_config_ignore_scripts: 'true', CHROME_NO_SANDBOX: '1' };
  if (!env.CHROME_PATH) {
    try { env.CHROME_PATH = require('puppeteer').executablePath(); } catch { /* marp-cli finds its own */ }
  }
  return spawnSync('npx', ['-y', `@marp-team/marp-cli@${MARP_CLI_RANGE}`, '--no-stdin', ...args], { cwd, encoding: 'utf8', env, timeout });
}

describe('Export-to-Marp runs none of the deck\'s own script — real marp-cli, real Chromium', () => {
  let skip = null;
  let browser;
  let page;
  let html = '';

  before(async () => {
    const probe = marp(['--version'], ROOT, 90000);
    if (probe.status !== 0) {
      const reason = `could not fetch marp-cli (exit ${probe.status}): ${String(probe.stderr || '').slice(0, 300)}`;
      if (process.env.CI) throw new Error(`[marp-bundle-author-script] ${reason}`);
      skip = reason;
      return;
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'probe.md'), DECK);
    const r = spawnSync(process.execPath, [EXPORT_CLI, path.join(OUT, 'probe.md'), path.join(OUT, 'out'), '--no-agent'], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
    const bundle = path.join(OUT, 'out', 'probe');
    const m = marp(['probe.md', '--config-file', 'marp.config.cjs', '--allow-local-files', '-o', 'out.html'], bundle);
    assert.equal(m.status, 0, `marp failed:\n${m.stdout}\n${m.stderr}`);
    html = fs.readFileSync(path.join(bundle, 'out.html'), 'utf8');
    browser = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.goto(require('node:url').pathToFileURL(path.join(bundle, 'out.html')).href, { waitUntil: 'networkidle0' });
    // Not a hard wait: a surviving `<base>` re-points the runtime's tags and it never loads, which the
    // second test reports by name rather than as a setup timeout.
    await page.waitForFunction(() => document.documentElement.getAttribute('data-lattice-runtime') === 'loaded', { timeout: 30000 }).catch(() => {});
    await new Promise((res) => setTimeout(res, 1000));
  });

  after(async () => {
    if (browser) await browser.close();
  });

  test('no payload ran', async (t) => {
    if (skip) return t.skip(skip);
    const hits = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__hit_')));
    assert.deepEqual(hits, [], `ran: ${hits.join(', ')}`);
  });

  test('the Lattice runtime still loaded from its own tags, and no <base> re-pointed them', async (t) => {
    if (skip) return t.skip(skip);
    assert.equal(await page.evaluate(() => document.querySelector('base')), null);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-lattice-runtime')), 'loaded');
  });

  test('quoted code still shows as written', (t) => {
    if (skip) return t.skip(skip);
    assert.match(html, /Quoted: <code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code>/);
    assert.match(html, /onerror/, 'the fenced sample keeps its text');
  });
});
