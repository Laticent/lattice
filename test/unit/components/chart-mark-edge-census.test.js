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
 * manifests declare with `paint: "fill"`, MINUS two named exclusions — and each
 * exclusion has to earn its place here on every run, or the escape hatch becomes
 * the rule.
 *
 * EXCLUSION 1 — KNOCKOUTS. Six marks stroke in `var(--bg)`, the canvas color.
 * That is a separator, not an outline: its job is to hold two touching marks
 * apart, so its correct weight follows what it has to separate. Flattening one
 * into the other took quadrant's separator from 5.49px to 1px. The test below
 * re-derives `stroke: var(--bg)` from each member's own stylesheet, so a mark
 * cannot be parked here just to keep it thick.
 *
 * EXCLUSION 2 — WRAPPERS. `journey-face` names an <svg> element, not a shape, so
 * the rule could never reach the <circle> and <path> inside it. The test below
 * re-derives that from the transform that emits it.
 *
 * WHAT THESE ARMS CANNOT SEE, stated because a text matcher that implies more
 * than it checks is worse than one that admits its edge. They read CSS and JS as
 * TEXT, so a width laundered through an alias — `--w: var(--chart-edge);
 * stroke-width: var(--w)` — reaches the same value under a name no regex here
 * knows to follow. That shape is not caught and cannot cheaply be: following it
 * means resolving a custom-property graph across files.
 *
 * `tools/chart-structure-census.js --check` is the arm that closes it, and the
 * division of labour is deliberate: it asks the RENDER what every mark actually
 * paints, so it does not care how the width was spelled. These arms exist
 * because they are cheap enough to run on every commit; that one is the backstop
 * that cannot be written around.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const CSS = path.join(ROOT, 'lib/components/chart/_chart-family/chart-family.css');
const CHART_DIR = path.join(ROOT, 'lib/components/chart');

/** A knockout strokes the canvas color to separate touching marks. */
const KNOCKOUTS = {
  'funnel-band': 'funnel',
  'line-dot': 'line',
  'quadrant-dot': 'quadrant',
  'radar-dot': 'radar',
  'scatter-dot': 'scatter',
  'sbar-seg': 'stacked-bar',
  'quadrant-trail-after': 'quadrant',
  // The heatmap grid: at a 1.2-unit gap the canvas shows between cells and reads
  // as a black lattice over the data on a dark slide, so each cell strokes the
  // canvas instead. A separator, not an outline — its weight follows what it has
  // to separate, which is why it is here rather than on var(--chart-edge).
  'heatmap-cell': 'heatmap',
};

/** The class names an element that WRAPS shapes; a stroke on it paints nothing. */
const WRAPPERS = {
  'journey-face': { dir: 'journey', tag: 'svg' },
};

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

/**
 * Every class the family PINS — named by any shared rule that declares
 * `vector-effect: non-scaling-stroke`, not just the base one. The emphasis rule
 * pins too, and a class that only ever matches that one is still pinned.
 */
function pinnedClasses(css) {
  const re = /:is\(section\.chart-frame,\s*figure\.chart-frame\)\s*svg\s*:is\(([^)]*)\)\s*\{([^}]*)\}/g;
  const out = new Set();
  for (const m of css.matchAll(re)) {
    if (!/vector-effect:\s*non-scaling-stroke/.test(m[2])) continue;
    for (const c of m[1].split(',')) { const t = c.trim().replace(/^\./, ''); if (t) out.add(t); }
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

/** Every `selector { body }` pair in a member stylesheet, comments stripped. */
function rules(dir) {
  const f = path.join(CHART_DIR, dir, `${dir}.styles.css`);
  if (!fs.existsSync(f)) return [];
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
}

/**
 * The classes a selector's KEY compound carries — the part that decides which
 * element the rule lands on. `:is(section.quadrant:where(:not(.radar)), figure…)`
 * NESTS, so the argument lists are stripped by balancing parens: a `[^)]*` match
 * stops at the first `)` and leaves a tail that reads as a class of its own.
 */
function keyClasses(sel) {
  let s = sel.trim();
  for (;;) {
    const m = /:(where|is|not|has)\(/.exec(s);
    if (!m) break;
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < s.length && depth) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      i++;
    }
    s = s.slice(0, m.index) + s.slice(i);
  }
  const parts = s.split(/[\s>]+/).filter(Boolean);
  const key = parts[parts.length - 1] || '';
  return [...key.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1]);
}

