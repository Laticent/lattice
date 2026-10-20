// The Studio's split-panel sizing contract — ONE place for every docked width and for the
// ideal layout of the whole group (2026-10-20-studio-split-panel-sizing.md).
//
// Before this, five constants (ARCH/SET/LIB × MIN/DEFAULT, PANEL_MAX) plus a hardcoded 296
// for the tablet inspector set the docks, and the editor|preview pair took whatever the
// library left over. Measured on the real surface, that gave docks that always opened at
// their MINIMUM (260 / 200, never the 296 / 232 they declared) because the library
// normalizes mixed px + % defaults, an editor share that drifted from 46% to 41%, and at
// 1100 / 820 a total of minimums larger than the group, so every panel squeezed below its
// own floor and the chat composer clipped by 2px.

import { PREVIEW_CHROME } from './preview-rect';

/**
 * Every docked side panel — Settings, Assistant (Coach / Chat / Live / Lenses), Library and
 * the tablet Inspector — shares these three numbers.
 *  · min 280: the chat composer's floor is 196px (attach, lock, regenerate, send + padding)
 *    and Settings' rows stop wrapping at 220; 280 leaves the chat ~32 characters per line.
 *  · default 320: Settings' natural width; Library's header fits its Import label at 320.
 *  · max 480: a drag ceiling.
 */
export const DOCK = { min: 280, default: 320, max: 480 } as const;

/** The editor's share of the editor|preview pair (the complement of `defaultPreviewFrac`). */
const EDITOR_SHARE = 1 - PREVIEW_CHROME.defaultPreviewFrac;

export type DockLayout = {
	/** Panel id → percentage of the group, summing to 100 — the library's own layout shape. */
	layout: Record<string, number>;
	/** True when the pair cannot fit at its minimums, so the editor is held at its rail. */
	foldEditor: boolean;
};

/**
 * The ideal layout for a group `groupW` px wide holding `ids` (docks in any position, plus the
 * editor and preview panels named by `editorId` / `previewId`).
 *
 * 1. Docks start at DOCK.default.
 * 2. If the pair would drop below 2 × its minimum, docks give up width, down to DOCK.min.
 * 3. If it still does not fit, the editor folds to its rail and the preview takes the rest,
 *    so nothing is ever drawn narrower than its own minimum.
 * 4. Otherwise the editor takes EDITOR_SHARE of the pair, never under its minimum.
 *
 * Returns undefined when the group has no pair (nothing to lay out).
 */
export function idealDockLayout(groupW: number, ids: readonly string[], editorId: string, previewId: string): DockLayout | undefined {
	if (!ids.includes(editorId) || !ids.includes(previewId) || !(groupW > 0)) return undefined;
	const docks = ids.filter((id) => id !== editorId && id !== previewId);
	const avail = groupW - (ids.length - 1); // each separator is 1px
	const { splitEditorMin: eMin, splitPreviewMin: pMin, splitRailW: rail } = PREVIEW_CHROME;
	const px: Record<string, number> = {};
	let dockTotal = docks.length * DOCK.default;
	let dockW: number = DOCK.default;
	if (avail - dockTotal < eMin + pMin) {
		// Shrink every dock equally toward its floor, just enough to hand the pair its minimums.
		dockW = Math.max(DOCK.min, Math.floor((avail - eMin - pMin) / Math.max(1, docks.length)));
		dockTotal = docks.length * dockW;
	}
	for (const id of docks) px[id] = dockW;
	const pair = avail - dockTotal;
	let foldEditor = false;
	if (pair < eMin + pMin) {
		foldEditor = true;
		px[editorId] = rail;
		px[previewId] = avail - dockTotal - rail;
	} else {
		const editor = Math.max(eMin, Math.round(pair * EDITOR_SHARE));
		px[editorId] = editor;
		px[previewId] = pair - editor;
	}
	const layout: Record<string, number> = {};
	for (const id of ids) layout[id] = (px[id] / avail) * 100;
	return { layout, foldEditor };
}
