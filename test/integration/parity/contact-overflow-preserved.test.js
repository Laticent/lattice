/**
 * PROTECTED-machinery regression — the `contact` conformance:strict migration
 * MUST NOT change the overflow-probe verdict
 * (engineering/decisions/2026-07-15-model-driven-frame-render.md §5).
 *
 * When contact opted into `conformance:"strict"` its self-sizing QR card began
 * hoisting into the frame's `.cell-stage` — a bounded flex column. Because the
 * card carries `overflow:hidden`, a naive wrap let the flex layout SHRINK an
 * over-tall card to fit the stage and clip its excess INVISIBLY, flipping the
 * overflow-probe verdict `over:true → over:false` (a silent clip, no red ring, no
 * export "Overflows" warning — the exact regression overflow-probe.js warns
 * about). The fix pins the card to self-size
 * (`section.contact > .cell-stage > .qr-card { flex: 0 0 auto }`) so an overstuffed
 * card grows PAST the stage and the clip-cell probe catches it, exactly as when
 * the card was a direct section child.
 *
 * This gate renders a FITTING and an OVERSTUFFED (a long wrapping name → tall
 * card) contact slide under Form-ON and asserts the REAL probeSectionOverflow
 * verdict: fitting → not over, overstuffed → over. If the flex pin regresses, the
 * overstuffed case silently flips to `over:false` and this fails.
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

// A fitting card (its sample) and an overstuffed one (a very long name wraps at
// --fs-hero to several lines, pushing the card well past the ~600px stage).
const FITTING = `<!-- _class: contact -->

- Ada Slide \`name\`
- One scan saves the speaker \`title\`
- SlideWright \`org\`
- hello@slidewright.dev \`email\`
`;

const OVERSTUFFED = `<!-- _class: contact -->

- Alexandria Bartholomew Christopherson Featherstonehaugh Wolfeschlegelsteinhausenbergerdorff \`name\`
- Distinguished Principal Staff Systems Architect and Head of Platform \`title\`
- SlideWright Advanced Presentation Systems International Holdings \`org\`
- alexandria.featherstonehaugh@slidewright-international-holdings.example \`email\`
- +1-555-0142 extension 99815 \`phone\`
- slidewright-international-holdings.example/team/alexandria/profile \`url\`
- Scan to add me — this call to action runs long across several wrapped lines so the identity card grows well past the height of the stage cell \`caption\`
`;

describe('contact overflow detection is preserved after the conformance:strict wrap', () => {
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
    const hasStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage'));
    await page.close();
    return { over: v.over, hasStage };
  }

  test('a fitting contact card does NOT overflow (and is wrapped in a stage cell)', async () => {
    const v = await probeFirstSection(FITTING, 'contact-overflow-fitting');
    assert.equal(v.hasStage, true, 'contact should hoist into a .cell-stage under Form (conformance:strict)');
    assert.equal(v.over, false, 'a fitting contact card must not report overflow');
  });

  test('an overstuffed contact card DOES overflow — the wrap must not swallow it', async () => {
    const v = await probeFirstSection(OVERSTUFFED, 'contact-overflow-overstuffed');
    assert.equal(v.hasStage, true);
    assert.equal(
      v.over,
      true,
      'REGRESSION: an over-tall contact card was silently clipped by the stage wrap instead of ' +
        'reporting overflow — the flex `flex:0 0 auto` pin on section.contact > .cell-stage > .qr-card ' +
        'is missing or ineffective (see contact.styles.css / model-driven frame render §5).',
    );
  });
});
