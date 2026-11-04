/**
 * The MEASURED split in a browser (engineering/decisions/2026-10-28-fit-everywhere-model.md §16):
 * the same measure, plan and verify loop the CLI runs (`lattice.js`, `--fit-pack` / `fit: pack`),
 * for the Studio's slide preview, the Playground and the Studio's webpage export (HARD RULE #1).
 *
 * The host renders as it always does and hands over the unsplit document string. This module
 * writes it into a hidden, same-origin frame built exactly as the host's own frame (`buildDoc`),
 * waits for fonts and charts to settle, measures every slide with the shared `measureFit`, plans
 * with the shared kernel (`measuredSplit`, the §11 memory included), splits through the engine's
 * `splitForPreview` with that plan, and verifies the split in the same frame. Every decision is
 * `lib/core/fit-measure.js`'s; this module only owns the frame.
 *
 * Loaded on demand, only for a deck that asks for the measured split: the Studio's and the
 * Playground's eager bundles are budgeted (docs/route-budget.json).
 */
import { pack } from '@laticent/fluido';
import fitMeasure from '../../../lib/core/fit-measure.js';
import frontMatterKey from '../../../lib/core/front-matter-key.js';

const { frontMatterName } = frontMatterKey;

/**
 * Does a deck ask for the measured split? `fit: pack` in its front matter, read with the engine's
 * own reader (`frontMatterName`), the one the CLI's `fitPacks` calls, so case, indentation, quoting,
 * comments and a repeated key resolve alike on every surface (HARD RULE #1).
 */
export function measuredSplitWanted(source: string): boolean {
	const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!fm) return false;
	const fit = frontMatterName(fm[1], 'fit') as string | null;
	return typeof fit === 'string' && fit.trim().toLowerCase() === 'pack';
}

/** What a live surface remembers between renders of one slide or deck (`nextMemory`). */
export type FitMemory = Record<string, { split: boolean; sizes?: number[] }>;

export interface SplitResult {
	html: string;
	changed: number;
	planned?: string[];
	applies?: boolean;
}

export interface MeasuredSplitInput {
	/** The render's unsplit document string. */
	html: string;
	/** Split `html` with a plan (`null`: today's split; `'whole'`: stamp every slide, split none). The engine's `splitForPreview`, bound. */
	split: (html: string, plan: Record<string, unknown> | 'whole' | null) => SplitResult;
	/** The full frame document for a document string, built as the host builds its own frame. */
	buildDoc: (html: string) => string;
	/** The engine's fit verdict config (`window.LatticePlayground.fitVerdictConfig()`): the CLI's probes, selectors and tolerance. */
	verdictConfig: unknown;
	/** The slide box, for the hidden frame's viewport. */
	width: number;
	height: number;
	/** The packer (`knuth-plass` by default, the bake-off's pick). */
	packer?: 'greedy' | 'balanced' | 'knuth-plass';
	/** What the last render decided (§11). */
	memory?: FitMemory | null;
	/** How long one frame may take to load and settle; past it the split is not measured. */
	settleMs?: number;
	/** True once the host no longer wants the answer (the preview was torn down). */
	cancelled?: () => boolean;
}

export interface MeasuredSplitOutput extends SplitResult {
	plan: Record<string, unknown>;
	memory: FitMemory;
	rounds: number;
	fellBack: number;
	ms: number;
}

// The slides of a PREVIEW frame. The export's finder (lib/core/deck-slides.js) reads the export's
// own document, whose slides sit directly under `main#deck` or `body`; a preview frame wraps them
// in its own container. A slide here is a stamped section not inside another section, which keeps
// the finder's one rule: a section an author pasted inside a slide is not a slide.
const PREVIEW_SLIDES_SRC = String((doc: Document) => [...doc.querySelectorAll('section[data-lattice-slide]')].filter((s) => !s.parentElement?.closest('section')));
/** The probe arguments for one verdict config (the engine's `fitVerdictConfig()`, so the probes and selectors are the CLI's). */
const probeArgs = (cfg: unknown) => `(${fitMeasure.FIT_VERDICT_SRC}), ${JSON.stringify(cfg)}, (${PREVIEW_SLIDES_SRC})`;

/** The measured split could not read the frame it built: the host keeps today's split and its memory. */
export class UnmeasuredError extends Error {}

let writes = 0;
/**
 * Write `doc` into `frame` and wait for load, fonts and charts, as the CLI does after a split.
 * Resolves only once the frame holds THIS document (a write marker on its root) and has settled.
 * A frame that has not loaded it within `settleMs` (iOS fires srcdoc `onload` unreliably, a large
 * deck on a slow phone takes longer) rejects with `UnmeasuredError`: measuring the previous
 * document, or the blank one, would plan from the wrong facts. `cancelled()` aborts the same way,
 * so a preview torn down mid-measure does not keep its hidden frame working.
 */
