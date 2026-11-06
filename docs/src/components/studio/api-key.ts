// Workspace → AI → API key: save an OpenRouter key the author pasted.
//
// Its own module, imported only by ApiKeyPanel (inside the lazily loaded Workspace sheet), so the
// Studio's first load does not carry it (docs/route-budget.json).

import { architectModel } from './architect';

/**
 * Save an OpenRouter key the author PASTED (Workspace → AI → API key), the alternative to the
 * one-click OAuth sign-in. The key is checked against OpenRouter's /auth/key first, so a typo or
 * a revoked key is refused here instead of failing on the first paid request. On success it is
 * stored through lib/openrouter-key.js (which clears any rejected mark) and Cloud becomes active.
 */
export async function saveOpenRouterKey(raw: string): Promise<{ ok: true } | { ok: false; note: string }> {
	const key = raw.trim();
	if (!key) return { ok: false, note: 'Paste a key first.' };
	if (!/^sk-or-/.test(key)) return { ok: false, note: 'That is not an OpenRouter key — they start with “sk-or-”.' };
	const m = await architectModel();
	if (!m?.checkOpenRouterKey || !m.restoreOpenRouter) return { ok: false, note: 'AI is unavailable in this environment.' };
	const status = await m.checkOpenRouterKey(key);
	if (status === 200) {
		m.restoreOpenRouter(key);
		return { ok: true };
	}
	if (status === 401 || status === 403) return { ok: false, note: 'OpenRouter rejected this key. Check it, or create a new one at openrouter.ai/keys.' };
	if (status === 0) return { ok: false, note: 'Could not reach OpenRouter to check the key — check the connection and try again.' };
	return { ok: false, note: `OpenRouter could not check the key (error ${status}) — try again in a moment.` };
}
