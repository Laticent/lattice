import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { MATCH_CAP, type MatchCount } from './find-matches';

// Find and replace for COMPOSE, the ProseMirror editing mode.
//
// The Markdown editor's find rides CodeMirror's search engine (find-panel.tsx). Compose is
// a different editor, so it gets its own engine here, and both feed the same bar
// (`FindBar` takes a `FindTarget`). The owner's call, 2026-10-05: find in Compose does what
// it does in the Markdown editor, and the browser engine's own find bar never shows.
//
// WHAT IT SEARCHES: the text the author sees in Compose, one textblock (a paragraph, a
// heading, a list item's line, a table cell, a code block) at a time. A match never spans
// two blocks, which is also how CodeMirror behaves across lines for a plain query.
//
// LOCKED SLIDES. Compose locks a slide it cannot round-trip (deck-doc.ts) and its
// structural guard refuses any edit to one. Matches there are still found and shown, but
// replace skips them and says how many it skipped, rather than failing in silence.

export type FindQuery = { search: string; replace: string; caseSensitive: boolean; regexp: boolean; wholeWord: boolean };
export type FindMatch = { from: number; to: number; locked: boolean; groups?: (string | undefined)[]; named?: Record<string, string | undefined> };

export const EMPTY_QUERY: FindQuery = { search: '', replace: '', caseSensitive: false, regexp: false, wholeWord: false };

/** The query as a global RegExp, or null when it is empty or not a valid pattern. */
export function queryRegExp(q: FindQuery): RegExp | null {
	if (!q.search) return null;
	let source = q.regexp ? q.search : q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// A word edge in Unicode terms: no letter, digit or underscore on either side. `\p{}`
	// needs the `u` flag, so only whole word sets it: `u` also rejects escapes such as `\-`
	// that CodeMirror's search (the Markdown editor's) accepts, and the two should agree.
	if (q.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
	try {
		return new RegExp(source, `g${q.wholeWord ? 'u' : ''}${q.caseSensitive ? '' : 'i'}`);
	} catch {
		return null;
	}
}

export function queryValid(q: FindQuery): boolean {
	return !q.search || queryRegExp(q) !== null;
}

/**
 * Every match in the document, in order, up to `cap`. Each textblock is read as one string
 * with a position map, because marks (bold, a link) split a run of text into several text
 * nodes and a match must not care. An inline non-text node (an image, a hard break) stands
 * in as one object-replacement character so positions stay aligned.
 */
export function findMatches(doc: PMNode, q: FindQuery, cap = MATCH_CAP): { matches: FindMatch[]; capped: boolean } {
	const re = queryRegExp(q);
	const matches: FindMatch[] = [];
	if (!re) return { matches, capped: false };
	let capped = false;
	doc.descendants((node, pos) => {
		if (capped) return false;
		if (!node.isTextblock) return true;
		let text = '';
		const starts: { at: number; pos: number; text: boolean }[] = [];
		node.forEach((child, offset) => {
			starts.push({ at: text.length, pos: pos + 1 + offset, text: child.isText });
			text += child.isText ? (child.text ?? '') : '￼';
		});
		const toPos = (i: number): number => {
			let seg = starts[0];
			for (const s of starts) {
				if (s.at > i) break;
				seg = s;
			}
			return seg ? seg.pos + (seg.text ? i - seg.at : 0) : pos + 1;
		};
		const locked = !!doc.resolve(pos).node(1)?.attrs.locked;
		re.lastIndex = 0;
		for (let m = re.exec(text); m; m = re.exec(text)) {
			if (m[0].length === 0) {
				re.lastIndex++;
				continue;
			}
			const match: FindMatch = { from: toPos(m.index), to: toPos(m.index + m[0].length - 1) + 1, locked };
				// A regular expression's groups, captured here where the whole block is in view:
				// re-running the pattern on the matched text alone loses the context a
				// lookbehind or lookahead needs, and `(?<=a)b` would then match nothing.
				if (q.regexp) {
					match.groups = [...m];
					match.named = m.groups;
				}
				matches.push(match);
			if (matches.length >= cap) {
				capped = true;
				return false;
			}
		}
		return false;
	});
	return { matches, capped };
}

/**
 * The text a match becomes. For a regular expression, `$&`, `$1`..`$99`, `$<name>` and `$$`
 * expand as in `String.prototype.replace` (and CodeMirror), from the groups `findMatches`
 * captured. A `$n` past the last group stays literal text.
 */
export function replacementFor(match: Pick<FindMatch, 'groups' | 'named'>, q: FindQuery): string {
	if (!q.regexp || !match.groups) return q.replace;
	const g = match.groups;
	return q.replace.replace(/\$(\$|&|<([^>]*)>|(\d\d?))/g, (all, tok: string, name?: string, num?: string) => {
		if (tok === '$') return '$';
		if (tok === '&') return g[0] ?? '';
		if (name !== undefined) return match.named ? (match.named[name] ?? '') : all;
		if (num) {
			const two = Number(num);
			if (num.length === 2 && two >= 1 && two < g.length) return g[two] ?? '';
			const one = Number(num[0]);
			if (one >= 1 && one < g.length) return (g[one] ?? '') + num.slice(1);
		}
		return all;
	});
}

type FindState = { query: FindQuery; matches: FindMatch[]; capped: boolean; current: number; decos: DecorationSet };
type FindMeta = { query?: FindQuery; current?: number };

export const composeFindKey = new PluginKey<FindState>('cs-find');

function build(doc: PMNode, query: FindQuery, current: number): FindState {
	const { matches, capped } = findMatches(doc, query);
	const cur = current >= 0 && current < matches.length ? current : -1;
	const decos = DecorationSet.create(
		doc,
		matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === cur ? 'cs-find-match cs-find-current' : 'cs-find-match' })),
	);
	return { query, matches, capped, current: cur, decos };
}