function settle(frame: HTMLIFrameElement, doc: string, settleMs: number, cancelled: () => boolean): Promise<void> {
	const mark = String(++writes);
	return new Promise((resolve, reject) => {
		let done = false;
		const fail = (why: string) => {
			if (!done) {
				done = true;
				reject(new UnmeasuredError(why));
			}
		};
		const timer = setTimeout(() => fail(`the measuring frame did not load within ${settleMs} ms`), settleMs);
		frame.onload = async () => {
			const win = frame.contentWindow as (Window & { __latticeGraphFlush?: Record<string, () => void> }) | null;
			if (win?.document.documentElement.getAttribute('data-lattice-measure') !== mark) return;
			// LOADED: the document is this one. The deadline was for loading it; settling fonts and
			// charts has its own bounded wait below, and a slow face is measured as it stands rather
			// than called unmeasurable (WebKit's font settle can outlast the load deadline).
			clearTimeout(timer);
			const settled = new Promise((r) => setTimeout(r, settleMs));
			try {
				// Author media in a frame nobody sees must not play: mute and pause it before anything waits.
				for (const m of win.document.querySelectorAll('audio, video')) {
					(m as HTMLMediaElement).muted = true;
					(m as HTMLMediaElement).autoplay = false;
					(m as HTMLMediaElement).pause();
				}
				const fonts = win.document.fonts;
				if (fonts) await Promise.race([Promise.all([...fonts].map((f) => f.load().catch(() => undefined))).then(() => fonts.ready), settled]);
				for (const draw of Object.values(win.__latticeGraphFlush || {})) {
					try {
						draw();
					} catch {
						/* that chart keeps its placeholder */
					}
				}
				// One frame for layout to apply what the draws changed. WebKit does not run animation
				// frames in an off-screen hidden frame, so the wait is bounded: it hung there forever.
				await Promise.race([new Promise((r) => win.requestAnimationFrame(() => r(undefined))), new Promise((r) => setTimeout(r, 50))]);
			} catch {
				/* measure what is there */
			}
			if (cancelled()) return fail('the preview was torn down');
			if (!done) {
				done = true;
				resolve();
			}
		};
		frame.srcdoc = doc.replace(/<html\b/i, `<html data-lattice-measure="${mark}"`);
	});
}

/** Evaluate an engine probe inside the frame's own realm (its `document`, its `getComputedStyle`). */
function inFrame<T>(frame: HTMLIFrameElement, expr: string): T | null {
	const win = frame.contentWindow as (Window & { eval: (s: string) => unknown }) | null;
	try {
		return (win?.eval(expr) as T) ?? null;
	} catch (e) {
		throw new UnmeasuredError(`the measuring probe failed: ${String(e)}`);
	}
}

/**
 * Measure, plan, split and verify, in a hidden frame. Resolves to the split the host shows, the
 * plan it used, and the memory to keep for the next render. A frame that cannot be measured (it
 * did not load in time, held no slides, or the probe failed) rejects with `UnmeasuredError`, and
 * the host keeps today's split and its memory as they were: never worse than the structural split,
 * and never a memory learned from the wrong document.
 */
