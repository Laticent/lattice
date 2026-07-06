// The "Edit this deck" handoff: park a field card's sample under the ONE-SHOT
// handoff key (2026-07-05 Specimen Book decision §4) before the <a> navigates.
// The playground applies it when its draft is pristine and parks it otherwise —
// a landing-page click can no longer clobber someone's unsaved draft. Wired by
// FieldCardsLive via event delegation, mirroring the old inline click handler.

import { HANDOFF_KEY, makeHandoff } from './playground-controller';

/** Park `source` as the playground's next deck. Swallows private-mode errors. */
export function seedPlaygroundSource(source: string) {
	try {
		localStorage.setItem(HANDOFF_KEY, makeHandoff(source, 'the landing page', Date.now()));
	} catch {
		/* private mode */
	}
}
