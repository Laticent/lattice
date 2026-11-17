import { describe, expect, it } from 'vitest';
import { browseLabel, START_SLIDES, startPicks } from './EmptyDeckStart';
import type { PickerItem } from './SlidePicker';

// The start grid's choices (engineering/decisions/2026-11-17-compose-empty-deck.md; the checker on #3273).
const item = (name: string, bucket = 'anchor'): PickerItem => ({ name, bucket, description: '', skeleton: `<!-- _class: ${name} -->` });

describe('the empty deck start grid', () => {
	it('offers the four starting slides in order, from the catalog', () => {
		const items = [item('big-number', 'evidence'), item('content', 'statement'), item('title'), item('cards-grid', 'inventory'), item('quote', 'statement')];
		expect(startPicks(items).map((i) => i.name)).toEqual([...START_SLIDES]);
	});

	it('never lets a saved local component stand in for a starting slide', () => {
		const items = [item('title', 'local'), item('content', 'local'), item('title'), item('content', 'statement'), item('cards-grid', 'inventory'), item('big-number', 'evidence')];
		const picks = startPicks(items);
		expect(picks.map((i) => i.bucket)).not.toContain('local');
		expect(picks).toHaveLength(4);
	});

	it('names no count until the catalog has loaded', () => {
		expect(browseLabel(0)).toBe('Browse all layouts');
		expect(browseLabel(80)).toBe('Browse all 80 layouts');
	});
});