/**
 * Split a selector list on its TOP-LEVEL commas. `:is(.gantt-bar, .gantt-milestone)`
 * carries a comma that separates nothing — splitting on it yields the fragment
 * `figure.gantt) :is(.gantt-bar`, whose "key compound" reads as `.gantt`.
 */
function splitSelectorList(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Every class a member stylesheet gives `stroke-width: var(--chart-edge…)`. */
function memberEdgeUsers() {
  const out = new Map();
  for (const dir of fs.readdirSync(CHART_DIR)) {
    for (const { sel, body } of rules(dir)) {
      // `--chart-edge` ANYWHERE in the value, not only as the outermost var():
      // `var(--nope, var(--chart-edge))` resolves to the token just the same.
      if (!/stroke-width:[^;}]*--chart-edge/.test(body)) continue;
      for (const one of splitSelectorList(sel)) {
        for (const c of keyClasses(one)) {
          if (!out.has(c)) out.set(c, new Set());
          out.get(c).add(dir);
        }
      }
    }
  }
  return out;
}

test('every fill-painted declared mark is covered by the shared edge rule', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const sel = sharedEdgeSelector(css);
  assert.ok(sel, 'no shared rule setting stroke-width: var(--chart-edge) found in chart-family.css');
  const declared = declaredFillMarks();
  const owed = [...declared].filter((c) => !(c in KNOCKOUTS) && !(c in WRAPPERS));
  const missing = owed.filter((c) => !sel.has(c)).sort();
  assert.deepStrictEqual(missing, [],
    `these marks declare paint:"fill" but the shared edge rule does not name them — they keep their own stroke-width: ${missing.join(', ')}`);
});

test('the shared edge rule names no class that is not a real mark', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const sel = sharedEdgeSelector(css);
  const declared = declaredFillMarks();
  const users = memberEdgeUsers();
  // A manifest declares the marks a member's KERNEL emits, which is not the
  // same set as the marks that carry an outline: a dashed reference polygon and
  // a hull's closing line are outlines nobody declared. Either source makes an
  // entry real; neither makes it real on its own.
  const stale = [...sel].filter((c) => !declared.has(c) && !users.has(c)).sort();
  assert.deepStrictEqual(stale, [],
    `the shared edge rule names classes that are neither a declared paint:"fill" mark nor given --chart-edge by any member — a stale entry styles nothing: ${stale.join(', ')}`);
});

/**
 * THE ARM THAT CATCHES THE LEAK. A member giving a mark `stroke-width:
 * var(--chart-edge)` gets a width with NO PHYSICAL MEANING unless the shared
 * rule also pins it with `vector-effect: non-scaling-stroke` — inside an SVG,
 * `1px` is one viewBox USER UNIT, and this family's viewBoxes span 4.3x. The
 * source text reads identically either way, which is exactly why this is a
 * test: `.radar-sector-mean` and `.quadrant-hull-line` took the token, missed
 * the list, and rendered at 1.24px and 1.29px beside a 1.00px neighbour.
 */
test('every class given --chart-edge by a member is pinned by the shared rule', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const pinned = pinnedClasses(css);
  const unpinned = [];
  for (const [cls, dirs] of memberEdgeUsers()) {
    if (pinned.has(cls)) continue;
    if (cls in KNOCKOUTS || cls in WRAPPERS) continue;
    // A class that only ever appears alongside one the rule DOES name is
    // pinned through that element — `.gantt-bar.chart-mark-active` is one
    // element, and `.gantt-bar` carries the pin.
    unpinned.push(`${cls} [${[...dirs].join(', ')}]`);
  }
  assert.deepStrictEqual(unpinned.sort(), [],
    `these take stroke-width: var(--chart-edge) with no vector-effect, so the width is in viewBox units and scales with the member:\n  ${unpinned.join('\n  ')}`);
});

