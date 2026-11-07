// Direct provider keys — OpenAI, Gemini and Anthropic, beside OpenRouter (the default).
//
// engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7 step 2. The Studio's cloud
// tier normally runs on OpenRouter. An author who pastes a key from one of these three providers
// runs the same tier on that provider instead: `architect-model.js` asks `directBackend(p)` for
// a backend with the OpenRouter backend's shape, so nothing above the adapter changes.
//
// Two transports:
//   · OPENAI-SHAPED  — OpenAI and Gemini (Gemini's OpenAI-compatible endpoint). The request and
//                      the SSE stream are the OpenRouter ones, at a different base URL.
//   · MESSAGES API   — Anthropic. Its own request (a separate `system`, tool_use/tool_result
//                      blocks), its own stream events, and the header Anthropic requires before
//                      it answers a browser.
//
// What a direct provider does NOT have: an account balance a browser key can read, a
// per-request cost in the reply, or OpenRouter's catalog. So:
//   · SPEND is an ESTIMATE: token counts × the model's price. The price comes from OpenRouter's
//     PUBLIC catalog (no key, already fetched for the picker), which lists these providers'
//     models at the provider's own rate. A model the catalog does not list has no estimate,
//     rather than a guessed one. Every usage this module reports carries `estimated: true`.
//   · The BALANCE line reads "Balance not available for this provider", with the billing link.
//   · The MODEL LIST is the provider's own (`/models`, with the key), priced from the catalog.
//
// Keys are read and written only through lib/openrouter-key.js (§3), sealed at rest (§9).

import { chatModelFor, selectChat } from '../../../lib/model-selection.js';
import { noteProviderStatus, providerKeyRejected, readProviderKey, writeProviderKey } from '../../../lib/openrouter-key.js';
import { readCachingEnabled } from './spend.js';

/** Per provider: where its bill is and how to reach it. How a key looks lives with the tab (api-key.ts). */
export const PROVIDERS = Object.freeze({
	openai: {
		label: 'OpenAI',
		billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
		base: 'https://api.openai.com/v1',
		vendor: 'openai',
		transport: 'openai',
	},
	gemini: {
		label: 'Gemini',
		billingUrl: 'https://aistudio.google.com/usage',
		base: 'https://generativelanguage.googleapis.com/v1beta/openai',
		vendor: 'google',
		transport: 'openai',
	},
	anthropic: {
		label: 'Anthropic',
		billingUrl: 'https://console.anthropic.com/settings/billing',
		base: 'https://api.anthropic.com/v1',
		vendor: 'anthropic',
		transport: 'anthropic',
	},
});

const ANTHROPIC_VERSION = '2023-06-01';
// Anthropic requires a max_tokens; this is the ceiling when the caller sets none.
const ANTHROPIC_DEFAULT_MAX = 8192;

/** The request headers `provider` needs for `key`. */
export function providerHeaders(provider, key) {
	if (PROVIDERS[provider].transport === 'anthropic') {
		return {
			'x-api-key': key,
			'anthropic-version': ANTHROPIC_VERSION,
			// Anthropic refuses a browser request (CORS) without this opt-in. The key is the
			// author's own, typed into their own browser, which is the case the header is for.
			'anthropic-dangerous-direct-browser-access': 'true',
		};
	}
	return { Authorization: `Bearer ${key}` };
}

// ── Pricing: the provider's model id → OpenRouter's catalog id ───────────────────────────

/**
 * The OpenRouter catalog ids a direct model id may be listed under, most specific first.
 * OpenAI and Google keep the provider's id behind a vendor prefix; Anthropic's direct ids use
 * dashes and an optional date (`claude-sonnet-4-5-20250929`) where OpenRouter uses a dot
 * (`anthropic/claude-sonnet-4.5`).
 */
