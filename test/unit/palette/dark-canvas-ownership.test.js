/**
 * The dark canvas must not repaint a frame that paints its own — and the list of
 * those frames, which lives in a CSS selector, must not rot.
 *
 * `section.dark` paints the deck-wide canvas at (0,1,1). A frame that paints its
 * OWN section canvas does so at the same specificity, so at equal specificity the
 * CASCADE FALLS BACK TO SOURCE ORDER and whichever is declared later wins. Every
 * component stylesheet is bundled BEFORE base.modifiers.css — so without an
 * exemption the deck-wide canvas wins and the frame loses the surface it drew for
 * itself. That shipped: under `color-mode: dark`, `divider` lost its vertical
 * spectrum rail and `title`/`closing` lost `--surface-inverse`.
 *
 * THE INVARIANT IS ABOUT ORDER, NOT ABOUT PAINTING. "Paints its own canvas" is
 * necessary but not sufficient, and the difference is a real frame in this tree:
 * `section.lat-split-cover` (base.modifiers.css) paints `var(--accent)` at the
 * same (0,1,1) and is deliberately NOT in the list, because it is declared ~2,200
 * lines AFTER the dark rule in the same file and therefore already wins. The rule
 * this file enforces is:
 *
 *     a frame that paints a non-`--bg` section canvas at (0,1,1) needs the
 *     exemption IF AND ONLY IF it is declared BEFORE the dark-canvas rule.
 *
 * An earlier revision said "the list is the frames that paint a canvas of their
 * own" and checked exactly that, which is why `lat-split-cover` read as a missing
 * entry rather than a correct omission.
 *
 * IT READS THE BUILT BUNDLE, not the source tree, and that is the point. Source
 * order is a property of `dist/lattice.css` — no source file knows where it lands
 * relative to another — so a gate that walks `lib/**` cannot ask the question
 * above at all. Reading the bundle also removes four blind spots the source walk
 * had, each of which certified a frame it should have rejected: a rule in a file
 * whose name does not end `.styles.css` (`_chart-family/chart-family.css`), a
 * root nobody listed (`lib/shared/shared.styles.css` carries a section canvas
 * today), a `background-image`-only painter — which is the EXACT shape of the
 * `divider` defect this rule exists to fix — and a comma list whose last selector
 * happened to be exempt already. `npm run build` writes the bundle, and the CI
 * `unit` job builds before it tests; sibling palette tests read it the same way.
 *
 * WHY NOT KEY ON SOVEREIGNTY. The obvious mechanical answer is the `form` class
 * the engine stamps on every non-sovereign section, which needs no list at all.
 * It is the wrong set: ten frames are sovereign and only four paint. Keying on it
 * would have taken the deck-wide hairline off the other six — compare-code,
 * image, premise, scene, split-compare, split-panel — which own their layout but
 * no background and still want it. Measured before choosing: six changed, none
 * of them asked for.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const csstree = require('css-tree');

const ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice.css');

/**
 * A background value that paints no NEW surface, so the deck-wide canvas taking
 * it over costs nothing:
 *   `var(--bg)`  — the deck ground itself, which is what `section.dark` paints.
 *                  `image`, `scene`, `print` and `chart-frame` do exactly this.
 *   `none`       — a REMOVAL (`finish-none`, `backdrop-none` clear a texture).
 *                  Treating it as a painter would demand an exemption that, by
 *                  keeping the rule off those frames, would leave them with the
 *                  deck-wide spectrum hairline they are not trying to drop.
 */
const paintsNothingNew = (value) => /^var\(\s*--bg\s*[,)]/.test(value) || value.trim() === 'none';

