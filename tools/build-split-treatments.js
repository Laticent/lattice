#!/usr/bin/env node

/**
 * build-split-treatments.js — regenerate §0c's treatment table in
 * engineering/decisions/2026-07-22-structure-derived-split-patterns.md from
 * `TREATMENTS` in lib/core/split-facts.js and the live component catalog.
 *
 * WHY THIS EXISTS. §0c is titled "every one of the 59 components has a treatment".
 * The catalog is 61. `matrix-grid` and `premise` appeared nowhere in the prose —
 * their placement existed only in `split-facts.js`. `roadmap` was recorded *atomic*
 * a release after #1209 moved the code to *read-across*. Three drifts in one table,
 * all of the same shape the reflow note (2026-07-27) is about: a number or a claim
 * written down once, believed thereafter, never re-derived.
 *
 * So the table stops being hand-maintained. `split-facts.js` already had to carry
 * the machine-checkable half (a prose table cannot fail CI — that is why
 * `checkSplitOracle` exists at all), which made the prose a SECOND copy of the same
 * decision. This renders the prose from that one copy instead:
 *
 *   TREATMENTS       — which treatment each component gets (the decision)
 *   TREATMENT_LABELS — how §0c says each treatment (the row headings, in §0c order)
 *   TREATMENT_NOTES  — the per-component annotations §0c's table carried by hand
 *   the manifests    — whether the component is ENROLLED (has a capacity axis or a
 *                      split recipe), which is what decides whether its placement is
 *                      live or still rings
 *
 * The ° marker is the one that used to be hand-set (as †) and go stale: it means
 * "this treatment implies a seam, but the component carries no opt-in today, so it
 * rings". It is now derived from the manifests on every build, so the §0c follow-on
 * list ("opt-in backfill") can never silently complete or silently grow.
 *
 * Usage:
 *   node tools/build-split-treatments.js            # rewrite the §0c table
 *   node tools/build-split-treatments.js --check    # exit 1 if it would change
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'engineering', 'decisions', '2026-07-22-structure-derived-split-patterns.md');
const BEGIN = '<!-- split-treatments:begin -->';
const END = '<!-- split-treatments:end -->';

const {
  TREATMENTS, TREATMENT_LABELS, TREATMENT_NOTES, splitFactsFor,
} = require('../lib/core/split-facts');

/** Every component's placement + whether its manifest actually opts into splitting. */
function collect() {
  const manifests = require('../lib/components').loadAll(path.join(ROOT, 'lib', 'components'));
  const rows = [];
  const errors = [];
  for (const m of manifests) {
    const treatment = TREATMENTS[m.name];
    if (!treatment) {
      errors.push(`${m.name}: no treatment in TREATMENTS (lib/core/split-facts.js) — place it deliberately (§8 rule 11).`);
      continue;
    }
    if (!TREATMENT_LABELS[treatment]) {
      errors.push(`${m.name}: treatment '${treatment}' has no entry in TREATMENT_LABELS — §0c has no way to say it.`);
      continue;
    }
    rows.push({ name: m.name, treatment, enrolled: splitFactsFor(m).enrolled });
  }
  // A label with no component is a row §0c would render empty — almost always a
  // treatment that was retired in the map and left behind in the labels.
  for (const t of Object.keys(TREATMENT_LABELS)) {
    if (!rows.some((r) => r.treatment === t)) {
      errors.push(`treatment '${t}' has a TREATMENT_LABELS entry but no component — remove the stale label.`);
    }
  }
  return { rows, errors };
}

/**
 * The treatments that describe a PAGINATION — a seam the component has to opt into
 * for its own placement to be live. These are the only ones where "not enrolled"
 * is a gap rather than the design:
 *
 *   NEVER_SPLIT (anchor/graphic/asset/atomic) — ringing IS the treatment.
 *   read-across                               — "keep whole / carousel"; keeping
 *                                               whole with no recipe is one of the
 *                                               two intended outcomes, and a bare
 *                                               axis without a strategy is already
 *                                               a hard failure in treatmentViolations.
 *   code                                      — PROPOSED; `partitionAxis` refuses
 *                                               the `line` axis, so there is nothing
 *                                               to opt into yet.
 *   needs-call                                — undecided by definition.
 */
const PAGINATING = Object.freeze(['list-light', 'list-heavy', 'record', 'connected']);

/** Does this placement describe a split the component has not opted into? */
const ringsAgainstPlacement = (r) => !r.enrolled && PAGINATING.includes(r.treatment);

function render(rows) {
  const lines = [BEGIN, '', '| Treatment | Components |', '|---|---|'];
  let ringing = 0;
  for (const [treatment, label] of Object.entries(TREATMENT_LABELS)) {
    const members = rows
      .filter((r) => r.treatment === treatment)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => {
        const marks = [];
        if (TREATMENT_NOTES[r.name]) marks.push(TREATMENT_NOTES[r.name]);
        const ring = ringsAgainstPlacement(r);
        if (ring) ringing++;
        return `\`${r.name}\`${ring ? '°' : ''}${marks.length ? ` *(${marks.join('; ')})*` : ''}`;
      });
    lines.push(`| ${label} | ${members.join(' · ')} |`);
  }
  lines.push(
    '',
    `_${rows.length} components, all placed. **Generated** by \`npm run split:treatments\` from `
    + '`TREATMENTS` in `lib/core/split-facts.js` — edit that map, not this table; `build:check` '
    + 'fails on drift. A `°` marks a component whose treatment describes a split it has **not '
    + 'opted into** — no `capacity` axis and no `split` recipe, so it rings on overflow today '
    + `(the "opt-in backfill" follow-on below). ${ringing} carry it now._`,
    '',
    END,
  );
  return lines.join('\n');
}

function splice(doc, block) {
  const b = doc.indexOf(BEGIN);
  const e = doc.indexOf(END);
  if (b === -1 || e === -1 || e < b) {
    throw new Error(`${path.relative(ROOT, DOC)} is missing or has out-of-order ${BEGIN} / ${END} markers — add them, in order, under "## 0c.".`);
  }
  return doc.slice(0, b) + block + doc.slice(e + END.length);
}

function main(argv) {
  const check = argv.includes('--check');
  const { rows, errors } = collect();
  if (errors.length) {
    process.stderr.write(`split-treatments: ${errors.length} placement error(s):\n`);
    for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
    return 1;
  }
  const doc = fs.readFileSync(DOC, 'utf8');
  const next = splice(doc, render(rows));
  if (next === doc) {
    process.stdout.write(`split-treatments OK — ${rows.length} components placed, §0c current.\n`);
    return 0;
  }
  if (check) {
    process.stderr.write('split-treatments STALE — run `npm run split:treatments` and commit.\n');
    return 1;
  }
  fs.writeFileSync(DOC, next);
  process.stdout.write(`split-treatments: rewrote ${rows.length} placements into §0c of ${path.relative(ROOT, DOC)}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { collect, render, splice, ringsAgainstPlacement };
