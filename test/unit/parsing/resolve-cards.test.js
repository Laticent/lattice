/**
 * Unit: the `cards:` register resolver (lib/core/resolve-cards.js).
 *
 * Where a CARD ROW puts the height it does not need. The COMPONENT declares its own default
 * in its manifest (baked into cards-catalog.generated.js); the AUTHOR overrides it deck-wide
 * with `cards:` or on one slide with `_class: cards-*`; this kernel resolves the two and the
 * engine stamps the answer as `data-cards`.
 *
 * The load-bearing distinction: OMITTING `cards:` is not the same as writing `cards: center`.
 * Omission means "the component decides" — and a component may decide differently per shape.
 * That is why all four values stamp a token and none is a silent default.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CARDS_NAMES,
  CARDS_TOKENS,
  CARDS_CSS,
  readFrontMatterCards,
  isKnownCards,
  cardsClass,
  cardsClassFromSource,
  governedComponent,
  componentCardsAlign,
  resolveCardsAlign,
} = require('../../../lib/core/resolve-cards');
const CATALOG = require('../../../lib/core/cards-catalog.generated.js');

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

describe('resolve-cards', () => {
  test('every value stamps a token — there is no silent default', () => {
    for (const n of CARDS_NAMES) assert.equal(cardsClass(n), `cards-${n}`);
    assert.equal(cardsClass('centre'), '', 'typo → nothing (deck-lint flags it)');
    assert.equal(cardsClass('flex-start'), '', 'the CSS value is not the author-facing name');
    assert.equal(cardsClass(''), '');
    assert.equal(cardsClass(undefined), '');
    assert.equal(cardsClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(cardsClass('  STRETCH  '), 'cards-stretch');
    assert.equal(cardsClass('Center'), 'cards-center');
  });

  test('isKnownCards recognizes the four names only', () => {
    for (const n of CARDS_NAMES) assert.ok(isKnownCards(n), `${n} should be known`);
    assert.ok(!isKnownCards('cards-stretch'), 'the class token is not a deck value');
    assert.ok(!isKnownCards(''));
    assert.ok(!isKnownCards(undefined));
  });

  test('the vocabulary and its CSS mapping stay in step', () => {
    assert.deepEqual([...CARDS_NAMES], ['center', 'stretch', 'top', 'spread']);
    assert.deepEqual([...CARDS_TOKENS], CARDS_NAMES.map((n) => `cards-${n}`));
    assert.deepEqual(Object.keys(CARDS_CSS).sort(), [...CARDS_NAMES].sort());
    assert.equal(CARDS_CSS.top, 'flex-start', 'the author-facing name is not the CSS value');
    assert.equal(CARDS_CSS.spread, 'space-evenly');
  });

  test('readFrontMatterCards extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ncards: stretch\n---\n\n# H\n\n`cards: not-this` in body\n';
    assert.equal(readFrontMatterCards(md), 'stretch');
    assert.equal(cardsClassFromSource(md), 'cards-stretch');
    assert.equal(readFrontMatterCards('---\ncards: "top"\n---\n'), 'top');
    assert.equal(readFrontMatterCards('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterCards(''), null);
  });

  // ── the component's own declaration ──────────────────────────────────────────
  test('a component with no manifest entry is not governed at all', () => {
    assert.equal(governedComponent(['kpi', 'form']), null);
    assert.equal(componentCardsAlign('kpi'), null);
    assert.equal(resolveCardsAlign({ classes: ['kpi', 'form'] }), null,
      'null means the engine stamps nothing and that component is untouched');
  });

  test('the manifest default applies when the author says nothing', () => {
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'] }), 'center');
    assert.equal(resolveCardsAlign({ classes: ['verdict-grid'] }), 'center');
  });

  test('byFamily beats default, and withCoda beats both', () => {
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], family: 'tall' }), 'spread');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], family: 'strip' }), 'spread');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], family: 'square' }), 'center',
      'square keeps the 2-up grid, so it is NOT in byFamily');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], hasCoda: true }), 'stretch');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], family: 'tall', hasCoda: true }), 'stretch');
  });

  test('an absent family reads as wide, which is how the engine stamps it', () => {
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'] }),
      resolveCardsAlign({ classes: ['cards-grid'], family: 'wide' }));
  });

  // ── the author overrides the component ───────────────────────────────────────
  test('a cards-* token in the class list beats every manifest rule', () => {
    for (const [name, extra] of [['top', {}], ['stretch', { family: 'tall' }], ['spread', { hasCoda: true }]]) {
      assert.equal(resolveCardsAlign({ classes: ['cards-grid', `cards-${name}`], ...extra }), name);
    }
  });

  // THE case the manifest model exists to get right: `center` is a real value the author can
  // ask for, not a synonym for silence. Where the component's own default differs — tall, or
  // a coda slide — writing it must WIN, which a stamp-nothing default could never do.
  test('`cards: center` overrides a component default that is not center', () => {
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], family: 'tall' }), 'spread');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid', 'cards-center'], family: 'tall' }), 'center');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid'], hasCoda: true }), 'stretch');
    assert.equal(resolveCardsAlign({ classes: ['cards-grid', 'cards-center'], hasCoda: true }), 'center');
  });

  // ── rot guards ───────────────────────────────────────────────────────────────
  test('the catalog is manifest-derived, and every entry is a legal value', () => {
    const FAMILIES = ['wide', 'square', 'tall', 'strip'];
    for (const [name, entry] of Object.entries(CATALOG)) {
      assert.ok(CARDS_NAMES.includes(entry.default), `${name}.default must be a cards value`);
      if (entry.withCoda) assert.ok(CARDS_NAMES.includes(entry.withCoda), `${name}.withCoda`);
      for (const [fam, v] of Object.entries(entry.byFamily || {})) {
        assert.ok(FAMILIES.includes(fam), `${name}.byFamily.${fam} is not a family`);
        assert.ok(CARDS_NAMES.includes(v), `${name}.byFamily.${fam} value`);
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
          if (m.cards?.default) fromManifests[m.name] = m.cards;
        }
      }
    };
    walk(root);
    assert.deepEqual(Object.keys(CATALOG).sort(), Object.keys(fromManifests).sort(),
      'cards-catalog.generated.js is stale — run `node tools/build-stage-catalog.js`');
    for (const [name, entry] of Object.entries(CATALOG)) {
      assert.equal(entry.default, fromManifests[name].default, `${name} default drifted from its manifest`);
      assert.equal(entry.withCoda, fromManifests[name].withCoda, `${name} withCoda drifted`);
    }
  });

  // No component may re-encode a default in CSS: the whole point is that the manifest is the
  // only place a composition is declared. A `var(--cards-align, X)` fallback would be exactly
  // that, invisible to the engine and to the catalog.
  test('no component stylesheet carries a --cards-align fallback', () => {
    const root = path.join(__dirname, '../../../lib/components');
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.styles.css')) {
          const css = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
          if (/var\(\s*--cards-align\s*,/.test(css)) offenders.push(path.relative(root, full));
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
  // component must read `--cards-align` somewhere in its own stylesheet.
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
      // var(--cards-align) }` passes it while the real card row hard-codes its value two lines
      // below. So find the RULES that read the token and require each to be anchored on this
      // component's own section — which is the only selector shape that can reach its cards.
      const anchor = new RegExp(`(^|[\\s,>+~])section\\.${name}(?![\\w-])`);
      const reading = cssRules(css).filter((r) => /align-content:\s*var\(\s*--cards-align\s*\)/.test(r.body));
      assert.ok(reading.length > 0,
        `${name} declares a cards composition its CSS never reads — the declaration is a no-op`);
      for (const r of reading) {
        assert.ok(anchor.test(r.selector),
          `${name} reads --cards-align from a rule that cannot reach its own cards: ${r.selector.trim()}`);
      }
    }
  });

  test('base.tokens.css maps every value, and sets no :root default', () => {
    const css = read('lib/base/base.tokens.css');
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const n of CARDS_NAMES) {
      assert.match(bare, new RegExp(`section\\[data-cards="${n}"\\][^{]*\\{[^}]*--cards-align:\\s*${CARDS_CSS[n]}`),
        `data-cards="${n}" must map to ${CARDS_CSS[n]}`);
      assert.match(bare, new RegExp(`section\\[data-cards-coda="${n}"\\]:has\\(> \\.cell-coda\\)`),
        `the coda arm must carry ${n} too`);
    }
    const rootDefaults = (bare.match(/:root[^{]*\{[^}]*\}/g) || []).filter((b) => /--cards-align\s*:/.test(b));
    assert.deepEqual(rootDefaults, [], 'a :root default would override every component declaration');
  });

  test('both render paths resolve and stamp through the one kernel', () => {
    for (const p of ['lib/integrations/markdown-it/plugins.js', 'lib/runtime/index.js']) {
      const src = read(p);
      assert.match(src, /require\((['"]).*resolve-cards\1\)/, `${p} must load the resolver`);
      assert.match(src, /resolveCardsAlign\(/, `${p} must call the resolver`);
      assert.match(src, /data-cards/, `${p} must stamp the resolved value`);
    }
  });

  // REACHABILITY, which the text match above cannot see. Both paths once hung their stamp off
  // a hook that skips the common case — the exporter off a deck-token pass that returns early
  // when a deck contributes no tokens, the runtime off that AND off a family CHANGE, which
  // never fires at `wide` because the attribute is removed rather than set. The result was that
  // every wide section on a runtime-only surface (export-to-Marp, where Lattice's engine never
  // runs) got no `data-cards` at all and an explicit `_class: cards-spread` was ignored.
  // Neither is visible to a grep for the call, so pin the SHAPE that makes them reachable.
  test('the exporter stamps from its own ruler, not the deck-token pass', () => {
    const src = read('lib/integrations/markdown-it/plugins.js');
    assert.match(src, /core\.ruler\.push\(\s*'cards_align_stamp'/,
      'the stamp needs a rule of its own: the deck-token pass returns early on a deck with no tokens');
  });

  // A text match here pins a SPELLING, not the shape: `if (fam !== 'wide') { stampCardsAlign(s); }`
  // reintroduces the exact bug and still contains a line reading `stampCardsAlign(s);`. So walk
  // the function body and demand the call be an UNCONDITIONAL STATEMENT — brace depth 0 inside
  // the body (no `{ … }` around it) and nothing between it and the previous statement boundary
  // (no `if (…)`, no `&&`, no `?`).
  test('the runtime stamps unconditionally, not only when the family changes', () => {
    const src = read('lib/runtime/index.js');
    const body = functionBody(src, 'function stampOrientation');
    assert.ok(/stampCardsAlign\(s\)/.test(body), 'stampOrientation must call stampCardsAlign');
    assert.ok(unconditionalCalls(body, 'stampCardsAlign').length > 0,
      'stampCardsAlign(s) must be a bare statement in stampOrientation — a guard of ANY shape ' +
      'never fires at the wide family, where data-family is removed rather than set');
  });
});
