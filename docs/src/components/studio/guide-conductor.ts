import { type Gesture, type RectSource, resolveTheme } from '@/lib/vetrina/index.js';
import {
	type FocusLook,
	type FocusParts,
	focusContent,
	focusParts,
	focusUnit,
	type GuideCue,
	guideStillShown,
	isAside,
	keyIndex,
	planSlide,
	refAt,
	resolveUnit,
	type SceneRef,
	type SceneStyle,
	type SlidePlan,
	sceneOf,
	setSaid,
	wordRangeIn,
} from './present-guide';

// THE GUIDE CONDUCTOR — what the hand does on each spoken sentence, with no framework under it.
//
// This is the per-sentence half of the Guide: the plan (which moments on a slide earn a gesture),
// the rest (a sentence naming the block the hand is already on moves nothing), the hold (an aside
// keeps the hand where it is), the walk (a chart read point by point focuses each point), the
// focus (the named thing stays, the rest recedes), the ink and the pause. It lived inside
// PresentOverlay's effect, where only Present could run it. The exported player needs the SAME
// rules (engineering/decisions/2026-09-27-guide-in-the-exported-player.md), so they live here
// once and both surfaces drive them (HARD RULE #1): Present from its React effect, the player
// from its transport's cue start.
//
// ONE CONDUCTOR, STILL. Nothing here has a timer. The caller says a sentence started, and the
// hand answers; when narration stalls, the hand holds. What moves the hand is the host's stage
// (Vetrina's `createStage`), and what finds the element is the host's `aim` / `cue` pair, so this
// module never learns whether the slide sits in an iframe (Present's console) or in the same
// document (Present's Stage window, the exported player).

/**
 * The Guide's stage theme, one definition for Present and the exported player. A bare pointer layer
 * (`caption: 'none'`), no anticipation streak (a light streak across the deck on every sentence
 * reads as a scratch on the slide), and the `fast` register beat so the cursor never trails the
 * voice. `motion: 'system'` for a full-motion preset, so a reduced-motion device still lands on
 * `legible`: a preset may ask for less motion than the viewer's setting, never more.
 */
export function guideStageTheme(motion: 'full' | 'legible') {
	return resolveTheme({ accent: 'var(--accent, #2b6ef2)', caption: 'none', pointer: 'arrow', speed: 'fast', cues: { anticipate: false }, motion: motion === 'full' ? 'system' : 'legible' });
}

/** The delivery preset fields the conductor reads (`resolveDelivery` in lib/core/resolve-delivery.mjs). */
export type GuideDelivery = {
	name: string;
	budget: number;
	floor: number;
	/** `all`: every moment the Guide focuses is inked too (expressive). `none`: focus only. */
	ink: 'none' | 'all';
	/** How deep receded TEXT goes (held at 3:1, `guide-contrast.test.js`). */
	dim: number;
	/** How deep receded chart SHAPES go. */
	dimMark?: number;
	dimInner: number;
	fade: number;
	hold: 'none' | 'aside';
	wordFocus: boolean;
	strength: 'quiet' | 'notable';
};

/** The part of a Vetrina stage the conductor drives. */
export type GuideStage = {
	gesture(kind: Gesture, target: RectSource, signal: AbortSignal, opts: { strength: 'quiet' | 'notable'; clearance: number; rest: RectSource | null }): Promise<unknown>;
	setCursorVisible(on: boolean): void;
};

/** How a host finds things on its slide. `aim` is the cheap question (no layout read); `cue` is
 *  the whole decision. `prev` is the sentence before on the same slide (the continuation tier). */
