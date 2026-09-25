// Vetrina — the TOUR RECORDER: one run of a storyboard, written down as a seekable LTT
// (engineering/decisions/2026-09-24-lattice-timing-track.md §4.3–4.7, LTT step 4).
//
// A tour is not seekable before it runs: how long an `until` hold or an awaited `act` takes is
// unknown until it happens, and a wait of unknown length has no place on a timeline. A recording
// fills every one in. So the recorder watches a run through three storyboard hooks and writes:
//
//   - one STRETCH per run of lines between two waits. A stretch starts at its first spoken line;
//     every line in it keeps the time it actually started, so the track's cue times ARE the
//     recorded rhythm (travel, settle and gestures included, as the gaps between lines);
//   - `after` + `waitedMs` on every stretch that follows a wait: what it waited on, and how long,
//     measured from the end of the previous stretch's last line to this stretch's first;
//   - an ACTION for every word cue (`Step.at`) that resolved: `{cue, word, match}` from the
//     narrator's own plan, so `validateLtt` fails if the narration later moves under it (§4.7);
//   - `inputs.viewport`, `inputs.motion` and `inputs.stagePace`, because the cursor's lead depends
//     on all three (§4.6). A player at a different screen treats the file as a guide and
//     recomputes the lead, which is exactly what the live storyboard does anyway.
//
// It is also the first caller of `isStale` (G3): `staleStretches` hashes a storyboard as it stands
// now and asks which recorded stretches it no longer matches. Recorded waits are measured data, so
// a stale stretch is flagged and KEPT, never rebuilt from text.
//
// Time before the first spoken line (the opening flourish, a first travel) is not recorded: the
// file's timeline starts at the first word, because that is where a caption track can start.

import {
	type CaptionTrack,
	canonicalJson,
	isStale,
	type Ltt,
	type LttAction,
	type LttAfter,
	type LttHash,
	type LttInputs,
	type LttMotion,
	type LttStale,
	type LttStretchSegment,
	type LttViewport,
	segmentHashInput,
} from '@laticent/ltt';
import type { CueWord, Narrator } from './narrate.js';
import type { Stage } from './stage.js';

/** The file-wide timing inputs the HOST knows and the stage does not: the engine's content hash and
 *  Cadenza's pace, plus the deck registries a tour borrows. */
export type RecorderInputs = Omit<LttInputs, 'viewport' | 'motion' | 'stagePace' | 'deckPace'>;

/** The declarative part of a step: what a hash can see. Functions (`act`, `until`) hash as their
 *  presence, and an element target as `"<element>"`, because neither has a stable text form. */
export interface StepShape {
	say?: string;
	at?: string;
	point?: unknown;
	click?: boolean;
	drag?: unknown;
	type?: { target: unknown; text: string };
	gesture?: unknown;
	circle?: unknown;
	act?: unknown;
	until?: unknown;
	settle?: number;
	instant?: boolean;
	read?: boolean;
}

export interface TourRecorderOptions {
	/** The tour's id: what its producer uses to find it again. */
	id: string;
	inputs: RecorderInputs;
	/** SHA-256 of a string, as `sha256:` + 64 lowercase hex. The package imports no digest, so the
	 *  host brings its runtime's own (`crypto.subtle` in a browser, `node:crypto` in Node). */
	digest(text: string): Promise<LttHash>;
	/** Emphasis spans for a line — the same function the narrator was given, so the hash covers
	 *  what the timing did. */
	emphasis?(text: string): readonly unknown[] | undefined;
	/** The screen the run plays on. Default: the window's inner size when there is one. */
	viewport?: LttViewport;
	/** Injected for tests. Default `performance.now`. */
	now?(): number;
}

interface Line {
	beat: number;
	text: string;
	plan: CaptionTrack;
	at: number;
	/** When the line finished speaking, if the storyboard reported it. */
	end?: number;
	cue: CueWord | null;
	verb?: string;
	target?: string;
}

