/**
 * Unit: the PREVIEW path bakes a diagram's ink for ITS OWN slide (#1332 step 3).
 *
 * THE BUG THIS PINS. The palette builder used to resolve its own scope —
 * `document.querySelector('section')`, always slide 1 — and `mermaid.initialize`
 * ran behind a `__llMermaidConfigured` one-shot. So a deck whose first slide is
 * light baked LIGHT node ink into every diagram in the deck, including slide 9's
 * `_class: dark` one. The chip is per-section CSS and the ink is baked, so that
 * was the last surviving instance of the #1326 bug class: ink and chip describing
 * two different slides. Measured in a real marp-cli render at 17.14:1 → 1.55:1.
 *
 * WHAT IS AND IS NOT TESTED HERE. This file exercises the WIRING: that the palette
 * is read from the section it is handed, that two differently-classed sections get
 * two different palettes, and that the SVG cache cannot serve one slide's baked ink
 * to another. It does NOT prove a browser's `getComputedStyle` behaves like the fake
 * DOM below — nothing in Node can, and claiming otherwise is what HARD RULE #23
 * exists to stop. The real-surface proof is a Playground render of a light-slide-1 /
 * dark-slide-2 deck, recorded in the PR.
 *
 * The runtime is one big IIFE around a `document` guard, so requiring it in Node
 * yields nothing callable. Rather than paraphrase the code under test — which would
 * test the paraphrase — the SHIPPED source of its palette port is lifted out between
 * two sentinel comments and driven through the REAL kernel, exactly as
 * test/unit/core/diagram-theme-parity.test.js does.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SCOPE_KEY_NONE,
  diagramScopeKey,
  diagramCacheKey,
  groupDiagramsBySlide,
} = require('../../../lib/core/diagram-scope');
const { renderDiagrams } = require('../../../lib/core/render-diagrams');

const REPO = path.join(__dirname, '..', '..', '..');
const RUNTIME_PATH = path.join(REPO, 'lib', 'runtime', 'index.js');
const RUNTIME_SRC = fs.readFileSync(RUNTIME_PATH, 'utf8');

/**
 * Lift the REAL palette port out of the shipped runtime and drive it through the real
 * kernel with a fake DOM whose token values depend on WHICH element is being read —
 * the one property a slide-1-only reader cannot satisfy.
 *
 * `tokensBySection` maps a fake section object to its token table.
 */
function liftPreviewBuild(tokensBySection, fallbackSection, captured = {}) {
  const BEGIN = "  // ── BEGIN PALETTE PORT";
  const END = '  // ── END PALETTE PORT';
  const start = RUNTIME_SRC.indexOf(BEGIN);
  const end = RUNTIME_SRC.indexOf(END);
  assert.notEqual(start, -1, 'lib/runtime/index.js must bracket its palette port with BEGIN PALETTE PORT');
  assert.notEqual(end, -1, 'lib/runtime/index.js must bracket its palette port with END PALETTE PORT');
  const blockSrc = RUNTIME_SRC.slice(start, end);
  assert.match(blockSrc, /function openSectionReader\(scopeEl\)/,
    'the reader must take the SECTION as a parameter (#1332 step 3) — resolving one inside '
    + 'is the slide-1 bake bug');

  const probeEl = {
    style: { cssText: '', _color: '', set color(v) { this._color = v; }, get color() { return this._color; } },
    parentNode: null,
    // Which section the probe is currently parented to. The real probe is appended to
    // the section, so it inherits that section's cascade — that inheritance is the
    // mechanism under test, so the fake has to model it.
    host: null,
  };
  const attach = (section) => (el) => {
    el.host = section;
    el.parentNode = { removeChild: () => { el.host = null; } };
  };
  for (const section of tokensBySection.keys()) section.appendChild = attach(section);

  const fakeDocument = {
    querySelector: () => fallbackSection ?? null,
    documentElement: { appendChild: attach(null), className: '', getAttribute: () => null },
    createElement: () => probeEl,
  };
  const read = (section, name) => tokensBySection.get(section)?.[name] ?? '';
  const fakeGetComputedStyle = (el) => {
    if (el === probeEl) {
      const m = /^var\(--(.+)\)$/.exec(el.style.color || '');
      return { color: m ? read(el.host, m[1]) : 'rgba(0, 0, 0, 0)' };
    }
    return {
      getPropertyValue: (prop) => (prop.startsWith('--') ? read(el, prop.slice(2)) : ''),
      colorScheme: 'light',
    };
  };

  // The block declares `closeSectionReaders` alongside the ports; return both so a
  // caller can drive teardown. `TEXT_VALUE_TOKENS` is the third thing it closes over:
  // the NON-COLOR tokens the port must fetch with `raw()` rather than the
  // color-resolving `read()`. Supplied from the map's real flags, so this drives the
  // same branch a browser does.
  // biome-ignore lint/security/noGlobalEval: evaluating the SHIPPED source is the point — a paraphrase would test the paraphrase.
  const factoryOut = eval(
    `(function (document, getComputedStyle, diagramScopeKey, TEXT_VALUE_TOKENS) {\n${blockSrc}\n  return { diagramThemePorts, closeSectionReaders };\n})`,
  )(fakeDocument, fakeGetComputedStyle, diagramScopeKey,
    require('../../../lib/core/mermaid-theme-map').textValueTokens());
  captured.probeEl = probeEl;
  captured.close = factoryOut.closeSectionReaders;
  const ports = factoryOut.diagramThemePorts();
  /** The palette one section resolves, through the real kernel. */
  return (sectionEl) => {
    let out;
    renderDiagrams([{ scope: sectionEl, diagrams: ['d'] }], {
      ...ports,
      renderOne: (_d, themeVars) => { out = themeVars; },
    });
    return out;
  };
}

