/**
 * Unit: the `align:` register resolver (lib/core/resolve-align.js).
 *
 * Where a slide's content sits, up and down and side to side (owner, 2026-11-06,
 * engineering/decisions/2026-11-06-unified-align.md). The COMPONENT declares its up-and-down
 * default in its manifest (baked into align-catalog.generated.js); the AUTHOR overrides it
 * deck-wide with `align:` or on one slide with `_class: align-*`; this kernel resolves the two
 * and the engine stamps the answer as `data-align`.
 *
 * The load-bearing distinction: OMITTING `align:` is not the same as writing `align: middle`.
 * Omission means "the component decides", and a component may decide differently per shape.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  VERTICAL,
  HORIZONTAL,
  ALIGN_CSS,
  ALIGN_TOKENS,
  parseAlign,
  alignClasses,
  readFrontMatterAlign,
  alignClassesFromSource,
  isKnownAlign,
  expandAlignClasses,
  deckAlignTokensFor,
  governedComponent,
  componentAlign,
  resolveAlign,
} = require('../../../lib/core/resolve-align');
const CATALOG = require('../../../lib/core/align-catalog.generated.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../../', p), 'utf8');

/** Blank out comments and string/template literals in ONE left-to-right pass, so a brace or a
 *  call name written inside prose or a string cannot be mistaken for code. A pass per construct
 *  cannot do this: stripping `//` comments first eats the tail of any string holding a URL. */
function stripJs(src) {
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = (end < 0 ? src.length : end + 1);
      out += ' ';
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      out += ' \n';
    } else if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < src.length && src[i] !== c) i += (src[i] === '\\' ? 2 : 1);
      out += '""';
    } else out += c;
  }
  return out;
}

/** The body of the first function whose declaration starts with `head`, brace-matched. */
function functionBody(src, head) {
  const code = stripJs(src);
  const at = code.indexOf(head);
  assert.ok(at >= 0, `${head} not found`);
  const open = code.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') { depth -= 1; if (!depth) return code.slice(open + 1, i); }
  }
  assert.fail(`unbalanced braces after ${head}`);
}

/** Occurrences of `name(` that are a STATEMENT at the body's own brace depth: nothing but
 *  whitespace since the last `;` `{` or `}`. Catches `if (x) f();`, `if (x) { f(); }`,
 *  `x && f();` and `x ? f() : g();` alike — none of them survive. */
function unconditionalCalls(body, name) {
  const hits = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(body))) {
    let depth = 0;
    for (let i = 0; i < m.index; i += 1) {
      if (body[i] === '{') depth += 1;
      else if (body[i] === '}') depth -= 1;
    }
    if (depth !== 0) continue;
    const boundary = Math.max(body.lastIndexOf(';', m.index), body.lastIndexOf('{', m.index),
      body.lastIndexOf('}', m.index));
    if (!body.slice(boundary + 1, m.index).trim()) hits.push(m.index);
  }
  return hits;
}

/** Innermost `selector { body }` rules, comments stripped. `[^{}]*` on the body confines each
 *  match to a leaf block, so an at-rule prelude is never mistaken for a selector. */
function cssRules(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(bare))) out.push({ selector: m[1], body: m[2] });
  return out;
}