export interface TourRecorder {
	/** Storyboard hook: the run is starting on this stage. Captures the motion tier and pace. */
	begin(stage: Pick<Stage, 'still' | 'reduced' | 'pace'>): void;
	/** Storyboard hook: beat `beat` starts speaking `text` now. `plan` is the narrator's own track
	 *  for the line; `cue` the word a `Step.at` named, resolved in it. A line with no plan cannot be
	 *  placed on a track and is counted in `unplanned` instead. */
	line(beat: number, text: string, plan: CaptionTrack | null, cue?: CueWord | null, verb?: string, target?: string): void;
	/** Storyboard hook: beat `beat`'s line finished speaking now. Its words are re-timed to the
	 *  length it really took (a voice rarely matches the plan), so the track IS the recording. */
	spoken(beat: number): void;
	/** Storyboard hook: beat `beat` waited on `kind` (an `until` hold, or an awaited `act`). The next
	 *  line starts a new stretch. */
	waited(beat: number, kind: LttAfter): void;
	/** Storyboard hook: the storyboard reached its last beat. A run that aborted never calls it,
	 *  and `ltt()` refuses to write a file from one: its last line would be crushed to wherever the
	 *  abort cut it, and a later wait would be missing. */
	end(): void;
	/** Lines that could not be recorded because the narrator had no plan for them. */
	readonly unplanned: number;
	/** The recording, as a seekable LTT. `steps` is the storyboard that ran, hashed per stretch.
	 *  Rejects when the run did not finish. A wait on the LAST beat is not recorded: no stretch
	 *  follows it to carry `waitedMs`, so the timeline ends at the last line's end. */
	ltt(steps: readonly StepShape[]): Promise<Ltt>;
}

/** Map a stage's motion flags onto the LTT's tier (§4.6: a reduced-motion device lands on
 *  `legible`). */
function motionOf(stage: Pick<Stage, 'still' | 'reduced'>): LttMotion {
	return stage.still ? 'still' : stage.reduced ? 'legible' : 'full';
}

/** A value as JSON a hash can see: keys sorted at every depth (`canonicalJson`), a function as
 *  `"<fn>"` and a DOM node as `"<element>"`, because neither has a stable text form. */
function stable(v: unknown): unknown {
	if (v === undefined) return undefined;
	return JSON.parse(canonicalJson(JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'function' ? '<fn>' : x && typeof x === 'object' && 'nodeType' in x ? '<element>' : x)) ?? 'null')));
}

/** A step, reduced to what hashes stably. */
function shapeOf(step: StepShape): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of ['say', 'at', 'point', 'click', 'drag', 'type', 'gesture', 'circle', 'act', 'until', 'settle', 'instant', 'read'] as const) {
		const v = stable(step[k]);
		if (v !== undefined) out[k] = v;
	}
	return out;
}

/** The string a stretch's hash is taken over: its lines and the steps it spans, with each line's
 *  emphasis (§4.5; emphasis goes with the text, not in `inputs`). */
export function stretchHashInput(steps: readonly StepShape[], beats: readonly [number, number], inputs: LttInputs, emphasis?: (text: string) => readonly unknown[] | undefined): string {
	const span = steps.slice(beats[0], beats[1] + 1);
	const lines = span.filter((s) => !!s.say && !s.instant).map((s) => s.say as string);
	const text = JSON.stringify({ lines, steps: span.map(shapeOf) });
	return segmentHashInput(text, inputs, emphasis ? lines.map((l) => emphasis(l)) : undefined);
}

/** A plan stretched (or shrunk) to last `ms`, every time scaled alike — the recorder's version of
 *  `cursor.align`, over a whole line. */
function retimed(plan: CaptionTrack, ms: number): CaptionTrack {
	if (!plan.durationMs || ms === plan.durationMs) return plan;
	const k = ms / plan.durationMs;
	const r = (n: number) => Math.round(n * k);
	return { durationMs: ms, cues: plan.cues.map((c) => ({ ...c, startMs: r(c.startMs), endMs: r(c.endMs), words: c.words.map((w) => ({ ...w, startMs: r(w.startMs), endMs: r(w.endMs) })) })) };
}

/** A plan's cues, moved `by` ms later, with whole-ms times (the core's times are integers). */
function shifted(plan: CaptionTrack, by: number): CaptionTrack['cues'] {
	const r = (n: number) => Math.round(n + by);
	return plan.cues.map((c) => ({ ...c, startMs: r(c.startMs), endMs: r(c.endMs), words: c.words.map((w) => ({ ...w, startMs: r(w.startMs), endMs: r(w.endMs) })) }));
}

