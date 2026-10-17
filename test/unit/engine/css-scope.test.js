/**
 * Gate: the playground/Studio selector scoper (`packTheme` in lib/engine/css.js)
 * distributes a LEADING `:is(…)` forgiving list so each arm scopes by its own
 * leftmost combinator.
 *
 * WHY THIS EXISTS — the map/quadrant/radar iOS-black bug (2026-07-13). The docs-
 * site playground wraps each engine selector under `article.lattice > section`. Its
 * "targets the slide section" test used to be a LITERAL leading `section` only, so
 * a chart rule led by `:is(section.map, figure.chart-frame)` (the Read·Article
 * re-host broadening) was scoped as a slide DESCENDANT —
 * `article.lattice > section :is(section.map, …)` — which can never match the map
 * slide (`section.map` IS the slide, not inside it). The rule never applied,
 * `--map-base` was never defined, and every map fill reading it fell to SVG's black
 * initial value. This locks the distribution so that regression can't return.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { packTheme } = require('../../../lib/engine/css.js');

/** Scope a single selector and return the packed selector text (before the `{`). */
function scope(sel) {
  return packTheme(`${sel}{a:1}`).split('{')[0].trim();
}

describe('packTheme selector scoping', () => {
  test('a leading :is(section.X, figure.Y) distributes — the section arm targets the SLIDE', () => {
    const out = scope(':is(section.map, figure.chart-frame) .map-region--on');
    // The section arm must land on the slide section itself (direct child of the
    // wrapper), NOT as a descendant — else it never matches and the map goes black.
    assert.match(out, /article\.lattice > section\.map \.map-region--on/,
      'the section.map arm must scope to the slide section directly');
    // The figure arm packs as a slide descendant. That is harmless in the PREVIEW (no
    // re-hosted figure exists there) but it is NOT where the re-host lives: Read·Article
    // lifts the figure OUT of the slide. The exported player packs with `flat: true`, which
    // adds the unscoped arm — see the FLAT describe block below.
    assert.match(out, /article\.lattice > section figure\.chart-frame \.map-region--on/,
      'the figure.chart-frame arm packs as a slide descendant');
    // The bug signature — a slide-descendant `:is(section…)` — must be gone.
    assert.doesNotMatch(out, /section :is\(/, 'must not leave `:is(section…)` as a slide descendant');
  });

  test('every chart :is(section.<comp>, figure.chart-frame) pattern distributes', () => {
    for (const comp of ['map', 'gantt', 'radar', 'quadrant', 'funnel', 'piechart']) {
      const out = scope(`:is(section.${comp}, figure.chart-frame) .x`);
      assert.match(out, new RegExp(`article\\.lattice > section\\.${comp} \\.x`),
        `${comp}: the section arm must target the slide`);
    }
  });

  test('non-:is selectors are UNCHANGED (no regression)', () => {
    assert.equal(scope('section.title'), 'article.lattice > section.title');
    assert.equal(scope('section.map .map-region'), 'article.lattice > section.map .map-region');
    assert.equal(scope('.chart-frame .chart-body'), 'article.lattice > section .chart-frame .chart-body');
    assert.equal(scope('h2'), 'article.lattice > section h2');
    assert.equal(scope('section:has(.x)'), 'article.lattice > section:has(.x)');
    assert.equal(scope('section.map, section.radar'),
      'article.lattice > section.map, article.lattice > section.radar');
  });

  test(':root still becomes the (0,1,0)-preserving slide-root marker', () => {
    assert.match(scope(':root'), /article\.lattice > :where\(section\):not\(\[\\20 root\]\)/);
  });
});

/**
 * FLAT packing — the stylesheet for the exported player (`render(…, { styles: 'flat' })`).
 *
 * WHY: the Studio's Webpage export drew every chart in Read · Article black (the radar
 * report, 2026-09-24). The view lifts each chart's figure out of its slide, and the preview
 * pack scopes both the figure's rules and every palette token to the inside of a slide. The
 * CLI player ships the rules UNPACKED and never had the bug. Flat packing emits each arm the
 * pack re-scoped twice — packed, then as written — so a slide keeps its exact cascade and
 * content outside a slide matches what the CLI's copy of the rule matches.
 */
function flatScope(sel) {
  return packTheme(`${sel}{a:1}`, { flat: true }).split('{')[0].trim();
}
const armsOf = (list) => list.split(',').map((s) => s.trim());

describe('packTheme flat (the exported player)', () => {
  test('the chart re-host arm gains its written, unscoped form', () => {
    const arms = armsOf(flatScope(':is(section.radar, figure.chart-frame) .radar-ring'));
    assert.deepEqual(arms, [
      'article.lattice > section.radar .radar-ring',
      'article.lattice > section figure.chart-frame .radar-ring',
      'figure.chart-frame .radar-ring',
    ]);
  });

  test('a bare-class chart token block (`.chart-frame`) gains its written form', () => {
    // The chart palette (`--chart-cat-1-hue` …) is declared on `.chart-frame`; the
    // re-hosted figure carries that class outside any slide.
    assert.deepEqual(armsOf(flatScope('.chart-frame')), ['article.lattice > section .chart-frame', '.chart-frame']);
  });

  test('a :root token block also lands on :root', () => {
    assert.deepEqual(armsOf(flatScope(':root')), ['article.lattice > :where(section):not([\\20 root])', ':root']);
  });

  test('a slide-leading arm is NOT duplicated — it strips back to exactly what was written', () => {
    for (const sel of ['section.title', 'section.map .map-region', 'section h2', 'section:has(.x)', 'section>.x']) {
      assert.equal(flatScope(sel), scope(sel), sel);
    }
  });

  test('flat only ADDS arms: the preview-shaped arms are all still there, in order', () => {
    for (const sel of [':root', 'h2', '.chart-frame .chart-body', ':is(section.map, figure.chart-frame) .x', 'section.title']) {
      const flat = armsOf(flatScope(sel));
      const packed = armsOf(scope(sel));
      assert.deepEqual(flat.filter((a) => packed.includes(a)), packed, sel);
    }
  });

  test('the default pack is unchanged by the option existing', () => {
    assert.equal(packTheme(':root{a:1}h2{b:2}'), packTheme(':root{a:1}h2{b:2}', { flat: false }));
  });
});

// A packed selector must never need a slide INSIDE a slide. The packer scopes every selector
// under `article.lattice > section` and treats only a literal leading `section`, a distributed
// leading `:is(…)`, a bare `:root` and (since the 2026-10-17 packer fix) a leading `:where(section…)` whose every arm
// starts with `section` as the slide itself. Any other way of NAMING the slide packs to a
// descendant: `.x section.x`; `:where(.lattice-exporting) section.x`; `:where(section.a, .b) .y`;
// `:where(:root)`. Each needs a `<section>` below a `<section>`, which no deck contains, so the rule
// matches nothing in the Studio and Playground preview while the flat CLI sheet still applies it
// (#2705, #2715, #2720, #2735). Write `section.x :where(…)`, `section.x.lattice-exporting`, or `:root`.
//
// STRUCTURAL, not a regex: `nestsSlide` splits the packed selector into compounds at its
// combinators and asks whether a `section` type selector sits below the slide compound. The first
// version of this guard was a regex for `:where(section…` and missed `:where(:root)`,
// `:where(.a) > section.x` and `.x section.x`.
const { splitSelectorList } = require('../../../lib/core/leading-is.js');

// Split `sel` at its TOP-LEVEL combinators into [{ text, combinator }]; `combinator` is the one
// that PRECEDES the compound (' ', '>', '+', '~', or '' for the first). Brackets, parens and
// strings are opaque, so `[\20 root]` and `:where(a b)` do not split.
function compounds(sel) {
  const out = [];
  let cur = '';
  let comb = '';
  let depth = 0;
  let quote = '';
  const flush = () => {
    if (!cur) return;
    out.push({ text: cur, combinator: comb });
    cur = '';
    comb = '';
  };
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (quote) {
      cur += c;
      if (c === '\\') cur += sel[++i] ?? '';
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '\\') { cur += c + (sel[++i] ?? ''); continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) {
      flush();
      // Whitespace is a descendant combinator unless a `>`/`+`/`~` already claimed the gap.
      comb = /\s/.test(c) ? comb || ' ' : c;
      continue;
    }
    cur += c;
  }
  flush();
  return out;
}

