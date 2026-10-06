#!/usr/bin/env node
/**
 * Record the voice of every Studio lesson: one mp3 per line, plus the line's word track.
 *
 * Lessons speak from clips recorded AHEAD of time (owner ruling 2026-10-05): one voice on every
 * device, no key, no 80 MB model download in the reader's browser, and no `speechSynthesis` (the
 * 2026-06-14 ban stands). This tool is where those clips come from. It reads every line a lesson
 * can say from docs/src/components/studio/lessons/lines.ts and writes, per lesson,
 *
 *   docs/public/lesson-voice/<lesson-id>/<key>.mp3   one clip per line
 *   docs/public/lesson-voice/<lesson-id>/voice.json  text → clip, its length, and its word track
 *
 * with lines any lesson may say (the take-over line) once under `shared/`.
 *
 * THE VOICE IS THE STUDIO'S, BY REUSE. Kokoro runs through lib/export/narrate-kokoro.mjs — the
 * loader `lattice video` already uses, with the Studio's model, voice and quantization — and the
 * clip is encoded by lib/core/narration-encode.mjs's `compressClip`, the bake's encoder (HARD RULE
 * #15). kokoro-js is optional, so the first run says how to install it.
 *
 * A LINE IS KEYED BY ITS TEXT. `<key>` hashes the text with the voice settings, so a reworded line
 * gets a new clip and its old one is deleted; the narrator looks clips up by exact text and plays
 * the silent caption for any line it cannot find, so a stale clip is never played. Re-running
 * records only the lines that changed. `lesson-voice.test.ts` fails when a line has no clip.
 *
 * THE WORD TRACK is the line's Cadenza caption track (the narrator's own estimate, at the same pace)
 * scaled to the clip's measured speech: the estimate supplies the rhythm, the clip supplies the
 * total — Cadenza's hybrid align, done once here rather than on every play. It is what lets a
 * word cue (`Step.at`) land on the clip rather than on the estimate.
 *
 * Usage:
 *   npm i --no-save kokoro-js@1.2.1        # once; the first run downloads the ~80 MB model
 *   node tools/record-lesson-voice.mjs     # record what is missing or stale, prune the rest
 *   node tools/record-lesson-voice.mjs --check   # report only; exit 1 if anything is missing,
 *                                                # stale or orphaned (no model needed)
 *   node tools/record-lesson-voice.mjs --lesson export-pdf   # one lesson (plus shared)
 *
 * Exit 0 = every line has its clip; 1 = something is missing (--check) or failed to record.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LESSON_VOICE_KBPS as KBPS, lineKey } from './lib/lesson-voice-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/public/lesson-voice');
const LINES_TS = path.join(ROOT, 'docs/src/components/studio/lessons/lines.ts');
const CADENZA = path.join(ROOT, 'docs/src/lib/cadenza/dist/index.mjs');

/** Cadenza's pace for the word track. Must match the narrator's (`lesson-voice.ts`). */
const PACE = 'moderate';
/** Silence kept after the last loud sample (plus speechOnsetMs's 10 ms pre-roll, read backwards),
 *  so a line does not end on a clipped consonant. */
const TAIL_MS = 80;
const MANIFEST = 'voice.json';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const only = args.includes('--lesson') ? args[args.indexOf('--lesson') + 1] : null;

/** Lines per folder: each lesson's own, and `shared` for the lines every lesson may say. */
async function plan() {
	const { LESSON_LINES, SHARED_LINES, SHARED_VOICE_DIR } = await import(pathToFileURL(LINES_TS).href);
	const dirs = { [SHARED_VOICE_DIR]: Object.values(SHARED_LINES) };
	for (const [id, lines] of Object.entries(LESSON_LINES)) dirs[id] = Object.values(lines);
	if (only && !(only in dirs)) throw new Error(`no lesson "${only}" in lines.ts`);
	return only ? { [SHARED_VOICE_DIR]: dirs[SHARED_VOICE_DIR], [only]: dirs[only] } : dirs;
}

function readManifest(dir) {
	try {
		return JSON.parse(fs.readFileSync(path.join(OUT, dir, MANIFEST), 'utf8'));
	} catch {
		return null;
	}
}

/** Trim the voice's own silence at both ends, keeping a short pre-roll and tail. The head is
 *  `speechOnsetMs`, the threshold the bake and Present use; the tail is the same rule read
 *  backwards, so one voice's silence is measured one way everywhere. */
function trimSilence(f32, rate, speechOnsetMs) {
	const head = Math.floor((speechOnsetMs(f32, rate, 1, 1) / 1000) * rate);
	const tail = Math.floor((speechOnsetMs(f32.slice().reverse(), rate, 1, 1) / 1000) * rate);
	const keepTail = Math.floor((TAIL_MS / 1000) * rate);
	const end = Math.min(f32.length, f32.length - tail + keepTail);
	return end > head ? f32.subarray(head, end) : f32;
}

/** Scale a Cadenza track onto a measured span, every cue and word by the same factor. */
function scaleTrack(track, spanMs) {
	const k = track.durationMs > 0 ? spanMs / track.durationMs : 1;
	const r = (n) => Math.round(n * k);
	return {
		...track,
		durationMs: r(track.durationMs),
		cues: track.cues.map((c) => ({ ...c, startMs: r(c.startMs), endMs: r(c.endMs), words: c.words.map((w) => ({ ...w, startMs: r(w.startMs), endMs: r(w.endMs) })) })),
	};
}

