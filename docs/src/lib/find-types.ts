// THE FIND BAR'S MODEL — what the bar (FindBar.tsx) says to whichever editor is on screen. Kept apart from the editors'
// adapters (find-replace.ts for CodeMirror, compose/find-target.ts for ProseMirror) and free of their imports, so loading
// one editor never loads the other's search code.
//
// A status is the number of matches and which one the selection is on (1-based; 0 when the selection is on none), so the
// bar can say "3/12".

export type FindQuery = { search: string; replace: string; caseSensitive: boolean };
export type FindStatus = { count: number; current: number };
export const NO_MATCHES: FindStatus = { count: 0, current: 0 };

export interface FindTarget {
	/** Search for `query`, highlight every match, and say how many there are. Moves nothing. */
	setQuery(query: FindQuery): FindStatus;
	/** Select the next match after the selection (wrapping), and bring it into view. */
	next(): FindStatus;
	/** Select the match before the selection (wrapping). */
	prev(): FindStatus;
	/** Replace the selected match, if the selection is on one, then select the next. */
	replace(): FindStatus;
	/** Replace every match as one undo step. Returns how many were replaced. */
	replaceAll(): number;
	/** Drop the highlights (the bar closed). */
	clear(): void;
}
