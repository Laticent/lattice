// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { addPaneTitle, keepPaneMarker, paneChoices, paneDirectionOf, paneMarkerText, setPaneComponent, slidePanes } from './pane-model';

// Compose edits a `columns` / `rows` slide's panes as fields: each pane's component is a picker and
// its `###` title is a field (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md
// §7.2). These arms pin the model under that UI on the real Compose document — where each pane
// starts, what the picker writes, and that an edit never moves a marker.

const MARKED = [
	'<!-- _class: columns ratio-60-40 -->',
	'',
	'## Services outgrew licenses.',
	'',
	'<!-- _pane: bar -->',
	'### Revenue by line',
	'`$M, trailing four quarters`',
	'',
	'- Licenses `42`',
	'- Services `47`',
	'',
	'<!-- _pane: list no-title -->',
	'### What changed',
	'',
	'- Services crossed licenses',
	'',
].join('\n');

const OUTLINE = ['<!-- _class: rows -->', '', '## The migration halved tickets.', '', '### Before', '', '- 1,240 a month', '', '`Since May`', '### After', '', '- 610 a month', ''].join('\n');

const deck = (...slides: string[]) => slides.join('\n\n---\n\n');
const stateOf = (src: string) => EditorState.create({ doc: deckToDoc(src) });
/** Position of slide `i` in the doc. */
const slidePos = (state: EditorState, i: number) => {
	let pos = 0;
	for (let k = 0; k < i; k++) pos += state.doc.child(k).nodeSize;
	return pos;
};
/** Type `text` at the end of the first text block of slide `i`, then emit the deck as the editor does. */
function typeInSlide(src: string, i: number, text: string) {
	let state = stateOf(src);
	const baseline = initBaseline(state.doc);
	let at = -1;
	state.doc.child(i).descendants((n, pos) => {
		if (at < 0 && n.isTextblock) at = slidePos(state, i) + 1 + pos + n.nodeSize - 1;
		return at < 0;
	});
	state = state.apply(state.tr.insertText(text, at));
	return emitDeck(state.doc, baseline);
}

describe('a `_pane` marker stays where the author wrote it', () => {
	it('is not hoisted into the slide head: an edit re-emits each marker above its own pane', () => {
		const out = typeInSlide(MARKED, 0, ' now');
		// Before the fix the splitter took both markers as slide directives, and the edit wrote them
		// above the `##`: the slide lost its panes.
		expect(out.indexOf('<!-- _pane: bar -->')).toBeGreaterThan(out.indexOf('## Services'));
		expect(out.indexOf('<!-- _pane: list no-title -->')).toBeGreaterThan(out.indexOf('- Services `47`'));
		expect(out).toContain('## Services outgrew licenses. now');
	});
	it('an untouched pane slide still round-trips byte for byte', () => {
		const src = deck('## Intro', MARKED);
		expect(typeInSlide(src, 0, '!').endsWith(MARKED.trimEnd())).toBe(true);
	});
	it('keeps a `_pane` line inside a code fence as code', () => {
		const fenced = '## T\n\n```md\n<!-- _pane: bar -->\n```';
		expect(docToDeck(deckToDoc(fenced))).toBe(fenced);
	});
});

describe('slidePanes reads panes with the kernel rule', () => {
	it('reads a marked slide: component, words, title, ratio', () => {
		const info = slidePanes(stateOf(MARKED).doc.child(0));
		expect(info?.direction).toBe('side');
		expect(info?.panes.map((p) => [p.cls, p.mods, p.share])).toEqual([
			['bar', [], 60],
			['list', ['no-title'], 40],
		]);
		const slide = stateOf(MARKED).doc.child(0);
		for (const p of info?.panes ?? []) {
			expect(slide.child(p.marker as number).attrs.text).toMatch(/_pane:/);
			expect(slide.child(p.title as number).textContent).toBe(p.index === 0 ? 'Revenue by line' : 'What changed');
		}
	});
	it('reads an outline slide: every `###` starts a content pane', () => {
		const slide = stateOf(OUTLINE).doc.child(0);
		const info = slidePanes(slide);
		expect(info?.direction).toBe('stack');
		expect(info?.panes.map((p) => [p.cls, p.marker, slide.child(p.title as number).textContent])).toEqual([
			['content', null, 'Before'],
			['content', null, 'After'],
		]);
	});
	it('agrees with the kernel where a node loop would not (the independent review\'s three cases)', () => {
		const titles = (src: string) => {
			const slide = stateOf(src).doc.child(0);
			return slidePanes(slide)?.panes.map((p) => [p.cls, p.title === null ? null : slide.child(p.title).textContent]);
		};
		// A MULTI-LINE note between the marker and `### T` is not "only a pill": T starts the right
		// pane and U folds into it, as the engine renders it.
		expect(titles('<!-- _class: columns -->\n\n## H\n\n<!-- _pane: bar -->\n<!-- a note\nover two lines -->\n\n### T\n\n- A `1`\n\n### U\n\ny')).toEqual([
			['bar', null],
			['content', 'T'],
		]);
		// A BOLD pill is not a pill.
		expect(titles('<!-- _class: columns -->\n\n## H\n\n<!-- _pane: bar -->\n\n**`eb`**\n\n### T\n\n- A `1`\n\n### U\n\ny')).toEqual([
			['bar', null],
			['content', 'T'],
		]);
		// A pill and then a one-line comment still title the marker's pane.
		expect(titles('<!-- _class: columns -->\n\n## H\n\n<!-- _pane: bar -->\n\n`eb`\n\n<!-- note -->\n\n### T\n\n- A `1`\n\n### U\n\ny')).toEqual([
			['bar', 'T'],
			['content', 'U'],
		]);
	});
	it('is null on a slide that is not a pane layout', () => {
		expect(slidePanes(stateOf('<!-- _class: list -->\n\n## T\n\n### A\n\n### B').doc.child(0))).toBeNull();
		expect(paneDirectionOf(['<!-- _class: list dark -->'])).toBeNull();
		expect(paneDirectionOf(['<!-- _class: rows ratio-35-65 -->'])).toBe('stack');
	});
	it('a component that owns its `###`s keeps them: no third pane, no stray title', () => {
		const src = '<!-- _class: columns -->\n\n## T\n\n<!-- _pane: team-profile sides -->\n\n### Board\n\n- A\n\n### Staff\n\n- B\n\n<!-- _pane: list -->\n\n- x';
		const info = slidePanes(stateOf(src).doc.child(0));
		expect(info?.panes.map((p) => [p.cls, p.modifiers, p.title])).toEqual([
			['team-profile', ['sides'], null],
			['list', [], null],
		]);
	});
});

