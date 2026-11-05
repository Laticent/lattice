// Where every SWITCH (lib/core/switches.mjs) lives in the Studio — the Deck Settings control, the
// Slide Settings control, or the reason one scope has none. ONE table, keyed by the switch names,
// so `switch-controls.test.ts` fails the day a switch lands in `SWITCHES` without a home here, or a
// home names a row the panels no longer draw. Only the test imports it: the panels draw their rows
// from `CONTENT_SWITCHES` (switch-controls.ts), so this table stays out of the Studio bundle.

/** A control: the settings tab it sits in and its row label, or the reason this scope has none. */
export type SwitchHome = { tab: string; label: string } | { none: string };

export const SWITCH_HOMES: Readonly<Record<string, { deck: SwitchHome; slide: SwitchHome }>> = Object.freeze({
	header: { deck: { tab: 'Chrome', label: 'Header' }, slide: { tab: 'Chrome', label: 'Hide header' } },
	footer: { deck: { tab: 'Chrome', label: 'Footer' }, slide: { tab: 'Chrome', label: 'Hide footer' } },
	pagination: { deck: { tab: 'Chrome', label: 'Page numbers' }, slide: { tab: 'Chrome', label: 'Hide page number' } },
	progress: { deck: { tab: 'Chrome', label: 'Section rail' }, slide: { tab: 'Chrome', label: 'Hide rail' } },
	logo: { deck: { tab: 'Chrome', label: 'Logo' }, slide: { tab: 'Chrome', label: 'Hide logo' } },
	note: { deck: { tab: 'Content', label: 'Below-note' }, slide: { tab: 'Content', label: 'Below-note' } },
	period: { deck: { tab: 'Content', label: 'Heading period' }, slide: { tab: 'Content', label: 'Heading period' } },
	'row-label': { deck: { tab: 'Content', label: 'Table row label' }, slide: { tab: 'Content', label: 'Table row label' } },
	spine: { deck: { tab: 'Content', label: 'Pane spine' }, slide: { tab: 'Content', label: 'Pane spine' } },
	callout: { deck: { tab: 'Content', label: 'Callouts' }, slide: { tab: 'Content', label: 'Callouts' } },
	'heading-rule': { deck: { tab: 'Accent', label: 'Heading rule' }, slide: { tab: 'Accent', label: 'Heading rule' } },
	motion: { deck: { tab: 'Motion', label: 'Play' }, slide: { tab: 'Motion', label: 'Play' } },
	spectrum: { deck: { tab: 'Accent', label: 'Brand bar' }, slide: { tab: 'Accent', label: 'Brand bar' } },
	'spectrum-edge': { deck: { tab: 'Accent', label: 'Bar placement' }, slide: { tab: 'Accent', label: 'Bar placement' } },
	'spectrum-card': { deck: { tab: 'Accent', label: 'Card rail' }, slide: { tab: 'Accent', label: 'Card rail' } },
	'spectrum-trim': { deck: { tab: 'Accent', label: 'Structural trim' }, slide: { tab: 'Accent', label: 'Structural trim' } },
	finish: { deck: { tab: 'Look', label: 'Finish' }, slide: { tab: 'Look', label: 'Finish' } },
	backdrop: {
		deck: { none: '`no-backdrop` is the old spelling of `no-finish` (both clear the finish): Look ▸ Finish ▸ None writes `no-finish`.' },
		slide: { none: '`no-backdrop` is the old spelling of `no-finish` (both clear the finish): Look ▸ Finish ▸ None writes `no-finish`.' },
	},
	treatment: {
		deck: { none: 'A tint or a mark is set slide by slide in Marks; a deck that stamps one in `class:` edits it in General ▸ Default slide class.' },
		slide: { tab: 'Marks', label: "Hide the deck's tints" },
	},
});
