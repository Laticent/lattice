// ONE model-name formatter for every surface that names a model: the Workspace's Chat model and
// Voice model cards, the chat chip, the model picker's summary and Present's voice pill. Before
// this, each surface formatted on its own, so one model read "~anthropic/claude-sonnet-latest" in
// the picker, "Latest Claude Sonnet" beside it and "Gemini 3.8 Flash" in the chip
// (engineering/decisions/2026-11-07-studio-model-spine.md).

import { providerLabel } from './provider-registry.js';

const UPPER = new Set(['gpt', 'tts', 'ai', 'llm', 'mlc', 'mai', 'csm', 'r1']);
const DEVICE_NAMES: Record<string, string> = {
	'prompt-api': 'Browser built-in model',
	webllm: 'Qwen2.5 1.5B (WebLLM)',
	universal: 'Qwen2.5 0.5B (Universal)',
	kokoro: 'Kokoro',
};

/** A readable name from an id alone: `~anthropic/claude-sonnet-latest` → "Claude Sonnet (latest)". */
export function nameFromId(id: string): string {
	const slug = id.replace(/^~/, '').replace(/^models\//, '').split('/').pop() ?? id;
	const latest = /-latest$/.test(slug);
	const words = slug
		.replace(/-latest$/, '')
		.split(/[-_:]/)
		.filter(Boolean)
		.map((w) => (UPPER.has(w.toLowerCase()) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)));
	return `${words.join(' ')}${latest ? ' (latest)' : ''}`;
}

/**
 * The name a person reads for a model.
 * - `name`: the provider catalog's display name when it is known ("Anthropic: Claude Sonnet 5.5"
 *   reads "Claude Sonnet 5.5"); else the id is made readable.
 * - An on-device provider names its model ("Browser built-in model", "Kokoro").
 * - No id (the provider's default, not yet resolved) reads "<Provider> default".
 */
export function modelDisplayName(m: { id?: string | null; name?: string | null; provider?: string | null }): string {
	const device = m.provider ? DEVICE_NAMES[m.provider] : undefined;
	if (device) return device;
	if (m.name && m.name !== m.id) return m.name.replace(/^[^:]+:\s*/, '');
	if (m.id) return nameFromId(m.id);
	const label = m.provider ? providerLabel(m.provider) : '';
	return label ? `${label} default` : 'Choose a model';
}

/** A voice id as a person reads it: `af_heart` → "Heart", `eve` → "Eve", `Kore` → "Kore". */
export function voiceDisplayName(id: string | null | undefined): string {
	if (!id) return 'Default voice';
	const bare = id.replace(/^[a-z]{2}_/, '');
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}
