/**
 * The library marks stay distinct from one another AND readable on both grounds.
 *
 * Each library mark (`docs/public/<lib>-mark.svg`, plus its `-mark-min` and `-lockup`) carries
 * its own light and dark colors in an inline `<style>`, so no token system checks them. Two
 * things drifted before this test: four libraries shared one amber accent, and fuoco (teal)
 * sat 0.027 from suono (teal) in OKLab, close enough to read as one color. Measured
 * `engineering/decisions/2026-07-18-sibling-brand-system.md` § Palette diversity.
 *
 * Two floors, both below today's measurement so a real regression fails and noise does not:
 *   · CONTRAST — every drawn color holds 3:1 (WCAG 1.4.11, graphical objects) against the
 *     site's paper in each scheme. Wordmark, halo and ring classes are chrome, not the mark.
 *   · DISTINCTNESS — the hub colors (a mark's primary) stay at least `MIN_HUB_DISTANCE`
 *     apart in OKLab, in each scheme, and no two libraries share a hub-plus-accent pair.
 *   · SOURCE — the SVG colors are generated from `docs/src/lib/library-palettes.json`, so each
 *     file's <style> must equal what the palette produces (run `node tools/build-library-marks.js`),
 *     and the demo-page text tokens (`--accent`, `--glow`) hold 4.5:1 on their own paper.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { contrastRatio, oklabDistance } = require('../../../lib/theme/color');

const PUBLIC = path.join(__dirname, '../../../docs/public');
const PAPER = { light: '#f6f3ec', dark: '#121012' };
const CHROME = new Set(['halo', 'wm', 'ring', 'plate', 'paper', 't']);
const MIN_CONTRAST = 3;
const MIN_HUB_DISTANCE = 0.06; // today's closest pair is 0.071 (light) / 0.077 (dark); it was 0.027
const MAX_SHARED_ACCENT = 2;
const MIN_TEXT_CONTRAST = 4.5;

let palette_;
before(async () => { palette_ = await import('../../../docs/src/lib/library-palette.mjs'); });

// The Lattice mark is the house jewel-tone lattice, not a library's mark.
const libs = fs.readdirSync(PUBLIC)
  .filter(f => f.endsWith('-mark.svg') && f !== 'lattice-mark.svg')
  .map(f => f.replace('-mark.svg', ''))
  .sort();

/** `{light: {cls: hex}, dark: {cls: hex}}` from a mark's inline `<style>`. */
function palette(file) {
  const style = fs.readFileSync(file, 'utf8').match(/<style>(.*?)<\/style>/s)[1];
  const [lightCss, darkCss = ''] = style.split('@media(prefers-color-scheme:dark){');
  const grab = css => Object.fromEntries(
    [...css.matchAll(/\.(\w+)\{[^}]*?(?:stroke|fill):(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2].toLowerCase()]));
  const light = grab(lightCss);
  return { light, dark: { ...light, ...grab(darkCss) } };
}

const files = lib => ['mark', 'mark-min', 'lockup']
  .map(k => path.join(PUBLIC, `${lib}-${k}.svg`)).filter(fs.existsSync);

describe('library marks — contrast on both grounds', () => {
  test('there are library marks to check', () => assert.ok(libs.length >= 10, libs.join()));

  for (const lib of libs) {
    test(`${lib}: every drawn color holds ${MIN_CONTRAST}:1 on light and dark paper`, () => {
      for (const file of files(lib)) {
        const pal = palette(file);
        for (const scheme of ['light', 'dark']) {
          for (const [cls, hex] of Object.entries(pal[scheme])) {
            if (CHROME.has(cls)) continue;
            const ratio = contrastRatio(hex, PAPER[scheme]);
            assert.ok(ratio >= MIN_CONTRAST,
              `${path.basename(file)} .${cls} ${hex} is ${ratio.toFixed(2)}:1 on ${scheme} paper (needs ${MIN_CONTRAST}:1)`);
          }
        }
      }
    });
  }
});

