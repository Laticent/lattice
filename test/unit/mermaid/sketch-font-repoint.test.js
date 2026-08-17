/**
 * The sketch re-point the EXPORT's reader has to know about (#1674).
 *
 * `mode: sketch` reaches diagram labels through one indirection: `base.sketch.css`
 * re-points `--font-body` to `--sketch-font-body` inside a CLASS scope, and
 * `MERMAID_VAR_MAP.fontFamily` reads `--font-body`. The preview gets that for free —
 * its reader is `getComputedStyle(section)`, so the cascade has already applied the
 * re-point. The export resolves tokens OFFLINE against palette text, where there is no
 * element and no class, so it applies the re-point itself in `readScopeToken`.
 *
 * That makes a LOOKUP TABLE in the emulator a restatement of a CSS rule, which is
 * exactly the shape that rots: rename the token in the stylesheet, and the export
 * silently reverts diagram labels to the machine face while every other test passes.
 * This file reads the real CSS and fails on that.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const SKETCH_CSS = fs.readFileSync(path.join(REPO, 'lib', 'base', 'base.sketch.css'), 'utf8');
const TOKENS_CSS = fs.readFileSync(path.join(REPO, 'lib', 'base', 'base.tokens.css'), 'utf8');
const EMULATOR_SRC = fs.readFileSync(path.join(REPO, 'lattice-emulator.js'), 'utf8');
const { MERMAID_VAR_MAP } = require('../../../lib/core/mermaid-theme-map');

/** The `SKETCH_TOKEN_REPOINTS` table, read out of the emulator source. */
function repointTable() {
  const m = /const SKETCH_TOKEN_REPOINTS = Object\.freeze\(\{([^}]*)\}\);/.exec(EMULATOR_SRC);
  assert.ok(m, 'SKETCH_TOKEN_REPOINTS not found in lattice-emulator.js');
  const out = {};
  for (const pair of m[1].split(',')) {
    const kv = /'([^']+)'\s*:\s*'([^']+)'/.exec(pair);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

describe('sketch font re-point — the CSS rule and the export reader agree', () => {
  test('every re-point the table claims is really declared in base.sketch.css', () => {
    for (const [base, sketch] of Object.entries(repointTable())) {
      const rule = new RegExp(`--${base}\\s*:\\s*var\\(\\s*--${sketch}\\s*\\)`);
      assert.match(SKETCH_CSS, rule,
        `lattice-emulator.js re-points --${base} to --${sketch} for sketch diagrams, but `
        + `base.sketch.css no longer declares that. Rename one and diagram labels silently `
        + 'revert to the clean face while the rest of the slide stays hand-drawn.');
    }
  });

  test('the re-pointed target token actually exists', () => {
    for (const sketch of Object.values(repointTable())) {
      assert.match(TOKENS_CSS, new RegExp(`--${sketch}\\s*:`),
        `--${sketch} is not declared in base.tokens.css`);
    }
  });

  test('--font-body is covered, because that is the token the diagram map reads', () => {
    // The table only needs entries for tokens Mermaid actually receives. `font-body` is
    // the one — assert the LINK rather than the literal, so a map that moved to a
    // different token fails here instead of quietly losing the sketch voice.
    assert.deepEqual(MERMAID_VAR_MAP.fontFamily, { var: 'font-body' });
    assert.equal(repointTable()['font-body'], 'sketch-font-body');
  });

  test('the sketch face is a real self-hosted family, not a system guess', () => {
    // The whole fix depends on the worker being able to LOAD the face it measures in.
    // A stack whose first family is not in the font manifest would measure in a fallback
    // again — the #1674 bug, reintroduced through the token instead of the transport.
    const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
    const decl = /--sketch-font-body:\s*([^;]+);/.exec(TOKENS_CSS);
    assert.ok(decl, '--sketch-font-body must be declared');
    const first = decl[1].trim().split(',')[0].replace(/['"]/g, '').trim();
    assert.ok(TEXT_FACES.some((f) => f.family === first),
      `--sketch-font-body leads with "${first}", which lib/fonts/text-faces.js does not ship — `
      + 'the render worker can only embed faces from that manifest, so labels would be '
      + 'measured in a fallback and clip.');
  });
});
