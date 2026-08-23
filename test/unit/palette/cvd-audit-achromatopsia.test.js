/**
 * Unit: tools/cvd-audit.js — the ACHROMATOPSIA arm (#1715 §9).
 *
 * `lib/theme/cvd.js` has been able to simulate a monochromacy since #1715, and
 * `checkHljsSeparation` used it — but the CLI a human runs could not reach it. The
 * defect shape is the one that change logged twice: the measurement primitive exists,
 * a build-time gate already uses it, and the surface a person reads does not.
 *
 * DRIVEN THROUGH THE REAL CLI, not through an imported predicate. `cvd-audit.js` is a
 * script with top-level side effects — it cannot be `require`d — and the thing under
 * test is the report a human reads, so the test spawns it and reads its stdout
 * (HARD RULE #23: name the surface, carry an artifact from it).
 *
 * The tool is a DIAGNOSTIC that exits 0 by default; nothing in CI runs it. So these
 * assertions guard the wiring, the two floors, and — the part that decays silently —
 * that the arm still FINDS the collapses it was added to find.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { CVD_TYPES, SIMULATED_TYPES, ACHROMATOPSIA } = require('../../../lib/theme/cvd.js');

const AUDIT = path.join(__dirname, '../../../tools/cvd-audit.js');

/** Run the CLI. Returns `{ out, code }`; a non-zero exit is data here, not a throw. */
function run(...args) {
  try {
    return { out: execFileSync(process.execPath, [AUDIT, ...args], { encoding: 'utf8' }), code: 0 };
  } catch (e) {
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status };
  }
}

/** The `✓`/`✗`, the collapse count, and the worst INDUCED ΔE for one group + condition. */
function groupRow(out, condition, label) {
  const lines = out.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith(`${condition}  (collapse <`));
  assert.notEqual(start, -1, `no "${condition}" section in:\n${out}`);
  for (let i = start + 1; i < lines.length && /^\s+[✓✗]/.test(lines[i]); i++) {
    if (lines[i].includes(label)) {
      const worst = lines[i].match(/worst ([\d.]+)/);
      return {
        flag: lines[i].trim()[0],
        collapsed: Number(lines[i].match(/(\d+) collapsed/)?.[1] ?? 0),
        // The WORST INDUCED pair's ΔE — distinct from the group minimum the line leads
        // with, which can come from a pair that is not an induced collapse at all.
        worst: worst ? Number(worst[1]) : null,
      };
    }
  }
  assert.fail(`no "${label}" row under ${condition} in:\n${out}`);
}

