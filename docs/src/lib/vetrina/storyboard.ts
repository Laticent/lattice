// Vetrina — the STORYBOARD: the declarative data model + its interpreter. A linear
// walkthrough as data, played in the fixed order
//   say -> (point+click | drag) -> act -> type -> gesture -> settle
// so a storyboard reads top-to-bottom as intent. `storyboard()` returns a Walkthrough,
// so it composes with the primitive and the fluent builder (scene() is defined as
// storyboard(seed, this.toData()) — one interpreter, no drift).

import type { CaptionTrack } from '@laticent/ltt';
import { findCueWord, type NarrationHandle, type Narrator, SILENT_NARRATOR } from './narrate.js';
import { CAPTION_FADE_MS, resolvePacing } from './pacing.js';
import { holdUntil } from './recipes.js';
import type { RunContext, Walkthrough } from './runner.js';
import { type Gesture, isAbortError, type Target, wait } from './stage.js';

export interface Step<A> {
	say?: string;
	// POSITIONING — a step has EITHER point(+click) OR drag, never both.
	point?: Target;
	click?: boolean;
	drag?: { from: Target; to: Target };
	act?: (a: A) => void | Promise<void>;
	// Typing carries its TARGET (so it round-trips through the data model). Per-step cadence.
	type?: { target: Target; text: string; cadence?: number };
	gesture?: Gesture | { kind: Gesture; target?: Target };
	circle?: Target; // sugar for gesture: { kind: 'circle', target }
	/** Advance GATE for a NON-async / pollable readiness condition — before the confirm gesture +
	 *  settle, hold (abort-safe poll) until this returns true. The declarative "callback for when to
	 *  move on": pair with `instant` to fire an action then wait until the app is ready (a render/
	 *  animation settled, a DOM flag flipped). Throw-safe (a predicate that throws while its element
	 *  is still null = "not ready yet"). On a ~15s timeout it ADVANCES with a `console.warn` (naming
	 *  the last predicate error, if any) — never silent (the author gets a signal), never fatal (a
	 *  backgrounded tab or slow app must not self-destruct the demo). For a PROMISE-based readiness,
	 *  use an async `act` — the step already awaits it. */
	until?: () => boolean;
	/** Fixed pause AFTER the beat (ms), before the next step. Works with `instant` too. */
	settle?: number;
	/** INSTANT beat — the substance happens now with NO theater: no cursor move, no typing
	 *  animation, no gesture, no settle. Only `act` (and `type`, set at once) run; positioning
	 *  verbs are ignored. `say` still shows (narration ≠ motion), but instant beats are usually
	 *  silent — the deliberate plumbing between the taught beats. */
	instant?: boolean;
	/** TEACHING BEAT — treat the caption as a lesson, not a subtitle. After `say` shows, the
	 *  cursor dips to the narration dock (drawing the eye — the teacher underlining what they
	 *  said) and the beat DWELLS long enough to READ, timed to the caption's word count via
	 *  `readMs`, BEFORE the action runs. So the viewer understands the words first, then watches
	 *  the thing happen. Needs a `say`; ignored on `instant` beats. Pairs with a short `settle`
	 *  (the LAND — a brief digest pause on the result). */
	read?: boolean;
	/** WORD CUE — fire this beat's action on the word that names it.
	 *
	 *  `at: 'Save'` on a beat whose caption reads "Now click Save to publish" makes the click land
	 *  as the narration reaches "Save", instead of after the whole line. The cursor LEAVES EARLY
	 *  by exactly the time it needs to get there (`stage.leadMs`), because a presenter's hand is
	 *  already moving before they say the thing — arriving on the word is the point, and starting
	 *  on the word would mean arriving after it.
	 *
	 *  Needs a narrator that can see its own timeline (`Narrator.plan`) — which a Cadenza-backed
	 *  one can do from text alone, with no audio. Without one, or when the word is not in the
	 *  line, the beat runs in its normal order: nothing breaks, the moment is just not staged.
	 *
	 *  Mutually exclusive with `read` (which means "finish the line, THEN act"); setting both
	 *  warns at build and `at` wins. */
	at?: string;
}

