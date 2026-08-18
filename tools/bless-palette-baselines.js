#!/usr/bin/env node
/**
 * bless-palette-baselines — rewrite the two frozen palette baselines, RATCHET-ONLY.
 *
 * Re-curating a palette's status trio moves two committed tables at once:
 *
 *   · `KNOWN_SUB_THRESHOLD` in tools/composed-contrast.js — every composed
 *     (theme x mode x surface) pair below its bar, with the ratio it scores.
 *   · `CVD_FROZEN` in test/unit/palette/cvd-trio-floor.test.js — every
 *     (theme x mode x pair x deficiency) separation distance.
 *
 * Both are keyed rather than counted, deliberately: a count says "no MORE
 * failures" and says nothing about an existing one getting worse. Re-deriving
 * them by hand across 32 themes is not realistic, and re-deriving them with a
 * throwaway script is worse — the safety property then lives in a scratch file
 * nobody reviews. This is the same `bless` idiom the repo already uses for the
 * perf baseline, the split oracle and the render goldens (HARD RULE #15).
 *
 * ── The one rule this tool exists to enforce ──────────────────────────────────
 *
 * A blessed entry may RATCHET UP; it can never be written down, by ANY margin.
 * That matters because both tables are floors: the contrast baseline fails a
 * listed pair that scores worse than frozen, and the CVD table fails a pair that
 * erodes below its frozen distance. A regenerator that simply wrote today's
 * measurement would quietly re-bless every within-tolerance loss it had just
 * caused, which is the failure the CVD gate itself was rewritten to close ("a
 * count says nothing about an existing failure getting worse") — a re-freeze can
 * reintroduce that hole from the other side.
 *
 * IT ALMOST DID, and the near-miss is why the rule is now absolute. The first cut
 * allowed a drop of one unit in the last written place, so a table first recorded
 * by ROUNDING could be re-written by FLOORING without all 576 entries reading as
 * fresh erosions. Sound once; wrong every time after. The slack applied on EVERY
 * bless, so a value legitimately losing one ulp per change walks the floor down a
 * digit at a time — twenty rounds take a 0.1500 floor to 0.1480, which is exactly
 * the 0.0020 erosion tolerance the CVD gate exists to enforce. A gate you can walk
 * through one PR at a time is not a gate. The one-time re-representation is done
 * (both tables are floored as committed), so the slack is gone with it.
 *
 * So the ONLY thing blessing can do to an existing number is raise it, and the
 * only thing it can do to a key is drop one the audit no longer produces (a stale
 * entry, which both gates already fail on). Taking a number DOWN stays a manual,
 * argued edit — write it in the file and say why in the PR, exactly as the CVD
 * test's own header asks: "do not re-bless a number downward without saying why."
 *
 * Blessing is a DELIBERATE act. A diff in either table is a behavior change to
 * review, not noise to regenerate away.
 *
 *   node tools/bless-palette-baselines.js            # rewrite both tables
 *   node tools/bless-palette-baselines.js --dry-run  # print the delta, write nothing
 */

const fs = require('node:fs');
const path = require('node:path');
const { simulate } = require('../lib/theme/cvd.js');
const { oklabDistance } = require('../lib/theme/color.js');
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr.js');
const composed = require('./composed-contrast.js');

const ROOT = path.join(__dirname, '..');
const CONTRAST_FILE = path.join(ROOT, 'tools', 'composed-contrast.js');
const CVD_FILE = path.join(ROOT, 'test', 'unit', 'palette', 'cvd-trio-floor.test.js');

const TRIO = ['pass', 'warn', 'fail'];
const TYPES = ['protanopia', 'deuteranopia', 'tritanopia'];

/**
 * The rule, as a function, so it is testable rather than merely asserted in
 * prose: take the measurement only where it is at or above what is already
 * frozen. `frozen` undefined means a new key, which takes the measurement.
 *
 * THERE IS NO SLACK, deliberately — see the header. Any tolerance here compounds
 * across blesses, and a floor that can be walked down a digit per PR is not a
 * floor. The only float allowance is 1e-9, which is binary representation
 * (`0.1 + 0.2 !== 0.3`), not a policy margin: without it a measurement EQUAL to
 * the frozen value can compare as smaller and be reported as an erosion.
 */
function ratchet(frozen, measured) {
  if (frozen === undefined) return measured;
  return measured >= frozen - 1e-9 ? measured : frozen;
}

/** Floor rather than round: a baseline may never claim a ratio it does not score. */
const floorTo = (x, dp) => Math.floor(x * 10 ** dp) / 10 ** dp;

/** Replace a `const NAME = new Map([...]);` block, preserving everything around it. */
function replaceMapBlock(file, name, body) {
  const src = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`const ${name} = new Map\\(\\[[\\s\\S]*?\\n\\]\\);`);
  if (!re.test(src)) throw new Error(`${path.relative(ROOT, file)}: no \`const ${name} = new Map([…]);\` block`);
  return { src, next: src.replace(re, `const ${name} = new Map([\n${body}]);`) };
}

