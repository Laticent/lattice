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
	| 'toggle-mode'
	| 'slide-settings';

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

/** Run a command by id. Returns false when the Studio does not offer it right now (a command is
 *  left out of the list while it would do nothing, e.g. Focus outside Craft). */
export function runCommand(commands: readonly StudioCommand[], id: StudioCommandId): boolean {
	const c = commands.find((x) => x.id === id);
	if (!c) return false;
	c.run();
	return true;
}
