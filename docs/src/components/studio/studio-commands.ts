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
	| 'format-code'
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

