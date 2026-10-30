import { createRequire } from 'node:module';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { history } from 'prosemirror-history';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deckToDoc, docToDeck } from '@/lib/compose/deck-doc';
import { type InlineKernels, inlineObjectsPlugin, normalizeDeck, type PluginKindEntry, setPluginKindProvider } from '@/lib/compose/inline-objects';
import { InsertControls } from './InsertControls';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const CONTENT = ['<!-- _class: content -->', '', '## Team', '', 'Lead of the project.', '', '```text', 'code', '```'].join('\n');
const TITLE = ['<!-- _class: title -->', '', '# Hello', '', 'A subtitle line.'].join('\n');
const LOCKED = ['<!-- _class: content -->', '', '## L', '', 'Has ~~strike~~ in it.'].join('\n');

function mount(source: string) {
	const plugin = inlineObjectsPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, onOpenChange: () => {} });
	const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc(source), plugins: [plugin, history()] }) });
	normalizeDeck(view, kernels, false);
	return view;
}

function caretIn(view: EditorView, needle: string, after = false) {
	let at = -1;
	view.state.doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + (after ? needle.length : 0);
	});
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
}

function setup(source: string, caret: string, opts: { image?: () => void; motion?: () => void; link?: () => void } = {}) {
	const view = mount(source);
	caretIn(view, caret, true);
	render(<InsertControls view={view} getKernels={() => kernels} getSource={() => source} getFences={() => undefined} onInsertImage={opts.image} onInsertMotion={opts.motion} onInsertLink={opts.link} />);
	const user = userEvent.setup();
	const open = async () => {
		await user.click(screen.getByRole('button', { name: 'Insert' }));
		await screen.findByRole('menuitem', { name: /^Table/ });
	};
	return { view, user, open };
}

const item = (name: string) => screen.getByRole('menuitem', { name: new RegExp(`^${name}\\b`) });
const disabled = (name: string) => item(name).hasAttribute('data-disabled');

afterEach(cleanup);

describe('InsertControls — what it offers', () => {
	it('names every thing an author can put on a slide, in two groups, each with what it is for', async () => {
		const { open } = setup(CONTENT, 'Lead');
		await open();
		const names = screen.getAllByRole('menuitem').map((e) => (e.textContent ?? '').replace(/\s+/g, ' '));
		const labels = ['Table', 'Code', 'Diagram', 'Equation', 'Plot', 'Pill', 'Spark', 'Avatar', 'Icon', 'Check'];
		expect(names).toHaveLength(labels.length);
		labels.forEach((label, i) => {
			expect(names[i].startsWith(label), names[i]).toBe(true);
			expect(names[i].length, `${label} has a hint`).toBeGreaterThan(label.length + 8);
		});
		expect(screen.getByText('Add to the slide')).toBeTruthy();
		expect(screen.getByText('Add to a line of text')).toBeTruthy();
	});

	it('offers the Image door only when the Library can be reached', async () => {
		const first = setup(CONTENT, 'Lead');
		await first.open();
		expect(screen.queryByRole('menuitem', { name: /^Image/ })).toBeNull();
		cleanup();
		const second = setup(CONTENT, 'Lead', { image: () => {} });
		await second.open();
		expect(screen.getByRole('menuitem', { name: /^Image/ })).toBeTruthy();
	});

	it('offers the Link door only when the editor hosts the link panel, and hands off to it', async () => {
		const first = setup(CONTENT, 'Lead');
		await first.open();
		expect(screen.queryByRole('menuitem', { name: /^Link/ })).toBeNull();
		cleanup();
		const link = vi.fn();
		const second = setup(CONTENT, 'Lead', { link });
		const before = docToDeck(second.view.state.doc);
		await second.open();
		await second.user.click(item('Link'));
		expect(link).toHaveBeenCalledTimes(1);
		expect(docToDeck(second.view.state.doc)).toBe(before);
	});

	it('is one button, named Insert', () => {
		setup(CONTENT, 'Lead');
		expect(screen.getAllByRole('button')).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Insert' })).toBeTruthy();
	});
});

