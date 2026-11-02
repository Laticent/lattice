import { describe, expect, it } from 'vitest';
import { keysFor, menuItems } from './model';

describe('the slide menu (2026-10-27-slide-structure-strip.md §5)', () => {
	const ids = (s: Parameters<typeof menuItems>[0]) => menuItems(s, true).map((i) => i.id);

	it('offers the same six actions in the same order on every slide', () => {
		const order = ['new-after', 'new-before', 'duplicate', 'move-earlier', 'move-later', 'delete'];
		for (const at of [0, 3, 6]) expect(ids({ count: 7, at })).toEqual(order);
		expect(ids({ count: 1, at: 0 })).toEqual(order);
	});

	it('keeps a disabled action visible and says why', () => {
		const first = menuItems({ count: 7, at: 0 }, true);
		expect(first.find((i) => i.id === 'move-earlier')?.disabled).toBe('Already first');
		expect(first.find((i) => i.id === 'move-later')?.disabled).toBeUndefined();
		const last = menuItems({ count: 7, at: 6 }, true);
		expect(last.find((i) => i.id === 'move-later')?.disabled).toBe('Already last');
		const one = menuItems({ count: 1, at: 0 }, true);
		expect(one.find((i) => i.id === 'move-earlier')?.disabled).toBe('Only one slide');
		expect(one.find((i) => i.id === 'move-later')?.disabled).toBe('Only one slide');
		expect(one.find((i) => i.id === 'delete')?.disabled).toBe('A deck needs one slide');
		expect(one.find((i) => i.id === 'duplicate')?.disabled).toBeUndefined();
	});

	it('turns Delete into a confirm that names the slide while armed', () => {
		const d = menuItems({ count: 4, at: 1, armed: true, name: '“Pricing”' }, true).find((i) => i.id === 'delete');
		expect(d?.label).toBe('Confirm delete “Pricing”');
		expect(d?.danger).toBe(true);
	});

	it('prints each shortcut the platform’s way', () => {
		expect(keysFor('duplicate', true)).toBe('⌘D');
		expect(keysFor('duplicate', false)).toBe('Ctrl+D');
		expect(keysFor('move-later', true)).toBe('⇧⌘→');
		expect(keysFor('move-later', false)).toBe('Ctrl+Shift+Right');
		expect(keysFor('delete', false)).toBe('Delete');
		for (const i of menuItems({ count: 3, at: 1 }, false)) expect(i.keys).toBe(keysFor(i.id, false));
	});
});

describe('the strip’s shortcuts (§5)', async () => {
	const { stripShortcut } = await import('./model');
	const k = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });

	it('maps §5’s table on a Mac', () => {
		expect(stripShortcut(k('Enter', { metaKey: true }), true)).toBe('new-after');
		expect(stripShortcut(k('Enter', { metaKey: true, shiftKey: true }), true)).toBe('new-before');
		expect(stripShortcut(k('d', { metaKey: true }), true)).toBe('duplicate');
		expect(stripShortcut(k('ArrowLeft', { metaKey: true, shiftKey: true }), true)).toBe('move-earlier');
		expect(stripShortcut(k('ArrowRight', { metaKey: true, shiftKey: true }), true)).toBe('move-later');
		expect(stripShortcut(k('Backspace'), true)).toBe('delete');
		expect(stripShortcut(k('Delete'), true)).toBe('delete');
	});

	it('uses Ctrl elsewhere, and never a chord of the other platform', () => {
		expect(stripShortcut(k('d', { ctrlKey: true }), false)).toBe('duplicate');
		expect(stripShortcut(k('d', { metaKey: true }), false)).toBeNull();
		expect(stripShortcut(k('d', { ctrlKey: true }), true)).toBeNull();
	});

	it('leaves alone what it does not own: plain arrows, Alt chords, a modified Backspace, ⌘Z', () => {
		expect(stripShortcut(k('ArrowRight'), true)).toBeNull();
		expect(stripShortcut(k('ArrowLeft', { altKey: true, metaKey: true, shiftKey: true }), true)).toBeNull();
		expect(stripShortcut(k('Backspace', { metaKey: true }), true)).toBeNull();
		expect(stripShortcut(k('Backspace', { shiftKey: true }), true)).toBeNull();
		expect(stripShortcut(k('z', { metaKey: true }), true)).toBeNull();
	});
});
