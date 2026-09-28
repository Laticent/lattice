/**
 * SPLIT FINISH SURFACE — on a finish deck, a split slide's finish shows on BOTH sides: the
 * supporting side has no background, so the slide's own finish shows through it, and the feature
 * panel keeps its field and paints its own copy of the finish, re-mixed for that field
 * (base.finish.css § FINISH SURFACES, split-panel.styles.css "A FINISH PAINTS BOTH SIDES").
 *
 * The load-bearing claim is the RE-MIX. A finish mixes every layer toward `--fin-canvas`, and a
 * custom property's `var()` is substituted where it is declared, so a panel that merely inherited
 * the section's finish would carry layers mixed for the light deck canvas. The export face ends on
 * solid canvas, so in the PDF that paints a dark panel light. This reads the panel's computed
 * `--fin-wash` in PRINT media and asserts it names the panel's own field color, not the canvas.
 *
 * It also pins the fallback: a finish whose CSS predates surfaces (no `--fin-surface-layers`)
 * leaves the panel on its plain field instead of painting mismatched layers.
 *
 * FALSIFIABLE: drop the surfaces from the generator's selector and the print `--fin-wash` on the
 * panel names the light canvas; drop the `--fin-surface-layers` gate and the legacy slide's panel
 * paints layers. Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

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

const BODY = '`Eyebrow`\n\n## A heading on the panel.\n\nA lede.\n\n- One\n  - Detail.\n- Two\n  - Detail.';
const COMPARE = '`Decision`\n\n## Two options.\n\nContext.\n\n- A\n  - x\n- B\n  - y';

// [class, body, feature panel, supporting side]
const SLIDES = [
  ['split-panel', BODY, '.panel-left', '.panel-right'],
  ['split-panel watermark', BODY, '.panel-left', '.panel-right'],
  ['split-panel cat-3', BODY, '.panel-left', '.panel-right'],
  ['split-panel metric', BODY.replace('## A heading on the panel.', '## 42'), '.panel-right', '.panel-left'],
  ['split-compare', COMPARE, '.compare-left', '.compare-right'],
];
const LEGACY = SLIDES.length + 1;
const OPTED_OUT = SLIDES.length + 2;
const LEGACY_MASKED = SLIDES.length + 3;
const CLEARED = SLIDES.length + 4;

// A finish written the way one was before surfaces existed: a section-only rule, no
// `--fin-surface-layers`. Stamped per slide as `finish-legacy`.
const LEGACY_CSS = 'section.finish-legacy { --fin-texture: radial-gradient(color-mix(in srgb, var(--field-accent) 15%, transparent) 0 1px, transparent 2px); --fin-wash: none; --fin-texture-opaque: radial-gradient(color-mix(in srgb, var(--field-accent) 13%, var(--fin-canvas)) 0 1px, transparent 2px); --fin-wash-opaque: linear-gradient(var(--fin-canvas), var(--fin-canvas)); --fin-size: 20px 20px, auto; }';

// The same, with a BAKED spotlight and clearance, the shape a Fabricate finish had before surfaces.
// Its masks are declared on the section, mixed for the light canvas; a panel that inherited them
// painted itself white in the PDF, under its white text (found by the #2457 checker).
const LEGACY_MASKED_CSS = 'section.finish-legacymask { --fin-texture: none; --fin-wash: none; --fin-texture-opaque: none; --fin-wash-opaque: none; --fin-backdrop-mask: radial-gradient(ellipse 30% 30% at 50% 50%, transparent 42%, var(--fin-canvas, var(--bg)) 96%); --fin-backdrop-mask-opaque: radial-gradient(ellipse 30% 30% at 50% 50%, transparent 70%, var(--fin-canvas, var(--bg)) 70%); --fin-backdrop-clear-scrim: var(--backdrop-clear-fill); --fin-backdrop-veil-weight: 1; }';

const DECK = `---
marp: true
theme: indaco
finish: strata
---

<style>${LEGACY_CSS} ${LEGACY_MASKED_CSS}</style>

${[...SLIDES.map(([cls, body]) => `<!-- _class: ${cls} -->\n\n${body}`),
  `<!-- _class: split-panel finish-legacy -->\n\n${BODY}`,
  `<!-- _class: split-panel finish-none -->\n\n${BODY}`,
  `<!-- _class: split-panel finish-legacymask -->\n\n${BODY}`,
  `<!-- _class: split-panel backdrop-clear -->\n\n${BODY}`].join('\n\n---\n\n')}
`;

describe('split finish surface (real render)', () => {
  let browser;
  let page;
  before(async () => {
    const html = renderHtml(DECK, { key: 'split-finish-surface' });
    browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  const read = (n, featureSel, supportSel) => page.evaluate(({ n, featureSel, supportSel }) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
    const f = sec.querySelector(`:scope > ${featureSel}`);
    const s = sec.querySelector(`:scope > ${supportSel}`);
    const fs = getComputedStyle(f);
    // Resolve a color token to rgb() through a probe on the panel, so it compares with
    // the substituted `--fin-wash` string in the same serialization.
    const probe = document.createElement('i');
    f.appendChild(probe);
    probe.style.color = 'var(--fin-canvas)';
    const panelCanvas = getComputedStyle(probe).color;
    probe.style.color = 'var(--bg)';
    const deckCanvas = getComputedStyle(probe).color;
    probe.remove();
    return {
      cls: sec.className,
      panelCanvasRaw: fs.getPropertyValue('--fin-canvas').trim(),
      deckCanvasRaw: getComputedStyle(sec).getPropertyValue('--bg').trim(),
      featureBg: fs.backgroundColor,
      featureImage: fs.backgroundImage,
      featureWash: fs.getPropertyValue('--fin-wash'),
      panelCanvas,
      deckCanvas,
      supportBg: getComputedStyle(s).backgroundColor,
      mark: getComputedStyle(sec.querySelector(':scope > .backdrop'), '::before').content,
    };
  }, { n, featureSel, supportSel });

  SLIDES.forEach(([cls, , featureSel, supportSel], i) => {
    test(`${cls}: the supporting side has no fill, and the feature panel paints the finish mixed for its own field`, async () => {
      await page.emulateMediaType('screen');
      const m = await read(i + 1, featureSel, supportSel);
      assert.equal(m.supportBg, 'rgba(0, 0, 0, 0)', `${cls}: the supporting side still paints ${m.supportBg}`);
      assert.equal(m.featureBg, m.panelCanvas, `${cls}: the panel's field (${m.featureBg}) is not the canvas its finish is mixed for (${m.panelCanvas})`);
      assert.notEqual(m.panelCanvas, m.deckCanvas, `${cls}: the panel names the deck canvas, so nothing is re-mixed`);
      assert.match(m.featureImage, /radial-gradient/, `${cls}: the panel paints no strata texture: ${m.featureImage.slice(0, 120)}`);
      assert.equal(m.mark, 'none', `${cls}: the slide-level mark is drawn on a split slide, which has no frame margin for it`);

      // The export face ends on SOLID canvas, so it must end on the PANEL's canvas.
      await page.emulateMediaType('print');
      const p = await read(i + 1, featureSel, supportSel);
      // Custom properties compute to their substituted TEXT (hex, `light-dark()`), so compare
      // the tokens as text: the panel's `--fin-canvas` against the deck's `--bg`.
      assert.ok(p.panelCanvasRaw && p.deckCanvasRaw && p.panelCanvasRaw !== p.deckCanvasRaw, `${cls}: ${p.panelCanvasRaw} vs ${p.deckCanvasRaw}`);
      assert.ok(p.featureWash.includes(`${p.panelCanvasRaw} 100%`), `${cls}: the print wash on the panel does not end on its field ${p.panelCanvasRaw}: ${p.featureWash.slice(0, 200)}`);
      assert.ok(!p.featureWash.includes(p.deckCanvasRaw), `${cls}: the print wash on the panel is mixed toward the deck canvas ${p.deckCanvasRaw}`);
      await page.emulateMediaType('screen');
    });
  });

  test('a finish written before surfaces existed leaves the panel on its plain field', async () => {
    const m = await read(LEGACY, '.panel-left', '.panel-right');
    assert.ok(m.cls.includes('finish-legacy'), m.cls);
    assert.doesNotMatch(m.featureImage, /radial-gradient/, `the panel painted the legacy finish's layers mixed for the wrong canvas: ${m.featureImage.slice(0, 160)}`);
  });

  test('an older finish with a baked spotlight and clearance leaves the dark panel dark in print', async () => {
    await page.emulateMediaType('print');
    const { PNG } = require('pngjs');
    const el = await page.$(`section[data-lattice-slide="${LEGACY_MASKED}"] > .panel-left`);
    const png = PNG.sync.read(Buffer.from(await el.screenshot()));
    let sum = 0;
    for (let i = 0; i < png.data.length; i += 4) sum += (0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]) / 255;
    const mean = sum / (png.data.length / 4);
    await page.emulateMediaType('screen');
    // The panel is `--surface-inverse` with light text on it: mostly dark. A panel painted with
    // the section's light-canvas mask reads above 0.8.
    assert.ok(mean < 0.35, `the dark panel prints light (mean luminance ${mean.toFixed(2)}): a section-mixed mask reached it`);
  });

  test('clear behind content clears both sides: the slide layer and the panel\'s own, mixed for the panel', async () => {
    const m = await read(CLEARED, '.panel-left', '.panel-right');
    assert.ok(m.cls.includes('backdrop-clear'), m.cls);
    // The panel keeps its finish in its margins and paints its own clear layer over it,
    // filled with ITS canvas (a dark fill on a dark panel, not the light deck canvas).
    assert.match(m.featureImage, /radial-gradient/, `the panel lost its finish under clear: ${m.featureImage.slice(0, 160)}`);
    const panelClear = await page.evaluate((n) => {
      const pane = document.querySelector(`section[data-lattice-slide="${n}"] > .panel-left`);
      const ps = getComputedStyle(pane, '::before');
      const probe = document.createElement('i');
      pane.appendChild(probe);
      probe.style.color = 'var(--fin-canvas)';
      const canvas = getComputedStyle(probe).color;
      probe.remove();
      return { image: ps.backgroundImage, filter: ps.filter, canvas, bg: getComputedStyle(pane).backgroundColor };
    }, CLEARED);
    assert.match(panelClear.image, /linear-gradient/, `the panel paints no clear layer: ${panelClear.image}`);
    assert.ok(panelClear.image.includes(panelClear.canvas), `the panel's clear layer is not its own canvas ${panelClear.canvas}: ${panelClear.image}`);
    assert.equal(panelClear.canvas, panelClear.bg, 'the clear fill is not the panel field');
    assert.match(panelClear.filter, /blur/, 'the panel clear layer has a hard edge');
    const clearLayer = await page.evaluate((n) => {
      const mask = document.querySelector(`section[data-lattice-slide="${n}"] > .backdrop > .backdrop-mask`);
      return getComputedStyle(mask, '::before').backgroundImage;
    }, CLEARED);
    assert.notEqual(clearLayer, 'none', 'the slide-level clear layer is off, so the supporting side is not cleared');
  });

  test('finish-none keeps both panels opaque and paints nothing', async () => {
    const m = await read(OPTED_OUT, '.panel-left', '.panel-right');
    assert.notEqual(m.supportBg, 'rgba(0, 0, 0, 0)');
    assert.equal(m.featureImage, 'none');
  });
});