/** Did an `act` hand back a promise? Only then is it a wait whose length a recording must keep. */
function isThenable(v: unknown): boolean {
	return !!v && typeof (v as { then?: unknown }).then === 'function';
}

/** The pre-model default settle. `pacing.settleMs()` owns this now; the constant stays as the
 *  `'legacy'` model's value and as the number the older tours were tuned against. */

/** Ask a narrator for its timeline, treating a throw as "I have no timeline". */
function planFor(narrator: Narrator, text: string): CaptionTrack | null {
	try {
		return narrator.plan?.(text) ?? null;
	} catch (e) {
		console.warn('vetrina: the narrator\'s plan() threw; the word cue is skipped for this beat.', e);
		return null;
	}
}

/** SUPERSEDED by `pacing.captionMs` (./pacing) — kept because it is exported API, and because a
 *  host that has been calling it should keep getting the same number rather than a silently
 *  different one.
 *
 *  What it got wrong: `300 + 200*words` is 200 ms/word ≈ 300 wpm for a caption a viewer has never
 *  seen, while also watching an app. The BBC's subtitle guideline is 160–180 wpm and Brysbaert's
 *  2019 meta-analysis puts UNDISTRACTED silent reading at ~238 wpm — so this budgeted a distracted
 *  reader 60% more than an undistracted one gets. Cadenza, doing the same job in the same repo,
 *  used 150 wpm; the two disagreed by 2x. `pacing.captionMs` is the reconciliation. */
export function readMs(text: string): number {
	const words = text.trim().split(/\s+/).filter(Boolean).length;
	return Math.min(4500, Math.max(1200, 300 + 200 * words));
}

/**
 * Compile a linear storyboard into a Walkthrough.
 * @param seed The typing baseline (the doc's starting text). '' for a blank canvas. For a
 *   non-empty seed, provide `TypeOps.read()` on the run so the diff tracks the live document.
 */
