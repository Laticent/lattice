/**
 * AXE — the automated accessibility gate (semantic-HTML ADR gap G10).
 *
 * WHY THIS EXISTS, and why it is worth more than the hand-written gates beside it.
 *
 * `semantic-structure.test.js` checks invariants *we thought of*: slide stays
 * `<section>`, one `<header>` per slide, `<article>` only where sanctioned. That is a
 * floor, and the ADR's own history shows how low a floor: three separate categories of
 * content (all math, funnel/quadrant charts, state-chart status) were absent from the
 * accessibility tree for months, and every gate in the repo stayed green — because every
 * gate measured pixels or behavior and none measured the accessibility tree. Two of those
 * were found by hand, one by an adversarial review, none by a test.
 *
 * `axe-core` inverts that: it checks the rules *someone else* thought of — the whole
 * WCAG 2.1 A/AA rule set — against the real, laid-out DOM in a real browser. It catches
 * the class of defect a bespoke assertion cannot, because a bespoke assertion only ever
 * encodes a defect you already understand.
 *
 * THE TWO SHIPPED SHELLS. The ADR's map has three surfaces and they diverge:
 *   1. the ENGINE render        — what every path starts from (covered by the hand-written
 *                                 gates beside this file; NOT run through axe here)
 *   2. the EXPORT shell         — the PDF/HTML artifact people actually ship  ← gated
 *   3. the HTML PLAYER          — the self-contained "Download as webpage" deliverable ← gated
 * Axe runs on the two ARTIFACTS. Every landmark this ADR added lives in #2 and #3, so a
 * gate that stopped at the engine would have watched the one surface that didn't change.
 * The player's own banner regression (the deck title sitting outside every landmark) was
 * found by running this against #3.
 *
 * COLOR-CONTRAST IS DELIBERATELY EXCLUDED, and the reason is narrower than it looks.
 * ONE gate should own contrast; the repo nominally has one (`tools/check-slide-contrast.js`),
 * and two gates disagreeing about a ratio is worse than one gate owning it. That is the
 * whole justification.
 *
 * An earlier version of this comment gave a second reason — that axe's background
 * resolution is "demonstrably wrong on this layered fixed canvas" — and it was false. It
 * conflated two different elements to manufacture an axe bug. Axe was right: it had found
 * a running header rendering near-white on cream at 1.11:1 (`split-panel watermark
 * mirror`), a real and visible defect, now fixed. Do not restore that reasoning; if this
 * rule is ever re-enabled, expect it to find things.
 *
 * What axe surfaces on contrast is tracked in the ADR's gap register (G13/G15/G16), not
 * discarded: the running header/footer muted ink measures 4.20:1 (light) / 4.07:1 (dark),
 * which is below the 4.5:1 normal-text threshold on every shell — the slide canvas is
 * nominally 3840px wide, so the chrome's 43.4px clears the "large text" line only in
 * canvas units, never in anything a human looks at. Fixing it is a theme-token change,
 * well outside this gate.
 *
 * BUDGETS are exceed-only and seeded at zero. Both shells are clean today, so zero is
 * the honest number and any regression fails. A budget above zero here would be a
 * scoreboard rather than a gate.
 *
 * WHAT THIS DOES NOT COVER, stated so the green is not read as more than it is:
 *   · ONE deck (`gallery.md`) — a component catalog, which the ADR itself calls
 *     unrepresentative of a real boardroom deck;
 *   · ONE viewport (1280×720), so nothing responsive, and never the fluid view;
 *   · the player's DEFAULT PRESENT VIEW ONLY. Read·Article and Read·Slides are never
 *     switched to, and those are where the prose projection clones and re-hosts content —
 *     a different DOM entirely, reached by a real user in one click;
 *   · the ENGINE render (covered by the structural gates beside this file, not by axe);
 *   · `color-contrast` (see above);
 *   · the exported PDF's tag tree, which no gate in this repo reads at all — that gap is
 *     how a `/Figure` regression once passed everything here (ADR §18.3).
 * Each line is a place a defect can ship green.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const puppeteer = require('puppeteer');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');

// The axe bundle, evaluated as SOURCE rather than injected via addScriptTag: the player
// ships a strict CSP, and a `<script src>` is blocked there. `page.evaluate(src)` runs in
// the page's own context and is not subject to script-src.
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

// The rule set: WCAG 2.0/2.1 A and AA, plus axe's best-practice rules (which is where
// `region` lives — the rule that caught the player's unlandmarked deck title).
const AXE_RUN_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  rules: { 'color-contrast': { enabled: false } }, // owned by tools/check-slide-contrast.js — see header
};

/** Exceed-only, seeded at the measured truth. Both shells are clean; zero is honest. */
const VIOLATION_BUDGET = { 'export shell': 0, 'html player': 0 };

/**
 * `incomplete` rules we have looked at and decided ARE defects on these surfaces, so
 * they fail rather than merely print. `duplicate-id-aria` is here because an ARIA
 * reference that resolves to an arbitrary one of two identical ids is exactly the kind
 * of thing that works by luck until it doesn't — and because this branch minted such a
 * pair itself.
 */
