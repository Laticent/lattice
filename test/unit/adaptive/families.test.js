const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  FAMILIES,
  FAMILY_NAMES,
  BOUNDARIES,
  CSS_BOUNDARIES,
  familyQuery,
  familyFor,
  ORIENTATION_TO_FAMILIES,
} = require('../../../lib/adaptive/families.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('four families, widest-aspect first, contiguous and gapless', () => {
  assert.deepStrictEqual(FAMILY_NAMES, ['wide', 'square', 'tall', 'strip']);
  // Each family's min is the previous family's max — no gaps, no overlaps.
  for (let i = 1; i < FAMILIES.length; i++) {
    assert.strictEqual(FAMILIES[i].max, FAMILIES[i - 1].min, `${FAMILIES[i].name} max meets ${FAMILIES[i - 1].name} min`);
  }
  assert.strictEqual(FAMILIES[0].max, Infinity, 'wide is unbounded above');
  assert.strictEqual(FAMILIES.at(-1).min, 0, 'strip reaches 0');
});

test('BOUNDARIES is exactly the set of interior thresholds', () => {
  const interior = [...new Set(FAMILIES.flatMap((f) => [f.min, f.max]).filter((n) => n > 0 && Number.isFinite(n)))].sort((a, b) => a - b);
  assert.deepStrictEqual(BOUNDARIES.slice().sort((a, b) => a - b), interior);
});

test('familyFor classifies canonical sizes correctly', () => {
  assert.strictEqual(familyFor(16 / 9), 'wide');      // HD landscape
  assert.strictEqual(familyFor(960 / 720), 'wide');   // 4:3 standard
  assert.strictEqual(familyFor(1), 'square');         // 1:1
  assert.strictEqual(familyFor(1080 / 1350), 'tall'); // 4:5 portrait (0.8)
  assert.strictEqual(familyFor(1080 / 1920), 'tall'); // 9:16 story (0.5625)
  assert.strictEqual(familyFor(1080 / 2340), 'strip');// 9:19.5 mobile (0.46)
});

// familyQuery emits the CSS boundaries, NOT the deck ones: a container query
// measures the container's CONTENT box, which is proportionally wider than the
// deck box `familyFor()` classifies (#1218).
test('familyQuery emits a valid @container prelude with only canonical CSS boundaries', () => {
  assert.strictEqual(familyQuery('tall'), '@container lattice (aspect-ratio > 0.5) and (aspect-ratio <= 0.93)');
  assert.strictEqual(familyQuery('wide'), '@container lattice (aspect-ratio > 1.25)');
  assert.strictEqual(familyQuery('strip'), '@container lattice (aspect-ratio <= 0.5)');
});

// The two lists are the same bands measured two ways, so they must stay
// positionally paired and ordered — a CSS boundary below its deck counterpart
// would mean the content box reads NARROWER than the deck, which the geometry
// cannot produce (the section's vertical padding always exceeds its horizontal).
test('CSS boundaries pair positionally with the deck boundaries, never lower', () => {
  assert.strictEqual(CSS_BOUNDARIES.length, BOUNDARIES.length);
  for (let i = 0; i < BOUNDARIES.length; i++) {
    assert.ok(CSS_BOUNDARIES[i] >= BOUNDARIES[i],
      `CSS boundary ${CSS_BOUNDARIES[i]} is below its deck counterpart ${BOUNDARIES[i]}`);
  }
  // Strictly ascending, so the bands stay contiguous and gapless in CSS too.
  for (let i = 1; i < CSS_BOUNDARIES.length; i++) {
    assert.ok(CSS_BOUNDARIES[i] > CSS_BOUNDARIES[i - 1], 'CSS boundaries must ascend');
  }
});

test('orientation → families derivation covers all four', () => {
  const derived = [...ORIENTATION_TO_FAMILIES.landscape, ...ORIENTATION_TO_FAMILIES.portrait];
  assert.deepStrictEqual(derived.slice().sort(), FAMILY_NAMES.slice().sort());
});

// ── Drift guard: every aspect-ratio used in a component's @container query must
// be a canonical boundary. @container can't read var(), so the numbers live as
// literals in CSS — this keeps them from silently diverging from families.js.
test('component @container aspect queries use only canonical boundaries', () => {
  const cssFiles = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      // Any component CSS (not only `*.styles.css`): the shared chart-frame rules
      // live in `_chart-family/chart-family.css`, which carries `@container`
      // queries too — the guard must walk it or a non-canonical boundary there
      // would slip past (gap caught in maker-checker review, 2026-06-19).
      else if (e.name.endsWith('.css')) cssFiles.push(p);
    }
  };
  // ALL of lib/, not just components: `lib/base` carries the `--lat-family`
  // stamp's own queries (#1218), and a non-canonical boundary there would have
  // slipped past a components-only walk exactly as one in chart-family once did.
  walk(path.join(ROOT, 'lib'));

  // CSS literals must be the CSS boundaries — the deck numbers are JS-side only.
  const allowed = new Set(CSS_BOUNDARIES.map(String));
  // Any `@container …{` prelude (any/no name), captured up to its opening brace.
  const containerRe = /@container\b[^{}]*\{/g;
  // Every aspect-ratio boundary in a prelude, BOTH operand orders and the colon
  // (`aspect-ratio: N`, `min-/max-aspect-ratio: N`) + range (`N < aspect-ratio`) forms.
  const numRe = /(?:(?:min-|max-)?aspect-ratio\s*[<>:]=?\s*([0-9]*\.?[0-9]+))|(?:([0-9]*\.?[0-9]+)\s*[<>]=?\s*aspect-ratio)/g;
  let checked = 0;

  for (const file of cssFiles) {
    const css = fs.readFileSync(file, 'utf8');
    for (const block of css.match(containerRe) || []) {
      if (!/aspect-ratio/.test(block)) continue;
      let m;
      numRe.lastIndex = 0;
      while ((m = numRe.exec(block))) {
        const n = m[1] ?? m[2];
        checked++;
        assert.ok(
          allowed.has(n),
          `${path.relative(ROOT, file)}: @container aspect-ratio boundary ${n} is not canonical (allowed: ${[...allowed].join(', ')}). Add it to lib/adaptive/families.js or fix the CSS.`,
        );
      }
    }
  }
  assert.ok(checked > 0, 'expected at least one @container aspect query across the component CSS');
});
