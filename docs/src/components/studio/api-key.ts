// Workspace → AI → API key: save an OpenRouter key the author pasted.
//
// Its own module, imported only by ApiKeyPanel (inside the lazily loaded Workspace sheet), so the
// Studio's first load does not carry it (docs/route-budget.json).

import { architectModel, setStudioTier } from './architect';

/**
 * Save an OpenRouter key the author PASTED (Workspace → AI → API key), the alternative to the
 * one-click OAuth sign-in. The key is checked against OpenRouter's /auth/key first, so a typo or
 * a revoked key is refused here instead of failing on the first paid request. On success it is
 * stored through lib/openrouter-key.js (which clears any rejected mark) and Cloud becomes active.
 */
export async function saveOpenRouterKey(raw: string): Promise<{ ok: true } | { ok: false; note: string }> {
	// A key copied from a chat or a PDF can carry a line break or a zero-width character, which
	// `fetch` refuses in a header before any request leaves, and that used to read as "could not
	// reach OpenRouter". Strip every whitespace and invisible character, then check the shape.
	const key = raw.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');
	if (!key) return { ok: false, note: 'Paste a key first.' };
	if (!/^sk-or-[\x21-\x7e]+$/.test(key)) return { ok: false, note: 'That is not an OpenRouter key — they start with “sk-or-”.' };
	const m = await architectModel();
	if (!m?.checkOpenRouterKey || !m.restoreOpenRouter) return { ok: false, note: 'AI is unavailable in this environment.' };
	const status = await m.checkOpenRouterKey(key);
	if (status === 200) {
		m.restoreOpenRouter(key);
		// Saving a key is choosing Cloud: an on-device tier the author picked earlier would
		// otherwise keep generating (the Studio's explicitTierWins), behind a toast that says
		// Cloud is active.
		await setStudioTier('auto');
		return { ok: true };
	}
	if (status === 401 || status === 403) return { ok: false, note: 'OpenRouter rejected this key. Check it, or create a new one at openrouter.ai/keys.' };
	if (status === 0) return { ok: false, note: 'Could not reach OpenRouter to check the key — check the connection and try again.' };
	return { ok: false, note: `OpenRouter could not check the key (error ${status}) — try again in a moment.` };
}