const ENFORCED_INCOMPLETE = new Set(['duplicate-id-aria']);
// NOT `duplicate-id`: in axe-core 4.12.1 it is tagged
// ["cat.parsing","wcag2a-obsolete","wcag411","deprecated"], and none of those appear in
// AXE_RUN_OPTIONS' tag list — so it can never fire and listing it read as coverage that
// did not exist. Verified with `axe.getRules()`, not assumed from the rule name.

const DECK = path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md');

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

/** Render the gallery through the real emulator; returns the HTML sidecar's path. */
function render(outPdf, extraArgs = []) {
  const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), DECK, outPdf, ...extraArgs], {
    cwd: ROOT, encoding: 'utf8', timeout: 900000,
  });
  assert.equal(res.status, 0, `render failed (${extraArgs.join(' ') || 'export'}):\n${res.stderr}`);
  const html = outPdf.replace(/\.pdf$/, '.html');
  assert.ok(fs.existsSync(html), `expected an HTML sidecar at ${html}`);
  return html;
}

describe('axe — the WCAG rule set, on every shipped shell (G10)', () => {
  let browser;
  let dir;
  const shells = {};

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-axe-'));
    shells['export shell'] = render(path.join(dir, 'export.pdf'));
    shells['html player'] = render(path.join(dir, 'player.pdf'), ['--player']);
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--allow-file-access-from-files'],
    });
  });
  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const shell of Object.keys(VIOLATION_BUDGET)) {
    test(`${shell} has no accessibility violations`, { timeout: 900000 }, async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${shells[shell]}`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 1500)); // let the runtime settle (fit, watchers)
      await page.evaluate(AXE_SRC);
      const { violations, incomplete } = await page.evaluate(async (opts) => {
        const shape = (v) => ({
          id: v.id,
          impact: v.impact,
          count: v.nodes.length,
          help: v.help,
          sample: (v.nodes[0]?.html || '').slice(0, 120),
        });
        // BOTH buckets. `resultTypes: ['violations']` throws `incomplete` away, and that
        // is not a lesser bucket — it is "axe found this but cannot decide alone". The
        // first version of this gate discarded it, and `duplicate-id-aria` was sitting
        // in there, firing on ids THIS BRANCH had just minted. The gate installed to
        // catch what we didn't think of caught exactly that, and the assertion was
        // written not to look.
        const res = await window.axe.run(document, { ...opts, resultTypes: ['violations', 'incomplete'] });
        return { violations: res.violations.map(shape), incomplete: res.incomplete.map(shape) };
      }, AXE_RUN_OPTIONS);
      await page.close();

      const fmt = (list) => list
        .map((v) => `  · ${v.id} (${v.impact}, ${v.count} node${v.count === 1 ? '' : 's'}): ${v.help}\n      ${v.sample}`)
        .join('\n');
      assert.ok(
        violations.length <= VIOLATION_BUDGET[shell],
        `${shell}: ${violations.length} axe violation type(s), budget ${VIOLATION_BUDGET[shell]}\n${fmt(violations)}\n` +
        'Fix the violation, or — if it is genuinely not a defect — disable that ONE rule in ' +
        'AXE_RUN_OPTIONS with the reason, the way color-contrast is. Do not raise the budget.',
      );
      // INCOMPLETE is reported, and the rules we have actually adjudicated are enforced.
      // The rest is printed rather than asserted, because "axe cannot decide" is not the
      // same as "this is a defect" — but it must be VISIBLE, which is the whole lesson.
      if (incomplete.length) process.stdout.write(`# axe incomplete (${shell}):\n${fmt(incomplete)}\n`);
      const adjudicated = incomplete.filter((v) => ENFORCED_INCOMPLETE.has(v.id));
      assert.deepEqual(
        adjudicated.map((v) => v.id), [],
        `${shell}: an adjudicated 'incomplete' rule fired — these are real here:\n${fmt(adjudicated)}`,
      );
    });
  }

  test('the gate is actually running axe (not silently passing on a blank page)', { timeout: 900000 }, async () => {
    // A green a11y gate is indistinguishable from a broken one unless you prove the
    // instrument fires. This deliberately breaks a rule and asserts axe reports it — so
    // "0 violations" above means "axe ran and found nothing", not "axe never loaded".
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${shells['export shell']}`, { waitUntil: 'networkidle0' });
    await page.evaluate(AXE_SRC);
    const found = await page.evaluate(async (opts) => {
      const img = document.createElement('img'); // an <img> with no alt — image-alt, a WCAG A rule
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      document.body.appendChild(img);
      const res = await window.axe.run(document, { ...opts, resultTypes: ['violations'] });
      img.remove();
      return res.violations.map((v) => v.id);
    }, AXE_RUN_OPTIONS);
    assert.ok(found.includes('image-alt'), `axe must detect a planted alt-less <img>; saw: ${found.join(', ') || '(none)'}`);
  });
});
