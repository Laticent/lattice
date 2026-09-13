/**
 * THE MARK-EDGE CONTRACT IS A CENSUS, NOT A HAND-PICKED LIST.
 *
 * `chart-family.css` gives every data mark one physical edge weight. The rule it
 * does that with names classes explicitly, because CSS cannot read a manifest —
 * and a hand-maintained list next to a declared one is a list that drifts. A new
 * chart member would join the family, declare its marks, and silently keep
 * whatever stroke-width its own stylesheet happened to set.
 *
 * So this test IS the link: the selector must carry exactly the classes the
 * manifests declare with `paint: "fill"`. Add a member, declare its marks, and
 * this fails until the shared rule covers it.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const CSS = path.join(ROOT, 'lib/components/chart/_chart-family/chart-family.css');
const CHART_DIR = path.join(ROOT, 'lib/components/chart');

function declaredFillMarks() {
  const out = new Set();
  for (const dir of fs.readdirSync(CHART_DIR)) {
    const f = path.join(CHART_DIR, dir, `${dir}.manifest.json`);
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const mark of m.kernel?.marks || []) if (mark.paint === 'fill') out.add(mark.class);
  }
  return out;
}

// The rule is identified by its declaration, not by a comment marker: a marker
// can be moved off the rule it labels, the declaration cannot.
function sharedEdgeSelector(css) {
  const re = /:is\(section\.chart-frame,\s*figure\.chart-frame\)\s*svg\s*:is\(([^)]*)\)\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    if (!/stroke-width:\s*var\(--chart-edge\)/.test(m[2])) continue;
    return new Set(m[1].split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean));
  }
  return null;
}

test('every fill-painted declared mark is covered by the shared edge rule', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const sel = sharedEdgeSelector(css);
  assert.ok(sel, 'no shared rule setting stroke-width: var(--chart-edge) found in chart-family.css');
  const declared = declaredFillMarks();
  const missing = [...declared].filter((c) => !sel.has(c)).sort();
  assert.deepStrictEqual(missing, [],
    `these marks declare paint:"fill" but the shared edge rule does not name them — they keep their own stroke-width: ${missing.join(', ')}`);
});

test('the shared edge rule names no class that is not a declared mark', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const sel = sharedEdgeSelector(css);
  const declared = declaredFillMarks();
  const stale = [...sel].filter((c) => !declared.has(c)).sort();
  assert.deepStrictEqual(stale, [],
    `the shared edge rule names classes no manifest declares as paint:"fill" — a stale entry styles nothing: ${stale.join(', ')}`);
});

test('--chart-edge and --chart-edge-strong are defined, and strong is the heavier one', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  assert.match(css, /--chart-edge:\s*var\(--chart-hairline\)/,
    '--chart-edge must resolve to the family\'s resolution-stable hairline, not a literal');
  assert.match(css, /--chart-edge-strong:\s*calc\(var\(--chart-hairline\)\s*\*\s*2\)/,
    '--chart-edge-strong must be derived from the same token, so one change moves both');
});

test('no chart member re-declares a numeric stroke-width on a declared fill mark', () => {
  const declared = declaredFillMarks();
  const offenders = [];
  for (const dir of fs.readdirSync(CHART_DIR)) {
    const f = path.join(CHART_DIR, dir, `${dir}.styles.css`);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = m;
      if (!/stroke-width:\s*[0-9.]/.test(body)) continue;
      // a text halo (paint-order: stroke) is not a mark edge
      if (/paint-order/.test(body)) continue;
      for (const c of declared) {
        if (sel.includes(`.${c}`)) { offenders.push(`${dir}: ${sel.trim().slice(0, 70)}`); break; }
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    `a declared mark's edge must come from var(--chart-edge), not a per-member literal tuned in that member's own viewBox:\n  ${offenders.join('\n  ')}`);
});
