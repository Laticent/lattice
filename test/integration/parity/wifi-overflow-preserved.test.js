/**
 * PROTECTED-machinery regression — the `wifi` conformance:strict migration MUST
 * NOT change the overflow-probe verdict
 * (engineering/decisions/2026-07-15-model-driven-frame-render.md §5/§6).
 *
 * `wifi` is the second canvas migration (after `contact`). Its QR card rebuilds
 * the section (renderCard → `.qr-card`), emitting its title as an in-card
 * `.qr-head > h2`; the masthead kernel's depth-aware `findTopLevelH2` leaves that
 * nested title in place (no masthead band) and wraps the finished card in the
 * frame's `.cell-stage` — a bounded flex column. Two guards keep the overflow
 * verdict honest across that wrap:
 *   · `section.wifi > .cell-stage > .qr-card { flex: 0 0 auto }` pins the card to
 *     self-size, so a genuinely over-tall card grows PAST the stage instead of
 *     being flex-shrunk to fit (the same guard contact needed).
 *   · `section.wifi > .cell-stage { overflow-clip-margin: 1.5em }` lets the stage
 *     PAINT the QR's quiet-zone padding out into the frame's safe margin while
 *     keeping `overflow:clip`; the probe reads scrollHeight−clientHeight, which
 *     the paint margin does not touch, so overflow detection is unchanged.
 *
 * This gate renders a FITTING and an OVERSTUFFED (a very long name / title / CTA
 * → tall card) wifi slide under Form-ON and asserts the REAL probeSectionOverflow
 * verdict: fitting → not over, overstuffed → over. If a guard regresses, the
 * overstuffed case silently flips to `over:false` (or the fitting case flips to
 * `over:true`) and this fails.
 *
 * Needs Chromium + the emulator (renders the deck, probes the laid-out DOM).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { CLIP_CELL_SELECTOR, probeSectionOverflow } = require('../../../lib/core/overflow-probe');

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

function formDeck(sample) {
  return `---\nmarp: true\ntheme: indaco\n---\n\n${sample.trim()}\n`;
}

// A fitting card (short title, three fields) and an overstuffed one (a long
// wrapping title + long field values + a long CTA push the card well past the
// stage).
const FITTING = `<!-- _class: wifi -->

\`connect · wifi\`

## Join the room.

- Lattice-Demo \`ssid\`
- specimen2026 \`password\`
- WPA2 \`security\`
`;

const OVERSTUFFED = `<!-- _class: wifi -->

\`connect · wifi\`

## Join the extraordinarily long boardroom network name that wraps across several lines of the masthead title area.

- Offsite-Guest-Network-With-A-Very-Long-Broadcast-Name-2026 \`ssid\`
- an-exceptionally-long-passphrase-that-nobody-would-type-by-hand-2026 \`password\`
- WPA2-Enterprise \`security\`
- Scan to connect — this call to action also runs long across several wrapped lines to push the identity card well past the height of the stage cell so the probe must catch it \`caption\`
`;

describe('wifi overflow detection is preserved after the conformance:strict wrap', () => {
  const chrome = resolveChrome();
  let browser;

  if (!chrome) {
    test('SKIPPED — no Chromium available', { skip: true }, () => {});
    return;
  }
  process.env.CHROME_PATH = chrome;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  async function probeFirstSection(sample, key) {
    const html = renderHtml(formDeck(sample), { key, timeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    // Puppeteer serializes probeSectionOverflow (a self-contained function — its
    // helpers are nested inside its body, per overflow-probe.js's injection
    // contract) and runs it in-page against the first <section>. No eval.
    const v = await page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1);
    const inCardTitle = await page.$eval('section', (s) => !!s.querySelector('.qr-head > h2') && !s.querySelector('.cell-masthead'));
    const hasStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage'));
    await page.close();
    return { over: v.over, hasStage, inCardTitle };
  }

  test('a fitting wifi card does NOT overflow (title in-card, wrapped in a stage cell)', async () => {
    const v = await probeFirstSection(FITTING, 'wifi-overflow-fitting');
    assert.equal(v.hasStage, true, 'wifi should hoist into a .cell-stage under Form (conformance:strict)');
    assert.equal(v.inCardTitle, true, 'wifi keeps its title in-card (.qr-head > h2) — no masthead band');
    assert.equal(v.over, false, 'a fitting wifi card must not report overflow');
  });

  test('an overstuffed wifi card DOES overflow — the wrap must not swallow it', async () => {
    const v = await probeFirstSection(OVERSTUFFED, 'wifi-overflow-overstuffed');
    assert.equal(v.hasStage, true);
    assert.equal(v.inCardTitle, true);
    assert.equal(
      v.over,
      true,
      'REGRESSION: an over-tall wifi card was silently clipped by the stage wrap instead of ' +
        'reporting overflow — the flex `flex:0 0 auto` pin on section.wifi > .cell-stage > .qr-card ' +
        'is missing or ineffective (see wifi.styles.css / model-driven frame render §5/§6).',
    );
  });
});
