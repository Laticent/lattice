import { SearchQuery } from '@codemirror/search';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { countMatches, MATCH_CAP, matchLabel } from './find-matches';

const DECK = '# Revenue\n\nRevenue grew.\n\n---\n\n## revenue by region';

const at = (doc: string, from: number, to: number) => EditorState.create({ doc, selection: EditorSelection.single(from, to) });

describe('countMatches', () => {
	it('counts case-insensitively by default and case-sensitively when asked', () => {
		const s = at(DECK, 0, 0);
		expect(countMatches(s, new SearchQuery({ search: 'revenue' })).total).toBe(3);
		expect(countMatches(s, new SearchQuery({ search: 'revenue', caseSensitive: true })).total).toBe(1);
	});

	it('reports the match the selection sits on, 1-based', () => {
		const second = DECK.indexOf('Revenue grew');
		const s = at(DECK, second, second + 'Revenue'.length);
		expect(countMatches(s, new SearchQuery({ search: 'revenue' }))).toEqual({ total: 3, current: 2, capped: false });
	});

	it('reports current 0 when the selection is not exactly a match', () => {
		const s = at(DECK, 3, 3);
		expect(countMatches(s, new SearchQuery({ search: 'revenue' })).current).toBe(0);
	});

	it('stops at the cap and says so', () => {
		const s = at('a'.repeat(MATCH_CAP + 50), 0, 0);
		expect(countMatches(s, new SearchQuery({ search: 'a' }))).toEqual({ total: MATCH_CAP, current: 0, capped: true });
	});

	it('returns nothing for an empty or invalid query instead of throwing', () => {
		const s = at(DECK, 0, 0);
		expect(countMatches(s, new SearchQuery({ search: '' })).total).toBe(0);
		expect(countMatches(s, new SearchQuery({ search: '(', regexp: true })).total).toBe(0);
	});
});

describe('matchLabel', () => {
	const q = (search: string, regexp = false) => new SearchQuery({ search, regexp });
	it('reads the way the bar shows it', () => {
		expect(matchLabel(q(''), { total: 0, current: 0, capped: false })).toBe('');
		expect(matchLabel(q('(', true), { total: 0, current: 0, capped: false })).toBe('Invalid pattern');
		expect(matchLabel(q('x'), { total: 0, current: 0, capped: false })).toBe('No results');
		expect(matchLabel(q('x'), { total: 12, current: 3, capped: false })).toBe('3 of 12');
		expect(matchLabel(q('x'), { total: 12, current: 0, capped: false })).toBe('12 found');
		expect(matchLabel(q('x'), { total: MATCH_CAP, current: 0, capped: true })).toBe(`${MATCH_CAP}+`);
	});
});
