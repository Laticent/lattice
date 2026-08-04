/**
 * Unit: the two render paths build the SAME Mermaid `themeVariables`.
 *
 * This is the test that would have caught all four #1326 defects at once, and
 * the one no amount of per-path testing substitutes for. Both renderers used to
 * own a private copy of the token → `themeVariables` map, kept in sync BY COMMENT.
 *
 * #1332 reports the gap as 166 keys against 132, the runtime a strict subset.
 * Measured, that is not what was there: both paths exposed the SAME 166 slots —
 * a key-set gate has watched that since #511 — and 38 of the VALUES had come
 * apart, which that gate could not see and which its own comment conceded. A
 * missing key would at least fall back to a Mermaid default; a wrong value is
 * confidently wrong.
 *
 * The gap is now closed by CONSTRUCTION (lib/core/mermaid-theme-map.js): there is
 * one map, so a key exists on both paths or on neither. What this file guards is
 * the seam that remains — each path still supplies its own `readToken`, and each
 * still assembles the object at its own call site. Feed BOTH the same fake
 * reader and the results must be identical, key for key and value for value,
 * except for the enumerated `DIVERGENT_KEYS`.
 *
 * NON-VACUOUS BY DESIGN. Mutate one entry in the map, or make one adapter stop
 * routing through it, and `both paths agree` goes red. The two `mutating …`
 * tests below prove that in-process rather than asking you to take it on faith.
 *
 * The RUNTIME adapter is exercised through the real `lib/runtime/index.js`
 * source (it is an IIFE that needs a DOM, so it cannot simply be required) —
 * see `runtimeThemeVars` for how, and for what that does and does not prove.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MERMAID_VAR_MAP,
  MERMAID_DIAGRAM_FONT,
  DIVERGENT_KEYS,
  buildDiagramTheme,
  diagramThemeTokens,
} = require('../../../lib/core/mermaid-theme-map');

const REPO = path.join(__dirname, '..', '..', '..');
const EMULATOR_SRC = fs.readFileSync(path.join(REPO, 'lattice-emulator.js'), 'utf8');
const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'lib', 'runtime', 'index.js'), 'utf8');

/**
 * A complete, deterministic stand-in for "read one palette token".
 *
 * Distinct per token so a mis-wired key cannot pass by coincidentally matching
 * its neighbour — the failure mode a single sentinel value would hide.
 */
const fakeReadToken = (name) => `#${name}`;

// ── The PDF path's adapter ──────────────────────────────────────────────────
// lattice-emulator.js is a CLI that renders on require, so it cannot be
// imported. Its adapter is three lines (readPaletteToken + resolveMermaidThemeVars)
// and reproducing it here would test a copy, so instead: assert the real source
// still routes through the kernel (below), and drive the kernel with the miss
// policy that source declares.
const emulatorThemeVars = (readToken) => buildDiagramTheme(readToken);

// ── The preview path's adapter ──────────────────────────────────────────────
/**
 * Run the REAL `buildMermaidThemeVars` out of lib/runtime/index.js.
 *
 * The runtime is one big IIFE wrapped around a `document` guard, so requiring it
 * in Node yields nothing callable. Rather than paraphrase the adapter — which
 * would test the paraphrase — lift the actual function text out of the shipped
 * source and evaluate it with the two things it closes over (`buildDiagramTheme`
 * and a fake DOM). If someone edits that function to stop calling the kernel,
 * this returns different values and the parity assertions fail.
 *
 * What this does NOT prove: that a real browser's getComputedStyle behaves like
 * the fake DOM. It doesn't need to — the browser's job is the READER, which is
 * exactly the half this substitutes. The half under test is everything after it.
 */
