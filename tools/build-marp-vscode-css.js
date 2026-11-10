#!/usr/bin/env node
/**
 * build-marp-vscode-css — dist/lattice-vscode-min.css, the Lattice stylesheet already shaped the way Marp for VS Code shapes it.
 *
 * WHY. On every keystroke, Marp for VS Code renders the deck again, and every render re-processes the registered theme: Marp
 * rewrites every rule of our 1.1 MB `lattice-min.css` for its own slide markup (`section h1` becomes
 * `div#__marp-vscode > div > svg > foreignObject > section :is(h1, marp-h1)`), 700–1,200 ms per render, then ships the 1.5 MB
 * result to the preview again. Measured in a real VS Code (engineering/gotchas/vscode.md, "Typing is slow in the VS Code
 * preview"), that was most of the delay between a keystroke and the preview. This file is that rewrite, done ONCE, here: the
 * VS Code preview registers only directive-only stub themes (`@theme`, `@size`, the palette's `@import`), cheap to re-process,
 * and the deck links this file, which the browser parses once and keeps across re-renders.
 *
 * HOW IT IS MADE: BY MARP ITSELF. marp-core (an exact-pinned devDependency, used by this build step only; nothing ships it) is
 * run with the options Marp for VS Code renders its preview with (`VSCODE_OPTIONS`, read from marp-vscode 3.6.1's
 * `marpCoreOptionForPreview`), so the output is the preview's own CSS, not a copy of Marp's rules. Two packs per theme, and the
 * file keeps only the DIFFERENCE: what the theme adds over the stub. What Marp writes for every theme on its own (its scaffold,
 * the slide size of THIS deck, its base styles) stays with the stub the preview packs per render, so a deck with `size: 4K`
 * keeps its own size. The difference is taken over parsed top-level nodes, as a multiset, so a rule that legitimately appears
 * twice is kept twice.
 *
 * PALETTES. The preview packs the deck's own `theme:`, and one linked file has to serve whichever palette a deck names, so every
 * palette is packed the same way (its rules over the engine's) and each of its rules is limited to slides that name it:
 * `section:where([data-theme="cuoio"])`. Marp writes `data-theme` on every slide. `:where()` adds no specificity, so the cascade
 * between the engine and the palette is the one the registered theme had.
 *
 * THE CASCADE, KEPT. A registered theme sits in Marp's own `<style>`: after a few of Marp's rules, before the rest of them and
 * before the deck's own CSS (a global `<style>`, the `style:` directive). A linked file arrives after ALL of those, so two things
 * keep the old winners. Every linked rule is one type selector weaker (`belowTheAuthor`), which hands each equal-specificity tie
 * back to whatever came after the theme. And what only ORDER settles stays in the theme's slot, in the engine's stub
 * (`pinnedRules`): each engine declaration that ties one of Marp's EARLIER rules, the later ones that tie those, and the at-rules
 * with no selector to weaken (the `@layer` order statement, `@keyframes`, `@property`; not `@font-face`, see `pinnedRules`). The stub is written to
 * dist/lattice-vscode-stub.css (and dist/lattice-vscode-bundle-stub.css), the file the hand-off registers for `lattice`.
 *
 * EVERY MARP FOR VS CODE IN THE RANGE. The preview runs the marp-core (and marpit) its own release bundles, not the one this
 * build packs with, and Marp's EARLIER rules are not the same in all of them: marpit before 3.2.2 writes its `h1` reset as
 * `section :is(h1, marp-h1)`, one type selector stronger than 3.2.2's `:where(…)`, so a lowered `section h1 { margin: 0 }` lost
 * to it in Marp for VS Code 3.0.0–3.5.1 and a title slide's paragraphs moved 43 px (measured, 2026-11-10). So the ties are
 * checked against the earlier rules of EVERY bundled pair (`VSCODE_CORES`, exact devDependency aliases with their marpit pinned
 * by `overrides`, each verified to pack byte-for-byte what its release bundles). The theme's own rules pack the same in all
 * of them; only Marp's own rules differ.
 *
 * WHAT IT DOES NOT TOUCH. marp-cli keeps the full theme registered (marp.config.cjs): a PDF is rendered once, so nothing there
 * re-processes per keystroke, and its output does not change. In a marp-cli render this file's selectors (`div#__marp-vscode …`)
 * match nothing.
 *
 * Usage:
 *   node tools/build-marp-vscode-css.js           # write the two stylesheets and the two engine stubs
 *   node tools/build-marp-vscode-css.js --check   # exit 1 if it is stale
 */
