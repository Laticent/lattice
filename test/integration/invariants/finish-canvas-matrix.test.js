/**
 * `--fin-canvas` MUST EQUAL THE SURFACE THE SLIDE ACTUALLY PAINTS — measured in real
 * Chromium against the real bundle, across bookends × canvas modifiers.
 *
 * #1656 fixed a finish washing out the three inverse bookends by naming the surface the
 * backdrop composites against. The first cut of that fix declared:
 *
 *     section:is(.title, .closing, .divider:not(.light)) { --fin-canvas: var(--surface-inverse) }
 *
 * which asserts those bookends ALWAYS paint `--surface-inverse`. They do not. `dark` and
 * `print` set `background` themselves at equal (0,1,1) specificity from
 * `base.modifiers.css`, and the bundle loads that AFTER the component sheets — so on
 * `title dark` the MODIFIER wins and the surface is the dark `--bg`, not the inverse
 * panel. The fix inverted its own bug on four combinations: an opaque `--surface-inverse`
 * wash over a darker `dark` slide, and a full-page `--print-surface-inverse` gray flood
 * across a white `print` page.
 *
 * `light` is not symmetric with them: `section.light` sets `color-scheme` only and paints
 * nothing, so a `title light` KEEPS its inverse panel — while `section.divider.light`
 * genuinely replaces the canvas. Excluding `light` from all three broke `title light`.
 *
 * Every one of those was invisible to the source-shape assertions in
 * `test/unit/palette/finish-canvas-contract.test.js` (no bare `var(--bg)`, the `:is()`
 * names the bookends): the CSS is valid either way, it just resolves to the wrong color.
 * Only a COMPUTED-VALUE comparison catches it, which is what this file is.
 *
 * Born from the red-team pass on the #1656 branch.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');

// The canvas modifiers a slide can carry alongside a component class. `''` = none.
const MODIFIERS = ['', 'dark', 'light', 'print', 'color-light', 'color-system'];
// The three inverse bookends plus an ordinary prose control that must never move.
const COMPONENTS = ['title', 'closing', 'divider', 'content'];

let browser;
let page;

describe('--fin-canvas resolves to the painted surface, on every bookend × canvas modifier', () => {
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    page = await browser.newPage();
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    const cases = [];
    for (const c of COMPONENTS) for (const m of MODIFIERS) cases.push(m ? `${c} ${m}` : c);
    // Each section gets a PROBE painted `var(--fin-canvas)`. Comparing the probe's
    // computed color to the section's own background is the whole assertion — it needs
    // no knowledge of which token either side resolved through.
    const html =
      `<style>${theme}\n${bundle}</style><article class="lattice">` +
      cases
        .map(
          (cls, i) =>
            `<section id="s${i}" class="${cls} finish finish-atrium"><div class="backdrop"></div>` +
            `<span id="p${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>`,
        )
        .join('') +
      '</article>';
    await page.setContent(html);
    page.__cases = cases;
  });

  after(async () => {
    await browser?.close();
  });

  test('every combination composites against its own surface', async () => {
    const rows = await page.evaluate(
      (cases) =>
        cases.map((cls, i) => ({
          cls,
          surface: getComputedStyle(document.getElementById(`s${i}`)).backgroundColor,
          canvas: getComputedStyle(document.getElementById(`p${i}`)).backgroundColor,
        })),
      page.__cases,
    );
    assert.equal(rows.length, COMPONENTS.length * MODIFIERS.length, 'every case rendered');
    const mismatches = rows.filter((r) => r.surface !== r.canvas);
    assert.deepEqual(
      mismatches,
      [],
      'a finish would composite against a color the slide does not paint:\n' +
        mismatches.map((r) => `  ${r.cls}: surface ${r.surface} vs --fin-canvas ${r.canvas}`).join('\n'),
    );
  });

  test('the bookends really are inverse without a canvas modifier — the case #1656 fixed', async () => {
    const rows = await page.evaluate(
      (cases) =>
        cases.map((cls, i) => ({ cls, canvas: getComputedStyle(document.getElementById(`p${i}`)).backgroundColor })),
      page.__cases,
    );
    const byCls = Object.fromEntries(rows.map((r) => [r.cls, r.canvas]));
    // Guards against the matrix passing trivially by everything resolving to `--bg`.
    assert.notEqual(byCls.title, byCls.content, 'a plain title must NOT composite against the deck canvas');
    assert.notEqual(byCls.closing, byCls.content, 'a plain closing must NOT composite against the deck canvas');
    assert.notEqual(byCls.divider, byCls.content, 'a plain divider must NOT composite against the deck canvas');
    assert.equal(byCls['divider light'], byCls.content, 'a light divider DOES take the deck canvas');
  });
});

/**
 * `--fin-canvas` MUST FOLLOW THE PAINTED SURFACE ACROSS EVERY MODIFIER THE BUNDLE
 * ITSELF KNOWS ABOUT — and the cross derives that list rather than carrying one.
 *
 * The matrix above covers {title, closing, divider, content} x one modifier at a time,
 * because #1656 was about three inverse bookends. Three separate regressions got past
 * that shape on this branch, each one a class of failure the previous fix could not see:
 *
 *   1. The dark-canvas exemption gave nine frames their own surface back, and
 *      `--fin-canvas` still excluded `.dark`, so a finish on a dark bookend mixed
 *      toward the deck ground. One class, caught by the matrix.
 *   2. Re-pointing it for `.dark` unconditionally broke every row where a SECOND class
 *      out-specifies the frame and repaints it anyway — `section.dark.spectrum-off`
 *      (0,2,1), `section.dark:is(.spectrum-edge-…):not(.divider)` (0,3,1),
 *      `section.accent.dark` (0,2,1), the `print` remap. TWO classes: invisible here.
 *   3. Excluding those registers UNCONDITIONALLY then broke the light path, because
 *      every one of those repainters requires `.dark`. Without it nothing repaints, the
 *      bookend keeps `--surface-inverse`, and the exclusion demoted the canvas for no
 *      reason — #1656's original defect, on the default path. A cross that only ever
 *      sets `dark` cannot see that either.
 *
 * So this arm crosses the canvas-owning frames against EVERY modifier class the bundle
 * uses in a section-subject painting rule, WITH and WITHOUT `dark`. The list is read out
 * of `dist/lattice.css` at run time (see `deriveModifiers`), which is the part that
 * matters: a register added later — a new `spectrum-*`, a new `stamp-*`, a `corners-*` —
 * enters this cross on its own. A hand-written list is exactly how (2) and (3) shipped,
 * and a mutant adding `.corners-rounded` to the exclusions passed a hand-listed version
 * of this file while breaking seven real rows.
 *
 * THE PINNED SET RECORDS COLORS, NOT NAMES. An earlier revision compared only `cls`, so
 * a mutant that changed a pinned row's WRONG color from one wrong value to another
 * passed. Each exception carries its `(surface, canvas)` pair, so a pinned row that
 * changes shade fails like any other.
 */
