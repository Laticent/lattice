/**
 * Might a deck split by measurement? Always yes, before the exact read. Measuring is the DEFAULT
 * (2026-10-28-fit-everywhere-model.md §16, §18), so nearly every deck loads `measured-split.ts`,
 * whose `measuredSplitWanted` calls the CLI's own `fitPacks` and decides exactly. An eager pattern
 * that tried to spot the few decks that opt out (`fit: heal`, `trim`, `report`, the old `guards:`)
 * disagreed with that reader on nine inputs a checker found (a body line, a repeated key, a block
 * scalar, an unclosed front matter, …), so a preview could split by count while the export measured
 * (HARD RULE #1). Kept as a function so its three callers keep one seam if a cheap test earns its
 * place again.
 */
export const mayWantMeasuredSplit = (_source: string): boolean => true;