const fs = require('node:fs');
const path = require('node:path');
const csstree = require('css-tree');
const { Marp } = require('@marp-team/marp-core');

/**
 * The marp-core (and marpit) each Marp for VS Code 3.x release bundles, read from each release's own node_modules. The build
 * checks ties against Marp's earlier rules under every one of them (`pinnedRules`). The aliases are exact devDependencies,
 * each with its marpit pinned by package.json `overrides` to the version its release bundles.
 * Add a row when a Marp for VS Code release bundles a pair not listed here (marp-vscode's package-lock.json names both).
 */
const VSCODE_CORES = Object.freeze([
  { vscode: '3.0.0-3.2.0', core: '4.0.1', marpit: '3.1.2', Marp: require('marp-core-4.0.1').Marp },
  { vscode: '3.3.0', core: '4.1.0', marpit: '3.1.3', Marp: require('marp-core-4.1.0').Marp },
  { vscode: '3.4.0-3.5.1', core: '4.3.0', marpit: '3.2.1', Marp: require('marp-core-4.3.0').Marp },
  { vscode: '3.6.0-3.6.1', core: '4.4.0', marpit: '3.2.2', Marp: require('marp-core-4.4.0').Marp },
]);
const { minifyCss } = require('./minify-css.js');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'lattice-vscode-min.css');
// The Export-to-Marp bundle's copy, cut from the theme files the bundle registers (see `outputs`).
const OUT_BUNDLE = path.join(DIST, 'lattice-vscode-bundle-min.css');
// The engine stubs VS Code registers in place of `lattice-min.css`: its directives and its pinned rules (`pinnedRules`).
const OUT_STUB = path.join(DIST, 'lattice-vscode-stub.css');
const OUT_BUNDLE_STUB = path.join(DIST, 'lattice-vscode-bundle-stub.css');

/** Marp for VS Code 3.6.1's preview options (`marpCoreOptionForPreview`), minus the per-user settings that change no CSS. */
const VSCODE_OPTIONS = Object.freeze({
  container: { tag: 'div', id: '__marp-vscode' },
  slideContainer: { tag: 'div', 'data-marp-vscode-slide-wrapper': '' },
  inlineSVG: { backdropSelector: false },
  html: true,
  minifyCSS: false,
  script: false,
});

// The directive-only stub the hand-offs register with Marp for VS Code (shared with both producers).
const { stubOf } = require('../lib/export/marp-vscode-stub.js');

/** The CSS the preview would carry for `theme`, given these registered themes. */
function pack(themes, theme, MarpClass = Marp) {
  const marp = new MarpClass(VSCODE_OPTIONS);
  for (const css of themes) marp.themeSet.add(css);
  return marp.renderStyle(theme);
}

/** Top-level nodes of a stylesheet, each as its own text. Comments are dropped by the parser. */
const nodes = (css) => csstree.parse(css, { parseValue: false, parseRulePrelude: false, parseAtrulePrelude: false })
  .children.toArray().map((n) => csstree.generate(n));

/** The nodes of `full` that `base` does not account for, in `full`'s order (a multiset difference). */
function added(full, base) {
  const left = new Map();
  for (const n of nodes(base)) left.set(n, (left.get(n) || 0) + 1);
  const out = [];
  for (const n of nodes(full)) {
    const k = left.get(n) || 0;
    if (k > 0) left.set(n, k - 1);
    else out.push(n);
  }
  return out;
}

/** The theme name a theme file registers (`@theme name`). */
const themeName = (css) => /@theme\s+([\w-]+)/.exec(css)[1];

/** Every rule in `css` limited to slides that name `theme`, at no specificity. */
function forTheme(css, theme) {
  const where = `:where([data-theme="${theme}"])`;
  return css.replace(/(> foreignObject > )(:where\(section\)|section)(?![\w-])/g, (_m, lead, slide) => `${lead}${slide}${where}`);
}

