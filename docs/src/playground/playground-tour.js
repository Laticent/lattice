// Playground guided tour — rewritten for the Explore-first surface (2026-07-05
// Specimen Book decision §4/§6, PR 6): picker → Walk bar → variant jump → the
// Edit escape hatch → galleries → deck setup → palette — and it ENDS inside the
// Playground (§0.5: no Studio call-to-action; this is a playground). The shared
// helper (guided-tour.js) owns the button, the first-visit auto-run, the global
// on/off, and the palette-blind popover styling — untouched (Studio-succession
// freeze).
//
// Every step declares the MODE its target needs (`mode: 'read' | 'edit'`), and
// revealStep switches the surface to it before driver measures — the most
// common first visit arrives via "Open in Playground" (a handoff forcing Edit),
// where the Explore chrome isn't mounted; without the mode-aware reveal the
// tour would spotlight nothing. The switch goes through the same setViewMode
// the pill uses (PlaygroundApp listens for `pg-set-view`).
import { initGuidedTour } from './guided-tour.js';

export const STEPS = [
	{
		popover: {
			title: 'Welcome to the Playground',
			description:
				'Every Lattice component, walking one slide at a time — and a live editor one tap away. Here’s the quick tour.',
		},
	},
	{
		element: '.pg-view-tabs',
		mode: 'read',
		popover: {
			title: 'Explore, or Edit',
			description:
				'<strong>Explore</strong> walks the component gallery decks — pure eye candy, nothing to break. <strong>Edit</strong> is the Markdown sandbox. Flip anytime; exploring never touches your draft.',
			side: 'bottom',
			align: 'start',
		},
	},
	{
		element: '#pg-template-trigger',
		mode: 'read',
		popover: {
			title: 'Pick any component',
			description:
				'Search the full catalog — by name, tag, or description. In Explore, picking one starts its walk: title, the default form, every variant, a stress test, and how it composes.',
			side: 'bottom',
			align: 'start',
		},
	},
	{
		element: '#pg-walk',
		mode: 'read',
		popover: {
			title: 'Walk the deck',
			description:
				'Step with the arrows (or ← →), jump with the labeled chips, and keep going — the last slide flows into the next component, so the whole catalog is one continuous read.',
			side: 'top',
			align: 'center',
		},
	},
	{
		element: '#pg-variant',
		mode: 'read',
		popover: {
			title: 'Jump to a variant',
			description: 'While exploring, the Variant menu is a jump list — pick one and the walk snaps to its slide.',
			side: 'bottom',
			align: 'start',
		},
	},
	{
		element: '#pg-walk',
		mode: 'read',
		popover: {
			title: 'Make any slide yours',
			description:
				'<strong>Edit this slide</strong> drops the slide you’re looking at into the editor. If you have unsaved work there, it asks first — and backs it up with one-tap Undo either way.',
			side: 'top',
			align: 'end',
		},
	},
	{
		element: '#editor-host',
		mode: 'edit',
		popover: {
			title: 'Edit the Markdown',
			description:
				'Plain Lattice Markdown, with autocomplete for component classes and theme tokens. It renders live through the same engine that ships the PDFs.',
			side: 'right',
			align: 'start',
		},
	},
	{
		element: '#pg-galleries-trigger',
		mode: 'read',
		popover: {
			title: 'Load a full deck',
			description:
				'Two shelves: complete showcase decks, and per-family survey decks. In Explore they walk slide by slide, same as any component.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		element: '#pg-setup-trigger',
		popover: {
			title: 'Deck setup',
			description:
				'Finish, size, page numbers, debug overlay — the deck-level dials. They apply to whatever deck you’re walking or editing.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		element: '#palette',
		popover: {
			title: 'Try any palette',
			description:
				'Recolor everything from here — layouts are palette-blind, so the same Markdown looks at home in every theme, light or dark.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		popover: {
			title: 'That’s the Playground',
			description:
				'Explore the catalog, grab any slide, make it yours. Replay this tour anytime from the <strong>Tour</strong> button up top.',
		},
	},
];

// Bring a step's target on screen: first the MODE it declared (Explore chrome
// only mounts in 'read'; the editor only shows in 'edit'), then — in Edit on a
// phone — the pane tab that owns it. Driver re-queries the element after this.
function revealStep(el, step) {
	const want = step?.mode;
	const have = document.body.getAttribute('data-view') || 'edit';
	if (want && want !== have) {
		document.dispatchEvent(new CustomEvent('pg-set-view', { detail: want }));
	}
	if ((want || have) === 'edit' && el && el.offsetParent === null) {
		const tabs = document.querySelectorAll('.pg-mobile-tabs [role="tab"]');
		const wantTab = el.closest('.pg-pane.preview') ? 'preview' : 'markdown';
		for (const t of tabs) {
			if ((t.textContent || '').trim().toLowerCase() === (wantTab === 'preview' ? 'preview' : 'markdown')) {
				t.click();
				break;
			}
		}
	}
}

export function initPlaygroundTour() {
	return initGuidedTour({ key: 'playground', steps: STEPS, onReveal: revealStep });
}
