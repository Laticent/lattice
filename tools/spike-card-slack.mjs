#!/usr/bin/env node

/**
 * SPIKE — not production tooling, and not wired to any gate. The card-slack
 * measurement harness behind
 * engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §9b and §9d.
 *
 * It exists so those numbers are AUDITABLE. The first cut of that note quoted a
 * calibrated threshold, a 2,908-card population and a 374 → 61 before/after table
 * from a harness that lived in `.scratch/` and therefore never merged — the same
 * failure tools/spike-composition-snapshot.mjs's docblock was written to prevent,
 * and the one an independent checker named as the largest unverified surface in
 * the note (HARD RULE #23).
 *
 * WHAT IT MEASURES. Per CARD inside `.cell-stage`, in real Chromium on a real
 * emulator render:
 *
 *     leading  = first in-flow child's top     − the card's CONTENT-box top
 *     trailing = the card's CONTENT-box bottom − last in-flow child's bottom
 *     S = (leading + trailing) / content height        total slack
 *     A = (trailing − leading) / (leading + trailing)  signed asymmetry
 *
 * A card is on the DEFECT side when S >= 0.14 and A >= 0.70 — constants derived
 * by finding the widest interval containing no card, not picked.
 *
 * THIS FILE IS THE ENTRY POINT; the four stages live in tools/spike-card-slack/.
 * It is top-level because engineering/capabilities.md is built from a
 * NON-RECURSIVE scan of tools/ (tools/build-capabilities.js), so a harness that
 * lives only in a subdirectory is invisible to the index HARD RULE #15 tells the
 * next agent to grep — which is how a tool gets rebuilt instead of reused.
 *
 *   node tools/spike-card-slack.mjs render exemplars/*.md   # → .scratch/card-slack/html/
 *   node tools/spike-card-slack.mjs measure > cards.json    # → one JSON record per card
 *   node tools/spike-card-slack.mjs analyze cards.json      # class tables + sweeps
 *   node tools/spike-card-slack.mjs calibrate cards.json    # the empty-interval calibration
 *
 * KNOWN LIMITS, and the five instrument bugs this line of work paid for, are in
 * tools/spike-card-slack/README.md. Read them before quoting a number: every
 * correction to this measurement has come from the instrument, not the corpus.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const STAGES = ['render', 'measure', 'analyze', 'calibrate'];
const here = path.dirname(fileURLToPath(import.meta.url));
const [stage, ...rest] = process.argv.slice(2);

if (!STAGES.includes(stage)) {
  process.stderr.write(
    `usage: spike-card-slack.mjs <${STAGES.join('|')}> [args]\n` +
      'See the docblock in this file and tools/spike-card-slack/README.md.\n',
  );
  process.exit(2);
}

const child = spawn(
  process.execPath,
  [path.join(here, 'spike-card-slack', `${stage}.mjs`), ...rest],
  { stdio: 'inherit' },
);
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