/**
 * As `liftPreviewBuild`, but hands back the probe element and the port's own
 * `closeSectionReaders` so teardown can be asserted rather than regex-matched.
 */
function liftPreviewBuildWithProbe(tokensBySection, fallbackSection) {
  const captured = {};
  const build = liftPreviewBuild(tokensBySection, fallbackSection, captured);
  return { build, get probe() { return captured.probeEl; }, close: () => captured.close() };
}

// Two slides of one deck: slide 1 light, slide 2 `_class: dark`. The tokens differ
// only in the two that actually flip — enough to tell the palettes apart.
const LIGHT_TOKENS = { 'cat-on-fill': '#0A1628', 'text-heading': '#0A1628', bg: '#FAF7F2', 'font-body': 'Outfit' };
const DARK_TOKENS = { 'cat-on-fill': '#F5F1EA', 'text-heading': '#F5F1EA', bg: '#15110D', 'font-body': 'Outfit' };

function twoSlideDeck() {
  const slide1 = { className: 'content', getAttribute: () => null };
  const slide2 = { className: 'content dark', getAttribute: () => null };
  const tokens = new Map([[slide1, LIGHT_TOKENS], [slide2, DARK_TOKENS]]);
  return { slide1, slide2, tokens };
}

describe('the preview reads the palette from the slide it is rendering', () => {
  test('two sections of one deck resolve DIFFERENT ink — the slide-1 bake is gone', () => {
    const { slide1, slide2, tokens } = twoSlideDeck();
    const build = liftPreviewBuild(tokens, slide1);

    const light = build(slide1);
    const dark = build(slide2);

    // primaryTextColor is CHIP-SITED (--cat-on-fill) and textColor is CANVAS-SITED
    // (--text-heading); both flip with the slide's band, and both used to come from
    // slide 1 for the entire deck.
    assert.equal(light.primaryTextColor, '#0A1628');
    assert.equal(dark.primaryTextColor, '#F5F1EA',
      "slide 2's diagram was baked with slide 1's ink — this is #1332 step 3 regressing, "
      + 'and in a real render it is white-on-white or black-on-black node labels');
    assert.equal(light.textColor, '#0A1628');
    assert.equal(dark.textColor, '#F5F1EA');
    assert.equal(light.background, '#FAF7F2');
    assert.equal(dark.background, '#15110D');
  });

  test('the probe resolves against the SECTION, not the document — light-dark() follows the slide', () => {
    // The `vc` reader sets `color: var(--token)` on a probe APPENDED TO THE SECTION,
    // so the browser collapses light-dark() on that slide's color-scheme. A probe
    // parented anywhere else resolves the wrong arm, which on a `_class: dark` slide
    // is the whole bug. The fake models parentage for exactly this reason: the token
    // table it reads is chosen by the probe's host, so a value can only arrive here
    // if the probe was attached to the right section.
    const slide1 = { className: 'content', getAttribute: () => null };
    const slide2 = { className: 'content dark', getAttribute: () => null };
    const tokens = new Map([
      [slide1, { ...LIGHT_TOKENS, 'cat-1-fill': '#EFE7DA' }],
      [slide2, { ...DARK_TOKENS, 'cat-1-fill': '#2A231C' }],
    ]);
    const build = liftPreviewBuild(tokens, slide1);
    assert.equal(build(slide1).primaryColor, '#EFE7DA');
    assert.equal(build(slide2).primaryColor, '#2A231C',
      'the node FILL is baked too, so it has to follow the slide alongside the ink — a '
      + 'dark-arm ink on a light-arm fill is the #1323 vanishing-label pair');
  });

  test('a token the palette never declares reads empty, not a black sentinel', () => {
    // The MISS POLICY is this path's half of the port and it is load-bearing: the PDF
    // path warns and substitutes #000000 so a palette gap is loud in the build log,
    // while the preview must return '' and fall through to the rAF retry budget.
    // Substituting black here would paint an entire deck's diagrams black on a webview
    // that is merely slow to apply its stylesheet.
    const slide1 = { className: 'content', getAttribute: () => null };
    const build = liftPreviewBuild(new Map([[slide1, LIGHT_TOKENS]]), slide1);
    assert.equal(build(slide1).primaryColor, '');
  });

  test('handed nothing, it falls back to the document rather than throwing', () => {
    // A fence outside any <section> is not a crash. The fallback reads whatever the
    // document offers and, on a webview that has not applied the stylesheet, that is
    // empty — which is what the rAF retry budget is for.
    const { slide1, tokens } = twoSlideDeck();
    const build = liftPreviewBuild(tokens, slide1);
    assert.equal(build(undefined).primaryTextColor, '#0A1628');
    assert.doesNotThrow(() => build(null));
  });

  test('the probe is torn down after the walk — no orphan <span> is left in a slide', () => {
    // Each reader holds a live probe element inside the section it reads. Leaking one per
    // palette per keystroke would grow the DOM without bound in a live preview. Asserted
    // on the PROBE, not on the source: the fake DOM models parentage, so closing it is
    // observable and an earlier version of this test that only regex-matched
    // `closeSectionReaders()` could not have failed for a leak.
    const { slide1, slide2, tokens } = twoSlideDeck();
    const built = liftPreviewBuildWithProbe(tokens, slide1);
    built.build(slide1);
    built.build(slide2);
    assert.notEqual(built.probe.host, undefined);
    built.close();
    assert.equal(built.probe.host, null,
      'every reader must be closed after the walk — a probe left parented to a section is '
      + 'an orphan <span> inside a slide, one per palette per keystroke');
  });
});

