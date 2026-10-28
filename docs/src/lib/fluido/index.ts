/**
 * fluido — decide how content fits the box it is shown in. Pure and synchronous: facts about a
 * rendered slide in, a decision out, with no DOM, no I/O and no dependencies. The host reads the
 * facts from its own markup and builds the pages; Fluido owns the policy between the two, so
 * every surface that asks gets the same answer.
 *
 * Today it holds the structural plan (`planSlide`), the size gate (`paginates`) and the budget
 * rescue (`rescueRuns`). The measured rescue and the DOM adapter follow
 * (engineering/decisions/2026-10-27-fluid-layout-library.md §8).
 */

export { fitsCap, MAX_PAGES, ONE_PER_PAGE, paginates, planSlide, rescueRuns } from './plan.js';
export type { Family, Move, Run, SeamReading, SlideFacts, WholeReason } from './types.js';
