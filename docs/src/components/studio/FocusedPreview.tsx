// THE EDITOR'S LIVE PREVIEW, driven by the focus hub.
//
// The Studio shell decides WHAT deck the preview renders (the viewed set, the theme, the size);
// this wrapper decides WHICH slide and page of it, from the hub, and reports back what the
// preview can show. It is its own component so the one thing that changes with every caret
// line — the line the caret is on — re-renders this wrapper, not the shell. Even here it is
// read only while the shown slide can split (a portrait split, a split panes slide): elsewhere
// the line does not decide anything, and the selector returns '' so a caret move is free.
//
// Three kinds of "more than one page", one route each:
//   · a HEADING-SPLIT slide (`# A` then `## B` in one chunk, the engine's default split): its
//     rendered slides are hub SECTIONS. The per-slide count map (`paneCounts`) carries the
//     section count and `panePage` names the focused section;
//   · a split PANES slide: the same map, and the caret's pane picks the page unless navigation
//     asked for one (`pageIndex`);
//   · a STRUCTURAL split (portrait/square): the caret line picks the page, or `pageIndex`.

import * as React from 'react';
import DeckPreview, { type DeckPreviewProps } from '@/components/DeckPreview';
import type { DeckIndex } from '@/lib/deck-outline';
import type { FocusHub } from '@/lib/fuoco';
import { useFocus } from '@/lib/fuoco/react';

type PaneMod = typeof import('./pane-pages');

export type FocusedPreviewProps = Omit<DeckPreviewProps, 'slideIndex' | 'caretText' | 'pageIndex' | 'panePage' | 'runIsSlides' | 'onSplitPage'> & {
	hub: FocusHub;
	index: DeckIndex;
	/** The chunks on show (full-deck indices), and which of them the preview shows. */
	viewChunks: readonly number[];
	viewIndex: number;
	/** The pane-split counts alone (heading sections excluded), and the module that reads them. */
	panePaneCounts: readonly number[] | undefined;
	paneMod: PaneMod | null;
	/** The shown chunk's text. */
	slideText: string;
};

export function FocusedPreview({ hub, index, viewChunks, viewIndex, panePaneCounts, paneMod, slideText, sample, ...rest }: FocusedPreviewProps) {
	const chunk = viewChunks[viewIndex] ?? -1;
	const sections = index.units[chunk]?.parts.length ?? 1;
	const paneSplit = (panePaneCounts?.[viewIndex] ?? 1) > 1;
	// Whether the caret line decides anything about the shown slide. Learned from the preview's own
	// report (a structural split is known only once rendered at this size) or the pane map.
	const [splits, setSplits] = React.useState(false);
	const caretMatters = sections === 1 && (splits || paneSplit);
	const line = useFocus(hub, (f) => (caretMatters ? f.line : ''));
	const focusChunk = useFocus(hub, (f) => f.unitIndex);
	const section = useFocus(hub, (f) => f.part);
	const page = useFocus(hub, (f) => f.page);
	const onThis = focusChunk === chunk;

	let panePage: number | undefined;
	let pageIndex: number | undefined;
	if (sections > 1) panePage = onThis ? section : 0;
	else {
		pageIndex = onThis && page !== null ? page : undefined;
		if (paneSplit && paneMod) panePage = paneMod.panePageOfCaret(slideText, sample, line);
	}

	const deckRuns = sections > 1 || !!panePaneCounts?.some((n) => n > 1);
	const onSplitPage = React.useCallback<NonNullable<DeckPreviewProps['onSplitPage']>>(
		(report) => {
			const c = viewChunks[report.slide];
			const ch = c === undefined ? undefined : index.units[c];
			const many = (ch?.parts.length ?? 1) > 1;
			setSplits(report.canSplit);
			// A heading-split slide's "pages" are hub sections, so it reports a run of one.
			hub.pages('preview', {
				unit: ch?.id ?? null,
				part: many ? hub.get().part : 0,
				count: many ? 1 : (report.page?.count ?? 1),
				shown: many ? 0 : (report.page?.index ?? 0),
				canSplit: report.canSplit || deckRuns,
			});
		},
		[hub, index, viewChunks, deckRuns],
	);

	return <DeckPreview {...rest} sample={sample} slideIndex={viewIndex} caretText={line} panePage={panePage} pageIndex={pageIndex} runIsSlides={sections > 1} onSplitPage={onSplitPage} />;
}
