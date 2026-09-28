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

// A finish written the way one was before surfaces existed: a section-only rule, no
// `--fin-surface-layers`. Stamped per slide as `finish-legacy`.
const LEGACY_CSS = 'section.finish-legacy { --fin-texture: radial-gradient(color-mix(in srgb, var(--field-accent) 15%, transparent) 0 1px, transparent 2px); --fin-wash: none; --fin-texture-opaque: radial-gradient(color-mix(in srgb, var(--field-accent) 13%, var(--fin-canvas)) 0 1px, transparent 2px); --fin-wash-opaque: linear-gradient(var(--fin-canvas), var(--fin-canvas)); --fin-size: 20px 20px, auto; }';

const DECK = `---
marp: true
theme: indaco
finish: strata
---

<style>${LEGACY_CSS}</style>

${[...SLIDES.map(([cls, body]) => `<!-- _class: ${cls} -->\n\n${body}`),
  `<!-- _class: split-panel finish-legacy -->\n\n${BODY}`,
  `<!-- _class: split-panel finish-none -->\n\n${BODY}`].join('\n\n---\n\n')}
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

  test('finish-none keeps both panels opaque and paints nothing', async () => {
    const m = await read(OPTED_OUT, '.panel-left', '.panel-right');
    assert.notEqual(m.supportBg, 'rgba(0, 0, 0, 0)');
    assert.equal(m.featureImage, 'none');
  });
});
