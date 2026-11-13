// A LIBRARY PAGE'S VOICE (/cadenza, /suono): the author's STORED voice selection, the one the Studio
// reads (lib/model-selection.js), resolved by voice-model.js without a ladder. One voice rule on every
// page: the voice the author chose in Workspace › AI is the voice a reference page speaks in.
//
// The page READS the selection and never writes it. A page control that changes the voice (the
// /cadenza Kokoro picker) is a page-scoped override that lasts for this page only, so playing with a
// demo never moves the narrator the Studio reads in.
//
// A selection that was never set gets the page's own default (`whenUnset`), decided once per read
// and shown in the page's voice label: the same "fill only what is Not set" rule the Studio follows
// (engineering/decisions/2026-11-08-studio-ai-routes-ux.md §6, decision 3), never a fallback from a
// voice that was chosen and cannot run.
// followups 3079-p3-library-pages-on-the-voice-spine; engineering/decisions/2026-11-07-studio-model-spine.md.

import { isSet, peekVoiceSelection } from '../lib/model-selection.js';
import { loadOpenRouterKey, loadProviderKey, noteProviderStatus, providerKeyState, readOpenRouterKey, readProviderKey } from '../lib/openrouter-key.js';

/**
 * @param {{ whenUnset?: () => ({ source: string, provider: string, model?: string, voice?: string } | null) }} [opts]
 * @returns the `selection` object `createVoiceModel` takes
 */
export function pageVoiceSelection({ whenUnset } = {}) {
	let override = null;
	function read() {
		// peek, not read: a read would run the one-time migration, which WRITES a selection (Kokoro on
		// any desktop) and would make `whenUnset` unreachable there (checker, PR #3105).
		const stored = peekVoiceSelection();
		const base = isSet(stored) ? stored : { ...stored, ...(whenUnset?.() ?? {}) };
		// An override belongs to one provider: while the stored selection names another provider it is
		// set aside (and applies again if the selection comes back).
		return override && override.provider === base.provider ? { ...base, ...override } : base;
	}
	return {
		read,
		/** Page-scoped: never written to storage. */
		select(pick) {
			override = { ...(override ?? {}), ...pick, provider: pick.provider ?? read().provider };
		},
		keyState: providerKeyState,
		readKey: (p) => (p === 'openrouter' ? readOpenRouterKey() : readProviderKey(p)),
		openKey: (p) => (p === 'openrouter' ? loadOpenRouterKey() : loadProviderKey(p)),
		noteStatus: noteProviderStatus,
	};
}
