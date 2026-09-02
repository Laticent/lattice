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

/**
 * Every selector text in a stylesheet, one entry per rule prelude.
 *
 * THE SKIP HERE USED TO BE `if (node.prelude?.type !== 'SelectorList') return`, annotated
 * "@keyframes percentages", and both halves of that were wrong.
 *
 *   · `@keyframes` preludes are NOT the excluded type. Measured against the pinned css-tree:
 *     `from`, `50%` and `to` each parse as a `SelectorList`, so they never took that branch —
 *     the exclusion has never once fired for the reason it names, and this bundle carries no
 *     keyframe rule at all (0 of 3241 preludes).
 *   · What the branch DID exclude is `Raw` — the type css-tree emits for a prelude IT CANNOT
 *     PARSE. `section..double` is a `Raw`. So the one class of selector most likely to be
 *     invalid was the one class never handed to the browser: a gate that skipped its own
 *     hardest cases and reported green.
 *
 * The bundle has zero `Raw` preludes today, so this was a hole rather than a live defect — but
 * a hole that widens silently, because a new one arrives already exempt.
 *
 * Both cases are handled by what they ACTUALLY are. A keyframe step is excluded by its
 * CONTEXT — `this.atrule` is the enclosing at-rule, so a rule inside `@keyframes` is skipped
 * whatever its prelude parses as, which is the real reason to skip it (`50%` is a valid
 * keyframe selector and an invalid CSS selector). Everything else goes to Chromium, `Raw`
 * included: the browser is the authority this file exists to consult, and a `Raw` that
 * Chromium accepts is css-tree being stricter than the shipping engine, which is not a defect.
 */
function selectorsOf(css) {
  const out = [];
  const ast = csstree.parse(css, { positions: true });
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      // A keyframe step is not a selector — skipped by CONTEXT, not by prelude type.
      if (/keyframes$/i.test(this.atrule?.name || '')) return;
      if (!node.prelude) return;
      out.push({ text: csstree.generate(node.prelude), line: node.loc?.start?.line ?? 0 });
    },
  });
  return out;
}

// The Chromium arm below can only fail if `selectorsOf` HANDS IT the bad selector, and for as
// long as the bundle is clean that arm passes whatever the reader does — which is exactly how the
// `Raw` skip sat here unnoticed. These pin the reader itself, need no browser, and would have
// failed on the old one.
describe('engine CSS — the reader hands the browser the selectors that matter', () => {
  test('a selector css-tree cannot parse still reaches the probe', () => {
    // `Raw`, the type the old skip discarded. Chromium rejects it, so it must get there.
    assert.deepEqual(selectorsOf('section..double { color: red }').map((s) => s.text),
      ['section..double'],
      'an unparseable prelude was dropped before the probe — the gate is blind to its hardest case');
  });

  test('a keyframe step is excluded — `50%` is a valid step and an invalid selector', () => {
    assert.deepEqual(selectorsOf('@keyframes x { from { opacity: 0 } 50% { opacity: .5 } }'), [],
      'a keyframe step reached the probe; `document.querySelector("50%")` throws, so the gate '
      + 'would fail on correct CSS');
  });

  test('ordinary rules are read, and nested at-rules do not hide them', () => {
    const got = selectorsOf('@media (min-width: 40em) { section.a > .b { color: red } } .c { color: blue }');
    // css-tree's generate() drops the whitespace around a combinator; Chromium accepts either.
    assert.deepEqual(got.map((s) => s.text), ['section.a>.b', '.c']);
  });
});

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