describe('resolve-align', () => {
  test('the two axes and their words', () => {
    assert.deepEqual([...VERTICAL], ['top', 'middle', 'bottom', 'spread', 'fill']);
    assert.deepEqual([...HORIZONTAL], ['left', 'center', 'right', 'full']);
    assert.deepEqual([...ALIGN_TOKENS], [...VERTICAL, ...HORIZONTAL].map((w) => `align-${w}`));
    assert.deepEqual(Object.keys(ALIGN_CSS).sort(), [...VERTICAL].sort());
    assert.equal(ALIGN_CSS.top, 'flex-start', 'the author-facing word is not the CSS value');
    assert.equal(ALIGN_CSS.spread, 'space-evenly');
  });

  test('one word or two, in any order, each word on its own axis', () => {
    assert.deepEqual(alignClasses('bottom right'), ['align-bottom', 'align-right']);
    assert.deepEqual(alignClasses('right bottom'), ['align-bottom', 'align-right']);
    assert.deepEqual(alignClasses('top'), ['align-top']);
    assert.deepEqual(alignClasses('left'), ['align-left']);
    assert.deepEqual(alignClasses('  TOP  Left '), ['align-top', 'align-left']);
  });

  test('`center` alone centers both axes; beside a vertical word it is side to side only', () => {
    assert.deepEqual(alignClasses('center'), ['align-middle', 'align-center']);
    assert.deepEqual(alignClasses('top center'), ['align-top', 'align-center']);
    assert.deepEqual(parseAlign('center'), { v: 'middle', h: 'center', unknown: [], duplicate: [] });
  });

  test('an unknown word and a second word for one axis are reported, and stamp nothing', () => {
    assert.deepEqual(parseAlign('centre'), { v: null, h: null, unknown: ['centre'], duplicate: [] });
    assert.deepEqual(parseAlign('top bottom'), { v: 'top', h: null, unknown: [], duplicate: ['bottom'] });
    assert.deepEqual(alignClasses('flex-start'), [], 'the CSS value is not the author-facing word');
    assert.deepEqual(alignClasses(''), []);
    assert.deepEqual(alignClasses(undefined), []);
    assert.ok(isKnownAlign('bottom right'));
    assert.ok(!isKnownAlign('top bottom'));
    assert.ok(!isKnownAlign('align-top'), 'the class is not a deck value');
    assert.ok(!isKnownAlign(''));
  });

  test('readFrontMatterAlign extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\nalign: bottom right\n---\n\n# H\n\n`align: not-this` in body\n';
    assert.equal(readFrontMatterAlign(md), 'bottom right');
    assert.deepEqual(alignClassesFromSource(md), ['align-bottom', 'align-right']);
    assert.equal(readFrontMatterAlign('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterAlign(''), null);
  });

  test('a compound per-slide class splits into its two atomic classes', () => {
    assert.deepEqual(expandAlignClasses(['kpi', 'align-bottom-right']), ['kpi', 'align-bottom', 'align-right']);
    assert.deepEqual(expandAlignClasses(['align-left-top']), ['align-top', 'align-left']);
    assert.deepEqual(expandAlignClasses(['align-top-bottom']), ['align-top-bottom'], 'two words on one axis is not a compound');
    assert.deepEqual(expandAlignClasses(['head-align-right']), ['head-align-right']);
  });

  test('a slide word beats the deck word on its own axis only', () => {
    const deck = ['align-bottom', 'align-right'];
    assert.deepEqual(deckAlignTokensFor(['kpi', 'align-top'], deck), ['align-right']);
    assert.deepEqual(deckAlignTokensFor(['kpi', 'align-left'], deck), ['align-bottom']);
    assert.deepEqual(deckAlignTokensFor(['kpi', 'align-center'], deck), [], '`align-center` alone names both axes');
    assert.deepEqual(deckAlignTokensFor(['kpi', 'align-top', 'align-center'], deck), []);
    assert.deepEqual(deckAlignTokensFor(['kpi'], deck), deck);
  });

  // ── the component's own declaration ──────────────────────────────────────────
  test('a component with no manifest entry is not governed at all', () => {
    assert.equal(governedComponent(['quote', 'form']), null);
    assert.equal(componentAlign('quote'), null);
    assert.equal(resolveAlign({ classes: ['quote', 'form'] }), null,
      'null means the engine stamps nothing and that component is untouched');
  });

  test('the manifest default applies when the author says nothing', () => {
    assert.equal(resolveAlign({ classes: ['cards-grid'] }), 'middle');
    assert.equal(resolveAlign({ classes: ['verdict-grid'] }), 'middle');
  });

  test('byFamily beats default, and withCoda beats both', () => {
    assert.equal(resolveAlign({ classes: ['cards-grid'], family: 'tall' }), 'spread');
    assert.equal(resolveAlign({ classes: ['cards-grid'], family: 'strip' }), 'spread');
    assert.equal(resolveAlign({ classes: ['cards-grid'], family: 'square' }), 'middle',
      'square keeps the 2-up grid, so it is NOT in byFamily');
    assert.equal(resolveAlign({ classes: ['cards-grid'], hasCoda: true }), 'fill');
    assert.equal(resolveAlign({ classes: ['cards-grid'], family: 'tall', hasCoda: true }), 'fill');
  });

  test('byClass beats byFamily and default, and withCoda and the author beat it', () => {
    // split-panel: the plain evidence list spreads its items; a `proof` fills its column.
    assert.equal(resolveAlign({ classes: ['split-panel'] }), 'spread');
    assert.equal(resolveAlign({ classes: ['split-panel', 'proof'] }), 'fill');
    assert.equal(resolveAlign({ classes: ['split-panel', 'proof'], family: 'tall' }), 'fill');
    // The engine adds `proof` to a capstone slide only AFTER the exporter stamps it, while the
    // runtime re-stamps from the final class list: both must land on the same answer (#1).
    assert.equal(resolveAlign({ classes: ['split-panel', 'capstone'] }),
      resolveAlign({ classes: ['split-panel', 'capstone', 'proof'] }));
    assert.equal(resolveAlign({ classes: ['split-panel', 'proof', 'align-top'] }), 'top');
    assert.equal(componentAlign('split-panel', { classes: ['proof'] }), 'fill');
    assert.equal(componentAlign('split-panel', {}), 'spread', 'no classes → no byClass');
  });

  test('an absent family reads as wide, which is how the engine stamps it', () => {
    assert.equal(resolveAlign({ classes: ['cards-grid'] }),
      resolveAlign({ classes: ['cards-grid'], family: 'wide' }));
  });

  // ── the author overrides the component ───────────────────────────────────────
  test('an align-* token in the class list beats every manifest rule', () => {
    for (const [name, extra] of [['top', {}], ['fill', { family: 'tall' }], ['spread', { hasCoda: true }]]) {
      assert.equal(resolveAlign({ classes: ['cards-grid', `align-${name}`], ...extra }), name);
    }
  });

  // THE case the manifest model exists to get right: `center` is a real value the author can
  // ask for, not a synonym for silence. Where the component's own default differs — tall, or
  // a coda slide — writing it must WIN, which a stamp-nothing default could never do.
  test('`align: middle` overrides a component default that is not middle', () => {
    assert.equal(resolveAlign({ classes: ['cards-grid'], family: 'tall' }), 'spread');
    assert.equal(resolveAlign({ classes: ['cards-grid', 'align-middle'], family: 'tall' }), 'middle');
    assert.equal(resolveAlign({ classes: ['cards-grid'], hasCoda: true }), 'fill');
    assert.equal(resolveAlign({ classes: ['cards-grid', 'align-middle'], hasCoda: true }), 'middle');
  });

  // ── rot guards ───────────────────────────────────────────────────────────────
  test('the catalog is manifest-derived, and every entry is a legal value', () => {
    const FAMILIES = ['wide', 'square', 'tall', 'strip'];
    for (const [name, entry] of Object.entries(CATALOG)) {
      assert.ok(VERTICAL.includes(entry.default), `${name}.default must be a cards value`);
      if (entry.withCoda) assert.ok(VERTICAL.includes(entry.withCoda), `${name}.withCoda`);
      for (const [fam, v] of Object.entries(entry.byFamily || {})) {
        assert.ok(FAMILIES.includes(fam), `${name}.byFamily.${fam} is not a family`);
        assert.ok(VERTICAL.includes(v), `${name}.byFamily.${fam} value`);
      }
    }
    // …and the catalog is the MANIFESTS, not a hand-kept list beside them.
    const root = path.join(__dirname, '../../../lib/components');
    const fromManifests = {};
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.manifest.json')) {
          const m = JSON.parse(fs.readFileSync(full, 'utf8'));
          if (m.align?.default) fromManifests[m.name] = m.align;
        }
      }
    };
    walk(root);
    assert.deepEqual(Object.keys(CATALOG).sort(), Object.keys(fromManifests).sort(),
      'align-catalog.generated.js is stale — run `node tools/build-stage-catalog.js`');
    for (const [name, entry] of Object.entries(CATALOG)) {
      assert.equal(entry.default, fromManifests[name].default, `${name} default drifted from its manifest`);
      assert.equal(entry.withCoda, fromManifests[name].withCoda, `${name} withCoda drifted`);
      assert.deepEqual(entry.byClass || {}, fromManifests[name].byClass || {}, `${name} byClass drifted`);
      for (const [cls, v] of Object.entries(entry.byClass || {})) {
        assert.ok(VERTICAL.includes(v), `${name}.byClass.${cls} value`);
      }
    }
  });

  // No component may re-encode a default in CSS: the whole point is that the manifest is the
  // only place a composition is declared. A `var(--align-v, X)` fallback would be exactly
  // that, invisible to the engine and to the catalog.
  test('no component stylesheet carries a --align-v fallback', () => {
    const root = path.join(__dirname, '../../../lib/components');
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.styles.css')) {
          const css = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
          if (/var\(\s*--align-v\s*,/.test(css)) offenders.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    assert.deepEqual(offenders, [], 'a component must declare its default in its manifest, not in CSS');
  });

  // A component that DECLARES a composition but whose stylesheet never reads the token gets
  // the attribute, sets the variable, and changes nothing — silently, past the schema, the
  // catalog gate and every render test. That makes "opting a component in is a manifest
  // field" false, which is a claim this branch makes in five places. So: every governed
  // component must read `--align-v` somewhere in its own stylesheet.
  test('every component that declares a composition actually consumes it', () => {
    const root = path.join(__dirname, '../../../lib/components');
    const styles = {};
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.styles.css')) {
          styles[e.name.replace(/\.styles\.css$/, '')] = fs.readFileSync(full, 'utf8');
        }
      }
    };
    walk(root);
    for (const name of Object.keys(CATALOG)) {
      const css = styles[name];
      assert.ok(css, `${name} declares a cards composition but has no stylesheet`);
      // A bare text match certifies a DEAD selector: `.matches-nothing { align-content:
      // var(--align-v) }` passes it while the real card row hard-codes its value two lines
      // below. So find the RULES that read the token and require each to be anchored on this
      // component's own section — which is the only selector shape that can reach its cards.
      const anchor = new RegExp(`(^|[\\s,>+~])section\\.${name}(?![\\w-])`);
      // A ROW or GRID reads it as `align-content`; a flex COLUMN places its cards along the main
      // axis, so it reads the same token as `justify-content` (decision note §13).
      const reading = cssRules(css).filter((r) => /(align|justify)-content:\s*var\(\s*--align-v\s*\)/.test(r.body));
      assert.ok(reading.length > 0,
        `${name} declares a cards composition its CSS never reads — the declaration is a no-op`);
      for (const r of reading) {
        assert.ok(anchor.test(r.selector),
          `${name} reads --align-v from a rule that cannot reach its own cards: ${r.selector.trim()}`);
      }
    }
  });

  test('base.tokens.css maps every value, and sets no :root default', () => {
    const css = read('lib/base/base.tokens.css');
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const n of VERTICAL) {
      assert.match(bare, new RegExp(`section\\[data-align="${n}"\\][^{]*\\{[^}]*--align-v:\\s*${ALIGN_CSS[n]}`),
        `data-align="${n}" must map to ${ALIGN_CSS[n]}`);
      assert.match(bare, new RegExp(`section\\[data-align-coda="${n}"\\]:has\\(> \\.cell-coda\\)`),
        `the coda arm must carry ${n} too`);
      // The column form's ceiling switch rides the same rules, so it cannot disagree with the
      // placement: only `stretch` lifts it.
      const grow = n === 'fill' ? 1 : 0;
      assert.match(bare, new RegExp(`section\\[data-align="${n}"\\][^{]*\\{[^}]*--align-grow:\\s*${grow};`),
        `data-align="${n}" must set --align-grow: ${grow}`);
      assert.match(bare, new RegExp(`section\\[data-align-coda="${n}"\\][^{]*\\{[^}]*--align-grow:\\s*${grow};`),
        `the coda arm must set --align-grow: ${grow} for ${n}`);
      // …and so does the equal-rows grid's track keyword (split-panel proof).
      const track = n === 'fill' ? '1fr' : 'auto';
      const basis = n === 'fill' ? '0%' : 'auto';
      for (const attr of ['data-align', 'data-align-coda']) {
        assert.match(bare, new RegExp(`section\\[${attr}="${n}"\\][^{]*\\{[^}]*--align-track:\\s*${track};`),
          `${attr}="${n}" must set --align-track: ${track}`);
        assert.match(bare, new RegExp(`section\\[${attr}="${n}"\\][^{]*\\{[^}]*--align-basis:\\s*${basis};`),
          `${attr}="${n}" must set --align-basis: ${basis}`);
      }
    }
    const rootDefaults = (bare.match(/:root[^{]*\{[^}]*\}/g) || []).filter((b) => /--align-v\s*:/.test(b));
    assert.deepEqual(rootDefaults, [], 'a :root default would override every component declaration');
  });

  test('both render paths resolve and stamp through the one kernel', () => {
    for (const p of ['lib/integrations/markdown-it/plugins.js', 'lib/runtime/index.js']) {
      const src = read(p);
      assert.match(src, /require\((['"]).*resolve-align\1\)/, `${p} must load the resolver`);
      assert.match(src, /resolveAlign\(/, `${p} must call the resolver`);
      assert.match(src, /data-align/, `${p} must stamp the resolved value`);
    }
  });

  // REACHABILITY, which the text match above cannot see. Both paths once hung their stamp off
  // a hook that skips the common case — the exporter off a deck-token pass that returns early
  // when a deck contributes no tokens, the runtime off that AND off a family CHANGE, which
  // never fires at `wide` because the attribute is removed rather than set. The result was that
  // every wide section on a runtime-only surface (export-to-Marp, where Lattice's engine never
  // runs) got no `data-align` at all and an explicit `_class: cards-spread` was ignored.
  // Neither is visible to a grep for the call, so pin the SHAPE that makes them reachable.
  test('the exporter stamps from its own ruler, not the deck-token pass', () => {
    const src = read('lib/integrations/markdown-it/plugins.js');
    assert.match(src, /core\.ruler\.push\(\s*'align_stamp'/,
      'the stamp needs a rule of its own: the deck-token pass returns early on a deck with no tokens');
  });

  // A text match here pins a SPELLING, not the shape: `if (fam !== 'wide') { stampAlign(s); }`
  // reintroduces the exact bug and still contains a line reading `stampAlign(s);`. So walk
  // the function body and demand the call be an UNCONDITIONAL STATEMENT — brace depth 0 inside
  // the body (no `{ … }` around it) and nothing between it and the previous statement boundary
  // (no `if (…)`, no `&&`, no `?`).
  test('the runtime stamps unconditionally, not only when the family changes', () => {
    const src = read('lib/runtime/index.js');
    const body = functionBody(src, 'function stampOrientation');
    assert.ok(/stampAlign\(s\)/.test(body), 'stampOrientation must call stampAlign');
    assert.ok(unconditionalCalls(body, 'stampAlign').length > 0,
      'stampAlign(s) must be a bare statement in stampOrientation — a guard of ANY shape ' +
      'never fires at the wide family, where data-family is removed rather than set');
  });
});