/**
 * The rules one type selector weaker than Marp made them: `#__marp-vscode` for `div#__marp-vscode`, the same element.
 *
 * WHY. Registered, the theme sat in Marp's own `<style>` BEFORE a deck's global `<style>` and `style:` directive, so at equal
 * specificity the author's rule won by order. Linked, it arrives AFTER them, and the same tie would go to the engine: an author's
 * `section h1 { color: … }` would lose in the preview and win in marp-cli. One type selector less hands every such tie back to the
 * author (and to Marp's own rules that followed the theme), and changes nothing between two engine rules, which all lose the same
 * one. (A KaTeX selector Marp packs with the prefix twice drops two; such selectors need a `section` inside `.katex` and match
 * nothing, before and after.) A tie the drop would turn the other way, an engine rule exactly as specific as one of Marp's rules that came BEFORE the
 * theme, is what `pinnedRules` finds and keeps in the theme's own slot.
 */
const belowTheAuthor = (css) => css.replaceAll('div#__marp-vscode', '#__marp-vscode');

// ── Ties: the rules that must stay in the theme's own slot ─────────────────────────────────────────────────────────────────
// Lowering the linked rules (`belowTheAuthor`) is exact against everything Marp writes AFTER the theme. Marp also writes a few
// rules BEFORE it (the slide box, the page number, a heading default, print rules), and the theme beat those by order wherever
// it was exactly as specific. Lowered, such a rule would lose. So the build finds each engine declaration that TIES one of those rules
// (same specificity, same pseudo-element, subjects that can be the same element, the same property) and keeps it out of the
// link: it goes into the engine's stub, which Marp packs in the theme's slot, where the order is the original one. The test is
// deliberately loose (two subjects that MIGHT be one element count): pinning a declaration that did not need it changes nothing,
// and missing one moves something. The parity test (test/integration/export/marp-vscode-css-parity.test.js) is the proof.

// The four pseudo-elements CSS still accepts with ONE colon (`section:after`), which the parser reads as pseudo-classes.
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const isPseudoElement = (n) => n.type === 'PseudoElementSelector'
  || (n.type === 'PseudoClassSelector' && LEGACY_PSEUDO_ELEMENTS.has(n.name.toLowerCase()));

/** Specificity [ids, classes, types] of one complex selector (a css-tree Selector), with `:where` at zero. */
function specificity(sel) {
  const s = [0, 0, 0];
  const add = (t) => { s[0] += t[0]; s[1] += t[1]; s[2] += t[2]; };
  const most = (list) => list.children.toArray().map(specificity).reduce((m, t) => (cmp(t, m) > 0 ? t : m), [0, 0, 0]);
  sel.children.forEach((n) => {
    if (n.type === 'IdSelector') s[0]++;
    else if (n.type === 'ClassSelector' || n.type === 'AttributeSelector') s[1]++;
    else if (n.type === 'TypeSelector') { if (n.name !== '*') s[2]++; }
    else if (isPseudoElement(n)) s[2]++;
    else if (n.type === 'PseudoClassSelector') {
      const name = n.name.toLowerCase();
      if (name === 'where') return;
      const list = n.children?.first;
      if (['is', 'not', 'has', 'matches'].includes(name) && list && list.type === 'SelectorList') add(most(list));
      else s[1]++;
    }
  });
  return s;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * One complex selector as the tie test reads it: its specificity, its pseudo-element, and the element types its subject (the
 * last compound) can be, read through `:is`/`:where`; an empty set means any element.
 */
function shape(sel) {
  const parts = sel.children.toArray();
  let last = parts.length;
  while (last > 0 && parts[last - 1].type !== 'Combinator') last--;
  const subject = parts.slice(last);
  const pseudo = subject.filter(isPseudoElement).map((n) => n.name.toLowerCase()).join() || '';
  const types = new Set();
  for (const n of subject) {
    if (n.type === 'TypeSelector' && n.name !== '*') types.add(n.name.toLowerCase());
    if (n.type === 'PseudoClassSelector' && ['is', 'where'].includes(n.name) && n.children?.first?.type === 'SelectorList') {
      const inner = n.children.first.children.toArray().map(shape);
      if (inner.every((t) => t.types.size)) for (const t of inner) for (const name of t.types) types.add(name);
    }
  }
  return { spec: specificity(sel), pseudo, types };
}

/** Whether two subjects can be the same element: either is any element, or they share a type. */
const sameElement = (a, b) => !a.size || !b.size || [...a].some((t) => b.has(t));

// At-rules whose bodies are not style rules (a keyframe's `50%`, a font face's descriptors): never read as selectors.
const NOT_STYLE = new Set(['keyframes', '-webkit-keyframes', 'font-face', 'property', 'counter-style', 'font-feature-values', 'page']);

/**
 * The style rules of `css`, each with its complex selectors' shapes, its properties, and whether it sits inside an at-rule
 * (`nested`: `@media`, `@supports`, `@container`). `{ nested: false }` reads the top level only.
 */
function styleRules(css, { nested = true } = {}) {
  const out = [];
  csstree.walk(csstree.parse(css), {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      if (this.atrule && (!nested || NOT_STYLE.has(this.atrule.name.toLowerCase()))) return;
      const props = new Set();
      node.block.children.forEach((d) => { if (d.type === 'Declaration') props.add(d.property.toLowerCase()); });
      out.push({ text: csstree.generate(node), shapes: node.prelude.children.toArray().map(shape), props, nested: Boolean(this.atrule) });
    },
  });
  return out;
}

