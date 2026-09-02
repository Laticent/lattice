/**
 * Unit: every selector in the built engine bundle parses.
 *
 * The defect this exists to catch is SILENT. A stylesheet parser is forgiving:
 * an invalid selector does not raise, it drops the whole rule and moves on — no
 * console warning, no build error, no failing gate. The declarations simply never
 * apply, and the only signal is a render that looks subtly wrong for a reason no
 * one can find by reading the CSS, because the CSS reads correctly.
 *
 * It was found the expensive way. A lone-bullet split page (base.modifiers.css,
 * § "A LONE BARE MEMBER") wrote its `ul` test as
 * `:has(> li:only-child:not(:has(…)))`. `:has()` may not nest inside `:has()` —
 * the relational pseudo-class is forbidden inside its own argument — so Chromium
 * rejected the selector and dropped the rule. The neighbouring `li` rule put its
 * `:has()` inside a top-level `:not()`, which is legal, so HALF the fix applied:
 * the type stepped up and the bullet marker stayed. It took a real portrait
 * render plus a computed-style probe to see it.
 *
 * NEITHER EXISTING TIER CAN SEE THIS. `build:check` runs the bundle through
 * css-tree, which accepts nested `:has()` and re-serializes it unchanged
 * (measured). And a passing render proves nothing — a dropped rule renders fine,
 * it just renders without the rule. Only the parser that actually ships can
 * answer, so this asks Chromium.
 *
 * `querySelector` in a try/catch is the probe: it uses the same selector grammar
 * as the stylesheet parser and throws `SyntaxError` on exactly what that parser
 * would reject. Conservative in the right direction — it never passes something
 * the stylesheet parser drops.
 *
 * SKIPS, never fails, with no Chromium: `npm test` stays render-free, and the
 * same assertion runs in CI where Chromium is installed.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const csstree = require('css-tree');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.resolve(__dirname, '../../..');

/** Every selector text in a stylesheet, one entry per rule prelude. */
function selectorsOf(css) {
  const out = [];
  const ast = csstree.parse(css, { positions: true });
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude?.type !== 'SelectorList') return; // @keyframes percentages
      out.push({ text: csstree.generate(node.prelude), line: node.loc?.start?.line ?? 0 });
    },
  });
  return out;
}

describe('engine CSS — every selector parses in the browser that ships it', () => {
  const exe = resolveChrome();
  let browser;
  let page;

  before(async () => {
    if (!exe) return;
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
  });

  after(async () => { if (browser) await browser.close(); });

  // The bundle is what ships; the two sources are what a person edits, so a
  // failure names a file someone can open rather than a line in a 1.6MB artifact.
  for (const rel of ['dist/lattice.css', 'dist/lattice-default.css']) {
    test(`${rel} has no selector Chromium rejects`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) return t.skip(`${rel} not built — run npm run build`);
      const selectors = selectorsOf(fs.readFileSync(file, 'utf8'));
      assert.ok(selectors.length > 1000, `expected a real bundle, parsed ${selectors.length} rules`);

      const bad = await page.evaluate((list) => list.filter((s) => {
        try { document.querySelector(s.text); return false; } catch { return true; }
      }), selectors);

      assert.deepEqual(bad, [], bad.length
        ? `${bad.length} selector(s) in ${rel} are invalid and their rules are SILENTLY DROPPED:\n`
          + bad.slice(0, 10).map((s) => `  line ${s.line}: ${s.text.slice(0, 200)}`).join('\n')
        : '');
    });
  }
});
