// @vitest-environment jsdom
// The pane gallery's model: what a component does to a pane's content when it is picked
// (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2). jsdom, because the fit
// test serializes the pane through the schema's own `toDOM` and queries the grammar's selectors.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { history, undo } from 'prosemirror-history';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, emitDeck, initBaseline } from './deck-doc';
import { applyPaneChoice, paneBodyRange, paneFit, paneMarkerGuard, paneStarter, slidePanes, starterEditable } from './pane-model';
import { marksOf, paneNeedsFrom } from './pane-needs';

const DIST = join(__dirname, '../../../../dist/docs');
const grammar = JSON.parse(readFileSync(join(DIST, 'grammar.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(DIST, 'components.json'), 'utf8'));
const NEEDS = paneNeedsFrom(grammar.components, Object.fromEntries(catalog.components.map((c: { name: string; substance?: string }) => [c.name, c.substance || ''])));
const SKELETON = Object.fromEntries(grammar.components.map((c: { name: string; skeleton: string }) => [c.name, c.skeleton]));

const SLIDE = [
	'<!-- _class: columns -->',
	'',
	'## The slide\'s point, in one line.',
	'',
	'### First pane',
	'',
	'- A point',
	'- Another point',
	'',
	'### Second pane',
	'',
	'- A point',
	'- Another point',
	'',
	'> The slide\'s Key Insight.',
].join('\n');

const stateOf = (src: string) => EditorState.create({ doc: deckToDoc(src), plugins: [history(), paneMarkerGuard()] });
const fitOf = (src: string, index: number) => {
	const slide = deckToDoc(src).child(0);
	const info = slidePanes(slide);
	if (!info) throw new Error('not a pane slide');
	return paneFit(slide, info, index, NEEDS, document);
};

describe('what each component would do to a pane', () => {
	it('a list keeps its text under list-shaped components, and starts fresh under a table, a chart without numbers, a numbered kpi', () => {
		const outcome = fitOf(SLIDE, 0);
		for (const cls of ['content', 'list', 'cards-grid', 'checklist']) expect([cls, outcome(cls)]).toEqual([cls, 'keeps']);
		for (const cls of ['table', 'bar', 'kpi', 'quote', 'diagram']) expect([cls, outcome(cls)]).toEqual([cls, 'fresh']);
	});
	it('a chart keeps a list that carries values', () => {
		const outcome = fitOf(SLIDE.replace('- A point\n- Another point', '- Licenses `42`\n- Services `47`'), 0);
		expect(outcome('bar')).toBe('keeps');
		expect(outcome('line')).toBe('keeps');
	});
	it('a plain list does not "keep" under a component whose example labels every item: it would read as a contact card', () => {
		// The owner's question on PR 2520: shape matched, meaning did not. A plain "- A point" filled
		// contact's and actors' one required slot, so the tile promised the text would keep.
		const outcome = fitOf(SLIDE, 0);
		for (const cls of ['contact', 'actors', 'statute-stack', 'wifi', 'logo-wall', 'flowchart', 'pricing', 'big-number']) expect([cls, outcome(cls)]).toEqual([cls, 'fresh']);
		// List-shaped components whose example is a plain list are unchanged.
		for (const cls of ['cards-grid', 'cycle', 'glossary', 'team-profile', 'split-panel']) expect([cls, outcome(cls)]).toEqual([cls, 'keeps']);
	});
	it('a list that uses the component\'s mark keeps its text: a label, a picture, an arrow', () => {
		const labeled = fitOf(SLIDE.replace('- A point\n- Another point', '- Ann Lee `name`\n- ann@example.com `email`'), 0);
		expect(labeled('contact')).toBe('keeps');
		expect(labeled('actors')).toBe('keeps');
		expect(fitOf(SLIDE.replace('- A point\n- Another point', '- Draft -> Review\n- Review -> Ship'), 0)('flowchart')).toBe('keeps');
		expect(fitOf(SLIDE.replace('- A point\n- Another point', '- 92%\n  - of the room remembers one number'), 0)('big-number')).toBe('keeps');
		expect(fitOf(SLIDE.replace('- A point\n- Another point', '- ![Acme](acme.svg)\n- ![Beta](beta.svg)'), 0)('logo-wall')).toBe('keeps');
		// A label inside a NESTED item is not the item's own label.
		expect(fitOf(SLIDE.replace('- A point\n- Another point', '- A point\n  - detail `x`'), 0)('contact')).toBe('fresh');
	});
	it('the marks come from the skeleton: every item must carry one for it to be asked for', () => {
		expect(marksOf(SKELETON.contact)).toEqual(['label']);
		expect(marksOf(SKELETON['big-number'])).toEqual(['figure']);
		expect(marksOf(SKELETON['logo-wall'])).toEqual(['picture']); // its stage pill is on one item only
		expect(marksOf(SKELETON['team-profile'])).toEqual([]); // the third person has no portrait
		expect(marksOf(SKELETON['cards-grid'])).toEqual([]);
		expect(marksOf('```\n- a `x`\n```\n\n- plain')).toEqual([]); // a fenced example is not the list
		// A numbered example marks its items too: a plain numbered list is not a KPI row.
		expect(marksOf(SKELETON.kpi)).toContain('figure');
		const numbered = fitOf(SLIDE.replace('- A point\n- Another point', '1. First point\n2. Second point'), 0);
		expect(numbered('kpi')).toBe('fresh');
		expect(numbered('stats')).toBe('fresh');
		expect(fitOf(SLIDE.replace('- A point\n- Another point', '1. $2.4B\n2. 73%'), 0)('kpi')).toBe('keeps');
	});
	it('the slide\'s Key Insight is not the pane\'s body: it neither makes a pane a quote nor gets replaced', () => {
		const slide = deckToDoc(SLIDE).child(0);
		const info = slidePanes(slide);
		if (!info) throw new Error('not a pane slide');
		const { to } = paneBodyRange(slide, info, 1);
		expect(slide.child(to).type.name).toBe('blockquote');
		expect(fitOf(SLIDE, 1)('quote')).toBe('fresh');
	});
	it('a component with no grammar entry (an installed package) never claims to keep the text', () => {
		expect(fitOf(SLIDE, 0)('not-a-component')).toBe('fresh');
	});
});

describe('what the second review found a pick could lose', () => {
	it('a pane whose component owns its ### never "keeps its text" under one that does not', () => {
		const src = '<!-- _class: columns -->\n\n## T\n\n<!-- _pane: team-profile -->\n\n### Ann\n\nCEO\n\n### Bob\n\nCTO\n\n<!-- _pane: list -->\n\n- c';
		const outcome = fitOf(src, 0);
		expect(outcome('content')).toBe('fresh');
		expect(outcome('team-profile')).toBe('fresh'); // its own name is the current tile, labeled apart
		const state = stateOf(src);
		const tr = applyPaneChoice(state, 0, 0, { cls: 'content', starter: 'Some text.' });
		const after = slidePanes(state.apply(tr as NonNullable<typeof tr>).doc.child(0));
		expect(after?.panes.map((p) => p.cls)).toEqual(['content', 'list']);
	});
	it('a pane of nothing but a quote and its attribution is the pane\'s own content: a fresh pick replaces all of it, as the engine reads it', () => {
		// The engine keeps every block of an all-quote pane in the pane (lib/core/panes.js). A pick that
		// left the attribution behind put it after the starter, where the engine moved it to the slide
		// as a note: the third review's catch, against a fix the second review had asked for.
		for (const index of [0, 1]) {
			const quote = '<!-- _pane: quote -->\n\n> The best way.\n\n— Ann, CEO';
			const other = '### Other\n\n- x';
			const src = `<!-- _class: columns -->\n\n## T\n\n${index === 0 ? `${quote}\n\n${other}` : `${other}\n\n${quote}`}`;
			const state = stateOf(src);
			const tr = applyPaneChoice(state, 0, index, { cls: 'list', starter: '- One' });
			const out = emitDeck(state.apply(tr as NonNullable<typeof tr>).doc, initBaseline(state.doc));
			expect(out).not.toContain('The best way');
			expect(out).not.toContain('Ann, CEO');
			expect(out).toContain('<!-- _pane: list -->\n\n- One');
		}
	});
	it('a speaker note inside the replaced body survives the starter', () => {
		const src = '<!-- _class: columns -->\n\n## T\n\n### A\n\npara one\n\n<!-- speaker note -->\n\npara two\n\n### B\n\n- b';
		const state = stateOf(src);
		const tr = applyPaneChoice(state, 0, 0, { cls: 'bar', starter: '- One `1`' });
		const out = emitDeck(state.apply(tr as NonNullable<typeof tr>).doc, initBaseline(state.doc));
		expect(out).toContain('- One `1`\n\n<!-- speaker note -->');
		expect(out).not.toContain('para one');
	});
	it('the current component picked again keeps its look', () => {
		const state = stateOf(SLIDE.replace('### First pane', '<!-- _pane: cards-grid compact -->\n### First pane'));
		const tr = applyPaneChoice(state, 0, 0, { cls: 'cards-grid', starter: '- x' });
		expect(emitDeck(state.apply(tr as NonNullable<typeof tr>).doc, initBaseline(state.doc))).toContain('<!-- _pane: cards-grid compact -->');
	});
	it('with no needs map a pick never replaces text', () => {
		const slide = deckToDoc(SLIDE).child(0);
		const info = slidePanes(slide);
		expect(paneFit(slide, info as NonNullable<typeof info>, 0, {}, document)('table')).toBe('keeps');
	});
});

describe('a starter becomes a pane body', () => {
	it('drops the slide\'s directives, heading and its pills, and a Key Insight the component does not read', () => {
		expect(paneStarter(SKELETON.bar, false)).toBe('- First `120`\n- Second `86`\n- Third `54`\n- Fourth `31`');
		expect(paneStarter(SKELETON['team-profile'], false)).not.toMatch(/Your account team|## /);
		expect(paneStarter(SKELETON.quote, true)).toMatch(/^> The quoted sentence/);
		expect(paneStarter('<!-- _class: x -->\n\n## H\n\n- a\n\n> Insight', false)).toBe('- a');
	});
	it('a starter Compose could not edit is not offered (it would lock the slide read-only)', () => {
		expect(starterEditable(SKELETON.checklist)).toBe(false); // its state markers lock a slide
		expect(starterEditable(SKELETON.redline)).toBe(true); // inline <del>/<ins> round-trips as text
		expect(starterEditable(SKELETON.bar)).toBe(true);
		expect(starterEditable(SKELETON.table)).toBe(true);
	});
});

describe('picking a component', () => {
	it('starting fresh swaps the body for the starter, keeps the title and the slide\'s Key Insight, and Undo puts the text back', () => {
		const state = stateOf(SLIDE);
		const tr = applyPaneChoice(state, 0, 1, { cls: 'bar', starter: paneStarter(SKELETON.bar, false) });
		if (!tr) throw new Error('no change');
		const next = state.apply(tr);
		const out = emitDeck(next.doc, initBaseline(state.doc));
		expect(out).toContain('<!-- _pane: bar -->\n\n### Second pane\n\n- First `120`');
		expect(out).toContain("> The slide's Key Insight.");
		expect(out.match(/- A point/g)).toHaveLength(1); // the first pane's, untouched
		let undone = next;
		undo(next, (t) => {
			undone = next.apply(t);
		});
		expect(emitDeck(undone.doc, initBaseline(state.doc))).toBe(emitDeck(state.doc, initBaseline(state.doc)));
	});
	it('keeping the text only names the component, with the look\'s modifiers', () => {
		const state = stateOf(SLIDE);
		const tr = applyPaneChoice(state, 0, 0, { cls: 'cards-grid', modifiers: ['compact'], starter: null });
		const out = emitDeck(state.apply(tr as NonNullable<typeof tr>).doc, initBaseline(state.doc));
		expect(out).toContain('<!-- _pane: cards-grid compact -->\n\n### First pane\n\n- A point');
	});
	it('the pick passes the marker guard, which refuses a stray delete', () => {
		const state = stateOf(SLIDE.replace('### First pane', '<!-- _pane: list -->\n### First pane'));
		const tr = applyPaneChoice(state, 0, 0, { cls: 'checklist', starter: null });
		expect(state.applyTransaction(tr as NonNullable<typeof tr>).state.doc.eq(state.doc)).toBe(false);
	});
});
