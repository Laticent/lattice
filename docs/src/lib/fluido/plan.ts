import type { Family, Move, Run, SeamReading, SlideFacts } from './types.js';

/** One structural element per body page (engineering/decisions/2026-09-01-autosplit-splits-on-structure.md). */
export const ONE_PER_PAGE = 1;

/**
 * The most pages one slide may become. A deck that asks for more rings instead: a forged or
 * runaway seam (`data-fluid-budget="0"` on a 1,000-row table) must not cost a reader thousands
 * of pages. The longest run in 402 shipped decks at every size is 41 pages, measured 2026-10-27.
 */
export const MAX_PAGES = 64;

/**
 * Whether a run the host BUILT may ship. The host counts the pages it actually made, cover and
 * closing included when it made them, so the cap holds however the run was built: a plain cut,
 * a component's recipe, or a budget rescue. Past the cap the slide stays one page and rings.
 * (A first version estimated the count up front, assumed every run had a cover and a closing
 * page, and missed recipe-built runs entirely; an independent check caught both.)
 */
export function fitsCap(pages: number): boolean {
	return Number.isInteger(pages) && pages >= 0 && pages <= MAX_PAGES;
}

/**
 * Whether a box of this family paginates at all. A `wide` box never does: overflow there is a
 * layout defect, and the honest terminal is the clip (engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md).
 */
export function paginates(family: Family): boolean {
	return family !== 'wide';
}

/**
 * Decide what one slide becomes. Pure: the same facts give the same move. A host that would
 * rather not read the seam up front passes `readSeam`, which runs only when the opt-outs, the
 * enrollment and the recipe have not already decided.
 *
 * The order is the policy. An opt-out wins over everything; a slide with no declared seam stays
 * whole; a recipe is tried before the derived seam, and a declining recipe yields to the derived
 * seam only when its refusal means "not my shape"; and a single member stays whole because there
 * is no smaller cut to make. The page cap is checked on the run the host builds (`fitsCap`).
 */
export function planSlide(facts: SlideFacts, readSeam?: () => SeamReading): Move {
	if (facts.optOut) return { kind: 'whole', reason: 'opt-out' };
	if (!facts.enrolled) return { kind: 'whole', reason: 'not-enrolled' };
	const recipe = facts.recipe ?? null;
	if (recipe && !facts.reSplit && !facts.recipeDeclined) return { kind: 'recipe', strategy: recipe.strategy };
	if (recipe && facts.recipeDeclined && !recipe.shapeReader) return { kind: 'whole', reason: 'recipe-veto' };
	const reading: SeamReading =
		facts.seam !== undefined || !readSeam ? { seam: facts.seam ?? null, members: facts.members ?? 0 } : readSeam();
	const seam = reading.seam;
	if (!seam) return { kind: 'whole', reason: 'no-seam' };
	const members = reading.members;
	if (members <= ONE_PER_PAGE) return { kind: 'whole', reason: 'one-member' };
	return { kind: 'paginate', seam, perPage: ONE_PER_PAGE, envelope: !facts.reSplit };
}

/**
 * The budget rescue: cut ONE member that holds more units than its budget (code lines, table
 * rows, list items) into runs of at most `budget` units each. `null` when the member fits its
 * budget. The host checks the run it builds from these with `fitsCap`. This is the deterministic rescue files use
 * (engineering/decisions/2026-10-27-fluid-layout-library.md §5.5); a live surface may later
 * cut on measured heights instead.
 */
export function rescueRuns(units: number, budget: number): Run[] | null {
	if (!Number.isInteger(units) || units < 0) return null;
	const per = Number.isInteger(budget) && budget > 0 ? budget : 0;
	if (!per || units <= per) return null;
	const runs: Run[] = [];
	for (let from = 0; from < units; from += per) runs.push({ from, to: Math.min(units, from + per) });
	return runs;
}
