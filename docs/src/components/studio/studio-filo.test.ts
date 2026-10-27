// The Studio's glue to Filo: the commit rules of engineering/decisions/2026-10-27-filo-undo-history.md
// §3.2, and who owns ⌘Z for a focused element (§3.5).
import { describe, expect, it } from 'vitest';
import { createFilo, History } from '@/lib/filo';
import { commitSource, historyInput, type StampedIntent, slideBoundary, undoChord, undoHint, undoOwner } from './studio-filo';
import { newDeckSource } from './studio-store';

let seq = 0;
const intent = (text: string, rest: Partial<StampedIntent> = {}): StampedIntent => ({ label: 'Typing', origin: 'markdown', text, seq: ++seq, ...rest });

describe('commitSource — one commit per source change', () => {
	it('records a change its intent produced, under the intent label', () => {
		const h = new History('d', 'hello');
		expect(commitSource(h, 'hello world', intent('hello world', { label: 'Theme → Cuoio', origin: 'settings' }))).toBe('committed');
		expect(h.state().undoLabel).toBe('Theme → Cuoio');
		expect(h.undo()?.text).toBe('hello');
	});

	it('uses the editor edits when they produce the text, so typing coalesces at the caret', () => {
		const h = new History('d', 'ab', { now: () => 0 });
		commitSource(h, 'aXb', intent('aXb', { edits: [{ from: 1, to: 1, insert: 'X' }], before: 1, after: 2 }));
		commitSource(h, 'aXYb', intent('aXYb', { edits: [{ from: 2, to: 2, insert: 'Y' }], before: 2, after: 3 }));
		expect(h.state().steps).toBe(1);
		const m = h.undo();
		expect(m?.text).toBe('ab');
		expect(m?.caret).toBe(1);
	});

	it('drops edits that do not produce the text and falls back to a trimmed replace', () => {
		const h = new History('d', 'abc');
		expect(commitSource(h, 'abZ', intent('abZ', { edits: [{ from: 0, to: 1, insert: 'Q' }] }))).toBe('committed');
		expect(h.text).toBe('abZ');
		expect(h.undo()?.text).toBe('abc');
	});

	it('a STALE intent (a no-op write left it behind) never labels a later change', () => {
		const h = new History('d', 'one');
		const stale = intent('one', { label: 'Theme → Cuoio', origin: 'settings' });
		// The source moved without a new intent: an outside change, not "Theme → Cuoio".
		expect(commitSource(h, 'two', stale)).toBe('synced');
		const m = h.undo();
		expect(m?.gap).toBe(true);
		expect(h.state().undoLabel).toBe('Changed outside this history');
	});

	it('a change with no intent is an outside change: the next undo records it and stops', () => {
		const h = new History('d', 'a');
		commitSource(h, 'ab', intent('ab'));
		expect(commitSource(h, 'abREMOTE', null)).toBe('synced');
		expect(h.undo()?.gap).toBe(true);
		expect(h.text).toBe('abREMOTE');
		expect(h.undo()?.text).toBe('ab');
	});

	it('a history intent is Filo’s own move landing: nothing is recorded', () => {
		const h = new History('d', 'a');
		commitSource(h, 'ab', intent('ab'));
		const m = h.undo();
		expect(m).not.toBeNull();
		expect(commitSource(h, m?.text ?? '', intent(m?.text ?? '', { kind: 'history', origin: 'history' }))).toBe('same');
		expect(h.state().canRedo).toBe(true);
	});

	it('a broad origin ignores precise edits (a trimmed replace, never a diff)', () => {
		const h = new History('d', 'aaaa');
		commitSource(h, 'aaab', intent('aaab', { origin: 'ai', label: 'AI chat edit', edits: [{ from: 3, to: 4, insert: 'b' }] }));
		expect(h.state().undoLabel).toBe('AI chat edit');
		expect(h.undo()?.text).toBe('aaaa');
	});
});

describe('one history per deck, keyed by id — never by content', () => {
	// The editor's old carry leaked one deck's history into another because two fresh decks hold
	// byte-identical template text. Filo is keyed by deck id, so identical bytes cannot match.
	it('two new decks with identical bytes keep separate histories', () => {
		const template = newDeckSource();
		const filo = createFilo();
		const a = filo.load('deck-a', template);
		commitSource(a, `${template}DECKALEAK`, intent(`${template}DECKALEAK`));
		const b = filo.load('deck-b', template);
		expect(b.state().canUndo).toBe(false);
		expect(b.undo()).toBeNull();
		expect(b.redo()).toBeNull();
		// Back on deck A, its history is intact.
		expect(filo.load('deck-a', `${template}DECKALEAK`).undo()?.text).toBe(template);
	});
});

