#!/usr/bin/env node
/**
 * Does OpenRouter bill a chat request that the author stopped, and from which point?
 *
 * The Studio chat settles a round a Stop ended (#3533 S01, `settleOpenRound` in
 * docs/src/components/studio/chat-agent.ts) on one rule: a request is billed from its first chunk
 * (a token, a thought, a tool call or a generation id), so a Stop before that chunk costs nothing in
 * the ledger and a Stop after it is charged an estimate. This tool measured that rule: it sends the
 * same request several times, stops each at a different point, and reads what the key was actually
 * billed for each. Run 46071814895 (2026-11-27) found a Stop on the HTTP 200, before any chunk, is
 * not billed; the ledger charged it then, and the rule above is the fix. Re-run it to check the rule
 * still holds.
 *
 *   control       read to the end (the exact cost, the yardstick)
 *   before-200    abort as soon as the request is sent, before the response headers
 *   at-200        abort on the 200, before reading any of the body
 *   first-chunk   abort on the first chunk of the answer
 *   mid-stream    abort once about 400 characters of the answer have arrived
 *
 * The billed figure is the key's own usage counter (GET /api/v1/key), read before and after each
 * case. The cases run one at a time, and each waits until the counter has settled, so each
 * delta belongs to one request. A case whose counter never settles is reported as "unsettled",
 * never as 0.
 *
 * Usage:
 *   OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/stop-billing-probe.mjs [--model ID] [--cap USD] [--cases a,b] [--out rows.json]
 *       Spends real credits on OUR key: five requests of about 6K input tokens each. On Haiku 5.5
 *       that is about $0.04. --cap (default 0.10) stops the run once the billed total passes it.
 *       Without OPENROUTER_ALLOW_SPEND=1 it prints the plan and exits without a request.
 *   node tools/stop-billing-probe.mjs --from rows.json
 *       No spend: print the verdict table from a saved run.
 *
 * A direct Anthropic key (--provider anthropic): the same question for the Studio's own Anthropic transport
 * (docs/src/components/studio/ai/direct-providers.js). That key has no per-key usage counter, so the billed figure
 * comes from the organization's usage report (GET /v1/organizations/usage_report/messages, one-minute buckets,
 * filtered to the probe's key and model), which needs an Admin API key and lags a few minutes. So it runs in two
 * steps, and each case gets a UTC minute of its own:
 *   ANTHROPIC_PROBE_KEY=… ANTHROPIC_ALLOW_SPEND=1 node tools/stop-billing-probe.mjs --provider anthropic --send [--out rows.json]
 *       Six requests of about 6.6K input tokens to Claude Haiku 5.5, about $0.004 in all, over about 12 minutes. Use a
 *       fresh key that nothing else uses: the report is read by key, so other traffic on it would blur the figures.
 *       Without ANTHROPIC_ALLOW_SPEND=1 it prints the plan and sends nothing.
 *   ANTHROPIC_ADMIN_KEY=… node tools/stop-billing-probe.mjs --provider anthropic --read rows.json [--api-key-id apikey_…]
 *       No spend. Run it 10 minutes or more after --send. It finds the probe key's id from its last four characters
 *       (saved by --send), or takes --api-key-id, and prints each case against the ledger's rule. The control case
 *       runs last, so until its bucket has landed every case reads "unsettled", never 0.
 *   The direct path adds one case, message-start: a Stop on Anthropic's first event after the 200, which the Studio's
 *   transport reads but fires no callback for, so the ledger charges it nothing.
 * Keys are read only from the environment and never printed (HARD RULE #24, workflow.md §OpenRouter budget).
 */
import fs from 'node:fs';

const API = 'https://openrouter.ai/api/v1';
export const CASES = ['control', 'before-200', 'at-200', 'first-chunk', 'mid-stream'];
/** What the Studio's ledger does with each case today: charge nothing, an estimate, or the exact reported cost. */
export const LEDGER_RULE = { control: 'exact', 'before-200': 'nothing', 'at-200': 'nothing', 'first-chunk': 'estimate', 'mid-stream': 'estimate' };

