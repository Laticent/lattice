// The timing functions: where in a segment a player is (`positionAt`), and where each segment
// starts on one timeline (`timeline`). engineering/ltt.md §The timing functions is the contract;
// 2026-09-24-lattice-timing-track.md §5 is why the work splits this way.
//
// `positionAt` is INLINED into the exported HTML player by serializing its source, exactly as
// `makeCursor` is, because that script is CSP-hashed and cannot import. So every reference inside
// it is local, with ONE deliberate exception: when the caller does not pass a cursor, it builds one
// with `makeCursor`. A minifier renames that module-scope reference, so an inlined copy would call
// a name that does not exist. The player therefore ALWAYS passes its own cursor, and that branch
// never runs there. test/unit/export/inlinable-kernels.test.js pins both halves, against the
// minified output too. The same idiom as `keyAction`'s keymap default (lib/export/player-core.mjs).

import { type Cursor, makeCursor } from './cursor.js';
import type { LttAction, LttSegment } from './types.js';

/** What a segment is doing at a moment. */
export type LttPhase = 'wait' | 'hold' | 'cue' | 'gap' | 'end';

/** Where in a segment a player is. */
export interface LttPosition {
	/** `wait` and `hold` come before the first cue (a stretch's recorded wait, a slide's arrival
	 *  hold); `cue` while a cue plays; `gap` in the breath after one; `end` once the segment is over. */
	phase: LttPhase;
	/** The cue playing, or whose breath is running. -1 before the first cue. */
	cueIndex: number;
	/** The word to show as spoken. It is held through every pause inside the segment and never goes
	 *  dark between words. -1 before the first cue. */
	wordIndex: number;
	/** The time on the segment's track (re-timed to measured clips where known) that this position
	 *  reads. A caption crawl or a highlight reads the track at this time. */
	trackMs: number;
	/** When each cue starts to play, in ms from the segment's start. */
	onsets: number[];
	/** How long each cue plays: its measured speech, or its estimate with the silent-cue floor. */
	played: number[];
	/** The breath after each cue: the gap to the next one, and after a slide's last cue its `tailMs`. */
	gaps: number[];
	/** How long the segment waits before its first cue: a slide's `holdMs`, a stretch's `waitedMs`. */
	waitMs: number;
	/** How long the segment plays, in ms: its wait or hold, every cue, and every breath. */
	lengthMs: number;
	/** The actions whose word has been reached, in the order the segment lists them. */
	due: LttAction[];
}

/**
 * Where in `segment` a player is, `localMs` after the segment starts.
 *
 * It lays the segment out as the transport plays it (engineering/ltt.md §The transport):
 *  - a slide first holds for `holdMs`, and a stretch for its recorded `waitedMs` (0 if none);
 *  - a cue with a clip in the audio layer plays for its measured speech: `measuredMs − leadMs`,
 *    or the track's estimate when no measurement has been recorded;
 *  - a cue with NO clip plays for its estimate, but never less than 300 ms, and 900 ms when the
 *    estimate is 0 (rule 4). Its words still run on the estimate, and the last one is held
 *    through the rest of the floor;
 *  - then the breath after the cue: the track's gap to the next cue, and after a slide's last cue,
 *    its `tailMs`. A stretch has no tail.
 *
 * `cursor` is the caller's own cursor over this segment's track, already re-timed to whatever
 * clips it has decoded (`cursor.align`). Pass it when you have one; a player must (see this file's
 * header). Without it, `positionAt` builds one and re-times each cue that has a `measuredMs`.
 *
 * The layout itself comes back too — `waitMs`, and each cue's `onsets`, `played` and `gaps` — so a
 * transport arms its timers from THIS function rather than restating the rules. The exported player
 * does: its only timing of its own is the clip's end (rule 3).
 */