describe('InsertControls — the blocks', () => {
	it('Diagram writes a Mermaid fence with a working starter, selected so the first keystroke replaces it', async () => {
		const { view, user, open } = setup(CONTENT, 'Lead');
		await open();
		await user.click(item('Diagram'));
		const deck = docToDeck(view.state.doc);
		expect(deck).toContain('Lead of the project.\n\n```mermaid\nflowchart LR\n  A[Plan] --> B[Build] --> C[Ship]\n```');
		const { from, to } = view.state.selection;
		expect(view.state.doc.textBetween(from, to)).toBe('flowchart LR\n  A[Plan] --> B[Build] --> C[Ship]');
	});

	it('Equation and Plot write their fences with a starter', async () => {
		const eq = setup(CONTENT, 'Lead');
		await eq.open();
		await eq.user.click(item('Equation'));
		expect(docToDeck(eq.view.state.doc)).toContain('```math\nE = mc^2\n```');
		cleanup();
		const plot = setup(CONTENT, 'Lead');
		await plot.open();
		await plot.user.click(item('Plot'));
		expect(docToDeck(plot.view.state.doc)).toContain('```functionplot\n{ "data": [{ "fn": "x^2" }] }\n```');
	});

	it('Code writes a TAGGED fence, never a bare one', async () => {
		const { view, user, open } = setup(CONTENT, 'Lead');
		await open();
		await user.click(item('Code'));
		// Two fences, four fence lines: the two openers carry a tag and only the two closers are bare.
		const fences = [...docToDeck(view.state.doc).matchAll(/^```(.*)$/gm)].map((m) => m[1]);
		expect(fences).toHaveLength(4);
		expect(fences.filter((f) => f !== '')).toHaveLength(2);
	});

	it('Table writes a starter table', async () => {
		const { view, user, open } = setup(CONTENT, 'Lead');
		await open();
		await user.click(item('Table'));
		expect(docToDeck(view.state.doc)).toMatch(/\| .* \|\n\| --- /);
	});

	it('Image hands off to the Library picker and writes nothing itself', async () => {
		const image = vi.fn();
		const { view, user, open } = setup(CONTENT, 'Lead', { image });
		const before = docToDeck(view.state.doc);
		await open();
		await user.click(item('Image'));
		expect(image).toHaveBeenCalledTimes(1);
		expect(docToDeck(view.state.doc)).toBe(before);
	});
});

describe('InsertControls — the inline objects', () => {
	it('each door puts its own kind at the caret', async () => {
		for (const [name, src] of [['Pill', '{Status}'], ['Spark', '~{12 14 13 17 21}'], ['Avatar', '!{Alex Rivera}'], ['Icon', '^{star}']] as const) {
			const { view, user, open } = setup(CONTENT, 'Lead');
			await open();
			await user.click(item(name));
			expect(docToDeck(view.state.doc), name).toContain(`\`${src}\``);
			cleanup();
		}
	});

	it('Check puts the first answer at the caret, and a selected word becomes its label', async () => {
		const bare = setup(CONTENT, 'Lead');
		await bare.open();
		await bare.user.click(item('Check'));
		expect(docToDeck(bare.view.state.doc)).toContain('`@check{pass}`');
		cleanup();
		const view = mount(CONTENT);
		let at = -1;
		view.state.doc.descendants((n, p) => {
			if (at < 0 && n.isText && n.text?.includes('Lead')) at = p + n.text.indexOf('Lead');
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at, at + 4)));
		render(<InsertControls view={view} getKernels={() => kernels} getSource={() => CONTENT} getFences={() => undefined} />);
		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: 'Insert' }));
		await user.click(await screen.findByRole('menuitem', { name: /^Check/ }));
		expect(docToDeck(view.state.doc)).toMatch(/`@check\{pass, [^`]*Lead[^`]*\}` of the project\./);
	});

	it('Check and a plugin kind never delete a selection they cannot use as a label: they go in after it', async () => {
		const selectAll = (view: EditorView, text: string) => {
			let at = -1;
			view.state.doc.descendants((n, p) => {
				if (at < 0 && n.isText && n.text?.includes(text)) at = p + n.text.indexOf(text);
			});
			view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at, at + text.length)));
		};
		const long = 'Lead of the project.';
		const deck = CONTENT.replace(long, `${long} ${'x'.repeat(40)}`);
		const view = mount(deck);
		selectAll(view, `of the project. ${'x'.repeat(40)}`);
		render(<InsertControls view={view} getKernels={() => kernels} getSource={() => deck} getFences={() => undefined} />);
		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: 'Insert' }));
		await user.click(await screen.findByRole('menuitem', { name: /^Check/ }));
		expect(docToDeck(view.state.doc)).toContain(`Lead of the project. ${'x'.repeat(40)} \`@check{pass}\``);
		cleanup();
		setPluginKindProvider(() => [{ plugin: 'chips', name: 'tag-chip', title: 'Tag chip', slot: { positional: [{ name: 'label', type: 'text' }], params: {} } }]);
		try {
			const v2 = mount(CONTENT);
			selectAll(v2, 'Lead');
			render(<InsertControls view={v2} getKernels={() => kernels} getSource={() => CONTENT} getFences={() => undefined} />);
			await user.click(screen.getByRole('button', { name: 'Insert' }));
			await user.click(await screen.findByRole('menuitem', { name: /^Tag chip/ }));
			expect(docToDeck(v2.state.doc)).toMatch(/Lead ?`@tag-chip\{Tag chip\}` ?of the project\./);
		} finally {
			setPluginKindProvider(() => []);
		}
	});

	it('lists an installed plugin’s kind and starts one from its slot; a kind it cannot start says so', async () => {
		setPluginKindProvider(() => [
			{ plugin: 'chips', name: 'tag-chip', title: 'Tag chip', slot: { positional: [{ name: 'label', type: 'text' }], params: { tone: { type: 'oneOf', values: ['hot', 'cold'] } } } },
			{ plugin: 'chips', name: 'odd-chip', title: 'Odd chip', slot: { positional: [{ name: 'when', type: 'date' }], params: {} } },
		] as PluginKindEntry[]);
		try {
			const { view, user, open } = setup(CONTENT, 'Lead');
			await open();
			expect(item('Tag chip').textContent).toMatch(/chips plugin/);
			expect(disabled('Odd chip')).toBe(true);
			expect(item('Odd chip').textContent).toMatch(/Type it in Markdown/);
			await user.click(item('Tag chip'));
			expect(docToDeck(view.state.doc)).toContain('`@tag-chip{Tag chip}`');
		} finally {
			setPluginKindProvider(() => []);
		}
	});
});

