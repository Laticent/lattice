#!/usr/bin/env node
/**
 * bless-split-oracle — write the STANDING ORACLE record (§8 rule 5).
 *
 * Recomputes every component's split facts from its manifest and writes them to
 * test/oracle/split-oracle.json. The gate (`checkSplitOracle` in tools/check-ownership.js,
 * via `build:check`) then fails on ANY drift from this record, so a manifest edit or a
 * resolver refactor that silently changes a component's split behavior cannot ship
 * unnoticed — the same shape as `bench:bless` / `bench:check` for the perf baseline.
 *
 * ── Rule 11, and the hole this closes ─────────────────────────────────────────
 *
 * §8 rule 11: "The oracle records a VERIFIED default, it never mints one. Adding a
 * component to the standing golden requires a committed demo deck exercising its
 * overflow path (HARD #9) + reviewer sign-off that the derived (axis, read-across,
 * reshape) matches intent."
 *
 * As first built, this tool did none of that. It diffed recomputed manifest facts and
 * nothing else — so for a component that had never been in the record, the FIRST
 * `--bless` wrote whatever the manifest happened to say and the gate defended it
 * forever after. That is minting, precisely: drift-detection was doing duty as
 * initial-correctness, which is the distinction rule 11 exists to draw.
 *
 * So enrollment now needs an ATTESTATION. A component that opts into splitting (an
 * axis or a split recipe) must name, in `verified`, the committed deck that exercises
 * its split and who signed the derived facts off. Blessing REFUSES to write an entry
 * for a newly-enrolled component that has neither an attestation nor a grandfather
 * entry — it cannot mint one, which is the rule stated as a behavior rather than a
 * hope.
 *
 * `grandfathered` is the honest half. 28 components were already enrolled when this
 * precondition landed, and back-filling 28 sign-offs I did not witness would have been
 * fabricating exactly the verification the rule asks for. They are frozen in a named,
 * dated list instead — the `US_ENGLISH_BUDGET` ratchet idiom this repo already uses.
 * The list can only SHRINK: blessing refuses to add a name to it, and the gate fails on
 * a stale entry, so it cannot quietly absorb a new component either. Each one clears by
 * someone actually verifying that component's split and moving it into `verified`.
 *
 * Blessing stays a DELIBERATE act — run it only when you intend the change, and say in
 * the PR why each moved entry is correct. A diff in this file is a behavior change to
 * review, not noise to regenerate away.
 *
 *   node tools/bless-split-oracle.js          # rewrite the record
 *   node tools/bless-split-oracle.js --check  # exit 1 on drift (what the gate uses)
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAll } = require('../lib/components');
const { splitFactsFor } = require('../lib/core/split-facts');

const ROOT = path.join(__dirname, '..');
const ORACLE = path.join(ROOT, 'test', 'oracle', 'split-oracle.json');

/**
 * The enrolled components that predate the rule-11 attestation precondition
 * (2026-07-28, #1234). SHRINK-ONLY: a name leaves this list when someone verifies that
 * component's split against a committed deck and moves it into the record's `verified`
 * map. Nothing may ever be added — `attest()` refuses, and the gate fails on an entry
 * that is no longer enrolled, so the list cannot rot in either direction.
 *
 * This is a backlog, not an exemption. Every name here is a component whose split
 * behavior the oracle defends without anyone having confirmed it was right to begin
 * with.
 */
const GRANDFATHERED = Object.freeze([
  'actors', 'agenda', 'authority-chain', 'cards-grid', 'cards-stack', 'checklist',
  'compare-code', 'compare-prose', 'compare-table', 'cycle', 'decision', 'glossary',
  'inventory', 'kanban', 'kpi', 'list', 'list-steps', 'list-tabular',
  'policy-recommendation', 'premise', 'q-and-a', 'redline', 'regulatory-update',
  'roadmap', 'split-panel', 'stats', 'statute-stack', 'verdict-grid',
]);

/**
 * Rule 11's precondition, as a check rather than a convention.
 *
 * Returns the problems with the attestation state of a recomputed set of facts,
 * given whatever `verified` map the existing record carries. Shared by the bless
 * path and by `checkSplitOracle`, so the tool and the gate cannot disagree about
 * what "verified" means (HARD RULE #1).
 */
