// One author-facing sentence for a failed model request, shared by every Studio AI
// surface: the chat (`chat-agent.ts`), the theme faculty and the component faculty
// (`architect.ts`). It reads the transport's "OpenRouter error <status>: <detail>"
// message (`ai/architect-model.js`) and names the cause and the way out — a 402 says
// the account is out of credits, never "no model connected".
//
// Its one import is the pure, dependency-free classifier `lib/provider-errors.js`, shared with the
// voice rungs; `architect.ts` loads this module lazily.

import { classifyProviderError } from '@/lib/provider-errors.js';

/** The transport's failure shape, "<Provider> error <status>": group 1 the provider, group 2 the status. */
export const MODEL_ERROR = /\b(OpenRouter|OpenAI|Anthropic|Gemini) error (\d{3})/;

const LABEL: Record<string, string> = { openrouter: 'OpenRouter', openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' };

/** An author-facing sentence for a failed model request, from the transport's
 *  "<Provider> error <status>: <detail>" message. `provider` is the route the call ran on, for a
 *  failure that names none (a dropped connection reads "Failed to fetch"). */
export function describeModelError(message: string, provider?: string): string {
	// The transport names the provider it called: OpenRouter, or a direct OpenAI / Anthropic /
	// Gemini key (lifecycle note §7). Every sentence below names that provider back. A network
	// failure names none, so the route the caller ran on stands in: a Gemini turn that never
	// reached Google used to say "never reached OpenRouter" (live check, 2026-11-08).
	// A key a sign-in just minted, still being activated (the transport throws this sentence as-is).
	if (/still activating this key/.test(message)) return message;
	const who = /\b(OpenRouter|OpenAI|Anthropic|Gemini) error \d{3}/.exec(message)?.[1] ?? LABEL[provider ?? ''] ?? 'OpenRouter';
	const direct = who !== 'OpenRouter';
	const status = Number(MODEL_ERROR.exec(message)?.[2] ?? 0);
	const raw = /\b(?:OpenRouter|OpenAI|Anthropic|Gemini) error \d{3}: ([\s\S]*)/.exec(message)?.[1] ?? '';
	// The body is usually JSON, `{"error":{"message":"…"}}`, sometimes cut short by the
	// transport; take the message when it parses, else the first quoted message, else the text.
	let detail = '';
	try {
		detail = String(JSON.parse(raw)?.error?.message ?? '');
	} catch {
		detail = /"message"\s*:\s*"([^"]*)/.exec(raw)?.[1] ?? raw;
	}
	detail = detail.replace(/\s+/g, ' ').trim().slice(0, 140);
	const tail = detail ? ` (${who} said: ${detail})` : '';
	// OpenRouter also uses 403 for input a moderated model flagged — reconnecting does not help.
	if (status === 403 && /moderation|flagged/i.test(detail)) return `The selected model's moderation flagged this request — rephrase it, or pick another model in Workspace → AI.${tail}`;
	// A key with its own spending limit (a gift link's key, or a key capped at OpenRouter) that
	// cannot afford even a short reply: the transport already retried with what it could afford
	// (architect-model `complete`), so this key's limit is used up. It is not the author's account,
	// which a gift's recipient does not have (gift-link-cli.md §6).
	// OpenRouter says it two ways, both measured live on 2026-11-10 with a $0.05 key: a 402 "can only
	// afford N" when the reply ceiling does not fit what is left, and a 403 "Key limit exceeded" once
	// nothing is left. Neither is the author's account, and a 403 here is not a rejected connection.
	if (!direct && ((status === 402 && /can only afford \d+/i.test(detail || raw)) || (status === 403 && /key limit exceeded/i.test(detail || raw))))
		return `This key has used up its spending limit (a gift link's key stops here). Sign in with your own OpenRouter account in Workspace → AI to keep going; your decks stay where they are.${tail}`;
	// Billing first: providers report it as 402, 429 (OpenAI, Gemini quota), 403 (Gemini billing
	// off) or 400 (Anthropic "credit balance is too low"). The key works; the account needs money.
	if (classifyProviderError(status, detail || raw) === 'billing')
		return `Your ${who} account is out of credits or quota — add ${direct ? `billing in ${who}'s settings` : 'credits at openrouter.ai'}, or switch to On-device in Workspace → AI.${tail}`;
	if (status === 401 || status === 403) return direct ? `${who} rejected the key — replace it in Workspace → AI → API key.${tail}` : `OpenRouter rejected the connection — reconnect in Workspace → AI.${tail}`;
	if (status === 400 && /context length|maximum context|too many tokens/i.test(detail || raw)) return `The deck and its attachments are too long for this model — detach a reference document, or pick a model with a longer context in Workspace → AI.${tail}`;
	// A model that cannot read video refuses a request that carries a clip.
	if ((status === 400 || status === 404 || status === 422) && /video/i.test(detail || raw)) return `The selected model can't read video — pick one marked "video" in the model menu, or remove the clip and ask again.${tail}`;
	// A model that cannot read images refuses a request that carries one; say so, and say the way out.
	if ((status === 400 || status === 404 || status === 422) && /image|vision|multimodal|modalit/i.test(detail || raw)) return `The selected model can't read photos — pick one marked "vision" in the model menu, or remove the photo and ask again.${tail}`;
	if (status === 404 || status === 400) return `The selected model could not take this request — pick another model in Workspace → AI.${tail}`;
	if (status === 429) return `${who} is rate-limiting this key${direct ? ' (or its quota is used up)' : ''} — wait a moment and send again.${tail}`;
	if (status >= 500) return direct ? `${who} had an error or is overloaded — send again in a moment.${tail}` : `OpenRouter or the model's provider had an error — send again in a moment.${tail}`;
	if (/fetch|network|load failed/i.test(message)) return `The request never reached ${who} — check the connection and send again.`;
	return `The model request failed — send again.${message ? ` (${message.slice(0, 140)})` : ''}`;
}