export function createTourRecorder(opts: TourRecorderOptions): TourRecorder {
	const now = opts.now ?? (() => performance.now());
	const lines: Line[] = [];
	const waits = new Map<number, LttAfter>();
	let motion: LttMotion = 'full';
	let stagePace = 1;
	let unplanned = 0;
	let finished = false;

	return {
		begin(stage) {
			motion = motionOf(stage);
			stagePace = stage.pace;
		},
		line(beat, text, plan, cue = null, verb, target) {
			if (!plan?.cues.length) {
				unplanned++;
				return;
			}
			lines.push({ beat, text, plan, at: now(), cue, verb, target });
		},
		spoken(beat) {
			for (let k = lines.length - 1; k >= 0; k--) {
				if (lines[k].beat === beat) {
					lines[k].end ??= now();
					break;
				}
			}
		},
		waited(beat, kind) {
			waits.set(beat, kind);
		},
		end() {
			finished = true;
		},
		get unplanned() {
			return unplanned;
		},
		async ltt(steps) {
			if (!finished) throw new Error('vetrina: the run did not finish, so there is nothing whole to record (an aborted line and every wait after it are missing)');
			const w = typeof window !== 'undefined' ? window : null;
			const viewport = opts.viewport ?? (w ? { w: Math.max(1, Math.round(w.innerWidth)), h: Math.max(1, Math.round(w.innerHeight)) } : { w: 1, h: 1 });
			const inputs: LttInputs = { ...opts.inputs, viewport, motion, stagePace };

			// Group lines into stretches: a new one after any beat that waited.
			const groups: { lines: Line[]; after?: LttAfter }[] = [];
			let pending: LttAfter | undefined;
			let lastBeat = -1;
			for (const line of lines) {
				for (let b = lastBeat + 1; b < line.beat; b++) if (waits.has(b)) pending = waits.get(b);
				// A wait on the line's OWN beat happens after it speaks, so it opens the NEXT stretch.
				if (!groups.length || pending) {
					groups.push({ lines: [], after: groups.length ? pending : undefined });
					pending = undefined;
				}
				groups[groups.length - 1].lines.push(line);
				if (waits.has(line.beat)) pending = waits.get(line.beat);
				lastBeat = line.beat;
			}

			const segments: LttStretchSegment[] = [];
			let prevEnd = 0;
			for (let g = 0; g < groups.length; g++) {
				const { lines: ls, after } = groups[g];
				const t0 = ls[0].at;
				const cues: CaptionTrack['cues'] = [];
				const actions: LttAction[] = [];
				let end = 0;
				for (const l of ls) {
					// A line never starts before the previous one ended: the storyboard awaits each line,
					// but a clock can jitter by a millisecond, and the core forbids overlapping cues.
					const offset = Math.max(end, Math.round(l.at - t0));
					if (l.cue) actions.push({ cue: cues.length + l.cue.cue, word: l.cue.word, match: l.cue.match, verb: l.verb ?? 'point', ...(l.target ? { target: l.target } : {}), arrive: 'on-word' });
					// The line's REAL length when it was reported, else the plan's. A silent narrator
					// takes its plan's length, so the scale is ~1; a voice rarely does.
					const took = l.end != null ? Math.max(1, Math.round(l.end - l.at)) : l.plan.durationMs;
					const plan = retimed(l.plan, took);
					cues.push(...shifted(plan, offset));
					end = offset + plan.durationMs;
				}
				const beats: [number, number] = [ls[0].beat, ls[ls.length - 1].beat];
				// Stretches tile the beats: a stretch spans up to the beat before the next one's first.
				if (g + 1 < groups.length) beats[1] = Math.max(beats[1], groups[g + 1].lines[0].beat - 1);
				else beats[1] = Math.max(beats[1], steps.length - 1);
				if (g === 0) beats[0] = 0;
				const seg: LttStretchSegment = {
					id: `s${g}`,
					kind: 'stretch',
					at: { beats },
					...(after ? { after, waitedMs: Math.max(0, Math.round(t0 - prevEnd)) } : {}),
					hash: await opts.digest(stretchHashInput(steps, beats, inputs, opts.emphasis)),
					// MEASURED, always: the rhythm between lines and every line's length were recorded, not
					// computed, so a reader must never rebuild this stretch from text (isStale's `keep`).
					basis: 'measured',
					track: { cues, durationMs: end },
					...(actions.length ? { actions } : {}),
				};
				segments.push(seg);
				prevEnd = t0 + end;
			}
			return { format: 'ltt', version: '1.0', source: { kind: 'tour', id: opts.id }, inputs, seekable: true, segments };
		},
	};
}

