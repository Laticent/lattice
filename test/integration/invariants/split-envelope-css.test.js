/**
 * SPLIT-ENVELOPE CSS outcomes (Form on, real Chromium) — the render-surface half
 * of lib/core/split-envelope.js's insight/note split (2026-07-22-structure-
 * derived-split-patterns.md §0a). split-envelope.test.js proves the HTML STRING
 * shape (right classes, right nesting); this proves that shape actually CASCADES
 * to the intended computed style in real Chromium — the gap a second maker-
 * checker pass found unguarded (a specificity loss shipped invisibly: the
 * insight page's blockquote rendered at --fs-body on 13/15 components, and an
 * ANNOTATION-eligible note's em-only case silently lost its own sizing).
 * HARD RULE #23: CI-green / a unit test on generated HTML strings is not
 * verification of a real cascade outcome — only a real render is.
 *
 * The fixture hand-authors the split envelope's OWN output shape as raw HTML in
 * a plain deck (`_class: <layout> lat-split-insight` / `lat-split-native`, plus
 * a literal `<p class="lat-split-note">` / `<div class="below-note
 * lat-split-note">`) rather than driving real overflow-triggered auto-split —
 * split-envelope.test.js already pins that JS produces exactly this shape, so
 * authoring it directly isolates the CSS question from overflow-heuristic
 * flakiness while exercising the identical selectors against the real bundle.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors component-invariants.test.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

describe('split-envelope CSS outcomes (Form on, real cascade)', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'split-envelope-css.md');
  let browser;
  let page;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    const pdf = runEmulator(FIXTURE, { timeout: 60000 });
    const html = pdf.replace(/\.pdf$/, '.html');
    assert.ok(fs.existsSync(html), `emulator HTML sidecar missing: ${html}`);
    page = await browser.newPage();
    await page.goto('file://' + html, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      try {
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
        await document.fonts.ready;
      } catch { /* Font Loading API absent — proceed */ }
    });
  }, { timeout: 90000 });
  after(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  test('insight page blockquote reads at --fs-emphasis, not the base --fs-body', async () => {
    for (const slide of [1, 2]) { // checklist, stats — two distinct components
      const got = await page.evaluate((slide) => {
        const p = document.querySelector(
          `section[data-lattice-slide="${slide}"] > .cell-stage > blockquote p`,
        );
        if (!p) return null;
        const probe = document.createElement('span');
        probe.style.fontSize = 'var(--fs-emphasis)';
        p.parentElement.appendChild(probe);
        const emphasis = getComputedStyle(probe).fontSize;
        probe.remove();
        return { fontSize: getComputedStyle(p).fontSize, emphasis };
      }, slide);
      assert.ok(got, `slide ${slide}: insight blockquote p not found`);
      assert.equal(got.fontSize, got.emphasis,
        `slide ${slide}: insight blockquote computed ${got.fontSize}, expected --fs-emphasis (${got.emphasis}) — lost the cascade to the base KEY INSIGHT rule`);
    }
  });

  test('stats raw note: compact size AND the component-owned centering survive markNote', async () => {
    const got = await page.evaluate(() => {
      const p = document.querySelector('section[data-lattice-slide="3"] > .cell-stage > p.lat-split-note');
      if (!p) return null;
      const probe = document.createElement('span');
      probe.style.fontSize = 'var(--fs-body-compact)';
      p.parentElement.appendChild(probe);
      const compact = getComputedStyle(probe).fontSize;
      probe.remove();
      return { fontSize: getComputedStyle(p).fontSize, textAlign: getComputedStyle(p).textAlign, compact };
    });
    assert.ok(got, 'stats raw note <p class="lat-split-note"> not found under .cell-stage');
    assert.equal(got.fontSize, got.compact,
      `stats note computed ${got.fontSize}, expected --fs-body-compact (${got.compact})`);
    assert.equal(got.textAlign, 'center',
      'stats note lost its component-owned centering (section.stats > .cell-stage > p) — a regression markNote must not cause by wrapping the note in a fresh div');
  });

  test('wrapped note, non-ANNOTATION layout (checklist): both em-only and plain get --fs-body-compact', async () => {
    for (const slide of [4, 6]) {
      const got = await page.evaluate((slide) => {
        const p = document.querySelector(`section[data-lattice-slide="${slide}"] > .cell-stage > .below-note > p`);
        if (!p) return null;
        const probe = document.createElement('span');
        probe.style.fontSize = 'var(--fs-body-compact)';
        p.parentElement.appendChild(probe);
        const compact = getComputedStyle(probe).fontSize;
        probe.remove();
        return { fontSize: getComputedStyle(p).fontSize, compact };
      }, slide);
      assert.ok(got, `slide ${slide}: wrapped note <p> not found`);
      assert.equal(got.fontSize, got.compact,
        `slide ${slide}: checklist wrapped note computed ${got.fontSize}, expected --fs-body-compact (${got.compact})`);
    }
  });

  test('wrapped, em-only note on an ANNOTATION-enumerated layout (cards-grid) defers to ANNOTATION, not --fs-body-compact', async () => {
    const got = await page.evaluate(() => {
      const p = document.querySelector('section[data-lattice-slide="5"] > .cell-stage > .below-note > p');
      if (!p) return null;
      const mk = (name) => {
        const probe = document.createElement('span');
        probe.style.fontSize = `var(${name})`;
        p.parentElement.appendChild(probe);
        const px = getComputedStyle(probe).fontSize;
        probe.remove();
        return px;
      };
      return { fontSize: getComputedStyle(p).fontSize, meta: mk('--fs-meta'), compact: mk('--fs-body-compact') };
    });
    assert.ok(got, 'cards-grid wrapped em-only note <p> not found');
    assert.notEqual(got.fontSize, got.compact,
      `cards-grid em-only note computed ${got.fontSize} (--fs-body-compact) — the split-note compact rule wrongly out-specified ANNOTATION`);
    assert.equal(got.fontSize, got.meta,
      `cards-grid em-only note computed ${got.fontSize}, expected ANNOTATION's --fs-meta (${got.meta})`);
  });
});
