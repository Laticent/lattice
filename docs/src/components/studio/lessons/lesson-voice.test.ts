// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { KOKORO } from '../../../../../lib/export/kokoro-voice.mjs';
import { lineKey } from '../../../../../tools/lib/lesson-voice-key.mjs';
import { clipNarrator, type VoiceManifest } from './lesson-voice';
import { LESSON_LINES, SHARED_LINES, SHARED_VOICE_DIR } from './lines';

// Lessons speak from recorded clips (2026-10-05-studio-lessons.md §Voice). These pin the two
// promises that make that safe: every line a lesson can say has a CURRENT clip on disk — this is
// the check that fails when a line is added or reworded without re-recording — and the narrator
// plays the silent caption, never a wrong clip, for any line it has no clip for.

const VOICE_DIR = path.resolve(__dirname, '../../../../public/lesson-voice');
const voice = { model: KOKORO.model, voice: KOKORO.voice, dtype: KOKORO.dtype, speed: KOKORO.speed };
const RECORD = 'Run: node tools/record-lesson-voice.mjs';

const folders: Record<string, readonly string[]> = { [SHARED_VOICE_DIR]: Object.values(SHARED_LINES) };
for (const [id, lines] of Object.entries(LESSON_LINES)) folders[id] = Object.values(lines);

describe('the recorded lesson voice', () => {
	for (const [dir, lines] of Object.entries(folders)) {
		it(`${dir}: every line has a current clip, and no clip is left over`, () => {
			const file = path.join(VOICE_DIR, dir, 'voice.json');
			expect(fs.existsSync(file), `${dir} has no voice.json. ${RECORD}`).toBe(true);
			const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as VoiceManifest;
			const byText = new Map(manifest.lines.map((l) => [l.text, l]));
			for (const text of lines) {
				const entry = byText.get(text);
				expect(entry, `no clip for "${text}". ${RECORD}`).toBeDefined();
				// The key hashes the text with the voice settings: a mismatch is a clip recorded for
				// other words or another voice.
				expect(entry?.key, `stale clip for "${text}". ${RECORD}`).toBe(lineKey(text, voice));
				expect(fs.existsSync(path.join(VOICE_DIR, dir, entry?.file ?? '')), `${entry?.file} is missing. ${RECORD}`).toBe(true);
			}
			const used = new Set(lines.map((t) => byText.get(t)?.file));
			const extra = fs.readdirSync(path.join(VOICE_DIR, dir)).filter((f) => f.endsWith('.mp3') && !used.has(f));
			expect(extra, `orphaned clips. ${RECORD}`).toEqual([]);
		});
	}

	it('no folder is left over from a lesson that is gone', () => {
		const dirs = fs.readdirSync(VOICE_DIR).filter((d) => fs.statSync(path.join(VOICE_DIR, d)).isDirectory());
		expect(dirs.filter((d) => !(d in folders)), RECORD).toEqual([]);
	});

	it('every track says only lines from lines.ts, so no line can miss its clip', () => {
		// Every lesson script in this folder (the catalog, the kit, the voice, the lines and the tests
		// are not tracks). A line must be a member of a lines.ts table: `say: X.key`. A quoted string,
		// a local variable or a conditional is a line the recorder cannot see.
		const notTracks = new Set(['catalog.ts', 'lesson-kit.ts', 'lesson-voice.ts', 'lines.ts']);
		const tracks = fs.readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !notTracks.has(f));
		expect(tracks.length).toBeGreaterThan(0);
		for (const f of tracks) {
			const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
			const bad = [...src.matchAll(/\b(say|missing)\s*[:,}]\s*([^,}\n]*)/g)].map((m) => m[0]).filter((m) => !/^(say|missing):\s*[A-Za-z_]\w*\.\w+\s*$/.test(m.trim()));
			expect(bad, `${f} says a line that is not in lines.ts`).toEqual([]);
		}
	});
});

/** A fetch over an in-memory folder, counting what was asked for. */
function fakeFetch(files: Record<string, unknown>) {
	const asked: string[] = [];
	const get = vi.fn(async (url: string) => {
		asked.push(url);
		const body = files[url];
		return {
			ok: body !== undefined,
			json: async () => body,
			arrayBuffer: async () => new ArrayBuffer(8),
		};
	});
	return { get, asked };
}

const TRACK = { durationMs: 1000, cues: [{ startMs: 0, endMs: 1000, words: [{ display: 'Click', spoken: 'Click', startMs: 0, endMs: 400 }, { display: 'PDF.', spoken: 'PDF.', startMs: 400, endMs: 1000 }] }] };

describe('clipNarrator', () => {
	const manifest = { voice: {}, bytes: 8, lines: [{ key: 'k', text: 'Click PDF.', file: 'k.mp3', bytes: 8, speechMs: 1000, leadMs: 46, track: TRACK }] };

	it('loads a folder, prefetches its clips, and plans a recorded line from its clip-timed track', async () => {
		const { get, asked } = fakeFetch({ '/v/a/voice.json': manifest });
		const n = clipNarrator({ base: '/v', fetch: get });
		await n.load('a');
		expect(asked).toEqual(['/v/a/voice.json', '/v/a/k.mp3']);
		expect(n.plan?.('Click PDF.')).toEqual(TRACK);
		n.dispose?.();
	});

	it('plans an unrecorded line from the estimate, and speaks it without fetching anything', async () => {
		const { get, asked } = fakeFetch({ '/v/a/voice.json': manifest });
		const n = clipNarrator({ base: '/v', fetch: get, audio: undefined });
		await n.load('a');
		asked.length = 0;
		const plan = n.plan?.('Something else entirely.');
		expect(plan?.durationMs).toBeGreaterThan(0);
		const ac = new AbortController();
		const h = n.speak('Something else entirely.', { signal: ac.signal });
		ac.abort();
		await h.done;
		expect(asked).toEqual([]);
		n.dispose?.();
	});

	it('a folder that fails to load leaves its lines silent and can be retried', async () => {
		const { get, asked } = fakeFetch({});
		const n = clipNarrator({ base: '/v', fetch: get });
		await expect(n.load('gone')).resolves.toBeUndefined();
		expect(n.plan?.('Click PDF.')?.cues[0].words[0].startMs).toBe(0);
		await n.load('gone');
		expect(asked.filter((u) => u.endsWith('voice.json'))).toHaveLength(2);
		n.dispose?.();
	});
});
