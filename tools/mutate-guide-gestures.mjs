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
	['guide', "\tif (role === 'phrase') return 'wash';", "\tif (false) return 'wash';", 'never washes a phrase'],
	['guide', "\tif (lines > LINES_BLOCK) return enclosed ? 'wash' : 'bracket';", "\tif (false) return 'bracket';", 'never brackets a block'],
	['guide', "\tif (lines > LINES_BLOCK) return enclosed ? 'wash' : 'bracket';", "\tif (lines > LINES_BLOCK) return 'bracket';", 'brackets a thing that already has a boundary'],
	['guide', "\tif (box.width <= TAP_WIDTH * slideW && lines <= 1) return 'tap';", "\tif (false) return 'tap';", 'never taps a small thing'],
	['guide', "\tif (box.width <= RING_WIDTH * slideW && box.width / Math.max(1, box.height) <= RING_ASPECT) return 'circle';", "\tif (false) return 'circle';", 'never rings a compact thing'],
	['guide', '\t\tbox: geo?.box ?? anchor.box,', '\t\tbox: t0,', 'classifies the padded box'],
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
	['guide', "\t\tif (!(node.textContent ?? '').trim()) continue;", '\t\tcontinue;', 'the obstacle list is never populated'],
	['guide', '\t\tconst lines = rectsOf(contentRange(node));', '\t\tconst lines = null;', 'obstacles are boxes again, not the words in them'],
	['stage', "? rects[0] : rects[rects.length - 1]) : box;", '? rects[rects.length - 1] : rects[rects.length - 1]) : box;', 'underline rest reads the wrong line'],
	['guide', '\tconst offCard = frame.width > 0 && frame.height > 0 && !inside(footprint(natural ?? { x: 0, y: 0 }), frame);', '\tconst offCard = false;', 'a rest off the slide card is accepted'],
	['guide', '\tconst score = hits * 1e6 + dist;', '\tconst score = dist;', 'the fallback ignores obstacles'],
	['guide', '\tconst clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);', '\tconst clamp = (v: number, _lo: number, _hi: number) => v;', 'the fallback does not clamp to the slide'],
	['stage', "\t\t\t\tif (destroyed) {\n\t\t\t\t\tstopTracking();\n\t\t\t\t\tsignal?.removeEventListener('abort', onAbort);\n\t\t\t\t\tresolve();\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tif (signal?.aborted) return;", '\t\t\t\tif (destroyed || signal?.aborted) return;', 'circle never settles on teardown'],
	['stage', '\t\tif (reduced) return withInk(stopTracking, () => wait(500, signal));', '\t\tif (reduced) return wait(500, signal);', 'reduced-motion circle leaks its ink on abort'],
	['guide', '\tif (needle.length < 3 || !/[\\p{L}\\p{N}]/u.test(needle)) return null;', '\tif (false) return null;', 'a two-character needle is matched'],
	['guide', '\tconst half = POINTER_BOX / 2 / S;', '\tconst half = POINTER_BOX / 2;', 'the frame-scale conversion is dropped'],

	// ── round three: the handle, the redundant-boundary rule, the piecewise matcher, the hand
	['guide', "\tif (role === 'marker') return Math.min(box.width, box.height) >= MARKER_RING * slideW ? 'circle' : 'tap';", "\tif (role === 'marker') return 'tap';", 'every marker taps, however substantial'],
	['guide', "\tif (role === 'marker') return Math.min(box.width, box.height) >= MARKER_RING * slideW ? 'circle' : 'tap';", "\tif (role === 'marker') return 'circle';", 'every marker rings, however small'],
	['guide', '\tif (!isTransparent(cs.backgroundColor)) return true;', '\tif (false) return true;', 'a filled card reads as having no boundary'],
	['guide', '\treturn !!shadow && shadow !== \'none\' && !isTransparent(shadow);', "\treturn !!shadow && shadow !== 'none';", 'a fully transparent shadow counts as a boundary'],
	['guide', "\tconst glyph = em * (MARKER_GLYPH_EM[cs.listStyleType] ?? MARKER_GLYPH_DEFAULT);", '\tconst glyph = em * MARKER_GLYPH_DEFAULT;', 'a disc bullet is measured at the width of a number'],
	['guide', '\tconst w = Math.min(gutter, glyph);', '\tconst w = gutter;', 'the marker is measured as its whole gutter'],
	['guide', "\t\t\tconst centered = Math.abs(firstLine.left + firstLine.width / 2 - (box.left + box.width / 2)) < box.width * 0.08;", '\t\t\tconst centered = false;', 'a centered rail disc is placed at the left edge'],
	['guide', '\t\tif (gapTop >= ph * 0.8) {', '\t\tif (true) {', 'a left-gutter index is placed above the text'],
	['guide', '\t\tif (gapLeft >= pw * 0.8) return { left: box.left, top: box.top + Math.max(0, (box.height - ph) / 2), width: pw, height: Math.min(ph, box.height) };\n\t\treturn null;', '\t\treturn { left: box.left, top: box.top, width: pw, height: Math.min(ph, box.height) };', 'a decorative ::before is located as a marker'],
	['guide', "\t\treturn /[\\p{L}\\p{N}]/u.test(r.toString()) ? r : null;", '\t\treturn r.toString().length >= 2 ? r : null;', 'a one-character stats value is not a header'],
	['guide', '\tif (cut <= 0) return null;', '\tif (cut < 0) return null;', 'an element whose block comes first reports a header'],
	['guide', '\tif (parts.length < 2) return null;', '\tif (parts.filter((s) => loose(s).length >= 3).length < 2) return null;', 'a joined cue with one short half is thrown away'],
	['guide', '\t\tif (hay.length > budget) break;', '\t\tif (false) break;', 'the piecewise climb walks to the slide'],
	['guide', '\t\tif (pieces.every((p) => hay.includes(p))) return node;', '\t\treturn node;', 'the climb stops before it holds the whole cue'],
	['guide', "\t\tanchor.role === 'marker' ? { x: anchor.box.left - pad, y: anchor.box.top + anchor.box.height / 2 } : gestureRest(kind, keepOut, rects?.map(boxOf) ?? null, pad);", '\t\tgestureRest(kind, keepOut, rects?.map(boxOf) ?? null, pad);', 'a marker rests on the words it labels'],
	['stage', "\t\tconst rest = restOf('underline', opts, r0, [l0], pad);", "\t\tconst rest = gestureRest('underline', r0, [l0], pad) as { x: number; y: number };", 'the stroke ignores the rest the host gave it'],
	['stage', "\t\tconst rest = restOf('tap', opts, r0, null, pad);", "\t\tconst rest = gestureRest('tap', r0, null, pad) as { x: number; y: number };", 'a tap ignores the rest the host gave it'],
	['stage', '\t\tconst env = Math.sin(Math.PI * u) ** 0.65;', '\t\tconst env = 1;', 'the hand does not settle at the endpoints'],
	['stage', '\tif (!(amount > 0) || !Number.isFinite(dist)) return { along: 0, across: 0 };', '\tif (!(amount > 0)) return { along: 0, across: 0 };', 'a non-finite distance emits NaN'],
	['stage', '\tconst hand = reduced ? 0 : (opts.theme?.hand ?? 1);', '\tconst hand = opts.theme?.hand ?? 1;', 'the hand survives reduced motion'],
	['stage', '\t\t\t\t\thx = 0;\n\t\t\t\t\thy = 0;\n\t\t\t\t\tpaintCursorAt();\n\t\t\t\t\tsignal?.removeEventListener', '\t\t\t\t\tsignal?.removeEventListener', 'a finished glide leaves the wobble painted'],
	['stage', '\t\t\tconst settleHand = () => {\n\t\t\t\thx = 0;\n\t\t\t\thy = 0;\n\t\t\t\tpaintCursorAt();\n\t\t\t};', '\t\t\tconst settleHand = () => {};', 'an aborted glide leaves the wobble painted'],
	['theme', '\t\thand: Number.isFinite(theme.hand) ? Math.min(2, Math.max(0, theme.hand as number)) : 1,', '\t\thand: theme.hand ?? 1,', 'a hostile hand value is not clamped'],
];

const FILE = { stage: 'src/lib/vetrina/stage.ts', guide: 'src/components/studio/present-guide.ts', theme: 'src/lib/vetrina/theme.ts' };
// A mutation is judged by EVERY suite that claims the mechanism, not one of them: the hand rides
// the same `tween` the deictic strokes do, so breaking it has to be visible to whichever suite
// names the broken property.
const SPEC = {
	stage: ['src/lib/vetrina/deictic.test.ts', 'src/lib/vetrina/hand.test.ts', 'src/lib/vetrina/motion.test.ts'],
	guide: ['src/components/studio/present-guide.test.ts'],
	theme: ['src/lib/vetrina/hand.test.ts', 'src/lib/vetrina/theme.test.ts'],
};

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
		const out = execFileSync('npx', ['vitest', 'run', ...SPEC[which], '--reporter=json'], { cwd: DOCS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
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
