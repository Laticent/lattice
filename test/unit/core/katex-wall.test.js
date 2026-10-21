/**
 * KaTeX behind the wall (lib/core/katex-wall.js): QuickJS in WebAssembly, in this process, no browser.
 *
 *   PARITY    every shipped formula, in all three output modes, typesets byte for byte as KaTeX in Node does, and every
 *             result passes the output check as it is (so no export moves)
 *   WALL      nothing of the host is reachable inside: no require, process, fetch, timers or file system
 *   SWEEP     every command name in KaTeX's source passes the check as KaTeX in Node typesets it
 *   LIMITS    a runaway loop, unbounded memory, runaway recursion and a hostile getter each stop inside, quickly, and the
 *             next formula still typesets
 *   CHECK     the output check refuses what KaTeX with `trust` off never emits; a refused result goes through the full
 *             slide sanitizer instead
 *   ENGINE    in a fresh process, the math plugin typesets through the wall and KaTeX is never `require`d
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const wall = require('../../../lib/core/katex-wall.js');

const ROOT = path.join(__dirname, '../../..');

/** Every `$$…$$` and `$…$` formula in the files a math render is judged by, plus forms that exercise KaTeX's corners. */
function formulas() {
  const files = [
    'lib/plugins/math/math.fixtures.md',
    'lib/plugins/math/math.docs.md',
    'test/integration/baseline-decks/gallery.md',
    ...fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).map((f) => `examples/${f}`),
  ];
  const out = new Map();
  for (const f of files) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of t.matchAll(/\$\$([\s\S]+?)\$\$/g)) out.set(`D${m[1].trim()}`, [m[1].trim(), true]);
    for (const m of t.replace(/\$\$[\s\S]+?\$\$/g, '').matchAll(/(?<![\\$\w])\$([^$\n]+?)\$(?!\w)/g)) out.set(`I${m[1]}`, [m[1], false]);
  }
  for (const [s, d] of [
    ['\\frac{1}{', false], // KaTeX's own error markup and `errorColor`
    ['\\href{javascript:alert(1)}{x}', false],
    ['\\url{https://example.com}', false],
    ['\\includegraphics{x.png}', false],
    ['\\color{red}{x} \\textcolor{#f00}{y} \\colorbox{red}{z}', false],
    ['\\boxed{x} \\cancel{y} \\fbox{z}', false],
    ['\\xrightarrow{a} \\overbrace{x}^a \\underbrace{y}_b \\widehat{abc}', false],
    ['\\sqrt[3]{x}', true],
    ['\\begin{array}{c|c}a&b\\\\\\hline c&d\\end{array}', true],
    ['\\rule{1em}{2em} \\phantom{x} \\mathbb{R}', false],
    ['\\tag{1} x', true],
    // MathML KaTeX nests inside <mi>/<mo>, which the HTML parser files in the HTML namespace (the checker, 2026-10-20).
    ['a \\bmod b \\pmod{n}', false],
    ['x \\coloneqq y \\eqqcolon z \\vcentcolon w \\simcolon v', false],
    ['\\overset{a}{b} \\underset{c}{d} \\stackrel{def}{=}', true],
    ['\\boxed{\\overset{a}{b}} \\textcolor{red}{\\stackrel{x}{=}}', false],
    ['\\ulcorner x \\urcorner \\dddot{a} \\ddddot{b}', false],
    ['\\fcolorbox{red}{blue}{a}', false],
  ]) out.set(`X${s}`, [s, d]);
  return [...out.values()];
}

test('PARITY: every shipped formula typesets byte for byte as KaTeX in Node, and passes the check as it is', () => {
  const katex = require('../../../lib/plugins/math/vendor/katex/katex.min.js');
  const list = formulas();
  assert.ok(list.length >= 80, `only ${list.length} formulas found: the corpus moved, so this proves less than it did`);
  const differ = [];
  const refused = [];
  for (const output of ['htmlAndMathml', 'html', 'mathml']) {
    for (const [s, displayMode] of list) {
      const options = { displayMode, throwOnError: false, output, errorColor: 'var(--warn)' };
      const node = katex.renderToString(s, options);
      if (!wall.checkTypeset(node)) refused.push(`${output} ${s.slice(0, 50)}`);
      if (wall.renderToString(s, options) !== node) differ.push(`${output} ${s.slice(0, 50)}`);
    }
  }
  assert.deepEqual(refused, [], `${refused.length} typesets fail the check`);
  assert.deepEqual(differ, [], `${differ.length} of ${list.length * 3} typesets differ`);
});

test('SWEEP: every command in KaTeX\'s source, typeset in Node, passes the check as it is', () => {
  // So no formula is sent to the full sanitizer, which re-spells and can delete: the check must know all of KaTeX.
  const katex = require('../../../lib/plugins/math/vendor/katex/katex.min.js');
  const src = fs.readFileSync(path.join(ROOT, 'lib/plugins/math/vendor/katex/katex.min.js'), 'utf8');
  const names = [...new Set([...src.matchAll(/"(\\\\[A-Za-z]+)"/g)].map((m) => m[1].slice(1)))];
  assert.ok(names.length > 800, `only ${names.length} command names read from KaTeX's source`);
  const quiet = [console.log, console.warn];
  console.log = console.warn = () => {}; // KaTeX's \message and font-metric notes
  const refused = [];
  try {
    for (const n of names) {
      for (const f of [`${n}{a}{b}`, `x ${n} y`, `${n}{red}{a}`]) {
        for (const displayMode of [false, true]) {
          let html;
          try {
            html = katex.renderToString(f, { displayMode, throwOnError: false, output: 'htmlAndMathml', errorColor: 'var(--warn)' });
          } catch {
            continue;
          }
          if (!wall.checkTypeset(html)) refused.push(f);
        }
      }
    }
  } finally {
    [console.log, console.warn] = quiet;
  }
  assert.deepEqual(refused, [], `${refused.length} typesets fail the check`);
});

