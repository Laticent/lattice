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
 * reader and the results must be identical, key for key and value for value —
 * with NO exception set at all since #1674, when the last sanctioned divergence
 * (`fontFamily`, forced by mermaid's directive sanitizer) was retired along with the
 * directive transport that caused it.
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
  textValueTokens,
  buildDiagramTheme,
  diagramThemeTokens,
} = require('../../../lib/core/mermaid-theme-map');
const { renderDiagrams } = require('../../../lib/core/render-diagrams');
const { diagramScopeKey } = require('../../../lib/core/diagram-scope');

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

// ── Both paths, through the shared kernel ───────────────────────────────────
//
// Since #1332 step 4 neither path ASSEMBLES a palette: `renderDiagrams` walks the
// deck, calls `buildDiagramTheme` from the one map, and hands the result to
// `renderOne`. So what remains to compare is each path's PORT — its token reader,
// its scope key, and the one `finishTheme` divergence — driven through the real
// kernel, with the same fake token values on both sides.

/** The PDF path: its scope IS the band, and its reader is a table lookup. */
function pdfThemeVars(readToken) {
  // lattice-emulator.js is a CLI that renders on require, so it cannot be imported.
  // Its port is three lines (`readBandToken` + `renderMermaidOne`) and reproducing
  // them here would test a copy — so instead: assert the real source still routes
  // through the kernel (below), and drive the kernel with the port shape that source
  // declares.
  let out;
  renderDiagrams([{ scope: 'light', diagrams: ['d'] }], {
    readToken: (_band, name) => readToken(name),
    renderOne: (_d, themeVars) => { out = themeVars; },
  });
  return out;
}

/**
 * The preview path: run the REAL palette port out of lib/runtime/index.js.
 *
 * The runtime is one big IIFE around a `document` guard, so requiring it in Node
 * yields nothing callable. Rather than paraphrase the port — which would test the
 * paraphrase — lift the actual source between its two sentinel comments and evaluate
 * it with the things it closes over (a fake DOM plus `diagramScopeKey`). Edit the port
 * to stop reading from the section, or to diverge on a second key, and these
 * assertions fail.
 *
 * What this does NOT prove: that a real browser's getComputedStyle behaves like the
 * fake DOM. It doesn't need to — the browser's job is the READER's mechanism, and the
 * half under test is everything the kernel does with it. The real-surface proof is a
 * Playground render, recorded on the PR (HARD RULE #23).
 */