/** The prompt: about 6K tokens of input, so the provider is still reading it when the early cases stop. */
export function probePrompt() {
	const para =
		'A board deck earns its place one slide at a time. Each slide makes one claim, shows the evidence for it, and hands the reader to the next claim without a gap. ';
	const body = Array.from({ length: 160 }, (_, i) => `${i + 1}. ${para}`).join('\n');
	return [
		{ role: 'system', content: 'You review slide decks. Answer in plain prose.' },
		{ role: 'user', content: `${body}\n\nIn about 300 words, say what this text argues and how it could be tightened.` },
	];
}

/** Our ledger's estimate for a stopped round: input as text ÷ 4 at the full input rate, plus the prose that arrived. */
export function ledgerEstimate(messages, streamedChars, price) {
	const inChars = messages.reduce((n, m) => n + String(m.content).length, 0);
	return (inChars / 4) * price.prompt + (streamedChars / 4) * price.completion;
}

/** One case's verdict: does the ledger's rule match what the key was billed? `tol` absorbs the counter's rounding. */
export function verdict(row, tol = 0.0002, rules = LEDGER_RULE) {
	if (row.billed == null) return 'unsettled: no verdict';
	const rule = rules[row.case];
	const billed = row.billed > tol;
	if (rule === 'nothing') return billed ? `UNDERCHARGED: billed $${row.billed.toFixed(5)}, the ledger charges $0` : 'match: not billed, not charged';
	if (rule === 'exact') return `yardstick: billed $${row.billed.toFixed(5)}`;
	if (!billed) return `OVERCHARGED: not billed, the ledger charges ≈ $${row.estimate.toFixed(5)}`;
	const ratio = row.estimate / row.billed;
	return `match: billed $${row.billed.toFixed(5)}, the ledger charges ≈ $${row.estimate.toFixed(5)} (${ratio.toFixed(2)}x)`;
}

export function table(rows, tol, rules) {
	return rows.map((r) => `${r.case.padEnd(13)} ${String(r.status ?? '-').padEnd(4)} ${verdict(r, tol, rules)}`).join('\n');
}

// ── A direct Anthropic key ────────────────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API = 'https://api.anthropic.com/v1';
/** The Studio's transport sends this version (ANTHROPIC_VERSION in direct-providers.js); the probe sends the same. */
const ANTHROPIC_MESSAGES_VERSION = '2023-06-01';
/** The usage report's documented examples send this version. */
const ANTHROPIC_ADMIN_VERSION = '2026-10-21';
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';
/** Run order: control last, so a landed control bucket shows the earlier buckets have landed too. */
export const ANTHROPIC_CASES = ['before-200', 'at-200', 'message-start', 'first-chunk', 'mid-stream', 'control'];
/** The Studio's ledger on the direct path: message_start fires no callback in the transport, so a Stop there is charged nothing. */
export const ANTHROPIC_LEDGER_RULE = { ...LEDGER_RULE, 'message-start': 'nothing' };
/** Dollars per token: Claude Haiku 5.5's list price for prompts up to 100K tokens, $0.10 in and $0.50 out per million. */
export const ANTHROPIC_PRICE = { prompt: 0.1 / 1e6, completion: 0.5 / 1e6 };
/** Well above one request's rounding: a billed Stop costs at least its 6.6K input tokens, about $0.00066. */
export const ANTHROPIC_TOL = 0.00001;

/** The Messages API body for the probe prompt: the system turn moves to `system`. */
export function anthropicBody(messages, model = ANTHROPIC_MODEL) {
	return {
		model,
		max_tokens: 600,
		stream: true,
		system: messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n'),
		messages: messages.filter((m) => m.role !== 'system'),
	};
}

/** What one usage-report result cost: the cache rates are the Studio's own (CACHE_RATES in direct-providers.js). */
export function billedFromUsage(u, price = ANTHROPIC_PRICE) {
	const cc = u?.cache_creation ?? {};
	const input = (u?.uncached_input_tokens ?? 0) + 1.25 * (cc.ephemeral_5m_input_tokens ?? 0) + 2 * (cc.ephemeral_1h_input_tokens ?? 0) + 0.1 * (u?.cache_read_input_tokens ?? 0);
	return input * price.prompt + (u?.output_tokens ?? 0) * price.completion;
}

