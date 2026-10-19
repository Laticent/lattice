/**
 * Integration: the CLI typesets math in the LOCKED page, never in its own process (owner decision 14;
 * lib/export/math-typeset.js, math-typeset-worker.js).
 *
 *   PARITY     the real CLI's `.html` holds each formula exactly as KaTeX in Node typesets it (the export's bytes do
 *              not move; test/integration/parity/math-sandbox-parity.test.js pins every shipped formula the same way)
 *   OUT        KaTeX is never loaded into the CLI's process, and no fallback was taken
 *   SANITIZE   what the worker returns is sanitized: KaTeX's own bytes are kept only when the sanitizer removed nothing
 *
 * Needs Chromium.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { typesetInProcess } = require('../../../lib/plugins/math/math.render.js');
const { openSanitizerPage } = require('../../../lib/packages/code-door-worker.js');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');

const ROOT = path.join(__dirname, '../../..');
const TIMEOUT = 300000;

test('PARITY and OUT: the CLI typesets in the locked page, byte for byte as Node did, and never loads KaTeX itself', { timeout: TIMEOUT }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-locked-'));
  try {
    const deck = path.join(dir, 'deck.md');
    fs.writeFileSync(deck, "---\ntheme: indaco\n---\n\n## Math\n\nInline $f'(x) = 2x$ and display:\n\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n\nBroken: $\\frac{1}{$\n");
    const probe = path.join(dir, 'probe.cjs');
    fs.writeFileSync(probe, "process.on('exit', () => process.stderr.write('KATEX_IN_PROCESS=' + Object.keys(require.cache).some((p) => p.endsWith('katex.min.js')) + '\\n'));\n");
    const out = path.join(dir, 'deck.html');
    const r = spawnSync(process.execPath, ['-r', probe, path.join(ROOT, 'lattice.js'), deck, out], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: dir } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /KATEX_IN_PROCESS=false/);
    assert.doesNotMatch(r.stderr, /math: the locked page could not typeset/);
    const html = fs.readFileSync(out, 'utf8');
    for (const [src, display] of [["f'(x) = 2x", false], ['\\int_0^1 x^2\\,dx = \\frac{1}{3}', true], ['\\frac{1}{', false]]) {
      assert.ok(html.includes(typesetInProcess(src, display, 'htmlAndMathml')), `${src} is not KaTeX's own typeset`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('OUT: a deck whose only math is a ~~~math fence is typeset in the locked page too', { timeout: TIMEOUT }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-tilde-'));
  try {
    const deck = path.join(dir, 'deck.md');
    fs.writeFileSync(deck, '---\ntheme: indaco\n---\n\n## Tilde\n\n~~~math\n\\frac{1}{3}\n~~~\n');
    const probe = path.join(dir, 'probe.cjs');
    fs.writeFileSync(probe, "process.on('exit', () => process.stderr.write('KATEX_IN_PROCESS=' + Object.keys(require.cache).some((p) => p.endsWith('katex.min.js')) + '\\n'));\n");
    const r = spawnSync(process.execPath, ['-r', probe, path.join(ROOT, 'lattice.js'), deck, path.join(dir, 'deck.html')], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: dir } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /KATEX_IN_PROCESS=false/);
    assert.ok(fs.readFileSync(path.join(dir, 'deck.html'), 'utf8').includes(typesetInProcess('\\frac{1}{3}', true, 'htmlAndMathml')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SANITIZE: a typeset with nothing to remove keeps its bytes; one with a handler or a script comes back clean', { timeout: TIMEOUT }, async () => {
  const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const s = await openSanitizerPage(browser);
    try {
      const katex = typesetInProcess("f'(x)", false, 'htmlAndMathml');
      assert.ok(katex.includes('&#x27;'), 'the fixture no longer exercises a re-spelling');
      assert.equal(await s.sanitizeKeeping(katex), katex);
      const hostile = `${katex}<img src=x onerror=alert(1)><script>alert(2)</script>`;
      const clean = await s.sanitizeKeeping(hostile);
      assert.doesNotMatch(clean, /onerror|<script|alert/);
      assert.match(clean, /class="katex"/);
    } finally {
      await s.close();
    }
  } finally {
    await browser.close();
  }
});