/**
 * The family a property belongs to for the tie test: properties in one family can set the same thing (a shorthand and its
 * longhands, a logical property and its physical twin). Deliberately coarse: a false "same" pins a declaration that did not need
 * it, which changes nothing, where a false "different" misses a tie.
 */
const FAMILIES = [
  [/^(margin|scroll-margin)/, 'margin'], [/^(padding|scroll-padding)/, 'padding'],
  [/^(inset|top|right|bottom|left)(-|$)/, 'inset'],
  [/^(width|height|inline-size|block-size|min-|max-|aspect-ratio)/, 'size'],
  [/^border/, 'border'], [/^outline/, 'outline'], [/^(font|line-height|letter-spacing|word-spacing)/, 'font'],
  [/^(flex|order)/, 'flex'], [/^(grid|gap|row-gap|column-gap)/, 'grid'], [/^(place-|align-|justify-)/, 'align'],
  [/^overflow/, 'overflow'], [/^(text-decoration|text-underline)/, 'text-decoration'], [/^(background|mask)/, 'paint'],
  [/^(columns?|column-)/, 'columns'], [/^(transition|animation)/, 'motion'], [/^(list-style)/, 'list-style'],
];
const familyOf = (p) => (FAMILIES.find(([re]) => re.test(p)) || [null, p])[1];
const sameProperty = (a, b) => a === b || a === 'all' || b === 'all' || familyOf(a) === familyOf(b)
  || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);

/** Whether engine rule `e` ties Marp's earlier rule `m`: some pair of their selectors would be settled by order alone. */
function ties(e, m) {
  if (![...e.props].some((p) => [...m.props].some((q) => sameProperty(p, q)))) return false;
  return e.shapes.some((a) => m.shapes.some((b) => cmp(a.spec, b.spec) === 0 && a.pseudo === b.pseudo && sameElement(a.types, b.types)));
}

/** The properties of `props` that `other` sets too (equal, or longhand and shorthand). */
const overlap = (props, other) => [...props].filter((p) => [...other].some((q) => sameProperty(p, q)));

/** `rule` (a source rule's text) split by property: the declarations `keep` names, and the others; either may be null. */
function splitRule(rule, keep) {
  const ast = csstree.parse(rule, { context: 'rule' });
  const decls = ast.block.children.toArray();
  const part = (want) => {
    const picked = decls.filter((d) => d.type === 'Declaration' && keep.has(d.property.toLowerCase()) === want);
    if (!picked.length) return null;
    return `${csstree.generate(ast.prelude)}{${picked.map((d) => csstree.generate(d)).join(';')}}`;
  };
  return { pin: part(true), rest: part(false) };
}