async function main() {
	const { KOKORO } = await import('../lib/export/kokoro-voice.mjs');
	const voice = { model: KOKORO.model, voice: KOKORO.voice, dtype: KOKORO.dtype, speed: KOKORO.speed };
	const dirs = await plan();

	// What each folder needs, what it already has, and what is left over.
	const work = [];
	const problems = [];
	for (const [dir, lines] of Object.entries(dirs)) {
		const have = new Map((readManifest(dir)?.lines ?? []).map((l) => [l.key, l]));
		const want = [...new Set(lines)].map((text) => ({ text, key: lineKey(text, voice) }));
		const keep = new Set(want.map((w) => `${w.key}.mp3`));
		for (const w of want) {
			const got = have.get(w.key);
			const ok = got && got.text === w.text && fs.existsSync(path.join(OUT, dir, got.file));
			if (!ok) {
				work.push({ dir, ...w });
				problems.push(`${dir}: no clip for "${w.text}"`);
			}
		}
		const present = fs.existsSync(path.join(OUT, dir)) ? fs.readdirSync(path.join(OUT, dir)).filter((f) => f.endsWith('.mp3')) : [];
		for (const f of present) if (!keep.has(f)) problems.push(`${dir}: orphaned clip ${f}`);
	}

	// A folder no lesson owns any more (a lesson removed or renamed). Only a full run can tell.
	const stray = only || !fs.existsSync(OUT) ? [] : fs.readdirSync(OUT).filter((d) => !(d in dirs) && fs.statSync(path.join(OUT, d)).isDirectory());
	for (const d of stray) problems.push(`${d}: folder belongs to no lesson`);

	if (CHECK) {
		for (const p of problems) console.log(`  ✗ ${p}`);
		console.log(problems.length ? `${problems.length} problem(s). Run: node tools/record-lesson-voice.mjs` : 'every lesson line has its clip.');
		process.exit(problems.length ? 1 : 0);
	}

	if (!fs.existsSync(CADENZA)) execFileSync(process.execPath, [path.join(ROOT, 'tools/build-cadenza-lib.js')], { stdio: 'inherit' });
	const { buildTrack } = await import(pathToFileURL(CADENZA).href);
	const { wavBlob, speechOnsetMs } = await import('../lib/core/speech-pcm.mjs');
	const { compressClip } = await import('../lib/core/narration-encode.mjs');

	let tts = null;
	if (work.length) {
		const { loadKokoro } = await import('../lib/export/narrate-kokoro.mjs');
		tts = await loadKokoro((m) => console.log(m));
	}

	const recorded = new Map();
	for (const [i, w] of work.entries()) {
		const a = await tts.generate(w.text, { voice: voice.voice, ...(voice.speed !== 1 ? { speed: voice.speed } : {}) });
		const pcm = trimSilence(a.audio, a.sampling_rate, speechOnsetMs);
		const mp3 = await compressClip(wavBlob(pcm, a.sampling_rate), KBPS);
		if (!mp3) throw new Error('the mp3 encoder did not load (npm i --no-save @breezystack/lamejs@1.2.7)');
		const bytes = Buffer.from(await mp3.arrayBuffer());
		const speechMs = Math.round((pcm.length / a.sampling_rate) * 1000);
		fs.mkdirSync(path.join(OUT, w.dir), { recursive: true });
		fs.writeFileSync(path.join(OUT, w.dir, `${w.key}.mp3`), bytes);
		recorded.set(`${w.dir}/${w.key}`, { bytes: bytes.length, speechMs, leadMs: Math.round(mp3.leadMs ?? 0) });
		console.log(`  ✓ [${i + 1}/${work.length}] ${w.dir}/${w.key}.mp3  ${(bytes.length / 1024).toFixed(1)} KB  ${speechMs} ms  "${w.text}"`);
	}

	// Rewrite every manifest from what is on disk now, and prune clips no line uses.
	let total = 0;
	for (const [dir, lines] of Object.entries(dirs)) {
		const old = new Map((readManifest(dir)?.lines ?? []).map((l) => [l.key, l]));
		const entries = [...new Set(lines)].map((text) => {
			const key = lineKey(text, voice);
			const fresh = recorded.get(`${dir}/${key}`);
			const prev = old.get(key);
			const speechMs = fresh?.speechMs ?? prev.speechMs;
			return {
				key,
				text,
				file: `${key}.mp3`,
				bytes: fresh?.bytes ?? prev.bytes,
				speechMs,
				leadMs: fresh?.leadMs ?? prev.leadMs,
				track: scaleTrack(buildTrack(text, { pace: PACE }), speechMs),
			};
		});
		const keep = new Set(entries.map((e) => e.file));
		for (const f of fs.readdirSync(path.join(OUT, dir))) {
			if (f.endsWith('.mp3') && !keep.has(f)) {
				fs.rmSync(path.join(OUT, dir, f));
				console.log(`  − pruned ${dir}/${f}`);
			}
		}
		const bytes = entries.reduce((n, e) => n + e.bytes, 0);
		total += bytes;
		fs.writeFileSync(path.join(OUT, dir, MANIFEST), `${JSON.stringify({ voice: { ...voice, kbps: KBPS, pace: PACE }, bytes, lines: entries }, null, '\t')}\n`);
		console.log(`  ${dir}: ${entries.length} line(s), ${(bytes / 1024).toFixed(1)} KB`);
	}
	for (const d of stray) {
		fs.rmSync(path.join(OUT, d), { recursive: true });
		console.log(`  − pruned folder ${d}/`);
	}
	console.log(`done — ${recorded.size} recorded, ${(total / 1024).toFixed(1)} KB of lesson voice in all.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => {
		console.error(String(e?.message ?? e));
		process.exit(1);
	});
}
