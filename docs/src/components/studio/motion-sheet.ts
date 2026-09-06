// The Motion Sheet's kernel — every target in the open deck the engine could animate, what the
// register resolves to for each, where each axis got its value, and whether the motion earns its
// place. Pure string + data work: no DOM, no renderer, no store, so the whole sheet is testable
// without a browser.
//
// ── WHY A SHEET AND NOT A STAGE ─────────────────────────────────────────────────────────────
//
// `2026-09-02-frame-model-for-motion.md` narrowed motion to a property of things the engine
// ALREADY draws, which retired the standalone scene the Fabricate Motion tab used to author
// (§7b). The engine knows exactly what those things are, so the surface starts from the author's
// deck rather than from a blank stage.
//
// ── THE ONE RULE THIS MODULE MUST NOT BREAK ─────────────────────────────────────────────────
//
// It writes the SAME tokens the Inspector writes — `motion-on`/`motion-off`,
// `motion-build|together|rise`, `motion-auto|slow|normal|fast`, and the three front-matter keys —
// through the SAME writers (`setGroupToken`, `writeFrontMatterLine`). No fourth axis, no fourth
// cascade layer, no vocabulary of its own. The Inspector is the pen; this is the page. If the two
// could disagree, the sheet would be a second source of truth for a register that already has one.