/**
 * The engine DECLARATIONS that stay in the theme's slot (the stub), by source rule.
 *
 * Two kinds. A declaration in a rule whose packed form ties one of Marp's earlier rules on that property (Marp's earlier rules: the
 * ones it writes before the first rule the theme adds). And,
 * because a pinned declaration now sits before every linked rule, a declaration in a LATER engine rule that ties a pinned one: it
 * used to win by order, and lowered it would lose, so it is pinned too, until nothing more changes. Only the tying properties are
 * pinned; the rest of each rule stays in the link, in its place.
 *
 * Marp rewrites a rule as it packs it (`h1 .x` becomes `section :is(h1, marp-h1) .x`), so each packed rule is traced to its source
 * rule by packing the engine once with a marker rule after each of its rules: the packed rules between two markers came from the
 * rule between them. Returns the source rules (`source`), the pinned properties of each (`pins`, by index), and the packed rules
 * cut to those properties (`packed`), which a palette is checked against.
 */
function pinnedRules(engine, stub) {
  const source = nodes(engine);
  const base = pack([stub], 'lattice');
  // Marp's earlier rules, top level only (the ones inside an at-rule are print rules, `@media print`, never applied in the
  // preview), under EVERY bundled marp-core (`VSCODE_CORES`): a rule only an older one writes still decides a tie there.
  // They do not depend on the theme's rules, so each core packs the directive-only stub plus one marker rule, and the earlier
  // rules are the ones ahead of the marker: the same nodes a pack of the whole engine puts ahead of its first rule (checked
  // under all four, 2026-11-10), at about 20 ms a core instead of a full engine pack each.
  const EARLIER_MARK = '.lattice-vscode-earlier-mark{--lattice-mark:0}';
  const seen = new Set();
  const earlier = [];
  for (const { Marp: M } of VSCODE_CORES) {
    const packed = nodes(pack([`${stub}\n${EARLIER_MARK}`], 'lattice', M));
    const at = packed.findIndex((x) => x.includes('lattice-vscode-earlier-mark'));
    if (at < 0) throw new Error('build-marp-vscode-css: the earlier-rules marker did not survive the pack');
    for (const n of packed.slice(0, at)) if (!seen.has(n)) { seen.add(n); earlier.push(n); }
  }
  const before = styleRules(earlier.join('\n'), { nested: false });
  const MARK = 'lattice-vscode-pin-';
  const marked = `${stub}\n${source.map((n, i) => `${n}\n.${MARK}${i}{--lattice-pin:0}`).join('\n')}`;
  const bySource = source.map(() => []);
  // Marp's own rules (before the theme and after it) are in the marked pack too; they belong to no source rule.
  const marps = new Set(csstree.parse(base).children.toArray().map((n) => csstree.generate(n)));
  let at = 0;
  for (const node of csstree.parse(pack([marked], 'lattice')).children.toArray()) {
    const text = csstree.generate(node);
    const mark = new RegExp(`\\.${MARK}(\\d+)\\{`).exec(text);
    if (mark) { at = Number(mark[1]) + 1; continue; }
    if (at < source.length && !marps.has(text)) bySource[at].push(...styleRules(text));
  }
  // `pins`: source index → the pinned properties, or WHOLE for the entire source node. A rule inside an at-rule is pinned whole
  // (its at-rule goes into the stub as it is), and so is every at-rule that settles by ORDER rather than by selector: an `@layer`
  // order statement (the first statement names the order, and an author's own came after the theme), `@keyframes`, `@property`,
  // `@counter-style` (for each, the later one of a name wins). Linked, they would come after the author's.
  //
  // NOT `@font-face`, the one exception, measured in VS Code 1.145.2: the stub is registered from `.vscode/themes/`, where a
  // face's `url(fonts/…)` names a folder that is not there, and with the 52 faces in it the preview's first render beat the
  // theme registration and showed the deck unthemed (with them out, one themed render). So the faces stay in the link, beside the
  // fonts they name. The cost: a deck that redefines one of Lattice's OWN families with its own `@font-face` gets Lattice's face
  // in the VS Code preview (marp-cli is unchanged); a face under its own family name is unaffected.
  const WHOLE = 'whole';
  const pins = new Map();
  const pin = (i, props, whole = false) => {
    if (pins.get(i) === WHOLE) return false;
    if (whole) { pins.set(i, WHOLE); return true; }
    const have = pins.get(i) || new Set();
    const size = have.size;
    for (const p of props) have.add(p);
    pins.set(i, have);
    return have.size > size;
  };
  const ORDERED = /^@(layer\s[^{]*;|(-webkit-)?keyframes|property|counter-style|font-feature-values)/i;
  source.forEach((n, i) => { if (ORDERED.test(n)) pin(i, null, true); });
  bySource.forEach((rules, i) => {
    for (const r of rules) for (const m of before) if (ties(r, m)) pin(i, overlap(r.props, m.props), r.nested);
  });
  // A source rule's packed rules cut to its pinned properties. Marp writes companion rules for some declarations (a `font-size`
  // also sets `--marpit-root-font-size` on nested slides); one the cut leaves with nothing pinned is not pinned.
  const cut = (i) => (pins.get(i) === WHOLE ? bySource[i]
    : bySource[i].map((r) => ({ ...r, props: new Set(overlap(r.props, pins.get(i))) })).filter((r) => r.props.size));
  for (let grew = true; grew;) {
    grew = false;
    const held = [...pins.keys()].sort((a, b) => a - b);
    for (let j = 0; j < source.length; j++) {
      for (const i of held) {
        if (i >= j) break;
        for (const r of bySource[j]) for (const p of cut(i)) if (ties(r, p) && pin(j, overlap(r.props, p.props), r.nested)) grew = true;
      }
    }
  }
  const order = [...pins.keys()].sort((a, b) => a - b);
  return { source, pins, WHOLE, packed: order.flatMap(cut), before };
}

/**
 * Throw if a palette rule ties a pinned engine rule or one of Marp's earlier rules: it beat either by order, and lowered in the
 * link it would lose. Palettes have no stub of their own to pin into, so the build stops instead.
 */
function assertNoPaletteTies(name, paletteRules, held) {
  const rules = styleRules(paletteRules.join('\n'));
  const hit = rules.find((r) => held.some((p) => ties(r, p)));
  if (hit) {
    throw new Error(`build-marp-vscode-css: palette ${name} has a rule that ties an engine rule kept in the stub or one of Marp's `
      + `own earlier rules, so its order cannot be kept in the link: ${hit.text.slice(0, 200)}. Give the rule a class.`);
  }
  for (const n of paletteRules) {
    if (/^@(layer\s[^{]*;|(-webkit-)?keyframes|property|counter-style)/i.test(n.trim())) {
      throw new Error(`build-marp-vscode-css: palette ${name} has an at-rule that settles by order (${n.slice(0, 80)}), which the link `
        + 'would move after a deck\'s own CSS. Move it to the engine, or pin it in a palette stub.');
    }
  }
}

/**
 * The VS Code-shaped stylesheet for one set of theme files. `prepare` is the transform the hand-off applies to every theme file
 * before Marp sees it (none for the kit; `marpScopableCss(withoutEmojiFont(…))` for an Export-to-Marp bundle), so the packed
 * file is cut from exactly what the hand-off registers.
 */
function build({ prepare = (css) => css, label = 'dist/lattice-vscode-min.css' } = {}) {
  const engine = prepare(fs.readFileSync(path.join(DIST, 'lattice-min.css'), 'utf8'));
  const stub = stubOf(engine);
  // The engine's stub is its directives AND the declarations that must keep the theme's slot (`pinnedRules`); the link carries the
  // rest of the engine, each rule in its place, without them.
  const { source, pins, WHOLE, packed: pinnedPacked, before } = pinnedRules(engine, stub);
  const pinText = [];
  const restText = source.map((rule, i) => {
    if (!pins.has(i)) return rule;
    if (pins.get(i) === WHOLE) { pinText.push(rule); return null; }
    const { pin, rest } = splitRule(rule, pins.get(i));
    if (pin) pinText.push(pin);
    return rest;
  }).filter(Boolean);
  const engineStub = `${stub}/* GENERATED by tools/build-marp-vscode-css.js. Do not edit. The engine rules and declarations that keep the theme's own `
    + `place in the preview: each is settled by its order (a tie with one of Marp's rules, an @layer order, a @keyframes), not by `
    + `its selector. The rest arrive from the linked stylesheet. */\n${pinText.join('\n')}\n`;
  const parts = [...added(pack([`${stub}\n${restText.join('\n')}`], 'lattice'), pack([stub], 'lattice'))];
  // Every pinned declaration must pack in the stub exactly as it did in the full theme.
  const inStub = styleRules(added(pack([engineStub], 'lattice'), pack([stub], 'lattice')).join('\n'));
  const strayed = pinnedPacked.filter((r) => !inStub.some((k) => k.text.startsWith(r.text.slice(0, r.text.indexOf('{') + 1))
    && [...r.props].every((p) => k.props.has(p))));
  if (strayed.length) throw new Error(`build-marp-vscode-css: ${strayed.length} pinned rule(s) did not pack the same in the stub, first: ${strayed[0].text.slice(0, 200)}`);
  // A palette's own rules come out of Marp the same whatever the engine holds, so each palette is packed over the engine's STUB:
  // the same difference, without re-processing the 1.1 MB engine once per palette. EVERY palette is registered in each pack,
  // because a palette may extend another (`cuoio-dark` imports `cuoio`, the a11y palettes chain through `a11y-base` to
  // `onyx`): a deck naming the child gets the parent's rules too, so they belong to the child's slides here as well.
  const themesDir = path.join(DIST, 'themes');
  const palettes = fs.readdirSync(themesDir).filter((f) => f.endsWith('-min.css')).sort()
    .map((f) => prepare(fs.readFileSync(path.join(themesDir, f), 'utf8')));
  const stubOnly = pack([stub], 'lattice');
  for (const palette of palettes) {
    const name = themeName(palette);
    const own = added(pack([stub, ...palettes], name), stubOnly);
    assertNoPaletteTies(name, own, [...pinnedPacked, ...before]);
    parts.push(...own.map((n) => forTheme(n, name)));
  }
  const header = `/* ${label} — GENERATED by tools/build-marp-vscode-css.js. Do not edit. SPDX-License-Identifier: `
    + 'AGPL-3.0-only. (c) 2025-2026 Laticent. The Lattice stylesheet as Marp for VS Code shapes it, linked by a deck so the preview '
    + 'does not re-process it on every keystroke. Not a Marp theme: do not register it. */\n';
  return { css: header + minifyCss(belowTheAuthor(parts.join('\n'))), stub: engineStub };
}

/**
 * The hand-offs' files: for each, the linked stylesheet and the engine stub VS Code registers. The kit registers the dist files
 * as they are; a bundle registers them prepared for Marp.
 */
function outputs() {
  const { marpScopableCss, withoutEmojiFont } = require('../lib/export/marp-bundle.js');
  const kit = build();
  const bundle = build({ prepare: (css) => marpScopableCss(withoutEmojiFont(css)), label: 'dist/lattice-vscode-bundle-min.css' });
  return [
    { file: OUT, css: kit.css },
    { file: OUT_STUB, css: kit.stub },
    { file: OUT_BUNDLE, css: bundle.css },
    { file: OUT_BUNDLE_STUB, css: bundle.stub },
  ];
}

function main(argv) {
  const outs = outputs();
  if (argv.includes('--check')) {
    const stale = outs.filter((o) => !fs.existsSync(o.file) || fs.readFileSync(o.file, 'utf8') !== o.css);
    if (stale.length) {
      process.stderr.write(`error: ${stale.map((o) => path.relative(ROOT, o.file)).join(', ')} stale. Run \`npm run build\`.\n`);
      return 1;
    }
    process.stdout.write('the VS Code-shaped stylesheets are up to date.\n');
    return 0;
  }
  for (const o of outs) {
    fs.writeFileSync(o.file, o.css);
    process.stdout.write(`[build-marp-vscode-css] ${path.relative(ROOT, o.file)} (${(o.css.length / 1024).toFixed(0)} KB)\n`);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { build, outputs, stubOf, added, forTheme, pinnedRules, specificity, pack, VSCODE_OPTIONS, VSCODE_CORES, OUT, OUT_BUNDLE, OUT_STUB, OUT_BUNDLE_STUB };
