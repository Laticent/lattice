import type { SearchQuery } from '@codemirror/search';
import type { EditorState } from '@codemirror/state';

// The find bar's "3 of 12" readout, kept pure so it is testable without a DOM.
//
// `total` stops counting at `cap`. A one-character query over a long deck can match
// tens of thousands of times, and the panel recounts on every edit, so an uncapped
// walk would put a full-document scan on every keystroke. `capped` tells the panel
// to print "999+" instead of a false exact number.
//
// `current` is the 1-based index of the match the main selection sits on, or 0 when
// the selection is not exactly a match (the author moved the caret, or the query
// changed and nothing is selected yet). It is only meaningful below the cap.
export type MatchCount = { total: number; current: number; capped: boolean };

export const MATCH_CAP = 999;

export function countMatches(state: EditorState, query: SearchQuery, cap = MATCH_CAP): MatchCount {
	if (!query.valid || !query.search) return { total: 0, current: 0, capped: false };
	const sel = state.selection.main;
	const cursor = query.getCursor(state) as Iterator<{ from: number; to: number }>;
	let total = 0;
	let current = 0;
	for (let r = cursor.next(); !r.done; r = cursor.next()) {
		total++;
		if (r.value.from === sel.from && r.value.to === sel.to) current = total;
		if (total >= cap) return { total, current, capped: true };
	}
	return { total, current, capped: false };
}

/** The readout text. Empty when there is no query, so the bar shows nothing rather than "0 of 0". */
export function matchLabel(query: SearchQuery, count: MatchCount): string {
	if (!query.search) return '';
	if (!query.valid) return 'Invalid pattern';
	if (count.total === 0) return 'No results';
	if (count.capped) return `${count.total}+`;
	return count.current ? `${count.current} of ${count.total}` : `${count.total} found`;
}