/**
 * The plugin. `getQuery` seeds a fresh state: Compose rebuilds its EditorState when an
 * external change lands (a resync), and the open bar's query must survive that. `isOpen`
 * gates the highlights: a closed bar keeps its query for the next Ctrl+F (as CodeMirror
 * does) but paints nothing.
 */
export function composeFindPlugin(getQuery: () => FindQuery, isOpen: () => boolean = () => true) {
	return new Plugin<FindState>({
		key: composeFindKey,
		state: {
			init: (_, state) => build(state.doc, getQuery(), -1),
			apply(tr, prev) {
				const meta = tr.getMeta(composeFindKey) as FindMeta | undefined;
				if (!meta && !tr.docChanged) return prev;
				const query = meta?.query ?? prev.query;
				let current = meta?.current ?? prev.current;
				if (tr.docChanged && meta?.current === undefined && current >= 0) {
					// Keep "the current match" on the one at (or after) where it was.
					const at = tr.mapping.map(prev.matches[current]?.from ?? 0);
					const next = build(tr.doc, query, -1);
					current = next.matches.findIndex((m) => m.from >= at);
					return build(tr.doc, query, current);
				}
				return build(tr.doc, query, current);
			},
		},
		props: {
			decorations: (state) => (isOpen() ? composeFindKey.getState(state)?.decos : undefined) ?? DecorationSet.empty,
		},
	});
}

export function findState(state: EditorState): FindState | undefined {
	return composeFindKey.getState(state);
}

export function findCount(state: EditorState): MatchCount {
	const s = findState(state);
	if (!s) return { total: 0, current: 0, capped: false };
	return { total: s.matches.length, current: s.current + 1, capped: s.capped };
}

/** Set the query. `jump` moves to the first match at or after the caret, as typing does. */
export function setQueryTr(state: EditorState, query: FindQuery, jump: boolean): Transaction {
	const tr = state.tr.setMeta(composeFindKey, { query, current: -1 } satisfies FindMeta);
	if (!jump) return tr;
	const { matches } = findMatches(state.doc, query);
	if (!matches.length) return tr;
	const from = state.selection.from;
	let i = matches.findIndex((m) => m.to > from);
	if (i < 0) i = 0;
	return goTo(tr, matches[i].from, i);
}

function goTo(tr: Transaction, pos: number, index: number): Transaction {
	// A collapsed caret at the match, not a selection over it: a text selection would raise
	// Compose's floating formatting bar on every step through the matches.
	// Merged, not replaced: `setMeta` overwrites, and a jump from `setQueryTr` already carries
	// the new query under the same key.
	const prior = (tr.getMeta(composeFindKey) as FindMeta | undefined) ?? {};
	return tr.setSelection(TextSelection.create(tr.doc, pos)).setMeta(composeFindKey, { ...prior, current: index } satisfies FindMeta);
}

/** Step to the next (dir 1) or previous (dir -1) match, wrapping. Null when there is none. */
export function stepTr(state: EditorState, dir: 1 | -1): Transaction | null {
	const s = findState(state);
	if (!s?.matches.length) return null;
	let i: number;
	if (s.current >= 0) i = (s.current + dir + s.matches.length) % s.matches.length;
	else {
		const from = state.selection.from;
		if (dir === 1) {
			i = s.matches.findIndex((m) => m.from >= from);
			if (i < 0) i = 0;
		} else {
			i = s.matches.length - 1;
			for (let k = s.matches.length - 1; k >= 0; k--) {
				if (s.matches[k].from < from) {
					i = k;
					break;
				}
			}
		}
	}
	return goTo(state.tr, s.matches[i].from, i);
}

/**
 * Replace the current match and move to the next one. With no current match this only
 * steps to the next one, so the author sees what Replace will change before it does.
 * `skipped` reports a current match inside a locked slide.
 */
export function replaceOneTr(state: EditorState): { tr: Transaction | null; skipped: boolean } {
	const s = findState(state);
	if (!s?.matches.length) return { tr: null, skipped: false };
	if (s.current < 0) return { tr: stepTr(state, 1), skipped: false };
	const m = s.matches[s.current];
	if (m.locked) return { tr: stepTr(state, 1), skipped: true };
	const text = replacementFor(m, s.query);
	const tr = state.tr.insertText(text, m.from, m.to);
	const after = m.from + text.length;
	const { matches } = findMatches(tr.doc, s.query);
	const i = matches.findIndex((n) => n.from >= after);
	if (i >= 0) return { tr: goTo(tr, matches[i].from, i), skipped: false };
	return { tr: tr.setMeta(composeFindKey, { current: -1 } satisfies FindMeta), skipped: false };
}

/** Replace every match outside a locked slide, in one undoable step. */
export function replaceAllTr(state: EditorState): { tr: Transaction | null; replaced: number; skipped: number } {
	const s = findState(state);
	if (!s?.matches.length) return { tr: null, replaced: 0, skipped: 0 };
	// The cap bounds the readout, not the edit: replace all reaches every match.
	const { matches } = findMatches(state.doc, s.query, Number.POSITIVE_INFINITY);
	const tr = state.tr;
	let replaced = 0;
	let skipped = 0;
	for (let k = matches.length - 1; k >= 0; k--) {
		const m = matches[k];
		if (m.locked) {
			skipped++;
			continue;
		}
		tr.insertText(replacementFor(m, s.query), m.from, m.to);
		replaced++;
	}
	if (!replaced) return { tr: null, replaced, skipped };
	return { tr: tr.setMeta(composeFindKey, { current: -1 } satisfies FindMeta), replaced, skipped };
}