const EXEMPTED_FRAMES = [
  'title', 'closing', 'divider', 'topic',
  'decision-cover', 'compare-code-cover', 'compare-split-cover',
  'list-tabular-cover', 'split-panel-cover',
];
// Painters that need no exemption (declared after the dark rule) plus a plain control.
const OTHER_FRAMES = ['lat-split-cover', 'content', 'image', 'scene', 'chart-frame', 'premise', 'compare-code', 'split-compare', 'split-panel'];
const ALL_FRAMES = [...EXEMPTED_FRAMES, ...OTHER_FRAMES];
// The deck registers that can REPAINT a frame's canvas out from under it. These are
// the classes the `--fin-canvas` selectors reason about, and the only ones whose
// PAIRWISE interaction changes an outcome (a carve-out at (0,3,1) beating a repainter
// at (0,2,1) needs both present at once).
const REGISTERS = [
  'print', 'accent', 'spectrum-off',
  'spectrum-edge-left', 'spectrum-edge-right', 'spectrum-edge-bottom', 'spectrum-edge-off',
];
// The canvas modifiers a deck can be IN, for the attribute axis below. `print` is in
// REGISTERS too (it is both a mode and a repainter), so the attribute cross pairs these
// with the registers MINUS print rather than crossing print with itself.
const CANVAS_MODES = ['', 'dark', 'light', 'print', 'color-light', 'color-system'];
const REGISTERS_NO_PRINT = REGISTERS.filter((r) => r !== 'print');

/**
 * Every class the bundle uses in a SECTION-SUBJECT rule that paints a background,
 * minus the frame names themselves — i.e. the modifiers that can land on a frame and
 * change what it paints. Recurses into `:is()`/`:where()`/`:not()`, because
 * `section.dark:is(.spectrum-edge-left, …)` hides four of them there.
 */
function deriveModifiers(css) {
  const csstree = require('css-tree');
  const ast = csstree.parse(css);
  const frames = new Set(ALL_FRAMES);
  const mods = new Set();
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      // EVERY section-subject rule, not only the ones that PAINT. Deriving from
      // painting rules alone was the obvious cut and it is wrong: `corners-rounded`
      // (the `corners:` register) never appears in a background rule, so a mutant
      // excluding it from `--fin-canvas` passed that version of this gate while
      // breaking seven real rows. What matters is whether the engine can stamp the
      // class on a section, not whether that class happens to paint.
      if (node.prelude.type !== 'SelectorList') return;
      for (const sel of node.prelude.children) {
        const parts = [...sel.children];
        // Subject compound only — a combinator means the painted thing is a descendant.
        if (parts.some((x) => x.type === 'Combinator')) continue;
        if (parts[0].type !== 'TypeSelector' || parts[0].name !== 'section') continue;
        csstree.walk(sel, {
          visit: 'ClassSelector',
          enter(c) {
            if (!frames.has(c.name)) mods.add(c.name);
          },
        });
      }
    },
  });
  return [...mods].sort();
}

/**
 * The child shapes a frame's own CSS distinguishes, read out of the bundle with
 * css-tree rather than a regex — and the swap is the point.
 *
 * A child can only move the SECTION's canvas through a rule that (a) has the section
 * as its subject, (b) gates on `:has()` inside that subject compound, and (c) declares
 * one of the two things this gate compares. That is exactly the set this walks.
 * Shapes are filtered to painting rules on purpose and modifiers deliberately are NOT
 * (see `deriveModifiers`): a class the engine can stamp matters whether or not it
 * paints, but a child gating no painting rule cannot move the canvas at all.
 *
 * WHY NOT THE REGEX IT REPLACES. `section\.<frame>[^{,]*:has\(\s*>\s*([a-z]+)\.([a-z-]+)`
 * demanded tag DOT class. Every other form returned nothing — or, worse, a WRONG class,
 * silently: a bare `:has(> .cls)`, a descendant `:has(ul.cls)`, an attribute
 * `:has(> ul[data-x])`, an uppercase tag, and a digit or underscore in the class name
 * (`tile-track2` built `class="tile-track"`). It also keyed on `section.<frame>`, so a
 * BARE `section:has(…)` rule — a shape EVERY frame can be in — was invisible for all 18
 * of them. Nine such rules are in the bundle today; measured, none moves either side of
 * the comparison, which is why this was a latent hole and not a live defect.
 *
 * AN UNBUILDABLE SHAPE FAILS LOUDLY. If a canvas rule ever gates on a `:has()` this
 * cannot turn into a probe element, it lands in `unbuildable` and the self-check in
 * `before()` turns red. Quietly returning the shapes it did understand is precisely how
 * a derivation stops covering the thing it was written for — which is the failure this
 * gate exists to prevent, one level up.
 */