export type GuideHost = {
	stage: () => GuideStage | null;
	aim: (text: string, prev?: string) => Element | null;
	cue: (text: string, prev?: string) => GuideCue | null;
	/** Told whether the current sentence is being pointed at with ink, so a host can hide the
	 *  viewer's own pointer only while a better one is up. */
	onAiming?: (aiming: boolean) => void;
	/** The cursor's keep-out, in the stage's pixels: its own footprint plus a hair. */
	clearance: number;
	/** The slide's section, for a bound sentence's scene (`sceneOf`). Absent: the text path only. */
	section?: () => Element | null;
	/** A scene's ink on known parts, in the stage's coordinates (`sceneCue`). Absent: focus only. */
	sceneCue?: (section: Element, els: readonly Element[], kind: Gesture, strength: 'quiet' | 'notable') => GuideCue | null;
};

/** A slide's binding, for the scene path: the narrator's refs over the text being read, the cue's
 *  `charOffset` into it, and the delivery's style (`express`). */
export type GuideScenePlay = { refs: readonly SceneRef[]; at: number; style: SceneStyle };

/** One beat: a sentence starting, a slide changing, or play/pause. */
export type GuideBeat = {
	slide: number;
	/** The cue index on the slide, or -1 when nothing is being said. */
	cue: number;
	/** Every cue's display text on the slide, in order. */
	texts: readonly string[];
	/** Identity of the slide's track, so a re-baked track re-plans. */
	track: unknown;
	delivering: boolean;
	delivery: GuideDelivery;
	/** The slide's binding, when its narrator bound it and its text is the one being read. */
	scene?: GuideScenePlay | null;
};

export type GuideConductor = {
	beat(b: GuideBeat): void;
	/** Take down the hand, the focus and the read-along — Guide switched off or the host going away. */
	reset(): void;
	/** A preset with no ink arrived mid-talk: the cursor goes now, not at the next slide. */
	dropInk(): void;
	/** Light the word being said inside the focused element (the read-along), or clear it. */
	readAlong(words: readonly string[] | null, k: number, delivery: GuideDelivery, captionsOn: boolean): void;
	/** The element the last gesture named. */
	aimed(): Element | null;
};

/** The focus look a delivery plays in: its depths, its crossfade and its name, which the focus CSS
 *  reads (`section[data-guide="somber"]` takes the heading ink). */
const lookOf = (d: GuideDelivery): FocusLook => ({ dim: d.dim, dimMark: d.dimMark, dimInner: d.dimInner, fade: d.fade, delivery: d.name });

/** The chart an element belongs to, if any. */
const chartOfEl = (e: Element | null): Element | null => e?.closest('.chart-body, figure.chart-frame') ?? null;

/** Is `point` (a line dot) inside `band` (that category's `.line-hit` rect)? Read off the SVG's own
 *  attributes, so it needs no layout: the dot's center lies within the band's x-range. */
function inBand(point: Element | null, band: Element): boolean {
	if (!point || !band.matches('rect.line-hit') || point.tagName.toLowerCase() !== 'circle') return false;
	const cx = Number(point.getAttribute('cx'));
	const x = Number(band.getAttribute('x'));
	const w = Number(band.getAttribute('width'));
	return Number.isFinite(cx) && Number.isFinite(x) && Number.isFinite(w) && cx >= x && cx <= x + w;
}