export async function measuredSplitInFrame(input: MeasuredSplitInput): Promise<MeasuredSplitOutput> {
	const t0 = performance.now();
	// How many measurements this page has run: the e2e specs read it to pin that typing does not measure (§17).
	if (typeof window !== 'undefined') {
		const w = window as Window & { __latticeMeasureCount?: number };
		w.__latticeMeasureCount = (w.__latticeMeasureCount ?? 0) + 1;
	}
	const { html, split, buildDoc, verdictConfig, width, height, packer = 'knuth-plass', memory = null, settleMs = 4000, cancelled = () => false } = input;
	if (!verdictConfig) throw new UnmeasuredError('this engine bundle has no fit verdict config');
	const PROBE_ARGS = probeArgs(verdictConfig);
	const frame = document.createElement('iframe');
	frame.setAttribute('aria-hidden', 'true');
	frame.tabIndex = -1;
	// Off screen at the slide's own box, so a container query reads the width it will be shown at.
	frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${Math.ceil(width) + 64}px;height:${Math.ceil(height) + 64}px;border:0;visibility:hidden;pointer-events:none;`;
	document.body.appendChild(frame);
	try {
		// The deck unsplit but STAMPED: a slide's number comes from the split pass, and the plan is
		// keyed by it, so the frame measures the engine's own whole pass, not the raw render.
		await settle(frame, buildDoc(split(html, 'whole').html), settleMs, cancelled);
		const remembered = memory ? Object.keys(memory).filter((n) => memory[n]?.split) : [];
		const facts = inFrame<unknown[]>(frame, `(${fitMeasure.MEASURE_FIT_SRC})(${PROBE_ARGS}, ${JSON.stringify(remembered)})`);
		// No slide found is not "every slide fits": it is a frame this module could not read.
		if (!Array.isArray(facts) || facts.length === 0) throw new UnmeasuredError('the measuring frame held no slides');
		const run = await fitMeasure.measuredSplit({
			facts,
			pack,
			packer,
			memory,
			split: async (plan: Record<string, unknown>) => {
				const r = split(html, plan);
				await settle(frame, buildDoc(r.html), settleMs, cancelled);
				return r;
			},
			verify: async () => inFrame<Record<string, number>>(frame, `(${fitMeasure.OVERFLOW_BY_SLIDE_SRC})(${PROBE_ARGS})`) ?? {},
			foldable: async () => inFrame<string[]>(frame, `(${fitMeasure.FOLDABLE_SRC})((${PREVIEW_SLIDES_SRC}))`) ?? [],
			// Members measured on a body page of their own, not in the unsplit slide's layout (§17).
			remeasure: async () => inFrame<unknown[]>(frame, `(${fitMeasure.MEASURE_FIT_SRC})(${PROBE_ARGS}, [], true)`) ?? [],
		});
		// The last measured split, readable from the host page: what the frame measured and what the
		// kernel planned. The e2e specs read it; it holds numbers only, no deck text.
		(window as Window & { __latticeLastMeasuredSplit?: unknown }).__latticeLastMeasuredSplit = {
			facts: (facts as { slide: string; over: boolean; share?: number | null; capacity?: number; members?: { heights: number[]; gap: number } | null }[]).map((f) => ({ slide: f.slide, over: f.over, share: f.share ?? null, capacity: f.capacity ?? null, heights: f.members?.heights ?? null })),
			plan: run.plan,
			remembered,
			rounds: run.rounds,
			fellBack: run.fellBack,
		};
		return {
			...(run.result as SplitResult),
			plan: run.plan,
			memory: fitMeasure.nextMemory(facts, run.plan),
			rounds: run.rounds,
			fellBack: run.fellBack,
			ms: performance.now() - t0,
		};
	} finally {
		frame.remove();
	}
}

// THE STUDIO'S MEMORY (§11 of 2026-10-28-fit-everywhere-model.md), per shown slide, kept here so it
// costs the eager bundle nothing. The live decision is keyed by deck and slide, so an edit keeps the
// slide's pages while they still fit. Fix B (the decision rides the undo stack) is kept by TEXT: each
// slide's decision is also recorded against the exact source it was made for, so undoing back to that
// source restores it. Bounded, oldest first out.
const fitMemoryLive = new Map<string, FitMemory>();
const fitMemoryByText = new Map<string, FitMemory>();
const FIT_MEMORY_CAP = 400;
const fitTextKey = (key: string, source: string) => `${key}\u0000${source}`;
export function fitMemoryFor(key: string, source: string): FitMemory | null {
	return fitMemoryByText.get(fitTextKey(key, source)) ?? fitMemoryLive.get(key) ?? null;
}
export function rememberFit(key: string, source: string, memory: FitMemory): void {
	fitMemoryLive.set(key, memory);
	const k = fitTextKey(key, source);
	if (!fitMemoryByText.has(k)) {
		fitMemoryByText.set(k, memory);
		while (fitMemoryByText.size > FIT_MEMORY_CAP) fitMemoryByText.delete(fitMemoryByText.keys().next().value as string);
	}
}

// THE PLAN CACHE. The Studio re-renders a split slide for every page the author steps to, and a
// render measured the whole slide again in a hidden frame: about a second a step on a phone, the
// same plan every time (2026-10-28-fit-everywhere-model.md §17). A plan depends only on what was
// laid out, so it is reused for the same slide TEXT in the same box, mode and stylesheet; any edit,
// resize or theme change misses and measures again. Bounded, oldest first out.
const planByLayout = new Map<string, Record<string, unknown>>();
const PLAN_CACHE_CAP = 200;
/** The layout a measured plan was made for: the slide's text, the box, and the stylesheet's shape. */
export function layoutKey(key: string, source: string, layout: string): string {
	return `${key}\u0000${layout}\u0000${source}`;
}
export function cachedPlan(k: string): Record<string, unknown> | null {
	const plan = planByLayout.get(k) ?? null;
	// The debug record says what the shown slide was split by, measured or reused (the e2e specs read it).
	// Only the plan changes: what the last measurement read (its facts, the slides it remembered) stays.
	if (plan && typeof window !== 'undefined') {
		const w = window as Window & { __latticeLastMeasuredSplit?: Record<string, unknown> };
		w.__latticeLastMeasuredSplit = { remembered: [], facts: [], rounds: 0, fellBack: 0, ...(w.__latticeLastMeasuredSplit ?? {}), plan, reused: true };
	}
	return plan;
}
export function cachePlan(k: string, plan: Record<string, unknown>): void {
	planByLayout.delete(k);
	planByLayout.set(k, plan);
	while (planByLayout.size > PLAN_CACHE_CAP) planByLayout.delete(planByLayout.keys().next().value as string);
}

// THE SLIDE'S LAST PLAN, by deck and slide, whatever text it was made for: what an edit redraws with
// while the author types, until the pause measures the new text (§17). A plan whose member count no
// longer matches is refused by the split (`groupSizes`), which then cuts the slide as it always has.
const lastPlanByKey = new Map<string, Record<string, unknown>>();
export function lastPlanFor(key: string): Record<string, unknown> | null {
	return lastPlanByKey.get(key) ?? null;
}
export function notePlanFor(key: string, plan: Record<string, unknown>): void {
	lastPlanByKey.delete(key);
	lastPlanByKey.set(key, plan);
	while (lastPlanByKey.size > PLAN_CACHE_CAP) lastPlanByKey.delete(lastPlanByKey.keys().next().value as string);
}

/** How long the author must pause before an edited `fit: pack` slide is measured again (§17). */
const MEASURE_SETTLE_MS = 700;
/** The pending pause measurement per preview host; a newer render marks the old one stale. */
const settleByHost = new WeakMap<object, { timer: ReturnType<typeof setTimeout>; stale: boolean }>();

type Planned<S> = S & { plan: Record<string, unknown> };

/**
 * The Studio's measured split for one shown slide (§16, §17): the plan to draw it with NOW, and,
 * while the author types, one measurement after they pause. Lives here, in the lazy chunk, so the
 * eager renderer carries none of it.
 *
 * STEADY WHILE TYPING, EXACT AT REST (the owner's pick). A measurement lays the slide out in a hidden
 * frame on the main thread, the thread typing needs (layout cannot run in a worker), so it does not
 * run per keystroke:
 *  - the plan made for this exact text, box and stylesheet is reused (stepping through pages);
 *  - the FIRST render of a slide measures now, so nothing jumps on arrival;
 *  - an EDIT redraws at once with the slide's last plan (or today's split, if a member was added or
 *    removed: the split refuses a plan whose count no longer matches), and the slide is measured
 *    once the author pauses. That pass waits for idle time, yields to the next keystroke, and when
 *    it lands fires `lattice:measured-split-ready` on the host, whose re-render reads the cache.
 */
export async function studioPlan<S extends object>(o: {
	host: HTMLElement;
	key: string;
	source: string;
	layout: string;
	split: (plan: Record<string, unknown>) => S;
	measure: (isCanceled: () => boolean) => Promise<(S & { plan: Record<string, unknown>; memory: FitMemory }) | null>;
	alive: () => boolean;
}): Promise<Planned<S> | null> {
	const keep = (m: { plan: Record<string, unknown>; memory: FitMemory } | null) => {
		if (!m) return;
		rememberFit(o.key, o.source, m.memory);
		cachePlan(o.layout, m.plan);
		notePlanFor(o.key, m.plan);
	};
	const pending = settleByHost.get(o.host);
	if (pending) {
		clearTimeout(pending.timer);
		pending.stale = true;
	}
	const reuse = cachedPlan(o.layout);
	if (reuse) return { ...o.split(reuse), plan: reuse };
	const last = lastPlanFor(o.key);
	if (!last) {
		const m = await o.measure(() => false);
		if (!o.alive()) return null;
		keep(m);
		return m;
	}
	const entry = { timer: 0 as unknown as ReturnType<typeof setTimeout>, stale: false };
	const ready = () => !entry.stale && o.alive();
	entry.timer = setTimeout(() => {
		if (!ready()) return;
		const run = () =>
			o.measure(() => entry.stale).then((m) => {
				if (!ready() || !m) return;
				keep(m);
				o.host.dispatchEvent(new Event('lattice:measured-split-ready'));
			});
		const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
		if (idle) idle(() => void run(), { timeout: 1000 });
		else void run();
	}, MEASURE_SETTLE_MS);
	settleByHost.set(o.host, entry);
	return { ...o.split(last), plan: last };
}