/** The usage in the one-minute bucket that starts at `minute`, summed over its results; null when no such bucket is in the report. */
export function bucketUsage(report, minute) {
	const at = Date.parse(minute);
	const b = (report?.data ?? []).find((d) => Date.parse(d.starting_at) === at);
	if (!b) return null;
	const sum = { uncached_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } };
	for (const r of b.results ?? []) {
		sum.uncached_input_tokens += r.uncached_input_tokens ?? 0;
		sum.cache_read_input_tokens += r.cache_read_input_tokens ?? 0;
		sum.output_tokens += r.output_tokens ?? 0;
		sum.cache_creation.ephemeral_5m_input_tokens += r.cache_creation?.ephemeral_5m_input_tokens ?? 0;
		sum.cache_creation.ephemeral_1h_input_tokens += r.cache_creation?.ephemeral_1h_input_tokens ?? 0;
	}
	return sum;
}

/** Each case's billed dollars from the report. Every case reads null (unsettled) until the control case, run last, has landed. */
export function settleFromReport(run, report, price = ANTHROPIC_PRICE) {
	const control = run.rows.find((r) => r.case === 'control');
	const landed = control ? bucketUsage(report, control.minute) : null;
	const ok = landed && landed.uncached_input_tokens + landed.cache_read_input_tokens + landed.output_tokens > 0;
	return run.rows.map((r) => {
		const u = ok ? bucketUsage(report, r.minute) : null;
		return { ...r, usage: u, billed: u ? billedFromUsage(u, price) : null, estimate: ledgerEstimate(probePrompt(), r.streamedChars, price) };
	});
}

/** The probe key's id: the one active key whose redacted hint ends in the same four characters. */
export function matchKeyId(keys, last4) {
	const hits = keys.filter((k) => typeof k.partial_key_hint === 'string' && k.partial_key_hint.endsWith(last4));
	if (hits.length !== 1) throw new Error(`${hits.length} API keys end in …${last4}; pass --api-key-id apikey_… instead.`);
	return hits[0].id;
}

/** The first UTC minute at least `gapMinutes` after `now`, plus a few seconds, so a case starts and ends inside one bucket. */
export function nextSlot(now, gapMinutes = 1) {
	const m = new Date(now);
	m.setUTCSeconds(0, 0);
	m.setUTCMinutes(m.getUTCMinutes() + gapMinutes);
	return { minute: m.toISOString(), startAt: m.getTime() + 2000 };
}

/** One case on the direct Anthropic path, stopped where the case says. Mirrors what the Studio's transport reacts to. */
export async function runAnthropicCase(name, { key, model = ANTHROPIC_MODEL, messages }) {
	const ctl = new AbortController();
	const out = { case: name, status: null, streamedChars: 0, startInputTokens: null, stoppedOn: null };
	const sent = fetch(`${ANTHROPIC_API}/messages`, {
		method: 'POST',
		headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_MESSAGES_VERSION, 'content-type': 'application/json' },
		body: JSON.stringify(anthropicBody(messages, model)),
		signal: ctl.signal,
	});
	if (name === 'before-200') {
		await sleep(50);
		ctl.abort();
		await sent.catch(() => {});
		return out;
	}
	const res = await sent;
	out.status = res.status;
	if (!res.ok) throw new Error(`POST /messages: HTTP ${res.status}`);
	if (name === 'at-200') {
		ctl.abort();
		return out;
	}
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let buf = '';
	const stop = (on) => {
		out.stoppedOn = on;
		ctl.abort();
		return out;
	};
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			let nl;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (!line.startsWith('data:')) continue;
				const ev = JSON.parse(line.slice(5));
				if (ev.type === 'message_start') {
					out.startInputTokens = ev.message?.usage?.input_tokens ?? null;
					if (name === 'message-start') return stop('message_start');
					continue;
				}
				// The events the Studio's transport turns into a callback, and so into a billed round (settleOpenRound).
				const toolStart = ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use';
				const text = ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' ? (ev.delta.text ?? '') : '';
				const thought = ev.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta' && ev.delta.thinking;
				out.streamedChars += text.length;
				if (name === 'first-chunk' && (toolStart || text || thought)) return stop(toolStart ? 'tool_use' : text ? 'text_delta' : 'thinking_delta');
				if (name === 'mid-stream' && out.streamedChars >= 400) return stop('400 characters');
			}
		}
	} catch (e) {
		if (e?.name !== 'AbortError') throw e;
	}
	return out;
}

