/**
 * Integration: the CLI typesets math behind the wall (lib/plugins/host-katex-wall.js: KaTeX in QuickJS, in WebAssembly, in the
 * CLI's own process), never with KaTeX loaded into that process, and starts no browser of its own for it.
 *
 *   PARITY   the real CLI's `.html` holds each formula exactly as KaTeX in Node typesets it, the error form included
 *            (test/unit/plugins/katex-wall.test.js pins every shipped formula the same way)
 *   OUT      KaTeX is never `require`d into the CLI's process, and a deck whose only math is a `~~~math` fence is no
 *            exception
 *
 * The `.html` export starts one browser of its own to measure the layout; that is not math's, and math adds none.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const TIMEOUT = 300000;
// Reports, at exit, whether KaTeX's own file was ever `require`d, and how many browsers were launched.
// Browsers are counted where they start, at `child_process.spawn`: puppeteer 25 is an ES module, so
// `require('puppeteer')` returns a frozen namespace whose `launch` cannot be wrapped (the assignment
// is silently dropped and every count reads 0). Every Chrome puppeteer drives, `launch` and the
// sandbox's `launchAsUser` alike, carries a `--remote-debugging-*` switch. @puppeteer/browsers imports the
// module's default export, which is this object; `syncBuiltinESMExports` also covers a named `{ spawn }`
// import. A browser started by a child Node process (lib/plugins/host-bake.js) is not counted, as before.
const PROBE = `const Module = require('module'); const cp = require('child_process'); const spawn = cp.spawn; let launches = 0;
cp.spawn = function (cmd, args) { if (Array.isArray(args) && args.some((a) => /^--remote-debugging-(pipe|port)/.test(a))) launches++; return spawn.apply(this, arguments); };
Module.syncBuiltinESMExports();
process.on('exit', () => process.stderr.write('KATEX_IN_PROCESS=' + Object.keys(require.cache).some((p) => p.endsWith('katex.min.js')) + ' LAUNCHES=' + launches + '\\n'));\n`;

function exportHtml(markdown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-walled-'));
  const deck = path.join(dir, 'deck.md');
  fs.writeFileSync(deck, markdown);
  const probe = path.join(dir, 'probe.cjs');
  fs.writeFileSync(probe, PROBE);
  const out = path.join(dir, 'deck.html');
  const r = spawnSync(process.execPath, ['-r', probe, path.join(ROOT, 'lattice.js'), deck, out], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: dir } });
  try {
    return { r, html: r.status === 0 ? fs.readFileSync(out, 'utf8') : '' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const typeset = (src, displayMode) =>
  require('../../../lib/plugins/host-katex-wall.js').renderToString(src, { displayMode, throwOnError: false, output: 'htmlAndMathml', errorColor: 'var(--warn)' });

test('PARITY and OUT: the CLI typesets behind the wall, byte for byte as KaTeX in Node, and never loads KaTeX itself', { timeout: TIMEOUT }, () => {
  const { r, html } = exportHtml("---\ntheme: indaco\n---\n\n## Math\n\nInline $f'(x) = 2x$ and display:\n\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n\nBroken: $\\frac{1}{$\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /KATEX_IN_PROCESS=false LAUNCHES=1\b/);
  const katex = require('../../../lib/plugins/math/vendor/katex/katex.min.js');
  for (const [src, display] of [["f'(x) = 2x", false], ['\\int_0^1 x^2\\,dx = \\frac{1}{3}', true], ['\\frac{1}{', false]]) {
    const node = katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', errorColor: 'var(--warn)' });
    assert.equal(typeset(src, display), node);
    assert.ok(html.includes(node), `${src} is not KaTeX's own typeset`);
  }
});

test('OUT: a deck whose only math is a ~~~math fence is typeset behind the wall too', { timeout: TIMEOUT }, () => {
  const { r, html } = exportHtml('---\ntheme: indaco\n---\n\n## Tilde\n\n~~~math\n\\frac{1}{3}\n~~~\n');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /KATEX_IN_PROCESS=false LAUNCHES=1\b/);
  assert.ok(html.includes(typeset('\\frac{1}{3}', true)));
});
