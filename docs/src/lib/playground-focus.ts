// THE PLAYGROUND'S FOCUS, as one lazily loaded unit: the hub, the deck outliner it reads, and the sync rules.
//
// The Playground's first paint does not need any of this: a caret move or a preview scroll that lands in the
// first moments is picked up when the unit arrives (PlaygroundApp feeds it the editor's text, the caret and the
// last render). Keeping it behind a dynamic import keeps the deck outliner and its boundary parser out of the
// route's eager JS (docs/route-budget.json), where a static import of them cost the Playground 9.6 KB gz.

import { deckOutliner } from './deck-outline';
import { createFocusHub, type FocusHub } from './fuoco/hub';
import { createPlaygroundSync, type PlaygroundSync, type SyncPorts } from './playground-sync';

// REMEMBERING WHERE THE READER WAS. The caret is saved on Fuoco's idle lane (the lane its README names for
// persistence), keyed by a fingerprint of the deck text: a reload that finds the same text puts the caret back, and
// the sync then brings the preview to its slide. A different text (the deck was changed elsewhere) restores nothing.
const CARET_KEY = 'lattice-docs-pg-caret';

/** A short fingerprint of a text (FNV-1a with the length): not a security hash, only "is this the same deck". */
export function fingerprint(text: string): string {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return `${(h >>> 0).toString(36)}:${text.length}`;
}

/** The caret saved for exactly this text, or null. */
export function savedCaret(text: string): number | null {
	try {
		const raw = localStorage.getItem(CARET_KEY);
		const saved = raw ? (JSON.parse(raw) as { h?: unknown; head?: unknown }) : null;
		return saved && saved.h === fingerprint(text) && typeof saved.head === 'number' && saved.head >= 0 && saved.head <= text.length ? saved.head : null;
	} catch {
		return null;
	}
}

export function createPlaygroundFocus(ports: SyncPorts): { hub: FocusHub; sync: PlaygroundSync } {
	const hub = createFocusHub({ outliner: deckOutliner });
	// Only a caret in the editor is worth keeping: a preview scroll names a slide but no position in the text.
	hub.subscribe(
		(f) => f,
		(f) => {
			const ol = hub.outline();
			if (!ol || f.head === null || f.origin !== 'editor') return;
			try {
				localStorage.setItem(CARET_KEY, JSON.stringify({ h: fingerprint(ol.source), head: f.head }));
			} catch {
				/* private mode, or full */
			}
		},
		{ lane: 'idle', equals: (a, b) => a.seq === b.seq },
	);
	return { hub, sync: createPlaygroundSync(hub, ports) };
}
