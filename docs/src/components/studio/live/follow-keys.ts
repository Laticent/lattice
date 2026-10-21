// What a member shows the others about WHERE they are, declared once. Tavola's view
// (`@/lib/tavola/view`) keeps only these keys, each checked against its list, so a new thing to follow is
// one more line here and the gate, the bounds and the privacy switch come with it. Every value is a place
// from a fixed list or a flag; there is no text a person typed. Design: engineering/decisions/2026-10-21-follow-over-tavola.md §6.

import { bool, defineViewKeys, type Infer, int, obj, oneOf, opt, pattern } from '@/lib/tavola/view';
import { FOCUS_ROWS, rowName } from './follow-bus';
import type { LiveDoing } from './live-model';

/** The section ids of the Deck and Slide panels. A typo in a component's tab id is caught by `useViewKey`'s
 *  type; a new tab joins this list in the same commit. */
export const SECTIONS = ['look', 'chrome', 'general', 'brand', 'image', 'motion', 'speech', 'plugins', 'notes', 'marks', 'comments'] as const;

/** `none` is "no side panel open": an absent key means "no information", which is a different thing. */
export const VIEW_KEYS = defineViewKeys({
	panel: oneOf(['none', 'coach', 'lenses', 'library', 'live']),
	view: oneOf(['compose', 'fabricate', 'article']),
	presenting: bool,
	asking: bool,
	/** The right-hand settings panel: which scope is open. */
	inspector: oneOf(['none', 'deck', 'slide']),
	/** The section tab inside it. The ids of the Deck and Slide panels' tabs (both panels have a `look`). */
	section: oneOf(SECTIONS),
	/** Where this member's own Present is, while it is open. */
	/** The settings row with focus: a place from the listed rows. */
	focus: oneOf(FOCUS_ROWS),
	/** The workspace settings sheet is open (shown to others, never applied), and which tab. */
	shown: oneOf(["setup"]),
	setupTab: oneOf(['General', 'AI', 'Data']),
	/** The last settings row changed, by name only, with a counter so each change is seen once. */
	changed: obj({ what: oneOf(FOCUS_ROWS), n: int(0, 1_000_000) }),
	present: obj({ idx: int(0, 10_000), page: int(0, 10_000), lens: pattern(/^[A-Za-z0-9_-]+$/, 64), hash: opt(pattern(/^[0-9a-f]{1,8}$/, 8)) }),
});

type Panel = Infer<(typeof VIEW_KEYS)['schemas'] extends ReadonlyMap<string, infer S> ? S : never>;
export type FollowPlace = { panel: LiveDoing['panel']; view: LiveDoing['view'] };

/** The view this browser shows for its own state. `asking` is left out when false so it costs no bytes. */
export function viewOf(d: LiveDoing): Record<string, string | boolean> {
	return { panel: d.panel ?? 'none', view: d.view, presenting: d.presenting, ...(d.asking ? { asking: true } : {}) };
}

/** Where a leader is: their view if they send one, else the `doing` an older tab sends. Missing either
 *  half is no information (undefined), never "closed". */
export function placeOf(view: Record<string, unknown>, doing: LiveDoing | undefined): FollowPlace | undefined {
	const panel = view.panel as string | undefined;
	const v = view.view as LiveDoing['view'] | undefined;
	if (panel !== undefined && v !== undefined) return { panel: panel === 'none' ? null : (panel as LiveDoing['panel']), view: v };
	return doing ? { panel: doing.panel, view: doing.view } : undefined;
}
export type { Panel };

/** One thing Follow does on the screen besides the panel and view: a value a component is told to show. */
export type FollowMove = readonly ['inspector' | 'section', string];

/**
 * What the leader shows in the settings panel that this screen does not, as moves to apply.
 * `inspector` is where this screen is now (null when no screen reports it, which means there is nothing to move).
 * A key the leader does not send changes nothing: absence is no information.
 */
export function settingsMoves(leader: Record<string, unknown>, here: { inspector: string | null; section: string | null }): FollowMove[] {
	const moves: FollowMove[] = [];
	const inspector = leader.inspector as string | undefined;
	const section = leader.section as string | undefined;
	if (inspector === undefined || here.inspector === null) return moves;
	if (inspector !== here.inspector) moves.push(['inspector', inspector]);
	// A section belongs to the panel that is open: send it only when both screens will be on the same one.
	if (section !== undefined && inspector !== 'none' && (moves.length > 0 || here.section !== section)) moves.push(['section', section]);
	return moves;
}

const PANEL_NAME: Record<string, string> = { coach: 'Coach', lenses: 'Views', library: 'Library', live: 'Live' };
const SECTION_NAME: Record<string, string> = { look: 'Look', chrome: 'Chrome', general: 'General', brand: 'Brand', image: 'Image', motion: 'Motion', speech: 'Speech', plugins: 'Plugins', notes: 'Notes', marks: 'Marks', comments: 'Comments' };

/** "Amina opened Coach", "Amina opened Deck · Brand": the words a typist is shown instead of being moved. */
export function describeMove(target: { panel: LiveDoing['panel']; view: LiveDoing['view'] }, moves: readonly FollowMove[]): string {
	const inspector = moves.find((m) => m[0] === 'inspector')?.[1];
	const section = moves.find((m) => m[0] === 'section')?.[1];
	if (inspector === 'deck' || inspector === 'slide') return `opened ${inspector === 'deck' ? 'Deck' : 'Slide'}${section ? ` · ${SECTION_NAME[section] ?? section}` : ''}`;
	if (section) return `is in ${SECTION_NAME[section] ?? section}`;
	if (target.panel) return `opened ${PANEL_NAME[target.panel]}`;
	return target.view === 'article' ? 'opened Read' : 'went back to the editor';
}

/** Where someone is in the settings, in words: "in Deck · Brand", "in Setup · AI". Empty when they are in neither. */
export function placeWords(view: Record<string, unknown>): string | null {
	if (view.shown === 'setup') return `in Setup${typeof view.setupTab === 'string' ? ` · ${view.setupTab}` : ''}`;
	const inspector = view.inspector;
	if (inspector === 'deck' || inspector === 'slide') {
		const section = typeof view.section === 'string' ? (SECTION_NAME[view.section] ?? null) : null;
		return `in ${inspector === 'deck' ? 'Deck' : 'Slide'}${section ? ` · ${section}` : ''}`;
	}
	return null;
}

/** "changed Card rail placement": the row a person changed, by name. */
export function changedWords(view: Record<string, unknown>): string | null {
	const c = view.changed as { what?: unknown } | undefined;
	return c && typeof c.what === 'string' ? `changed ${rowName(c.what)}` : null;
}
