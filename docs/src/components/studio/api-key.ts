// Workspace → AI → API key: save a key the author pasted — OpenRouter's, or a direct OpenAI,
// Gemini or Anthropic key (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7).
//
// Its own module, imported only by ApiKeyPanel (inside the lazily loaded Workspace sheet), so the
// Studio's first load does not carry it (docs/route-budget.json).

import { decodeGift, extractGiftToken, GiftLinkError } from '../../../../lib/core/gift-link.mjs';
import { architectModel, type CloudProvider } from './architect';
import { guessProvider, KEY_PROVIDER_INFO } from './key-providers';

export { guessProvider, KEY_PROVIDER_INFO };

/**
 * Save a key the author PASTED for `provider`. The key is checked with the provider first
 * (OpenRouter's /api/v1/key; the direct providers' free /models listing), so a typo or a revoked
 * key is refused here instead of failing on the first paid request. On success it is stored
 * sealed through lib/openrouter-key.js. Connecting never changes a set selection; it fills only a
 * Not-set one, and the Studio shell names what it filled (2026-11-08-studio-ai-routes-ux.md).
 */
export async function saveProviderKey(provider: CloudProvider, raw: string): Promise<{ ok: true; filled: { kind: string; provider: string }[] } | { ok: false; note: string }> {
	const info = KEY_PROVIDER_INFO[provider];
	// A key copied from a chat or a PDF can carry a line break or a zero-width character, which
	// `fetch` refuses in a header before any request leaves, and that used to read as "could not
	// reach OpenRouter". Strip every whitespace and invisible character, then check the shape.
	let key = raw.replace(/[\s​-‍⁠﻿]/g, '');
	if (!key) return { ok: false, note: 'Paste a key first.' };
	// "Have a gift link?" (2026-11-06-gift-link-cli.md §6): the OpenRouter field takes a whole gift
	// link too, read by the same codec the CLI wrote it with. A PIN-locked link needs its PIN, which
	// the /gift page asks for, so this field sends the author there instead of growing a PIN box.
	if (provider === 'openrouter' && extractGiftToken(key)) {
		try {
			key = (await decodeGift(key)).key;
		} catch (e) {
			if (e instanceof GiftLinkError && e.code === 'pin-required') return { ok: false, note: 'This gift link is locked with a PIN. Open the link in this browser, and the page will ask for the PIN.' };
			return { ok: false, note: e instanceof GiftLinkError ? e.message : 'That gift link could not be read.' };
		}
	}
	const looks = guessProvider(key);
	if (looks && looks !== provider) return { ok: false, note: `That looks like ${/^[AEIOU]/.test(KEY_PROVIDER_INFO[looks].label) ? 'an' : 'a'} ${KEY_PROVIDER_INFO[looks].label} key — add it on the ${KEY_PROVIDER_INFO[looks].label} row.` };
	if (!info.shape.test(key)) return { ok: false, note: info.shapeNote };
	const m = await architectModel();
	if (!m) return { ok: false, note: 'AI is unavailable in this environment.' };
	let status: number;
	if (provider === 'openrouter') {
		if (!m.checkOpenRouterKey || !m.restoreOpenRouter) return { ok: false, note: 'AI is unavailable in this environment.' };
		status = await m.checkOpenRouterKey(key);
	} else {
		if (!m.checkProviderKey || !m.saveProviderKey) return { ok: false, note: 'AI is unavailable in this environment.' };
		status = await m.checkProviderKey(provider, key);
	}
	if (status === 200) {
		// What the key filled (a selection that was not set), so the caller does not talk over the
		// shell's fill notice, which says it better.
		let filled: { kind: string; provider: string }[] | undefined;
		if (m.saveProviderKey) filled = m.saveProviderKey(provider, key);
		else m.restoreOpenRouter?.(key);
		return { ok: true, filled: Array.isArray(filled) ? filled : [] };
	}
	if (status === 401 || status === 403) return { ok: false, note: `${info.label} rejected this key. Check it, or create a new one at ${info.keysHost}.` };
	if (status === 0) return { ok: false, note: `Could not reach ${info.label} to check the key — check the connection and try again.` };
	return { ok: false, note: `${info.label} could not check the key (error ${status}) — try again in a moment.` };
}

/** The OpenRouter-only entry point the tab used before the direct providers; kept for its callers and tests. */
export function saveOpenRouterKey(raw: string) {
	return saveProviderKey('openrouter', raw);
}

// The key-list helpers live here, not in architect.ts, so the eager Studio chunk does not carry
// them: only the lazily loaded Workspace sheet and its Privacy tab call them (docs/route-budget.json).
/** Remove every stored AI key — OpenRouter and the direct providers (Privacy & Data → clear). */
export async function disconnectAllProviders(): Promise<void> {
	const m = await architectModel();
	if (m?.disconnectAllProviders) m.disconnectAllProviders();
	else m?.disconnectOpenRouter?.();
}

/** Remove one provider's key. A selection that used it stays and reads "needs a key". */
export async function removeProviderKey(provider: CloudProvider): Promise<void> {
	const m = await architectModel();
	if (provider === 'openrouter') m?.disconnectOpenRouter?.();
	else m?.removeProviderKey?.(provider);
}

/** The providers holding a key in this browser, for the API key tab. */
export async function providersWithKeys(): Promise<CloudProvider[]> {
	const m = await architectModel();
	return m?.providersWithKeys?.() ?? [];
}

/** Select the chat model of a provider that already holds a key. */
export async function switchProvider(provider: CloudProvider): Promise<void> {
	const m = await architectModel();
	m?.switchProvider?.(provider);
}
