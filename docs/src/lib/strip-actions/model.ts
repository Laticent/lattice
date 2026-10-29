// THE STRIP'S ACTIONS, as data: which actions a slide's menu offers, which are disabled and why, and the keys each
// one shows. Pure, so a test pins every rule without a DOM (2026-10-27-slide-structure-strip.md §5).
//
// Positions are RENDERED slides in the full deck: the strip's affordances exist only on the full view, where a
// strip's place is the deck's place.

export type StripActionId = 'new-before' | 'duplicate' | 'move-earlier' | 'move-later' | 'delete';

export interface StripMenuItem {
	id: StripActionId;
	label: string;
	/** The shortcut as the menu shows it ("⌘D", "Ctrl+D"). */
	keys: string;
	/** Why the action cannot run now; the item stays in the menu, disabled, with this beside it. */
	disabled?: string;
	danger?: boolean;
}

export interface StripMenuState {
	/** How many slides the deck renders. */
	count: number;
	/** The menu's slide, 0-based. */
	at: number;
	/** Others are in a Live session: Delete asks first, and while `armed` its item is the confirm. */
	armed?: boolean;
	/** The slide's name for the confirm ("“Market size”", "this slide"). */
	name?: string;
}

/** The keys each action answers to while the strip holds keyboard focus (§5's table), as the menu prints them. */
export function keysFor(id: StripActionId | 'new-after', mac: boolean): string {
	// macOS menus print glyphs (⇧⌘←); Windows and Linux menus spell the keys out (Ctrl+Shift+Left).
	switch (id) {
		case 'new-after':
			return mac ? '⌘↩' : 'Ctrl+Enter';
		case 'new-before':
			return mac ? '⇧⌘↩' : 'Ctrl+Shift+Enter';
		case 'duplicate':
			return mac ? '⌘D' : 'Ctrl+D';
		case 'move-earlier':
			return mac ? '⇧⌘←' : 'Ctrl+Shift+Left';
		case 'move-later':
			return mac ? '⇧⌘→' : 'Ctrl+Shift+Right';
		case 'delete':
			return mac ? '⌫' : 'Delete';
	}
}

/** The menu for slide `s.at`: New slide before, Duplicate, Move earlier, Move later, Delete, in that order. A disabled
 *  item says why rather than vanishing, so the menu has the same shape on every slide. */
export function menuItems(s: StripMenuState, mac: boolean): StripMenuItem[] {
	const one = s.count <= 1;
	const first = s.at <= 0;
	const last = s.at >= s.count - 1;
	return [
		{ id: 'new-before', label: 'New slide before', keys: keysFor('new-before', mac) },
		{ id: 'duplicate', label: 'Duplicate', keys: keysFor('duplicate', mac) },
		{ id: 'move-earlier', label: 'Move earlier', keys: keysFor('move-earlier', mac), disabled: one ? 'Only one slide' : first ? 'Already first' : undefined },
		{ id: 'move-later', label: 'Move later', keys: keysFor('move-later', mac), disabled: one ? 'Only one slide' : last ? 'Already last' : undefined },
		{ id: 'delete', label: s.armed ? `Confirm delete ${s.name ?? 'this slide'}` : 'Delete', keys: keysFor('delete', mac), danger: true, disabled: one ? 'A deck needs one slide' : undefined },
	];
}
