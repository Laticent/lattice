// THE COACH'S ASSESSMENT, given a loaded lint core: the engine's scorecard over lint-core and review-core findings, the same
// three the CLI runs. Pure and import-free, so the Studio's lint worker (lint-worker.js) and the main-thread fallback
// (coach/coach-core.ts `assessDeck`) run exactly this code and cannot drift apart.

/**
 * @param {any} m  the authoring core (authoring-door.js `loadAuthoring()`, or the worker's import of the same file)
 * @param {string} src  the deck
 * @param {object | null} vocab  lint-core's vocabulary, or null to grade without lint (a bare render has none)
 * @param {Array<{ name: string, bucket?: string, density?: unknown }>} components
 * @param {string | undefined} profileOverride
 * @param {(src: string, vocab: object) => any[]} [lint]  the lint pass to use, so the worker can reuse one the editor already asked for
 * @returns {{ scorecard: any, findings: any[] }}
 */
export function assessWith(m, src, vocab, components, profileOverride, lint = (s, v) => m.lintCore.lintTextWith(s, v)) {
	const reviewCore = m.reviewCore;
	const scorecard = m.scorecard;
	if (!reviewCore?.reviewText || !scorecard?.scoreDeck) return { scorecard: null, findings: [] };
	// Lint needs the page vocabulary; the review layer and the scorecard do not. Without one the grade is lint-less:
	// degraded, never fabricated.
	const lintFindings = vocab && m.lintCore?.lintTextWith ? lint(src, vocab) : [];
	const bucketMap = new Map(components.filter((c) => c.bucket).map((c) => [c.name, c.bucket]));
	const densityMap = new Map(components.filter((c) => c.density != null).map((c) => [c.name, c.density]));
	// The profile override rides into BOTH: review-core needs it to pick the prose budgets a finding fires against, and
	// the scorecard needs it to resolve the same genre for the Style half. Passing it to only one would grade a deck
	// against a profile whose findings were generated under a different one.
	const review = reviewCore.reviewText(src, { bucketOf: (n) => bucketMap.get(n) ?? null, densityOf: (n) => densityMap.get(n) ?? null, profileOverride });
	const sc = scorecard.scoreDeck({ source: src, lintFindings, reviewFindings: review, profileOverride });
	return { scorecard: sc, findings: [...lintFindings, ...review] };
}