async function anthropicSend() {
	const cases = arg('--cases', ANTHROPIC_CASES.join(',')).split(',').filter((c) => ANTHROPIC_CASES.includes(c));
	const messages = probePrompt();
	console.log(`Plan: ${cases.length} requests to ${ANTHROPIC_MODEL}, about ${Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4)} input tokens each, one UTC minute apart.`);
	if (process.env.ANTHROPIC_ALLOW_SPEND !== '1') {
		console.log('ANTHROPIC_ALLOW_SPEND is not 1: nothing sent.');
		return;
	}
	const key = process.env.ANTHROPIC_PROBE_KEY;
	if (!key) throw new Error('ANTHROPIC_PROBE_KEY is not set.');
	const run = { provider: 'anthropic', model: ANTHROPIC_MODEL, keyLast4: key.slice(-4), rows: [] };
	const outFile = arg('--out', 'stop-probe-anthropic.json');
	for (const name of cases) {
		// A minute of its own, and an empty minute before it, so a slow case cannot spill into the next case's bucket.
		const slot = nextSlot(Date.now(), run.rows.length ? 2 : 1);
		await sleep(Math.max(0, slot.startAt - Date.now()));
		const r = await runAnthropicCase(name, { key, messages });
		r.minute = slot.minute;
		run.rows.push(r);
		fs.writeFileSync(outFile, `${JSON.stringify(run, null, 2)}\n`);
		console.log(`${name}: sent in the minute from ${slot.minute}${r.stoppedOn ? `, stopped on ${r.stoppedOn}` : ''}`);
	}
	console.log(`\nSaved to ${outFile}. Read it in 10 minutes or more with --read ${outFile} and ANTHROPIC_ADMIN_KEY.`);
}

async function anthropicRead(file) {
	const run = JSON.parse(fs.readFileSync(file, 'utf8'));
	const admin = process.env.ANTHROPIC_ADMIN_KEY;
	if (!admin) throw new Error('ANTHROPIC_ADMIN_KEY is not set.');
	const headers = { 'x-api-key': admin, 'anthropic-version': ANTHROPIC_ADMIN_VERSION };
	let id = arg('--api-key-id');
	if (!id) {
		const keys = [];
		let after = '';
		for (;;) {
			const res = await fetch(`${ANTHROPIC_API}/organizations/api_keys?limit=1000${after}`, { headers });
			if (!res.ok) throw new Error(`GET /organizations/api_keys: HTTP ${res.status}`);
			const j = await res.json();
			keys.push(...j.data);
			if (!j.has_more || !j.last_id) break;
			after = `&after_id=${encodeURIComponent(j.last_id)}`;
		}
		id = matchKeyId(keys, run.keyLast4);
	}
	const minutes = run.rows.map((r) => Date.parse(r.minute));
	const q = new URLSearchParams({ starting_at: new Date(Math.min(...minutes)).toISOString(), ending_at: new Date(Math.max(...minutes) + 60_000).toISOString(), bucket_width: '1m', limit: '1440' });
	q.append('api_key_ids[]', id);
	q.append('models[]', run.model);
	const res = await fetch(`${ANTHROPIC_API}/organizations/usage_report/messages?${q}`, { headers });
	if (!res.ok) throw new Error(`GET /organizations/usage_report/messages: HTTP ${res.status}`);
	const rows = settleFromReport(run, await res.json());
	for (const r of rows) {
		const u = r.usage;
		console.log(`${r.case.padEnd(13)} ${u ? `${u.uncached_input_tokens} in, ${u.cache_read_input_tokens} cached, ${u.output_tokens} out` : 'no bucket yet'}`);
	}
	console.log(`\n${table(rows, ANTHROPIC_TOL, ANTHROPIC_LEDGER_RULE)}`);
	if (rows.some((r) => r.billed == null)) console.log('\nSome cases are unsettled: the report has not caught up. Run --read again in a few minutes.');
}

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function keyUsage(headers) {
	const res = await fetch(`${API}/key`, { headers });
	if (!res.ok) throw new Error(`GET /key: HTTP ${res.status}`);
	const j = await res.json();
	return Number(j?.data?.usage);
}