// One canonical entry, exactly as `renderContrast` / `renderCvd` write it. Nothing
// else is accepted — see `readEntries`.
const ENTRY_LINE = /^ {2}\['([^'\\]+)', (\d+\.\d+)\],$/;
// A line comment. SKIPPED WHOLE, never scanned for entries.
const COMMENT_LINE = /^\s*\/\/.*$/;

/**
 * Parse the entries a table already carries, so blessing can compare against them.
 *
 * STRICT, AND FAIL-CLOSED, because the loose version was the tool's worst bug. A
 * `matchAll` over the raw block text looks equivalent and is not: anything it
 * FAILS to match is not preserved, it is absent from `frozen`, and an absent key
 * takes `ratchet(undefined, measured)` — which writes the measurement down by any
 * amount and files it under `added`, a bucket `report()` prints as a bare count.
 * So a floor could be cut with no line naming it. Every one of these is legal
 * JavaScript that the loose pattern missed, and `biome.jsonc` disables the
 * formatter, so nothing in the repo normalizes any of them:
 *
 *   ["k", 0.15]     double quotes        ['k',0.15]      no space
 *   ['k', 1.5e-1]   exponent             ['k', +0.15]    leading sign
 *   ['k', 0.15_0]   numeric separator    [`k`, 0.15]     template literal
 *
 * Worse, `matchAll` cannot see comments, and `new Map` is last-wins — so a
 * comment QUOTING an old entry (exactly what the header's "argued edit by hand"
 * produces) overrode the real one, and the resulting write-down was reported as a
 * ratchet UP. And a mid-merge file parsed both sides, silently kept the incoming
 * one, and `replaceMapBlock` then erased the conflict markers into valid JS.
 *
 * So: a line is an entry, a comment, or blank. Anything else throws by name. A
 * hand edit stays possible — write it in canonical form, or comment it out and it
 * is skipped rather than half-read.
 */
function readEntries(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(new RegExp(`const ${name} = new Map\\(\\[([\\s\\S]*?)\\n\\]\\);`));
  if (!block) throw new Error(`${path.relative(ROOT, file)}: no \`const ${name}\` block`);
  const out = new Map();
  // Line numbers are FILE line numbers. Reporting the index within the block put
  // the reader 64 lines from the offending entry, in a doc comment.
  const blockStart = src.slice(0, block.index).split('\n').length;
  for (const [i, line] of block[1].split('\n').entries()) {
    if (!line.trim() || COMMENT_LINE.test(line)) continue;
    const m = line.match(ENTRY_LINE);
    if (!m) {
      throw new Error(
        `${path.relative(ROOT, file)}: ${name} line ${blockStart + i} is not a canonical entry and ` +
        `was not understood:\n    ${line}\n  Blessing refuses to read a table it cannot parse ` +
        'exactly. Restore the canonical form: two spaces, single quotes, a plain decimal, trailing ' +
        'comma. To take a number DOWN, edit it in place in that form and justify it in the PR — do ' +
        'NOT comment the entry out, because a commented-out entry is an ABSENT one, and an absent ' +
        'key takes today\'s measurement by any margin. Conflict markers land here too: resolve the ' +
        'merge by hand, do not let a re-bless pick a side for you.',
      );
    }
    if (out.has(m[1])) throw new Error(`${path.relative(ROOT, file)}: ${name} lists '${m[1]}' twice`);
    out.set(m[1], Number(m[2]));
  }
  return out;
}

// ── The composed-surface contrast baseline ──────────────────────────────────

function measureContrast() {
  const out = new Map();
  const surfaceOf = new Map();
  for (const row of composed.auditAll().below) {
    out.set(row.key, floorTo(row.ratio, 2));
    surfaceOf.set(row.key, row.surface.id);
  }
  return { out, surfaceOf };
}

function renderContrast(entries, surfaceOf) {
  const rows = [...entries].map(([key, ratio]) => ({ key, ratio, surface: surfaceOf.get(key) }))
    .sort((a, b) => a.surface.localeCompare(b.surface) || a.key.localeCompare(b.key));
  let body = '';
  let current = null;
  let run = [];
  const flush = () => {
    if (!current) return;
    body += `  // ── ${current} ── ${run.length}\n`;
    for (const r of run) body += `  ['${r.key}', ${r.ratio.toFixed(2)}],\n`;
  };
  for (const r of rows) {
    if (r.surface !== current) { flush(); current = r.surface; run = []; }
    run.push(r);
  }
  flush();
  return body;
}

// ── The CVD separation table ────────────────────────────────────────────────