describe('library marks — the set reads as different libraries', () => {
  const hubbed = libs.map(lib => ({ lib, pal: palette(path.join(PUBLIC, `${lib}-mark.svg`)) }))
    .filter(({ pal }) => pal.light.hub);

  test('most libraries are measured (segno and tavola have no hub)', () => assert.ok(hubbed.length >= 8, String(hubbed.length)));

  for (const scheme of ['light', 'dark']) {
    test(`hub colors stay ${MIN_HUB_DISTANCE} apart in OKLab (${scheme})`, () => {
      for (let i = 0; i < hubbed.length; i++) {
        for (let j = i + 1; j < hubbed.length; j++) {
          const a = hubbed[i], b = hubbed[j];
          const d = oklabDistance(a.pal[scheme].hub, b.pal[scheme].hub);
          assert.ok(d >= MIN_HUB_DISTANCE,
            `${a.lib} ${a.pal[scheme].hub} and ${b.lib} ${b.pal[scheme].hub} are ${d.toFixed(3)} apart (${scheme}); need ${MIN_HUB_DISTANCE}`);
        }
      }
    });
  }

  test(`no two libraries share a hub + accent pair, and no accent is shared by more than ${MAX_SHARED_ACCENT}`, () => {
    const accentOf = pal => pal.light.warm ?? pal.light.onset;
    const pairs = new Map();
    const accents = new Map();
    for (const { lib, pal } of hubbed) {
      const accent = accentOf(pal);
      if (!accent) continue;
      const pair = `${pal.light.hub}+${accent}`;
      assert.ok(!pairs.has(pair), `${lib} and ${pairs.get(pair)} share the pair ${pair}`);
      pairs.set(pair, lib);
      accents.set(accent, [...(accents.get(accent) ?? []), lib]);
    }
    for (const [accent, owners] of accents) {
      assert.ok(owners.length <= MAX_SHARED_ACCENT, `${accent} is the accent of ${owners.join(', ')}`);
    }
  });
});

describe('library marks — one source', () => {
  for (const lib of libs) {
    test(`${lib}: every SVG's <style> is what library-palettes.json generates`, () => {
      const want = `<style>${palette_.markStyle(lib)}</style>`;
      for (const file of files(lib)) {
        const got = fs.readFileSync(file, 'utf8').match(/<style>.*?<\/style>/s)[0];
        assert.equal(got, want, `${path.basename(file)} drifted from the palette; run: node tools/build-library-marks.js`);
      }
    });
  }

  test('every library mark has a palette, and every palette has a mark', () => {
    assert.deepEqual([...palette_.libraries].sort(), libs);
  });
});

describe('library demo pages — text tokens hold contrast in both schemes', () => {
  for (const lib of libs) {
    for (const scheme of ['light', 'dark']) {
      test(`${lib} (${scheme}): --accent, --accent-ink and --glow are readable`, () => {
        const t = palette_.pageTokens(lib);
        const tok = scheme === 'light' ? t.light : { ...t.light, ...t.dark };
        const need = (fg, bg, label) => {
          if (!tok[fg] || !tok[bg]) return;
          const r = contrastRatio(tok[fg], tok[bg]);
          assert.ok(r >= MIN_TEXT_CONTRAST, `${lib} ${scheme}: ${label} ${tok[fg]} on ${tok[bg]} is ${r.toFixed(2)}:1 (needs ${MIN_TEXT_CONTRAST}:1)`);
        };
        need('--accent', '--paper', '--accent on --paper');
        need('--accent-ink', '--accent', '--accent-ink on --accent');
        // A page that defines `--glow-ink` keeps `--glow` for graphics and sets its text in the ink.
        const glow = tok['--glow-ink'] ? '--glow-ink' : '--glow';
        need(glow, '--paper', `${glow} on --paper`);
        need(glow, '--glow-bg', `${glow} on --glow-bg`);
      });
    }
  }
});