/** One parse of the built bundle, shared by every assertion below. */
function readBundle() {
  assert.ok(
    fs.existsSync(BUNDLE),
    `${path.relative(ROOT, BUNDLE)} is missing — run \`npm run build\` first`,
  );
  const ast = csstree.parse(fs.readFileSync(BUNDLE, 'utf8'), { positions: true });

  let darkRule = null; // { offset, exempt: Set<string> }
  /** class name -> byte offset of the FIRST rule that paints it */
  const painters = new Map();

  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      const offset = node.loc.start.offset;

      if (darkRule === null) {
        const sel = csstree.generate(node.prelude);
        const m = sel.match(/^section\.dark:not\(:where\((.*)\)\)$/);
        if (m) {
          darkRule = {
            offset,
            exempt: new Set(m[1].split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean)),
          };
        }
      }

      if (node.prelude.type !== 'SelectorList') return;

      // The rule's OWN declarations only. A `csstree.walk` would descend into a
      // nested rule's block, so `section.foo { & .chip { background: red } }`
      // would read as the SECTION painting a canvas. Nothing in the tree nests
      // today; the shallow read is what keeps that true when something does.
      const painted = [];
      for (const d of node.block.children) {
        if (d.type !== 'Declaration') continue;
        if (!/^background(-color|-image)?$/.test(d.property)) continue;
        const value = csstree.generate(d.value).trim();
        if (!paintsNothingNew(value)) painted.push(value);
      }
      if (!painted.length) return;

      // EACH selector in a comma list is judged on its own. The earlier regex
      // read only the last one, so `section.newcover, section.decision-cover`
      // certified a brand-new painter because the name it happened to see was
      // already exempt.
      for (const selector of node.prelude.children) {
        // `section.<class>`, plus any number of trailing `:where(…)`, and
        // nothing else — the frame's own base canvas at exactly (0,1,1).
        // `:where()` contributes ZERO specificity, so `section.foo:where(.a,.b)`
        // is still (0,1,1) and still loses to the dark canvas declared later;
        // requiring a bare two-part compound let that shape through. A further
        // class, a combinator or any other pseudo-class makes it a different
        // (higher) specificity that this rule does not govern.
        const parts = [...selector.children];
        if (parts.length < 2) continue;
        if (parts[0].type !== 'TypeSelector' || parts[0].name !== 'section') continue;
        if (parts[1].type !== 'ClassSelector') continue;
        if (!parts.slice(2).every((p) => p.type === 'PseudoClassSelector' && p.name === 'where')) continue;
        if (!painters.has(parts[1].name)) painters.set(parts[1].name, offset);
      }
    },
  });

  assert.ok(darkRule, 'could not find the `section.dark:not(:where(...))` canvas rule in the bundle');
  return { darkRule, painters };
}

test('every frame that paints its own canvas BEFORE the dark rule is exempted from it', () => {
  const { darkRule, painters } = readBundle();
  const missing = [...painters]
    .filter(([name, offset]) => offset < darkRule.offset && !darkRule.exempt.has(name))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(
    missing, [],
    'these paint a section-level canvas and are declared BEFORE the dark-canvas rule, '
    + 'but are NOT exempted in base.modifiers.css — so `color-mode: dark` repaints over '
    + `them: ${missing.join(', ')}`,
  );
});

test('the exemption list carries no class that stopped painting', () => {
  // A stale entry is not merely untidy: the list is the only statement anywhere
  // of WHICH frames own their canvas, and a reader who cannot trust it has to
  // re-derive it. The previous revision checked staleness by looking for
  // `lib/components/<bucket>/<name>/<name>.styles.css`, which no cover has — all
  // five are declared inside their PARENT component's sheet — so five of the nine
  // entries, the majority, sat outside the check that was advertised as covering
  // both directions. Reading the bundle, every entry is visible.
  const { darkRule, painters } = readBundle();
  const stale = [...darkRule.exempt].filter((name) => !painters.has(name)).sort();
  assert.deepEqual(stale, [], `stale exemption(s) — these no longer paint a canvas: ${stale.join(', ')}`);
});

test('a painter declared AFTER the dark rule is correct to omit, and `lat-split-cover` is the one', () => {
  // Pinned by name because it is the entry a reader will read as an omission.
  // It is not: at equal specificity the later declaration wins, so it keeps its
  // accent with no exemption — measured, `rgb(130,200,229)` under dark on both
  // `main` and this branch. If it ever moves ahead of the dark rule the test
  // above turns red, which is the failure that matters; this one documents why
  // it is absent while it stays behind.
  const { darkRule, painters } = readBundle();
  const after = [...painters]
    .filter(([name, offset]) => offset > darkRule.offset && !darkRule.exempt.has(name))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(after, ['lat-split-cover']);
});
