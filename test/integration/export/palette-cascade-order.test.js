/**
 * Integration: the palette wins the export cascade (#1527).
 *
 * `lattice-emulator.js` builds the deck's single `<style>` from two sheets: the engine
 * bundle and the deck's palette chain. For the whole life of the export path it wrote
 * them palette-FIRST, so `lib/base/base.tokens.css`'s plain `:root` block landed later
 * at equal specificity and won. 932 palette declarations across all 32 themes resolved
 * to the base's value and painted nothing their author wrote — and the same file's own
 * Mermaid token reader parsed the OTHER order two hundred lines below, citing the
 * `@import 'lattice';` every theme opens with. A `cuoio` deck looked one way in the
 * Playground and another in the PDF it exported.
 *
 * WHY THIS TEST IS NOT A TEXT MATCH ON THE CONCAT. That is the assertion that reads
 * natural and proves nothing: `layoutCSS + paletteCSS` is one edit away from being
 * defeated by a `@layer`, an `!important`, a second `<style>`, or Marpit's `:root`→
 * `section` packing, all of which decide the same question and none of which a string
 * comparison can see. So this renders the REAL CLI at a REAL palette and reads the
 * tokens off the rendered `<section>` in Chromium (HARD RULE #23: the surface, not a
 * stand-in), and it picks tokens where the theme and the base disagree — a token they
 * both spell the same way cannot tell the two orders apart, which is precisely how
 * #1527's own before/after sweep missed indaco's sub-AA `--hljs-literal`.
 *
 * Slow tier (spawns the emulator, which spawns Chromium).
 *
 * engineering/decisions/2026-08-10-palette-concat-order.md,
 * 2026-08-11-palette-concat-signoff.md, 2026-08-24-palette-cascade-flip.md.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const { PALETTE_END_MARK, PALETTE_START_MARK, BASE_MARK } = require('../../../lib/core/export-shell-marks.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const TIMEOUT = 300000;

/** Best-effort Chromium path — mirrors chrome-suppression.test.js. */
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

/**
 * Tokens where `themes/indaco.css` and `lib/base/base.tokens.css` declare DIFFERENT
 * values, so the resolved value names which sheet won. Read from the two files rather
 * than hardcoded, because a hardcoded expectation rots into a tautology the first time
 * either value is re-tuned — and re-tuning status inks is a live activity in this repo.
 */
