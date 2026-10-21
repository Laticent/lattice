// What a member shows the others about WHERE they are, declared once. Tavola's view
// (`@/lib/tavola/view`) keeps only these keys, each checked against its list, so a new thing to follow is
// one more line here and the gate, the bounds and the privacy switch come with it. Every value is a place
// from a fixed list or a flag; there is no text a person typed. Design: engineering/decisions/2026-10-21-follow-over-tavola.md §6.

import { bool, defineViewKeys, type Infer, oneOf } from '@/lib/tavola/view';
import type { LiveDoing } from './live-model';

/** `none` is "no side panel open": an absent key means "no information", which is a different thing. */
export const VIEW_KEYS = defineViewKeys({
	panel: oneOf(['none', 'coach', 'lenses', 'library', 'live']),
	view: oneOf(['compose', 'fabricate', 'article']),
	presenting: bool,
	asking: bool,
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
