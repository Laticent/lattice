const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  FAMILIES,
  FAMILY_NAMES,
  BOUNDARIES,
  familySelector,
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

// The selector prefix must stay at ZERO specificity, or scoping an existing rule
// to a family would silently change which rule wins the cascade — the property
// that made the #1218 conversion of 34 blocks safe in the first place.
test('familySelector emits a zero-specificity :where() prefix', () => {
  assert.strictEqual(familySelector('tall'), ':where([data-family="tall"])');
  assert.strictEqual(familySelector('strip'), ':where([data-family="strip"])');
  assert.strictEqual(familySelector('square'), ':where([data-family="square"])');
  // `wide` is the DEFAULT — the engine emits no stamp for it, so it is the
  // absence of the attribute, not a value to match.
  assert.strictEqual(familySelector('wide'), ':where(section:not([data-family]))');
  assert.throws(() => familySelector('nope'), /unknown family/);
  for (const name of FAMILY_NAMES) {
    assert.ok(familySelector(name).startsWith(':where('), `${name} prefix must be :where()-wrapped`);
  }
});

test('orientation → families derivation covers all four', () => {
  const derived = [...ORIENTATION_TO_FAMILIES.landscape, ...ORIENTATION_TO_FAMILIES.portrait];
  assert.deepStrictEqual(derived.slice().sort(), FAMILY_NAMES.slice().sort());
});

// ── Walk every stylesheet under lib/, not just components: the shared chart-frame
// rules live in `_chart-family/chart-family.css` and base rules in `lib/base`, and
// a violation in either would slip past a components-only walk exactly as one in
// chart-family once did (gap caught in maker-checker review, 2026-06-19).
function libCss() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push(p);
    }
  };
  walk(path.join(ROOT, 'lib'));
  return out;
}

// ── Drift guard: every family named in engine CSS must be one of the four the
// engine can actually stamp. A typo (`[data-family="portrait"]`) is a rule that
// matches nothing and fails silently — the exact failure mode of #1218.
test('component family selectors name only canonical families', () => {
  const familyRe = /\[data-family\s*=\s*["']([^"']*)["']\]/g;
  const known = new Set(FAMILY_NAMES);
  let checked = 0;

  for (const file of libCss()) {
    const css = fs.readFileSync(file, 'utf8');
    let m;
    familyRe.lastIndex = 0;
    while ((m = familyRe.exec(css))) {
      checked++;
      assert.ok(
        known.has(m[1]),
        `${path.relative(ROOT, file)}: [data-family="${m[1]}"] is not a canonical family (${FAMILY_NAMES.join(', ')}).`,
      );
      // `wide` carries no stamp, so matching it by value can never fire.
      assert.notStrictEqual(
        m[1], 'wide',
        `${path.relative(ROOT, file)}: [data-family="wide"] never matches — wide is the UNSTAMPED default. Use ${familySelector('wide')}.`,
      );
    }
  }
  assert.ok(checked > 0, 'expected at least one [data-family] reflow selector across the component CSS');
});

// ── The leading-prefix trap. `data-family` is stamped ON the section, and
// sections are direct children of <body>, so a LEADING family filter followed by
// a `section` compound is a descendant combinator hunting an ancestor that cannot
// exist: valid CSS, lint-clean, matches nothing. That is the #1218 failure shape
// (a reflow rule that silently never fires), relocated from one global boundary to
// ~30 per-file selectors — so it needs a gate, not review. The leading form IS
// legitimate when the subject is a real descendant (`… figure.kanban .board`),
// which is why this rejects the `section`-compound case specifically rather than
// banning the shape.
// The three carriers a family filter can be written in — `:where(…)`, `:is(…)`,
// and the bare attribute — are equally broken in the leading position, so the
// gate matches on the FILTER, not on one wrapper. (An earlier cut keyed on
// `:where(` alone; the checker pointed out `:is([data-family="tall"]) section.foo`
// and `[data-family="tall"] section.foo` slipped straight through it.)
const LEADING_FAMILY_RE = /(?::where|:is)?\(?\s*\[data-family\s*=[^)\]]*\]\s*\)?(\s+)(section\b[^\s,{>+~]*)/g;

// Files that TEACH the idiom are gated too. `lib/adaptive/families.js` shipped
// the broken form in its own header doc — the one module the README calls "the
// single source of truth" — and a CSS-only walk cannot see a JS comment. A canon
// that teaches the trap is worse than one stylesheet that falls into it.
function familyDocFiles() {
  return [
    'lib/adaptive/families.js',
    'lib/adaptive/README.md',
    'lib/layout/ai.js',
    'lib/layout/gate.js',
    'design/skills/component.md',
    'engineering/decisions/2026-07-27-family-stamp-replaces-container-queries.md',
  ].map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
}

test('no family selector uses the leading form against a section compound', () => {
  const offenders = [];
  for (const file of libCss()) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(LEADING_FAMILY_RE)) {
      offenders.push(`${path.relative(ROOT, file)}: … ${m[2]}`);
    }
  }
  assert.deepStrictEqual(
    offenders, [],
    'a leading family filter cannot reach a `section` — the stamp is ON the section. '
    + 'Attach it to the compound instead: `section.foo:where([data-family="tall"]) > …`.',
  );
});

test('no doc or canon file teaches the leading form', () => {
  const offenders = [];
  for (const file of familyDocFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      // The docs QUOTE the broken form to warn about it. A warning line names the
      // trap; an EXAMPLE line does not — so skip lines that carry the warning
      // vocabulary and flag the rest.
      if (/descendant combinator|matches nothing|does not exist|never matches|trap|broken|WRONG|✗/i.test(line)) return;
      LEADING_FAMILY_RE.lastIndex = 0;
      if (LEADING_FAMILY_RE.test(line)) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepStrictEqual(
    offenders, [],
    'a doc/canon file presents the leading family filter as the pattern to copy. '
    + 'Show `section.foo:where([data-family="tall"]) > …`, or mark the line as the trap it is.',
  );
});

// ── The retired mechanism must stay retired (#1218). A container query evaluates
// the container's CONTENT box; the section's asymmetric padding makes that
// proportionally wider than the deck, so a 1080×1080 deck — `square` to
// `familyFor()` — measured 1.051 and missed every `<= 1.05` rule in the library.
// Reintroducing one anywhere in engine CSS reopens the whole class of bug, and it
// fails silently, which is why it needs a gate rather than review.
test('no engine CSS reintroduces an @container aspect-ratio query', () => {
  const containerRe = /@container\b[^{}]*\{/g;
  const offenders = [];
  for (const file of libCss()) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const block of css.match(containerRe) || []) {
      if (/aspect-ratio/.test(block)) offenders.push(`${path.relative(ROOT, file)}: ${block.trim()}`);
    }
  }
  assert.deepStrictEqual(
    offenders, [],
    'aspect-ratio container queries are retired — select the `data-family` stamp instead (lib/adaptive/families.js).',
  );
});
