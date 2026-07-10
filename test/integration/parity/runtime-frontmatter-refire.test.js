/**
 * Integration: the browser runtime's front-matter registers (`logo:`,
 * `meta:`, `class:`) survive a live-edit DOM replacement without re-fetching.
 *
 * lib/runtime/index.js fetches the deck's source `.md` ONCE per register
 * (applyDeckLogoFromFrontMatter / applyMastheadMetaFromFrontMatter /
 * applyDeckClassFromFrontMatter), caches the parsed config, and applies it.
 * Before this fix, that first apply was the ONLY apply — a live-edit preview
 * (marp-vscode, or any Marp-driven previewer) that replaces the whole
 * previewed body on every edit produces a fresh, untransformed render with
 * none of the runtime's injected chrome, and nothing re-applied it: the logo,
 * meta Tile, and deck-wide class silently vanished after the first edit.
 * applyCached{DeckLogo,MastheadMeta,DeckClass} now re-fire on every
 * runAllContentTransforms pass (idempotent, no re-fetch), so a later pass —
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

    assert.equal(fetchCalls, 3, 'deck-class + deck-logo + masthead-meta each fetch once on boot');
    assert.ok(document.querySelector('img.deck-logo'), 'logo injected on the first pass');
    assert.ok(document.querySelector('.tile-meta'), 'meta Tile filled on the first pass');
    assert.ok(document.querySelector('section').classList.contains('dark'), 'dark class applied on the first pass');

    // Simulate the live-edit: the whole previewed body is replaced with a
    // fresh, untransformed render — exactly what wiped the chrome pre-fix.
    document.body.innerHTML = RAW_SECTION;
    assert.equal(document.querySelector('img.deck-logo'), null, 'sanity: the wipe actually removed the logo');

    // MutationObserver → scheduleRun's 150ms trailing debounce → initAndRun().
    await new Promise((r) => setTimeout(r, 400));

    assert.equal(fetchCalls, 3, 'the re-fire reuses the cached config — no second fetch');
    assert.ok(document.querySelector('img.deck-logo'), 'logo re-injected after the live-edit wipe');
    assert.ok(document.querySelector('.tile-meta'), 'meta Tile re-filled after the live-edit wipe');
    assert.ok(document.querySelector('section').classList.contains('dark'), 'dark class re-applied after the live-edit wipe');

    window.close();
  });
});
