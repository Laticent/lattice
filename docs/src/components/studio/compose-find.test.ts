import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from '@/lib/compose/deck-doc';
import { composeFindPlugin, EMPTY_QUERY, type FindQuery, findCount, findMatches, findState, queryRegExp, replaceAllTr, replacementFor, replaceOneTr, setQueryTr, stepTr } from './compose-find';

// Compose's find engine, on the real Compose document (deckToDoc), not a stand-in.

const DECK = [
	'<!-- _class: title -->\n\n# The **plan** for the year',
	'<!-- _class: content -->\n\n## Plans\n\n- The plan ships\n- A planner reviews the plan',
	// Math in a cell locks the slide (deck-doc.ts): Compose cannot round-trip it.
	'<!-- _class: content -->\n\n## Locked\n\n| Shape | Area |\n| --- | --- |\n| plan | $\\pi r^2$ |',
].join('\n\n---\n\n');

const q = (search: string, more: Partial<FindQuery> = {}): FindQuery => ({ ...EMPTY_QUERY, search, ...more });

function stateWith(query: FindQuery) {
	let current = query;
	const state = EditorState.create({ doc: deckToDoc(DECK), plugins: [composeFindPlugin(() => current)] });
	const set = (s: EditorState, next: FindQuery) => {
		current = next;
		return s.apply(setQueryTr(s, next, false));
	};
	return { state: set(state, query), set };
}

describe('findMatches', () => {
	it('finds text across marks: **plan** is three text nodes but one word', () => {
		const doc = deckToDoc(DECK);
		const { matches } = findMatches(doc, q('the plan'));
		// "The **plan**" on slide 1, "The plan ships", "the plan" on slide 2.
		expect(matches.length).toBe(3);
		expect(doc.textBetween(matches[0].from, matches[0].to)).toBe('The plan');
	});

	it('honors match case, whole word and regular expressions', () => {
		const doc = deckToDoc(DECK);
		expect(findMatches(doc, q('plan')).matches.length).toBe(6); // includes "Plans", "planner", the locked cell
		expect(findMatches(doc, q('plan', { wholeWord: true })).matches.length).toBe(4);
		expect(findMatches(doc, q('Plan', { caseSensitive: true })).matches.length).toBe(1);
		expect(findMatches(doc, q('plan(ner|s)', { regexp: true })).matches.length).toBe(2);
		expect(queryRegExp(q('(', { regexp: true }))).toBeNull();
	});

	it('marks a match inside a locked slide', () => {
		const doc = deckToDoc(DECK);
		const ms = findMatches(doc, q('plan', { wholeWord: true })).matches;
		expect(ms.map((m) => m.locked)).toEqual([false, false, false, true]);
	});

	it('stops at the cap and says so', () => {
		const r = findMatches(deckToDoc(DECK), q('a'), 3);
		expect(r.matches.length).toBe(3);
		expect(r.capped).toBe(true);
	});
});

describe('stepping and replacing', () => {
	it('steps through matches, wrapping, and counts "n of m"', () => {
		const { state } = stateWith(q('plan', { wholeWord: true }));
		let s = state;
		const seen: number[] = [];
		for (let i = 0; i < 5; i++) {
			const tr = stepTr(s, 1);
			expect(tr).not.toBeNull();
			s = s.apply(tr!);
			seen.push(findCount(s).current);
		}
		expect(seen).toEqual([1, 2, 3, 4, 1]);
		expect(findCount(s).total).toBe(4);
		s = s.apply(stepTr(s, -1)!);
		expect(findCount(s).current).toBe(4);
	});

	it('Replace first steps to a match, then replaces it and moves on', () => {
		const { state } = stateWith(q('plan', { wholeWord: true, replace: 'roadmap' }));
		let s = state;
		const first = replaceOneTr(s);
		s = s.apply(first.tr!);
		expect(findCount(s).current).toBe(1); // stepped, nothing replaced yet
		expect(docToDeck(s.doc)).not.toContain('roadmap');
		s = s.apply(replaceOneTr(s).tr!);
		expect(docToDeck(s.doc)).toContain('The **roadmap** for the year');
		expect(findCount(s).total).toBe(3);
		expect(findCount(s).current).toBe(1); // on the next one
	});

	it('Replace all changes every editable match in one step and skips the locked slide', () => {
		const { state } = stateWith(q('plan', { wholeWord: true, replace: 'roadmap' }));
		const r = replaceAllTr(state);
		expect(r).toMatchObject({ replaced: 3, skipped: 1 });
		const after = docToDeck(state.apply(r.tr!).doc);
		expect(after).toContain('The **roadmap** for the year');
		expect(after).toContain('- The roadmap ships');
		expect(after).toContain('- A planner reviews the roadmap');
		expect(after).toContain('| plan |'); // the locked slide is untouched
	});

	it('a lookbehind or lookahead replaces with its context in view', () => {
		const { state } = stateWith(q('(?<=A )plan(?=ner)', { regexp: true, replace: 'road' }));
		const r = replaceAllTr(state);
		expect(r.replaced).toBe(1);
		expect(docToDeck(state.apply(r.tr!).doc)).toContain('- A roadner reviews the plan');
	});

	it('expands $&, $<name> and $$, and leaves a missing group literal', () => {
		const groups = ['planner', 'plan'];
		const rq = (replace: string) => ({ ...EMPTY_QUERY, search: 'x', regexp: true, replace });
		expect(replacementFor({ groups }, rq('[$&]'))).toBe('[planner]');
		expect(replacementFor({ groups, named: { w: 'plan' } }, rq('$<w>s'))).toBe('plans');
		expect(replacementFor({ groups }, rq('$$1 $10 $2'))).toBe('$1 plan0 $2');
	});

	it('accepts the escapes CodeMirror accepts (no u flag unless whole word)', () => {
		expect(queryRegExp(q('a\\-b', { regexp: true }))).not.toBeNull();
	});

	it('a regular expression replacement expands $1', () => {
		const { state } = stateWith(q('(plan)ner', { regexp: true, replace: '$1 owner' }));
		const after = docToDeck(state.apply(replaceAllTr(state).tr!).doc);
		expect(after).toContain('- A plan owner reviews the plan');
	});

	it('typing jumps to the first match after the caret AND keeps the new query', () => {
		const { state } = stateWith(EMPTY_QUERY);
		const s = state.apply(setQueryTr(state, q('plan', { wholeWord: true }), true));
		expect(findState(s)?.query.search).toBe('plan');
		expect(findCount(s)).toMatchObject({ total: 4, current: 1 });
	});

	it('the query survives a rebuilt EditorState (Compose resyncs on external changes)', () => {
		const { state } = stateWith(q('plan', { wholeWord: true }));
		const rebuilt = EditorState.create({ doc: state.doc, plugins: state.plugins });
		expect(findState(rebuilt)?.query.search).toBe('plan');
		expect(findCount(rebuilt).total).toBe(4);
	});
});