// The arms of every `:where(…)` / `:is(…)` in a compound (`:not` and `:has` are not descent
// into the matched element's own identity or ancestry, so they are not followed).
function functionalArms(compound) {
  const arms = [];
  const re = /:(?:where|is|matches)\(/g;
  let m;
  while ((m = re.exec(compound))) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    for (; j < compound.length && depth; j++) {
      if (compound[j] === '(') depth++;
      else if (compound[j] === ')') depth--;
    }
    arms.push(...splitSelectorList(compound.slice(start, j - 1)));
    re.lastIndex = j;
  }
  return arms;
}

// True when `sel` (a compound sequence) names a `section` below the element its first compound
// matches. `firstIsSlide` says whether that first compound IS the slide.
function nestsIn(sel, firstIsSlide) {
  let nested = !firstIsSlide;
  for (const { text, combinator } of compounds(sel)) {
    if (combinator === ' ' || combinator === '>') nested = true;
    if (nested && /^section(?![\w-])/.test(text)) return true;
    for (const arm of functionalArms(text)) if (armNests(arm.trim(), !nested)) return true;
  }
  return false;
}

// A `:where()` / `:is()` arm is a selector of its own whose LAST compound is the element the host
// compound matches; the compounds before it are that element's ancestors. When the host is the
// slide, the last compound is the slide, so a `section` before it is an ancestor of the slide, a
// slide inside a slide. When the host is already nested, the last compound is a descendant, so a
// `section` there is a slide inside a slide, but an earlier `section` may legitimately be the real
// slide above it (`section .x:where(section .y)`), so the ancestors are not judged.
function armNests(arm, hostIsSlide) {
  const cs = compounds(arm);
  for (let i = 0; i < cs.length; i++) {
    const isHost = i === cs.length - 1;
    const isSection = /^section(?![\w-])/.test(cs[i].text);
    if (isHost ? !hostIsSlide && isSection : hostIsSlide && isSection) return true;
    if (isHost) for (const sub of functionalArms(cs[i].text)) if (armNests(sub.trim(), hostIsSlide)) return true;
  }
  return false;
}

