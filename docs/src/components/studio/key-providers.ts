// The providers a key can be pasted for, and what the API key tab shows for each
// (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7).
//
// Imports nothing at runtime, so the Workspace sheet and the model picker can label the provider
// without loading the save path, and a test that mocks `./api-key` still has these.

import type { CloudProvider } from './architect';

/** What the API key tab needs to know about each provider. Kept here, not in the lazy adapter chunk, so the tab draws without loading it. */
export const KEY_PROVIDER_INFO: Record<CloudProvider, { label: string; shape: RegExp; shapeNote: string; placeholder: string; keysUrl: string; keysHost: string; billingUrl: string }> = {
	openrouter: {
		label: 'OpenRouter',
		shape: /^sk-or-[\x21-\x7e]+$/,
		shapeNote: 'That is not an OpenRouter key — they start with “sk-or-”.',
		placeholder: 'sk-or-v1-…',
		keysUrl: 'https://openrouter.ai/keys',
		keysHost: 'openrouter.ai/keys',
		billingUrl: 'https://openrouter.ai/settings/credits',
	},
	openai: {
		label: 'OpenAI',
		// An Anthropic or OpenRouter key also starts with `sk-`; refuse those here, by name, below.
		shape: /^sk-[\x21-\x7e]{16,}$/,
		shapeNote: 'That is not an OpenAI key — they start with “sk-”.',
		placeholder: 'sk-proj-…',
		keysUrl: 'https://platform.openai.com/api-keys',
		keysHost: 'platform.openai.com/api-keys',
		billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
	},
	gemini: {
		label: 'Gemini',
		shape: /^AIza[\x21-\x7e]{20,}$/,
		shapeNote: 'That is not a Gemini key — they start with “AIza”.',
		placeholder: 'AIza…',
		keysUrl: 'https://aistudio.google.com/apikey',
		keysHost: 'aistudio.google.com/apikey',
		billingUrl: 'https://aistudio.google.com/usage',
	},
	anthropic: {
		label: 'Anthropic',
		shape: /^sk-ant-[\x21-\x7e]{16,}$/,
		shapeNote: 'That is not an Anthropic key — they start with “sk-ant-”.',
		placeholder: 'sk-ant-…',
		keysUrl: 'https://console.anthropic.com/settings/keys',
		keysHost: 'console.anthropic.com/settings/keys',
		billingUrl: 'https://console.anthropic.com/settings/billing',
	},
};

/** The provider whose shape a pasted key has, or null. Used to say "this looks like an Anthropic key" on the wrong tab. */
export function guessProvider(key: string): CloudProvider | null {
	if (/^sk-or-/.test(key)) return 'openrouter';
	if (/^sk-ant-/.test(key)) return 'anthropic';
	if (/^AIza/.test(key)) return 'gemini';
	if (/^sk-/.test(key)) return 'openai';
	return null;
}