describe('slideBoundary — typing never coalesces across a slide break', () => {
	it('splits forward typing at a slide break (the history asks with a === b)', () => {
		const h = new History('d', '', { boundary: slideBoundary, now: () => 0 });
		let text = '';
		for (const ch of 'x\n---\n# B') {
			const next = text + ch;
			commitSource(h, next, intent(next, { edits: [{ from: text.length, to: text.length, insert: ch }], before: text.length, after: next.length }));
			text = next;
		}
		expect(h.state().steps).toBeGreaterThan(1);
		// The last step is slide B's typing alone.
		expect(h.undo()?.text.endsWith('---\n')).toBe(true);
	});

	it('is true only across a separator line', () => {
		const t = 'a\n---\nb';
		expect(slideBoundary(1, 2, t)).toBe(true);
		expect(slideBoundary(5, 6, t)).toBe(true);
		expect(slideBoundary(0, 1, t)).toBe(false);
		expect(slideBoundary(1, 2, 'a\nb')).toBe(false);
	});
});

describe('undoChord — the chords of §3.5', () => {
	const k = (key: string, m: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...m });
	it('maps ⌘Z / ⌘⇧Z on a Mac', () => {
		expect(undoChord(k('z', { metaKey: true }), true)).toBe('undo');
		expect(undoChord(k('Z', { metaKey: true, shiftKey: true }), true)).toBe('redo');
		expect(undoChord(k('z', { ctrlKey: true }), true)).toBeNull();
		expect(undoChord(k('y', { metaKey: true }), true)).toBeNull();
	});
	it('maps Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y elsewhere', () => {
		expect(undoChord(k('z', { ctrlKey: true }), false)).toBe('undo');
		expect(undoChord(k('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
		expect(undoChord(k('y', { ctrlKey: true }), false)).toBe('redo');
		expect(undoChord(k('z', { ctrlKey: true, altKey: true }), false)).toBeNull();
		expect(undoChord(k('z'), false)).toBeNull();
	});
	it('reads the physical key on a non-Latin layout', () => {
		expect(undoChord({ ...k('я', { ctrlKey: true }), code: 'KeyZ' }, false)).toBe('undo');
		expect(undoChord({ ...k('н', { ctrlKey: true }), code: 'KeyY' }, false)).toBe('redo');
		expect(undoChord({ ...k('я', { ctrlKey: true }), code: 'KeyQ' }, false)).toBeNull();
	});
	it('reads beforeinput’s history requests', () => {
		expect(historyInput('historyUndo')).toBe('undo');
		expect(historyInput('historyRedo')).toBe('redo');
		expect(historyInput('insertText')).toBeNull();
	});
});

describe('undoOwner — who owns ⌘Z for the focused element', () => {
	const el = (html: string, pick: string) => {
		const root = document.createElement('div');
		root.innerHTML = html;
		document.body.append(root);
		return root.querySelector(pick) as Element;
	};
	it('the page body, a button and a range control are Filo’s', () => {
		expect(undoOwner(document.body)).toBe('filo');
		expect(undoOwner(el('<button>x</button>', 'button'))).toBe('filo');
		expect(undoOwner(el('<input type="range">', 'input'))).toBe('filo');
		expect(undoOwner(null)).toBe('filo');
	});
	it('a text field keeps the browser’s own undo', () => {
		expect(undoOwner(el('<input type="text">', 'input'))).toBe('native');
		expect(undoOwner(el('<textarea></textarea>', 'textarea'))).toBe('native');
		expect(undoOwner(el('<div contenteditable="true"><p>x</p></div>', 'p'))).not.toBe('filo');
	});
	it('the deck editor is Filo’s, and a yielding surface owns its own keys', () => {
		expect(undoOwner(el('<div data-filo-owned><div contenteditable="true"><p>x</p></div></div>', 'p'))).toBe('filo');
		expect(undoOwner(el('<div data-filo-yield><div data-filo-owned><p>x</p></div></div>', 'p'))).toBe('yield');
	});
	it('a dialog over the Studio is not where the deck is', () => {
		expect(undoOwner(el('<div role="dialog"><button>Close</button></div>', 'button'))).toBe('yield');
		expect(undoOwner(el('<div aria-modal="true"><button>x</button></div>', 'button'))).toBe('yield');
	});
});

describe('undoHint', () => {
	it('promises ⌘Z only where Filo owns the pane', () => {
		expect(undoHint(true)).toContain('⌘Z');
		expect(undoHint(false)).not.toContain('⌘Z');
	});
});
