/**
 * Unit: mermaid labels keep their baseline in WebKit (#2306).
 *
 * WebKit does not carry `dominant-baseline` down from a `<text>` to its `<tspan>`
 * lines, nor from a `<g>` to the `<text>` inside it, so a mermaid label paints
 * about a third of a font-size high in Safari. `mermaid.css` answers with one
 * rule that sets `dominant-baseline: inherit` inside every mermaid root. The
 * painted result needs a real WebKit (`tools/audit-svg-baselines.mjs`); this file
 * pins the three source facts that result depends on:
 *
 *   1. the rule exists, and still reaches `g` as well as `text` and `tspan`.
 *      Dropping `g` looks like a tidy-up and brings the architecture labels back
 *      (−3.54px): `inherit` on the `<text>` then copies an attribute-less
 *      group's `auto`;
 *   2. it skips a node that states its own baseline — author CSS beats a
 *      presentation attribute, so without `:not([dominant-baseline])` the rule
 *      would override one;
 *   3. its key, `aria-roledescription`, is still absent from every chart
 *      transform, so the rule stays off our own chart labels, whose baselines are
 *      pinned separately by `test/unit/components/svg-tspan-baseline.test.js`.
 *
 * engineering/decisions/2026-09-22-webkit-tspan-baseline.md §8.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const CSS = fs
  .readFileSync(path.join(REPO, 'lib/integrations/mermaid/mermaid.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule whose declarations include `dominant-baseline: inherit`. */
function inheritRules() {
  const out = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/dominant-baseline\s*:\s*inherit\b/.test(m[2])) out.push(m[1].trim());
  }
  return out;
}

describe('mermaid.css — dominant-baseline inherits inside a mermaid root', () => {
  test('exactly one rule, keyed on the mermaid root', () => {
    const rules = inheritRules();
    assert.equal(rules.length, 1, `expected one inherit rule, found: ${JSON.stringify(rules)}`);
    assert.match(rules[0], /svg\[aria-roledescription\]/);
  });

  test('it reaches g, text and tspan — the group is load-bearing', () => {
    const sel = inheritRules()[0] ?? '';
    const list = sel.match(/:is\(([^)]*)\)\s*:not\(\[dominant-baseline\]\)\s*$/);
    assert.ok(list, `selector must end in :is(<elements>):not([dominant-baseline]), got: ${sel}`);
    const els = list[1].split(',').map((s) => s.trim());
    for (const el of ['g', 'text', 'tspan']) {
      assert.ok(els.includes(el), `inherit rule no longer covers <${el}>: ${sel}`);
    }
  });

  test('no chart transform emits aria-roledescription, so the rule stays off chart labels', () => {
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|mjs)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('aria-roledescription')) {
          hits.push(path.relative(REPO, p));
        }
      }
    };
    walk(path.join(REPO, 'lib/components/chart'));
    assert.deepEqual(hits, [], 'a chart SVG carrying aria-roledescription would pick up the mermaid inherit rule');
  });
});