function previewThemeVars(readToken, scopeEl = { className: 'content', getAttribute: () => null }) {
  const BEGIN = "  // ── BEGIN PALETTE PORT";
  const END = '  // ── END PALETTE PORT';
  const start = RUNTIME_SRC.indexOf(BEGIN);
  const end = RUNTIME_SRC.indexOf(END);
  assert.notEqual(start, -1, 'lib/runtime/index.js must still bracket its palette port with BEGIN PALETTE PORT');
  assert.notEqual(end, -1, 'lib/runtime/index.js must still bracket its palette port with END PALETTE PORT');
  const blockSrc = RUNTIME_SRC.slice(start, end);
  assert.match(blockSrc, /function openSectionReader\(scopeEl\)/,
    'the port must read from the SECTION it is handed — resolving one inside is the slide-1 bake');

  // The fake DOM: `getComputedStyle` answers raw token reads, the probe element answers
  // color reads. Both route to the same `readToken`, because on a real page they are
  // two ways of asking the browser the same question.
  const probeEl = {
    style: { cssText: '', _color: '', set color(v) { this._color = v; }, get color() { return this._color; } },
    parentNode: null,
  };
  scopeEl.appendChild = (el) => { el.parentNode = { removeChild: () => {} }; };
  const fakeDocument = {
    querySelector: () => scopeEl,
    documentElement: scopeEl,
    createElement: () => probeEl,
  };
  const fakeGetComputedStyle = (el) => {
    if (el === probeEl) {
      // Mirror the real probe: `color: var(--name)` resolves to the token value.
      const m = /^var\(--(.+)\)$/.exec(el.style.color || '');
      return { color: m ? readToken(m[1]) : 'rgba(0, 0, 0, 0)' };
    }
    return {
      getPropertyValue: (prop) => (prop.startsWith('--') ? readToken(prop.slice(2)) : ''),
      colorScheme: 'light',
    };
  };

  // biome-ignore lint/security/noGlobalEval: evaluating the SHIPPED source is the point — a paraphrase would test the paraphrase.
  const factory = eval(
    `(function (document, getComputedStyle, diagramScopeKey, TEXT_VALUE_TOKENS) {\n${blockSrc}\n  return diagramThemePorts;\n})`,
  );
  // `TEXT_VALUE_TOKENS` is one of the two things the lifted block closes over, and it is
  // load-bearing rather than incidental: it is what keeps a FONT STACK away from the
  // reader's color-resolving `read()`. Supplied from the map's real flags, so the fake
  // reader exercises the same branch the browser does.
  const ports = factory(fakeDocument, fakeGetComputedStyle, diagramScopeKey, textValueTokens())();
  let out;
  renderDiagrams([{ scope: scopeEl, diagrams: ['d'] }], {
    ...ports,
    renderOne: (_d, themeVars) => { out = themeVars; },
  });
  return out;
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
  test('both paths agree on EVERY key — there is no sanctioned divergence left', () => {
    const pdf = flatten(pdfThemeVars(fakeReadToken));
    const preview = flatten(previewThemeVars(fakeReadToken));

    assert.deepEqual(
      Object.keys(preview).sort(),
      Object.keys(pdf).sort(),
      'the two paths must expose the SAME themeVariables keys — a key on one path only is the #511 drift returning',
    );

    // NO EXCEPTION SET (#1674). This assertion used to skip `DIVERGENT_KEYS`, whose sole
    // entry was `fontFamily`: the export shipped its config inside a `%%{init}%%`
    // directive, mermaid's `sanitizeDirective` allow-list has no hyphen, and a real font
    // stack could not survive it — so the export bought a monospace stack and the two
    // paths were licensed to disagree. The export renders in an engine-owned page now
    // and configures Mermaid through `initialize`, so the constraint is gone and so is
    // the license. Comparing every key with no filter is the point: an exception set
    // that still existed, even empty, is how the next divergence arrives pre-authorized.
    const mismatches = Object.keys(pdf)
      .filter((k) => pdf[k] !== preview[k])
      .map((k) => `${k}: pdf=${JSON.stringify(pdf[k])} preview=${JSON.stringify(preview[k])}`);
    assert.deepEqual(mismatches, [], 'these keys resolve differently on the two render paths');
  });

  test('fontFamily follows --font-body on BOTH paths — the retired divergence', () => {
    // The specific key #1674 closed, pinned so a regression names itself rather than
    // showing up as an anonymous mismatch above.
    const pdf = flatten(pdfThemeVars(fakeReadToken));
    const preview = flatten(previewThemeVars(fakeReadToken));
    assert.equal(pdf.fontFamily, '#font-body');
    assert.equal(preview.fontFamily, '#font-body');
    // And the map really does read a TOKEN rather than carrying a literal — a literal
    // would tie both paths together at the wrong value and still pass the test above.
    // `text: true` marks it as a NON-COLOR value, which is what keeps the preview's
    // color-resolving `read()` off it — see the entry's own comment. Asserted here
    // because dropping the flag is silent: the export is unaffected and the preview only
    // misrenders the handful of labels our CSS does not already cover.
    assert.deepEqual(MERMAID_VAR_MAP.fontFamily, { var: 'font-body', text: true });
    assert.ok(textValueTokens().has('font-body'),
      'font-body must be reachable as a text-valued token, or the runtime port cannot '
      + 'know to fetch it with raw()');
  });

  test('the retired sanction is not quietly reintroduced', () => {
    // `DIVERGENT_KEYS` is gone from the module. Asserting its ABSENCE keeps the
    // retirement deliberate: re-exporting it — even as an empty list — would restore the
    // "some keys may differ" affordance this change removed.
    const map = require(path.join(REPO, 'lib', 'core', 'mermaid-theme-map.js'));
    assert.equal('DIVERGENT_KEYS' in map, false,
      'DIVERGENT_KEYS was retired in #1674 — a divergence that stops diverging is deleted, '
      + 'not left as a standing license. Re-adding one needs its own decision record.');
  });

  test('mutating ONE map entry breaks parity — the test is not vacuous', () => {
    const key = 'clusterBkg';
    const original = MERMAID_VAR_MAP[key];
    try {
      MERMAID_VAR_MAP[key] = { var: 'bg-alt' }; // the pre-#1311 wrong token
      const pdf = flatten(pdfThemeVars(fakeReadToken));
      const preview = flatten(previewThemeVars((n) => (n === 'bg-alt' ? '#DRIFTED' : fakeReadToken(n))));
      assert.notEqual(pdf[key], preview[key], 'a mutated entry must surface as a mismatch');
    } finally {
      MERMAID_VAR_MAP[key] = original;
    }
    // …and parity is restored once the mutation is undone.
    const pdf = flatten(pdfThemeVars(fakeReadToken));
    const preview = flatten(previewThemeVars(fakeReadToken));
    assert.equal(pdf[key], preview[key]);
  });

  test('mutating the SHARED map moves both paths together — neither holds a private copy', () => {
    const original = MERMAID_VAR_MAP.nodeBorder;
    try {
      MERMAID_VAR_MAP.nodeBorder = { literal: '#SENTINEL' };
      assert.equal(flatten(pdfThemeVars(fakeReadToken)).nodeBorder, '#SENTINEL');
      assert.equal(flatten(previewThemeVars(fakeReadToken)).nodeBorder, '#SENTINEL', 'the preview path is still reading a private copy');
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

  test('both real sources are DRIVEN BY the kernel, not merely importing from it', () => {
    // Since #1332 step 4 neither path calls `buildDiagramTheme` at all — the kernel
    // does, once per palette, and the paths supply ports. So the assertion moved with
    // it: what has to be true now is that each path hands its ports to
    // `renderDiagrams`. A path that went back to assembling its own palette would
    // still import the map and would still pass the old form of this test.
    assert.match(EMULATOR_SRC, /require\('\.\/lib\/core\/render-diagrams'\)/);
    assert.match(RUNTIME_SRC, /require\('\.\.\/\.\.\/lib\/core\/render-diagrams'\)/);
    assert.match(EMULATOR_SRC, /renderDiagrams\(deck, \{/);
    assert.match(RUNTIME_SRC, /renderDiagrams\(deck, \{/);
    assert.equal(/buildDiagramTheme\(/.test(RUNTIME_SRC), false,
      'lib/runtime/index.js assembles its own themeVariables — that is the kernel\'s job now, '
      + 'and a second assembly site is where the 38 drifted values came from');
    // The PDF path keeps EXACTLY ONE assembly site, and it is enumerated rather than
    // banned: the image-set cross-scheme look re-bake re-renders an already-placed
    // diagram out of a DIFFERENT theme file, so it has no band to name and cannot ride
    // the kernel's walk. A SECOND site is the drift returning.
    assert.equal((EMULATOR_SRC.match(/buildDiagramTheme\(/g) || []).length, 1,
      'the PDF path must keep exactly one palette-assembly site (resolveMermaidThemeVars, '
      + 'for the image-set look re-bake) — every other palette comes from the kernel');
    // The signature grew a `hand` argument in #1674 — the sketch re-point of
    // `--font-body`, which this path's OFFLINE reader cannot see in the cascade the way
    // the preview's `getComputedStyle` can. Match the shape loosely enough to survive
    // that, and tightly enough that the one assembly site still routes through the map.
    assert.match(EMULATOR_SRC, /function resolveMermaidThemeVars\(paletteVars[^)]*\) \{\n\s*return buildDiagramTheme\(/);
    assert.match(EMULATOR_SRC, /function themeVarsForBand\(band, hand = false\)/);
  });

  test('the runtime no longer points at the emulator for an explanation', () => {
    // The literal symptom #1332 names: a cross-file prose pointer where an
    // import belongs ("see the clusterBkg note in the emulator's MERMAID_VAR_MAP").
    assert.equal(/emulator's\s+MERMAID_VAR_MAP/.test(RUNTIME_SRC), false);
  });
});