/** Does this PACKED selector (one arm) need a slide inside a slide? */
function nestsSlide(packedArm) {
  const arm = packedArm.trim();
  const prefix = 'article.lattice > ';
  if (!arm.startsWith(prefix)) return false;
  return nestsIn(arm.slice(prefix.length), true);
}

// Arms that nest a slide ON PURPOSE. Add one only WITH its justification (HARD RULE #22's
// pattern); the sheet scan below fails on a stale entry, so the list cannot rot.
const SANCTIONED_NESTED_SLIDE = [
  {
    // `:root[data-lattice-view="fluid"] section[data-lattice-slide]`: the fluid viewer sets the
    // attribute on the REAL document root, which a packed (preview) sheet has no equivalent of.
    // The viewer exists only in an exported page, which ships the FLAT sheet, and flat packing
    // adds the written arm, so the rule still applies there. The packed arm is dead by design.
    file: /^lib\/base\/base\.fluid-view\.css$/,
    match: /\[data-lattice-view="fluid"\] section\b/,
  },
  {
    // Each light theme's `:where(:root) { color-scheme: light; }`. It is a DOCUMENT-ROOT default:
    // in the CLI export it lands on `<html>` and the slides inherit it. A packed sheet cannot
    // carry it to the slide, and must not: the preview frame's `<html>` is the host's, forced to
    // `:root{color-scheme:dark}` for dark mode, and a `color-scheme` set ON the slide would stop
    // inheriting it. Measured: packing it onto the slide made a palette with no `-dark` sibling
    // render a white slide under a forced-dark frame, and made every CLI export of a deck with
    // `style: ":root{color-scheme:dark}"` come out white. The dead packed arm is the correct one.
    file: /^themes\/[^/]+\/[^/]+\.css$/,
    match: /^article\.lattice > section :where\(:where\(section\):not\(\[\\20 root\]\)\)$/,
  },
];