function deriveShapes(css) {
  const csstree = require('css-tree');
  const ast = csstree.parse(css);
  const frames = new Set(ALL_FRAMES);
  /** frame name (or '*' for a bare `section`) -> Set of probe-element HTML */
  const byFrame = new Map();
  const unbuildable = [];
  /** probe HTML -> the `:has(…)` text it was built from, so `before()` can prove it matches */
  const forms = new Map();

  // One `:has()` branch -> one probe element. Supported, because all of it is in the
  // bundle today: `>` chains (`> .cell-stage > p` nests), a descendant with no
  // combinator (built as a direct child, which still matches), and tag / class /
  // attribute in any compound. Refused — and therefore REPORTED — is anything carrying
  // a pseudo-class or pseudo-element, a `~`/`+` sibling, or an empty compound: those
  // cannot be expressed as one child element, and a shape built WRONG is worse than a
  // shape known missing.
  const one = (sel) => {
    const compounds = [[]];
    for (const x of sel.children) {
      if (x.type === 'Combinator') {
        if (x.name !== '>' && x.name !== ' ') return null;
        compounds.push([]);
      } else compounds[compounds.length - 1].push(x);
    }
    const open = [];
    const close = [];
    for (const compound of compounds) {
      if (!compound.length) continue;
      let tag = null;
      const classes = [];
      const attrs = [];
      for (const x of compound) {
        if (x.type === 'TypeSelector') tag = x.name;
        else if (x.type === 'ClassSelector') classes.push(x.name);
        else if (x.type === 'AttributeSelector') {
          attrs.push(`${x.name.name}="${x.value ? (x.value.value ?? x.value.name) : ''}"`);
        } else return null;
      }
      if (!tag && !classes.length && !attrs.length) return null;
      tag = tag || 'div';
      const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
      const at = attrs.length ? ` ${attrs.join(' ')}` : '';
      open.push(`<${tag}${cls}${at}>`);
      close.unshift(`</${tag}>`);
    }
    if (!open.length) return null;
    return `${open.join('')}<li>x</li>${close.join('')}`;
  };

  const build = (hasNode) => {
    const list = hasNode.children?.first;
    if (!list || list.type !== 'SelectorList') return null;
    const out = [];
    for (const sel of list.children) {
      if (sel.type !== 'Selector') return null;
      const html = one(sel);
      if (html === null) return null;
      out.push(html);
    }
    return out.length ? out : null;
  };

  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      // EXACTLY THE TWO SIDES THIS GATE COMPARES: the section's own background, and
      // `--fin-canvas`. A child shape can only change the verdict by moving one of
      // them. Widening this to "any custom property" was measured and is wrong in the
      // expensive direction: it pulls in the nine bare `section:has(…)` layout rules
      // (`--coda-host-gap`, `--cards-align`), which move neither side, and because they
      // are bare they attach to all 18 frames — a 10x cross that ran 6.5 minutes and
      // then died on a CDP timeout. Redefining a token BOTH sides consume
      // (`--surface-inverse`) cancels out and cannot break the comparison, which is why
      // it is not listed.
      let paints = false;
      for (const d of node.block.children) {
        if (d.type !== 'Declaration') continue;
        if (/^background(-color|-image)?$/.test(d.property) || d.property === '--fin-canvas') paints = true;
      }
      if (!paints) return;
      for (const sel of node.prelude.children) {
        const parts = [...sel.children];
        if (parts[0].type !== 'TypeSelector' || parts[0].name !== 'section') continue;
        // Subject compound only: past a combinator the `:has()` belongs to a DESCENDANT,
        // not to the section, so it cannot gate the section's canvas.
        // `section.title h1 + p:has(> code:only-child)` is that shape and there are
        // several — counting them would have multiplied this cross for nothing.
        const compound = [];
        for (const x of parts) {
          if (x.type === 'Combinator') break;
          compound.push(x);
        }
        const classes = compound.filter((x) => x.type === 'ClassSelector').map((x) => x.name);
        const targets = classes.filter((c) => frames.has(c));
        const keys = targets.length ? targets : ['*'];
        // `:has()` reached through `:not()` / `:is()` / `:where()` counts — the topic
        // arms wrap theirs in exactly that way.
        const stack = [...compound];
        while (stack.length) {
          const q = stack.pop();
          if (q.type === 'PseudoClassSelector' && q.name === 'has' && q.children) {
            const html = build(q);
            if (html === null) unbuildable.push(csstree.generate(q));
            else {
              for (const h of html) forms.set(h, csstree.generate(q));
            }
            if (html !== null)
              for (const k of keys) {
                if (!byFrame.has(k)) byFrame.set(k, new Set());
                for (const h of html) byFrame.get(k).add(h);
              }
            continue;
          }
          if (q.children) for (const c of q.children) stack.push(c);
        }
      }
    },
  });
  return { byFrame, unbuildable, forms };
}

/** `['']` plus every shape that frame's canvas rules — or a bare `section` rule — gate on. */
function shapesFor(frame, census) {
  return ['', ...(census.byFrame.get(frame) || []), ...(census.byFrame.get('*') || [])];
}

/**
 * The VARIANT classes a frame's own sheet pairs with it in a painting rule —
 * `section.topic.fact`, `section.split-panel.metric`, `section.divider.light`.
 *
 * These are not modifiers, and the difference is what round five found. A modifier is
 * stamped by a register and sits beside the frame; a VARIANT is part of the component's
 * own canvas statement and RESTATES it at a specificity a register cannot reach.
 * `section.topic.fact` (0,2,1) out-specifies `section.print` (0,1,1), so a fact slide
 * KEEPS its inverse canvas under print while plain topic correctly gives it up — and an
 * arm written for plain topic sent `--fin-canvas` to white over a surface still painting
 * rgb(236,236,236). On every one of the 33 palettes, and only in the export.
 *
 * Neither existing axis could see it: the pairwise cross puts ONE class beside the
 * frame, and the depth-3 cross pairs REGISTERS with each other. Nothing put a variant
 * and a register on the same section. Crossing this list with the registers is the
 * cheap targeted version — sixteen pairs, not 211 modifiers, so it costs hundreds of
 * cells instead of the ~46k a full modifier x register cross would add.
 */
function deriveVariants(css) {
  const csstree = require('css-tree');
  const ast = csstree.parse(css);
  const frames = new Set(ALL_FRAMES);
  const out = new Map();
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      let paints = false;
      for (const d of node.block.children) {
        if (d.type !== 'Declaration') continue;
        if (/^background(-color|-image)?$/.test(d.property) || d.property === '--fin-canvas') paints = true;
      }
      if (!paints) return;
      for (const sel of node.prelude.children) {
        const parts = [...sel.children];
        if (parts[0].type !== 'TypeSelector' || parts[0].name !== 'section') continue;
        const compound = [];
        for (const x of parts) {
          if (x.type === 'Combinator') break;
          compound.push(x);
        }
        const classes = compound.filter((x) => x.type === 'ClassSelector').map((x) => x.name);
        const fr = classes.filter((c) => frames.has(c));
        const rest = classes.filter((c) => !frames.has(c));
        if (fr.length !== 1 || !rest.length) continue;
        if (!out.has(fr[0])) out.set(fr[0], new Set());
        for (const r of rest) out.get(fr[0]).add(r);
      }
    },
  });
  return out;
}

/**
 * The SUBJECT ATTRIBUTES a canvas rule gates on — the axis every derivation in this file
 * was blind to, and the reason #2294 had a third family nobody had measured.
 *
 * `deriveModifiers`, `deriveShapes` and `deriveVariants` all walk `ClassSelector` nodes.
 * A canvas rule keyed on an ATTRIBUTE is therefore invisible to the whole cross, and
 * three of them are in the bundle today:
 *
 *     section.print[data-split-role="cover"]            -> var(--surface-inverse)
 *     section.split-panel-cover:is([data-split-mods~="cat-N"])  -> var(--panel-fill)
 *     section.image[data-img-composition="gallery"]     -> var(--img-matte)
 *     section.scene[data-img-composition="gallery"|"spotlight"|"statement"]
 *
 * The first is the one that matters most, because it is BARE — no frame class — so it
 * repaints any frame carrying the stamp, and `split-envelope.js` `withRole` stamps it on
 * every cover the splitter emits. Measured before this axis existed: all six covers under
 * print paint rgb(236,236,236) and `--fin-canvas` was white, on every palette, in the
 * export only. The class-only cross could not see a single one of those rows, and neither
 * could the 40 imagery rows beside them.
 *
 * SCOPED TO MODE x REGISTER, NOT TO ALL 219 MODIFIERS, for the same reason the register
 * pairs above are: the interaction these selectors reason about is "an attribute-gated
 * painter against the canvas modifier that would otherwise repaint it". Measured, the axis
 * takes the cross from 48,636 cells to 60,263 -- 11,627 rows, +24%, +1.7s; crossing the
 * attributes against every modifier instead would add roughly four times the whole cross
 * and buy nothing the selectors are written about.
 *
 * `class`-VALUED ATTRIBUTE SELECTORS ARE SKIPPED, and proved covered rather than assumed:
 * `section:where([class*="tint-"], [class*="mark-"], [class~="backdrop-none"])` is a
 * painting rule, but writing `class="tint-"` onto the probe would clobber the frame class
 * the row is about. Those values are reached by the CLASS axis instead — `tint-corner`,
 * `mark-micro` and `backdrop-none` are all in `deriveModifiers`'s list — and
 * `assertClassGuardsCovered` fails if one ever is not.
 */
