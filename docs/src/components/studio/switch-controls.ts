// The Studio's switch controls (lib/core/switches.mjs). WHERE each switch lives — the Deck Settings
// control, the Slide Settings control, or the reason one scope has none — is `SWITCH_HOMES` in
// switch-homes.ts, a module only its test imports, so the table costs the Studio bundle nothing.
//
// THE GROUPING (engineering/decisions/2026-11-04-switch-vocabulary.md §Studio controls), the same
// words in both panels, so a switch sits under the same tab name at either scope:
//   · Chrome  — the frame around the slide: header, footer, page number, section rail, logo.
//   · Content — parts drawn inside the content: below-note, heading period, table row label,
//               pane spine, callouts. One tab, because each is one switch with no other setting.
//   · Accent  — where the spectrum shows, and the heading rule: settings with several values,
//               whose Off is one of them (`spectrum: off` stamps `no-spectrum`).
//   · Look    — the finish (its None is `no-finish`; `no-backdrop` is that switch's old alias).
//   · Marks   — tints and marks: the chips set a slide's own, and "Hide the deck's tints" writes
//               `no-treatment` (shown when the deck's `class:` stamps one).
//   · Motion  — Play.
//
// The CONTENT rows are drawn from `CONTENT_SWITCHES` below by both panels, so a row's label, its
// option words and the token it writes cannot drift between the deck and the slide.

import type { SWITCHES } from '../../../../lib/core/switches.mjs';

export type SwitchName = (typeof SWITCHES)[number]['name'];

/**
 * The Content tab's rows, in order. `tri` marks a switch whose default is neither on nor off — the
 * engine measures it (the row label) or keeps what the author wrote (the period) — so its control
 * offers Auto / On / Off at the deck too, instead of a toggle. `register` names a front-matter key
 * that holds the deck's setting (`callout: off`) in place of a `class:` token.
 */
export type ContentSwitch = {
	name: SwitchName;
	label: string;
	desc: string;
	help: string;
	tri?: boolean;
	on?: string;
	off?: string;
	/** What a tri-state switch does with no token, for the deck picker's Auto head. */
	auto?: string;
	register?: string;
};

export const CONTENT_SWITCHES: readonly ContentSwitch[] = Object.freeze([
	{ name: 'note', label: 'Below-note', desc: 'A closing line drawn as a ruled note.', help: 'A short paragraph after the body becomes a ruled note at the foot of the content. Off keeps it as body copy. Written no-note / with-note.' },
	{ name: 'period', label: 'Heading period', desc: 'A full stop on the heading.', tri: true, on: 'Add', off: 'Remove', auto: 'As written', help: 'Auto keeps each heading as written. Add puts a period on a heading that has none; Remove takes a trailing one off. Written with-period / no-period. Add at the deck wins over a slide\'s Remove.' },
	{ name: 'row-label', label: 'Table row label', desc: 'The first table column as labels.', tri: true, auto: 'Per table', help: 'Auto lets the engine decide per table, from what the first column holds. On or Off overrules it. Written with-row-label / no-row-label. On at the deck wins over a slide\'s Off.' },
	{ name: 'spine', label: 'Pane spine', desc: 'The line between columns or rows.', help: 'The divider between the panes of a columns or rows slide. Written no-spine / with-spine. An exported Marp bundle stacks the panes, so it draws none.' },
	{ name: 'callout', label: 'Callouts', desc: 'Notes pinned to chart marks.', register: 'callout', help: 'Off hides every @callout on the chart and in the narration; the detail still reaches the speaker note. Written callout: off for the deck, no-callout / with-callout on a slide.' },
] satisfies ContentSwitch[]);

export type SwitchState = 'on' | 'off' | null;

/** A switch's own state in one class list: `with-X` → on, `no-X` → off, neither → null. */
export function switchState(name: string, tokens: readonly string[]): SwitchState {
	if (tokens.includes(`with-${name}`)) return 'on';
	if (tokens.includes(`no-${name}`)) return 'off';
	return null;
}

/** `tokens` with switch `name`'s two tokens replaced by the one `state` asks for (none for null). */
export function withSwitchState(name: string, tokens: readonly string[], state: SwitchState): string[] {
	const kept = tokens.filter((t) => t !== `no-${name}` && t !== `with-${name}`);
	return state ? [...kept, `${state === 'on' ? 'with' : 'no'}-${name}`] : kept;
}

/** Every class token the Content tab owns at the deck (the Default slide class field hides them). */
export const CONTENT_SWITCH_TOKENS: readonly string[] = Object.freeze(
	CONTENT_SWITCHES.filter((s) => !s.register).flatMap((s) => [`no-${s.name}`, `with-${s.name}`]),
);
