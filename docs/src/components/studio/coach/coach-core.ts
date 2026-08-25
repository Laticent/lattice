// The Coach kernel — the deterministic, model-free assessment the Studio Coach panel
// renders. REUSE, DON'T REINVENT (HARD RULE #1/#15): the grade is the engine's real
// scorecard (`scorecard.scoreDeck` over `lintCore` + `reviewCore` findings — the same
// core the CLI runs), replacing the Studio's toy `lint.ts scoreDeck` 3-check heuristic.
// Pure/async, degrades to a null assessment (never a fabricated grade) when the deck
// has no real content. See engineering/decisions/2026-07-03-studio-succession.md §2.1.

import { buildVocabSets } from '@/playground/editor-diagnostics.js';
import type { Finding } from '../architect';
import { stripFrontMatter } from '../front-matter';
import { splitSlides as studioSplitSlides } from '../lint';

export type ScoreCategory = { key: string; half: 'craft' | 'style'; label: string; score: number | null; na?: boolean; notes: string[] };
export type ScoreHalf = { score: number; band: string; summary: string };
/** Which genre the STYLE half was measured against, and where that came from. An
 *  inferred profile is a VISIBLE guess — the panel shows it and offers the override,
 *  because a silently-applied wrong bar is worse than no profile at all. */
export type DeckProfileRead = { key: string; label: string; blurb: string; origin: 'declared' | 'override' | 'inferred' | 'default'; declaredInvalid: string | null };
export type DeckScorecard = { craft: ScoreHalf; style: ScoreHalf; profile: DeckProfileRead; categories: ScoreCategory[] };
export type CoachAssessment = {
	/** Whether the deck has real content to assess. `false` → scorecard/findings empty;
	 *  the panel shows a placeholder, NEVER a fabricated "A / 94" for a blank deck (K1). */
	hasContent: boolean;
	scorecard: DeckScorecard | null;
	findings: Finding[];
};

export type CoachComponent = { name: string; bucket?: string; density?: unknown };

// biome-ignore lint/suspicious/noExplicitAny: authoring-core is an untyped generated bundle.
let coreMod: any = null;
// biome-ignore lint/suspicious/noExplicitAny: authoring-core is an untyped generated bundle.
async function core(): Promise<any> {
	if (!coreMod) coreMod = await import('@/playground/authoring-core.generated.js');
	return coreMod;
}

/** At least one classed slide (after front matter) or real prose — the same content
 *  gate the Drawing Board used (drawing-board-architect.js hasContent). Ported so the
 *  Studio doesn't inherit the empty-deck-scores-A trap of the raw engine scoreDeck. */
export function hasContent(src: string): boolean {
	const s = String(src ?? '');
	// `> 0`, not `> 1`. The old threshold counted the FRONT-MATTER chunk as a slide — its
	// splitter cut the raw source on `/^---$/m`, so `['', yaml, slide]` made a one-slide deck
	// read as two. Counting real slides and keeping `> 1` made a one-slide deck with front
	// matter report NO CONTENT, and the Coach shows a placeholder instead of assessing a real
	// deck (found by the independent checker). One classed slide is content.
	return /<!--\s*_class:/.test(s) && splitSlides(s).length > 0;
}

/** The real deck assessment: the engine scorecard + the union of lint + review
 *  findings. Returns an empty, content-false assessment (not a grade) for a blank deck.
 *  Never throws into render. */
export async function assessDeck(source: string, lintVocab: unknown, components: CoachComponent[] = [], extraNames: string[] = [], extraFinishes: string[] = [], profileOverride?: string): Promise<CoachAssessment> {
	const src = String(source ?? '');
	if (!hasContent(src)) return { hasContent: false, scorecard: null, findings: [] };
	const v = lintVocab as { names?: unknown } | null;
	try {
		const m = await core();
		const lintCore = m.lintCore;
		const reviewCore = m.reviewCore;
		const scorecard = m.scorecard;
		if (!reviewCore?.reviewText || !scorecard?.scoreDeck) return { hasContent: true, scorecard: null, findings: [] };
		// Lint needs the page vocabulary; the review layer + scorecard don't. If the vocab
		// is absent (e.g. a bare render), still produce the real review-based scorecard —
		// a lint-less grade is degraded, not fabricated. Never fake a grade only for an
		// empty deck (handled above by hasContent).
		let lint: Finding[] = [];
		if (v?.names && lintCore?.lintTextWith) {
			const vocab = buildVocabSets(lintVocab);
			for (const n of extraNames) if (n) vocab.names.add(n);
			if (extraFinishes.length) vocab.finishNames = [...(vocab.finishNames || []), ...extraFinishes];
			lint = lintCore.lintTextWith(src, vocab) as Finding[];
		}
		const bucketMap = new Map(components.filter((c) => c.bucket).map((c) => [c.name, c.bucket]));
		const densityMap = new Map(components.filter((c) => c.density != null).map((c) => [c.name, c.density]));
		// The profile override rides into BOTH: review-core needs it to pick the prose
		// budgets a finding fires against, and the scorecard needs it to resolve the same
		// genre for the Style half. Passing it to only one would grade a deck against a
		// profile whose findings were generated under a different one.
		const review = reviewCore.reviewText(src, { bucketOf: (n: string) => bucketMap.get(n) ?? null, densityOf: (n: string) => densityMap.get(n) ?? null, profileOverride }) as Finding[];
		const sc = scorecard.scoreDeck({ source: src, lintFindings: lint, reviewFindings: review, profileOverride }) as DeckScorecard;
		return { hasContent: true, scorecard: sc, findings: [...lint, ...review] };
	} catch {
		return { hasContent: true, scorecard: null, findings: [] };
	}
}