describe('the scope key groups slides by cascade context, and nothing more', () => {
  test('a per-slide color-mode token changes the key; token ORDER does not', () => {
    const el = (cls, style) => ({ className: cls, getAttribute: () => style ?? null });
    assert.notEqual(diagramScopeKey(el('content')), diagramScopeKey(el('content dark')),
      'a `_class: dark` slide must not share a palette group with a light one');
    assert.equal(diagramScopeKey(el('content dark')), diagramScopeKey(el('dark content')),
      'class ORDER is not a cascade difference — two spellings of one slide must share '
      + 'a group, or the deck reconfigures mermaid for every permutation');
    assert.equal(diagramScopeKey(el('  content   dark ')), diagramScopeKey(el('content dark')),
      'whitespace is not a cascade difference either');
  });

  test('an inline style is part of the key — a per-slide directive can move a token', () => {
    const el = (cls, style) => ({ className: cls, getAttribute: () => style ?? null });
    assert.notEqual(
      diagramScopeKey(el('content', '--bg:#000')),
      diagramScopeKey(el('content')),
      'a per-slide directive that writes an inline custom property changes what the slide '
      + 'resolves, so it must not reuse the un-styled group',
    );
  });

  test('the class/style halves cannot alias each other', () => {
    const el = (cls, style) => ({ className: cls, getAttribute: () => style ?? null });
    // With a SPACE separator, `class="a b" style=""` and `class="a" style="b"` collide.
    // A colliding key hands one slide another slide's baked ink — the bug itself.
    assert.notEqual(diagramScopeKey(el('a b', '')), diagramScopeKey(el('a', 'b')));
  });

  test('no section at all is its own key, not an empty-class slide', () => {
    assert.equal(diagramScopeKey(null), SCOPE_KEY_NONE);
    assert.equal(diagramScopeKey(undefined), SCOPE_KEY_NONE);
    assert.notEqual(diagramScopeKey({ className: '', getAttribute: () => null }), SCOPE_KEY_NONE);
  });

  test('a non-string className does not silently collapse the deck into one group', () => {
    // `className` is an SVGAnimatedString on SVG-namespaced elements. Stringifying one
    // yields "[object SVGAnimatedString]" for EVERY slide — i.e. the pre-fix behavior,
    // restored by accident and invisible.
    const svgish = { className: { baseVal: 'content dark' }, getAttribute: () => null };
    assert.equal(diagramScopeKey(svgish), diagramScopeKey({ className: '', getAttribute: () => null }));
  });
});