const packedArms = (packed) => {
  const out = [];
  for (const m of packed.matchAll(/[^{};]+(?=\{)/g)) {
    const prelude = m[0].trim();
    if (prelude.startsWith('@')) continue;
    out.push(...splitSelectorList(prelude).map((a) => a.trim()));
  }
  return out;
};

describe('no packed selector needs a slide inside a slide', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '../../..');
  const cssFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return cssFiles(p);
      return e.name.endsWith('.css') ? [p] : [];
    });
  const dead = (sel) => packedArms(packTheme(`${sel}{a:1}`)).some(nestsSlide);

  test('the guard fails on every shape the packer makes into a slide inside a slide', () => {
    for (const sel of [
      ':where(section.a, .b) .y', // a MIXED leading :where(): ambiguous, stays dead on purpose
      ':where(.lattice-exporting) section.finish', // an ancestor-led arm, slide after the :where() (#2720)
      ':where(.a:not(.b)) section > .tab', // nested parens in the :where()
      ':where(.a) > section.x', // a child combinator before the slide
      '.x section.x', // a plain ancestor class before the slide
      ':is(.a) section.x', // a mid-selector :is() before the slide
      ':where(:root)', // a document-root default: sanctioned for themes only, never silently
      'section.a + .x section.y', // a descendant after a sibling combinator
      'section.a ~ section.b section.c',
      'section.a+.x section.y',
    ]) {
      assert.ok(dead(sel), `${sel} must be flagged: ${scope(sel)}`);
    }
    assert.ok(packedArms(packTheme('@media print { .x section.y .a { b: 1 } }')).some(nestsSlide), 'inside an at-rule too');
  });

  test('the guard passes every well-formed way of naming the slide', () => {
    for (const sel of [
      ':where(section.finish) .panel-left', // a leading :where() naming the slide, packed onto it (2026-10-17 packer fix)
      ':where(section.a, section.b) .x',
      ':where(section:not(.x)) h2',
      ':where(section .wrap) .d', // a descendant filter: packs as a descendant, which matches
      'section.finish.lattice-exporting',
      'section.finish :where(.panel-left)',
      'section :where(.x) h2',
      'section.kpi:where(section:not([data-family]), [data-family="square"]) > .a', // attached to the slide
      'section.x:not(.y) .z',
      'section:where(.a section)', // `.a` may be the article: not provably a slide in a slide
      'section:has(section.y)', // :has() is a probe, not a path
      ':root',
      ':root .x',
      'section .x:where(section .y)', // the `section` is the real slide above the host
      'section.title',
      'h2',
      'section.a + section.b', // a sibling slide
      'section.x[data-a="section b"] .y',
    ]) {
      assert.ok(!dead(sel), `${sel} must pass: ${scope(sel)}`);
    }
  });

  test('`:where(:root)` stays a document-root rule: it packs dead, on purpose', () => {
    // The preview frame's `<html>` is the host's; a `color-scheme` on the slide would stop
    // inheriting a forced dark mode. See SANCTIONED_NESTED_SLIDE.
    assert.ok(dead(':where(:root)'));
    assert.deepEqual(armsOf(flatScope(':where(:root)')), [scope(':where(:root)'), ':where(:root)'], 'flat keeps the written arm');
  });

  test('a leading :where(section…) names the slide: the container goes before it, its zero weight stays', () => {
    assert.equal(scope(':where(section.finish) .panel-left'), 'article.lattice > :where(section.finish) .panel-left');
    assert.equal(scope(':where(section.a, section.b) .x'), 'article.lattice > :where(section.a, section.b) .x');
    assert.equal(scope(':where(section:not(.x)) h2'), 'article.lattice > :where(section:not(.x)) h2');
    assert.equal(scope(':where(section.a:not(.b .c)) .x'), 'article.lattice > :where(section.a:not(.b .c)) .x', 'a space inside parens is still one compound');
    assert.equal(scope(':where(section[data-x="a b"]) .y'), 'article.lattice > :where(section[data-x="a b"]) .y', 'and so is one inside a quoted value');
    assert.equal(scope(':where(section.a)::after'), 'article.lattice > :where(section.a)::after');
    // FLAT: it packs to `article.lattice > <itself>`, which a flat document strips back to exactly what
    // was written, so (like a literal leading `section`) it gains no second, as-written arm.
    assert.equal(flatScope(':where(section.finish) .panel-left'), scope(':where(section.finish) .panel-left'));
  });

  test('what stays dead stays dead: a mixed arm list, :where(:root), and the trailing form', () => {
    // A mixed list is ambiguous (`.b` is not the slide). :where(:root) and :where(section:root) are a
    // document default and must NEVER land on the slide, or a forced dark mode stops reaching it
    // (the :where(:root) entry in engineering/gotchas/lattice-internals.md).
    assert.equal(scope(':where(section.a, .b) .y'), 'article.lattice > section :where(section.a, .b) .y');
    // An arm with a combinator inside it filters on a descendant of a section, not on the slide, so it
    // keeps scoping as a descendant (which matches). Rescuing it would need a section ABOVE the slide.
    for (const arm of ['section .wrap', 'section > .a', 'section *', 'section ~ section']) {
      assert.equal(scope(`:where(${arm}) .x`), `article.lattice > section :where(${arm}) .x`, arm);
    }
    assert.equal(scope(':where(section.a, section .b) .z'), 'article.lattice > section :where(section.a, section .b) .z');
    assert.equal(scope(':where(:root)'), 'article.lattice > section :where(:where(section):not([\\20 root]))');
    assert.equal(scope(':where(section:root)'), 'article.lattice > section :where(:where(section):not([\\20 root]))');
    assert.equal(scope(':where(.lattice-exporting) section.f'), 'article.lattice > section :where(.lattice-exporting) section.f');
  });

  test('every lib/ and themes/ stylesheet packs without one', () => {
    const files = [...cssFiles(path.join(root, 'lib')), ...cssFiles(path.join(root, 'themes'))];
    assert.ok(files.length > 50, `found only ${files.length} stylesheets`);
    const used = new Set();
    const hits = [];
    for (const f of files) {
      const rel = path.relative(root, f);
      const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const arm of packedArms(packTheme(css))) {
        if (!nestsSlide(arm)) continue;
        const ok = SANCTIONED_NESTED_SLIDE.findIndex((s) => s.file.test(rel) && s.match.test(arm));
        if (ok >= 0) used.add(ok);
        else hits.push(`${rel}: ${arm.replace(/\s+/g, ' ').slice(0, 140)}`);
      }
    }
    assert.deepEqual(hits, []);
    const stale = SANCTIONED_NESTED_SLIDE.filter((_s, i) => !used.has(i)).map((s) => String(s.file));
    assert.deepEqual(stale, [], 'a sanctioned nested-slide arm no longer exists; delete the entry');
  });
});