describe('cvd-audit achromatopsia arm', () => {
  test('the default run covers all four conditions, not the three matrices', () => {
    const { out } = run('indaco');
    for (const t of SIMULATED_TYPES) {
      assert.match(out, new RegExp(`\\b${t}\\b`), `the default run never mentions ${t}`);
    }
    assert.equal(SIMULATED_TYPES.length, 4);
  });

  /**
   * The audit widened; `CVD_TYPES` did not. It is the three Machado matrices, pinned by
   * theme-cvd.test.js, and achromatopsia has no matrix because it is not a matrix
   * problem. Re-asserted from this side so "make the audit see it" can never be
   * satisfied by pushing the monochromacy into the dichromacy list.
   */
  test('widening the AUDIT did not widen CVD_TYPES', () => {
    assert.equal(CVD_TYPES.length, 3);
    assert.ok(!CVD_TYPES.includes(ACHROMATOPSIA));
  });

  test('the collapse floor is per-condition, and the monochromacy floor is lower', () => {
    const { out } = run('indaco');
    const floors = Object.fromEntries(
      [...out.matchAll(/^\s+(\w+)\s+\(collapse < ([\d.]+)\)/gm)].map((m) => [m[1], Number(m[2])]),
    );
    for (const t of CVD_TYPES) assert.equal(floors[t], 0.15, `${t} should keep the dichromacy floor`);
    assert.ok(floors.achromatopsia < 0.15,
      `achromatopsia must not reuse the dichromacy floor (got ${floors.achromatopsia})`);
    assert.equal(floors.achromatopsia, 0.065);
    // The NORMAL-VISION half is one number for every condition — see the next test.
    assert.match(out, /distinct to normal vision: OKLab ΔE >= 0\.15\s+\(all conditions\)/);
  });

  /**
   * THE ASYMMETRY, pinned behaviorally.
   *
   * `induced` is `dn >= NORMAL_DISTINCT && dc < collapseFloor(type)`. Only the SIMULATED
   * half took the per-condition number; the normal-vision half stays at 0.15 for every
   * condition, because it asks "could a sighted reader tell these apart?" — a property of
   * the palette, not of the condition.
   *
   * indaco's twelve categorical fills are the witness. They read ✓ under achromatopsia
   * today with ZERO induced collapses. Twenty-six of their pairs sit at dn in
   * [0.065, 0.15) with dc < 0.065 — pale L≈87 fills a sighted reader already cannot
   * separate by hue — so lowering the normal-vision half to the achromatopsia floor
   * would flip this row to `✗ … 26 collapsed by CVD` and report, as a monochromacy
   * defect, twenty-six pairs the condition did not induce.
   */
  test('BITES: lowering the NORMAL-vision half too would fabricate collapses', () => {
    const row = groupRow(run('indaco').out, 'achromatopsia', 'categorical fills');
    assert.equal(row.flag, '✓',
      'indaco categorical fills should read clean under achromatopsia — pairs indistinct '
      + 'to normal vision are not a CVD bug (tools/contrast-audit.js owns those)');
    assert.equal(row.collapsed, 0);
  });

  /**
   * THE ARM FINDS SOMETHING, and something no other arm can see: concrete's `--pass` and
   * `--fail` render ΔE 0.004 apart under a monochromacy — two grays one step from
   * identical — while the tritanopia arm reads the same group clean.
   *
   * READ THE TWO NUMBERS ON THAT LINE CAREFULLY; a first cut of this note did not, and
   * shipped a wrong measurement into three docs. `ΔE 0.000` is the GROUP MINIMUM over
   * every pair, and on concrete it comes from `pass^warn`, which the tool does NOT flag
   * (dn 0.1138, under the 0.15 normal-vision half). The flagged pair is `pass^fail` at
   * 0.0038. The report prints `worst <n>` beside the count for exactly this reason.
   */
  test('FINDS: concrete pass/fail nearly collapse, and the dichromacies read it clean', () => {
    const { out } = run('concrete');
    const ach = groupRow(out, 'achromatopsia', 'semantic signals');
    assert.equal(ach.flag, '✗');
    assert.equal(ach.collapsed, 1);
    // The FLAGGED pair's own reading, not the group minimum.
    assert.ok(ach.worst !== null && ach.worst > 0 && ach.worst < 0.005,
      `expected the flagged pair around 0.004, got ${ach.worst}`);
    assert.equal(groupRow(out, 'tritanopia', 'semantic signals').flag, '✓',
      'the point is that a dichromacy arm reads this palette clean');
  });

  /**
   * A pair that IS byte-identical under the condition, and IS flagged — so the report
   * can say `worst 0.000` truthfully somewhere. ardesia-dark's categorical fills carry
   * 38 induced collapses, several at exactly ΔE 0.
   */
  test('FINDS: ardesia-dark fills that a monochromat sees as one identical gray', () => {
    const row = groupRow(run('ardesia-dark').out, 'achromatopsia', 'categorical fills');
    assert.equal(row.flag, '✗');
    assert.ok(row.collapsed > 20, `expected many, got ${row.collapsed}`);
    assert.equal(row.worst, 0, 'at least one flagged pair renders byte-identical');
  });

  /**
   * The palette built FOR the condition is clean under it. Weak evidence about the floor
   * (its cycle is already achromatic, so the simulation is the identity on it — see the
   * COLLAPSE_BY_TYPE docblock), but a real regression guard: if a11y-achromatopsia ever
   * stops being separable under achromatopsia, that is a defect in the one palette whose
   * whole purpose is that it is.
   */
  test('a11y-achromatopsia is clean under its own condition, and --strict agrees', () => {
    const { out, code } = run('a11y-achromatopsia', '--strict', '--type', 'achromatopsia');
    assert.equal(code, 0, out);
    assert.match(out, /0 CVD-induced collapse\(s\)/);
  });

  test('--type takes the monochromacy, by canonical name and by alias', () => {
    for (const alias of ['achromatopsia', 'achroma', 'monochromacy']) {
      const { out, code } = run('concrete', '--type', alias);
      assert.equal(code, 0, out);
      assert.match(out, /collapse under the condition: achromatopsia < 0\.065/,
        `--type ${alias} should canonicalize to achromatopsia`);
    }
  });

  test('an unknown --type names the monochromacy among the choices', () => {
    const { out, code } = run('--type', 'nope');
    assert.equal(code, 2);
    assert.match(out, /achromatopsia/);
  });
});