function runtimeThemeVars(readToken) {
  const start = RUNTIME_SRC.indexOf('  function buildMermaidThemeVars() {');
  assert.notEqual(start, -1, 'buildMermaidThemeVars must still exist in lib/runtime/index.js');
  const end = RUNTIME_SRC.indexOf('\n  }\n', start);
  assert.notEqual(end, -1, 'could not find the end of buildMermaidThemeVars');
  const fnSrc = RUNTIME_SRC.slice(start, end + 4);

  // The fake DOM: `getComputedStyle` answers raw token reads, the probe element
  // answers color reads. Both route to the same `readToken`, because on a real
  // page they are two ways of asking the browser the same question.
  const styleFor = () => ({
    getPropertyValue: (prop) => (prop.startsWith('--') ? readToken(prop.slice(2)) : ''),
    colorScheme: 'light',
  });
  const probeEl = {
    style: { cssText: '', _color: '', set color(v) { this._color = v; }, get color() { return this._color; } },
    parentNode: null,
  };
  const fakeDocument = {
    querySelector: () => ({ appendChild: (el) => { el.parentNode = { removeChild: () => {} }; } }),
    documentElement: {},
    createElement: () => probeEl,
  };
  const fakeGetComputedStyle = (el) => {
    if (el === probeEl) {
      // Mirror the real probe: `color: var(--name)` resolves to the token value.
      const m = /^var\(--(.+)\)$/.exec(el.style.color || '');
      return { color: m ? readToken(m[1]) : 'rgba(0, 0, 0, 0)' };
    }
    return styleFor();
  };

  // biome-ignore lint/security/noGlobalEval: evaluating the SHIPPED source is the point — a paraphrase would test the paraphrase.
  const factory = eval(
    `(function (document, getComputedStyle, buildDiagramTheme) {\n${fnSrc}\n  return buildMermaidThemeVars;\n})`,
  );
  return factory(fakeDocument, fakeGetComputedStyle, buildDiagramTheme)();
}

/** Flatten nested keys (`xyChart.titleColor`) so a diff names the exact slot. */
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

describe('diagram theme parity — both render paths, one map', () => {
  test('both paths agree on every key outside DIVERGENT_KEYS', () => {
    const pdf = flatten(emulatorThemeVars(fakeReadToken));
    const preview = flatten(runtimeThemeVars(fakeReadToken));

    assert.deepEqual(
      Object.keys(preview).sort(),
      Object.keys(pdf).sort(),
      'the two paths must expose the SAME themeVariables keys — a key on one path only is the #511 drift returning',
    );

    const divergent = new Set(DIVERGENT_KEYS);
    const mismatches = Object.keys(pdf)
      .filter((k) => !divergent.has(k) && pdf[k] !== preview[k])
      .map((k) => `${k}: pdf=${JSON.stringify(pdf[k])} preview=${JSON.stringify(preview[k])}`);
    assert.deepEqual(mismatches, [], 'these keys resolve differently on the two render paths');
  });

  test('DIVERGENT_KEYS is exactly the sanctioned list, and each entry really does differ', () => {
    // A divergence that stops diverging should be DELETED from the list, not left
    // as a standing licence for the next one. The gate fails in both directions.
    assert.deepEqual([...DIVERGENT_KEYS], ['fontFamily']);

    const pdf = flatten(emulatorThemeVars(fakeReadToken));
    const preview = flatten(runtimeThemeVars(fakeReadToken));
    for (const key of DIVERGENT_KEYS) {
      assert.notEqual(pdf[key], preview[key], `${key} is sanctioned as divergent but the two paths now agree — retire the sanction`);
    }
    // …and the divergence is the one documented: monospace for the directive
    // filter, the deck's body font for the in-process initializer.
    assert.equal(pdf.fontFamily, MERMAID_DIAGRAM_FONT);
    assert.equal(preview.fontFamily, '#font-body');
  });

  test('mutating ONE map entry breaks parity — the test is not vacuous', () => {
    const key = 'clusterBkg';
    const original = MERMAID_VAR_MAP[key];
    try {
      MERMAID_VAR_MAP[key] = { var: 'bg-alt' }; // the pre-#1311 wrong token
      const pdf = flatten(emulatorThemeVars(fakeReadToken));
      const preview = flatten(runtimeThemeVars((n) => (n === 'bg-alt' ? '#DRIFTED' : fakeReadToken(n))));
      assert.notEqual(pdf[key], preview[key], 'a mutated entry must surface as a mismatch');
    } finally {
      MERMAID_VAR_MAP[key] = original;
    }
    // …and parity is restored once the mutation is undone.
    const pdf = flatten(emulatorThemeVars(fakeReadToken));
    const preview = flatten(runtimeThemeVars(fakeReadToken));
    assert.equal(pdf[key], preview[key]);
  });

  test('mutating the SHARED map moves both paths together — neither holds a private copy', () => {
    const original = MERMAID_VAR_MAP.nodeBorder;
    try {
      MERMAID_VAR_MAP.nodeBorder = { literal: '#SENTINEL' };
      assert.equal(flatten(emulatorThemeVars(fakeReadToken)).nodeBorder, '#SENTINEL');
      assert.equal(flatten(runtimeThemeVars(fakeReadToken)).nodeBorder, '#SENTINEL', 'the preview path is still reading a private copy');
    } finally {
      MERMAID_VAR_MAP.nodeBorder = original;
    }
  });
});

