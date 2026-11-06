// THE STRIP'S ACTIONS, as data: which actions a slide's menu offers, which are disabled and why, and the keys each
// one shows. Pure, so a test pins every rule without a DOM (2026-10-27-slide-structure-strip.md §5).
//
// Positions are RENDERED slides in the full deck: the strip's affordances exist only on the full view, where a
// strip's place is the deck's place.

export type StripActionId = 'new-after' | 'new-before' | 'duplicate' | 'move-before' | 'move-after' | 'hide' | 'delete';

export interface StripMenuItem {
	id: StripActionId;
	label: string;
	/** The shortcut as the menu shows it ("⌘D", "Ctrl+D"). */
	keys: string;
	/** Why the action cannot run now; the item stays in the menu, disabled, with this beside it. */
	disabled?: string;
	danger?: boolean;
	/** The slide is hidden, so the `hide` item reads "Show slide" and draws the open eye. */
	hidden?: boolean;
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
	/** The menu's slide is hidden (`<!-- hide -->`): Present and every export leave it out. */
	hidden?: boolean;
}

/** The keys each action answers to while the strip holds keyboard focus (§5's table), as the menu prints them. */
export function keysFor(id: StripActionId, mac: boolean): string {
	// macOS menus print glyphs (⇧⌘←); Windows and Linux menus spell the keys out (Ctrl+Shift+Left).
	switch (id) {
		case 'new-after':
			return mac ? '⌘↩' : 'Ctrl+Enter';
		case 'new-before':
			return mac ? '⇧⌘↩' : 'Ctrl+Shift+Enter';
		case 'duplicate':
			return mac ? '⌘D' : 'Ctrl+D';
		case 'move-before':
			return mac ? '⇧⌘←' : 'Ctrl+Shift+Left';
		case 'move-after':
			return mac ? '⇧⌘→' : 'Ctrl+Shift+Right';
		case 'hide':
			// No shortcut: the menu and the command palette are the doors, as in Keynote and PowerPoint.
			return '';
		case 'delete':
			return mac ? '⌫' : 'Delete';
	}
}

/** The menu for slide `s.at`: New Slide After, New Slide Before, Duplicate, Move Before, Move After, Hide Slide (Show Slide
 *  on a hidden slide), Delete, in that order. The menu's items are Title Case (the owner's call, 2026-11-06); the
 *  palette, the shortcut list and Undo keep the Studio's sentence case. A disabled item says why rather than vanishing, so the menu has the same
 *  shape on every slide. The words are the nomenclature table's (2026-10-27-slide-structure-strip.md §5.1). */
export function menuItems(s: StripMenuState, mac: boolean): StripMenuItem[] {
	const one = s.count <= 1;
	const first = s.at <= 0;
	const last = s.at >= s.count - 1;
	return [
		{ id: 'new-after', label: 'New Slide After', keys: keysFor('new-after', mac) },
		{ id: 'new-before', label: 'New Slide Before', keys: keysFor('new-before', mac) },
		{ id: 'duplicate', label: 'Duplicate', keys: keysFor('duplicate', mac) },
		{ id: 'move-before', label: 'Move Before', keys: keysFor('move-before', mac), disabled: one ? 'Only one slide' : first ? 'Already first' : undefined },
		{ id: 'move-after', label: 'Move After', keys: keysFor('move-after', mac), disabled: one ? 'Only one slide' : last ? 'Already last' : undefined },
		{ id: 'hide', label: s.hidden ? 'Show Slide' : 'Hide Slide', keys: keysFor('hide', mac), hidden: !!s.hidden },
		{ id: 'delete', label: s.armed ? `Confirm Delete ${s.name ?? 'this slide'}` : 'Delete', keys: keysFor('delete', mac), danger: true, disabled: one ? 'A deck needs one slide' : undefined },
	];
}

export type StripShortcut = StripActionId;

/** The action a key press means while a strip slide holds keyboard focus (§5's table), or null. ⌥← is not used: a lost
 *  focus would make Alt+← the browser's Back on Windows. Backspace and Delete both delete, with no modifier. */
export function stripShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, mac: boolean): StripShortcut | null {
	if (e.altKey) return null;
	const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
	if (!mod) return !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete') ? 'delete' : null;
	if (e.key === 'Enter') return e.shiftKey ? 'new-before' : 'new-after';
	if (e.shiftKey && e.key === 'ArrowLeft') return 'move-before';
	if (e.shiftKey && e.key === 'ArrowRight') return 'move-after';
	if (!e.shiftKey && e.key.toLowerCase() === 'd') return 'duplicate';
	return null;
}

/** Every shortcut the strip answers to, for the "?" list: the menu's actions plus moving between slides. Each row's
 *  `keys` are alternatives (either one does it). */
export function stripShortcutRows(mac: boolean): { keys: string[]; does: string }[] {
	return [
		{ keys: mac ? ['←', '→'] : ['Left', 'Right'], does: 'Previous or next slide' },
		{ keys: ['Home', 'End'], does: 'First or last slide' },
		{ keys: [keysFor('new-after', mac)], does: 'New slide after' },
		{ keys: [keysFor('new-before', mac)], does: 'New slide before' },
		{ keys: [keysFor('duplicate', mac)], does: 'Duplicate' },
		{ keys: [keysFor('move-before', mac), keysFor('move-after', mac)], does: 'Move before or after' },
		{ keys: mac ? ['⌫', 'Delete'] : ['Delete', 'Backspace'], does: 'Delete' },
		{ keys: [mac ? '⌘Z' : 'Ctrl+Z'], does: 'Undo' },
		{ keys: ['Shift+F10'], does: 'Open the slide menu' },
	];
}