/** Wait for the usage counter to move off `before` and hold still for two reads 15 s apart; up to 3 minutes. */
async function settledUsage(headers, before) {
	let last = await keyUsage(headers);
	for (let t = 0; t < 12; t++) {
		await sleep(15_000);
		const now = await keyUsage(headers);
		if (now === last && (now !== before || t >= 5)) return now;
		last = now;
	}
	return null;
}

export async function runCase(name, { headers, model, messages }) {
	const ctl = new AbortController();
	const out = { case: name, status: null, streamedChars: 0, generationId: null };
	const sent = fetch(`${API}/chat/completions`, {
		method: 'POST',
		headers: { ...headers, 'content-type': 'application/json' },
		body: JSON.stringify({ model, messages, stream: true, max_tokens: 600, usage: { include: true } }),
		signal: ctl.signal,
	});
	if (name === 'before-200') {
		await sleep(50);
		ctl.abort();
		await sent.catch(() => {});
		return out;
	}
	const res = await sent;
	out.status = res.status;
	if (name === 'at-200') {
		ctl.abort();
		return out;
	}
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let buf = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			let nl;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
				const j = JSON.parse(line.slice(5));
				out.generationId ??= j.id ?? null;
				const piece = j.choices?.[0]?.delta?.content ?? '';
				out.streamedChars += piece.length;
				if (j.usage) out.reported = j.usage.cost ?? null;
				if ((name === 'first-chunk' && piece) || (name === 'mid-stream' && out.streamedChars >= 400)) {
					ctl.abort();
					return out;
				}
			}
		}
	} catch (e) {
		if (e?.name !== 'AbortError') throw e;
	}
	return out;
}

async function main() {
	if (arg('--provider') === 'anthropic') {
		const read = arg('--read');
		return read ? anthropicRead(read) : process.argv.includes('--send') ? anthropicSend() : console.log('--provider anthropic needs --send or --read FILE.');
	}
	const from = arg('--from');
	if (from) {
		console.log(table(JSON.parse(fs.readFileSync(from, 'utf8'))));
		return;
	}
	const model = arg('--model', 'anthropic/claude-haiku-5.5');
	const cap = Number(arg('--cap', '0.10'));
	const cases = arg('--cases', CASES.join(',')).split(',').filter((c) => CASES.includes(c));
	const messages = probePrompt();
	console.log(`Plan: ${cases.length} requests to ${model}, about ${Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4)} input tokens each; cap $${cap}.`);
	if (process.env.OPENROUTER_ALLOW_SPEND !== '1') {
		console.log('OPENROUTER_ALLOW_SPEND is not 1: nothing sent.');
		return;
	}
	const key = process.env.OPEN_ROUTER_KEY;
	if (!key) throw new Error('OPEN_ROUTER_KEY is not set.');
	const headers = { authorization: `Bearer ${key}` };
	const models = await (await fetch(`${API}/models`)).json();
	const m = models.data.find((x) => x.id === model);
	if (!m) throw new Error(`${model} is not in the OpenRouter catalog.`);
	const price = { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion) };
	const rows = [];
	let spent = 0;
	for (const name of cases) {
		if (spent > cap) {
			console.log(`Stopped: $${spent.toFixed(4)} billed passes the $${cap} cap.`);
			break;
		}
		const before = await keyUsage(headers);
		const r = await runCase(name, { headers, model, messages });
		const after = await settledUsage(headers, before);
		r.billed = after == null ? null : after - before;
		r.estimate = ledgerEstimate(messages, r.streamedChars, price);
		spent += r.billed ?? 0;
		rows.push(r);
		console.log(`${name}: ${verdict(r)}`);
	}
	const outFile = arg('--out');
	if (outFile) fs.writeFileSync(outFile, `${JSON.stringify(rows, null, 2)}\n`);
	console.log(`\n${table(rows)}\n\nBilled in total: $${spent.toFixed(5)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
}
