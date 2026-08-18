/**
 * Unit: the rough-ink GEOMETRY kernel (lib/core/rough-ink.js).
 *
 * This is the half that turns a measured plan into rough.js path data, and it
 * is pure — no DOM, no fs — so it is testable exactly. The DOM half has its own
 * file (rough-ink-dom.test.js).
 *
 * WHAT THIS FILE IS ACTUALLY GUARDING, in rough order of how much it would hurt
 * to lose:
 *
 *   1. DETERMINISM. Every render path that diffs pixels — the committed PDFs,
 *      tools/pixel-check.js, the screenshot tier — assumes two renders of one
 *      deck are byte-identical. rough.js is a randomized renderer; the ONLY
 *      thing standing between it and a permanently-dirty diff is that every
 *      call here passes an explicit `seed`. A future edit that drops one (or
 *      reaches for `rough.newSeed()`) would not fail any build, would not look
 *      wrong on screen, and would make every sketch deck's baseline unstable.
 *   2. THE LINE COUNT PER KIND. `frame + hLines + vLines` is the whole contract
 *      between the registry and the measurer; getting it wrong is how the old
 *      CSS ended up drawing the ledger's last rule twice.
 *   3. COLUMNS STAYING OFF BY DEFAULT. Drawing them unasked turned a
 *      comparison table into a spreadsheet, and it breaks the finish's own
 *      governing rule (roughen what the deck draws; never invent a line).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROUGH_INK,
  ROUGH_INK_STRUCTURES,
  ROUGH_INK_FRAMED,
  inkSeed,
  pathsForPlan,
  shiftPath,
} = require('../../../lib/core/rough-ink');

const plan = (over = {}) => ({
  key: 'table:0:0',
  kind: 'grid',
  x: 0,
  y: 0,
  w: 800,
  h: 400,
  hLines: [],
  vLines: [],
  stroke: 'rgb(20, 20, 20)',
  strokeWidth: 2,
  ...over,
});

describe('rough-ink — determinism', () => {
  test('the same plan renders the same paths, twice', () => {
    const p = plan({ hLines: [100, 200], vLines: [400] });
    assert.deepEqual(pathsForPlan(p), pathsForPlan(p));
  });

  test('determinism survives a fresh module registry (no cached generator state)', () => {
    const p = plan({ hLines: [100] });
    const first = pathsForPlan(p);
    delete require.cache[require.resolve('../../../lib/core/rough-ink')];
    const reloaded = require('../../../lib/core/rough-ink');
    assert.deepEqual(reloaded.pathsForPlan(p), first);
  });

  test('two lines in one structure get DIFFERENT hands', () => {
    // The point of seeding per line rather than per structure: a table whose
    // rules were all the same stroke would read as a repeated stamp, which is
    // the exact failure of the tiled wave this module replaced.
    const [a, b] = pathsForPlan(plan({ hLines: [100, 200] }));
    assert.notEqual(a.d, b.d);
  });

  test('two structures with the same shape but different keys differ', () => {
    const a = pathsForPlan(plan({ key: 'table:0:0', hLines: [100] }));
    const b = pathsForPlan(plan({ key: 'table:1:0', hLines: [100] }));
    assert.notEqual(a[0].d, b[0].d);
  });
});

describe('rough-ink — line inventory per kind', () => {
  test('grid draws a frame plus one path per boundary', () => {
    const paths = pathsForPlan(plan({ hLines: [100, 200, 300], vLines: [400] }));
    assert.equal(paths.length, 1 + 3 + 1);
  });

  test('ledger is framed; rows is not', () => {
    assert.ok(ROUGH_INK_FRAMED.has('ledger'));
    assert.ok(!ROUGH_INK_FRAMED.has('rows'));
    assert.equal(pathsForPlan(plan({ kind: 'ledger', hLines: [50] })).length, 2);
    assert.equal(pathsForPlan(plan({ kind: 'rows', hLines: [50] })).length, 1);
  });

  test('mid and underline are one unframed stroke', () => {
    for (const kind of ['mid', 'underline']) {
      assert.ok(!ROUGH_INK_FRAMED.has(kind), `${kind} must not be framed`);
      assert.equal(pathsForPlan(plan({ kind, hLines: [3.5] })).length, 1);
    }
  });

  test('a framed structure with no interior boundaries is just the frame', () => {
    assert.equal(pathsForPlan(plan({ hLines: [], vLines: [] })).length, 1);
  });
});

describe('rough-ink — stroke weight', () => {
  test('the frame is drawn heavier than the rules it encloses', () => {
    const [frame, rule] = pathsForPlan(plan({ hLines: [100] }));
    assert.equal(frame.strokeWidth, 2 * ROUGH_INK.frameWeight);
    assert.equal(rule.strokeWidth, 2 * ROUGH_INK.ruleWeight);
    assert.ok(frame.strokeWidth > rule.strokeWidth);
  });

  test('the measured stroke color is copied through untouched', () => {
    // The kernel must never resolve or reinterpret a color: base.sketch.css
    // owns that through --rough-ink-stroke, which is what keeps the finish
    // palette-blind (HARD RULE #3) all the way into the SVG.
    const stroke = 'color-mix(in srgb, rgb(9, 9, 9) 55%, transparent)';
    for (const p of pathsForPlan(plan({ stroke, hLines: [100] }))) {
      assert.equal(p.stroke, stroke);
    }
  });
});

describe('rough-ink — column rules are opt-in at the source', () => {
  test('no shipped structure asks for columns', () => {
    // The measurer gates vLines on `--rough-ink-cols: 1`, and nothing in
    // base.sketch.css sets it. If a component ever does, this test should be
    // updated deliberately — with a look at the render — not quietly deleted.
    const withCols = ROUGH_INK_STRUCTURES.filter((s) => s.cols);
    assert.deepEqual(withCols, []);
  });

  test('but the kernel still draws them when a plan carries them', () => {
    assert.equal(pathsForPlan(plan({ vLines: [200, 400] })).length, 3);
  });
});

describe('rough-ink — the structure registry', () => {
  test('every entry names a known kind and a non-empty selector', () => {
    const KINDS = new Set(['grid', 'ledger', 'rows', 'mid', 'underline']);
    for (const s of ROUGH_INK_STRUCTURES) {
      assert.ok(KINDS.has(s.kind), `${s.id}: unknown kind ${s.kind}`);
      assert.ok(s.sel.trim().length > 0, `${s.id}: empty selector`);
    }
  });

  test('ids are unique — they seed the hand, so a collision is a shared stroke', () => {
    const ids = ROUGH_INK_STRUCTURES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('every selector is scoped to the sketch finish', () => {
    // A selector that escaped `section.sketch` would ink structures on decks
    // that never asked for the finish — and would do it only in the browser,
    // where nothing in the CSS gates could see it.
    for (const s of ROUGH_INK_STRUCTURES) {
      for (const arm of s.sel.split(',')) {
        assert.match(arm.trim(), /^section\.sketch\b/, `${s.id}: unscoped arm "${arm.trim()}"`);
      }
    }
  });

  test('the divider entry excludes the masthead rule, which has its own entry', () => {
    // Both are `<hr>` under `section.sketch`. Without the :not() they would
    // both match, and the masthead rule would be inked twice — once down its
    // centerline (wrong: its box is padded) and once along its bottom edge.
    const divider = ROUGH_INK_STRUCTURES.find((s) => s.id === 'divider');
    assert.match(divider.sel, /:not\(\.masthead-rule\)/);
    assert.ok(ROUGH_INK_STRUCTURES.some((s) => s.id === 'masthead-rule'));
  });
});

describe('rough-ink — inkSeed', () => {
  test('is stable, non-negative, and separates adjacent keys', () => {
    assert.equal(inkSeed('table:0:0:h3'), inkSeed('table:0:0:h3'));
    assert.ok(inkSeed('table:0:0:h3') >= 0);
    // Adjacent, near-identical keys are the realistic input, and a weak mixer
    // collides on exactly these.
    const seeds = new Set();
    for (let i = 0; i < 64; i++) seeds.add(inkSeed(`table:0:0:h${i}`));
    assert.equal(seeds.size, 64);
  });
});

describe('rough-ink — shiftPath', () => {
  test('translates every coordinate pair and leaves commands alone', () => {
    assert.equal(shiftPath('M0 0 C1 2, 3 4, 5 6', 10, 100), 'M10 100 C11 102, 13 104, 15 106');
  });

  test('is a no-op at the origin, without rewriting the string', () => {
    const d = 'M0.5 1.5 C2 3, 4 5, 6 7';
    assert.equal(shiftPath(d, 0, 0), d);
  });

  test('handles negative and exponent-notation coordinates', () => {
    assert.equal(shiftPath('M-1.5 -2 C1e-3 0, 0 0, 0 0', 1.5, 2), 'M0 0 C1.501 2, 1.5 2, 1.5 2');
  });

  test('throws on a command it cannot translate rather than corrupting the path', () => {
    // rough.js emits only M and C. If that ever changes, a silent
    // mis-translation would put every line a few pixels off its box, on every
    // sketch deck, with nothing to point at.
    assert.throws(() => shiftPath('M0 0 L10 10', 5, 5), /unexpected path command "L"/);
  });

  test('round-trips through pathsForPlan — an offset plan is the shifted plan', () => {
    const at00 = pathsForPlan(plan({ hLines: [100] }));
    const at5030 = pathsForPlan(plan({ x: 50, y: 30, hLines: [100] }));
    assert.deepEqual(
      at5030.map((p) => p.d),
      at00.map((p) => shiftPath(p.d, 50, 30)),
    );
  });
});
