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
// Gemini 2.5 ids are deliberately not curated (still listed, never recommended): the families below
// start at 3. OpenAI voice is out of scope (followups.d/3048-p9-direct-openai-voice.md).
// engineering/decisions/2026-11-07-studio-model-spine.md

import { MODELS } from './models-config.js';

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
// The families themselves live in `models.config.json` (one committed file every model id the
// Studio names comes from; `{gemini3up}` matches any Gemini version from 3 up, so the recommendation
// follows whatever Google lists today). engineering/decisions/2026-11-09-model-guard-rails.md
export const CURATED = MODELS.families;

const SIDE = /(^|-)(nano|mini|lite|image|audio|exp|experimental)(-|$)/i;

/** The version in a model id (`gemini-3.1-…` → [3, 1]), or [] when it carries none. */
const versionOf = (id) => (String(id).match(/^[a-z]+-(\d+(?:\.\d+)*)/)?.[1] ?? '').split('.').filter(Boolean).map(Number);
/** Newest first: by `created` when the list has it, else by the version in the id, then a GA id before a preview. */
function newestFirst(a, b) {
	const byDate = (b.created ?? 0) - (a.created ?? 0);
	if (byDate) return byDate;
	const va = versionOf(a.id);
	const vb = versionOf(b.id);
	for (let i = 0; i < Math.max(va.length, vb.length); i++) if ((vb[i] ?? 0) !== (va[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
	return Number(/preview/.test(a.id)) - Number(/preview/.test(b.id));
}

/**
 * Order a LIVE list by the curation: curated matches first (in the curation's order, newest
 * first within a family), flagged `curated: true`, then every other live model as listed.
 * Never adds an id the live list does not have, and never drops one. `perFamily` caps how many of
 * each family are flagged (the pickers recommend the newest ONE per family, so a family's six
 * older versions sit in All instead of crowding the short list).
 * @template {{ id: string, created?: number }} M
 * @param {M[]} live
 * @param {RegExp[] | undefined} families
 * @param {{ perFamily?: number }} [opts]
 * @returns {(M & { curated: boolean })[]}
 */
export function curate(live, families, { perFamily = Infinity } = {}) {
	const list = live || [];
	if (!families?.length) return list.map((m) => ({ ...m, curated: false }));
	const seen = new Set();
	const head = [];
	for (const re of families) {
		const hits = list.filter((m) => !seen.has(m.id) && re.test(m.id)).sort(newestFirst).slice(0, perFamily);
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
		if (hits.length) return [...hits].sort(newestFirst)[0].id;
	}
	return null;
}
