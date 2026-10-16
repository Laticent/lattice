// LESSON VOICE — a narrator that plays the clips recorded for each lesson line.
//
// Lessons speak from clips recorded ahead of time by tools/record-lesson-voice.mjs (owner ruling
// 2026-10-05: one voice on every device, no key, no model download, no `speechSynthesis`). This is
// the other half: Vetrina's `Narrator` port, playing those clips through Suono.
//
// A LINE IS FOUND BY ITS EXACT TEXT. Each lesson folder's `voice.json` maps text → clip. A line
// with no entry (reworded since it was recorded, or a folder that failed to load) is narrated by the
// SILENT rung: the caption still shows, the word clock still runs, and nothing stale is ever played.
// A clip that fails to fetch or decode falls silent the same way inside `voicedNarrator`, and the
// storyboard holds the caption for its full reading time either way.
//
// BUILD ONE PER PAGE, dispose on pagehide (Vetrina README §Narration). It opens an AudioContext,
// and that has to happen inside the gesture that started the lesson, so iOS lets it play.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md §Voice.

import type { CaptionTrack } from '@/lib/cadenza';
import { createStage, type Stage } from '@/lib/suono';
import { cadenzaNarrator, voicedNarrator } from '@/lib/vetrina-narration/cadenza-narrator';
import type { Narrator } from '../../../lib/vetrina/index.js';

export { SHARED_VOICE_DIR } from './lines';

/** Where the recorder writes, as served. */
export const LESSON_VOICE_BASE = '/lesson-voice';
/** Must match the recorder's PACE, or the word track and the estimate time a line differently. */
const PACE = 'moderate';

/** One line of a lesson folder's `voice.json`, as tools/record-lesson-voice.mjs writes it. */
export type VoiceLine = { key: string; text: string; file: string; bytes: number; speechMs: number; leadMs: number; track: CaptionTrack };
export type VoiceManifest = { voice: Record<string, unknown>; bytes: number; lines: VoiceLine[] };

export type ClipNarrator = Narrator & {
	/** Fetch one folder's manifest and start fetching its clips. Never rejects: a folder that
	 *  cannot load leaves its lines silent. Resolves once the manifest is read. */
	load(dir: string): Promise<void>;
	/** Re-run the iOS unlock. Call it synchronously inside a user gesture. */
	unlock(): void;
};

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

export function clipNarrator(opts: { base?: string; fetch?: Fetch; audio?: Stage } = {}): ClipNarrator {
	// The stage is ours unless the host passed one, and only ours is closed on dispose.
	const ownsAudio = opts.audio == null;
	const audio = opts.audio ?? createStage();
	const base = opts.base ?? LESSON_VOICE_BASE;
	const get: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
	const lines = new Map<string, { url: string; track: CaptionTrack }>();
	const folders = new Map<string, Promise<void>>();
	// Clip bytes by url, fetched when the folder loads so a line plays the moment its beat starts.
	const clips = new Map<string, Promise<ArrayBuffer>>();

	const fetchClip = (url: string): Promise<ArrayBuffer> => {
		let p = clips.get(url);
		if (!p) {
			p = get(url).then((r) => {
				if (!r.ok) throw new Error(`lesson voice: ${url} is missing`);
				return r.arrayBuffer();
			});
			// A failed fetch is forgotten, so a flaky network costs one silent line, not the session.
			p.catch(() => clips.delete(url));
			clips.set(url, p);
		}
		return p;
	};

	const silent = cadenzaNarrator({ pace: PACE });
	const voiced = voicedNarrator({
		pace: PACE,
		audio,
		synthesize: async (text) => {
			const line = lines.get(text);
			if (!line) throw new Error('lesson voice: no clip for this line');
			// A copy: Suono's decode detaches the buffer it is given, and a lesson replays.
			return (await fetchClip(line.url)).slice(0);
		},
	});

	return {
		voiced: true,
		unlock() {
			// Building the narrator unlocked once. A later lesson starts from a new gesture, and
			// unlocking there resumes a context iOS suspended while the tab was in the background.
			audio.unlock();
		},
		load(dir: string): Promise<void> {
			let p = folders.get(dir);
			if (!p) {
				p = get(`${base}/${dir}/voice.json`)
					.then((r) => {
						if (!r.ok) throw new Error(`lesson voice: no ${dir}/voice.json`);
						return r.json() as Promise<VoiceManifest>;
					})
					.then((m) => {
						for (const l of m.lines ?? []) {
							const url = `${base}/${dir}/${l.file}`;
							lines.set(l.text, { url, track: l.track });
							fetchClip(url).catch(() => {});
						}
					})
					.catch(() => {
						// Offline, or a deploy without this folder: the lesson runs on captions, and the next
						// lesson asks again.
						folders.delete(dir);
					});
				folders.set(dir, p);
			}
			return p;
		},
		plan(text: string): CaptionTrack | null {
			// The recorded track is timed to the clip, so a word cue lands on the clip, not on the
			// estimate. A copy, because a caller may re-time what it is given.
			const line = lines.get(text);
			return line ? structuredClone(line.track) : (silent.plan?.(text) ?? null);
		},
		speak(text, o) {
			return lines.has(text) ? voiced.speak(text, o) : silent.speak(text, o);
		},
		dispose() {
			voiced.dispose?.();
			silent.dispose?.();
			if (ownsAudio) audio.dispose?.();
			lines.clear();
			clips.clear();
			folders.clear();
		},
	};
}