function attestationProblems(facts, verified) {
  const out = [];
  const grand = new Set(GRANDFATHERED);
  for (const [name, f] of Object.entries(facts)) {
    if (!f.enrolled) {
      if (verified[name]) {
        out.push(
          `${name}: has a \`verified\` attestation but is NOT enrolled (no capacity axis, no `
          + 'split recipe). Remove the attestation, or enroll the component — a sign-off for a '
          + 'split that cannot happen is a stale claim (rule 11: the record must not rot).',
        );
      }
      continue;
    }
    if (verified[name]) {
      const deck = verified[name].deck;
      if (!deck || !fs.existsSync(path.join(ROOT, deck))) {
        out.push(
          `${name}: \`verified.deck\` names ${JSON.stringify(deck)}, which does not exist. Rule 11 `
          + 'requires a COMMITTED deck exercising the overflow path (HARD #9) — an attestation '
          + 'pointing at a deck that is not in the tree verifies nothing.',
        );
      }
      if (!verified[name].by) {
        out.push(`${name}: \`verified\` needs a \`by\` — who signed off that the derived facts match intent (rule 11).`);
      }
      continue;
    }
    if (grand.has(name)) continue;
    out.push(
      `${name}: enrolled in splitting with NO verification record. §8 rule 11 — the oracle records `
      + 'a verified default, it never mints one. Add an entry to `verified` in '
      + 'test/oracle/split-oracle.json naming the committed deck that exercises this component\'s '
      + 'split and who signed the derived (axis, read-across, reshape) off:\n'
      + `      "${name}": { "deck": "examples/<slug>.md", "by": "<PR or reviewer>", "note": "<what was checked>" }\n`
      + '    Render that deck at a portrait @size with `autosplit: on` and confirm the pages are '
      + 'what the component means before you write the entry.',
    );
  }
  // The ratchet's other direction: a grandfathered name that is no longer enrolled has
  // been resolved (or removed) and must leave the list, or it is a claim about nothing.
  for (const name of GRANDFATHERED) {
    if (!facts[name]) {
      out.push(`${name}: in GRANDFATHERED (tools/bless-split-oracle.js) but no longer a component — drop it from the list.`);
    } else if (!facts[name].enrolled) {
      out.push(
        `${name}: in GRANDFATHERED but no longer enrolled — the backlog entry is stale. Remove it `
        + 'from the list (the ratchet only shrinks, and this is one of the ways it shrinks).',
      );
    }
  }
  return out;
}

function read() {
  try { return JSON.parse(fs.readFileSync(ORACLE, 'utf8')); } catch { return null; }
}

function build(verifiedOverride) {
  const manifests = loadAll(path.join(ROOT, 'lib', 'components'));
  const components = {};
  for (const m of manifests.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    components[m.name] = splitFactsFor(m);
  }
  // Attestations are AUTHORED, never derived — so they are carried forward from the
  // committed record rather than recomputed. That is the whole point: if blessing could
  // synthesize them, it would be minting again one level up.
  const verified = verifiedOverride ?? (read()?.verified || {});
  return {
    $comment: 'BLESSED RECORD — §8 rule 5 of engineering/decisions/2026-07-22-structure-derived-split-patterns.md. '
      + 'The `components` map is RECOMPUTED from the component manifests by tools/bless-split-oracle.js and gated by '
      + 'checkSplitOracle in tools/check-ownership.js (build:check). A diff there is a SPLIT-BEHAVIOR CHANGE to review, '
      + 'not noise: run `npm run oracle:bless` only when you intend it, and justify each moved entry in the PR. '
      + 'The `verified` map is AUTHORED, never recomputed — it is rule 11\'s precondition (the record documents a '
      + 'verified default, it never mints one), so an ENROLLED component must name the committed deck that exercises '
      + 'its split and who signed the derived facts off. Blessing REFUSES to write an entry for a newly-enrolled '
      + 'component that has neither. The components enrolled before that precondition landed are frozen in '
      + 'GRANDFATHERED (tools/bless-split-oracle.js), a shrink-only backlog, not an exemption.',
    verified,
    components,
  };
}

function main(argv) {
  const old = read();
  const fresh = build();
  const problems = attestationProblems(fresh.components, fresh.verified);
  if (problems.length) {
    process.stderr.write(
      `split oracle: ${problems.length} rule-11 attestation problem(s) — REFUSING to `
      + `${argv.includes('--check') ? 'pass' : 'bless'}:\n`,
    );
    for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
    return 1;
  }
  if (argv.includes('--check')) {
    if (!old) { process.stderr.write(`split oracle missing: ${ORACLE}\n  run: npm run oracle:bless\n`); return 1; }
    const same = JSON.stringify(old.components) === JSON.stringify(fresh.components)
      && JSON.stringify(old.verified || {}) === JSON.stringify(fresh.verified);
    if (!same) { process.stderr.write('split oracle DRIFTED — run `npm run oracle:bless` if intended.\n'); return 1; }
    process.stdout.write(`split oracle OK — ${Object.keys(fresh.components).length} components, `
      + `${Object.keys(fresh.verified).length} verified, ${GRANDFATHERED.length} grandfathered.\n`);
    return 0;
  }
  fs.mkdirSync(path.dirname(ORACLE), { recursive: true });
  fs.writeFileSync(ORACLE, `${JSON.stringify(fresh, null, 2)}\n`);
  process.stdout.write(`blessed ${Object.keys(fresh.components).length} components → ${path.relative(ROOT, ORACLE)}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { build, attestationProblems, GRANDFATHERED, ORACLE };
