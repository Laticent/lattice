// An installed plugin's inline kind (`@gantt-bar{…}`) is an object in Compose: it is found from the manifest's slot,
// edited one word at a time, and never drawn (the host does not run the plugin's code).
import { createRequire } from 'node:module';
import { history } from 'prosemirror-history';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck } from './deck-doc';
import { editObject, type InlineKernels, inlineObjectsPlugin, kindOf, normalizeDeck, type PluginKindEntry, setPluginKindProvider } from './inline-objects';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const GANTT: PluginKindEntry = {
	plugin: 'gantt',
	name: 'gantt-bar',
	title: 'Gantt bar',
	slot: {
		positional: [{ name: 'task', type: 'text' }],
		params: { tone: { type: 'oneOf', values: ['calm', 'loud'] }, weeks: { type: 'number', named: true }, pinned: { type: 'flag', word: 'pinned' } },
	},
};

afterEach(() => setPluginKindProvider(() => []));

function mount(source: string) {
	const plugin = inlineObjectsPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, onOpenChange: () => {} });
	const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc(source), plugins: [plugin, history()] }) });
	normalizeDeck(view, kernels, false);
	return view;
}

const objectsOf = (view: EditorView) => {
	const out: { pos: number; src: string }[] = [];
	view.state.doc.descendants((n, pos) => {
		if (n.type === deckSchema.nodes.inline_object) out.push({ pos, src: n.attrs.src as string });
	});
	return out;
};

const DECK = '## Plan\n\nShip `@gantt-bar{Build, weeks=3}` then `@ghost{x}` and `@icon{database}`.\n';

describe('plugin inline kinds', () => {
	it('a listed kind is an object, an unlisted one stays code', () => {
		setPluginKindProvider(() => [GANTT]);
		const view = mount(DECK);
		expect(objectsOf(view).map((o) => o.src)).toEqual(['@gantt-bar{Build, weeks=3}']);
	});

	it('with no plugin listed, every named span stays code', () => {
		expect(objectsOf(mount(DECK))).toEqual([]);
	});

	it('a plugin cannot take an in-tree name', () => {
		setPluginKindProvider(() => [{ ...GANTT, name: 'icon' }]);
		expect(kindOf('@icon{database}', kernels)).toBeNull();
	});

	it('reads the words the author wrote, from the slot', () => {
		setPluginKindProvider(() => [GANTT]);
		const owner = kindOf('@gantt-bar{Build, loud, weeks=3}', kernels);
		expect(owner?.kind.id).toBe('plugin');
		expect(owner?.fields).toMatchObject({ written: { task: 'Build', tone: 'loud', weeks: 3 } });
	});

	it('an edit changes only the edited word, and the document round-trips', () => {
		setPluginKindProvider(() => [GANTT]);
		const view = mount(DECK);
		const { pos } = objectsOf(view)[0];
		expect(editObject(view, pos, { tone: 'loud' }, kernels)).toBe(true);
		expect(objectsOf(view)[0].src).toBe('@gantt-bar{Build, weeks=3, loud}');
		expect(editObject(view, pos, { weeks: 5 }, kernels)).toBe(true);
		expect(objectsOf(view)[0].src).toBe('@gantt-bar{Build, weeks=5, loud}');
		expect(editObject(view, pos, { tone: null }, kernels)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('Ship `@gantt-bar{Build, weeks=5}` then `@ghost{x}` and `@icon{database}`.');
	});

	it('a value outside the vocabulary writes nothing', () => {
		setPluginKindProvider(() => [GANTT]);
		const view = mount(DECK);
		expect(editObject(view, objectsOf(view)[0].pos, { tone: 'shouting' }, kernels)).toBe(false);
		expect(objectsOf(view)[0].src).toBe('@gantt-bar{Build, weeks=3}');
	});
});
