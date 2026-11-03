/**
 * Might a deck ask for the MEASURED split (`fit: pack`)? A cheap, eager first look: any `fit:`
 * line at all. Only a deck that passes loads `measured-split.ts`, whose `measuredSplitWanted` reads
 * the key exactly as the CLI does. Kept this small because it rides every preview's eager bundle
 * (docs/route-budget.json); 2026-10-28-fit-everywhere-model.md §16.
 */
export const mayWantMeasuredSplit = (source: string): boolean => /^[ \t]*fit[ \t]*:/im.test(source);
