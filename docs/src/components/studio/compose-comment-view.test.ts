import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { deckToDoc } from '@/lib/compose/deck-doc';
import { CommentView, commentOpenKey, commentRunPlugin, structuralGuard } from './ComposeView';

// The Compose view for a RUN of authoring comments — a pill row with one shared panel below.
//
// Two things were got wrong before and are pinned here. (1) Each comment used to render its own
// block, its own panel and its own Remove button, so a slide with a caption, a describe and a note
// showed three identical "NOTE" boxes stacked down the page. (2) The chip's mousedown used to reach
// ProseMirror, which made clicking a note a NodeSelection — and with an atom selected the next
// printed character REPLACES it, so reading a note and carrying on typing destroyed it.
//
// WHAT THESE TESTS CANNOT SEE: jsdom does not run ProseMirror's real click-to-NodeSelection path,
// and it has no layout, so "the pills share a row" is a CSS claim these cannot check — it is
// verified on the real Studio (HARD RULE #23). Re-breaking `stopEvent` fails only the arm that
// calls it directly.

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Heading',
	'',
	'First paragraph.',
	'',
	'<!-- caption: the slide reads as this. -->',
	'',
	'<!-- describe: a bar chart with four bars. -->',
	'',
	'<!-- a plain note. -->',
	'',
	'Second paragraph.',
].join('\n');

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

function mount(src = DECK) {
	const host = document.createElement('div');
	document.body.append(host);
	view = new EditorView(host, {
		state: EditorState.create({ doc: deckToDoc(src), plugins: [structuralGuard(), commentRunPlugin()] }),
		nodeViews: { comment: (node, v, getPos) => new CommentView(node, v, getPos as () => number | undefined) },
	});
	return view;
}

const pills = () => [...document.querySelectorAll('.cs-comment')] as HTMLElement[];
const labels = () => pills().map((p) => (p.querySelector('.cs-comment-tag')?.textContent || '').trim());
const panels = () => [...document.querySelectorAll('.cs-comment-panel')] as HTMLElement[];
const openPills = () => pills().filter((p) => p.classList.contains('cs-comment-open'));
const commentCount = (v: EditorView) => {
	let n = 0;
	v.state.doc.descendants((node) => {
		if (node.type.name === 'comment') n++;
	});
	return n;
};

describe('the pills carry the channel, not a generic label', () => {
	it('labels caption, describe and note distinctly', () => {
		mount();
		expect(labels()).toEqual(['caption', 'describe', 'note']);
	});

	it('marks each pill with its channel class, so the three read differently', () => {
		mount();
		const classes = pills().map((p) => [...p.classList].filter((c) => c.startsWith('cs-comment-')).filter((c) => !c.endsWith('first') && !c.endsWith('last')));
		expect(classes).toEqual([['cs-comment-caption'], ['cs-comment-describe'], ['cs-comment-note']]);
	});

	it('shows the words without the channel prefix', () => {
		mount();
		pills()[0].click();
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('the slide reads as this.');
	});

	it('marks the ends of a run, so the row can be styled as one control', () => {
		mount();
		expect(pills()[0].classList.contains('cs-comment-first')).toBe(true);
		expect(pills()[2].classList.contains('cs-comment-last')).toBe(true);
		expect(pills()[1].classList.contains('cs-comment-first')).toBe(false);
	});
});