test('WALL: nothing of the host is reachable from inside', () => {
  const seen = JSON.parse(
    wall._insideWall(
      'JSON.stringify([typeof require, typeof process, typeof fetch, typeof setTimeout, typeof XMLHttpRequest, typeof importScripts, typeof Deno, typeof Bun, typeof WebAssembly, typeof katex])',
    ),
  );
  assert.deepEqual(seen, ['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'object']);
  assert.throws(() => wall._insideWall('import("fs")'), /./);
});

test('LIMITS: a runaway loop, unbounded memory and runaway recursion stop inside, and the next formula still typesets', () => {
  const after = () => assert.match(wall.renderToString('x^2', { throwOnError: false }), /class="katex"/);
  let t = Date.now();
  assert.throws(() => wall._insideWall('for (;;) {}'), /interrupted/);
  assert.ok(Date.now() - t < wall.TIME_LIMIT_MS + 3000, `the loop ran ${Date.now() - t} ms`);
  after();
  for (const grow of ['var a = []; for (;;) a.push(new ArrayBuffer(1024 * 1024));', 'var a = []; for (var i = 0; ; i++) a.push("x".repeat(1 << 20) + i);', '"x".repeat(2 ** 29).length']) {
    t = Date.now();
    assert.throws(() => wall._insideWall(grow), /out of memory/, grow);
    assert.ok(Date.now() - t < 5000, `${grow} took ${Date.now() - t} ms to stop`);
    after();
  }
  assert.throws(() => wall._insideWall('function f() { return f() + 1; } f();'), /stack overflow/);
  after();
  // Reading a result runs no code inside: a hostile getter or toJSON is still held to the time limit.
  for (const hostile of ['throw { get message() { for (;;) {} } }', 'var e = new Error("x"); Object.defineProperty(e, "message", { get() { for (;;) {} } }); throw e;', '({ toJSON() { for (;;) {} } })']) {
    t = Date.now();
    assert.throws(() => wall._insideWall(hostile), /./, hostile);
    assert.ok(Date.now() - t < wall.TIME_LIMIT_MS + 3000, `${hostile} held the host ${Date.now() - t} ms`);
    after();
  }
});

test('CHECK: refuses what KaTeX never emits; a refused result is sanitized instead', () => {
  const ok = wall.renderToString("f'(x) = \\frac{a}{b}", { throwOnError: false, output: 'htmlAndMathml' });
  assert.ok(wall.checkTypeset(ok));
  for (const bad of [
    `${ok}<img src=x onerror=alert(1)>`,
    `${ok}<script>alert(1)</script>`,
    '<span class="katex" onclick="x()">a</span>',
    '<span style="background:url(https://x/y)">a</span>',
    '<span style="color:red;background-image:image-set(\'https://x\' 1x)">a</span>',
    '<span style="color:\\72 ed">a</span>',
    '<a href="https://x">a</a>',
    '<math xmlns="http://www.w3.org/1999/xhtml"><mi>x</mi></math>',
    '<svg><foreignObject><span>a</span></foreignObject></svg>',
    '<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>',
    '<span><!-- a comment --></span>',
    '<svg><use href="#a"></use></svg>',
    '<span id="x">a</span>',
    '<span style="position:fixed;top:0;left:0;width:100%;height:100%;background-color:red">a</span>',
    '<span style="position: sticky">a</span>',
  ]) {
    assert.equal(wall.checkTypeset(bad), false, bad);
  }
  // MathML filed in the HTML namespace inside <mo> is accepted, so its accessible copy keeps its bytes.
  const bmod = wall.renderToString('a \\bmod b', { throwOnError: false, output: 'mathml' });
  assert.match(bmod, /<mo[^>]*><mrow><mi mathvariant="normal">m<\/mi>/);
  assert.equal(wall.finish(ok), ok, 'a clean typeset keeps its bytes');
  const cleaned = wall.finish(`${ok}<img src=x onerror=alert(1)><script>alert(2)</script>`);
  assert.doesNotMatch(cleaned, /onerror|<script|alert/);
  assert.match(cleaned, /class="katex"/);
});

test('ENGINE: the math plugin typesets through the wall, and KaTeX is never required into the process', () => {
  // A fresh process, so nothing this file required can stand in for what the engine loads.
  const probe = `const { renderTex } = require(${JSON.stringify(path.join(ROOT, 'lib/plugins/math/math.render.js'))});
const html = renderTex('\\\\int_0^1 x^2\\\\,dx', true);
const mod = require.cache[require.resolve(${JSON.stringify(path.join(ROOT, 'lib/plugins/math/math.render.js'))})];
process.stdout.write(JSON.stringify({ html, katexLoaded: Object.keys(require.cache).some((p) => p.endsWith('katex.min.js')), children: mod.children.map((c) => path.basename(c.id)) }));`;
  const r = spawnSync(process.execPath, ['-e', `const path = require('node:path');\n${probe}`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.katexLoaded, false, 'KaTeX was required into the process');
  assert.ok(out.children.includes('katex-wall.js'), `math.render.js does not require the wall: ${out.children}`);
  assert.equal(out.html, wall.renderToString('\\int_0^1 x^2\\,dx', { displayMode: true, throwOnError: false, output: 'htmlAndMathml', errorColor: 'var(--warn)' }));
});
