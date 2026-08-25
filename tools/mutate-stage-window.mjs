#!/usr/bin/env node
/**
 * mutate-stage-window — break what each Stage-window cell NAMES, and watch it go red.
 *
 * THE GAP THIS CLOSES, on this surface specifically. The stage-console split shipped EIGHT
 * gates that were vacuous — green for a reason other than the one they were named for — and
 * the pattern behind all eight is stable enough to state: **a cell that asserts a NAME rather
 * than a BEHAVIOR is true for a reason other than the one it is named for**, and **a cell that
 * reads an OUTCOME cannot see a guard that controls the CALL**. Two of them were found only
 * after they shipped. `2026-08-24-stage-console-split.md` §12 lists all eight.
 *
 * So every cell on this surface owes the same proof the Guide gestures owe: inject the defect
 * it is named for, and confirm it dies. This battery is that proof, kept executable — a table
 * pasted into a PR body decays the moment the next edit lands, and the cells it certifies are
 * the ones a projected deck depends on.
 *
 * WHY A SECOND FILE and not a key in `tools/mutate-guide-gestures.mjs`, which is the same
 * shape: that battery's name is load-bearing in an archived decision record
 * (`2026-08-05-guide-gesture-semantics.md` §"mutate:guide") and in its capabilities row, both
 * of which describe it as the GUIDE battery. Generalizing it would mean editing the archive to
 * keep the docs true (HARD RULE #15 is about not rebuilding a capability, and the ~25 shared
 * lines here are a loop, not a capability). Different surface, different spec, different
 * lesson — same idiom, deliberately.
 *
 * A mutation that DID NOT APPLY is reported separately and counts as nothing: a harness that
 * silently edited no bytes and then read green is the same failure one level up.
 *
 * Usage:  npm run mutate:stage-window
 * Restores every file it touches, including on a failing run. On-demand; not a CI gate — it
 * runs the suite once per mutation.
 *
 * NOT COVERED HERE, and named so the coverage is not overstated: the two REAL-POPUP mutations
 * that certify `docs/e2e/stage-window.spec.ts`. Each needs a full docs rebuild, so they are
 * driven by hand; both are recorded, with their measured outcome, in the decision note §13.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const SRC = 'src/components/studio/present/stage-window.js';
const SPEC = 'src/components/studio/present/stage-window.test.ts';

/** @type {[from: string, to: string, name: string][]} */
const MUTS = [
	// ── The loss classifier: which teardowns are announced, and as what ──────────────
	// Each of these is a way of collapsing the distinction the notice exists to draw. The
	// first two are the shapes this code actually had before §13.
	['announceUnlessClosed(w, ownSeq);', "onLost?.('gone');", 'the beat path announces every close, hand-close included'],
	['if (waited >= CLOSED_GRACE_MS) {', 'if (true) {', 'classify `closed` synchronously — no grace window'],
	['if (!w || seq !== ownSeq) return;', 'if (!w) return;', "a re-opened Stage still gets the old one's obituary"],
	[
		'\t\t\tconst w = stageWin;\n\t\t\tteardown();\n\t\t\t// Still open',
		'\t\t\tconst w = stageWin;\n\t\t\tif (w && w.closed) { teardown(); return; }\n\t\t\tteardown();\n\t\t\t// Still open',
		'the poll goes quiet on a window that is closed (a loss nobody asked for reports nothing)',
	],
	["onLost?.(navigated ? 'navigated' : 'gone');", "onLost?.('gone');", 'the poll reports every loss as a death'],
	[
		'\t\tif (lossTimer) {\n\t\t\twindow.clearTimeout(lossTimer);\n\t\t\tlossTimer = 0;\n\t\t}',
		'\t\tif (lossTimer) {\n\t\t\tlossTimer = 0;\n\t\t}',
		'teardown leaves a classification walking (a timer outliving its window)',
	],
	["onLost?.('navigated');\n\t\t\treturn;", "onLost?.('gone');\n\t\t\treturn;", 'a navigated Stage is announced as a death'],
	[
		'\t\tconst w = stageWin;\n\t\tteardown();\n\t\tif (w && !w.closed) {',
		"\t\tconst w = stageWin;\n\t\tteardown();\n\t\tonLost?.('gone');\n\t\tif (w && !w.closed) {",
		"close() announces the console's own close",
	],
	// ── The overlay control bar: the three markup-presence cells ─────────────────────
	// These were never proven able to fail. They are markup assertions, which is the exact
	// shape §12 found vacuous eight times — so they are pinned here rather than trusted.
	['? \'<div id="latt-ctl" class="latt-ctl">\' +', "? '<div class=\"latt-ctl\">' +", 'the control bar element is gone'],
	['aria-label="Full screen"', 'data-label="Full screen"', 'the buttons lose their accessible names'],
	[
		"'backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;}'",
		"'backdrop-filter:blur(8px);pointer-events:none;transition:opacity .18s ease;}'",
		'the bar is visible at rest — permanent chrome on the projection',
	],
	[
		"'.latt-ctl.on,.latt-ctl:focus-within{opacity:1;pointer-events:auto;}'",
		"'.latt-ctl.on{opacity:1;pointer-events:auto;}'",
		'a keyboard user can reach the bar but never see it',
	],
	['\tconst controls = standalone\n\t\t?', '\tconst controls = true\n\t\t?', 'the bar is emitted into the srcdoc hosts too'],
];

const abs = path.join(DOCS, SRC);
const survivors = [];
const notApplied = [];
let killed = 0;

const failCount = () => {
	try {
		const out = execFileSync('npx', ['vitest', 'run', SPEC, '--reporter=json'], { cwd: DOCS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
		return JSON.parse(out.slice(out.indexOf('{'))).numFailedTests ?? 0;
	} catch (e) {
		const t = String(e.stdout ?? '');
		const i = t.indexOf('{');
		return i >= 0 ? (JSON.parse(t.slice(i)).numFailedTests ?? 1) : 1;
	}
};

// THE BASELINE IS PART OF THE PROOF. A suite that is already red makes every mutation look
// killed, which is the same lie this harness exists to catch, one level up.
const base = failCount();
if (base > 0) {
	console.error(`the suite is already failing (${base}) — fix that before reading any mutation result`);
	process.exit(1);
}

for (const [from, to, name] of MUTS) {
	const orig = fs.readFileSync(abs, 'utf8');
	if (!orig.includes(from)) {
		notApplied.push(name);
		process.stderr.write(`NOT APPLIED  ${name}\n`);
		continue;
	}
	fs.writeFileSync(abs, orig.replace(from, to));
	let failed = 0;
	try {
		failed = failCount();
	} finally {
		fs.writeFileSync(abs, orig);
	}
	if (failed > 0) killed += 1;
	else survivors.push(name);
	process.stderr.write(`${failed > 0 ? 'KILLED  ' : 'SURVIVED'}  ${name}\n`);
}

console.log(`\n${MUTS.length} mutations · ${killed} killed · ${survivors.length} survived · ${notApplied.length} did not apply`);
if (survivors.length) console.log(`SURVIVORS (the cell named for this cannot fail):\n  ${survivors.join('\n  ')}`);
if (notApplied.length) console.log(`NOT APPLIED (proves nothing):\n  ${notApplied.join('\n  ')}`);
process.exit(survivors.length || notApplied.length ? 1 : 0);
