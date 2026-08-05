#!/usr/bin/env node
/**
 * mutate-guide-gestures — break what each test NAMES, and watch it go red.
 *
 * THE GAP THIS CLOSES. "Verified by a test" is a claim about a test, and in this feature area
 * that claim has been wrong seven times: a spec that passed because a 20s timeout fired, one
 * that passed against the unfixed build because its matcher retried, one that drove a seam
 * bypassing the mechanism entirely, one that passed a signal no production call site produces.
 * The 2026-08-03 narration record writes the lesson down three separate times and it did not
 * prevent the next instance, so this is the operational form of it: a committed battery that
 * injects each defect a test is named for and reports every test that survives its own.
 *
 * It was itself the thing that caught the last four. The adversarial trio ran an independent
 * battery over this work and found four tests that could not fail for their stated reason —
 * every one because the FIXTURE could not reach the mechanism, not because the assertion was
 * wrong. Those are fixed; this keeps them fixed.
 *
 * A mutation that DID NOT APPLY is reported separately and counts as nothing: a harness that
 * silently edited no bytes and then read green is the same failure one level up.
 *
 * Usage:  node tools/mutate-guide-gestures.mjs
 * Restores every file it touches, including on a failing run. On-demand; not a CI gate — it
 * runs two vitest suites per mutation.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const MUTS = [
	// ── stage.ts / deictic.test.ts
	['stage', 'return { x: b.right + pad, y: r2(line).bottom + INK_GAP + pad };', 'return { x: box.left, y: box.top };', 'rest is the box own corner'],
	['stage', "const line = rects?.length ? (kind === 'underline' ? rects[0] : rects[rects.length - 1]) : box;", 'const line = box;', 'the rest ignores the ink rects'],
	// biome-ignore lint/suspicious/noTemplateCurlyInString: these ARE source fragments to match, not templates
	['stage', 'node.style.top = `${l.top + l.height + INK_GAP}px`;', 'node.style.top = `${l.top}px`;', 'underline drawn through the words'],
	['stage', '\t\trequestAnimationFrame(tick);\n\t\tlet stopped = false;', '\t\tlet stopped = false;', 'ink stops tracking its target'],
	['stage', '\t\t} catch (e) {\n\t\t\tstop();\n\t\t\tthrow e;\n\t\t}', '\t\t} catch (e) {\n\t\t\tthrow e;\n\t\t}', 'an abort leaves the ink painted'],
	['stage', 'const bands = liveRects(src) ?? [r0];', 'const bands = [r0];', 'wash ignores per-line rects'],
	['stage', "\t\t\t\t\tif (!b) {\n\t\t\t\t\t\tnode.style.width = '0px';\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}", '\t\t\t\t\tif (!b) {\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}', 'a stale wash band stays painted'],
	['stage', 'const out = clearanceOf(opts) ? INK_OUT + clearanceOf(opts) : 0;', 'const out = INK_OUT + clearanceOf(opts);', 'circle inflates at clearance 0'],
	['stage', '\t\tif (reduced) {\n\t\t\tplace(rest.x, rest.y);\n\t\t\treturn wait(still ? 60 : 200, signal);\n\t\t}', '\t\tif (reduced) {\n\t\t\treturn wait(still ? 60 : 200, signal);\n\t\t}', 'legible never reaches rest'],
	['stage', "if (!el || silenced.has('underline')) return;", 'if (!el) return;', 'a silenced cue draws anyway'],
	['stage', 'const pad = Math.max(0, clearance);', 'const pad = 0;', 'gestureRest ignores clearance'],
	['stage', '\t\t\t\tconst l = rects()?.[0] ?? r;', '\t\t\t\tconst l = r;', 'underline ink ignores its line rect'],
	['stage', '\t\tif (reduced) {\n\t\t\tplace(rest.x, rest.y);\n\t\t\treturn wait(still ? 60 : 200, signal);\n\t\t}\n\t\tfor (let i = 0', '\t\tif (true) {\n\t\t\tplace(rest.x, rest.y);\n\t\t\treturn wait(still ? 60 : 200, signal);\n\t\t}\n\t\tfor (let i = 0', 'the sweep itself is deleted'],
	['stage', "return { notable, weight: notable ? 5 : 3, alpha: notable ? 1 : 0.9, hold: still ? 160 : notable ? 1500 : 1050 };", 'return { notable, weight: 3, alpha: 0.9, hold: still ? 160 : 1050 };', 'strength does nothing'],
	['stage', 'const out = Array.from(list).filter((r) => Number.isFinite(r.left) && Number.isFinite(r.top) && Number.isFinite(r.width) && Number.isFinite(r.height) && r.width > 0 && r.height > 0);', 'const out = Array.from(list);', 'liveRects stops filtering nowhere-rects'],
	['stage', 'const clearanceOf = (o?: GestureOptions) => (Number.isFinite(o?.clearance) ? Math.max(0, o?.clearance as number) : 0);', 'const clearanceOf = (o?: GestureOptions) => Math.max(0, o?.clearance ?? 0);', 'a non-finite clearance is not guarded'],
	// ── present-guide.ts
	['guide', "\tif (rects?.length && coverage < PHRASE_COVERAGE) return 'wash';", "\tif (coverage < PHRASE_COVERAGE) return 'wash';", 'wash with no ink to follow'],
	['guide', "\tif (lines > LINES_BLOCK) return 'bracket';", '\tif (false) return \'bracket\';', 'never brackets a block'],
	['guide', "\tif (box.width <= TAP_WIDTH * slideW && lines <= 1) return 'tap';", "\tif (false) return 'tap';", 'never taps a small thing'],
	['guide', "\tif (box.width <= RING_WIDTH * slideW && box.width / Math.max(1, box.height) <= RING_ASPECT) return 'circle';", "\tif (false) return 'circle';", 'never rings a compact thing'],
	['guide', '\t\tbox: geo?.box ?? t0,', '\t\tbox: t0,', 'classifies the padded box'],
	['guide', "\tconst inner = block.querySelector('.lat-focus');", '\tconst inner = null;', 'ignores an inner focused element'],
	['guide', "\tif (block.classList.contains('lat-focus') || block.closest('.lat-focus')) return { el: block, notable: true };", '\tif (false) return { el: block, notable: true };', 'misses a block that IS focused'],
	['guide', "\tif (inner && inner !== block && loose(inner.textContent ?? '').includes(loose(text))) return { el: inner, notable: true };", '\tif (inner && inner !== block) return { el: inner, notable: true };', 'aims at a focused element that does not hold the words'],
	['guide', '\twhile (end + 1 < raw.length && !/[\\s\\p{L}\\p{N}]/u.test(raw[end + 1])) end++;', '\twhile (false) end++;', 'range stops short of the full stop'],
	['guide', '\treturn s === loose(raw) ? { s, map } : null;', '\treturn { s, map };', 'trusts an unverified reconstruction'],
	['guide', "\tconst rest = occupied ? pointerAnchor(t0, frame, obstacles, half) : kind === 'circle' ? natural : null;", '\tconst rest = null;', 'never hands back a rest'],
	['guide', '\tconst rects = rectsOf(range);', '\tconst rects = null;', 'drops the sentence rects'],
	['guide', '\t\tlines: geo?.lines ?? Math.max(1, Math.floor(t0.height / lineHeightOf(el))),', '\t\tlines: 1,', 'never counts lines'],
	['guide', '\tconst inkRange = range ?? contentRange(el);', '\tconst inkRange = range;', 'no ink when the sentence did not resolve'],
	['guide', '\tfor (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > h * 0.6) lines += 1;', '\tfor (let i = 1; i < tops.length; i++) if (tops[i] !== tops[i - 1]) lines += 1;', 'counts inline fragments as lines'],
	['guide', '\t\tslideW: frame.width || 1280,', '\t\tslideW: 1280,', 'ignores the slide width'],
	['guide', '\tif (!(t0.width > 0 && t0.height > 0)) return null;', '\tif (false) return null;', 'gestures at a zero-area element'],
	['guide', '\tconst alive = () => el.isConnected;', '\tconst alive = () => true;', 'a detached element still reports a place'],
	['guide', "\t\tif (r.width > 0 && r.height > 0 && (node.textContent ?? '').trim()) obstacles.push(boxOf(r));", '\t\tvoid r;', 'the obstacle list is never populated'],
	['stage', "? rects[0] : rects[rects.length - 1]) : box;", '? rects[rects.length - 1] : rects[rects.length - 1]) : box;', 'underline rest reads the wrong line'],
	['guide', '\tconst offCard = frame.width > 0 && frame.height > 0 && !inside(footprint(natural ?? { x: 0, y: 0 }), frame);', '\tconst offCard = false;', 'a rest off the slide card is accepted'],
	['guide', '\tconst score = hits * 1e6 + dist;', '\tconst score = dist;', 'the fallback ignores obstacles'],
	['guide', '\tconst clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);', '\tconst clamp = (v: number, _lo: number, _hi: number) => v;', 'the fallback does not clamp to the slide'],
	['stage', "\t\t\t\tif (destroyed) {\n\t\t\t\t\tstopTracking();\n\t\t\t\t\tsignal?.removeEventListener('abort', onAbort);\n\t\t\t\t\tresolve();\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tif (signal?.aborted) return;", '\t\t\t\tif (destroyed || signal?.aborted) return;', 'circle never settles on teardown'],
	['stage', '\t\tif (reduced) return withInk(stopTracking, () => wait(500, signal));', '\t\tif (reduced) return wait(500, signal);', 'reduced-motion circle leaks its ink on abort'],
	['guide', '\tif (needle.length < 3 || !/[\\p{L}\\p{N}]/u.test(needle)) return null;', '\tif (false) return null;', 'a two-character needle is matched'],
	['guide', '\tconst half = POINTER_BOX / 2 / S;', '\tconst half = POINTER_BOX / 2;', 'the frame-scale conversion is dropped'],
];

const FILE = { stage: 'src/lib/vetrina/stage.ts', guide: 'src/components/studio/present-guide.ts' };
const SPEC = { stage: 'src/lib/vetrina/deictic.test.ts', guide: 'src/components/studio/present-guide.test.ts' };

const survivors = [];
const notApplied = [];
let killed = 0;
for (const [which, from, to, name] of MUTS) {
	const abs = path.join(DOCS, FILE[which]);
	const orig = fs.readFileSync(abs, 'utf8');
	if (!orig.includes(from)) {
		notApplied.push(name);
		continue;
	}
	fs.writeFileSync(abs, orig.replace(from, to));
	let failed = 0;
	try {
		const out = execFileSync('npx', ['vitest', 'run', SPEC[which], '--reporter=json'], { cwd: DOCS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
		failed = JSON.parse(out.slice(out.indexOf('{'))).numFailedTests;
	} catch (e) {
		const t = String(e.stdout ?? '');
		const i = t.indexOf('{');
		failed = i >= 0 ? (JSON.parse(t.slice(i)).numFailedTests ?? 1) : 1;
	} finally {
		fs.writeFileSync(abs, orig);
	}
	if (failed > 0) killed += 1;
	else survivors.push(name);
	process.stderr.write(`${failed > 0 ? 'KILLED ' : 'SURVIVED'}  ${name}\n`);
}
console.log(`\n${MUTS.length} mutations · ${killed} killed · ${survivors.length} survived · ${notApplied.length} did not apply`);
if (survivors.length) console.log(`SURVIVORS:\n  ${survivors.join('\n  ')}`);
if (notApplied.length) console.log(`NOT APPLIED (proves nothing):\n  ${notApplied.join('\n  ')}`);