function deriveSubjectAttributes(css) {
  const csstree = require('css-tree');
  const ast = csstree.parse(css);
  const frames = new Set(ALL_FRAMES);
  /** frame name (or '*' for a bare `section` rule) -> Set of probe markup, `name="value"` */
  const byFrame = new Map();
  const unbuildable = [];
  /** probe markup -> the attribute selector it came from, so `before()` can prove it matches */
  const forms = new Map();
  /** `[class…]` selectors deferred to the class axis, as [matcher, value] */
  const classGuards = [];

  // One attribute selector -> one `name="value"` the probe can carry. `=`, `~=`, `^=`,
  // `$=`, `*=` and `|=` are all satisfied by the bare value, and `[name]` with no value by
  // an empty string — but none of that is trusted: every built attribute is asserted in
  // the browser against the selector it came from, exactly as the `:has()` probes are.
  const build = (node) => {
    if (node.name.type !== 'Identifier') return null; // a namespaced attribute
    const name = node.name.name;
    if (!node.value) return `${name}=""`;
    const v = node.value.type === 'String' ? node.value.value : node.value.name;
    if (typeof v !== 'string' || /["\\]/.test(v)) return null;
    return `${name}="${v}"`;
  };

  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      let paints = false;
      for (const d of node.block.children) {
        if (d.type !== 'Declaration') continue;
        if (/^background(-color|-image)?$/.test(d.property) || d.property === '--fin-canvas') paints = true;
      }
      if (!paints) return;
      for (const sel of node.prelude.children) {
        const parts = [...sel.children];
        if (parts[0].type !== 'TypeSelector' || parts[0].name !== 'section') continue;
        // A rule with a combinator paints a DESCENDANT, not the section, so an attribute in
        // its subject compound cannot move the section's own canvas. `deriveModifiers` draws
        // the line in the same place and for the same reason.
        if (parts.some((x) => x.type === 'Combinator')) continue;
        if (parts.some((x) => x.type === 'PseudoElementSelector')) continue;
        const classes = parts.filter((x) => x.type === 'ClassSelector').map((x) => x.name);
        const targets = classes.filter((c) => frames.has(c));
        const keys = targets.length ? targets : ['*'];
        const stack = [...parts];
        while (stack.length) {
          const q = stack.pop();
          if (q.type === 'AttributeSelector') {
            if (q.name.type === 'Identifier' && q.name.name === 'class') {
              const v = q.value ? (q.value.type === 'String' ? q.value.value : q.value.name) : null;
              if (typeof v === 'string') classGuards.push([q.matcher, v]);
              continue;
            }
            const markup = build(q);
            if (markup === null) { unbuildable.push(csstree.generate(q)); continue; }
            forms.set(markup, csstree.generate(q));
            for (const k of keys) {
              if (!byFrame.has(k)) byFrame.set(k, new Set());
              byFrame.get(k).add(markup);
            }
            continue;
          }
          // A `:has()` describes a CHILD — `deriveShapes` owns that axis.
          if (q.type === 'PseudoClassSelector' && q.name === 'has') continue;
          if (q.children) for (const c of q.children) stack.push(c);
        }
      }
    },
  });
  return { byFrame, unbuildable, forms, classGuards };
}

/**
 * THE CLASSES THAT DEFINE THE TOKEN AN ARM POINTS AT, which is a different question from
 * "what modifies a frame" and the reason a whole family of rows passed VACUOUSLY.
 *
 * `--fin-canvas: var(--panel-fill)` on `section.split-panel-cover:is([data-split-mods~=
 * "cat-N"])` is only meaningful where `--panel-fill` is DEFINED, and it is defined one
 * component over, on `section.split-panel-split[data-split-mods~="cat-N"]` — a class the
 * splitter stamps on the same section (`content split-panel-split split-panel-cover form`)
 * and that none of the other derivations here has any reason to find. Without it both
 * sides of the comparison are an unresolved `var()`, so the surface is `rgba(0,0,0,0)`,
 * `--fin-canvas` is `rgba(0,0,0,0)`, and every one of those rows passed by matching
 * nothing against nothing. Found by the HARD RULE #25 checker.
 *
 * So: read the token each `--fin-canvas` arm names, find the section-subject rules that
 * DECLARE that token, and carry their classes onto the probe. `--surface-inverse` and
 * `--accent` yield nothing — they are theme-level, declared at `:root` — which is exactly
 * right: only a token defined by a CLASS needs the class to be present.
 */
