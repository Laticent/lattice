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
    await xPage.setContent('<article class="lattice"></article>');
    const mismatched = await xPage.evaluate((pairs) => {
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
      return bad;
    }, [...census.forms]);
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
            ({ cls, child }, i) =>
              `<section id="x${i}" class="${cls} finish finish-atrium"><div class="backdrop"></div>${child}` +
              `<span id="y${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>`,
          )
          .join('') +
        '</article>',
    );
  });

  after(async () => {
    await xBrowser?.close();
  });

  test('no frame composites against a color it does not paint, beyond the pinned set', async () => {
    // The shape is part of the identity: `topic` and `topic + tile-track` are two
    // different cascade outcomes and a failure must name which one.
    const ids = cases.map(({ cls, child }) => (child ? `${cls} [${shapeLabel(child)}]` : cls));
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
    // TWO FAMILIES ARE KNOWN-WRONG AND DELIBERATELY NOT FIXED HERE (#2294), and they
    // are expressed as a PREDICATE rather than ~300 pinned strings, because the strings
    // would be noise a reader cannot audit:
    //
    //   - the five accent covers OUTSIDE `dark`. A cover paints `var(--accent)` in every
    //     mode; the re-point is scoped to `.dark` because widening it changes what a
    //     LIGHT deck's finish composites against, which is a different change.
    //   - `lat-split-cover`, in every mode. It paints `var(--accent)` too and is never
    //     re-pointed at all.
    //
    // Both are identical on `main`. Everything else must match, and RESIDUE is the
    // measured proof of that: `main` leaves 89 rows outside these two families, this
    // tree leaves 0. A single new string here is a regression, not a housekeeping edit.
    const COVERS = new Set([
      'decision-cover', 'compare-code-cover', 'compare-split-cover',
      'list-tabular-cover', 'split-panel-cover',
    ]);
    const known2294 = (cls) => {
      const [frame] = cls.split(' ');
      if (frame === 'lat-split-cover') return true;
      return COVERS.has(frame) && !cls.split(' ').includes('dark');
    };
    const RESIDUE = [];

    const key = (r) => `${r.cls} | ${r.surface} | ${r.canvas}`;
    const found = rows
      .filter((r) => r.surface !== r.canvas)
      .filter((r) => !known2294(r.cls))
      .map(key)
      .sort();
    const added = found.filter((k) => !RESIDUE.includes(k));
    const gone = RESIDUE.filter((k) => !found.includes(k));
    assert.deepEqual(
      added, [],
      'a finish would composite against a color the slide does not paint, outside the '
        + `two known #2294 families — a regression:\n  ${added.join('\n  ')}`,
    );
    assert.deepEqual(
      gone, [],
      `these are pinned but now resolve correctly — remove them:\n  ${gone.join('\n  ')}`,
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
    const ids = cases.map(({ cls, child }) => (child ? `${cls} [${shapeLabel(child)}]` : cls));
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
