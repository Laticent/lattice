// The Motion Sheet's kernel — every target in the open deck the engine could animate, what the
// register resolves to for each, where each axis got its value, and whether the motion earns its
// place. Pure string + data work: no DOM, no renderer, no store, so the whole sheet is testable
// without a browser.
//
// ── WHY A SHEET AND NOT A STAGE ─────────────────────────────────────────────────────────────
//
// `2026-09-02-frame-model-for-motion.md` narrowed motion to a property of things the engine
// ALREADY draws, and its §7b pushed the standalone scene faculty out of scope. The engine knows
// exactly what a deck's animatable things are, so THIS surface starts from the author's deck rather
// than from a blank stage.
//
// THAT IS ABOUT THIS SHEET, NOT ABOUT CRAFTING. §7b offered three options and all three were about
// disposal; `2026-09-06-fabricate-motion-craft.md` answered the question §7b did not ask — what a
// Fabricate Motion tab is FOR — and the crafting faculty ships beside this file. Read "retired" here
// as "not what a deck's motion CONTROLS are", which is this module's job. The two surfaces answer
// different questions: this one reports what the deck already animates; the faculty brings a new
// drawing into existence and puts it on the Library shelf.
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
import { SLIDE_SEP } from './deck-ops';
import { frontMatterBlock, getFrontMatter, stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { getClassTokens, setGroupToken } from './slide-directives';

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
 * Components that emit `data-anima-role`, and so are the ones chart motion can actually reach.
 *
 * MEASURED, not inferred from the manifests: `grep -rl data-anima-role lib/` returns these seven
 * transforms plus the shared `_chart-family/svg-label.js`. An earlier draft of this file keyed on
 * `render: svg` in the manifest instead, and got two of them backwards — `diagram` declares SVG
 * and emits NO role (its markup is third-party Mermaid), while `state-chart` is `render: hybrid`
 * and DOES emit one. Declaring SVG and being animatable are different properties.
 */
export const ROLE_COMPONENTS = new Set(['funnel', 'gantt', 'map', 'piechart', 'quadrant', 'radar', 'state-chart']);

/**
 * Components that render but emit no `data-anima-role`, so `chartToScene` finds no marks and
 * motion skips them however the register resolves.
 *
 * `word-cloud` and `diagram` both declare `render: svg` and neither emits a role; `journey` is
 * `render: hybrid` and its own manifest states the gap, with the fix named (emit the role on the
 * mood curve and the faces).
 */
export const NO_ROLE_COMPONENTS = new Set(['word-cloud', 'diagram', 'journey']);

/**
 * Components whose marks the engine reveals SYNCHRONIZED under every style, not just `together`.
 *
 * `chart-anima.ts:286` sets `synchronized = style === 'together' || isSector`, and the comment
 * above it records why: a staggered disc reads as "missing a slice", not "assembling" — a finding
 * from an adversarial pass. So a pie is a single fade whatever the author picks, which means
 * flagging `together` on one would nag about a choice the engine overrides anyway.
 */
export const SECTOR_COMPONENTS = new Set(['piechart']);

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
 * How many marks a chart slide declares — the FIRST contiguous top-level list, and nothing else.
 *
 * Charts are authored as a markdown list (`ul > li`), not a fenced block, and the data list comes
 * first on the slide. Counting every bullet in the chunk over-counted any slide with a bulleted
 * speaker note or a prose aside beneath the chart, which then inflated the displayed build
 * duration and silently cleared the one-mark verdict. A nested `- ` is the per-stage detail
 * (`li > ul`), not a mark, and a bullet inside a fence is sample text.
 *
 * This is a HEURISTIC over source, not the engine's own count — the engine counts rendered
 * `[data-mark]` nodes. It is right for the shape every shipped chart uses and it is reported as
 * `null` rather than guessed when there is no list at all, but a deck that interleaves prose
 * bullets INTO the data list will still read high. The duration derived from it is labelled as an
 * estimate for that reason.
 */
export function markCount(chunk: string): number | null {
	let n = 0;
	let started = false;
	let inFence = false;
	for (const raw of chunk.split('\n')) {
		if (/^\s*(?:```|~~~)/.test(raw)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		// BOTH list forms: charts use `- `, and `state-chart`'s states are an ORDERED list
		// (`ol > li`) whose nested `- ` items are its transitions, not marks. Counting only
		// bullets reported "not countable" for every state-chart — verified on the live surface,
		// where a 3-state chart emits exactly 3 `[data-mark]` nodes.
		const isTop = /^(?:[-*+]|\d+[.)])\s+\S/.test(raw);
		const isNested = /^\s+(?:[-*+]|\d+[.)])\s+\S/.test(raw);
		if (isTop) {
			n++;
			started = true;
			continue;
		}
		// A blank line or nested detail keeps the run open; anything else ends it.
		if (started && !isNested && raw.trim() !== '') break;
	}
	return n || null;
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

/** The deck-level defaults from the three `motion*` keys, read with the parser the live host uses. */
export function deckMotionOf(source: string): DeckMotion {
	return parseDeckMotion(getFrontMatter(source, 'motion'), getFrontMatter(source, 'motion-style'), getFrontMatter(source, 'motion-speed'));
}

/**
 * The motion tokens a deck's front-matter `class:` puts on EVERY section.
 *
 * `base.docs.md` documents `class: chart-anima` as the deck-wide switch, and the engine appends
 * every `class:` token to every section — including a section that names its own `_class:`. So
 * `class: motion-off` really does silence a deck whose slides say `motion-on`, and
 * `class: motion-fast` really does set the speed. Reading only `chart-anima` here reported the
 * opposite of the deck on three of the four documented shapes.
 */
export function deckClassTokens(source: string): string[] {
	return (getFrontMatter(source, 'class') ?? '').split(/\s+/).filter(Boolean);
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

	const deckClass = deckClassTokens(source);

	chunks.forEach((chunk, i) => {
		const slideTokens = getClassTokens(chunk);
		// POSITION-INDEPENDENT, like the engine's own dispatch: `chart-family.js` picks the layout
		// with `CHART_LAYOUTS.find(l => classTokens.includes(l))`, so `_class: dark funnel` is a
		// funnel. Reading `tokens[0]` made any deck that puts a modifier first vanish from the
		// sheet entirely — the worst failure for a surface whose promise is "every target".
		const component = slideTokens.find((t) => ROLE_COMPONENTS.has(t) || NO_ROLE_COMPONENTS.has(t));
		if (!component) return;

		// The engine APPENDS front-matter `class:` to every section, so a deck-level `motion-off`
		// or `motion-fast` arrives as a token ON THE SECTION and is read by the SLIDE-level
		// readers — it is not a "deck default" that a slide token outranks. Modelling it as one
		// made the sheet report the opposite of the deck on four documented shapes.
		const tokens = [...slideTokens, ...deckClass];
		const slidePlay = playOf(slideTokens);
		const slideStyle = styleOf(slideTokens);
		const slideSpeed = speedOf(slideTokens);
		// A `class:` token is deck-scope to the AUTHOR even though it is slide-scope to the engine,
		// so it reports as `deck` — that is where they would go to change it.
		const classPlay = playOf(deckClass);
		const classStyle = styleOf(deckClass);
		const classSpeed = speedOf(deckClass);

		// `resolveMotion` reads the section's class list, which carries BOTH sets, and `motion-off`
		// beats `motion-on` there — so the union is resolved with the same precedence the engine
		// uses rather than by layering slide over deck.
		const unionPlay = playOf(tokens);
		const play = (unionPlay ?? deck.play ?? 'off') === 'on';
		const style = styleOf(tokens) ?? deck.style ?? 'build';
		const speed = speedOf(tokens) ?? deck.speed ?? 'auto';
		const provenance = {
			play: slidePlay ? ('slide' as const) : classPlay || deck.play ? ('deck' as const) : ('built-in' as const),
			style: slideStyle ? ('slide' as const) : classStyle || deck.style ? ('deck' as const) : ('built-in' as const),
			speed: slideSpeed ? ('slide' as const) : classSpeed || deck.speed ? ('deck' as const) : ('built-in' as const),
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
	// A SECTOR chart is synchronized under EVERY style (chart-anima.ts:286) — the engine overrides
	// the author, deliberately, because a staggered disc reads as "missing a slice". Flagging
	// `together` here would nag about a choice that changes nothing, and NOT flagging `build` on
	// the same chart would give two rows with identical rendered motion opposite verdicts. So the
	// note is about the shape, carries no alarm, and never offers "turn it off".
	if (SECTOR_COMPONENTS.has(t.component)) {
		return { verdict: 'carries', note: 'A disc reveals as one piece whatever the style says — the engine synchronizes sectors so the chart never reads as missing a slice.' };
	}
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

/**
 * Turn motion OFF for one slide, by its chunk index.
 *
 * The single writer both the per-row action and the bulk action go through, so a bulk change is
 * exactly N applications of the one-row change and cannot diverge from it. It writes the
 * Inspector's own `motion-off` token through the Inspector's own `setGroupToken`, which is what
 * keeps this surface from becoming a second source of truth for the register.
 *
 * A chunk index that no longer exists returns the source untouched rather than writing to whatever
 * slide now sits at that position — the deck is live, and a stale index is the worst kind of
 * bulk-edit bug.
 */
export function setSlideMotionOff(source: string, chunk: number): string {
	const slides = splitSlides(stripFrontMatter(source));
	if (slides[chunk] == null) return source;
	slides[chunk] = setGroupToken(slides[chunk], PLAY_TOKENS, 'motion-off');
	return (frontMatterBlock(source) || '') + slides.join(SLIDE_SEP);
}
