// The Studio ACTION LIST — every verb the command palette offers, defined once.
//
// StudioShell builds the list (each `run` closes over real Studio state); the palette renders its
// rows from it, and a lesson runs a verb by id through the same list (lessons/lesson-kit.ts), so
// "do it for me" in a lesson is exactly the palette row. Before this, the palette took one prop per
// action and the tours kept their own setter bag, so the same verb was written down three times.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md.

import type * as React from 'react';

export type StudioCommandId =
	| 'present'
	| 'share'
	| 'export-pdf'
	| 'reshape'
	| 'insert'
	| 'insert-icon'
	| 'focus'
	| 'write-compose'
	| 'write-source'
	| 'fabricate'
	| 'read-article'
	| 'library'
	| 'workspace'
	| 'watch-demo'
	| 'feedback'
	| 'new-deck'
	| 'import-deck'
	| 'coach'
	| 'fix-all'
	| 'format-code'
	| 'toggle-mode'
	| 'slide-settings'
	| 'slide-new-before'
	| 'slide-duplicate'
	| 'slide-move-before'
	| 'slide-move-after'
	| 'slide-hide'
	| 'slide-show'
	| 'slide-delete'
	| 'shortcuts';

export type StudioCommand = {
	id: StudioCommandId;
	/** The row's text, and its accessible name — e2e finds rows by it, so keep it stable. */
	label: string;
	/** Extra words search should match ("pdf", "download"). */
	keywords?: string[];
	icon: React.ComponentType<{ className?: string }>;
	/** Which palette group shows the row. `deck` rows sit with the deck switcher. */
	group: 'actions' | 'deck';
	run: () => void;
};

/**
 * What each command does, in a line a screen reader reads after the row's name (the palette's
 * `description`, ui/command.tsx). One per id, so a new command cannot ship without one: VoiceOver
 * otherwise fills that pause with its generic option hint (owner, on an iPhone, PR #3108). Say what
 * happens, never the label again.
 */
export const COMMAND_DESCRIPTIONS: Record<StudioCommandId, string> = {
	present: 'Shows the deck full screen, one slide at a time, from this slide.',
	'write-compose': 'Edits the deck as formatted text: headings, lists and objects, no markup.',
	'write-source': 'Edits the deck as its Markdown, for full control. Remembered for next time.',
	share: 'Opens sharing: a present link, the Markdown source, and every export format.',
	'export-pdf': 'Opens sharing on the PDF step, ready to download this deck as a PDF.',
	reshape: 'Opens reader views: a subset of this deck you approve for one kind of reader.',
	insert: 'Opens the slide gallery to pick a layout for a new slide after this one.',
	'insert-icon': 'Opens the icon grid; the icon you pick goes in at the cursor.',
	focus: 'Hides every panel but the editor and the preview.',
	fabricate: 'Opens the studio for making your own themes and components.',
	'read-article': 'Shows the deck as one continuous article to read.',
	library: 'Opens your saved themes, components, finishes and photos.',
	workspace: 'Opens preferences, the AI model and key, and storage for the whole workspace.',
	'watch-demo': 'Plays a guided tour that drives the Studio by itself while you watch.',
	feedback: 'Opens a form that drafts a GitHub issue for you to review and send.',
	'new-deck': 'Starts a blank deck and switches to it.',
	'import-deck': 'Opens a file picker for a Lattice, Markdown, PowerPoint or PDF file.',
	coach: 'Opens the Coach: scores for craft and style, and a fix for each finding.',
	'fix-all': 'Applies every automatic fix the editor has found in this deck.',
	'format-code': 'Runs the code formatter over every code block in this deck.',
	'toggle-mode': 'Swaps the Studio between its light and dark appearance.',
	'slide-settings': "Opens this slide's settings: its look, modifiers and speaker notes.",
	'slide-new-before': 'Opens the slide gallery to add a slide in front of this one.',
	'slide-duplicate': 'Adds a copy of this slide right after it.',
	'slide-move-before': 'Swaps this slide with the one before it.',
	'slide-move-after': 'Swaps this slide with the one after it.',
	'slide-hide': 'Keeps this slide in the source but leaves it out when you present or export.',
	'slide-show': 'Puts this hidden slide back into the presentation and exports.',
	'slide-delete': 'Removes this slide from the deck, after a confirm while others are editing live. Undo brings it back.',
	shortcuts: 'Lists every keyboard shortcut in the Studio.',
};

/** Run a command by id. Returns false when the Studio does not offer it right now (a command is
 *  left out of the list while it would do nothing, e.g. Focus outside Craft). */
export function runCommand(commands: readonly StudioCommand[], id: StudioCommandId): boolean {
	const c = commands.find((x) => x.id === id);
	if (!c) return false;
	c.run();
	return true;
}

/**
 * Run the "Format code blocks" command against the editor, which may not be built yet: on a phone the editor waits for the
 * first slide (`StudioShell.tsx`, `holdEditor`), and a command that silently did nothing in that window read as broken.
 * Says so instead, and tells the author to try again.
 */
export function runFormatCode(
	editor: { formatCode(): Promise<Parameters<typeof formatCodeNotice>[0]> } | null | undefined,
	notify: (message: string) => void,
): void {
	if (!editor) {
		notify('The editor is still loading. Try again in a moment.');
		return;
	}
	void editor.formatCode().then((r) => notify(formatCodeNotice(r)));
}

/** What the "Format code blocks" command says when it finishes: what changed, and the first block it
 *  left alone, with why (lib/authoring/code-format/plan.mjs). Null: the deck changed while the
 *  formatters ran, so nothing was applied. */
export function formatCodeNotice(r: { changes: unknown[]; skipped: Array<{ lang: string; line: number; error: string }>; failed?: string } | null): string {
	if (!r) return 'The deck changed while formatting; nothing was applied. Run it again.';
	if (r.failed) return `Could not format: ${r.failed}.`;
	const n = r.changes.length;
	const done = n ? `Formatted ${n} code block${n === 1 ? '' : 's'}.` : 'Code blocks are already formatted.';
	const first = r.skipped[0];
	if (!first) return done;
	const more = r.skipped.length > 1 ? ` (and ${r.skipped.length - 1} more)` : '';
	return `${done} The ${first.lang} block at line ${first.line} keeps its text: ${first.error}${more}.`;
}

