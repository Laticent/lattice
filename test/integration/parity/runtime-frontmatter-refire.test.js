/**
 * Integration: the browser runtime's front-matter registers (`logo:`,
 * `meta:`, `class:`) survive a live-edit DOM replacement without re-resolving.
 *
 * lib/runtime/index.js resolves the deck's front matter ONCE for all three
 * registers (applyDeckLogoFromFrontMatter / applyMastheadMetaFromFrontMatter /
 * applyDeckClassFromFrontMatter all read `withDeckFrontMatter`), caches each
 * parsed config, and applies it. Two sources, in order: the BAKED block an
 * Export-to-Marp bundle carries, else one fetch of the source `.md` beside the
 * document. Both are covered below.
 *
 * Before the re-fire fix, that first apply was the ONLY apply — a live-edit preview
 * (marp-vscode, or any Marp-driven previewer) that replaces the whole
 * previewed body on every edit produces a fresh, untransformed render with
 * none of the runtime's injected chrome, and nothing re-applied it: the logo,
 * meta Tile, and deck-wide class silently vanished after the first edit.
 * applyCached{DeckLogo,MastheadMeta,DeckClass} now re-fire on every
 * runAllContentTransforms pass (idempotent, no re-resolve), so a later pass —
 * triggered here by the runtime's own MutationObserver + scheduleRun debounce
 * — restores all three from the cached config alone.
 *
 * This exercises the ACTUAL bundled dist/lattice-runtime.js (not lib/runtime/
 * index.js source, and not a synthetic re-implementation) in jsdom with
 * runScripts:'dangerously' and a stubbed `fetch` — the real browser-runtime
 * render path, the one lib/unit tests can't reach because the bootstrap IIFE
 * isn't requireable. See engineering/decisions/2026-07-09-form-migration-audit.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { frontMatterBlock, FRONT_MATTER_TYPE } = require('../../../lib/core/deck-front-matter');

const RUNTIME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'),
  'utf8',
);

const FRONT_MATTER = [
  '---',
  'theme: indaco',
  'class: dark',
  'logo: "./acme-logo.svg"',
  'meta: "Q3 2026 | Confidential"',
  '---',
  '',
  '## Title',
  '',
  'Body.',
  '',
].join('\n');

// A raw, untransformed slide — what a fresh Marp re-render produces on every
// live edit, with none of the runtime's injected chrome (no form/masthead
// band, no logo, no dark class).
const RAW_SECTION =
  '<section class="content"><p><code>Kicker</code></p><h2>Title</h2><p>Body.</p></section>';

// The same raw slide with NO component named — what an author who writes no
// `_class:` gets, and the subject of the DEFAULT-component rule (#1292).
const RAW_UNCLASSED_SECTION =
  '<section><p><code>Kicker</code></p><h2>Title</h2><p>Body.</p></section>';

/** Front matter with an arbitrary deck-wide `class:` value. */
const frontMatterWithClass = (cls) => [
  '---',
  'theme: indaco',
  ...(cls ? [`class: ${cls}`] : []),
  '---',
  '',
  '## Title',
  '',
  'Body.',
  '',
].join('\n');

/** Component tokens on the first slide — the assertion subject for the rule. */
const componentsOn = (document) => {
  const names = new Set(require('../../../lib/core/resolve-component').COMPONENT_NAMES);
  return [...document.querySelector('section').classList].filter((c) => names.has(c));
};