describe('the SVG cache cannot serve one slide the other slide\'s ink', () => {
  test('the same source under two scopes is two cache entries', () => {
    const source = 'flowchart LR\n  A --> B';
    const light = diagramCacheKey('content', source);
    const dark = diagramCacheKey('content dark', source);
    assert.notEqual(light, dark,
      'a source-only cache key was sound only while the whole deck baked from one palette; '
      + 'per-slide ink makes it hand slide 2 slide 1\'s SVG');
    // …and the same pair is stable, so an unchanged deck still hits the cache and a
    // keystroke does not re-render every diagram.
    assert.equal(diagramCacheKey('content', source), light);
  });

  test('scope and source cannot alias across the join', () => {
    assert.notEqual(diagramCacheKey('a', 'b c'), diagramCacheKey('a b', 'c'));
  });
});

describe('which slide does a diagram belong to', () => {
  // THE DECISION THE WHOLE PER-SLIDE BAKE RESTS ON, and until it moved into the kernel
  // the only thing gating it was a source-text match. An independent review proved the
  // hole: collapsing the grouping to one entry — i.e. restoring the slide-1 bake —
  // passed every regex the tests had. These fail on that mutation.
  const fence = (sectionEl, id) => ({ sectionEl, id });

  test('two sections are two slides, even when their classes are identical', () => {
    const a = { className: 'diagram', getAttribute: () => null };
    const b = { className: 'diagram', getAttribute: () => null };
    const deck = groupDiagramsBySlide([fence(a, 1), fence(b, 2)]);
    assert.equal(deck.length, 2,
      'two DIFFERENT sections are two slides whatever their classes say — collapsing them '
      + 'is exactly the deck-wide bake #1332 step 3 removed');
    assert.equal(deck[0].scope, a);
    assert.equal(deck[1].scope, b);
  });

  test('two fences on ONE section are one slide', () => {
    const a = { className: 'diagram', getAttribute: () => null };
    const deck = groupDiagramsBySlide([fence(a, 1), fence(a, 2)]);
    assert.equal(deck.length, 1, 'one slide, so one palette build and one run');
    assert.deepEqual(deck[0].diagrams.map((d) => d.id), [1, 2]);
  });

  test('document order is preserved, and a section revisited later is a new entry', () => {
    // The kernel coalesces CONSECUTIVE runs, so the grouping must not reorder: a deck
    // whose entries came back sorted would render slide 3 before slide 2.
    const a = { className: 'x', getAttribute: () => null };
    const b = { className: 'y', getAttribute: () => null };
    const deck = groupDiagramsBySlide([fence(a, 1), fence(b, 2), fence(a, 3)]);
    assert.deepEqual(deck.map((s) => s.diagrams.map((d) => d.id)), [[1], [2], [3]]);
  });

  test('a fence outside any section is its own slide, not folded into the previous one', () => {
    const a = { className: 'x', getAttribute: () => null };
    const deck = groupDiagramsBySlide([fence(a, 1), fence(null, 2)]);
    assert.equal(deck.length, 2);
    assert.equal(deck[1].scope, null);
    // …and two consecutive section-less fences share one entry, since they share a scope.
    assert.equal(groupDiagramsBySlide([fence(null, 1), fence(null, 2)]).length, 1);
  });

  test('an empty fence list is an empty deck', () => {
    for (const input of [[], null, undefined]) assert.deepEqual(groupDiagramsBySlide(input), []);
  });

  test('the runtime gets its deck from the kernel, not from an inline loop', () => {
    assert.match(RUNTIME_SRC, /const deck = groupDiagramsBySlide\(fences\);/,
      'the grouping must come from the shared, behaviorally-tested kernel');
  });
});