export function createGuideConductor(host: GuideHost): GuideConductor {
	/** The gesture in flight, aborted on every retarget. */
	let point: AbortController | null = null;
	/** Is a named thing live on the slide (focus or hand)? */
	let shown = false;
	/** Is the CURSOR up? Distinct from "shown": a focus-only moment is shown with no hand at all. */
	let hand = false;
	/** The chart the slide's last planned moment named (THE WALK). */
	let walk: { slide: number; chart: Element } | null = null;
	/** The element the last gesture named — what the rest compares on. */
	let aim: Element | null = null;
	/** What was focused at the pause, so playing again restores it. */
	let resume: { slide: number; aim: Element } | null = null;
	/** The slide's salience plan, keyed on the slide, its track and the preset. */
	let planned: { slide: number; track: unknown; delivery: string; plan: SlidePlan; charts: Set<Element> } | null = null;
	/** The undo of the focus in force. */
	let mark: (() => void) | null = null;
	/** The document the read-along last lit a word in. */
	let saidDoc: Document | null = null;
	let aiming = false;
	// THE SCENE'S STATE, per slide: the group an `enter` opened (a line's own dots stay near while
	// its other points recede deeper), the key beat's index, and the last parts focused, so a pause
	// on a held sentence comes back to them.
	let scene: { slide: number; refs: readonly SceneRef[]; key: number; group: Element[] | null; parts: FocusParts | null } | null = null;

	const setAiming = (on: boolean) => {
		if (aiming === on) return;
		aiming = on;
		host.onAiming?.(on);
	};
	const unmark = () => {
		mark?.();
		mark = null;
		setSaid(saidDoc, null);
		saidDoc = null;
	};
	/** Nothing to point at: the hand, the focus and the aim all go. */
	const hide = (stage: GuideStage) => {
		point?.abort();
		point = null;
		aim = null;
		unmark();
		stage.setCursorVisible(false);
		hand = false;
		shown = false;
		setAiming(false);
	};

	const handDown = (stage: GuideStage) => {
		point?.abort();
		point = null;
		stage.setCursorVisible(false);
		hand = false;
		setAiming(false);
	};

	/**
	 * PLAY ONE BOUND SENTENCE. The narrator named the part (`narrateChartScript`), the component's
	 * scene finds it (`sceneOf`, `resolveUnit`), and the delivery's style says what the act does:
	 * nothing here reads the words. False when the slide has no scene or the binding names a part
	 * this render does not draw, and the caller reads the words instead.
	 */
	const playScene = (stage: GuideStage, slide: number, play: GuideScenePlay, delivery: GuideDelivery): boolean => {
		const section = host.section?.() ?? null;
		const spec = sceneOf(section);
		if (!section || !spec || !play.refs.length || play.at < 0) return false;
		// A binding written for another component is not this slide's: a chart narrator that reads a
		// prose slide as a board names units a `content` slide does not have. Every component has a
		// gesture, so it is the units, not the gesture, that say the binding is the slide's.
		if (!play.refs.some((r) => r.unit && Object.hasOwn(spec.units, r.unit))) return false;
		if (!scene || scene.slide !== slide || scene.refs !== play.refs) {
			// A new slide starts bare: nothing carries across a slide change.
			if (scene && scene.slide !== slide) unmark();
			scene = { slide, refs: play.refs, key: keyIndex(play.refs, spec.key), group: null, parts: null };
		}
		const i = refAt(play.refs, play.at);
		const ref = i >= 0 ? play.refs[i] : null;
		const act = ref?.act ?? 'aside';
		const hit = ref?.unit ? resolveUnit(section, spec.units, ref) : null;
		// A binding that names a unit this render does not draw (a variant the scene does not cover
		// yet) is not the scene's to play: the caller reads the words, rather than leave the slide dark.
		if (ref?.unit && !hit) return false;
		resume = null;
		const labelled = !!(ref?.unit && spec.units[ref.unit]?.labels);
		// An unbound sentence (an aside, leftover prose) sits AFTER the last ref that starts before it,
		// so a pause and resume there still knows the key beat has passed.
		let at = i;
		if (at < 0) for (let j = 0; j < play.refs.length; j++) if ((play.refs[j]?.start ?? Infinity) <= play.at) at = j;
		const expr = play.style(act, { named: !!hit, key: i >= 0 && i === scene.key, afterKey: scene.key >= 0 && at >= scene.key && i !== scene.key, labelled });
		const look = lookOf(delivery);
		const apply = (parts: FocusParts): void => {
			unmark();
			mark = focusParts(section as HTMLElement, parts, look);
			aim = parts.unit[0] ?? null;
			shown = true;
			if (scene) scene.parts = parts;
		};
		if (expr.focus === 'reset') {
			unmark();
			aim = null;
			shown = false;
			scene.group = null;
			scene.parts = null;
		} else if ((expr.focus === 'unit' || expr.focus === 'group') && hit) {
			const unit = [...hit.unit, ...hit.labels];
			const others = [...hit.peers, ...hit.peerLabels];
			// Inside an opened group, the group's other units recede deeper than the rest: the line being
			// walked keeps its shape, and the point being read stands out on it.
			const group = expr.focus === 'unit' && scene.group ? new Set(scene.group) : null;
			apply({ unit, peers: group ? others.filter((e) => !group.has(e)) : others, inner: group ? others.filter((e) => group.has(e)) : [] });
			if (expr.focus === 'group') scene.group = hit.unit;
		} else if (expr.focus === 'hold' && !mark && scene.parts) {
			// A pause lifted the focus on a sentence that holds: bring back what it held.
			apply(scene.parts);
		}
		// THE INK and the cursor, only where the delivery asks for them.
		if (delivery.ink === 'none' || expr.cursor === 'hide') {
			handDown(stage);
			return true;
		}
		if (!expr.ink) return true; // `rest` and `keep`: the hand stays where the last act left it
		const on = expr.ink.on;
		const els: Element[] =
			on === 'figure'
				? [section.querySelector('figure.chart-frame, .chart-body, svg')].filter((e): e is Element => !!e)
				: on === 'heading'
					? [section.querySelector('h1, h2, h3')].filter((e): e is Element => !!e)
					: on === 'labels' && hit?.labels.length
						? hit.labels
						: (hit?.mark ?? []);
		// A TRACE follows a LINE: a unit with no path in it (a quadrant cell's scattered dots) is
		// bracketed instead, or the stroke would zigzag through unrelated points.
		const lined = els.some((e) => /^(path|polyline|line)$/i.test(e.tagName));
		const kind = (expr.ink.kind === 'trace' && !lined ? 'bracket' : expr.ink.kind) as Gesture;
		// A TRACE is drawn through points, so it is handed the unit's POINTS: a line's dots, a slope's
		// two ends. A unit with fewer than two keeps its shape, and the stage brackets it instead.
		const points = kind === 'trace' ? els.filter((e) => !/^(path|polyline|polygon|line)$/i.test(e.tagName)) : els;
		const cue = els.length ? (host.sceneCue?.(section, points.length >= 2 ? points : els, kind, expr.ink.strength) ?? null) : null;
		if (!cue) return true;
		point?.abort();
		const ctl = new AbortController();
		point = ctl;
		setAiming(true);
		const run = stage.gesture(cue.kind, cue.target, ctl.signal, { strength: cue.strength, clearance: host.clearance, rest: cue.rest });
		if (hand) {
			run.catch(() => {}); // an abort here is a retarget, not an error
			return true;
		}
		run.then(() => {
			if (ctl.signal.aborted || host.stage() !== stage) return;
			shown = true;
			stage.setCursorVisible(true);
			hand = true;
		}).catch(() => {});
		return true;
	};

	const beat = ({ slide, cue: activeCue, texts, track, delivering, delivery, scene: play }: GuideBeat): void => {
		const stage = host.stage();
		if (!stage) return;
		// PAUSED: the slide belongs to the pointer. The focus, the hand and the read-along lift, and
		// playing again restores the focus on the sentence being read.
		if (!delivering) {
			// Remember what was focused: the Guide gestures only on the FIRST sentence that names a
			// block, and the block's later sentences keep the focus by resting on it — so a pause on
			// the second sentence, with the focus dropped, would leave the rest of the block bare.
			if (aim && mark) resume = { slide, aim };
			hide(stage);
			return;
		}
		// A BOUND SENTENCE plays its scene in the delivery's own style; a slide the narrator did not
		// bind (prose, an authored caption) falls through to the text path below.
		if (play && playScene(stage, slide, play, delivery)) return;
		const text = activeCue >= 0 ? (texts[activeCue] ?? '') : '';
		// The sentence before, for the continuation tier: "It costs more…" stays on what the last
		// sentence named (present-guide.ts `findContinuedTarget`).
		const prev = activeCue > 0 ? texts[activeCue - 1] : undefined;
		// ASK THE CHEAP QUESTION FIRST. `aim` reads no layout; the full decision measures every
		// block on the slide. This runs once per SENTENCE and acts once per BLOCK.
		const now = text ? host.aim(text, prev) : null;
		// THE REST. Same element as the last cue → the hand stays where the last gesture left it.
		// A live focus counts as resting too: expressive's top moment focuses at once but is only
		// "shown" when its ink finishes.
		if (now && now === aim && (shown || mark)) return;
		// RESUMING: the sentence still names what was focused at the pause (or is an aside the preset
		// holds through), so that focus comes straight back — focus only, no stroke replayed.
		const back = resume;
		resume = null;
		if (back && back.slide === slide && back.aim.isConnected && (now === back.aim || (!now && text && isAside(text) && delivery.hold === 'aside'))) {
			unmark();
			mark = focusContent(back.aim, lookOf(delivery));
			aim = back.aim;
			shown = true;
			return;
		}
		// THE PLAN. Not every block earns a gesture: the preset's budget goes to the slide's
		// top-ranked moments, each on the first sentence that names it, and every other sentence
		// holds the hand still. Re-planned if this cue resolves now but did not when the plan was
		// made (a chart the runtime drew late).
		let top = false;
		if (now) {
			if (!planned || planned.slide !== slide || planned.track !== track || planned.delivery !== delivery.name || !planned.plan.aimed.has(activeCue)) {
				const plan = planSlide(texts, (t, p) => host.aim(t, p), delivery.budget, delivery.floor);
				// THE CHARTS THIS SLIDE SPENDS A MOMENT ON. A chart that earns a planned moment is walked
				// as ONE moment from its first named mark, not from the planned one: starting at the plan
				// left every earlier sentence about the chart dark (a line's series summary and first
				// point, a dumbbell's first row), which on a phone read as the chart doing nothing (owner,
				// 2026-09-27).
				const charts = new Set<Element>();
				for (const k of plan.gesture) {
					const a = host.aim(texts[k] ?? '', k > 0 ? texts[k - 1] : undefined);
					const c = chartOfEl(a);
					if (c && a?.closest('[data-mark], [data-series]')) charts.add(c);
				}
				planned = { slide, track, delivery: delivery.name, plan, charts };
			}
			top = planned.plan.top === activeCue;
			// THE WALK. A chart is read point by point, and the budget cut that walk off after its
			// first sentence. Once a planned moment on this slide was a chart mark, every later
			// sentence that lands inside the same chart focuses in turn, as that one moment.
			const inChart = chartOfEl(now);
			if (!planned.plan.gesture.has(activeCue) && inChart && ((walk && walk.slide === slide && inChart === walk.chart) || planned.charts.has(inChart))) {
				if (focusUnit(now)) {
					point?.abort();
					stage.setCursorVisible(false);
					hand = false;
					setAiming(false);
					unmark();
					mark = focusContent(now, lookOf(delivery));
					aim = now;
					shown = true;
					return;
				}
				// A line category's detail note names that category's hit band, which the focus cannot
				// isolate. When the point up is IN that category, the note is about it, so the focus
				// stays (it used to lift mid-walk). Only then: every other unfocusable aim inside a chart
				// — the chart body a sentence about the whole chart falls back to, a quadrant tint, a
				// radar sector — still lifts the focus (a broader rule held stale foci there).
				if (mark && inBand(aim, now)) return;
			}
			if (!planned.plan.gesture.has(activeCue)) {
				// The narration moved to a block the plan did not choose. A focus must not stay on the
				// last one: it would name a thing nobody is saying. The hand itself only idles.
				unmark();
				// A stroke still drawing finishes; a resting hand keeps resting; a hand whose target
				// left with the last slide hides.
				if (point && !point.signal.aborted && !shown) return;
				if (hand && guideStillShown(aim)) return;
				hide(stage);
				return;
			}
		}
		const cue = now ? host.cue(text, prev) : null;
		// THE HOLD. An ASIDE that names nothing, on a slide the hand is already resting on, keeps it
		// resting; a longer sentence that names nothing is commentary the slide does not carry, and
		// the hand leaves. `text` must be a real sentence: an empty one means narration ended or the
		// slide changed.
		if (!cue && text && isAside(text) && shown && guideStillShown(aim) && (hand || delivery.hold === 'aside')) return;
		// Ink, and the cursor with it, only where the delivery asks: expressive inks every moment it
		// focuses. A moment nothing on the slide can focus (a figure, an image) falls back to ink.
		const inks = !!cue && (delivery.ink === 'all' || !focusUnit(cue.el));
		setAiming(inks);
		if (!cue) {
			hide(stage);
			return;
		}
		point?.abort();
		const ctl = new AbortController();
		point = ctl;
		aim = cue.el;
		// THE FOCUS. The previous focus's undo runs in this same task, so the two land as one swap.
		unmark();
		mark = focusContent(cue.el, lookOf(delivery));
		const chart = cue.el.closest('.chart-body, figure.chart-frame');
		walk = chart && cue.el.closest('[data-mark], [data-series]') ? { slide, chart } : null;
		if (!inks) {
			// No ink here: the focus IS the gesture, so a hand left from an inked moment goes down.
			ctl.abort();
			stage.setCursorVisible(false);
			hand = false;
			shown = true;
			return;
		}
		// LOUDNESS: the deck's own `_focus` makes a gesture notable, and an expressive preset makes
		// the slide's top moment notable too. Never a different gesture.
		const strength: 'quiet' | 'notable' = cue.strength === 'notable' || (top && delivery.strength === 'notable') ? 'notable' : 'quiet';
		const run = stage.gesture(cue.kind, cue.target, ctl.signal, { strength, clearance: host.clearance, rest: cue.rest });
		if (hand) {
			run.catch(() => {}); // an abort here is a retarget, not an error
			return;
		}
		// COMING FROM HIDDEN: the ink draws, and the hand materializes at rest when it is done.
		run.then(() => {
			if (ctl.signal.aborted || host.stage() !== stage) return;
			shown = true;
			stage.setCursorVisible(true);
			hand = true;
		}).catch(() => {});
	};

	return {
		beat,
		reset() {
			// Exactly what Present's stage teardown cleared. The pause's `resume` and the slide's plan
			// survive it, so a pause, then a preset change that rebuilds the stage, then Play still
			// brings the focus back.
			point?.abort();
			point = null;
			shown = false;
			hand = false;
			aim = null; // the next run starts with no "last named thing" to rest on
			walk = null; // a walk belongs to the Guide run that planned it
			scene = null; // so does a scene's group and key
			unmark(); // a mark must not outlive the Guide that made it
			setAiming(false);
		},
		dropInk() {
			point?.abort();
			host.stage()?.setCursorVisible(false);
			hand = false;
			setAiming(false);
		},
		readAlong(words, k, delivery, captionsOn) {
			const el = aim;
			const doc = el?.ownerDocument ?? null;
			// Only with the captions OFF: the caption already reads along, and a second copy on the
			// slide competes with the voice (Mayer's redundancy effect).
			if (!delivery.wordFocus || captionsOn || !mark || !el || el.closest('svg') || !words || k < 0) {
				setSaid(saidDoc, null);
				return;
			}
			// A row spark lights every cell, so the words are looked for across the row.
			const scope = focusUnit(el)?.axis === 'row' ? (el.closest('tr') ?? el) : el;
			const range = wordRangeIn(scope, words, k);
			if (saidDoc && saidDoc !== doc) setSaid(saidDoc, null);
			saidDoc = doc;
			setSaid(doc, range);
		},
		aimed: () => aim,
	};
}