export function catalogIdsFor(provider, id) {
	const vendor = PROVIDERS[provider].vendor;
	const bare = String(id || '').replace(/^models\//, '');
	const undated = bare.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
	const out = [bare, undated];
	if (provider === 'anthropic') out.push(undated.replace(/-(\d+)-(\d+)$/, '-$1.$2'));
	if (provider === 'gemini') out.push(undated.replace(/-latest$/, ''), undated.replace(/-preview(-[\w-]+)?$/, ''));
	return [...new Set(out.filter(Boolean))].map((x) => `${vendor}/${x}`);
}

/** The catalog row that prices `id`, or null. `catalog` is OpenRouter's normalized list. */
export function priceRow(provider, id, catalog) {
	if (!Array.isArray(catalog)) return null;
	for (const cid of catalogIdsFor(provider, id)) {
		const row = catalog.find((m) => m.id === cid);
		if (row) return row;
	}
	return null;
}

/**
 * The price pair of a catalog row, or null when it cannot price a DIRECT call: a missing or
 * malformed field, or both at 0. OpenRouter lists some models free, but the provider still bills
 * the direct call, and a $0 would let the hard-stop cap pass it (red team, BYOK phase 2).
 */
export function usablePrice(row) {
	if (!row || row.promptPerM == null || row.completionPerM == null) return null;
	if (!(row.promptPerM > 0) && !(row.completionPerM > 0)) return null;
	return { promptPerM: row.promptPerM, completionPerM: row.completionPerM, imagePerM: row.imagePerM ?? null, contextLength: row.contextLength ?? null };
}

/** USD for a usage, from per-million prices; null without a price. Anthropic cache tokens priced at its published multipliers. */
export function estimateCost(usage, price) {
	if (!usage || !price || price.promptPerM == null || price.completionPerM == null) return null;
	const p = price.promptPerM / 1e6;
	const c = price.completionPerM / 1e6;
	const write = usage.cache_creation_input_tokens || 0;
	const readTok = usage.cache_read_input_tokens || 0;
	return (usage.prompt_tokens || 0) * p + write * p * 1.25 + readTok * p * 0.1 + (usage.completion_tokens || 0) * c;
}

// Text models only: the /models lists also carry embedding, image, audio and moderation models.
const NOT_CHAT = /embed|image|imagen|veo|tts|audio|realtime|transcribe|whisper|dall-e|moderation|search|aqa|computer-use|live|robotics|learnlm|gemma|babbage|davinci|sora/i;

// Each provider's everyday family, for the default when nothing is priced (no catalog).
const EVERYDAY = { openai: /^gpt-\d/, gemini: /flash(?!.*(lite|image))/, anthropic: /sonnet/ };
// Whole dash-separated words only: a bare `mini` would match inside "gemini" and drop every Gemini model.
const SIDE_TIERS = /(^|-)(pro|nano|lite|preview|exp|experimental|codex|mini|haiku|luna|opus|image|audio)(-|$)/i;

/** The version numbers in a model id, `gemini-3.8-flash` → [3, 8]; none → []. */
function versionOf(id) {
	const m = /(\d+(?:\.\d+)*)/.exec(String(id || ''));
	return m ? m[1].split('.').map(Number) : [];
}
/** Positive when version `a` is higher than `b`, part by part; a missing part counts as 0. */
function compareVersions(a, b) {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const d = (a[i] ?? 0) - (b[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

/**
 * The default model when the author has not picked one, from the provider's own list. Derived,
 * not hard-coded, because model ids move faster than this file would be edited. In order:
 *   1. the newest priced model at $10 or less per million output tokens, outside the side tiers
 *      (pro, mini, lite, preview, opus…), from the provider's everyday family when it has one there;
 *   2. else the CHEAPEST priced model outside the side tiers, then the cheapest priced at all:
 *      a fallback never moves the author UP in price (inversion pass, 2026-11-06);
 *   3. else, with no prices at all, the newest model of the provider's everyday family
 *      (Sonnet, Flash, GPT), then the first listed.
 */
export function pickDefaultModel(models, provider) {
	const ok = models.filter((m) => m.promptPerM != null && m.completionPerM != null);
	const main = ok.filter((m) => !SIDE_TIERS.test(m.id));
	// "Newest" by creation date, then by the version in the id. Gemini's list carries NO dates, so
	// by date alone every model tied and the first listed won: `gemini-2.5-flash`, which Gemini now
	// refuses to new users with a 404 while naming `gemini-3.8-flash` (live run, 2026-11-08, 3058-p1).
	const newer = (a, b) => (b.created ?? 0) - (a.created ?? 0) || compareVersions(versionOf(b.id), versionOf(a.id));
	const newest = (list) => [...list].sort(newer)[0];
	const cheapest = (list) => [...list].sort((a, b) => a.completionPerM - b.completionPerM || newer(a, b))[0];
	const family = EVERYDAY[provider];
	const affordable = main.filter((m) => m.completionPerM <= 10);
	// The provider's everyday family first (Flash, GPT, Sonnet): the highest version in the list can be
	// a model a plain key cannot use. `gemini-4-argon` sat above `gemini-3.8-flash` and answered 429
	// "exceeded your current quota" on a key that lists it (live run, 2026-11-08, 3058-p1).
	const pick = newest(affordable.filter((m) => family?.test(m.id))) ?? newest(affordable) ?? cheapest(main) ?? cheapest(ok);
	if (pick) return pick.id;
	return (family && newest(models.filter((m) => family.test(m.id) && !SIDE_TIERS.test(m.id)))?.id) ?? models[0]?.id ?? null;
}

// ── Anthropic: OpenAI-shaped messages → the Messages API ─────────────────────────────────

function anthropicPart(part) {
	if (typeof part === 'string') return { type: 'text', text: part };
	if (part?.type === 'text') return { type: 'text', text: part.text ?? '', ...(part.cache_control ? { cache_control: part.cache_control } : {}) };
	if (part?.type === 'image_url') {
		const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
		const m = /^data:([^;]+);base64,(.*)$/s.exec(url || '');
		if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
		if (url) return { type: 'image', source: { type: 'url', url } };
	}
	return null; // a part type Anthropic has no form for (e.g. an OpenRouter file plugin's input)
}
const asBlocks = (content) => (Array.isArray(content) ? content.map(anthropicPart).filter(Boolean) : [{ type: 'text', text: String(content ?? '') }]);

/**
 * Convert an OpenAI-shaped request into a Messages API body. System messages join into the
 * `system` blocks; an assistant's `tool_calls` become `tool_use` blocks; a `tool` message
 * becomes a user `tool_result` block (consecutive ones merge into one user turn, as the API
 * requires alternating roles).
 * @param {{ messages?: any[], model: string, maxTokens?: number, json?: boolean, tools?: any[], toolChoice?: any, stream?: boolean, reasoningEffort?: string }} req
 * @returns {Record<string, any>}
 */
export function toAnthropicBody({ messages, model, maxTokens, json, tools, toolChoice, stream, reasoningEffort }) {
	const system = [];
	const out = [];
	const push = (role, blocks) => {
		if (!blocks.length) return;
		const last = out[out.length - 1];
		if (last && last.role === role) last.content.push(...blocks);
		else out.push({ role, content: blocks });
	};
	for (const m of messages || []) {
		if (m.role === 'system') system.push(...asBlocks(m.content).filter((b) => b.type === 'text'));
		else if (m.role === 'tool') push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }]);
		else if (m.role === 'assistant') {
			const blocks = m.content ? asBlocks(m.content).filter((b) => b.type !== 'text' || b.text) : [];
			for (const c of m.tool_calls || []) {
				let input = {};
				try {
					input = JSON.parse(c.function?.arguments || '{}');
				} catch {}
				blocks.push({ type: 'tool_use', id: c.id, name: c.function?.name, input });
			}
			push('assistant', blocks);
		} else push('user', asBlocks(m.content));
	}
	if (json) system.push({ type: 'text', text: 'Reply with one JSON object only: no prose, no code fence.' });
	// Prompt caching: Anthropic caches only what a request marks. Mark the first system block
	// (the static authoring canon) unless the author opted out, as or-cache.js does on OpenRouter.
	if (system.length && readCachingEnabled() && !system.some((b) => b.cache_control)) system[0] = { ...system[0], cache_control: { type: 'ephemeral' } };
	/** @type {Record<string, any>} */
	const body = { model, max_tokens: (maxTokens ?? 0) > 0 ? maxTokens : ANTHROPIC_DEFAULT_MAX, messages: out };
	if (system.length) body.system = system;
	if (stream) body.stream = true;
	if (tools?.length) {
		body.tools = tools.map((t) => ({ name: t.function?.name, description: t.function?.description, input_schema: t.function?.parameters ?? { type: 'object', properties: {} } }));
		if (toolChoice === 'none') body.tool_choice = { type: 'none' };
		else if (toolChoice === 'required') body.tool_choice = { type: 'any' };
		else if (toolChoice && typeof toolChoice === 'object' && toolChoice.function?.name) body.tool_choice = { type: 'tool', name: toolChoice.function.name };
	}
	// No extended thinking, whatever `reasoningEffort` asks: Anthropic refuses a tool turn whose
	// earlier thinking blocks were not passed back, and refuses thinking with a forced tool_choice.
	// This transport does not carry thinking blocks between rounds, so it never turns thinking on.
	void reasoningEffort;
	return body;
}

const FINISH = { end_turn: 'stop', stop_sequence: 'stop', max_tokens: 'length', tool_use: 'tool_calls', refusal: 'content_filter' };

/** Anthropic usage → the OpenAI-shaped usage the spend ledger reads, priced as an estimate. */
function anthropicUsage(u, price) {
	const usage = {
		prompt_tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
		completion_tokens: u.output_tokens || 0,
		cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
		cache_read_input_tokens: u.cache_read_input_tokens || 0,
	};
	usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
	// estimateCost prices prompt_tokens at full rate, so price only the uncached input there.
	const cost = estimateCost({ ...usage, prompt_tokens: u.input_tokens || 0 }, price);
	return { ...usage, cost: cost ?? 0, estimated: true, ...(cost == null ? { unpriced: true } : {}) };
}

function openaiUsage(u, price) {
	const usage = { prompt_tokens: u.prompt_tokens || 0, completion_tokens: u.completion_tokens || 0 };
	usage.total_tokens = u.total_tokens || usage.prompt_tokens + usage.completion_tokens;
	const cost = estimateCost(usage, price);
	return { ...usage, cost: cost ?? 0, estimated: true, ...(cost == null ? { unpriced: true } : {}) };
}

// ── The backend ──────────────────────────────────────────────────────────────────────────

/**
 * A cloud backend on `provider`'s own key, with the OpenRouter backend's shape. `catalog`
 * gives OpenRouter's public, normalized model list (a promise) and `catalogNow` its cached copy
 * (or null), both used only for prices.
 * @param {string} provider
 * @param {{ catalog?: () => any, catalogNow?: () => any[] | null, defaultMaxTokens?: number }} [opts]
 * @returns {Record<string, any>}
 */
export function directBackend(provider, { catalog, catalogNow, defaultMaxTokens = 0 } = {}) {
	const P = PROVIDERS[provider];
	if (!P) throw new Error(`unknown provider: ${provider}`);
	let models = null; // the provider's list, priced
	let inflight = null;
	const price = (id) => {
		return usablePrice(priceRow(provider, id, catalogNow?.() ?? null));
	};
	const label = (status) => `${P.label} error ${status}`;

	const backend = {
		name: 'openrouter', // the Studio's word for "the cloud tier"; `provider` says which one
		provider,
		label: P.label,
		ready() {
			return !!readProviderKey(provider);
		},
		hasPendingAuth() {
			return false;
		},
		keyInvalid() {
			return providerKeyRejected(provider);
		},
		getModel() {
			// The chat selection's model for this provider (lib/model-selection.js), else the derived default.
			return chatModelFor(provider) || (models ? pickDefaultModel(models, provider) : null) || '';
		},
		setModel(id) {
			selectChat({ provider, model: id || '' });
		},
		keySettingsUrl() {
			return P.billingUrl;
		},
		billingUrl() {
			return P.billingUrl;
		},
		keySnapshot() {
			return readProviderKey(provider);
		},
		restore(key) {
			writeProviderKey(provider, key || null);
		},
		disconnect() {
			writeProviderKey(provider, null);
		},
		clearPendingAuth() {},
		// No balance or per-key account a browser key can read on these providers (§7, decision 3).
		async accountInfo() {
			return null;
		},
		async creditsInfo() {
			return null;
		},
		async generationCost() {
			return null;
		},
		modelName() {
			const id = this.getModel();
			return models?.find((m) => m.id === id)?.name || id || P.label;
		},
		modelPrice(forId) {
			const id = forId || this.getModel();
			return id ? price(id) : null;
		},
		invalidateCatalog() {
			models = null;
			inflight = null;
		},
		/** A pasted key's status from the provider's free `/models` listing (0 when it never answered). */
		async checkKey(key) {
			try {
				const res = await fetch(`${P.base}/models`, { headers: providerHeaders(provider, key) });
				return await keyStatus(res);
			} catch {
				return 0;
			}
		},
		listModels() {
			if (models) return Promise.resolve(models);
			inflight ??= (async () => {
				const key = readProviderKey(provider);
				if (!key) return [];
				const res = await fetch(`${P.base}/models${P.transport === 'anthropic' ? '?limit=100' : ''}`, { headers: providerHeaders(provider, key) });
				const st = await keyStatus(res);
				noteProviderStatus(provider, st, key);
				if (!res.ok) throw new Error(`${label(st)}: could not list models`);
				const j = await res.json();
				const cat = await Promise.resolve(catalog?.()).catch(() => null);
				const list = (j.data || [])
					.map((m) => ({ id: String(m.id || '').replace(/^models\//, ''), display: m.display_name || m.name, created: m.created ?? (m.created_at ? Date.parse(m.created_at) / 1000 : null) }))
					.filter((m) => m.id && !NOT_CHAT.test(m.id))
					.map((m) => {
						const row = priceRow(provider, m.id, cat);
						return {
							id: m.id,
							name: row?.name || m.display || m.id,
							promptPerM: row?.promptPerM ?? null,
							completionPerM: row?.completionPerM ?? null,
							imagePerM: row?.imagePerM ?? null,
							contextLength: row?.contextLength ?? null,
							maxOutput: row?.maxOutput ?? null,
							vision: row ? !!row.vision : undefined,
							video: row ? !!row.video : undefined,
							aliasSlug: null,
							created: m.created ?? null,
						};
					})
					.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
				models = list;
				return list;
			})().finally(() => {
				inflight = null;
			});
			return inflight;
		},
		async complete(opts) {
			const key = readProviderKey(provider);
			if (!key) throw new Error(`${P.label} not connected`);
			// A per-call override is an OpenRouter catalog id (`vendor/model`, e.g. the Library's photo
			// model). It names nothing on this provider, so the author's model here answers instead.
			let model = opts.model && !opts.model.includes('/') ? opts.model : opts.pinnedModel || this.getModel();
			if (!model) {
				await this.listModels().catch(() => {});
				model = this.getModel();
			}
			if (!model) throw new Error(`${label(404)}: no model available on this key`);
			// A price is wanted before the usage arrives; the catalog is public and cached for a day.
			if (!catalogNow?.()) await Promise.resolve(catalog?.()).catch(() => {});
			const cap = opts.maxTokens || defaultMaxTokens;
			return P.transport === 'anthropic' ? anthropicComplete({ ...opts, key, model, cap }) : openaiComplete({ ...opts, key, model, cap });
		},
	};

	const report = (fn, ...a) => {
		if (fn) {
			try {
				fn(...a);
			} catch {}
		}
	};

	// Gemini answers a bad or revoked key with 400 "API key not valid" (reason API_KEY_INVALID),
	// not 401. Read as 401 so the save path says "rejected" and the §2 mark is set.
	const BAD_KEY = /API_KEY_INVALID|API key not valid|API key expired/i;
	async function keyStatus(res) {
		if (provider !== 'gemini' || res.status !== 400) return res.status;
		const body = await res.clone().text().catch(() => '');
		return BAD_KEY.test(body) ? 401 : 400;
	}

	async function fail(res, key) {
		const detail = await res.text().catch(() => '');
		const status = provider === 'gemini' && res.status === 400 && BAD_KEY.test(detail) ? 401 : res.status;
		noteProviderStatus(provider, status, key);
		throw new Error(`${label(status)}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
	}

	// OpenAI and Gemini: the OpenRouter request, at the provider's base URL.
	async function openaiComplete({ messages, json, onToken, signal, onUsage, onFinishReason, tools, toolChoice, onToolCalls, onToolStart, onReasoning, reasoningEffort, key, model, cap }) {
		const body = { model, messages: stripCacheMarks(messages), stream: !!onToken };
		if (onToken) body.stream_options = { include_usage: true };
		// OpenAI's newer models refuse `max_tokens` and take `max_completion_tokens`; Gemini's
		// compatibility layer takes `max_tokens`.
		if (cap > 0) body[provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = cap;
		if (json) body.response_format = { type: 'json_object' };
		// No `reasoning_effort`: a non-reasoning OpenAI model refuses it with a 400, and the one
		// caller (photo description) asks for it only as a nicety. Ignored on direct keys.
		if (tools?.length) {
			body.tools = tools;
			if (toolChoice) body.tool_choice = toolChoice;
		}
		const res = await fetch(`${P.base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...providerHeaders(provider, key) }, body: JSON.stringify(body), signal });
		if (!res.ok) await fail(res, key);
		noteProviderStatus(provider, res.status, key);
		const priced = price(model);
		if (!onToken || !res.body) {
			const data = await res.json();
			if (data.usage) report(onUsage, openaiUsage(data.usage, priced));
			report(onFinishReason, data.choices?.[0]?.finish_reason);
			const calls = data.choices?.[0]?.message?.tool_calls;
			if (calls?.length) report(onToolCalls, calls);
			return data.choices?.[0]?.message?.content ?? '';
		}
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		let buf = '';
		let full = '';
		let usage = null;
		let finish = null;
		const calls = [];
		const started = new Set();
		const done = () => {
			if (usage) report(onUsage, openaiUsage(usage, priced));
			report(onFinishReason, finish);
			const made = calls.filter(Boolean);
			if (made.length) report(onToolCalls, made);
			return full;
		};
		while (true) {
			const { value, done: end } = await reader.read();
			if (end || signal?.aborted) break;
			buf += dec.decode(value, { stream: true });
			let nl;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (!line.startsWith('data:')) continue;
				const payload = line.slice(5).trim();
				if (payload === '[DONE]') return done();
				let obj;
				try {
					obj = JSON.parse(payload);
				} catch {
					continue;
				}
				if (obj.error && tools?.length) {
					if (usage) report(onUsage, openaiUsage(usage, priced)); // what was billed so far, as OpenRouter's path does
					try {
						reader.cancel();
					} catch {}
					throw new Error(`${label(Number(obj.error.code) >= 400 ? obj.error.code : 502)}: ${JSON.stringify({ error: obj.error }).slice(0, 300)}`);
				}
				const delta = obj.choices?.[0]?.delta;
				if (delta?.content) {
					full += delta.content;
					onToken(delta.content);
				}
				if (onReasoning && typeof delta?.reasoning_content === 'string' && delta.reasoning_content) report(onReasoning, delta.reasoning_content);
				for (const d of delta?.tool_calls || []) {
					const i = Number.isInteger(d.index) ? d.index : d.id || !calls.length ? calls.length : calls.length - 1;
					const c = (calls[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
					if (d.id) c.id = d.id;
					if (d.function?.name) {
						c.function.name += d.function.name;
						if (!started.has(i)) {
							started.add(i);
							report(onToolStart, c.function.name);
						}
					}
					if (d.function?.arguments) c.function.arguments += d.function.arguments;
				}
				if (obj.choices?.[0]?.finish_reason) finish = obj.choices[0].finish_reason;
				if (obj.usage) usage = obj.usage;
			}
		}
		return done();
	}

	// Anthropic: the Messages API, its stream events mapped back onto the same callbacks.
	async function anthropicComplete({ messages, json, onToken, signal, onUsage, onFinishReason, tools, toolChoice, onToolCalls, onToolStart, onReasoning, reasoningEffort, key, model, cap }) {
		const body = toAnthropicBody({ messages, model, maxTokens: cap, json, tools, toolChoice, stream: !!onToken, reasoningEffort });
		const res = await fetch(`${P.base}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...providerHeaders(provider, key) }, body: JSON.stringify(body), signal });
		if (!res.ok) await fail(res, key);
		noteProviderStatus(provider, res.status, key);
		const priced = price(model);
		if (!onToken || !res.body) {
			const data = await res.json();
			if (data.usage) report(onUsage, anthropicUsage(data.usage, priced));
			report(onFinishReason, FINISH[data.stop_reason] || data.stop_reason);
			const blocks = data.content || [];
			const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
			if (calls.length) report(onToolCalls, calls);
			return blocks
				.filter((b) => b.type === 'text')
				.map((b) => b.text)
				.join('');
		}
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		let buf = '';
		let full = '';
		const usage = {};
		let finish = null;
		const calls = []; // by content-block index
		const done = () => {
			report(onUsage, anthropicUsage(usage, priced));
			report(onFinishReason, finish);
			const made = calls.filter(Boolean);
			if (made.length) report(onToolCalls, made);
			return full;
		};
		while (true) {
			const { value, done: end } = await reader.read();
			if (end || signal?.aborted) break;
			buf += dec.decode(value, { stream: true });
			let nl;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (!line.startsWith('data:')) continue;
				let ev;
				try {
					ev = JSON.parse(line.slice(5).trim());
				} catch {
					continue;
				}
				if (ev.type === 'message_start') Object.assign(usage, ev.message?.usage || {});
				else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
					calls[ev.index] = { id: ev.content_block.id, type: 'function', function: { name: ev.content_block.name, arguments: '' } };
					report(onToolStart, ev.content_block.name);
				} else if (ev.type === 'content_block_delta') {
					const d = ev.delta || {};
					if (d.type === 'text_delta' && d.text) {
						full += d.text;
						onToken(d.text);
					} else if (d.type === 'input_json_delta' && calls[ev.index]) calls[ev.index].function.arguments += d.partial_json || '';
					else if (d.type === 'thinking_delta' && d.thinking) report(onReasoning, d.thinking);
				} else if (ev.type === 'message_delta') {
					if (ev.delta?.stop_reason) finish = FINISH[ev.delta.stop_reason] || ev.delta.stop_reason;
					Object.assign(usage, ev.usage || {});
				} else if (ev.type === 'message_stop') return done();
				else if (ev.type === 'error') {
					const status = ev.error?.type === 'overloaded_error' ? 529 : 502;
					if (tools?.length) {
						try {
							reader.cancel();
						} catch {}
						throw new Error(`${label(status)}: ${JSON.stringify({ error: ev.error }).slice(0, 300)}`);
					}
					return done();
				}
			}
		}
		return done();
	}

	return backend;
}

// OpenRouter-only marks (`cache_control` on a text part) are harmless to Anthropic but refused
// by some OpenAI-compatible endpoints; flatten a marked text-only system message back to a string.
function stripCacheMarks(messages) {
	return (messages || []).map((m) => {
		if (!Array.isArray(m.content) || !m.content.some((p) => p?.cache_control)) return m;
		const parts = m.content.map(({ cache_control, ...rest }) => rest);
		return parts.every((p) => p.type === 'text') ? { ...m, content: parts.map((p) => p.text).join('') } : { ...m, content: parts };
	});
}