test('the shared edge rule does not name an excluded mark', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const sel = sharedEdgeSelector(css);
  const excluded = [...Object.keys(KNOCKOUTS), ...Object.keys(WRAPPERS)];
  const contradictions = excluded.filter((c) => sel.has(c)).sort();
  assert.deepStrictEqual(contradictions, [],
    `these classes are listed here as exclusions AND named by the shared rule — one of the two is wrong: ${contradictions.join(', ')}`);
});

test('every excluded knockout really strokes the canvas color', () => {
  const bad = [];
  for (const [cls, dir] of Object.entries(KNOCKOUTS)) {
    const owning = rules(dir).filter((r) => new RegExp(`\\.${cls}(?![\\w-])`).test(r.sel));
    // A STATE RULE DOES NOT MAKE A MARK A KNOCKOUT. `.bar-mark:hover { stroke:
    // var(--bg) }` would satisfy a naive scan while the mark paints an ordinary
    // outline every moment a pointer is not on it — and a PDF has no pointer at
    // all. Only a rule that applies in the mark's resting state counts.
    const strokes = owning.filter((r) => /(^|[;{\s])stroke:\s*var\(--bg\)/.test(r.body))
      .filter((r) => !/:(hover|focus|focus-within|active|target|checked)\b/.test(r.sel))
      .filter((r) => !/\.chart-mark-active\b/.test(r.sel));
    if (!strokes.length) {
      bad.push(`${cls} (${dir}): no rule sets stroke: var(--bg) — if it is not a knockout it belongs in the shared rule`);
    }
  }
  assert.deepStrictEqual(bad, [], `a knockout exclusion must be re-derivable from the member's own CSS:\n  ${bad.join('\n  ')}`);
});

test('every excluded wrapper really names a wrapping element, not a shape', () => {
  const bad = [];
  for (const [cls, { dir, tag }] of Object.entries(WRAPPERS)) {
    const f = path.join(CHART_DIR, dir, `${dir}.transform.js`);
    const src = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    if (!new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b`).test(src)) {
      bad.push(`${cls}: ${dir}.transform.js does not emit it on a <${tag}> — a stroke on a shape belongs in the shared rule`);
    }
  }
  assert.deepStrictEqual(bad, [], `a wrapper exclusion must be re-derivable from the transform that emits it:\n  ${bad.join('\n  ')}`);
});

test('--chart-edge and --chart-edge-strong are defined, and strong is the heavier one', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  assert.match(css, /--chart-edge:\s*var\(--chart-hairline\)/,
    '--chart-edge must resolve to the family\'s resolution-stable hairline, not a literal');
  assert.match(css, /--chart-edge-strong:\s*calc\(var\(--chart-hairline\)\s*\*\s*2\)/,
    '--chart-edge-strong must be derived from the same token, so one change moves both');
});

test('no chart member re-declares a numeric stroke-width on a covered fill mark', () => {
  const declared = declaredFillMarks();
  const offenders = [];
  for (const dir of fs.readdirSync(CHART_DIR)) {
    for (const { sel, body } of rules(dir)) {
      if (!/stroke-width:\s*[0-9.]/.test(body)) continue;
      // A knockout's width is its own, and the arm above proves it IS one.
      //
      // This used to skip any rule containing `paint-order` — "a text halo is
      // not a mark edge" — which is true of a halo and false of the pie, whose
      // `.wedge` carries `paint-order: stroke` precisely so only the outer half
      // of its edge shows. A declared fill mark could have been given any
      // literal width under that exemption and shipped green. The canvas-colour
      // test is the one that actually separates a halo from an edge, and it is
      // the same test the knockout arm uses.
      for (const c of declared) {
        if (c in WRAPPERS) continue;
        if (!sel.includes(`.${c}`)) continue;
        // THE EXEMPTION COMES FROM THE CURATED LIST, NOT FROM THE RULE BODY.
        // Testing the body for `stroke: var(--bg)` let any rule buy its own
        // exemption by adding one declaration — which is exactly the dumping
        // ground the KNOCKOUTS docblock promises this cannot become. The list
        // is the gate; the arm above is what proves each entry on it earns the
        // place. A rule on a listed knockout still skips, because that is the
        // mark whose width is legitimately its own.
        if (c in KNOCKOUTS) break;
        offenders.push(`${dir}: ${sel.slice(0, 70)}`);
        break;
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    `a covered mark's edge must come from var(--chart-edge), not a per-member literal tuned in that member's own viewBox:\n  ${offenders.join('\n  ')}`);
});

/**
 * A WIDTH CAN ALSO ARRIVE AS A PRESENTATION ATTRIBUTE, where no CSS scan will
 * ever see it. Every arm above reads `*.styles.css`; a transform that writes
 * `stroke-width="1.2"` into the markup sets the same property from a file none
 * of them opens, and the mark still renders at a weight the family did not
 * choose. A presentation attribute also loses to any CSS rule, so one written
 * on a mark the shared rule covers is dead code that reads as live intent.
 *
 * Anything a transform must fix in place belongs in the exemption list with the
 * reason, exactly like the CSS knockouts.
 */
const SANCTIONED_ATTR_WIDTHS = {
  // journey-face is an ICON, not a datum: a 24x24 emoji-scale face whose stroke
  // weight is part of its drawing. Its class sits on the <svg> wrapper, so no
  // rule in the shared list can reach the <circle> and <path> that draw it.
  'journey.transform.js': ['journey-face'],
};

test('no transform sets a mark width as a presentation attribute', () => {
  const declared = declaredFillMarks();
  const offenders = [];
  for (const dir of fs.readdirSync(CHART_DIR)) {
    const f = path.join(CHART_DIR, dir, `${dir}.transform.js`);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const allowed = new Set(SANCTIONED_ATTR_WIDTHS[`${dir}.transform.js`] || []);
    // Any element string that names a declared mark AND sets stroke-width by
    // ATTRIBUTE or inline STYLE, in either order.
    //
    // THE VALUE IS NOT REQUIRED TO BE A LITERAL. A transform that computes a
    // width emits `stroke-width="${w}"`, and an arm that only matched digits
    // waved through the exact shape a transform actually writes — which is the
    // one this arm exists for. It now matches any value, and an interpolation
    // is as much a defect as a number: neither goes through `--chart-edge`.
    // Quoting is either style, and `=` may carry spaces.
    const SW = String.raw`(?:stroke-width\s*=\s*["']([^"']+)["']|style\s*=\s*["'][^"']*stroke-width\s*:\s*([^;"']+))`;
    const CLS = String.raw`class\s*=\s*["']([^"']*)["']`;
    const hits = [
      new RegExp(String.raw`<(\w+)[^>]*?${CLS}[^>]*?${SW}`, 'g'),
      new RegExp(String.raw`<(\w+)[^>]*?${SW}[^>]*?${CLS}`, 'g'),
    ];
    for (const [i, re] of hits.entries()) {
      for (const m of src.matchAll(re)) {
        const classes = (i === 0 ? m[2] : m[4]) || '';
        const width = (i === 0 ? m[3] ?? m[4] : m[2] ?? m[3]) || '';
        for (const c of classes.split(/\s+/)) {
          if (!declared.has(c) || allowed.has(c)) continue;
          offenders.push(`${dir}: <${m[1]} class="${c}" stroke-width=${width.trim()}>`);
        }
      }
    }
  }
  assert.deepStrictEqual([...new Set(offenders)].sort(), [],
    `a declared mark's edge must come from var(--chart-edge) in CSS, not a presentation attribute a CSS scan cannot see:\n  ${offenders.join('\n  ')}`);
});
