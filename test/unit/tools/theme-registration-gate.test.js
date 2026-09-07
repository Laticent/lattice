/**
 * `checkThemeRegistrationCallSites` — the gate that keeps theme registrations from
 * handing the store a stylesheet without its name.
 *
 * WHY THIS FILE EXISTS. The gate's shape-matching helper was rewritten three times
 * in one session and was wrong after each rewrite — a nameless object, a nested
 * map, a first-`return`-only scan, a fall-through path, an `async` callback — and
 * every one was found by a human/agent reading it, because NOTHING tested it. A
 * gate with no test is a claim, and this one kept being false while
 * `check:ownership` reported OK.
 *
 * So: every shape that must fire, every shape that must NOT, asserted against the
 * real gate over a scratch tree. See
 * engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkThemeRegistrationCallSites } = require('../../../tools/check-ownership.js');

// THE PROBE LIVES OUTSIDE THE REPO. It used to be written to
// `tools/__gate-probe-<pid>.mjs` in the real tree, because the gate walked fixed roots
// under `ROOT` and a probe had to be inside one of them. Two things went wrong with that
// and both were observed (#2117): `node --test` runs files concurrently, so a probe
// present for this suite is walked by every other check scanning `tools/`; and a `finally`
// does not run on SIGINT, so a Ctrl-C left one behind — one survived long enough for the
// docs generator to pick it up and commit it into `engineering/capabilities.md` as a real
// tool row. The gate now accepts a root, the way `checkPreviewHtmlSinks` already did, so
// the scratch tree this file's header always claimed is now real.
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-reg-gate-'));
const SCRATCH_ROOTS = ['tools'];
fs.mkdirSync(path.join(SCRATCH, 'tools'), { recursive: true });
const PROBE = path.join(SCRATCH, 'tools', '__gate-probe.mjs');

/** Run the real gate with `src` as a probe file; return the errors naming it. */
function gate(src) {
  fs.writeFileSync(PROBE, src);
  try {
    const errors = [];
    // No sanctions: the scratch tree contains only the probe, so the gate's stale-entry
    // arm would otherwise report every real sanction as stale.
    checkThemeRegistrationCallSites(errors, SCRATCH, SCRATCH_ROOTS, []);
    return errors.filter((e) => e.includes(path.basename(PROBE)));
  } finally {
    fs.rmSync(PROBE, { force: true });
  }
}

const fires = (src) => gate(src).length > 0;

describe('shapes that MUST be reported', () => {
  // Each of these ends in `themes.add` receiving a stylesheet with no name, which
  // falls back to regexing `@theme` out of the sheet — and on a sheet without one,
  // registers nothing while returning a `false` no caller checks.
  const bad = {
    'bare css': 'e.addThemes([css]);',
    'identifier element': 'e.addThemes([a, b]);',
    'non-inline array': 'const l = [css]; e.addThemes(l);',
    'spread of a plain array': 'e.addThemes([...[css]]);',
    'map to bare value': 'e.addThemes([...xs.map((x) => x)]);',
    'map to a nameless object': 'e.addThemes([...xs.map((x) => ({ css: x }))]);',
    'map to an empty object': 'e.addThemes([...xs.map(() => ({}))]);',
    'nested map (spreads arrays)': 'e.addThemes([...xs.map((x) => ys.map((y) => ({ name: y, css: x })))]);',
    'later bare return': 'e.addThemes([...xs.map((x) => { if (x) return { name: x, css: x }; return x; })]);',
    'FALL-THROUGH path': 'e.addThemes([...xs.map((x) => { if (x.ok) { return { name: x.n, css: x.c }; } })]);',
    'async callback (Promises)': 'e.addThemes([...xs.map(async (x) => ({ name: x, css: x }))]);',
    'generator callback': 'e.addThemes([...xs.map(function* (x) { yield { name: x, css: x }; })]);',
    'map with a named fn': 'e.addThemes([...xs.map(toEntry)]);',
    'raw store, one argument': 'e.themes.add(css);',
  };
  for (const [label, src] of Object.entries(bad)) {
    test(`fires: ${label}`, () => {
      assert.equal(fires(`export function p(e, css, xs, ys, a, b, toEntry) { ${src} }\n`), true,
        `the gate did NOT report: ${src}`);
    });
  }
});

describe('shapes that must NOT be reported', () => {
  // A gate that fires on correct code pushes legitimate call sites onto the sanction
  // list, which is how an allowlist stops meaning anything.
  const good = {
    'inline named entries': 'e.addThemes([{ name: n, css }]);',
    'shorthand name': 'e.addThemes([{ name, css }]);',
    'quoted key': "e.addThemes([{ 'name': n, css }]);",
    'the repo\'s own chain spread': 'e.addThemes([...chain.map((n, i) => ({ name: n, css: read(files[i]) }))]);',
    'block body ending in a named return': 'e.addThemes([...xs.map((x) => { const c = read(x); return { name: x, css: c }; })]);',
    'a method inside the callback': 'e.addThemes([...xs.map((x) => { const o = { m() { return x; } }; return { name: x, css: o }; })]);',
    'a getter inside the callback': 'e.addThemes([...xs.map((x) => { const o = { get g() { return x; } }; return { name: x, css: o }; })]);',
    'a class inside the callback': 'e.addThemes([...xs.map((x) => { class C { g() { return x; } } return { name: x, css: C }; })]);',
    'an IIFE inside the callback': 'e.addThemes([...xs.map((x) => { const v = (function () { return x; })(); return { name: x, css: v }; })]);',
    'a forwarded parameter': 'e.addThemes(list);',
    'raw store, named': 'e.themes.add(n, css);',
    'no registration at all': 'return xs.map((x) => x.css);',
  };
  for (const [label, src] of Object.entries(good)) {
    test(`silent: ${label}`, () => {
      const found = gate(`export function p(e, css, xs, chain, files, read, list, n, name) { ${src} }\n`);
      assert.deepEqual(found, [], `the gate wrongly reported: ${src}`);
    });
  }
});

describe('the gate reads code, not prose', () => {
  test('a docblock quoting the legacy form does not fire', () => {
    // The first implementation scrubbed text instead of parsing, and fired on the
    // very documentation that explains how to satisfy it — including its own error
    // message. A regex literal containing a quote also blinded it to real call sites.
    const src = [
      'const CLASS_ATTR = /(?:^|\\s)class="([^"]*)"/;',
      'const APOS = /[\']/g;',
      '/**',
      " * Marp's legacy form: addThemes([cssText]) recovers the name from @theme.",
      ' */',
      'export function p(e, n, css) { e.addThemes([{ name: n, css }]); }',
      'export const RE = { CLASS_ATTR, APOS };',
    ].join('\n');
    assert.deepEqual(gate(`${src}\n`), []);
  });

  test('a real call site AFTER a quote-bearing regex is still seen', () => {
    // The exact blindness the scrubber had: the regex opened a phantom string that
    // blanked everything after it, including a genuine violation.
    const src = [
      'const CLASS_ATTR = /(?:^|\\s)class="([^"]*)"/;',
      'export function p(e, css) { e.addThemes([css]); }',
    ].join('\n');
    assert.equal(fires(`${src}\n`), true);
  });
});

after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));