describe('runtime front-matter re-fire — logo/meta/class survive a live-edit DOM replacement', () => {
  test('a live-edit that wipes the DOM gets logo/meta/class back from cache, with no second fetch', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${RAW_SECTION}</body></html>`, {
      url: 'https://example.test/deck.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const { document } = window;

    let fetchCalls = 0;
    window.fetch = (url) => {
      fetchCalls++;
      assert.match(String(url), /deck\.md$/, 'derives the source .md from the .html URL');
      return Promise.resolve({ ok: true, text: () => Promise.resolve(FRONT_MATTER) });
    };

    // Execute the real bundle now that `fetch` is stubbed (a script inserted
    // after the initial parse runs synchronously — bootstrap() fires inline).
    const scriptEl = document.createElement('script');
    scriptEl.textContent = RUNTIME_SRC;
    document.body.appendChild(scriptEl);

    // Let the three boot-time fetches resolve and their first apply run.
    await new Promise((r) => setTimeout(r, 250));

    // ONE fetch for all three registers. It used to be three — each register
    // fetched the same file for the same answer — which is now one memoized
    // resolution shared by all of them.
    assert.equal(fetchCalls, 1, 'the three registers share one resolution of the front matter');
    assert.ok(document.querySelector('img.deck-logo'), 'logo injected on the first pass');
    assert.ok(document.querySelector('.tile-meta'), 'meta Tile filled on the first pass');
    assert.ok(document.querySelector('section').classList.contains('dark'), 'dark class applied on the first pass');

    // Simulate the live-edit: the whole previewed body is replaced with a
    // fresh, untransformed render — exactly what wiped the chrome pre-fix.
    document.body.innerHTML = RAW_SECTION;
    assert.equal(document.querySelector('img.deck-logo'), null, 'sanity: the wipe actually removed the logo');

    // MutationObserver → scheduleRun's 150ms trailing debounce → initAndRun().
    await new Promise((r) => setTimeout(r, 400));

    assert.equal(fetchCalls, 1, 'the re-fire reuses the cached config — no second fetch');
    assert.ok(document.querySelector('img.deck-logo'), 'logo re-injected after the live-edit wipe');
    assert.ok(document.querySelector('.tile-meta'), 'meta Tile re-filled after the live-edit wipe');
    assert.ok(document.querySelector('section').classList.contains('dark'), 'dark class re-applied after the live-edit wipe');

    window.close();
  });

  // The surface the fetch never worked on: a `file://` open (a recipient
  // double-clicking the exported HTML, and marp-cli's own PDF conversion) is a
  // `null` origin, so `fetch` is a CORS error and every register was lost. The
  // export bakes the front matter into the document instead. Here `fetch` is a
  // hard failure, as it is there — nothing may call it, and all three registers
  // must still land.
  test('a BAKED front-matter block needs no fetch at all, and is removed before layout', async () => {
    const baked = frontMatterBlock(FRONT_MATTER);
    assert.ok(baked, 'sanity: the fixture deck has front matter to bake');
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>${RAW_SECTION}${baked}</body></html>`,
      { url: 'file:///tmp/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
    );
    const { window } = dom;
    const { document } = window;

    let fetchCalls = 0;
    window.fetch = () => {
      fetchCalls++;
      return Promise.reject(new TypeError('Failed to fetch')); // what file:// really does
    };

    const scriptEl = document.createElement('script');
    scriptEl.textContent = RUNTIME_SRC;
    document.body.appendChild(scriptEl);
    await new Promise((r) => setTimeout(r, 250));

    assert.equal(fetchCalls, 0, 'the baked block is read from the DOM — no network at all');
    assert.ok(document.querySelector('img.deck-logo'), 'logo injected from the baked front matter');
    assert.ok(document.querySelector('.tile-meta'), 'meta Tile filled from the baked front matter');
    assert.ok(document.querySelector('section').classList.contains('dark'), 'dark class applied');
    // The consumed block must not linger in a document something else may copy,
    // serialize, or sanitize. (It is NOT a layout requirement — a `<script>` is
    // `display:none` and takes no flex `gap`; an earlier comment here claimed
    // otherwise and was measured wrong.)
    assert.equal(document.querySelector(`script[type="${FRONT_MATTER_TYPE}"]`), null,
      'the baked block was removed from the DOM');

    // …and it survives a live-edit wipe from cache, same as the fetched path,
    // even though the block it came from is long gone.
    document.body.innerHTML = RAW_SECTION;
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(fetchCalls, 0, 'still no fetch after the wipe');
    assert.ok(document.querySelector('img.deck-logo'), 'logo re-injected after the live-edit wipe');
    assert.ok(document.querySelector('.tile-meta'), 'meta Tile re-filled after the live-edit wipe');
    assert.ok(document.querySelector('section').classList.contains('dark'), 'dark class re-applied');

    window.close();
  });

  // The DEFAULT-component rule (#1292) is the fourth member of this family, and it was
  // the one left out of the re-fire: it ran once, from bootstrap's afterDeckFrontMatter
  // continuation, and never again. The surface it exists FOR is the marp-vscode webview
  // — the only one that delivers sections without the class, and the only one that
  // replaces them wholesale on every edit — so the miss landed squarely on it.
  //
  // NOTE ON WHAT THIS PROVES (HARD RULE #23): jsdom + the real bundle exercises the
  // runtime's own re-render path, which is the logic under test. It is NOT a claim about
  // marp-vscode itself; that surface cannot be driven from this sandbox and remains
  // UNVERIFIED. See engineering/decisions/2026-08-02-default-slide-layout.md.
  test('an un-classed slide gets the default component back after a live-edit wipe', async () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>${RAW_UNCLASSED_SECTION}${frontMatterBlock(frontMatterWithClass(''))}</body></html>`,
      { url: 'file:///tmp/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
    );
    const { window } = dom;
    const { document } = window;
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    const scriptEl = document.createElement('script');
    scriptEl.textContent = RUNTIME_SRC;
    document.body.appendChild(scriptEl);
    await new Promise((r) => setTimeout(r, 250));

    assert.deepEqual(componentsOn(document), ['content'], 'default component stamped on the first pass');

    // The live edit: fresh, untransformed sections — un-classed again, exactly as the
    // webview delivers them.
    document.body.innerHTML = RAW_UNCLASSED_SECTION;
    assert.deepEqual(componentsOn(document), [], 'sanity: the wipe actually removed the stamp');

    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(componentsOn(document), ['content'],
      're-stamped after the wipe — otherwise every render after the first is unstyled, which is #1292 itself');

    window.close();
  });

  // A deck-wide `class:` naming a COMPONENT used to claim every slide. It is refused
  // now (lib/core/deck-class-register.js): the register is appended over a slide's
  // own `_class:`, so a component there collides rather than composes. This pins the
  // refusal on the RUNTIME path — the one that renders an exported bundle in a
  // browser, and the one where a wrong answer is a shipped artifact.
  test('a deck-wide class: kpi is a no-op, and the slide falls back to the default', async () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>${RAW_UNCLASSED_SECTION}${frontMatterBlock(frontMatterWithClass('kpi'))}</body></html>`,
      { url: 'file:///tmp/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
    );
    const { window } = dom;
    const { document } = window;
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    const scriptEl = document.createElement('script');
    scriptEl.textContent = RUNTIME_SRC;
    document.body.appendChild(scriptEl);
    await new Promise((r) => setTimeout(r, 250));

    assert.deepEqual(componentsOn(document), ['content'], 'the deck-wide component is refused; the default applies');

    document.body.innerHTML = RAW_UNCLASSED_SECTION;
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(componentsOn(document), ['content'], 'and still after a live-edit wipe');

    window.close();
  });

  // R1 FROM #1416, on the surface it was reachable from. The reverted attempt made
  // this mirror STRIP the deck-wide register's tokens from every section by value —
  // and by the time the runtime sees a document there is no provenance left, so a
  // deck `class: kpi` deleted the `kpi` a SLIDE had named for itself. The mirror is
  // append-only now, and the deck token never exists to be stripped.
  //
  // The section here NAMES ITS OWN COMPONENT, which is the whole point: the earlier
  // coverage only ever fed an un-classed section, which is why this was invisible.
  test('the runtime never removes a class a section already carries', async () => {
    const OWN = '<section class="kpi"><h2>Title</h2><ol><li>One<ul><li>a</li></ul></li></ol></section>';
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>${OWN}${frontMatterBlock(frontMatterWithClass('kpi no-note'))}</body></html>`,
      { url: 'file:///tmp/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
    );
    const { window } = dom;
    const { document } = window;
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    const scriptEl = document.createElement('script');
    scriptEl.textContent = RUNTIME_SRC;
    document.body.appendChild(scriptEl);
    await new Promise((r) => setTimeout(r, 250));

    const cls = [...document.querySelector('section').classList];
    assert.ok(cls.includes('kpi'), `the section keeps the component it named, got "${cls.join(' ')}"`);
    assert.deepEqual(componentsOn(document), ['kpi'], 'and gains no second one');
    assert.ok(cls.includes('no-note'), 'while an admitted deck token still propagates');
  });

  // The same shape on the COLOR axis, which is where the strip was introduced: a
  // deck-wide `class: dark` superseded by `color-mode: light`, on a section whose
  // own `_class: dark` Marp already stamped. Removing by value would take both.
  test('a slide keeps its own color pin when the deck names the same token', async () => {
    const OWN = '<section class="content dark"><h2>Title</h2><p>Body.</p></section>';
    const fm = ['---', 'theme: indaco', 'color-mode: light', 'class: dark', '---', '', '## Title', ''].join('\n');
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>${OWN}${frontMatterBlock(fm)}</body></html>`,
      { url: 'file:///tmp/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
    );
    const { window } = dom;
    const { document } = window;
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    const scriptEl = document.createElement('script');
    scriptEl.textContent = RUNTIME_SRC;
    document.body.appendChild(scriptEl);
    await new Promise((r) => setTimeout(r, 250));

    const cls = [...document.querySelector('section').classList];
    assert.ok(cls.includes('dark'), `the slide's own pin survives, got "${cls.join(' ')}"`);
    assert.ok(!cls.includes('color-light'), 'and the deck color mode does not stack on top of it');

    window.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Texture <defs> re-derivation (#1863)
//
// The defs used to be deck-INDEPENDENT: every set, every page, injected once and
// never revisited. Selective emission makes them a function of the document's
// CSS, which puts them in this file's subject — a live edit that changes the
// answer has to be picked up, or the new theme's `--cat-N-texture` refs dangle
// and an unresolvable paint-server ref renders as SVG default BLACK.
//
// This is a REGRESSION PIN, not the verification. jsdom is not a rendering
// surface (HARD RULE #23); the behavior was verified by driving the committed
// dist/lattice-runtime.js in a real Chromium — see the PR's ## Performance
// section. What this guards is that the wiring survives refactors in CI.
// ─────────────────────────────────────────────────────────────────────────────

const THEMES = path.join(__dirname, '..', '..', '..', 'themes');
const themeCss = (n) => fs.readFileSync(path.join(THEMES, `${n}.css`), 'utf8');
// base.print-textures.css ships inside the engine sheet on every surface, and is
// what makes `latt-a11y-tex` present for EVERY theme — the sentinel the runtime
// uses to tell "no textures referenced" from "I cannot see the stylesheet".
const PRINT_CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.print-textures.css'), 'utf8',
);
const inlinedSheet = (theme) => `${themeCss(theme)}\n${PRINT_CSS}`;

const bootRuntime = async (html) => {
  const dom = new JSDOM(html, { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });
  const el = dom.window.document.createElement('script');
  el.textContent = RUNTIME_SRC;
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 250));
  return dom.window.document;
};
const emitted = (document) => {
  const el = document.querySelector('.latt-a11y-defs');
  if (!el) return null;
  return {
    sets: el.getAttribute('data-latt-tex-sets'),
    patterns: el.querySelectorAll('pattern').length,
    elements: document.querySelectorAll('.latt-a11y-defs').length,
  };
};

describe('runtime texture <defs> — narrowed to the sets the document references', () => {
  test('a hue-carried theme ships only the sets its print overrides reference', async () => {
    const document = await bootRuntime(
      `<!DOCTYPE html><html><head><style id="theme">${inlinedSheet('indaco')}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    assert.deepEqual(emitted(document), {
      sets: 'latt-a11y-tex latt-a11y-chart-tex', patterns: 20, elements: 1,
    }, 'indaco declares no texture channel — only print\'s a11y refs survive');
  });

  test('a live `theme:` edit re-derives the defs, and reverses cleanly', async () => {
    const document = await bootRuntime(
      `<!DOCTYPE html><html><head><style id="theme">${inlinedSheet('indaco')}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    assert.equal(emitted(document).patterns, 20);

    // What marp-vscode does on a `theme:` edit: repack the themeSet <style> and
    // re-render the sections. The section replacement is what wakes the pass.
    document.getElementById('theme').textContent = inlinedSheet('onyx');
    document.body.innerHTML = RAW_SECTION;
    await new Promise((r) => setTimeout(r, 400));

    const after = emitted(document);
    assert.equal(after.patterns, 56, 'onyx pulls in its scheme-aware set and both polarity pins');
    assert.match(after.sets, /latt-onyx-tex latt-onyx-tex-light latt-onyx-tex-dark/);
    assert.equal(after.elements, 1, 'the stale defs are replaced, never stacked');

    document.getElementById('theme').textContent = inlinedSheet('indaco');
    document.body.innerHTML = RAW_SECTION;
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(emitted(document).patterns, 20, 'narrowing is reversible, not a one-way ratchet');
  });

  test('every referenced id resolves — no dangling paint-server ref after a swap', async () => {
    const document = await bootRuntime(
      `<!DOCTYPE html><html><head><style id="theme">${inlinedSheet('concrete')}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    const ids = new Set([...document.querySelectorAll('.latt-a11y-defs pattern')].map((p) => p.id));
    for (const [, id] of inlinedSheet('concrete').matchAll(/url\(\s*["']?#(latt-[a-z0-9-]*-\d+)/g)) {
      assert.ok(ids.has(id), `concrete references #${id}, which the runtime did not emit`);
    }
  });

  // ── The three ways a cheap change-detector got this wrong ──────────────────
  //
  // The first cut gated the re-derivation on a `<style>`-length signature. An
  // independent check found three edits that change the answer without moving that
  // signature; all three end in a `url(#…)` with no `<pattern>`, which SVG paints
  // BLACK. The gate is now the answer itself, and these pin each scenario.

  test('a reference arriving through slide MARKUP is picked up (no stylesheet change)', async () => {
    const document = await bootRuntime(
      `<!DOCTYPE html><html><head><style id="theme">${inlinedSheet('indaco')}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    assert.equal(emitted(document).patterns, 20);
    // The author adds a slide with inline SVG of their own. No `<style>` moves.
    document.body.innerHTML =
      '<section class="content"><svg><rect fill="url(#latt-concrete-tex-1)"/></svg></section>';
    await new Promise((r) => setTimeout(r, 400));
    assert.match(emitted(document).sets, /latt-concrete-tex$/,
      'a markup-only reference is a different INPUT to the same scan, and was invisible '
      + 'to a gate that watched only stylesheet text');
  });

  test('a SAME-LENGTH stylesheet edit that retargets a slot is picked up', async () => {
    // `latt-a11y-tex` and `latt-onyx-tex` are both 13 characters, so retargeting
    // `--cat-N-texture` from one to the other moves no byte count anywhere. The set
    // prefixes are not length-distinct, so this is a by-construction blind spot for
    // any length-based signature, not an unlucky coincidence.
    const before = `${inlinedSheet('indaco')}\nsection{--cat-1-texture:url(#latt-a11y-tex-1)}`;
    const after = `${inlinedSheet('indaco')}\nsection{--cat-1-texture:url(#latt-onyx-tex-1)}`;
    assert.equal(before.length, after.length, 'the premise: these edits are the same length');

    const document = await bootRuntime(
      `<!DOCTYPE html><html><head><style id="theme">${before}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    assert.equal(emitted(document).sets, 'latt-a11y-tex latt-a11y-chart-tex');
    document.getElementById('theme').textContent = after;
    document.body.innerHTML = RAW_SECTION;
    await new Promise((r) => setTimeout(r, 400));
    assert.match(emitted(document).sets, /latt-onyx-tex$/);
  });

  test('a destroyed defs element is restored, even when the answer did not change', async () => {
    const document = await bootRuntime(
      `<!DOCTYPE html><html><head><style id="theme">${inlinedSheet('indaco')}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    document.querySelector('.latt-a11y-defs').remove();
    document.body.innerHTML = RAW_SECTION;
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(emitted(document), {
      sets: 'latt-a11y-tex latt-a11y-chart-tex', patterns: 20, elements: 1,
    }, 'an early return on an unchanged signature never noticed the element was gone — '
      + 'and on a hue-carried theme nothing else would ever put it back');
  });

  test('an unreadable stylesheet falls back to EVERY set, never to none', async () => {
    // A <link> theme: its text is not in the DOM, so the narrow answer cannot be
    // proved. Emitting everything is waste; emitting nothing is a black fill.
    const linked = await bootRuntime(
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="/theme.css"></head>'
      + `<body>${RAW_SECTION}</body></html>`,
    );
    assert.equal(emitted(linked).patterns, 92, 'a linked sheet must fall back to every set');

    // And a document with no engine sheet at all — the sentinel is absent, so the
    // runtime is not looking at a real Lattice stylesheet.
    const bare = await bootRuntime(
      `<!DOCTYPE html><html><head><style>body{color:red}</style></head><body>${RAW_SECTION}</body></html>`,
    );
    assert.equal(emitted(bare).patterns, 92, 'no print sentinel means "cannot tell", not "needs none"');
  });
});
