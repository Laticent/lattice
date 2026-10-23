import { describe, expect, it } from 'vitest';
import { diffFlash, FLASH_MAX_BLOCKS } from './change-flash';
import { deckToDoc } from './deck-doc';

const words = (doc: ReturnType<typeof deckToDoc>, r: { from: number; to: number }) => doc.textBetween(r.from, r.to);

describe('diffFlash', () => {
	const BASE = '## Plan\n\nThe launch is on Monday.\n\nClosing words.';

	it('points at the exact inserted words inside the changed line', () => {
		const next = deckToDoc(BASE.replace('Monday', 'Tuesday morning'));
		const spec = diffFlash(deckToDoc(BASE), next);
		expect(spec?.blocks).toHaveLength(1);
		expect(spec?.spans).toHaveLength(1);
		expect(words(next, (spec?.spans[0]) as { from: number; to: number })).toBe('Tuesday morning');
	});

	it('paints only the line that changed', () => {
		const next = deckToDoc(BASE.replace('Closing words.', 'Closing remarks.'));
		const spec = diffFlash(deckToDoc(BASE), next);
		expect(spec?.blocks).toHaveLength(1);
		expect(next.textBetween((spec?.blocks[0]?.from ?? 0) + 1, (spec?.blocks[0]?.to ?? 0) - 1)).toBe('Closing remarks.');
	});

	it('marks the place where words were deleted and nothing was added', () => {
		const spec = diffFlash(deckToDoc(BASE), deckToDoc(BASE.replace(' on Monday', '')));
		expect(spec?.blocks).toHaveLength(1);
		expect(spec?.spans).toHaveLength(0);
		expect(spec?.gaps).toHaveLength(1);
	});

	it('finds the change when a line is added', () => {
		const next = deckToDoc(BASE.replace('Closing words.', 'A new line.\n\nClosing words.'));
		const spec = diffFlash(deckToDoc(BASE), next);
		expect(spec?.blocks.length).toBeGreaterThan(0);
		expect(spec?.blocks.length).toBeLessThanOrEqual(2);
	});

	it('paints nothing for an identical deck', () => {
		expect(diffFlash(deckToDoc(BASE), deckToDoc(BASE))).toBeNull();
	});

	it('paints nothing when the change is too wide to point at', () => {
		const many = (tag: string) => Array.from({ length: FLASH_MAX_BLOCKS + 2 }, (_, i) => `Line ${i} ${tag}.`).join('\n\n');
		expect(diffFlash(deckToDoc(many('a')), deckToDoc(many('b')))).toBeNull();
	});

	it('paints nothing when slides only swapped places', () => {
		const deck = (x: string, y: string) => `## ${x}\n\nbody ${x}\n\n---\n\n## ${y}\n\nbody ${y}\n\n---\n\n## Three\n\nbody three`;
		expect(diffFlash(deckToDoc(deck('One', 'Two')), deckToDoc(deck('Two', 'One')))).toBeNull();
	});
});