import type { ChartAnimaStyle } from '@/lib/chart-anima';
import { type DeckMotion, MOTION_SPEEDS, MOTION_STYLES, type MotionSpeed, parseDeckMotion, speedToDurationMs } from '@/playground/anima-host-sel';
import { getFrontMatter, stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { getClassTokens } from './slide-directives';

/** The three axes, as the slide-token groups `setGroupToken` needs to swap one member for another. */
export const PLAY_TOKENS = ['motion-on', 'motion-off'] as const;
export const STYLE_TOKENS = MOTION_STYLES.map((s) => `motion-${s}`);
export const SPEED_TOKENS = MOTION_SPEEDS.map((s) => `motion-${s}`);

/** Where an axis got the value it resolved to. The Inspector shows this per scope as a `from deck`
 *  hint; the sheet shows all three at once, because "why is this one different" is a comparison
 *  question and the Inspector has no comparison. */
export type Provenance = 'slide' | 'deck' | 'built-in';

/**
 * What the engine can do with a target — and the distinction that matters most is between
 * "off because someone said so" and "off because nothing here can move".
 *
 *  - `carries`   — it animates, and the build says something a still does not.
 *  - `review`    — it animates, but the motion adds nothing. The admission test's failure case.
 *  - `still`     — Play resolves off. A decision, not a defect.
 *  - `no-roles`  — the component renders SVG but emits no `data-anima-role`, so chart motion
 *                  skips it. `journey` is the documented example (frame model §11).
 *  - `no-painter`— a DOM target with no SVG to paint. The rails, the masthead, the logo.
 */
export type Verdict = 'carries' | 'review' | 'still' | 'no-roles' | 'no-painter';

export interface MotionTarget {
	/** 1-based slide number as an author counts them. */
	slide: number;
	/** The `_class` component name, e.g. `funnel`. */
	component: string;
	/** The slide's first heading, for a human-readable row label. */
	title: string;
	/** Resolved register — null when Play resolves off. */
	play: boolean;
	style: ChartAnimaStyle;
	speed: MotionSpeed;
	provenance: { play: Provenance; style: Provenance; speed: Provenance };
	verdict: Verdict;
	/** Why the verdict is what it is, in the author's language. Always set for a verdict that is
	 *  not `carries`, because a status a reader cannot act on is just a colored dot. */
	note?: string;
	/** Marks counted from the source fence, when the shape is countable. `null` when it is not —
	 *  and `null` is reported rather than guessed, because a wrong count is worse than no count. */
	marks: number | null;
	/** The build's total duration, once Play is on. */
	durationMs: number | null;
	/** The chunk index into `splitSlides(stripFrontMatter(source))`, for writing back. */
	chunk: number;
}

/**
 * Components whose motion the engine can actually paint, and how it reaches them.
 *
 * MEASURED, not assumed: grepping every component manifest for `"render": "svg"` returns exactly
 * EIGHT — the seven charts plus `diagram`. The frame-model note's own §4 says the same; its
 * front-matter summary says nine and is wrong (corrected in this PR).
 */
export const SVG_COMPONENTS = new Set(['funnel', 'gantt', 'map', 'piechart', 'quadrant', 'radar', 'word-cloud', 'diagram']);

/**
 * SVG components that emit no `data-anima-role`, so `chartToScene` finds no marks and chart motion
 * skips them however the register resolves.
 *
 * `word-cloud` declares `render: svg` but is not among the files that emit a role — the frame
 * model's §4 counts 7 chart components declaring SVG and 8 files emitting a role, and those are
 * different sets. `journey` is `render: hybrid` and its manifest states the gap outright, with the
 * fix named: emit the role on the mood curve and the faces.
 */
export const NO_ROLE_COMPONENTS = new Set(['word-cloud', 'journey', 'state-chart']);

/** Chrome the frame model wants animated eventually but which no painter can reach today — the
 *  rail is `<span class="dot">` per section with zero `<svg>`, and the deck logo is an `<img>`.
 *  Listed so the sheet can say "not yet, and here is why" instead of silently omitting them. */
export const DOM_CHROME: { id: string; label: string; note: string }[] = [
	{ id: 'section-rail', label: 'Section rail', note: 'One `<span class="dot">` per section — no `<svg>`, so an SVG painter cannot reach it. One engine-generated SVG would let the pill travel between two known frames.' },
	{ id: 'deck-logo', label: 'Deck logo', note: 'Emitted as `<img class="deck-logo">`, and an `<img>` pointing at an SVG is opaque. Inlining it is a sanitize boundary, not a free change.' },
];

const firstHeading = (chunk: string): string => {
	for (const line of chunk.split('\n')) {
		const m = /^\s{0,3}#{1,6}\s+(.*\S)/.exec(line);
		if (m) return m[1].replace(/[*_`]/g, '').trim();
	}
	return '';
};

/**
 * Rows inside the slide's first fenced block — how a chart's marks are authored.
 *
 * Returns `null` when there is no fence, rather than 0: "this chart has no marks" and "we could
 * not count them" are different claims, and only one of them should ever reach a verdict.
 */
export function markCount(chunk: string): number | null {
	const m = /^[ \t]*```+[^\n]*\n([\s\S]*?)^[ \t]*```+/m.exec(chunk);
	if (!m) return null;
	const rows = m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
	return rows.length || null;
}

const styleOf = (tokens: string[]): ChartAnimaStyle | null => {
	for (const s of MOTION_STYLES) if (tokens.includes(`motion-${s}`)) return s;
	return tokens.includes('chart-anima') ? 'build' : null;
};
const speedOf = (tokens: string[]): MotionSpeed | null => {
	for (const s of MOTION_SPEEDS) if (tokens.includes(`motion-${s}`)) return s;
	return null;
};
const playOf = (tokens: string[]): 'on' | 'off' | null => {
	if (tokens.includes('motion-off')) return 'off';
	if (tokens.includes('motion-on') || tokens.includes('chart-anima')) return 'on';
	return null;
};

/** The deck-level defaults, read with the same parser the live host uses. */
export function deckMotionOf(source: string): DeckMotion {
	return parseDeckMotion(getFrontMatter(source, 'motion'), getFrontMatter(source, 'motion-style'), getFrontMatter(source, 'motion-speed'));
}

/**
 * Every target in the deck, in slide order.
 *
 * Mirrors `resolveMotion`'s cascade exactly — slide token → deck default → built-in, per axis,
 * with Play as the sole switch — but reports WHERE each value came from, which `resolveMotion`
 * does not need to and the sheet cannot work without.
 */
export function readTargets(source: string): MotionTarget[] {
	const deck = deckMotionOf(source);
	const chunks = splitSlides(stripFrontMatter(source));
	const out: MotionTarget[] = [];

	chunks.forEach((chunk, i) => {
		const tokens = getClassTokens(chunk);
		// The component is the first class token — `<!-- _class: funnel motion-on -->`. Every
		// other token is a modifier, which is why the register's tokens can sit beside it.
		const component = tokens[0] ?? '';
		if (!component) return;
		if (!SVG_COMPONENTS.has(component) && !NO_ROLE_COMPONENTS.has(component)) return;
		const slidePlay = playOf(tokens);
		const slideStyle = styleOf(tokens);
		const slideSpeed = speedOf(tokens);

		const play = (slidePlay ?? deck.play ?? 'off') === 'on';
		const style = slideStyle ?? deck.style ?? 'build';
		const speed = slideSpeed ?? deck.speed ?? 'auto';
		const provenance = {
			play: slidePlay ? ('slide' as const) : deck.play ? ('deck' as const) : ('built-in' as const),
			style: slideStyle ? ('slide' as const) : deck.style ? ('deck' as const) : ('built-in' as const),
			speed: slideSpeed ? ('slide' as const) : deck.speed ? ('deck' as const) : ('built-in' as const),
		};

		const marks = markCount(chunk);
		const { verdict, note } = judge({ component, play, style, marks });

		out.push({
			slide: i + 1,
			component,
			title: firstHeading(chunk),
			play,
			style,
			speed,
			provenance,
			verdict,
			note,
			marks,
			durationMs: play && marks != null ? speedToDurationMs(speed, marks) : null,
			chunk: i,
		});
	});

	return out;
}

/**
 * The admission test, applied per target.
 *
 * It is NEW logic rather than a call to `auditScene`, and that is not duplication. `auditScene`
 * yields ZERO notes on any chart-derived scene: two of its four rules are guarded to
 * `source === 'built'` scenes or to `spin`/`orbit` periods, neither of which a chart has, and its
 * duplicate-signature rule cannot fire because every verb `chartToScene` emits on an element is
 * distinct. It also has exactly one production call site — the old Motion tab — wired to a scene
 * a chart can never reach. So the bar existed and nothing checked it.
 */
export function judge(t: { component: string; play: boolean; style: ChartAnimaStyle; marks: number | null }): { verdict: Verdict; note?: string } {
	if (NO_ROLE_COMPONENTS.has(t.component)) {
		return { verdict: 'no-roles', note: `\`${t.component}\` emits no motion roles, so chart motion skips it however the register resolves. The fix is in the component, not the deck.` };
	}
	if (!t.play) return { verdict: 'still' };

	// One mark cannot build. The "sequence" is a single fade, which is the still it already was —
	// motion that carries nothing, which the admission test bans.
	if (t.marks === 1) {
		return { verdict: 'review', note: 'One mark, so the build is one beat — it reads as a fade, not a sequence. Motion here shows nothing the still does not.' };
	}
	// `together` synchronizes every mark into one window, and a sector chart does so under every
	// style (chart-anima.ts:286). That is the right default for a disc, but it means the motion is
	// a fade-in: legitimate as an entrance, worth a second look as information.
	if (t.style === 'together') {
		return { verdict: 'review', note: 'Together reveals every mark in one window, so the build is a single fade. It arrives; it does not sequence.' };
	}
	return { verdict: 'carries' };
}

/** Counts for the sheet's summary line and its filter chips. */
export function tally(targets: MotionTarget[]) {
	return {
		total: targets.length,
		on: targets.filter((t) => t.play && t.verdict !== 'no-roles').length,
		off: targets.filter((t) => t.verdict === 'still').length,
		review: targets.filter((t) => t.verdict === 'review').length,
		blocked: targets.filter((t) => t.verdict === 'no-roles').length,
	};
}