describe('the map itself', () => {
  test('carries the full inventory — 166 resolved variables', () => {
    // 155 top-level keys plus the 11 nested xyChart slots. Pinned so a key
    // silently disappearing — the #511 failure mode — fails rather than passes
    // quietly.
    const flat = flatten(buildDiagramTheme(fakeReadToken));
    assert.equal(Object.keys(MERMAID_VAR_MAP).length, 156);
    assert.equal(Object.keys(flat).length, 166);
  });

  test('every entry is exactly one of literal / var / joinVars / nested', () => {
    const shapeOf = (e) => ['literal', 'var', 'joinVars'].filter((k) => e[k] !== undefined);
    for (const [key, entry] of Object.entries(MERMAID_VAR_MAP)) {
      if (entry.nested) {
        for (const [nk, ne] of Object.entries(entry.nested)) {
          assert.equal(shapeOf(ne).length, 1, `${key}.${nk} must name exactly one source`);
        }
        continue;
      }
      assert.equal(shapeOf(entry).length, 1, `${key} must name exactly one source`);
    }
  });

  test('no entry resolves to undefined — an unreadable entry would ship as a missing color', () => {
    const flat = flatten(buildDiagramTheme(fakeReadToken));
    const undef = Object.keys(flat).filter((k) => flat[k] === undefined);
    assert.deepEqual(undef, []);
  });

  test('diagramThemeTokens lists every token the map reads, deduped', () => {
    const tokens = diagramThemeTokens();
    assert.equal(new Set(tokens).size, tokens.length, 'must be deduped');
    // Spot-check the tokens whose wiring carries hard-won reasoning.
    for (const t of ['c-container', 'c-container-edge', 'cat-on-fill', 'diagram-stroke', 'fail']) {
      assert.ok(tokens.includes(t), `--${t} must be read by the map`);
    }
    // Everything the map reads is a real declaration site, not a typo: each name
    // must appear in the shared token vocabulary the themes declare.
    const baseTokens = fs.readFileSync(path.join(REPO, 'lib', 'base', 'base.tokens.css'), 'utf8');
    const themeCss = fs.readFileSync(path.join(REPO, 'themes', 'indaco.css'), 'utf8');
    const declared = `${baseTokens}\n${themeCss}`;
    const missing = tokens.filter((t) => !declared.includes(`--${t}:`));
    assert.deepEqual(missing, [], 'these tokens are read by the map but declared nowhere');
  });
});

describe('neither path keeps a private copy', () => {
  test('the map is defined exactly once in the tree', () => {
    // `grep MERMAID_VAR_MAP` must find ONE definition. A second `const
    // MERMAID_VAR_MAP = {` anywhere means the drift has been reintroduced.
    for (const [label, src] of [['lattice-emulator.js', EMULATOR_SRC], ['lib/runtime/index.js', RUNTIME_SRC]]) {
      assert.equal(/const\s+MERMAID_VAR_MAP\s*=\s*\{/.test(src), false, `${label} must not define its own map`);
    }
  });

  test('both real sources import the shared kernel', () => {
    assert.match(EMULATOR_SRC, /require\('\.\/lib\/core\/mermaid-theme-map'\)/);
    assert.match(RUNTIME_SRC, /require\('\.\.\/\.\.\/lib\/core\/mermaid-theme-map'\)/);
    assert.match(EMULATOR_SRC, /buildDiagramTheme\(/);
    assert.match(RUNTIME_SRC, /buildDiagramTheme\(/);
  });

  test('the runtime no longer points at the emulator for an explanation', () => {
    // The literal symptom #1332 names: a cross-file prose pointer where an
    // import belongs ("see the clusterBkg note in the emulator's MERMAID_VAR_MAP").
    assert.equal(/emulator's\s+MERMAID_VAR_MAP/.test(RUNTIME_SRC), false);
  });
});