export function storyboard<A>(seed: string, steps: Step<A>[]): Walkthrough<A> {
	void seed; // baseline is run-scoped (ctx.type); non-empty seeds want TypeOps.read()
	// Validate ONCE at build (not on every play — a kiosk attract-loop replays forever): an
	// `instant` beat has no theater to hang a positioning/gesture verb on, so warn if one is set
	// (it would be silently dropped — a real footgun).
	for (const s of steps) {
		if (s.instant && (s.point != null || s.drag || s.click || s.gesture != null || s.circle != null)) {
			console.warn('vetrina: an `instant` beat ignores point/click/drag/gesture — remove them, or drop `instant` to perform the beat.');
		}
		if (s.at && s.read) {
			console.warn(
				`vetrina: a beat set both \`read\` (finish the line, then act) and \`at: ${JSON.stringify(s.at)}\` (act ON that word) — they are opposite rhythms. ` +
					'`at` wins WHEN the cue resolves; with no narrator, or a narrator that cannot plan, or a word the line does not contain, `read` runs instead. Pick one.',
			);
		}
		if (s.at && s.say == null) {
			console.warn(`vetrina: \`at: ${JSON.stringify(s.at)}\` needs a \`say\` to find the word in — the cue is ignored.`);
		}
	}
	return async (ctx: RunContext<A>) => {
		const { stage, actions, signal } = ctx;
		// Defensive, the same way this interpreter already treats `stage.progress?.` and
		// `stage.emphasizeCaption?.`: a `RunContext` assembled by hand — every fake-stage test in
		// this folder, and any host driving a Walkthrough without `run()` — predates these two
		// fields and must keep working. `run()` always supplies both.
		const narrator = ctx.narrator ?? SILENT_NARRATOR;
		const pacing = ctx.pacing ?? resolvePacing();
		// THE RECORDER (LTT step 4), when the host asked for one. It sees three things: the stage the
		// run plays on, each line as it starts speaking, and each beat that waited. Everything it
		// writes is derived from those, so a run without one is byte-for-byte the run it was.
		const recorder = ctx.recorder;
		recorder?.begin(stage);

		// Progress counts TAUGHT beats only — the `instant` plumbing beats (setup / close / jump)
		// teach nothing and flash by, so counting them would make the ring lurch on beats the
		// viewer never sees. The denominator is the taught-beat total; the ring holds across instant
		// beats. (Only the `caption:'progress'` dock renders this; every other style ignores it.)
		const taughtTotal = steps.reduce((n, s) => n + (s.instant ? 0 : 1), 0);
		let taughtDone = 0;
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];
			if (signal.aborted) return;
			if (!step.instant) stage.progress?.(++taughtDone, taughtTotal);
			// A beat OWNS its caption. `captionDown` is what the `finally` reads to decide whether the
			// caption it put up is still standing, so that no exit from this block — a throw, an abort,
			// an `instant` beat's `continue` — can leave one behind.
			let captionDown = false;
			let saidAt = 0;

			// `transient` is "this beat put a caption up and the caption style removes itself"; it is
			// what the `finally` cleans up. `stepsAside` is the narrower "and it comes down DURING the
			// beat, to get out of the action's way" — which an `instant` beat has no room for and a
			// cued beat must not do, because there the words are the event being timed to.
			const transient = step.say != null && step.say !== '' && !!stage.captionStepsAside?.();

			try {
				// THE WORD CUE, resolved BEFORE anything starts. `plan()` is the narrator's own
				// timeline, so this asks "when will you say 'Publish'?" and gets an answer in
				// milliseconds; `stage.leadMs` answers the matching question on the other side — "how
				// long would the cursor need to get there?".
				//
				// ALIGNING THE TWO IS THE WHOLE TRICK, AND IT GOES BOTH WAYS. The obvious version only
				// delays the ACTION until the word is `lead` ms away — and it silently never fires,
				// because the interesting words come early in a line ("Now click Publish…" says it at
				// ~410 ms) while a cursor crossing an app needs ~900 ms to arrive. Measured on the
				// prototype: every cue resolved to a zero wait, i.e. to no cue at all.
				//
				// So whichever side is behind waits. If the hand needs longer than the word, the LINE
				// starts late; if the word is further off than the trip, the ACTION starts late.
				// Exactly one of these is non-zero, and either way the cursor lands on the word.
				// `plan()` is third-party code (the port is implementable by any host), so it is guarded
				// the same way `speak()` is. The README promises the cue degrades to the beat's normal
				// order when it cannot be resolved; a throw that took the run down would make that
				// false in the one case most likely to hit it.
				const cuePlan = step.at && step.say != null && step.say !== '' && !step.instant ? findCueWord(planFor(narrator, step.say), step.at) : null;
				const cueLead = cuePlan && step.point != null ? (stage.leadMs?.(step.point) ?? 0) : 0;
				const lineDelay = cuePlan ? Math.max(0, cueLead - cuePlan.startMs) : 0;
				const actionDelay = cuePlan ? Math.max(0, cuePlan.startMs - cueLead) : 0;


				// A TRANSIENT CAPTION HAS ITS OWN LIFE CYCLE, and under `caption:'cursor'` that is the
				// rhythm: the cursor moves (which is what brings the eye), it arrives, the caption
				// appears beside it, it is held for as long as an average reader needs, and then it
				// takes itself down. The caption exists when there is something to say and at no other
				// time — it is not chrome waiting to be replaced.
				//
				// A cued beat (`at`) is exempt: the words ARE the event there, so the line runs from
				// the top and the caption is not dismissed under it.
				const stepsAside = transient && !step.instant && !cuePlan;

				// THE READING WINDOW. `captionMs` is NOT multiplied by `stage.pace`, and that is the
				// whole of a bug worth naming: the speed preset is already inside it, as the wpm the
				// rate table is indexed by. Multiplying again applied the preset twice — `slow` dwelled
				// 6720ms where the model says 4800 (86 effective wpm), `fast` came out at 243 wpm,
				// above the undistracted silent-reading rate the model is explicitly meant to sit
				// below, and the documented 1.0–6.0s clamp bounded neither end. Every other duration in
				// ./pacing IS speed-independent and IS multiplied at its call site; this one is the
				// exception because its rate table is the thing Cadenza's parity test pins.
				//
				// And a caption that is about to be ERASED is budgeted by `dwellMs`, not `captionMs`. Those
				// are the same number under `'grounded'` and differ by 43% under the DEFAULT `'legacy'`,
				// whose 300 wpm ./pacing documents as wrong by a factor. An edge dock survives the wrong
				// number because the words stay up; a transient caption erases itself on it. Shipping
				// `caption:'cursor'` and nothing else is the pairing a host reaches by setting one option,
				// so it is the one that had to be right.
				const readingMs = step.say ? (stepsAside ? pacing.dwellMs(step.say) : pacing.captionMs(step.say)) : 0;
				// WHERE the caption appears is "wherever the cursor comes to rest", so WHEN it appears
				// is after the beat's last travel. A beat that points somewhere says its line on
				// arrival; a beat whose only movement is a deictic stroke says it once the stroke is
				// drawn; a beat that does not move at all says it immediately.
				const travels = step.point != null || step.drag != null;
				// A gesture is the say-point only when it is the beat's ONLY doing. Treating it as one
				// whenever it was present sent the caption to the END of two common shapes: a
				// `say`+`type`+`gesture` beat TYPED before it said the line explaining the typing, and a
				// `say`+`until`+`gesture` beat held the advance gate — up to ~15s — with no caption on
				// screen at all, then spoke after the confirm. It also meant a beat whose `act` threw
				// never showed its caption, because the throw leaves the beat before the gesture block:
				// the tour stopped on an empty caption where it used to say what it had been trying.
				const gestureOnly = (step.gesture != null || step.circle != null) && step.act == null && step.type == null && step.until == null && !step.click;
				const sayAt: 'top' | 'arrival' | 'gesture' = !stepsAside ? 'top' : travels ? 'arrival' : gestureOnly ? 'gesture' : 'top';

				// A holder rather than a bare `let`: the assignment happens inside `sayLine`, and control
				// flow analysis cannot see across that call, so a plain binding narrows to `null` at the
				// tail and the await below stops type-checking.
				const line: { done: Promise<void> | null } = { done: null };
				/**
				 * Show the line, hold it, take it down.
				 *
				 * NARRATION runs UNDER the beat, not before it — the caption and the voice are one
				 * event, so the line starts here rather than at the top. With no narrator wired,
				 * `SILENT_NARRATOR.speak` resolves immediately and every branch below collapses to
				 * exactly what this interpreter did before narration existed.
				 */
				const sayLine = async (): Promise<void> => {
					if (step.say == null) return;
					stage.say(step.say);
					saidAt = Date.now();
					if (step.say !== '' && !step.instant) {
						// `done` must never REJECT. The run's own abort plumbing tears a taken-over tour
						// down; a second AbortError surfacing from whichever beat happened to be mid-
						// sentence would be a redundant failure path, and an unawaited one is an
						// unhandled rejection in the host's console.
						const done = (async () => {
							if (lineDelay > 0) await wait(lineDelay, signal);
							if (recorder) {
								const say = step.say as string;
								recorder.line(i, say, planFor(narrator, say), cuePlan, step.click ? 'click' : step.point != null ? 'point' : 'act', typeof step.point === 'string' ? step.point : undefined);
							}
							const handle: NarrationHandle = narrator.speak(step.say as string, { signal });
							await handle.done;
							// An aborted line resolves early; its length is not a measurement.
							if (!signal.aborted) recorder?.spoken(i);
						})().catch(() => {});
						line.done = done;
					}
					// TEACHING BEAT (read) — draw the eye to the caption (the words glow-pulse; on an
					// edge dock the cursor also dips to it) before the dwell. `?.` keeps fake-stage
					// test stubs safe.
					if (step.read && !cuePlan && !step.instant) await stage.emphasizeCaption?.(signal);
					// The DWELL. A `read` beat asks for it explicitly; a transient caption needs it
					// unconditionally, because it is about to remove itself and an unread caption that
					// removes itself was never a caption. Everything else keeps today's rhythm, where
					// the caption simply stays up and the beat moves on.
					// HOLD IT FOR ITS OWN DWELL. Without this the reading window depends on `performDepth`
					// happening to be zero — which for a DRAG beat it is not: the drag holds the count from
					// lift to drop, and the caption was legible only as a side effect of `say()` re-zeroing
					// it, a line whose own comment calls that a cosmetic slip. Anything that "fixed" the
					// slip would have spent every drag beat's whole budget on a hidden bubble.
					if (stepsAside) stage.holdCaption?.(true);
					if ((step.read || stepsAside) && !cuePlan && !step.instant) {
						// The LONGER of the two, always. The narrator's duration is a measurement and
						// beats an estimate — but it measures how long the line takes to SAY, and a
						// viewer reading the caption because they cannot hear it needs it on screen long
						// enough to READ. Taking the max serves both, and it is what makes the
						// no-narrator case free: SILENT_NARRATOR resolves instantly, so the estimate is
						// simply what is left.
						await Promise.all([line.done, wait(readingMs, signal)]);
						if (stepsAside) {
							stage.dismissCaption?.();
							captionDown = true;
							stage.holdCaption?.(false);
							// Let it finish going. Dismissing and acting in the same frame fires the action
							// while the words are still fading — measured at ~18% opacity under the click
							// burst. `still` collapses content cadence, so it snaps and there is no fade.
							if (!stage.still) await wait(CAPTION_FADE_MS, signal);
						}
					}
				};

				// A CUED BEAT PINS ITS CAPTION. `at` means the action is timed to a word in the line, so
				// the line is what the viewer is following — and with no voice, the caption IS the line.
				// Letting the step-aside hide it takes the instruction away at the exact moment it is
				// being carried out; the contact sheet showed the click landing a full second before
				// "Now click Publish…" came back. A voiced run already holds it for the same reason.
				if (cuePlan) stage.holdCaption?.(true);

				if (sayAt === 'top') await sayLine();

				// The action's half of the alignment. Zero whenever the line is the one waiting.
				if (actionDelay > 0) await wait(actionDelay, signal);

				// INSTANT beat — skip ALL theater (cursor / typing animation / gesture / settle) and
				// just apply the substance. Positioning + gesture verbs are ignored; `type` is set at
				// once. `say` (above) still shows. The escape hatch for setup / close / jump beats that
				// don't need teaching — and it keeps the trust invariant (act is still awaited).
				if (step.instant) {
					let actErr: unknown = null;
					let actWaited = false;
					if (step.act) {
						try {
							const ret = step.act(actions);
							actWaited = isThenable(ret);
							await ret;
						} catch (e) {
							if (isAbortError(e)) throw e;
							actErr = e;
						}
					}
					if (!actErr && step.type) await ctx.type(step.type.target, step.type.text, { cadence: step.type.cadence, instant: true });
					if (actErr) throw actErr;
					if (step.until) await holdUntil(ctx, step.until);
					if (step.until || actWaited) recorder?.waited(i, step.until ? 'until' : 'act');
					await wait((step.settle ?? 0) * stage.pace, signal);
					continue;
				}

				// Positioning: point(+click) XOR drag. A drag LIFTS now; its drop is gated on `act`.
				let drag: Awaited<ReturnType<typeof stage.drag>> | null = null;
				if (step.drag) {
					drag = await stage.drag(step.drag.from, step.drag.to, signal);
					if (sayAt === 'arrival') await sayLine();
				} else if (step.point != null) {
					await stage.point(step.point, signal);
					// The caption lands HERE — after the travel that brought the eye over, before the
					// click it is explaining. Saying it first put the words beside a cursor that was
					// still standing wherever the last beat left it.
					if (sayAt === 'arrival') await sayLine();
					if (step.click) await stage.press(signal);
				}

				// act (awaited). Success gates the drag drop + the outcome gesture; a rejected act
				// snaps the drag back (the honest "it didn't happen") and re-throws -> onStop('error').
				let actErr: unknown = null;
				let actWaited = false;
				if (step.act) {
					try {
						const ret = step.act(actions);
						actWaited = isThenable(ret);
						await ret;
					} catch (e) {
						if (isAbortError(e)) throw e;
						actErr = e;
					}
				}
				if (drag) {
					if (actErr) await drag.snapBack(signal);
					else await drag.drop(signal);
				}
				if (actErr) throw actErr; // the theater already told the truth; now surface the failure

				// type (run-scoped baseline via ctx.type — shared across composed segments).
				if (step.type) {
					await ctx.type(step.type.target, step.type.text, { cadence: step.type.cadence });
				}

				// Advance gate — wait for the app to be ready BEFORE the confirm gesture, so a "look what
				// rendered" gesture can't play before the thing it confirms exists.
				if (step.until) await holdUntil(ctx, step.until);
				// A beat that WAITED — on a condition, or on a promise its `act` returned — is where a
				// recording's next stretch begins, because that wait's length is known only now.
				if (step.until || actWaited) recorder?.waited(i, step.until ? 'until' : 'act');

				// gesture — the outcome/confirm, AFTER act (reached only on success: a failed act threw).
				if (step.gesture != null) {
					const g = typeof step.gesture === 'string' ? { kind: step.gesture, target: undefined as Target | undefined } : step.gesture;
					await stage.gesture(g.kind, g.target, signal);
				}
				if (step.circle != null) await stage.gesture('circle', step.circle, signal);
				// A beat whose only movement is a deictic stroke names the thing first and speaks
				// second — the stroke is the gesture that brings the eye, and the caption follows it.
				if (sayAt === 'gesture') await sayLine();

				// Let the line finish before the beat does. Without this the next beat's `say` would
				// cut this one off mid-sentence — the caption swapping under a voice that is still
				// speaking the previous one.
				if (line.done) await line.done;

				// A TRANSIENT CAPTION THAT DID NOT STEP ASIDE STILL COMES DOWN — after it has been read.
				// A cued (`at`) beat pins its caption deliberately, because the action is timed to a word
				// in it; that is a reason not to hide it UNDER the action, not a reason to leave it up
				// forever. The pin has already spent the beat's own duration, so only the REMAINDER of the
				// reading window is owed — often zero, which is why this is a floor and not an addition.
				// (An `instant` beat reaches the `finally` instead: `instant` means no dwell, so its line
				// lives exactly as long as the beat's substance takes and no longer.)
				if (transient && !captionDown) {
					const owed = Math.max(0, readingMs - (Date.now() - saidAt));
					if (owed > 0) await wait(owed, signal);
					stage.dismissCaption?.();
					captionDown = true;
					if (!stage.still) await wait(CAPTION_FADE_MS, signal);
				}

				// Reading time: only 'still' shortens the default settle. 'legible' (reduced-motion
				// device) keeps the FULL settle — a viewer who wants less motion needs MORE time to
				// read, not less, so rushing here would invert the intent.
				await wait((step.settle ?? (stage.still ? 300 : pacing.settleMs())) * stage.pace, signal);
			} finally {
				// THE BEAT CLEANS UP AFTER ITSELF, on every exit. This was a top-of-next-iteration release
				// with a comment claiming "there is no path that leaves the caption pinned" — there were
				// two. A throwing `act` that a host swallows (`retry()` and `loop()` in ./recipes both
				// catch) left `captionHeld` true, so the caption never stepped aside again for the rest of
				// the run; and a trailing beat left it pinned for whatever raw primitives followed the
				// segment. A `finally` cannot have either.
				stage.holdCaption?.(false);
				// A TRANSIENT CAPTION IS NEVER INHERITED. `stepsAside` takes its own caption down inside
				// the beat; the two shapes it excludes did not take theirs down at all. An `instant` beat
				// left its line standing, and the balloon then re-anchored itself beside the cursor on
				// every later beat that had no `say` of its own. A cued (`at`) beat did the same. Both
				// contradict the one property the style is sold on — "it appears when there is something
				// to say, and not otherwise" — and both were invisible inside `run()`, because `destroy()`
				// swept the leftover away at the very end of the tour.
				if (transient && !captionDown) {
					stage.dismissCaption?.();
					captionDown = true;
				}
			}
		}
		// The run reached its last beat: only now is the recording whole (an abort returns above).
		recorder?.end();
		// A TRAILING cued beat has no next top to clear its hold, and a storyboard is composable —
		// it can be followed by raw primitives in the same run, which would then play with the
		// step-aside disabled. (An abort or a throwing `act` leaves by throwing and is covered by
		// teardown instead: `destroy()` no-ops every stage method.)
		stage.holdCaption?.(false);
	};
}