export function positionAt(segment: LttSegment, localMs: number, cursor?: Cursor): LttPosition {
	const t = Number.isFinite(localMs) && localMs > 0 ? localMs : 0;
	if (segment.kind === 'hold') {
		return { phase: t < segment.holdMs ? 'hold' : 'end', cueIndex: -1, wordIndex: -1, trackMs: 0, onsets: [], played: [], gaps: [], waitMs: segment.holdMs, lengthMs: segment.holdMs, due: [] };
	}
	const lead = segment.kind === 'slide' ? segment.holdMs : segment.waitedMs || 0;
	const clips = (segment.audio?.clips) || [];
	const byCue: Record<number, { measuredMs?: number; leadMs?: number }> = {};
	for (let c = 0; c < clips.length; c++) byCue[clips[c].cue] = clips[c];
	let cur = cursor;
	if (!cur) {
		// Only reached when the caller passed no cursor — never inside the exported player.
		cur = makeCursor(segment.track);
		for (let m = 0; m < segment.track.cues.length; m++) {
			const measured = byCue[m]?.measuredMs;
			if (typeof measured === 'number' && measured > 0) {
				cur.align(m, cur.track().cues[m].startMs, Math.max(1, measured - (byCue[m].leadMs || 0)));
			}
		}
	}
	const cues = cur.track().cues;
	const n = cues.length;
	const onsets: number[] = [];
	const played: number[] = [];
	const gaps: number[] = [];
	let at = lead;
	for (let k = 0; k < n; k++) {
		const d = cues[k].endMs - cues[k].startMs;
		onsets.push(at);
		played.push(byCue[k] ? d : d === 0 ? 900 : Math.max(300, d));
		gaps.push(k < n - 1 ? Math.max(0, cues[k + 1].startMs - cues[k].endMs) : segment.kind === 'slide' ? segment.tailMs : 0);
		at += played[k] + gaps[k];
	}
	const length = at;
	const actions = segment.actions || [];
	if (t < lead || !n) {
		return { phase: !n ? 'end' : segment.kind === 'slide' ? 'hold' : 'wait', cueIndex: -1, wordIndex: -1, trackMs: n ? cues[0].startMs : 0, onsets: onsets, played: played, gaps: gaps, waitMs: lead, lengthMs: length, due: [] };
	}
	let i = 0;
	while (i < n - 1 && onsets[i + 1] <= t) i++;
	const x = t - onsets[i];
	const cue = cues[i];
	const phase: LttPhase = x < played[i] ? 'cue' : t < length ? 'gap' : 'end';
	// The crawl runs on the track: inside the cue's own span while it plays, then held at its end
	// through a silent cue's floor and the breath after it.
	const trackMs = cue.startMs + Math.min(x, cue.endMs - cue.startMs);
	// The lookup is the cursor's own, probed just inside the cue so a touching next cue cannot
	// answer for it. When it does not name a word of THIS cue, either the cue's first word has not
	// started yet (-1: nothing of this line is spoken — a producer may start a cue before its first
	// word, though Cadenza never does), or the track's final word has ended and is the one to hold.
	const hit = cur.at(Math.max(cue.startMs, Math.min(trackMs, cue.endMs - 1)));
	const word = hit && hit.cueIndex === i ? hit.wordIndex : trackMs < cue.words[0].startMs ? -1 : cue.words.length - 1;
	const due: LttAction[] = [];
	for (let a = 0; a < actions.length; a++) {
		if (actions[a].cue < i || (actions[a].cue === i && actions[a].word <= word)) due.push(actions[a]);
	}
	return { phase: phase, cueIndex: i, wordIndex: word, trackMs: trackMs, onsets: onsets, played: played, gaps: gaps, waitMs: lead, lengthMs: length, due: due };
}

/** One segment's place on a seekable file's timeline. */
export interface LttTimelineEntry {
	id: string;
	/** When the segment starts, in ms from the start of the file. */
	startMs: number;
	/** How long it plays (`positionAt`'s `lengthMs`). */
	lengthMs: number;
}

/**
 * Lay a seekable file's segments end to end. With `positionAt`, this answers "what is on screen
 * at 0:42.300": find the entry whose span holds the time, then ask `positionAt` for
 * `time − startMs` inside it.
 *
 * Throws on a file that is not seekable, because a wait of unknown length has no place on a
 * timeline, and guessing one would put every later segment at the wrong time.
 */
export function timeline(ltt: { seekable: boolean; segments: LttSegment[] }): { durationMs: number; segments: LttTimelineEntry[] } {
	if (!ltt || ltt.seekable !== true) throw new TypeError('timeline: this file is not seekable — some wait has no recorded length (engineering/ltt.md §seekable)');
	const segments: LttTimelineEntry[] = [];
	let at = 0;
	for (const seg of ltt.segments) {
		const lengthMs = positionAt(seg, 0).lengthMs;
		segments.push({ id: seg.id, startMs: at, lengthMs });
		at += lengthMs;
	}
	return { durationMs: at, segments };
}