function deriveTokenCarriers(css) {
  const csstree = require('css-tree');
  const ast = csstree.parse(css);
  const frames = new Set(ALL_FRAMES);
  /** frame -> Set of custom-property names its `--fin-canvas` arms point at */
  const tokensByFrame = new Map();
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      const toks = [];
      for (const d of node.block.children) {
        if (d.type !== 'Declaration' || d.property !== '--fin-canvas') continue;
        // css-tree parses a CUSTOM PROPERTY's value as `Raw`, not as a Function tree, so
        // walking it for `var()` nodes finds nothing — which is how a first cut of this
        // derivation returned an empty map and the guard below caught it. Read the text.
        for (const m of csstree.generate(d.value).matchAll(/var\(\s*(--[\w-]+)/g)) toks.push(m[1]);
      }
      if (!toks.length) return;
      for (const sel of node.prelude.children) {
        csstree.walk(sel, {
          visit: 'ClassSelector',
          enter(c) {
            if (!frames.has(c.name)) return;
            if (!tokensByFrame.has(c.name)) tokensByFrame.set(c.name, new Set());
            for (const t of toks) tokensByFrame.get(c.name).add(t);
          },
        });
      }
    },
  });

  const wanted = new Set([...tokensByFrame.values()].flatMap((s) => [...s]));
  // A TOKEN WITH A GLOBAL DEFINITION NEEDS NO CARRIER, and dropping this filter made the
  // derivation worse than useless: `--surface-inverse` is declared at `:root` by every
  // theme AND remapped by `section.print`, so a naive version handed back `print` as a
  // "carrier" for all nine inverse frames — which would have forced print mode onto every
  // attribute row in the cross. What matters is a token NOTHING global defines, so the
  // probe resolves it only when the class is present. `--panel-fill` is the one.
  const globallyDefined = new Set();
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      const bare = [...node.prelude.children].some((sel) => {
        const parts = [...sel.children];
        if (parts.some((x) => x.type === 'Combinator')) return false;
        if (parts.some((x) => x.type === 'ClassSelector' || x.type === 'AttributeSelector')) return false;
        return true; // `:root`, `*`, a bare `section`, `html` …
      });
      if (!bare) return;
      for (const d of node.block.children) {
        if (d.type === 'Declaration' && wanted.has(d.property)) globallyDefined.add(d.property);
      }
    },
  });
  /** token -> Set of non-frame subject classes whose rule declares it */
  const carriersByToken = new Map();
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      const declared = [...node.block.children]
        .filter((d) => d.type === 'Declaration' && wanted.has(d.property) && !globallyDefined.has(d.property))
        .map((d) => d.property);
      if (!declared.length) return;
      for (const sel of node.prelude.children) {
        const parts = [...sel.children];
        if (parts[0].type !== 'TypeSelector' || parts[0].name !== 'section') continue;
        if (parts.some((x) => x.type === 'Combinator')) continue;
        const classes = parts
          .filter((x) => x.type === 'ClassSelector')
          .map((x) => x.name)
          .filter((c) => !frames.has(c));
        if (!classes.length) continue;
        for (const t of declared) {
          if (!carriersByToken.has(t)) carriersByToken.set(t, new Set());
          for (const c of classes) carriersByToken.get(t).add(c);
        }
      }
    },
  });

  const out = new Map();
  for (const [frame, toks] of tokensByFrame) {
    const set = new Set();
    for (const t of toks) for (const c of carriersByToken.get(t) || []) set.add(c);
    if (set.size) out.set(frame, set);
  }
  return out;
}

/** `name="value"` back into the pair `setAttribute` takes. */
function splitAttr(markup) {
  const eq = markup.indexOf('=');
  return { name: markup.slice(0, eq), value: markup.slice(eq + 2, -1) };
}

/** Every subject attribute that frame's canvas rules — or a bare `section` rule — gate on. */
function attrsFor(frame, census) {
  return [...(census.byFrame.get(frame) || []), ...(census.byFrame.get('*') || [])];
}

/**
 * A `[class…]` selector we declined to build is only safe to skip while the CLASS axis
 * reaches the same values. Asserted, not assumed — a future `[class*="layout-"]` canvas
 * rule with no `layout-*` class anywhere in a section-subject rule would otherwise leave a
 * painter uncrossed and this file none the wiser.
 */
function assertClassGuardsCovered(guards, mods) {
  const SATISFIES = {
    '=': (m, v) => m === v,
    '~=': (m, v) => m === v,
    '^=': (m, v) => m.startsWith(v),
    '$=': (m, v) => m.endsWith(v),
    '*=': (m, v) => m.includes(v),
    '|=': (m, v) => m === v || m.startsWith(`${v}-`),
  };
  const uncovered = guards
    .filter(([matcher, v]) => {
      const ok = SATISFIES[matcher];
      return !ok || !mods.some((m) => ok(m, v));
    })
    .map(([matcher, v]) => `[class${matcher}"${v}"]`);
  assert.deepEqual(
    [...new Set(uncovered)], [],
    'a canvas rule is gated on a `class` attribute selector that no class in the modifier '
      + `axis satisfies, so that painter is never crossed: ${[...new Set(uncovered)].join(', ')}`,
  );
}

/**
 * A short, stable name for a probe shape, so a failure says WHICH shape broke.
 * Computed in Node and passed in: doing it in the page as
 * `child.match(/class="([a-z-]+)"/)[1]` threw on the first shape with no class at all
 * (`<svg data-lattice-rough-ink>`), taking the whole assertion down with a TypeError
 * instead of a diff.
 */
function shapeLabel(child) {
  const cls = child.match(/class="([^"]+)"/);
  if (cls) return cls[1].split(' ')[0];
  const tag = child.match(/^<([a-z]+)/i);
  return tag ? tag[1] : 'shape';
}

