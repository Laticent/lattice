#!/usr/bin/env node
/**
 * Measure which display tokens reach the voice UNCHANGED.
 *
 * `engineering/decisions/2026-09-20-narration-audit.md` Finding 3 reports a boardroom token
 * corpus going from "19 raw of 52" to "9 raw of 59". That corpus was a scratch script and was
 * never committed, so the number could not be re-derived — the same gap the audit closed for
 * `measure-narration-coverage.mjs` and, for the same reason, closed here.
 *
 *   node tools/measure-token-narration.mjs          # the table, grouped by class
 *   node tools/measure-token-narration.mjs --raw    # only the tokens that pass through
 *
 * WHAT "RAW" MEANS. `toSpoken(token) === token` — the normalizer had no rule and the glyphs
 * go to the voice as written. That is not automatically a defect: for a slash shape it is the
 * deliberate answer (see § The slash below, and the decision note). It is a SIGNAL, and the
 * point of the table is that a raw token is either on the deliberate list or it is a gap.
 *
 * Needs a built Cadenza (`npm run cadenza-lib:build`, which `npm run build` runs).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { toSpoken } = require(path.join(ROOT, 'docs/src/lib/cadenza/dist/index.cjs'));

/**
 * The corpus, grouped by the class the audit's Finding 3 table names. Every token here is a
 * shape a real commercial or legal deck writes. A class marked `deliberate` is one where a raw
 * passthrough is the ANSWER, not a gap — the tool counts those separately so the headline
 * number means "unhandled", not "unchanged".
 */
const CORPUS = [
	{ name: 'money', tokens: ['$4.2M', '€1.2M', '£800k', '$1', '$0.6M', '1,234,567'] },
	{ name: 'percent and direction', tokens: ['+9%', '−18d', '18.5%', '>50%', '±3%', '≥5'] },
	{ name: 'multiplier and scale', tokens: ['4.2×', '3.5x', '1x', '1×', '$4.2bn', '240ms', 'p95'] },
	{ name: 'range', tokens: ['$1.2–1.4B', '50-60%', '2-3x', '12–15'] },
	{ name: 'date and time', tokens: ['2026-09-20', '12:30', '9:05', '14:00', 'Q3’26', 'FY26', 'H1'] },
	{ name: 'ordinal, decade, rank, version', tokens: ['1st', '22nd', '99th', '1990s', '#1', 'v2.1'] },
	{ name: 'legal', tokens: ['§1798.140(o)', '§5', '§22-1201', '§59.1-575'] },
	{ name: 'acronym', tokens: ['R&D', 'P&L', 'ARR', 'CEO'] },
	{ name: 'bracketed', tokens: ['($4.2M)', '"ARR"', '[CEO]', '(§5)', '(12)', '(+9%)'] },
	{ name: 'magnitude edge', tokens: ['1000000000000000', '0.0000001', '40°C'] },
	{ name: 'mark glyph', tokens: ['✓', '✔', '☑', '✗', '☒'] },
	{
		name: 'slash and identifier',
		deliberate: true,
		tokens: ['A/B', 'P/E', '24/7', '3.5/5', '9/20', 'ID-4471', '2026-09', '555-1234'],
	},
];

const rawOnly = process.argv.includes('--raw');
let total = 0;
let raw = 0;
let deliberate = 0;
const out = [];
for (const group of CORPUS) {
	const rows = [];
	for (const token of group.tokens) {
		const spoken = String(toSpoken(token));
		const isRaw = spoken === token;
		total++;
		if (isRaw) {
			raw++;
			if (group.deliberate) deliberate++;
		}
		if (!rawOnly || isRaw) rows.push({ token, spoken, isRaw });
	}
	if (rows.length) out.push({ name: group.name, deliberate: !!group.deliberate, rows });
}

for (const group of out) {
	process.stdout.write(`\n${group.name}${group.deliberate ? '  [raw here is DELIBERATE]' : ''}\n`);
	for (const r of group.rows) {
		process.stdout.write(`  ${r.isRaw ? 'RAW ' : '    '}${r.token.padEnd(20)}${r.isRaw ? '' : `→ ${r.spoken}`}\n`);
	}
}
const gaps = raw - deliberate;
process.stdout.write(
	`\n${raw} of ${total} tokens pass through raw — ${deliberate} deliberate (the slash and identifier shapes), ${gaps} unhandled.\n`,
);
process.exit(0);