describe('the run behaves as ONE control', () => {
	it('shows no panel until a pill is clicked', () => {
		mount();
		expect(panels()).toHaveLength(0);
	});

	it('opens exactly one panel, and only one pill is lit', () => {
		mount();
		pills()[1].click();
		expect(panels()).toHaveLength(1);
		expect(openPills()).toHaveLength(1);
		expect(labels()[1]).toBe('describe');
	});

	it('clicking another pill MOVES the panel rather than opening a second', () => {
		mount();
		pills()[0].click();
		pills()[2].click();
		expect(panels()).toHaveLength(1);
		expect(openPills()).toHaveLength(1);
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('a plain note.');
	});

	it('clicking the open pill closes it', () => {
		mount();
		pills()[0].click();
		pills()[0].click();
		expect(panels()).toHaveLength(0);
		expect(openPills()).toHaveLength(0);
	});

	it('puts the panel AFTER the run, not between the pills', () => {
		const v = mount();
		pills()[0].click();
		const panel = panels()[0];
		const last = pills()[2];
		expect(last.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(commentCount(v)).toBe(3);
	});

	it('keeps separate runs independent — one open pill per run at most', () => {
		mount(['<!-- _class: content -->', '', '## H', '', '<!-- one -->', '', 'middle', '', '<!-- two -->'].join('\n'));
		expect(pills()).toHaveLength(2);
		// Both are `first` AND `last`: two runs of one, not one run of two.
		expect(pills().every((p) => p.classList.contains('cs-comment-first') && p.classList.contains('cs-comment-last'))).toBe(true);
		pills()[0].click();
		pills()[1].click();
		expect(panels()).toHaveLength(1);
	});
});

describe('reading a note never arms a delete (the regression that cost a note)', () => {
	it('clicking a pill leaves the document selection alone', () => {
		const v = mount();
		const before = v.state.selection;
		pills()[0].click();
		expect(v.state.selection instanceof NodeSelection).toBe(false);
		expect(v.state.selection.eq(before)).toBe(true);
	});

	it('opening a pill changes no document content', () => {
		const v = mount();
		const doc = v.state.doc;
		pills()[0].click();
		expect(v.state.doc.eq(doc)).toBe(true);
	});

	it('stopEvent claims every event inside the pill — the mechanism behind that', () => {
		const v = mount();
		let pos = 0;
		v.state.doc.descendants((node, p) => {
			if (node.type.name === 'comment') pos = p;
		});
		const cv = new CommentView(v.state.doc.nodeAt(pos) as never, v, () => pos);
		const inside = new MouseEvent('mousedown', { bubbles: true });
		cv.dom.dispatchEvent(inside);
		expect(cv.stopEvent(inside)).toBe(true);
		const outside = new MouseEvent('mousedown', { bubbles: true });
		document.body.dispatchEvent(outside);
		expect(cv.stopEvent(outside)).toBe(false);
		cv.destroy();
	});
});

describe('removal is a deliberate second act', () => {
	it('offers no remove control until a pill is open', () => {
		mount();
		expect(document.querySelector('.cs-comment-remove')).toBeNull();
		pills()[0].click();
		expect(document.querySelector('.cs-comment-remove')).not.toBeNull();
	});

	it('removes exactly the open one, keeps the rest of the run and the prose', () => {
		const v = mount();
		pills()[1].click(); // describe
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(commentCount(v)).toBe(2);
		expect(labels()).toEqual(['caption', 'note']);
		const text = v.state.doc.textContent;
		expect(text).toContain('First paragraph.');
		expect(text).toContain('Second paragraph.');
		expect(v.state.doc.child(0).attrs.directives).toEqual(['<!-- _class: content -->']);
	});

	it('closes the panel after removing, rather than stranding it on a dead position', () => {
		mount();
		pills()[0].click();
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(panels()).toHaveLength(0);
		expect(openPills()).toHaveLength(0);
	});

	it('leaves the slide count alone, so the structural guard never rejects it', () => {
		const v = mount();
		const before = v.state.doc.childCount;
		pills()[0].click();
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(v.state.doc.childCount).toBe(before);
	});

	it('the open panel follows its own note when an EARLIER one is removed', () => {
		// The bug this design removes: with per-view state, ProseMirror could recycle the first
		// note's view for the second and show the wrong text in an open panel. The plugin maps the
		// open position through the transaction instead.
		const v = mount();
		pills()[2].click(); // the plain note
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('a plain note.');
		// Remove the FIRST comment by document surgery, the way an edit elsewhere would.
		let first = -1;
		v.state.doc.descendants((node, p) => {
			if (first < 0 && node.type.name === 'comment') first = p;
		});
		const n = v.state.doc.nodeAt(first) as never as { nodeSize: number };
		v.dispatch(v.state.tr.delete(first, first + n.nodeSize));
		expect(commentCount(v)).toBe(2);
		expect(panels()).toHaveLength(1);
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('a plain note.');
	});
});

describe('a locked slide says so instead of doing nothing', () => {
	// Reachable by accident: a note containing `~~` or `$math$` locks its OWN slide, so
	// `<!-- TODO: kill the ~~old~~ wording -->` makes the slide read-only with no visible cause.
	const LOCKED = ['<!-- _class: content -->', '', '## H', '', 'body ~~struck~~ text', '', '<!-- a note -->'].join('\n');

	it('the slide really is locked', () => {
		const v = mount(LOCKED);
		expect(v.state.doc.child(0).attrs.locked).toBe(true);
	});

	it('disables the remove control and explains where to go', () => {
		mount(LOCKED);
		pills()[0].click();
		const btn = document.querySelector('.cs-comment-remove') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		expect(btn.textContent).toMatch(/Markdown/);
	});

	it('so clicking it cannot silently no-op', () => {
		const v = mount(LOCKED);
		pills()[0].click();
		const btn = document.querySelector('.cs-comment-remove') as HTMLButtonElement;
		btn.click();
		expect(commentCount(v)).toBe(1);
	});

	it('but the note is still readable', () => {
		mount(LOCKED);
		pills()[0].click();
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('a note');
	});
});

// A comment inside a BLOCKQUOTE is deliberately modeled (the block rule bails only on a list
// item), and `nodeViews.comment` mounts at any depth. An earlier run detection walked the slide's
// top-level children only, so the nested pill's position was one no run ever yielded: it rendered,
// clicked, and then showed no panel, no channel class and no Remove — visibly present, doing
// nothing, and unremovable from Compose.
describe('a comment nested in a blockquote is a first-class pill', () => {
	const NESTED = ['<!-- _class: content -->', '', '## H', '', '> quoted', '>', '> <!-- inner note -->', '', 'after'].join('\n');

	it('models the nested comment at all', () => {
		const v = mount(NESTED);
		expect(commentCount(v)).toBe(1);
		expect(pills()).toHaveLength(1);
	});

	it('gives it a channel class and run marks like any other', () => {
		mount(NESTED);
		expect(pills()[0].classList.contains('cs-comment-note')).toBe(true);
		expect(pills()[0].classList.contains('cs-comment-first')).toBe(true);
		expect(pills()[0].classList.contains('cs-comment-last')).toBe(true);
	});

	it('opens a panel with its words, and removes cleanly', () => {
		const v = mount(NESTED);
		pills()[0].click();
		expect(panels()).toHaveLength(1);
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('inner note');
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(commentCount(v)).toBe(0);
		expect(v.state.doc.textContent).toContain('quoted');
	});

	it('does not merge a nested run with a comment outside the blockquote', () => {
		mount(['<!-- _class: content -->', '', '> quoted', '>', '> <!-- inner -->', '', '<!-- outer -->'].join('\n'));
		expect(pills()).toHaveLength(2);
		// Two runs of one, not one run of two — different parents.
		expect(pills().every((p) => p.classList.contains('cs-comment-first') && p.classList.contains('cs-comment-last'))).toBe(true);
	});
});

describe('the panel lays the note out for reading', () => {
	it('joins WRAPPED lines but keeps blank-line paragraphs', () => {
		mount(['<!-- _class: content -->', '', '## H', '', '<!-- one wrapped', '     line here.', '', '     And a second paragraph. -->'].join('\n'));
		pills()[0].click();
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('one wrapped line here.\n\nAnd a second paragraph.');
	});

	it('keeps the line breaks of a LIST-shaped note', () => {
		// Joining these turned a checklist into one run-on line, and the multi-line note is exactly
		// the shape this feature exists to surface.
		mount(['<!-- _class: content -->', '', '## H', '', '<!-- TODO before Monday:', '- call finance', '- redo the chart', '- send to Dana -->'].join('\n'));
		pills()[0].click();
		expect(panels()[0].querySelector('.cs-comment-body')?.textContent).toBe('TODO before Monday:\n- call finance\n- redo the chart\n- send to Dana');
	});
});

describe('the row announces itself as the tab bar it is', () => {
	it('names the CHANNEL on the pill, not the whole note', () => {
		mount();
		const label = pills()[0].getAttribute('aria-label') || '';
		expect(label).toContain('caption');
		expect(label).not.toContain('the slide reads as this');
	});

	it('reports expanded state and points at its panel', () => {
		mount();
		expect(pills()[0].getAttribute('aria-expanded')).toBe('false');
		pills()[0].click();
		expect(pills()[0].getAttribute('aria-expanded')).toBe('true');
		const controls = pills()[0].getAttribute('aria-controls');
		expect(controls).toBeTruthy();
		expect(document.getElementById(controls as string)).not.toBeNull();
	});

	it('marks the panel as a labeled region', () => {
		mount();
		pills()[1].click();
		expect(panels()[0].getAttribute('role')).toBe('region');
		expect(panels()[0].getAttribute('aria-label')).toContain('describe');
	});
});

describe('the open state is plugin state, not view state', () => {
	it('tracks the open comment by document position', () => {
		const v = mount();
		expect(commentOpenKey.getState(v.state)).toBeNull();
		pills()[1].click();
		const pos = commentOpenKey.getState(v.state);
		expect(typeof pos).toBe('number');
		expect(v.state.doc.nodeAt(pos as number)?.type.name).toBe('comment');
	});

	it('drops the open state when that comment is deleted from elsewhere', () => {
		const v = mount();
		pills()[0].click();
		const pos = commentOpenKey.getState(v.state) as number;
		const n = v.state.doc.nodeAt(pos) as never as { nodeSize: number };
		v.dispatch(v.state.tr.delete(pos, pos + n.nodeSize));
		expect(commentOpenKey.getState(v.state)).toBeNull();
		expect(panels()).toHaveLength(0);
	});
});