// ── Deterministic coach action cards ─────────────────────────────────────────────
// (ported from the Drawing Board's coach-actions.js, which was deleted with that surface)
// Each returns a result card computed entirely from the deck + assessment — no model,
// instant, free, honest. Findings are ranked by SEVERITY (not a forked grade-impact
// model — the scorer's weights are private to the engine, and a grade-impact sort lies
// on decks whose category has already floored). See the Munger-inversion note in the
// migration record.

export type CoachCard = { title: string; body: string[]; jump?: number; needMinutes?: boolean };

const SEV_WEIGHT: Record<string, number> = { error: 3, warning: 2, suggestion: 1 };
const SEV_ORDER: Record<string, number> = { error: 0, warning: 1, suggestion: 2 };

// A THIRD local `/^---$/m` splitter lived here, and it counted a slide list the renderer
// does not have: `***`, `___`, `- - -`, `----`, `--- ` and an indented `---` are all slide
// breaks to the engine and were invisible to it, while a setext underline was a break to it
// and a heading to the engine. The Coach's per-finding "jump to slide N" therefore pointed
// somewhere else on any deck written with one of those. It reads the Studio's own splitter
// now — which reads `lib/core/slide-boundaries.mjs`, pinned against the real parser.
function splitSlides(source: string): string[] {
	return studioSplitSlides(stripFrontMatter(String(source ?? '')));
}
export function countSlides(source: string): number {
	return splitSlides(source).length;
}

/** Findings ranked by severity then slide — the ordering the findings list and the
 *  "Top fixes" chip share, so they never disagree. */
export function rankFindings(findings: Finding[]): Finding[] {
	return findings.slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || ((a.slide || 0) - (b.slide || 0)));
}

export function topFixes(findings: Finding[]): CoachCard {
	const fs = rankFindings(findings).slice(0, 5);
	if (!fs.length) return { title: 'Top fixes', body: ['Nothing flagged — every slide follows the authoring contract.'] };
	return { title: 'Top fixes', body: fs.map((f) => `${f.message}${f.slide ? ` (slide ${f.slide})` : ''}`), jump: fs[0].slide };
}

export function weakestSlide(findings: Finding[]): CoachCard {
	const bySlide = new Map<number, number>();
	for (const f of findings) {
		if (!f.slide) continue;
		bySlide.set(f.slide, (bySlide.get(f.slide) || 0) + (SEV_WEIGHT[f.severity] || 1));
	}
	if (!bySlide.size) return { title: 'Weakest slide', body: ['No slide stands out — nothing flagged, or issues are spread evenly.'] };
	const [slide] = [...bySlide.entries()].sort((a, b) => b[1] - a[1])[0];
	const issues = findings.filter((f) => f.slide === slide).map((f) => f.message);
	return { title: 'Weakest slide', body: [`Slide ${slide} has the most to fix:`, ...issues], jump: slide };
}

export async function theAsk(source: string): Promise<CoachCard> {
	const src = source || '';
	if (/<!--\s*_class:\s*decision\b/.test(src)) return { title: 'The ask', body: ['You have a decision slide. Make sure it states exactly what you want the audience to approve or do.'] };
	const m = await core();
	if (m?.reviewCore?.ASK_RE?.test(src)) return { title: 'The ask', body: ['There’s ask-like language, but no dedicated decision slide — the recommendation may be buried. A `decision` slide makes it unmissable.'] };
	return { title: 'The ask', body: ['No clear ask. End with what you want the audience to decide or do — a `decision` slide states it plainly.'] };
}

export async function pacing(source: string, minutes?: number): Promise<CoachCard> {
	const slides = countSlides(source);
	if (!minutes) return { title: 'Pacing', body: [`${slides} slide${slides === 1 ? '' : 's'}. Tell me your talk length and I’ll check the pace.`], needMinutes: true };
	const m = await core();
	const v = m?.reviewCore?.pacingVerdict?.(slides, minutes);
	return { title: 'Pacing', body: [`${slides} slides for a ${minutes}-minute talk.`, v?.text ?? ''] };
}

export async function structureCheck(source: string): Promise<CoachCard> {
	const slides = splitSlides(source);
	const first = slides[0] || '';
	const last = slides[slides.length - 1] || '';
	const hasOpen = /<!--\s*_class:\s*title\b/.test(first) || /^\s*#\s/.test(first.trim());
	const ask = await theAsk(source);
	const askState = ask.body[0].startsWith('You have') ? '✓' : ask.body[0].startsWith('There') ? '~' : '✗';
	const hasClose = /<!--\s*_class:\s*closing\b/.test(source || '') || /\b(thank you|questions|q&a|appendix|in summary)\b/i.test(last);
	return { title: 'Structure check', body: [`${hasOpen ? '✓' : '✗'} Opening / title slide`, `${askState} Clear ask / recommendation`, `${hasClose ? '✓' : '✗'} Closing slide`] };
}