describe('InsertControls — what is unavailable, and why', () => {
	it('a table does not suit a title slide, and the menu says so', async () => {
		const { open } = setup(TITLE, 'subtitle');
		await open();
		expect(disabled('Table')).toBe(true);
		expect(item('Table').textContent).toMatch(/does not suit this layout/);
		expect(disabled('Pill')).toBe(false);
	});

	it('every item is unavailable on a locked slide, says the slide is edited in Markdown, and choosing one writes nothing', async () => {
		const { view, user, open } = setup(LOCKED, 'Has', { image: () => {}, link: () => {} });
		await open();
		const before = docToDeck(view.state.doc);
		for (const name of ['Table', 'Code', 'Diagram', 'Equation', 'Plot', 'Image', 'Pill', 'Spark', 'Avatar', 'Icon', 'Check', 'Link']) {
			expect(disabled(name), name).toBe(true);
			expect(item(name).getAttribute('aria-disabled'), name).toBe('true');
			expect(item(name).textContent, name).toMatch(/edited in Markdown/);
			// Choosing it by the keyboard (the item stays focusable so its reason can be heard) is declined, and the menu stays open.
			item(name).focus();
			await user.keyboard('{Enter}');
			expect(docToDeck(view.state.doc), name).toBe(before);
			expect(screen.queryAllByRole('menuitem').length, `${name}: the menu stays open`).toBeGreaterThan(0);
		}
	});

	it('an unavailable item can take focus, so its reason can be heard', async () => {
		const { open } = setup(TITLE, 'subtitle');
		await open();
		item('Table').focus();
		expect(document.activeElement).toBe(item('Table'));
	});

	it('the Image item is unavailable inside a code block too, with the reason', async () => {
		const { open } = setup(CONTENT, 'code', { image: () => {} });
		await open();
		expect(disabled('Image')).toBe(true);
		expect(item('Image').textContent).toMatch(/code block/);
	});

	it('inside a code block the blocks and the inline objects are unavailable, with the reason', async () => {
		const { open } = setup(CONTENT, 'code');
		await open();
		expect(disabled('Diagram')).toBe(true);
		expect(item('Diagram').textContent).toMatch(/already in a code block/);
		expect(disabled('Pill')).toBe(true);
	});

	it('is read when the menu opens, so a caret that has moved is never judged by where it was', async () => {
		const { view, user, open } = setup(CONTENT, 'code');
		await open();
		expect(disabled('Diagram')).toBe(true);
		await user.keyboard('{Escape}');
		caretIn(view, 'Lead', true);
		await open();
		await waitFor(() => expect(disabled('Diagram')).toBe(false));
	});
});

describe('Motion', () => {
	it('is absent without a Library, and asks the host to open the Library on its scenes when chosen', async () => {
		const first = setup(CONTENT, 'Lead');
		await first.open();
		expect(screen.queryByRole('menuitem', { name: /^Motion/ })).toBeNull();
		cleanup();
		const motion = vi.fn();
		const { user, open } = setup(CONTENT, 'Lead', { motion });
		await open();
		expect(disabled('Motion')).toBe(false);
		await user.click(item('Motion'));
		expect(motion).toHaveBeenCalledTimes(1);
	});

	it('is still offered on a slide Compose cannot write, because a scene is a slide of its own', async () => {
		const { open } = setup(LOCKED, 'Has', { motion: () => {} });
		await open();
		expect(disabled('Motion')).toBe(false);
	});
});