describe('a failed walk is retried, not stuck', () => {
  test('a throw hands every in-flight fence back to `pending`', () => {
    // Fences are stamped `rendering` BEFORE the kernel walk, and the pending-fence
    // selector only picks up `pending` — so a throw mid-walk would be PERMANENT: those
    // slides sit blank for the session with nothing to retry them. Asserted on the
    // shipped source because the surrounding function needs a whole live preview to
    // drive; the reset itself is three lines and its absence is the whole bug.
    assert.match(RUNTIME_SRC, /if \(job\.preEl\.dataset\.mermaidState === 'rendering'\) job\.preEl\.dataset\.mermaidState = 'pending';/,
      'a throw in the diagram walk must return in-flight fences to `pending` so the next '
      + 'scheduled pass retries them');
    // …and so must a throw inside the QUEUE LINK (a `mermaid.initialize` failure), which
    // used to be swallowed by a bare `.catch(() => {})` — leaving that run's diagrams
    // blank for the session with no diagnostic.
    assert.match(RUNTIME_SRC, /if \(preEl\.dataset\.mermaidState === 'rendering'\) preEl\.dataset\.mermaidState = 'pending';/,
      'a failed RUN must return its fences to `pending` too');
    assert.equal(/\.catch\(\(\) => \{\}\)\n\s*\.then\(pinMermaidTooltip\)/.test(RUNTIME_SRC), false,
      'a bare swallow on the run link strands every fence in that run');
    // …and the probes still come down on that path.
    assert.match(RUNTIME_SRC, /} finally \{[\s\S]{0,400}?closeSectionReaders\(\);/);
  });
});

describe('the one-shot global config is gone', () => {
  test('nothing latches mermaid config for the whole document any more', () => {
    // The ASSIGNMENT and the READ, not the name: the file may still explain what the
    // flag was and why it went, which is the history a future reader needs.
    assert.equal(/__llMermaidConfigured\s*(=[^=]|\))/.test(RUNTIME_SRC), false,
      'the `__llMermaidConfigured` one-shot IS the slide-1 bake: it locks slide 1\'s '
      + 'themeVariables in for every later diagram (#1332 step 3)');
    assert.equal(/if\s*\(\s*globalScope\.__llMermaidConfigured\s*\)/.test(RUNTIME_SRC), false,
      'a read of the retired one-shot would gate configuration on "have we ever configured"');
    // The theme-READINESS latch is a different question and stays: an unapplied
    // stylesheet is document-wide, so probing it once is correct.
    assert.match(RUNTIME_SRC, /__llMermaidThemeSettled/);
  });

  test('the config is applied per scope, and the renders are ordered against it', () => {
    // `mermaid.initialize` is global and `mermaid.render` takes no config, so
    // configure→render→configure is only correct if the renders in between are not
    // interleaved. Both halves have to be present: a per-scope configure dispatched
    // into concurrent renders would let a diagram read the NEXT band's palette.
    assert.match(RUNTIME_SRC, /function configureForScope\(mermaid, themeVars[,)]/);
    // The skip-guard compares the PALETTE by identity, not the scope NAME. A name does
    // not imply a palette across passes — a first pass under `force` with the theme CSS
    // unresolved, or a host palette switch that changes no section class, both rebuild
    // the same key to different values — and keying on the name would skip `initialize`
    // and keep the stale palette.
    assert.match(RUNTIME_SRC, /mermaidConfiguredVars === themeVars/);
    assert.match(RUNTIME_SRC, /mermaidConfiguredVars = themeVars;/);
    assert.equal(/mermaidConfiguredScope/.test(RUNTIME_SRC), false,
      'guarding on the scope KEY lets a rebuilt palette be discarded');
    assert.match(RUNTIME_SRC, /diagramQueue = diagramQueue/);
    // The kernel's run boundary is what triggers the reconfigure, and the run's renders
    // are collected into the SAME queue link — so band B's initialize cannot land
    // between band A's renders.
    assert.match(RUNTIME_SRC, /beginRun: \(\{[^}]*themeVars[^}]*\}\) => beginDiagramRun\(/);
    // allSettled, not all — `Promise.all` settles on the first rejection, which would
    // hand the NEXT band's `initialize` a run that is still in flight. Behaviorally gated
    // in test/unit/runtime/diagram-queue.test.js.
    assert.match(RUNTIME_SRC, /Promise\.allSettled\(jobs\.map\(\(run\) => run\(\)\)\)/);
    // The run handle is CLEARED at the end of every walk, which is what keeps the
    // no-run-open guard in `enqueueDiagramJob` live rather than permanently unreachable.
    assert.match(RUNTIME_SRC, /function endDiagramRuns\(\) \{\n\s*currentRunJobs = null;/);
    assert.match(RUNTIME_SRC, /endDiagramRuns\(\);/);
  });
});
