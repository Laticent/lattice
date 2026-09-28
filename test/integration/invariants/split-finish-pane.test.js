/**
 * SPLIT FINISH PANE — on a finish deck the supporting side of a split slide (the cards) has no
 * fill, so the slide's finish shows under it, and `backdrop: clear` clears behind that zone's
 * content, not the whole slide, as on any other slide; the feature panel keeps its solid field
 * with its own finish, like an anchor slide (split-panel.styles.css, "A FINISH PAINTS BOTH SIDES").
 *
 * It also exports the clear slides to PDF and reads the writer's report: the panel's clear layer
 * sits under the panel's text (band 0 under band 1), so no word may be pushed into the photo as
 * "covered" (lib/core/pdf-compose/read-slide.mjs `stackedBelow`).
 *
 * Nothing but a browser can check the clear box: base.finish.css sizes it from the section's
 * padding, a split section's is 0, and the split CSS restates the supporting zone's content box
 * from `--_panel-outer` and the zone paddings. A variant that changes a padding moves the zone
 * and silently leaves the clear layer behind the pane or over the cards' margin. So this renders
 * each layout and measures the clear layer against the zone.
 *
 * FALSIFIABLE: on main every supporting side is opaque and the clear layer covers the whole
 * slide, so each assertion below fails. Needs Chromium (CHROME_PATH / puppeteer cache).
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
const METRIC = BODY.replace('## A heading on the panel.', '## 42');
const COMPARE = '`Decision`\n\n## Two options.\n\nContext.\n\n- A\n  - x\n- B\n  - y';

// [class, body, pane (feature panel), supporting zone]
const SLIDES = [
  ['split-panel', BODY, '.panel-left', '.panel-right'],
  ['split-panel mirror', BODY, '.panel-left', '.panel-right'],
  ['split-panel watermark', BODY, '.panel-left', '.panel-right'],
  ['split-panel steps', BODY, '.panel-left', '.panel-right'],
  ['split-panel cat-3', BODY, '.panel-left', '.panel-right'],
  ['split-panel metric', METRIC, '.panel-right', '.panel-left'],
  ['split-panel metric mirror', METRIC, '.panel-right', '.panel-left'],
  ['split-compare', COMPARE, '.compare-left', '.compare-right'],
];
const OPTED_OUT = SLIDES.length * 2 + 1;

const DECK = `---
marp: true
theme: indaco
finish: strata
---

${[...SLIDES.map(([cls, body]) => `<!-- _class: ${cls} -->\n\n${body}`),
  ...SLIDES.map(([cls, body]) => `<!-- _class: ${cls} backdrop-clear -->\n\n${body}`),
  `<!-- _class: split-panel finish-none -->\n\n${BODY}`].join('\n\n---\n\n')}
`;

describe('split finish pane (real render)', () => {
  let browser;
  let page;
  before(async () => {
    const html = renderHtml(DECK, { key: 'split-finish-pane' });
    browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  const read = (n, paneSel, zoneSel) => page.evaluate(({ n, paneSel, zoneSel }) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
    const pane = sec.querySelector(`:scope > ${paneSel}`);
    const zone = sec.querySelector(`:scope > ${zoneSel}`);
    const box = (r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom });
    const zr = zone.getBoundingClientRect();
    const zs = getComputedStyle(zone);
    const px = (v) => parseFloat(v) || 0;
    const zoneContent = {
      l: zr.left + px(zs.paddingLeft), r: zr.right - px(zs.paddingRight),
      t: zr.top + px(zs.paddingTop), b: zr.bottom - px(zs.paddingBottom),
    };
    // The clear layer's content box: its border box minus its own padding.
    const mask = sec.querySelector(':scope > .backdrop > .backdrop-mask');
    const ms = getComputedStyle(mask, '::before');
    const mr = mask.getBoundingClientRect();
    // Positioned insets compute to used px, so the box is the mask's box minus insets and padding.
    const clear = ms.backgroundImage === 'none' ? null : {
      l: mr.left + px(ms.left) + px(ms.paddingLeft),
      r: mr.right - px(ms.right) - px(ms.paddingRight),
      t: mr.top + px(ms.top) + px(ms.paddingTop),
      b: mr.bottom - px(ms.bottom) - px(ms.paddingBottom),
    };
    return {
      cls: sec.className,
      paneBg: getComputedStyle(pane).backgroundColor,
      zoneBg: zs.backgroundColor,
      mark: getComputedStyle(sec.querySelector(':scope > .backdrop'), '::before').content,
      zoneContent,
      pane: box(pane.getBoundingClientRect()),
      clear,
    };
  }, { n, paneSel, zoneSel });

  // `rgba(r, g, b, a)` or `color(srgb r g b / a)`; no alpha means opaque.
  const alphaOf = (c) => {
    const slash = /\/\s*([\d.]+)\s*\)$/.exec(c);
    if (slash) return parseFloat(slash[1]);
    const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(c);
    return m ? parseFloat(m[1]) : 1;
  };

  SLIDES.forEach(([cls, , paneSel, zoneSel], i) => {
    test(`${cls}: the cards' side has no fill, the panel keeps its solid field, the mark is off`, async () => {
      const m = await read(i + 1, paneSel, zoneSel);
      assert.equal(m.zoneBg, 'rgba(0, 0, 0, 0)', `${cls}: the supporting side paints ${m.zoneBg}`);
      // The panel is an anchor-style field (its own finish is painted on it), never a
      // translucent pane: a pane lifts the field toward the light canvas.
      assert.equal(alphaOf(m.paneBg), 1, `${cls}: the panel field is ${m.paneBg}, not opaque`);
      assert.equal(m.mark, 'none', `${cls}: the finish's corner mark is drawn on a split slide, which has no frame margin for it`);
    });

    test(`${cls} backdrop-clear: the panel's blurred clear layer stays inside the panel`, async () => {
      // The blur spreads the panel's fill past its edge; an unclipped layer smeared the dark field
      // into the supporting zone as a gray band (split-compare's rail does not clip; 0.72 mean
      // luminance next to the rail before the fix, 1.00 after).
      const n = SLIDES.length + i + 1;
      const strip = await page.evaluate(({ n, paneSel, zoneSel }) => {
        const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
        const p = sec.querySelector(`:scope > ${paneSel}`).getBoundingClientRect();
        const z = sec.querySelector(`:scope > ${zoneSel}`).getBoundingClientRect();
        const x = z.left >= p.right - 1 ? p.right + 2 : p.left - 14;
        return { x, y: p.top + p.height * 0.3, width: 12, height: p.height * 0.4 };
      }, { n, paneSel, zoneSel });
      const { PNG } = require('pngjs');
      const png = PNG.sync.read(Buffer.from(await page.screenshot({ clip: strip })));
      let sum = 0;
      for (let k = 0; k < png.data.length; k += 4) sum += (0.2126 * png.data[k] + 0.7152 * png.data[k + 1] + 0.0722 * png.data[k + 2]) / 255;
      const mean = sum / (png.data.length / 4);
      assert.ok(mean > 0.85, `${cls}: the panel's field bleeds past its edge into the supporting zone (mean luminance ${mean.toFixed(2)})`);
    });

    test(`${cls} backdrop-clear: clears behind the cards' content, not the whole slide`, async () => {
      const m = await read(SLIDES.length + i + 1, paneSel, zoneSel);
      if (cls.includes('pullquote')) return;
      assert.ok(m.clear, `${cls}: the clear layer is off`);
      const c = m.clear;
      const z = m.zoneContent;
      const near = (a, b) => Math.abs(a - b) <= 1.5;
      assert.ok(near(c.l, z.l) && near(c.r, z.r) && near(c.t, z.t) && near(c.b, z.b),
        `${cls}: clear box x ${c.l.toFixed(1)}–${c.r.toFixed(1)} y ${c.t.toFixed(1)}–${c.b.toFixed(1)} vs the zone's content ${z.l.toFixed(1)}–${z.r.toFixed(1)} / ${z.t.toFixed(1)}–${z.b.toFixed(1)}`);
    });
  });

  test('the PDF keeps every panel word vector under clear (the clear layer is under the text)', async () => {
    const { execFileSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'split-clear-pdf-'));
    const md = path.join(dir, 'clear.md');
    fs.writeFileSync(md, `---\nmarp: true\ntheme: carbone\nfinish: halo\n---\n\n<!-- _class: split-panel backdrop-clear -->\n\n${BODY}\n\n---\n\n<!-- _class: split-compare backdrop-clear -->\n\n${COMPARE}\n`);
    const out = execFileSync(process.execPath, [path.join(__dirname, '../../../lattice-emulator.js'), md, path.join(dir, 'clear.pdf')], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: resolveChrome() || '' } });
    const covered = out.split('\n').filter((l) => /slide \d+:.*\b\d+ covered\b/.test(l));
    assert.deepEqual(covered, [], `words were pushed into the photo as covered:\n${covered.join('\n')}`);
  }, { timeout: 300000 });

  // `stackedBelow` lets a fill pseudo through only when the text's branch really paints above
  // it. A `display: contents` child makes no box, so its z-index does nothing: text under it is
  // hidden on screen and must stay out of the vector layer (found by the #2457 checker).
  test('the PDF writer still counts text under a display:contents child as covered', async () => {
    const esbuild = require('esbuild');
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(__dirname, '../../../lib/core/pdf-compose/read-slide.mjs')],
      bundle: true, format: 'iife', globalName: 'RS', write: false, logLevel: 'error',
    }).outputFiles[0].text;
    const probe = await browser.newPage();
    const read = async (childDisplay) => {
      await probe.setContent(`<!doctype html><style>
        section{width:800px;height:450px;position:relative}
        .host{position:relative;isolation:isolate;display:flex;flex-direction:column;width:400px;height:300px}
        .host::before{content:"";position:absolute;inset:0;z-index:0;background:red}
        .kid{display:${childDisplay};z-index:1}
      </style><section><div class="host"><div class="kid"><p>Hidden words here</p></div></div></section>`);
      await probe.addScriptTag({ content: bundle });
      return probe.evaluate(() => RS.readSlide(document.querySelector('section')).words.map((w) => w.t));
    };
    try {
      assert.deepEqual(await read('contents'), [], 'text hidden under the layer was drawn as vector text');
      assert.deepEqual(await read('block'), ['Hidden', 'words', 'here'], 'text above the layer was pushed into the photo');
    } finally {
      await probe.close();
    }
  });

  test('finish-none keeps both panels opaque', async () => {
    const m = await read(OPTED_OUT, '.panel-left', '.panel-right');
    assert.notEqual(m.zoneBg, 'rgba(0, 0, 0, 0)');
    assert.equal(alphaOf(m.paneBg), 1);
  });
});
