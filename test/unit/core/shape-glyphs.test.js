/**
 * Unit: lib/core/shape-glyphs.js — the curated shape-glyph table behind
 * HARD RULE #29, shared by the ownership gate and the authoring linter.
 *
 * Covers:
 *   1. The table's own coherence — no duplicate rows, every row answerable,
 *      and no character on BOTH the deny list and the deliberate-exclusion
 *      list (the two lists disagreeing is the failure nobody would notice).
 *   2. Every `token:` a row names is a token base.tokens.css actually ships,
 *      and every `--shape-*` it ships is named by some row. That pin runs BOTH
 *      ways on purpose: an advice string pointing at a token that does not
 *      exist is a lie the linter tells an author, and an icon nothing names is
 *      dead weight in every bundle.
 *   3. shapeGlyphRe() hands back a FRESH regex each call — the /g lastIndex
 *      trap, which shows up as an off-by-half count rather than a crash.
 *   4. stripFencedCode blanks fenced blocks and leaves inline code alone.
 *   5. The two engine JS modules that write a glyph straight into rendered
 *      markup are pinned by CONTENT — each surviving line recorded verbatim,
 *      so the test both names what is still typed and fails on a new one.
 *      Engine JS is deliberately not gated; the gate's own docblock says why
 *      a heuristic there is worse than nothing.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SHAPE_GLYPHS,
  NOT_SHAPES,
  shapeGlyphRe,
  stripFencedCode,
  isQuadrantAxisEyebrow,
  findShapeGlyphs,
  shapeGlyphAdvice,
} = require('../../../lib/core/shape-glyphs.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const TOKENS_CSS = fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.tokens.css'), 'utf8');

describe('shape-glyphs — table coherence', () => {
  test('every row is unique', () => {
    const seen = new Set();
    for (const e of SHAPE_GLYPHS) {
      assert.ok(!seen.has(e.glyph), `duplicate row for ${e.glyph} (U+${e.glyph.codePointAt(0).toString(16)})`);
      seen.add(e.glyph);
    }
  });

  test('every row names the shape and answers it', () => {
    for (const e of SHAPE_GLYPHS) {
      assert.ok(e.name && /^[A-Z0-9 -]+$/.test(e.name), `${e.glyph}: name should be the Unicode name`);
      assert.ok(e.role, `${e.glyph}: no role`);
      assert.ok(e.authorFix && e.authorFix.length > 20, `${e.glyph}: authorFix must be a real instruction`);
    }
  });

  test('a character is never both a shape and a deliberate exclusion', () => {
    const shapes = new Set(SHAPE_GLYPHS.map((e) => e.glyph));
    for (const e of NOT_SHAPES) {
      assert.ok(!shapes.has(e.glyph), `${e.glyph} is on BOTH lists — the gate would flag what NOT_SHAPES says is fine`);
      assert.ok(e.why, `${e.glyph}: an exclusion without a reason is not a decision`);
    }
  });

  test('punctuation and math are not matched', () => {
    // The characters an author legitimately types in running text. A gate that
    // flags an em dash or a multiplication sign is one nobody keeps on.
    const prose = '“Quarter over quarter” — 2×2 · ±0.4 · ≥90° · the ‘why’ … ›';
    assert.deepEqual(findShapeGlyphs(prose), []);
  });
});

describe('shape-glyphs — tokens are real, both ways', () => {
  // Only the tokens that carry an actual mask URL. `--shape-paint` is the shared
  // position/size TAIL every consumer appends, not a shape, so it is not one of
  // these and must not be demanded of the table.
  const shipped = new Set(
    [...TOKENS_CSS.matchAll(/^\s*(--(?:shape|mark)-[a-z0-9-]+)\s*:\s*url\(/gm)].map((m) => m[1]),
  );

  test('base.tokens.css ships every token the table names', () => {
    for (const e of SHAPE_GLYPHS) {
      if (!e.token) continue;
      assert.ok(
        shipped.has(e.token),
        `${e.glyph} names ${e.token}, which base.tokens.css does not define — the advice would send a ` +
        'reader to a var() that resolves to nothing',
      );
    }
  });

  test('every shipped --shape-* is named by some row', () => {
    const named = new Set(SHAPE_GLYPHS.map((e) => e.token).filter(Boolean));
    for (const tok of shipped) {
      if (!tok.startsWith('--shape-')) continue; // --mark-* has its own consumers (the state discs)
      assert.ok(named.has(tok), `${tok} is shipped but no shape names it — a mask nothing draws is dead weight`);
    }
  });

  test('no shape token bakes a paint color', () => {
    // A mask reads alpha; a hex inside the data URI would be either dead or,
    // worse, a palette-blind layout's one hard-coded color (HARD RULE #3).
    for (const [, value] of TOKENS_CSS.matchAll(/^\s*(--shape-[a-z0-9-]+)\s*:\s*(url\([^;]*)/gm)) {
      assert.ok(!value.includes('#'), `${value.slice(0, 40)}… embeds a color literal`);
    }
  });
});

describe('shape-glyphs — the regex is fresh every call', () => {
  test('shapeGlyphRe() is a new object each time', () => {
    assert.notStrictEqual(shapeGlyphRe(), shapeGlyphRe());
  });

  test('repeated .test() on one instance does NOT alternate for callers', () => {
    // The trap this exists to avoid: a shared /g regex carries lastIndex, so
    // the SECOND .test() of the same string returns false. Fresh instances
    // make every call independent.
    assert.equal(shapeGlyphRe().test('✓'), true);
    assert.equal(shapeGlyphRe().test('✓'), true);
    assert.equal(shapeGlyphRe().test('✓'), true);
    // …and the hoisted-constant version really would fail, which is why the
    // module docblock says not to hoist it.
    const shared = shapeGlyphRe();
    assert.equal(shared.test('✓'), true);
    assert.equal(shared.test('✓'), false);
  });

  test('counts every occurrence, not every other one', () => {
    assert.equal(('✓ ✓ ✓ ✓'.match(shapeGlyphRe()) || []).length, 4);
  });
});

describe('shape-glyphs — findShapeGlyphs positions', () => {
  test('reports line and column, 1-based', () => {
    const hits = findShapeGlyphs('ok\nrow ✓ here\n\nand → there');
    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map((h) => [h.glyph, h.line, h.column]), [['✓', 2, 5], ['→', 4, 5]]);
  });

  test('carries the table row for each hit', () => {
    const [hit] = findShapeGlyphs('✗');
    assert.equal(hit.entry.role, 'status');
    assert.equal(hit.entry.token, '--mark-x');
  });
});

describe('shape-glyphs — stripFencedCode', () => {
  test('blanks a fenced block but keeps the line count', () => {
    const src = 'before ✓\n```text\n⚠ tool output →\n```\nafter →';
    const out = stripFencedCode(src);
    assert.equal(out.split('\n').length, src.split('\n').length);
    assert.deepEqual(findShapeGlyphs(out).map((h) => [h.glyph, h.line]), [['✓', 1], ['→', 5]]);
  });

  test('leaves INLINE code in scope', () => {
    // A backticked eyebrow is set on the slide; a quadrant's arrow is a
    // parse-time delimiter with an ASCII spelling already accepted. Both
    // should still be seen.
    assert.equal(findShapeGlyphs(stripFencedCode('`Effort 0–10 → Reach 0–100`')).length, 1);
  });

  test('a tilde fence closes only on tildes', () => {
    const out = stripFencedCode('~~~\n✓\n```\n✓\n~~~\n✓');
    assert.deepEqual(findShapeGlyphs(out).map((h) => h.line), [6]);
  });
});

describe('shape-glyphs — the quadrant eyebrow, one predicate for two consumers', () => {
  // The exclusion was implemented TWICE — a hand-rolled scanner in the ownership
  // gate, a role check in the linter — and they disagreed in both directions.
  // These pin the shared predicate; test/unit/components/lint-core.test.js and
  // test/unit/cli/check-ownership.test.js pin that each consumer asks it.
  test('an arrow eyebrow on a quadrant slide is excluded', () => {
    assert.equal(isQuadrantAxisEyebrow('`Effort 0–10 → Reach 0–100`', ['quadrant']), true);
  });

  test('a typed CHECK in a quadrant eyebrow is NOT excluded', () => {
    // The gate previously blanked any whole-line code span on a quadrant slide,
    // so a `✓` hid inside one and passed at budget 0.
    assert.equal(isQuadrantAxisEyebrow('`Shipped ✓ · Q3 review`', ['quadrant']), false);
  });

  test('the same eyebrow on a non-quadrant slide is NOT excluded', () => {
    assert.equal(isQuadrantAxisEyebrow('`Effort 0–10 → Reach 0–100`', ['kpi']), false);
  });

  test('prose with an arrow is never an eyebrow', () => {
    assert.equal(isQuadrantAxisEyebrow('- the plan → the outcome', ['quadrant']), false);
  });

  test('no class tokens at all is safe', () => {
    assert.equal(isQuadrantAxisEyebrow('`a → b`', []), false);
    assert.equal(isQuadrantAxisEyebrow('`a → b`', null), false);
  });
});

describe('shape-glyphs — advice', () => {
  test('author advice names the risk AND the fix', () => {
    const advice = shapeGlyphAdvice('✓', 'author');
    assert.match(advice, /U\+2713/);
    assert.match(advice, /typed, not drawn/);
    assert.match(advice, /\[x\]/);
  });

  test('engine advice names the token', () => {
    assert.match(shapeGlyphAdvice('❯', 'engine'), /--shape-chevron-right/);
  });

  test('a glyph with no token gets the honest engine answer', () => {
    assert.match(shapeGlyphAdvice('⌘', 'engine'), /has no icon token/);
  });

  test('an off-list character has no advice', () => {
    assert.equal(shapeGlyphAdvice('a'), null);
    assert.equal(shapeGlyphAdvice('—'), null);
  });
});

describe('shape-glyphs — engine JS render sites stay drawn', () => {
  // Engine JS is deliberately outside the ownership gate: telling a DOM string
  // from a console.warn, a `--help` banner or an AI prompt needs to parse the
  // module, and the heuristic that could not tell them apart cried wolf on a
  // Symbol() sentinel's trailing comment when this gate was first drafted.
  //
  // These two modules are the ones that genuinely wrote a shape into rendered
  // markup, so they are pinned here by CONTENT rather than by count. Each
  // surviving line is recorded verbatim, so the test says what is still typed
  // and fails the moment a new one appears OR a recorded one changes shape —
  // which a count could not distinguish from a fix.
  //
  // Why they survive, and what it would take: both write their glyph into an
  // HTML attribute or a text node rather than a `content:` declaration, so
  // drawing them needs a MARKUP change to a shared chart transform (with the
  // three render paths kept in parity), not a CSS swap. Recorded as named
  // follow-up work in engineering/decisions/2026-08-25-typed-glyphs.md
  // § "What is still typed, and why".
  const PINNED = {
    'lib/components/chart/state-chart/state-chart.transform.js': [
      // A template literal (with `\${` escaped) rather than a plain string: the
      // recorded line contains a placeholder, and a plain string holding one
      // reads as a mistake to every linter that looks.
      `const dest = t.isSelf ? '\u21ba' : \`\u2192 \${t.to}\`;`,
    ],
    // The matrix-grid axis arrows moved here with the rest of that chart's
    // kernel when chart-family.js stopped holding per-chart code (LPM Phase 1);
    // the glyphs are unchanged, only the file that holds them.
    'lib/components/chart/matrix-grid/matrix-grid.transform.js': [
      "const AXIS_ARROW = { col: '\u25b6', row: '\u25bc' };",
      // NOT a violation — this one STRIPS an author's typed arrow before the
      // component appends its own, so the glyphs are on the removal side. It is
      // recorded here because the scan cannot tell the two apart, and leaving it
      // unlisted would mean silencing the file.
      'const AUTHORED_ARROW_RE = /\\s*[\u2192\u2190\u2191\u2193\u25b6\u25c0\u25b2\u25bc\u2794\u27a4]\\s*$/;',
    ],
  };

  // Comments are stripped, not skipped: a glyph in a trailing `// lane column
  // \u2192 plot gap` is prose about the code, and four of those were what made
  // the first draft of this pin unreadable.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  for (const [rel, expected] of Object.entries(PINNED)) {
    test(`${rel} — the typed glyphs are exactly the recorded ones`, () => {
      const found = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => shapeGlyphRe().test(line));
      assert.deepEqual(
        found,
        expected,
        `${rel} no longer matches the recorded typed-glyph sites (HARD RULE #29). ` +
        'If you DREW one, delete its line from PINNED here. If a new one appeared, draw it instead.',
      );
    });
  }
});