describe('a hidden marker survives a stray keystroke', () => {
	const MARKED_AT = (state: EditorState, text: string) => {
		let at = -1;
		state.doc.descendants((n, pos) => {
			if (at < 0 && n.isTextblock && n.textContent === text) at = pos + 1;
			return at < 0;
		});
		return at;
	};
	it('Backspace at the start of a pane title keeps the marker above it; elsewhere it does nothing special', () => {
		const state = stateOf(MARKED);
		const start = MARKED_AT(state, 'Revenue by line');
		const at = (pos: number) => state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
		expect(keepPaneMarker('backward')(at(start))).toBe(true);
		expect(keepPaneMarker('backward')(at(start + 1))).toBe(false);
		// Delete at the end of the block above the second marker.
		const end = MARKED_AT(state, 'Services 47');
		expect(keepPaneMarker('forward')(at(end + 'Services 47'.length))).toBe(true);
		// Not at the end of that list: an ordinary Delete.
		expect(MARKED_AT(state, 'Licenses 42')).toBeGreaterThan(0);
		expect(keepPaneMarker('forward')(at(MARKED_AT(state, 'Licenses 42') + 3))).toBe(false);
		// The `##` sits under no marker.
		expect(keepPaneMarker('backward')(at(MARKED_AT(state, 'Services outgrew licenses.')))).toBe(false);
	});
});

describe('the pane picker and the title field write what an author would', () => {
	it('rewrites a marker, keeping no-title and dropping the old component\'s modifiers', () => {
		const state = stateOf(MARKED);
		const tr = setPaneComponent(state, 0, 1, 'big-number');
		const out = emitDeck(tr?.doc ?? state.doc, initBaseline(state.doc));
		expect(out).toContain('<!-- _pane: big-number no-title -->\n\n### What changed');
		expect(out).not.toContain('_pane: list');
		expect(setPaneComponent(state, 0, 0, 'bar')).toBeNull(); // already bar
	});
	it('writes a marker right above the `###` of a pane that has none, leaving a pill above it where the engine renders it', () => {
		const state = stateOf(OUTLINE);
		const tr = setPaneComponent(state, 0, 1, 'kpi');
		const out = emitDeck(tr?.doc ?? state.doc, initBaseline(state.doc));
		// The pill closes the first pane (the engine renders it there), so it stays above the marker.
		expect(out).toContain('`Since May`\n\n<!-- _pane: kpi -->\n\n### After');
		// The rewritten slide still reads as two panes, the second now `kpi`.
		const again = slidePanes(deckToDoc(out).child(0));
		expect(again?.panes.map((p) => p.cls)).toEqual(['content', 'kpi']);
	});
	it('adds a title under a marker and selects it for typing', () => {
		const src = '<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar -->\n\n- A `4`\n\n<!-- _pane: list -->\n\n### Notes\n\n- x';
		const state = stateOf(src);
		const tr = addPaneTitle(state, 0, 0);
		expect(tr).not.toBeNull();
		const next = state.apply(tr as NonNullable<typeof tr>);
		expect(next.doc.textBetween(next.selection.from, next.selection.to)).toBe('Pane title');
		expect(emitDeck(next.doc, initBaseline(state.doc))).toContain('<!-- _pane: bar -->\n\n### Pane title\n\n- A `4`');
		expect(addPaneTitle(state, 0, 1)).toBeNull(); // pane 2 has a title
	});
	it('offers content first, never a host, and only components that fit the pane', () => {
		const side = paneChoices('side', 50);
		expect(side[0]).toBe('content');
		expect(side).not.toContain('columns');
		expect(side).not.toContain('rows');
		expect(side).toContain('bar');
		// A narrow stacked pane offers fewer components than a half-width column.
		expect(paneChoices('stack', 35).length).toBeLessThan(side.length);
		expect(paneMarkerText('kpi', ['no-title'])).toBe('<!-- _pane: kpi no-title -->');
	});
});