function measureCvd() {
  const out = new Map();
  for (const theme of composed.listAllThemes()) {
    const vars = composed.mergedVars(theme);
    for (const [mode, isDark] of composed.MODES) {
      const hex = (tok) => {
        const v = resolveTokenExpr(String(vars[tok] ?? ''), vars, isDark);
        return /^#[0-9a-f]{6}$/i.test(String(v).trim()) ? String(v).trim() : null;
      };
      for (let i = 0; i < TRIO.length; i++) {
        for (let j = i + 1; j < TRIO.length; j++) {
          const a = hex(TRIO[i]);
          const b = hex(TRIO[j]);
          if (!a || !b) continue;
          for (const type of TYPES) {
            out.set(`${theme}|${mode}|${TRIO[i]}^${TRIO[j]}|${type}`,
                    floorTo(oklabDistance(simulate(a, type), simulate(b, type)), 4));
          }
        }
      }
    }
  }
  return out;
}

const renderCvd = (entries) => [...entries].sort((a, b) => a[0].localeCompare(b[0]))
  .map(([k, v]) => `  ['${k}', ${v.toFixed(4)}],\n`).join('');

// ── Blessing ────────────────────────────────────────────────────────────────

/** Apply the ratchet across a whole table and report what moved. */
function bless(frozen, measured) {
  const next = new Map();
  const raised = [];
  const held = [];
  for (const [key, value] of measured) {
    const was = frozen.get(key);
    const now = ratchet(was, value);
    next.set(key, now);
    if (was === undefined) continue;
    if (now > was) raised.push({ key, was, now });
    else if (now === was && value < was) held.push({ key, was, measured: value });
  }
  const dropped = [...frozen.keys()].filter((k) => !measured.has(k));
  return { next, raised, held, dropped, added: [...measured.keys()].filter((k) => !frozen.has(k)) };
}

function report(label, r) {
  console.log(`\n  ${label}`);
  console.log(`    ${r.next.size} entries · ${r.raised.length} ratcheted up · ` +
              `${r.added.length} new · ${r.dropped.length} dropped (stale) · ${r.held.length} held at the frozen value`);
  // EVERY bucket that writes a value names its keys. `added` was a bare count, and
  // that is the whole of how a floor gets cut invisibly: an entry commented out or
  // lost to a bad merge is ABSENT rather than frozen, so it takes the measurement
  // unconditionally and reads as "N new". Eight cut floors looked like the words
  // "8 new" under seventy lines of `held` noise.
  for (const a of r.added) console.log(`    · NEW   ${a} — no frozen entry, so it takes today's measurement. ` +
                'If you expected this key to be frozen, it was lost, not added.');
  for (const h of r.held) {
    console.log(`    · held  ${h.key}  frozen ${h.was} > measured ${h.measured} — NOT written down; ` +
                'take it down by hand, with the reason, if that is what you mean.');
  }
  for (const k of r.dropped) console.log(`    · drop  ${k}`);
}

function main() {
  // BOTH spellings, because `npm run palette:bless --dry-run` does not forward the
  // flag to argv — npm consumes it and sets `npm_config_dry_run` instead. Reading
  // argv alone meant the documented npm invocation printed the delta AND rewrote
  // both tables, so the operator who asked for a preview got a committed rewrite.
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--dry-run');
  if (unknown.length) {
    // Silently ignoring an argument means `--dry-run=1`, `-n` and `--dryrun` all
    // WROTE while the operator believed they had asked for a preview. Refuse.
    throw new Error(`unrecognized argument(s): ${unknown.join(' ')}. The only flag is --dry-run.`);
  }
  const dryRun = argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';

  const { out: contrastMeasured, surfaceOf } = measureContrast();
  const contrast = bless(readEntries(CONTRAST_FILE, 'KNOWN_SUB_THRESHOLD'), contrastMeasured);
  const cvd = bless(readEntries(CVD_FILE, 'CVD_FROZEN'), measureCvd());

  console.log('\n  Lattice · palette baselines (ratchet-only)');
  console.log('  ══════════════════════════════════════════════════════════════');
  report('KNOWN_SUB_THRESHOLD  (tools/composed-contrast.js)', contrast);
  report('CVD_FROZEN           (test/unit/palette/cvd-trio-floor.test.js)', cvd);

  if (dryRun) { console.log('\n  --dry-run: nothing written.\n'); return; }

  const c = replaceMapBlock(CONTRAST_FILE, 'KNOWN_SUB_THRESHOLD', renderContrast(contrast.next, surfaceOf));
  fs.writeFileSync(CONTRAST_FILE, c.next);
  const v = replaceMapBlock(CVD_FILE, 'CVD_FROZEN', renderCvd(cvd.next));
  fs.writeFileSync(CVD_FILE, v.next);
  console.log('\n  written. Re-run the gates, and say in the PR why each moved entry is correct.\n');
}

module.exports = { ratchet, bless, floorTo, measureContrast, measureCvd };

if (require.main === module) main();
