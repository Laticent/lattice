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
 * `is-annotation` ON THE FIXTURE'S EM-ONLY WRAPPERS IS THE KERNEL'S OUTPUT, not a
 * convenience. As of 2026-09-01 the annotation register is decided by `lib/core/coda.js`
 * and stamped as a class, because the selector it replaced (`p:has(> em:only-child)`)
 * matches any paragraph with ONE ELEMENT child — an ordinary note that italicizes a
 * phrase mid-sentence was rendering with a spark on it. `markNote` APPENDS its marker
 * (`split-envelope.js`), so a real split annotation reads
 * `class="below-note is-annotation lat-split-note"`, which is what these slides now
 * carry. Verified against the real splitter's output on `examples/split-envelope.md`.
 * A fixture that drifts from the render does not merely fail to catch a bug — it
 * certifies it (2026-08-24 §8), so this file's own shape is the thing to keep honest.
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
        // The beat lives in the frame's coda cell now (lib/core/coda.js), not as a
        // direct child of the stage — the whole point of that change being that the
        // panel stops depending on an exact DOM position.
        const p = document.querySelector(
          `section[data-lattice-slide="${slide}"] > .cell-coda > blockquote p`,
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

  /**
   * WHAT THIS PAIR USED TO ASSERT, and why the answer changed (2026-09-01).
   *
   * The ANNOTATION register — an em-only note's ✦ and its `--fs-meta` — used to be a
   * hand-enumerated OPT-IN union of sixteen layouts, so a split page had THREE cases: a
   * raw note (compact), a wrapped non-em-only note (compact), and a wrapped em-only note
   * that was compact on a layout OUTSIDE the union and `--fs-meta` on one inside it. The
   * third case needed a `:not()` chain mirroring that union by hand, and `checklist` sat
   * outside it while `cards-grid` sat inside — which is exactly what these two tests
   * pinned.
   *
   * The register is now keyed on the `.below-note` wrapper and covers every layout that
   * renders one, so "a layout ANNOTATION does not cover" is the empty set and the mirror
   * is deleted. The invariant is simpler and stronger: on ANY layout, an em-only note
   * reads at ANNOTATION's `--fs-meta` and a plain one at `--fs-body-compact`. Both tests
   * now assert that, `checklist` and `cards-grid` alike.
   * engineering/decisions/2026-09-01-universal-coda-registers.md §5.
   */
  test('wrapped note on any layout: em-only reads --fs-meta, plain reads --fs-body-compact', async () => {
    // slide 4 — checklist, em-only.  slide 5 — cards-grid, em-only.  slide 6 — checklist, plain.
    for (const [slide, want] of [[4, 'meta'], [5, 'meta'], [6, 'compact']]) {
      const got = await page.evaluate((slide) => {
        const p = document.querySelector(`section[data-lattice-slide="${slide}"] > .cell-stage > .below-note > p`);
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
      }, slide);
      assert.ok(got, `slide ${slide}: wrapped note <p> not found`);
      assert.equal(got.fontSize, got[want],
        `slide ${slide}: wrapped note computed ${got.fontSize}, expected ${want === 'meta' ? "ANNOTATION's --fs-meta" : '--fs-body-compact'} (${got[want]})`);
      // The two must stay distinguishable, or the assertion above proves nothing.
      assert.notEqual(got.meta, got.compact, '--fs-meta and --fs-body-compact resolved to the same px');
    }
  });

  test('the em-only note keeps the register\'s own chrome, not just its size', async () => {
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
      const before = getComputedStyle(p, '::before');
      const wrapBefore = getComputedStyle(p.parentElement, '::before');
      return {
        fontSize: getComputedStyle(p).fontSize,
        meta: mk('--fs-meta'),
        compact: mk('--fs-body-compact'),
        mask: before.maskImage && before.maskImage !== 'none' ? before.maskImage : (before.webkitMaskImage || 'none'),
        rule: wrapBefore.borderTopStyle,
      };
    });
    assert.ok(got, 'cards-grid wrapped em-only note <p> not found');
    assert.notEqual(got.fontSize, got.compact,
      `cards-grid em-only note computed ${got.fontSize} (--fs-body-compact) — the split-note compact rule wrongly out-specified ANNOTATION`);
    assert.equal(got.fontSize, got.meta,
      `cards-grid em-only note computed ${got.fontSize}, expected ANNOTATION's --fs-meta (${got.meta})`);
    // Size alone is not the register. Adding a layout to one arm and not the others used
    // to produce a half-styled note rather than a visible failure, so pin all three.
    assert.notEqual(got.mask, 'none',
      'the em-only note lost the drawn ✦ (--shape-spark mask) — the register is half-applied');
    assert.equal(got.rule, 'dotted',
      `the em-only note kept the below-note's accent hairline instead of the annotation's dotted rule (got ${got.rule})`);
  });

  test('the note in the shape the SPLITTER emits — a .cell-coda BESIDE the stage — still reads compact', async () => {
    // Every other slide in this fixture hand-authors the note as a direct `.cell-stage`
    // child, which is the shape the splitter emitted BEFORE the coda Cell was peeled out
    // to sit beside the stage. That shape can still occur (an author writing raw HTML), so
    // those slides stay — but none of them exercises what `injectTrailing` actually
    // produces today, and a fixture that has drifted from the render is what let the
    // original coda regression ship (see the decision note, §8). This slide is that shape.
    const got = await page.evaluate(() => {
      const p = document.querySelector('section[data-lattice-slide="7"] > .cell-coda.lat-split-note > .below-note > p');
      if (!p) return null;
      const probe = document.createElement('span');
      probe.style.fontSize = 'var(--fs-body-compact)';
      p.parentElement.appendChild(probe);
      const compact = getComputedStyle(probe).fontSize;
      probe.remove();
      return { fontSize: getComputedStyle(p).fontSize, compact };
    });
    assert.ok(got, 'split-shaped note <p> not found under > .cell-coda.lat-split-note');
    assert.equal(got.fontSize, got.compact,
      `split-shaped note computed ${got.fontSize}, expected --fs-body-compact ${got.compact} — the .cell-coda arm of the split-note rule is not reaching it`);
  });
});
