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
import overflowProbe from '../../../lib/core/overflow-probe.js';

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

const VERDICT_CFG = {
	probeSrc: overflowProbe.PROBE_SRC,
	ccSrc: overflowProbe.CONTENT_CLIPPED_SRC,
	clipSel: overflowProbe.CLIP_CELL_SELECTOR,
	ignoreSel: overflowProbe.IGNORED_CLIP_SELECTOR,
	bearerSel: overflowProbe.IGNORED_BEARER_SELECTOR,
	tol: overflowProbe.FRAME_TOLERANCE,
};
// The slides of a PREVIEW frame. The export's finder (lib/core/deck-slides.js) reads the export's
// own document, whose slides sit directly under `main#deck` or `body`; a preview frame wraps them
// in its own container. A slide here is a stamped section not inside another section, which keeps
// the finder's one rule: a section an author pasted inside a slide is not a slide.
const PREVIEW_SLIDES_SRC = String((doc: Document) => [...doc.querySelectorAll('section[data-lattice-slide]')].filter((s) => !s.parentElement?.closest('section')));
const PROBE_ARGS = `(${fitMeasure.FIT_VERDICT_SRC}), ${JSON.stringify(VERDICT_CFG)}, (${PREVIEW_SLIDES_SRC})`;

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
	const { html, split, buildDoc, width, height, packer = 'knuth-plass', memory = null, settleMs = 4000, cancelled = () => false } = input;
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
