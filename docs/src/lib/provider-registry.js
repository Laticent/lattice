// THE PROVIDER REGISTRY — what each provider can do for the Studio, and which of its models we
// recommend. One table, read by the Workspace (Chat model / Voice model / Providers & keys), the
// chat chip, and the defaults the adapters derive.
//
// Curation is a PREFERENCE over the provider's LIVE list, never a list of pinned ids: each
// curated entry is a family pattern matched against what the provider lists today, so a retired
// id simply stops matching and a new release in the family is picked up without an edit here
// (the same rot-proofing `or-catalog.js`'s prefixes give OpenRouter). A live model the curation
// does not name is still listed, after the curated ones.
//
// Gemini 2.5 ids are deliberately not curated: Google limits the 2.5 TTS models to accounts that
// used them before. OpenAI voice is out of scope (followups.d/3048-p9-direct-openai-voice.md).
// engineering/decisions/2026-11-07-studio-model-spine.md

/**
 * @typedef {{ label: string, source: 'cloud' | 'device', chat: boolean, voice: boolean, keyed: boolean, note?: string }} ProviderInfo
 */

/** @type {Record<string, ProviderInfo>} */
export const PROVIDERS = Object.freeze({
	openrouter: { label: 'OpenRouter', source: 'cloud', chat: true, voice: true, keyed: true },
	gemini: { label: 'Gemini', source: 'cloud', chat: true, voice: true, keyed: true },
	anthropic: { label: 'Anthropic', source: 'cloud', chat: true, voice: false, keyed: true },
	openai: { label: 'OpenAI', source: 'cloud', chat: true, voice: false, keyed: true, note: 'Voice on an OpenAI key is not available yet.' },
	'prompt-api': { label: 'Browser built-in', source: 'device', chat: true, voice: false, keyed: false },
	webllm: { label: 'WebLLM', source: 'device', chat: true, voice: false, keyed: false, note: '~1 GB download, needs WebGPU' },
	universal: { label: 'Universal', source: 'device', chat: true, voice: false, keyed: false, note: '~350 MB download, runs anywhere' },
	kokoro: { label: 'Kokoro', source: 'device', chat: false, voice: true, keyed: false, note: '~80 MB download, desktop browsers' },
});

/** The providers a key can be saved for, in the order the Workspace lists them (OpenRouter first, the default). */
export const KEYED_PROVIDERS = Object.freeze(['openrouter', 'gemini', 'anthropic', 'openai']);

/** The display name of a provider id ('' for an unknown one). */
export const providerLabel = (p) => PROVIDERS[p]?.label ?? '';

/**
 * Curated families per provider and capability, most recommended first. OpenRouter's chat and
 * voice curation stay in `or-catalog.js` (`OR_FEATURED`) and `tts-catalog.js` (`TTS_FEATURED`),
 * which the pickers' lenses already use; they are referenced, not copied.
 */
export const CURATED = Object.freeze({
	chat: Object.freeze({
		gemini: [/^gemini-3\.8-flash(-\d{3,}|-latest)?$/, /^gemini-3\.8-pro(-\d{3,}|-latest|-preview)?$/],
		anthropic: [/^claude-sonnet-\d/, /^claude-opus-\d/, /^claude-haiku-\d/],
		openai: [/^gpt-6(\.\d+)?(-[a-z]+)?$/, /^gpt-5(\.\d+)?$/],
	}),
	voice: Object.freeze({
		gemini: [/^gemini-3\.8-flash-lite-tts$/, /^gemini-3\.8-flash-tts$/],
	}),
});

const SIDE = /(^|-)(nano|mini|lite|image|audio|exp|experimental)(-|$)/i;

/**
 * Order a LIVE list by the curation: curated matches first (in the curation's order, newest
 * first within a family), flagged `curated: true`, then every other live model as listed.
 * Never adds an id the live list does not have, and never drops one.
 * @template {{ id: string, created?: number }} M
 * @param {M[]} live
 * @param {RegExp[] | undefined} families
 * @returns {(M & { curated: boolean })[]}
 */
export function curate(live, families) {
	const list = live || [];
	if (!families?.length) return list.map((m) => ({ ...m, curated: false }));
	const seen = new Set();
	const head = [];
	for (const re of families) {
		const hits = list.filter((m) => !seen.has(m.id) && re.test(m.id)).sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
		for (const m of hits) {
			seen.add(m.id);
			head.push({ ...m, curated: true });
		}
	}
	return [...head, ...list.filter((m) => !seen.has(m.id)).map((m) => ({ ...m, curated: false }))];
}

/**
 * The curated default from a LIVE list: the newest live model of the first curated family that
 * has one (a chat family skips side variants such as -lite and -mini unless the family names
 * them). Null when nothing curated is live, so the caller falls back to its own derivation.
 * @param {{ id: string, created?: number }[]} live
 * @param {RegExp[] | undefined} families
 */
export function curatedDefault(live, families) {
	for (const re of families || []) {
		const hits = (live || []).filter((m) => re.test(m.id) && (!SIDE.test(m.id) || SIDE.test(re.source)));
		if (hits.length) return [...hits].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0].id;
	}
	return null;
}
