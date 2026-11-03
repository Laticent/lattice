/**
 * Does a deck ask for the MEASURED split? `fit: pack` in its front matter
 * (lib/base/base.registers.docs.md, the `fit:` register; 2026-10-28-fit-everywhere-model.md §16).
 * Every browser surface asks this one question before loading `measured-split.ts`, so the Studio,
 * the Playground and the webpage export split a deck the same way the CLI does (HARD RULE #1).
 * It reads the key with the engine's own reader (`frontMatterName`), the one the CLI's `fitPacks`
 * calls, so case, indentation, quoting, comments and a repeated key resolve the same on both sides.
 */
import frontMatterKey from '../../../lib/core/front-matter-key.js';

const { frontMatterName } = frontMatterKey;

export function measuredSplitWanted(source: string): boolean {
	const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!fm) return false;
	const fit = frontMatterName(fm[1], 'fit') as string | null;
	return typeof fit === 'string' && fit.trim().toLowerCase() === 'pack';
}
