/**
 * FRAME-CONFORMANCE render gate — the real-surface half of the frame-conformance
 * invariant (engineering/decisions/2026-07-15-model-driven-frame-render.md §2).
 *
 * The pure CHECK (lib/forms/frame-conformance.js, unit-tested against fixtures)
 * asserts a rendered slide contains every Cell its frame declares. THIS gate runs
 * that check against a REAL emulator render of every component that opted into
 * `conformance: "strict"`: it renders the component's sample under the Form default
 * (Form-ON — the composition the model describes, NOT the form:off component-
 * isolation deck) and asserts the declared cell tree MATERIALIZED — i.e. the strict
 * component's stage Cell is actually built, not just declared.
 *
 * OPT-IN, ONE COMPONENT AT A TIME. With zero strict components this is a no-op
 * (the enumeration is empty → the describe body registers no assertions). The
 * first real subject is `contact` (PR 1), whose canvas card is now wrapped in a
 * `.cell-stage` cell by the masthead kernel — proven byte-identical AND
 * probe-verdict-identical before the flag flipped (§5, the PROTECTED measuring
 * machinery). A component's flag is flipped only after that proof, so this gate
 * asserting the cell materialized is the durable backstop that it stays wrapped.
 *
 * Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator — the emulator
 * spawns a browser to lay out the deck and writes the HTML sidecar this asserts on.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renderHtml, ROOT } = require('../../helpers/semantic-render');
const { conformanceViolations, CELL_DOM_CLASS } = require('../../../lib/forms/frame-conformance');

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

/** Every component manifest that opted into `conformance: "strict"`, sorted by name. */
function strictComponents() {
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.manifest.json')) out.push(p);
    }
  })(path.join(ROOT, 'lib', 'components'));
  return out
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
    .filter((m) => m.conformance === 'strict');
}

// A Form-ON deck (the default composition) carrying just the component's sample
// slide — the surface the model describes. NOT deckFromSample (which pins
// `form: off` for the component-isolation invariants); the stage Cell is a Form
// composition, so it only materializes under Form-ON.
function formDeck(sample, palette = 'indaco') {
  return `---\nmarp: true\ntheme: ${palette}\n---\n\n${String(sample).trim()}\n`;
}

// Every strict frame declares the `stage` Cell (frame manifests all list
// cells:["stage"]); the migration's job is to prove it materialized. Passing the
// literal expected set keeps this gate independent of the component→frame
// resolution wiring — that resolution is exercised by the pure kernel's own tests.
const EXPECTED_CELLS = ['stage'];

describe('frame-conformance render gate (strict components materialize their cells)', () => {
  const chrome = resolveChrome();
  const strict = strictComponents();

  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }
  process.env.CHROME_PATH = chrome;

  // Dormant by construction: zero strict components → no assertions registered.
  for (const m of strict) {
    test(`${m.name}: declared cells materialize under Form-ON`, () => {
      const html = renderHtml(formDeck(m.sample), { key: `conformance-${m.name}`, timeout: 240000 });
      const slideHtml = fs.readFileSync(html, 'utf8');
      const violations = conformanceViolations({
        component: m.name,
        expectedCells: EXPECTED_CELLS,
        slideHtml,
        cellClassOf: CELL_DOM_CLASS,
      });
      assert.deepEqual(violations, [], violations.join('\n'));
    });
  }
});
