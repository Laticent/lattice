// Playground guided tour — the Explore-first surface (2026-07-06 simplification):
// mode toggle → pick a component → walk the deck → jump with the Step dropdown →
// Edit the markdown → galleries → deck setup → palette. It ENDS inside the
// Playground (no Studio call-to-action). The shared helper (guided-tour.js) owns
// the button, first-visit auto-run, the global on/off, and the popover styling —
// untouched (Studio-succession freeze).
//
// Every step declares the MODE its target needs (`mode: 'read' | 'edit'`), and
// revealStep switches the surface to it before driver measures — the common
// first visit arrives via "Open in Playground" (a handoff forcing Edit), where
// the Explore chrome isn't mounted; without the mode-aware reveal the tour would
// spotlight nothing. The switch goes through the same setViewMode the toggle
// uses (PlaygroundApp listens for `pg-set-view`).
import { initGuidedTour } from './guided-tour.js';

export const STEPS = [
	{
		popover: {
			title: 'Welcome to the Playground',
			description: 'Every Lattice component, one deck at a time — and a live editor one tap away. Here’s the quick tour.',
		},
	},
	{
		element: '.pg-mode',
		mode: 'read',
		popover: {
			title: 'Explore, or Edit',
			description:
				'<strong>◱ Explore</strong> renders the deck. <strong>✎ Edit</strong> opens its markdown in the editor — change it and flip back to see it render. One toggle, two views of the same deck.',
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
				'Search the full catalog — by name, tag, or description. Picking one loads its deck: title, the default form, every variant, a stress test, and how it composes.',
			side: 'bottom',
			align: 'start',
		},
	},
	{
		element: '#pg-walk',
		mode: 'read',
		popover: {
			title: 'Walk the deck',
			description: 'Step with the arrows (or ← →), and keep going — the last slide flows into the next component, so the whole catalog is one continuous read.',
			side: 'top',
			align: 'center',
		},
	},
	{
		element: '#pg-step',
		mode: 'read',
		popover: {
			title: 'Jump to any slide',
			description: 'The Step menu lists every slide in the deck — title, default, each variant, the stress test, compositions. Pick one and the walk snaps to it.',
			side: 'bottom',
			align: 'start',
		},
	},
	{
		element: '#editor-host',
		mode: 'edit',
		popover: {
			title: 'Edit the markdown',
			description: 'Plain Lattice Markdown, with autocomplete for component classes and theme tokens. Flip back to Explore to watch it render through the same engine that ships the PDFs.',
			side: 'right',
			align: 'start',
		},
	},
	{
		element: '#pg-galleries-trigger',
		mode: 'read',
		popover: {
			title: 'Load a full deck',
			description: 'Two shelves: complete showcase decks, and per-family survey decks. They walk slide by slide, same as any component.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		element: '#pg-setup-trigger',
		popover: {
			title: 'Deck setup',
			description: 'Finish, size, page numbers, the debug overlay — the deck-level dials. They apply to whatever deck you’re walking or editing.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		element: '#palette',
		popover: {
			title: 'Try any palette',
			description: 'Recolor everything from here — layouts are palette-blind, so the same Markdown looks at home in every theme, light or dark.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		popover: {
			title: 'That’s the Playground',
			description: 'Explore the catalog, grab any deck, make it yours. Replay this tour anytime from the <strong>Tour</strong> button up top.',
		},
	},
];

// Bring a step's target on screen by switching to the MODE it declared (Explore
// chrome only mounts in 'read'; the editor only shows in 'edit'). The mode flip
// also sets body[data-pane], so the single-pane mobile layout reveals the right
// pane — no separate tab click needed. Driver re-queries the element after this.
function revealStep(_el, step) {
	const want = step?.mode;
	const have = document.body.getAttribute('data-view') || 'edit';
	if (want && want !== have) {
		document.dispatchEvent(new CustomEvent('pg-set-view', { detail: want }));
	}
}

export function initPlaygroundTour() {
	return initGuidedTour({ key: 'playground', steps: STEPS, onReveal: revealStep });
}
