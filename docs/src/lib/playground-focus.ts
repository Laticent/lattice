// THE PLAYGROUND'S FOCUS, as one lazily loaded unit: the hub, the deck outliner it reads, and the sync rules.
//
// The Playground's first paint does not need any of this: a caret move or a preview scroll that lands in the
// first moments is picked up when the unit arrives (PlaygroundApp feeds it the editor's text, the caret and the
// last render). Keeping it behind a dynamic import keeps the deck outliner and its boundary parser out of the
// route's eager JS (docs/route-budget.json), where a static import of them cost the Playground 9.6 KB gz.

import { deckOutliner } from './deck-outline';
import { createFocusHub, type FocusHub } from './fuoco/hub';
import { createPlaygroundSync, type PlaygroundSync, type SyncPorts } from './playground-sync';

export function createPlaygroundFocus(ports: SyncPorts): { hub: FocusHub; sync: PlaygroundSync } {
	const hub = createFocusHub({ outliner: deckOutliner });
	return { hub, sync: createPlaygroundSync(hub, ports) };
}
