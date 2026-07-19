// The Coach kernel — the deterministic, model-free assessment the Studio Coach panel
// renders. REUSE, DON'T REINVENT (HARD RULE #1/#15): the grade is the engine's real
// scorecard (`scorecard.scoreDeck` over `lintCore` + `reviewCore` findings — the same
// core the CLI runs), replacing the Studio's toy `lint.ts scoreDeck` 3-check heuristic.
// Pure/async, degrades to a null assessment (never a fabricated grade) when the deck
// has no real content. See engineering/decisions/2026-07-03-studio-succession.md §2.1.

import { buildVocabSets } from '@/playground/editor-diagnostics.js';
import type { Finding } from '../architect';

export type ScoreCategory = { key: string; label: string; score: number | null; na?: boolean; notes: string[] };
export type DeckScorecard = { overall: number; band: string; categories: ScoreCategory[] };
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
	return /<!--\s*_class:/.test(s) && s.split(/^---$/m).filter((x) => x.trim()).length > 1;
}

/** True when a `---` sits INSIDE a fenced code block (``` / ~~~). The engine's
 *  slide splitter (architect-edits.js) is fence-blind, so an AI fix that splices by
 *  slide number would mis-target and corrupt the deck — the Coach disables AI fixes
 *  when this is present (K3 guard). Tracked follow-up: make the engine splitter
 *  fence-aware. */
export function hasFencedSeparator(src: string): boolean {
	const lines = String(src ?? '').split('\n');
	let fence: { marker: string; len: number } | null = null;
	for (const line of lines) {
		const open = /^\s*(`{3,}|~{3,})/.exec(line);
		if (fence) {
			if (open && open[1][0] === fence.marker && open[1].length >= fence.len && /^\s*(`{3,}|~{3,})\s*$/.test(line)) fence = null;
			else if (/^-{3,}\s*$/.test(line)) return true;
		} else if (open) {
			fence = { marker: open[1][0], len: open[1].length };
		}
	}
	return false;
}

/** The real deck assessment: the engine scorecard + the union of lint + review
 *  findings. Returns an empty, content-false assessment (not a grade) for a blank deck.
 *  Never throws into render. */
export async function assessDeck(source: string, lintVocab: unknown, components: CoachComponent[] = [], extraNames: string[] = [], extraFinishes: string[] = []): Promise<CoachAssessment> {
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
		const review = reviewCore.reviewText(src, { bucketOf: (n: string) => bucketMap.get(n) ?? null, densityOf: (n: string) => densityMap.get(n) ?? null }) as Finding[];
		const sc = scorecard.scoreDeck({ source: src, lintFindings: lint, reviewFindings: review }) as DeckScorecard;
		return { hasContent: true, scorecard: sc, findings: [...lint, ...review] };
	} catch {
		return { hasContent: true, scorecard: null, findings: [] };
	}
}

// ── Deterministic coach action cards (ported from coach-actions.js) ──────────────
// Each returns a result card computed entirely from the deck + assessment — no model,
// instant, free, honest. Findings are ranked by SEVERITY (not a forked grade-impact
// model — the scorer's weights are private to the engine, and a grade-impact sort lies
// on decks whose category has already floored). See the Munger-inversion note in the
// migration record.

export type CoachCard = { title: string; body: string[]; jump?: number; needMinutes?: boolean };

const SEV_WEIGHT: Record<string, number> = { error: 3, warning: 2, suggestion: 1 };
const SEV_ORDER: Record<string, number> = { error: 0, warning: 1, suggestion: 2 };

function splitSlides(source: string): string[] {
	let src = source || '';
	const fm = src.match(/^\s*---\n[\s\S]*?\n---\n?/);
	if (fm) src = src.slice(fm[0].length);
	return src
		.split(/^---$/m)
		.map((c) => c.trim())
		.filter(Boolean);
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