/**
 * Which recorded stretches the storyboard, as it stands NOW, no longer matches. The recorder's side
 * of guardrail G3: each stretch is re-hashed from `steps` over the beats it recorded, and `isStale`
 * compares. Every recorded stretch is `basis: 'measured'`, so a stale one comes back `keep: true`:
 * flag it and re-record it; do not rebuild it from text. `inputs` is the host's CURRENT set, so an
 * engine or pace change flags every stretch.
 */
export async function staleStretches(
	ltt: Ltt,
	steps: readonly StepShape[],
	inputs: RecorderInputs,
	digest: (text: string) => Promise<LttHash>,
	emphasis?: (text: string) => readonly unknown[] | undefined,
): Promise<LttStale[]> {
	// The HOST's inputs as they stand now (a new engine hash, another pace), with the screen the run
	// was recorded on: a different screen makes the recording a guide, not stale (§4.6).
	const now: LttInputs = { ...inputs, viewport: ltt.inputs.viewport, motion: ltt.inputs.motion, stagePace: ltt.inputs.stagePace };
	const current: Record<string, LttHash> = {};
	for (const seg of ltt.segments) {
		if (seg.kind !== 'stretch') continue;
		const [a, b] = seg.at.beats;
		if (b >= steps.length) continue; // the storyboard lost these beats: the stretch is gone
		current[seg.id] = await digest(stretchHashInput(steps, [a, b], now, emphasis));
	}
	return isStale(ltt, current);
}

/** Whitespace folded, so a line and the cues it became compare equal. */
const fold = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The recorded track for one line: the run of consecutive cues whose displays, joined, are the
 *  line, re-based to start at 0; `occurrence` picks the n-th time the recording said it. Null when
 *  the recording never spoke it (that often).
 *
 *  KNOWN LIMIT: the LTT keeps cue boundaries, not line boundaries, so a line that equals the TAIL
 *  of an earlier multi-sentence line ("Save." after "Open it. Save.") matches inside it. Such a
 *  line counts that earlier match as an occurrence, so replay stays in order, but reads its timing
 *  from inside the longer line. */
export function recordedLine(ltt: Ltt, text: string, occurrence = 0): CaptionTrack | null {
	const want = fold(text);
	if (!want) return null;
	let seen = 0;
	for (const seg of ltt.segments) {
		if (seg.kind !== 'stretch') continue;
		const cues = seg.track.cues;
		for (let a = 0; a < cues.length; a++) {
			let joined = '';
			for (let b = a; b < cues.length; b++) {
				joined = fold(joined ? `${joined} ${cues[b].display}` : cues[b].display);
				if (joined === want && seen++ < occurrence) break;
				if (joined === want) {
					const base = cues[a].startMs;
					const run = cues.slice(a, b + 1).map((c) => ({ ...c, startMs: c.startMs - base, endMs: c.endMs - base, words: c.words.map((w) => ({ ...w, startMs: w.startMs - base, endMs: w.endMs - base })) }));
					return { cues: run, durationMs: run[run.length - 1].endMs };
				}
				if (joined.length >= want.length) break;
			}
		}
	}
	return null;
}

/**
 * Replay a recorded tour from its LTT: the same narrator, planning every line from the RECORDING.
 *
 * A word cue then lands on the word where it was recorded. The cursor's lead is still asked of the
 * live stage (`stage.leadMs`), so at the recorded viewport the hand leaves when it left, and at any
 * other it recomputes how long the trip takes — the recording is a guide there, not a timeline
 * (§4.6). A line the recording never spoke falls back to the narrator's own plan.
 */
export function replayNarrator(ltt: Ltt, inner: Narrator): Narrator {
	// Which time each line is being said. `plan` is asked BEFORE `speak` for the same beat, so the
	// count of lines already spoken is the occurrence to plan: a line said twice replays each time
	// with its own recorded timing.
	const said = new Map<string, number>();
	return {
		voiced: inner.voiced,
		speak(text, opts) {
			said.set(fold(text), (said.get(fold(text)) ?? 0) + 1);
			return inner.speak(text, opts);
		},
		...(inner.dispose ? { dispose: inner.dispose.bind(inner) } : {}),
		plan(text: string) {
			return recordedLine(ltt, text, said.get(fold(text)) ?? 0) ?? inner.plan?.(text) ?? null;
		},
	};
}