describe('--fin-canvas follows the painted surface across every modifier the bundle knows', () => {
  let xBrowser;
  let xPage;
  const cases = [];

  before(async () => {
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    const mods = deriveModifiers(bundle);
    assert.ok(mods.length > 20, `expected the bundle to yield a real modifier list, got ${mods.length}`);

    // THE DERIVATIONS GET THE SAME GUARD THE MODIFIER LIST HAS, and they did not before.
    // `shapesFor` was the single point of failure for the whole tracked-topic fix and
    // nothing asserted it had found anything. Demonstrated: with the topic split
    // collapsed back to one arm this gate names the bad rows, but collapse the split AND
    // neuter the derivation to `['']` and it passes — green, blind, and reopening exactly
    // the hole the split was written to close.
    const census = deriveShapes(bundle);
    assert.deepEqual(
      census.unbuildable,
      [],
      'a canvas rule gates on a `:has()` this cross cannot turn into a probe element, so '
        + 'that shape would go untested — teach the builder the form, or the cross is '
        + `silently narrower than it claims: ${census.unbuildable.join(', ')}`,
    );
    assert.ok(
      shapesFor('topic', census).some((h) => h.includes('tile-track')),
      'the tracked-topic shape vanished from the derivation — `topic-track.js` writes '
        + '`<ul class="tile-track">` on both the derived and the `_track:` path, so a cross '
        + 'without it measures a shape the engine never emits',
    );
    const variants = deriveVariants(bundle);
    assert.ok(
      (variants.get('topic') || new Set()).has('fact'),
      'topic.fact vanished from the variant list — it is the pair this axis was added for',
    );
    // THE ATTRIBUTE AXIS GETS THE SAME THREE GUARDS THE OTHERS HAVE, because it was added
    // to close a hole the others could not see and a silently empty derivation would
    // reopen it: refuse what it cannot build, name the two pairs it exists for, and prove
    // the `class` selectors it declines are reached by the class axis instead.
    const attrs = deriveSubjectAttributes(bundle);
    assert.deepEqual(
      attrs.unbuildable, [],
      'a canvas rule gates on an attribute selector this cross cannot turn into a probe '
        + `attribute, so that painter would go untested: ${attrs.unbuildable.join(', ')}`,
    );
    assert.ok(
      attrsFor('title', attrs).includes('data-split-role="cover"'),
      'the bare `section.print[data-split-role="cover"]` painter vanished from the attribute '
        + 'derivation — it carries no frame class, so it repaints EVERY frame that carries '
        + 'the stamp, and it is the rule this axis was added for',
    );
    assert.ok(
      attrsFor('split-panel-cover', attrs).some((a) => a.startsWith('data-split-mods=')),
      "split-panel-cover's category tint vanished from the attribute derivation — it is the "
        + 'frame-scoped half of the same axis',
    );
    assertClassGuardsCovered(attrs.classGuards, mods);
    // THE SAME POPULATION GUARD THE SHAPE AXIS HAS, and for the same reason it has it:
    // `attrs.forms` (what the probe-match loop proves) and `attrs.byFrame` (what the cross
    // measures) are filled in two different statements, so their being equal is incidental.
    // A derivation that built an attribute WRONG and skipped `forms.set` for it would go
    // unproved and silently measure a section the painter never matches. Measured by the
    // HARD RULE #25 checker on exactly that mutant: green, 4/4, with the 40 imagery rows
    // this axis exists for measuring nothing.
    const measuredAttrs = [...new Set([...attrs.byFrame.values()].flatMap((set) => [...set]))].sort();
    assert.deepEqual(
      [...attrs.forms.keys()].sort(), measuredAttrs,
      'the attribute probe-match check and the cross are looking at different attribute sets, '
        + 'so an attribute can be measured without ever being proved to match the selector it came from',
    );
    // THEME FIRST, because "is this token defined globally?" is a question about the
    // stylesheet the PAGE loads, and `--surface-inverse` / `--accent` are declared at
    // `:root` by the THEME, not by the bundle. Passing the bundle alone made every inverse
    // frame carry `print` (the print band remaps `--surface-inverse`), which would have
    // forced print mode onto every attribute row in the cross.
    const carriers = deriveTokenCarriers(`${theme}\n${bundle}`);
    // A CANVAS MODE IS NEVER A CARRIER, and this guard is what keeps the `globallyDefined`
    // filter above honest across 33 palettes. `section.print` REMAPS `--surface-inverse`,
    // so a theme that failed to declare that token at `:root` would hand `print` back as a
    // "carrier" and force print mode onto every attribute row in the cross — silently
    // measuring a different question than the one this file asks.
    const modeClasses = CANVAS_MODES.filter(Boolean);
    const badCarriers = [...carriers].flatMap(([frame, set]) =>
      [...set].filter((c) => modeClasses.includes(c)).map((c) => `${frame} <- ${c}`));
    assert.deepEqual(
      badCarriers, [],
      'a canvas MODE came back as a token carrier, which would pin every attribute row for '
        + `that frame into one mode: ${badCarriers.join(', ')}`,
    );
    assert.ok(
      (carriers.get('split-panel-cover') || new Set()).has('split-panel-split'),
      "the class that DEFINES --panel-fill vanished from the carrier derivation — without it "
        + "both sides of every cat-N row are an unresolved var() and the comparison is "
        + 'rgba(0,0,0,0) against rgba(0,0,0,0)',
    );
    // Both halves: a modifier alone, and the same modifier with `dark`. (3) above was
    // invisible to a dark-only cross and (2) to a single-class one.
    // EVERY FRAME IS BUILT IN EVERY DOM SHAPE ITS OWN CSS DISTINGUISHES. A canvas rule
    // may be gated on a CHILD — `section.topic:not(:has(> ul.tile-track))` restates
    // topic's canvas at (0,2,2) precisely because the bare (0,1,1) form loses to later
    // modifiers — so a topic WITH a track and one WITHOUT resolve differently under
    // print, accent and spectrum-off. An empty `<section>` probe sees only the
    // trackless shape, which is the shape the engine never emits: `topic-track.js`
    // writes `<ul class="tile-track">` on both the derived and the `_track:` arm.
    // Measured: a version of this file with childless probes passed 4/4 while five
    // tracked-topic rows composited against a color the slide does not paint.
    //
    // SHAPES is derived from the bundle the same way the modifier list is: any
    // `:has(> X)` in a section-subject rule is a shape this cross has to build.
    for (const f of ALL_FRAMES) {
      for (const child of shapesFor(f, census)) {
        cases.push({ cls: f, child });
        cases.push({ cls: `${f} dark`, child });
        for (const m of mods) {
          if (m === 'dark') continue;
          cases.push({ cls: `${f} ${m}`, child });
          cases.push({ cls: `${f} dark ${m}`, child });
        }
        // DEPTH THREE, FOR THE REGISTERS ONLY. The pairwise cross above cannot reach
        // `divider dark accent spectrum-off`, and that row is the whole reason the
        // divider arm excludes `.accent` CONDITIONALLY: its (0,3,1) spectrum carve-out
        // out-specifies `section.accent.dark` (0,2,1), so the frame keeps its canvas
        // there and must not be excluded. Measured: a version of this cross without
        // these pairs passed while a mutant collapsing that condition broke two real
        // rows. A full depth-3 cross over 219 modifiers is ~48k cells per frame; the
        // registers are seven, so their pairs cost 42 rows per frame and buy the one
        // interaction the selectors actually reason about.
        for (const a of REGISTERS) {
          for (const b of REGISTERS) {
            if (a === b) continue;
            cases.push({ cls: `${f} ${a} ${b}`, child });
            cases.push({ cls: `${f} dark ${a} ${b}`, child });
          }
        }
        // VARIANT x REGISTER — see `deriveVariants`. This is the axis that hid the
        // tracked `topic fact print` defect from four review rounds and both gates.
        for (const v of variants.get(f) || []) {
          for (const r of REGISTERS) {
            cases.push({ cls: `${f} ${v} ${r}`, child });
            cases.push({ cls: `${f} dark ${v} ${r}`, child });
          }
        }
        // SUBJECT ATTRIBUTE x MODE x REGISTER — see `deriveSubjectAttributes`. The axis
        // that hid `section.print[data-split-role="cover"]` and the two imagery mattes
        // from every previous revision of this file, because all three other derivations
        // walk `ClassSelector` nodes and an attribute is not one.
        // The token-carrier classes ride every attribute row for this frame — see
        // `deriveTokenCarriers`. For seventeen of the eighteen frames this is the empty
        // string and nothing changes.
        const carried = [...(carriers.get(f) || [])].join(' ');
        for (const attr of attrsFor(f, attrs)) {
          for (const m of CANVAS_MODES) {
            for (const r of ['', ...REGISTERS_NO_PRINT]) {
              cases.push({ cls: [f, carried, m, r].filter(Boolean).join(' '), child, attr });
              // WITH `dark` AS WELL, for the reason regression (3) above records: every
              // repainter but print needs `.dark`, so an axis that never sets it sees
              // only half of what an exclusion does. `print dark accent` with the role
              // stamp is exactly that row — the surface is the dark deck ground, not the
              // print de-flood, and the de-flood's own arm had to learn it.
              if (m !== 'dark') cases.push({ cls: [f, carried, 'dark', m, r].filter(Boolean).join(' '), child, attr });
            }
          }
        }
      }
    }
    xBrowser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    xPage = await xBrowser.newPage();

    // THE PROBE MUST ACTUALLY MATCH THE SELECTOR IT WAS BUILT FROM, asserted in the
    // browser rather than by inspecting the string. The string check above ("some shape
    // mentions tile-track") is satisfied by a probe that mentions the class and does not
    // match — and that is not hypothetical: wrapping the built element in one classless
    // `<div>` keeps every row's LABEL reading `[tile-track]` while `:has(> ul.tile-track)`
    // stops matching, so the whole tracked axis silently measures the trackless shape
    // again. Measured: with that one-token change AND the `topic.fact` arm deleted from
    // the bundle, both gates passed 4/4 and the entire subject of this commit shipped
    // green. A refusal path catches forms it cannot PARSE; only this catches a form it
    // parses and builds WRONG.
    // AND THE POPULATION IT GUARDS MUST BE THE POPULATION THE CROSS MEASURES. The loop
    // below is over `forms`; the cross is built from `byFrame`. They are filled in two
    // different statements, so their being equal is incidental, not asserted — and a
    // loop over an EMPTY map passes. Measured: with `forms` left unpopulated, the
    // classless-`<div>` probe AND the `topic.fact` arm deleted from the bundle went
    // green again, 4/4 exit 0. That is the same vacuity this file closed in rounds four,
    // five and six, shipped a fourth time inside the guard written to close it — so the
    // guard now names its own population instead of trusting it.
    const measured = [...new Set([...census.byFrame.values()].flatMap((set) => [...set]))].sort();
    assert.deepEqual(
      [...census.forms.keys()].sort(),
      measured,
      'the probe-match check and the cross are looking at different shape sets, so a shape '
        + 'can be measured without ever being proved to match the selector it came from',
    );

    await xPage.setContent('<article class="lattice"></article>');
    // The attribute probes get the identical proof, and they need it MORE than the shapes
    // do: `build` turns `~=`, `^=`, `$=`, `*=` and `|=` into the same bare `name="value"`
    // on the reasoning that the bare value satisfies all of them. That reasoning is not
    // trusted here — it is checked against the real selector engine, one attribute at a
    // time, so an operator it gets wrong fails loudly instead of measuring a section the
    // painter never matches.
    const mismatched = await xPage.evaluate((pairs, attrPairs) => {
      const host = document.querySelector('article');
      const bad = [];
      for (const [html, form] of pairs) {
        const probe = document.createElement('section');
        probe.className = 'probe';
        probe.innerHTML = html;
        host.appendChild(probe);
        if (!probe.matches(`section${form}`)) bad.push(`${form}  built:  ${html}`);
        probe.remove();
      }
      for (const { markup, form } of attrPairs) {
        const probe = document.createElement('section');
        probe.className = 'probe';
        probe.setAttribute(markup.name, markup.value);
        host.appendChild(probe);
        if (!probe.matches(`section${form}`)) bad.push(`${form}  built:  ${markup.name}="${markup.value}"`);
        probe.remove();
      }
      return bad;
    }, [...census.forms], [...attrs.forms].map(([m, form]) => ({ markup: splitAttr(m), form })));
    assert.deepEqual(
      mismatched,
      [],
      'a probe element does NOT match the `:has()` it was derived from, so every row built '
        + `on it is measuring a shape the selector never sees:\n  ${mismatched.join('\n  ')}`,
    );

    await xPage.setContent(
      `<style>${theme}\n${bundle}</style><article class="lattice">` +
        cases
          .map(
            ({ cls, child, attr }, i) =>
              `<section id="x${i}" class="${cls} finish finish-atrium"${attr ? ` ${attr}` : ''}>` +
              `<div class="backdrop"></div>${child}` +
              `<span id="y${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>`,
          )
          .join('') +
        '</article>',
    );
  });

  after(async () => {
    await xBrowser?.close();
  });

  test('no frame composites against a color it does not paint', async () => {
    // The shape is part of the identity: `topic` and `topic + tile-track` are two
    // different cascade outcomes and a failure must name which one.
    // The attribute is part of the identity for the same reason the shape is: `topic` and
    // `topic[data-split-role="cover"]` are two cascade outcomes and a failure must name
    // which. Appended only when present, so the shape-only ids keep the spelling the
    // anti-vacuity check below looks them up by.
    const ids = cases.map(({ cls, child, attr }) =>
      `${cls}${attr ? ` {${attr}}` : ''}${child ? ` [${shapeLabel(child)}]` : ''}`);
    const rows = await xPage.evaluate(
      (cs) =>
        cs.map((cls, i) => ({
          cls,
          surface: getComputedStyle(document.getElementById(`x${i}`)).backgroundColor,
          canvas: getComputedStyle(document.getElementById(`y${i}`)).backgroundColor,
        })),
      ids,
    );
    assert.equal(rows.length, cases.length, 'every case rendered');
    // NOTHING IS PINNED ANY MORE (#2294 closed the two families #2293 left). The predicate
    // that used to stand here exempted the five accent covers outside `dark` and
    // `lat-split-cover` in every mode; both are fixed in `base.finish.css`, so RESIDUE is
    // empty and every row must match. A pin is a certificate, and the only honest number
    // of them is zero — measured, indaco: this cross leaves 0 mismatches out of 60,263.
    const RESIDUE = [];

    // AN UNRESOLVED `var()` IS NOT A PASS. `rgba(0, 0, 0, 0)` on both sides compares EQUAL,
    // so a row whose token the probe never defines is a row that measures nothing — which
    // is how every `--panel-fill` row passed before the carrier classes above landed.
    // `--fin-canvas` has `var(--bg)` as its declared default and every arm points at a
    // token the slide defines, so transparent is always the probe's fault, never an answer.
    const unresolved = rows.filter((r) => r.canvas === 'rgba(0, 0, 0, 0)').map((r) => r.cls);
    assert.deepEqual(
      unresolved.slice(0, 12), [],
      `--fin-canvas resolves to nothing on ${unresolved.length} row(s), so they compare `
        + `transparent against transparent and measure nothing:\n  ${unresolved.slice(0, 12).join('\n  ')}`,
    );

    const key = (r) => `${r.cls} | ${r.surface} | ${r.canvas}`;
    const found = rows
      .filter((r) => r.surface !== r.canvas)
      .map(key)
      .sort();
    const added = found.filter((k) => !RESIDUE.includes(k));
    const gone = RESIDUE.filter((k) => !found.includes(k));
    assert.deepEqual(
      added, [],
      'a finish would composite against a color the slide does not paint — a regression:'
        + `\n  ${added.join('\n  ')}`,
    );
    assert.deepEqual(
      gone, [],
      `these are pinned but now resolve correctly — remove them:\n  ${gone.join('\n  ')}`,
    );
  });

  /**
   * THE BAR RULES STILL REMOVE THE BAR, which nothing else in this file can see.
   *
   * After #2291 `section.dark.spectrum-off`, `section.dark:is(.spectrum-edge-*)` and the
   * two divider carve-outs consist of `background-image: none` plus the three geometry
   * longhands and NOTHING else. This cross compares `backgroundColor`, so 100% of what
   * those rules now do is invisible to it — and the HARD RULE #25 checker proved the
   * consequence: change `spectrum-off` to `background-image: var(--spectrum)`, so the
   * register stops removing the hairline that is its entire purpose, and every gate in the
   * repo stays green.
   *
   * Measured HERE rather than in the source contract because the question is what the
   * CASCADE resolves to on a real section, not what one rule says: the divider's rail and
   * the dark hairline are set by rules in two other files, and a source check would have to
   * reimplement the cascade to know whether `off` won.
   */
  test('the spectrum registers still clear the bar, and only the bar', async () => {
    const CASES = [
      // [class list, what should be left]
      ['content dark', 'image'],                   // the control: the hairline IS painted
      ['content dark spectrum-off', 'none'],
      ['content dark spectrum-edge-left', 'none'],
      ['content dark spectrum-edge-off', 'none'],
      ['divider', 'image'],                        // the control: the rail IS painted
      ['divider spectrum-off', 'none'],
      ['divider spectrum-edge-off', 'none'],
      // `spectrum-edge:` moves the bar to a border and is EXEMPT on a divider, whose own
      // rail stays — only `edge: off` clears that, on the row above.
      ['divider spectrum-edge-left', 'image'],
    ];
    const rows = await xPage.evaluate((cases) => {
      const host = document.querySelector('article');
      return cases.map(([cls]) => {
        const probe = document.createElement('section');
        probe.className = cls;
        host.appendChild(probe);
        const cs = getComputedStyle(probe);
        const out = {
          cls,
          image: cs.backgroundImage === 'none' ? 'none' : 'image',
          color: cs.backgroundColor,
          size: cs.backgroundSize,
          position: cs.backgroundPosition,
          repeat: cs.backgroundRepeat,
        };
        probe.remove();
        return out;
      });
    }, CASES);
    const wrong = rows
      .map((r, i) => (r.image === CASES[i][1] ? null : `  ${r.cls}: background-image ${r.image}, expected ${CASES[i][1]}`))
      .filter(Boolean);
    assert.deepEqual(
      wrong, [],
      `a spectrum register no longer does what it exists to do:\n${wrong.join('\n')}`,
    );
    // AND ONLY THE BAR. The geometry longhands belong to the bar too — the hairline's
    // `100% 1px`, the rail's `3.75px 100%` — and leaving them set meant an author's own
    // `background-image` on the same section rendered at the bar's size. Measured by the
    // checker: a full-bleed image became a 3.75px vertical rail on a dark spectrum-off
    // divider. They are reset with the image; `background-color` is the one left alone.
    const geometry = rows
      .filter((_r, i) => CASES[i][1] === 'none')
      .map((r) => (r.size === 'auto' && r.repeat === 'repeat' ? null : `  ${r.cls}: size ${r.size}, repeat ${r.repeat}`))
      .filter(Boolean);
    assert.deepEqual(
      geometry, [],
      "a rule that cleared the bar left the bar's GEOMETRY behind, so anything else painting "
        + `an image on that section takes the bar's size:\n${geometry.join('\n')}`,
    );
    // The canvas is untouched — the whole subject of #2291, asserted on the two frames that
    // paint one, so this test cannot pass by everything resolving to the deck ground.
    const canvas = rows.find((r) => r.cls === 'divider spectrum-off');
    const ground = rows.find((r) => r.cls === 'content dark spectrum-off');
    assert.notEqual(
      canvas.color, ground.color,
      "`divider spectrum-off` must keep its own canvas — if it matches the deck ground, a "
        + 'register is repainting a frame that paints its own surface again (#2291)',
    );
  });

  test('every exempted frame reaches its OWN token, not the deck canvas', async () => {
    // Guards the set assertion against passing vacuously: if every row resolved to
    // `var(--bg)` the comparison above would be green and every finish would be wrong.
    const out = await xPage.evaluate((names) => {
      const probe = document.createElement('section');
      probe.className = 'content dark';
      document.querySelector('article').appendChild(probe);
      const resolved = {};
      for (const n of names) {
        const sw = document.createElement('span');
        sw.style.backgroundColor = `var(${n})`;
        probe.appendChild(sw);
        resolved[n] = getComputedStyle(sw).backgroundColor;
      }
      probe.remove();
      return resolved;
    }, ['--surface-inverse', '--accent', '--bg']);
    assert.notEqual(out['--surface-inverse'], out['--bg'], '--surface-inverse must differ from --bg under dark');
    assert.notEqual(out['--accent'], out['--bg'], '--accent must differ from --bg under dark');

    const EXPECT = Object.fromEntries([
      ...['title', 'closing', 'divider', 'topic'].map((f) => [f, '--surface-inverse']),
      ...['decision-cover', 'compare-code-cover', 'compare-split-cover', 'list-tabular-cover', 'split-panel-cover'].map(
        (f) => [f, '--accent'],
      ),
    ]);
    // THE SHAPE BELONGS IN THIS IDENTITY TOO, and leaving it out made this check look at
    // the wrong row. It destructured `{ cls }` only, so `find(r => r.cls === 'topic dark')`
    // matched the FIRST row carrying that class — and since the shape set starts with
    // `''`, that is the TRACKLESS topic. The shape that actually ships was never
    // inspected by the one assertion standing between a vacuous pass and a green gate.
    // The attribute joins it for the same reason, and both are appended only when present
    // so the shape-only spellings this lookup uses stay exact.
    const ids = cases.map(({ cls, child, attr }) =>
      `${cls}${attr ? ` {${attr}}` : ''}${child ? ` [${shapeLabel(child)}]` : ''}`);
    const rows = await xPage.evaluate(
      (cs) => cs.map((cls, i) => ({ cls, canvas: getComputedStyle(document.getElementById(`y${i}`)).backgroundColor })),
      ids,
    );
    const wrong = [];
    for (const [frame, token] of Object.entries(EXPECT)) {
      // `topic` is asserted on the TRACKED shape specifically: that is what the engine
      // emits, and it is the arm whose exclusions this file keeps getting wrong.
      const want = frame === 'topic' ? 'topic dark [tile-track]' : `${frame} dark`;
      const row = rows.find((r) => r.cls === want);
      assert.ok(row, `${want} must be in the cross`);
      if (row.canvas !== out[token]) {
        wrong.push(`  ${want}: --fin-canvas ${row.canvas}, expected ${token} (${out[token]})`);
      }
    }
    assert.deepEqual(wrong, [], `a frame composites against the wrong token:\n${wrong.join('\n')}`);
  });
});