function disputedTokens(names) {
  const read = (f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const map = new Map();
    for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
    return map;
  };
  const theme = read(path.join(ROOT, 'themes', 'indaco.css'));
  const base = read(path.join(ROOT, 'lib', 'base', 'base.tokens.css'));
  const out = [];
  for (const n of names) {
    const t = theme.get(n);
    const b = base.get(n);
    // LITERAL values only. A declaration carrying `var()` is resolved by the browser
    // before `getPropertyValue` returns it, so its computed string matches NEITHER
    // sheet's source text and the comparison below reports a phantom third answer —
    // `--on-accent` is `light-dark(#FFFFFF, var(--surface-inverse))` in both sheets and
    // computes to `light-dark(#FFFFFF, #003D66)`. Those tokens are not evidence about
    // cascade ORDER anyway; the disagreement is in a fallback nobody reaches.
    if (!t || !b || /var\s*\(/.test(t) || /var\s*\(/.test(b)) continue;
    if (t.replace(/\s+/g, '') !== b.replace(/\s+/g, '')) out.push({ token: n, theme: t, base: b });
  }
  return out;
}

describe('the palette wins the cascade on the export path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-cascade-'));
  const deckFile = path.join(dir, 'deck.md');
  fs.writeFileSync(deckFile, '---\nmarp: true\ntheme: indaco\n---\n\n# Cascade probe\n\nOne slide is enough — this reads tokens, not layout.\n');
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const out = path.join(dir, 'deck.html');
  let html = null;
  const render = () => {
    if (html !== null) return html;
    const r = spawnSync(process.execPath, [EMULATOR, deckFile, out, '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    html = fs.readFileSync(out, 'utf8');
    return html;
  };

  test('the engine bundle is emitted BEFORE the palette, and the region is closed', { timeout: TIMEOUT }, () => {
    const doc = render();
    const base = doc.indexOf(BASE_MARK);
    const palette = doc.indexOf(PALETTE_START_MARK);
    const end = doc.indexOf(PALETTE_END_MARK);
    assert.ok(base >= 0, `the engine bundle banner ${BASE_MARK} is missing from the export`);
    assert.ok(palette >= 0, `the palette banner ${PALETTE_START_MARK} is missing from the export`);
    assert.ok(base < palette, 'the engine bundle must come FIRST so the palette overrides it (#1527)');
    // The sentinel is what `tools/palette-sweep.js` overwrites up to; a missing or
    // misplaced one sends that tool back to guessing where the palette ends.
    assert.ok(end > palette, `${PALETTE_END_MARK} must close the palette region, after it`);
  });

  test('REAL RENDER — a disputed token resolves to the palette, not the base', { timeout: TIMEOUT }, async () => {
    const exe = resolveChrome();
    if (!exe) {
      assert.fail('no Chromium — set CHROME_PATH. This test is about what a browser resolves, so it must not skip quietly.');
    }
    // Three token families, each of which the sign-off sweep found moving a real slide:
    // the status trio (checklist rails and icons), the syntax ramp (code panels) and the
    // Mermaid state family (gantt / kanban), which is also the family that used to
    // resolve TWO ways in one render — the baked SVG from the palette, the CSS from the
    // base.
    const disputed = disputedTokens([
      '--pass', '--warn', '--fail', '--hljs-literal', '--hljs-keyword', '--hljs-comment', '--diagram-critical',
    ]);

    render();
    const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.goto(`file://${out}`, { waitUntil: 'load', timeout: TIMEOUT });
      const resolved = await page.evaluate((names) => {
        const s = getComputedStyle(document.querySelector('section'));
        return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n).trim()]));
      }, disputed.map((d) => d.token));

      // THE VACUITY GUARD, measured rather than assumed — and an earlier cut of this
      // got it wrong in a way worth keeping. It counted tokens the two FILES spell
      // differently and required four. But #1789 declares the status trio a second time
      // at `:root:root`, which is (0,2,0) and therefore beats the bundle in EITHER order,
      // so `--pass`/`--warn`/`--fail` are spelled differently and resolve identically:
      // three of the four could be order-BLIND and the guard would still read satisfied.
      //
      // So the discriminators are found by inverting the real document: move the palette
      // region back in front of the engine bundle, re-read, and count what actually
      // moved. That is the property this test needs — the render must be order-SENSITIVE
      // at all — and it cannot be satisfied by a token that merely looks disputed.
      const inverted = await page.evaluate((marks, names) => {
        const el = [...document.querySelectorAll('style')].find((n) =>
          n.textContent.includes(marks.base) && n.textContent.includes(marks.start) && n.textContent.includes(marks.end));
        if (!el) return null;
        const t = el.textContent;
        const iBase = t.indexOf(marks.base), iPal = t.indexOf(marks.start), iEnd = t.indexOf(marks.end);
        if (!(iBase >= 0 && iBase < iPal && iPal < iEnd)) return null;
        el.textContent = t.slice(0, iBase) + t.slice(iPal, iEnd) + '\n' + t.slice(iBase, iPal) + t.slice(iEnd);
        const s = getComputedStyle(document.querySelector('section'));
        return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n).trim()]));
      }, { base: BASE_MARK, start: PALETTE_START_MARK, end: PALETTE_END_MARK }, disputed.map((d) => d.token));

      assert.ok(inverted, 'could not invert the palette region in the rendered document — the markers moved');
      const discriminators = disputed.filter((d) => resolved[d.token] !== inverted[d.token]).map((d) => d.token);
      assert.ok(discriminators.length >= 3,
        `only ${discriminators.length} of the probed tokens change when the cascade is inverted `
        + `(${discriminators.join(', ') || 'none'}). A token that resolves the same in both orders cannot `
        + 'detect an inverted concat, so this test would be measuring nothing. Add a token the palette '
        + 'declares at plain `:root` and the base also declares.');

      const wrong = [];
      for (const { token, theme, base } of disputed) {
        const got = resolved[token].replace(/\s+/g, '');
        if (got === theme.replace(/\s+/g, '')) continue;
        wrong.push(got === base.replace(/\s+/g, '')
          ? `${token} resolved to the BASE's ${base} — the concat order is inverted again (#1527)`
          : `${token} resolved to ${resolved[token]}, which is neither the theme's ${theme} nor the base's ${base}`);
      }
      assert.deepEqual(wrong, [], wrong.join('; '));
    } finally {
      await browser.close();
    }
  });
});
