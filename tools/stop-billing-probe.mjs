#!/usr/bin/env node
/**
 * Does OpenRouter bill a chat request that the author stopped, and from which point?
 *
 * The Studio chat settles a round a Stop ended (#3533 S01, `settleOpenRound` in
 * docs/src/components/studio/chat-agent.ts) on one rule: a request is billed once the provider
 * took it, meaning its HTTP 200, and not before. So a Stop before the 200 costs nothing in the
 * ledger, and a Stop after it is charged an estimate. That rule is a design assumption. This tool
 * measures it: it sends the same request several times, stops each at a different point, and
 * reads what the key was actually billed for each.
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
 * The key is read only from the environment and never printed (HARD RULE #24, workflow.md §OpenRouter budget).
 */
import fs from 'node:fs';

const API = 'https://openrouter.ai/api/v1';
export const CASES = ['control', 'before-200', 'at-200', 'first-chunk', 'mid-stream'];
/** What the Studio's ledger does with each case today: charge nothing, an estimate, or the exact reported cost. */
export const LEDGER_RULE = { control: 'exact', 'before-200': 'nothing', 'at-200': 'estimate', 'first-chunk': 'estimate', 'mid-stream': 'estimate' };

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
export function verdict(row, tol = 0.0002) {
	if (row.billed == null) return 'unsettled: no verdict';
	const rule = LEDGER_RULE[row.case];
	const billed = row.billed > tol;
	if (rule === 'nothing') return billed ? `UNDERCHARGED: billed $${row.billed.toFixed(5)}, the ledger charges $0` : 'match: not billed, not charged';
	if (rule === 'exact') return `yardstick: billed $${row.billed.toFixed(5)}`;
	if (!billed) return `OVERCHARGED: not billed, the ledger charges ≈ $${row.estimate.toFixed(5)}`;
	const ratio = row.estimate / row.billed;
	return `match: billed $${row.billed.toFixed(5)}, the ledger charges ≈ $${row.estimate.toFixed(5)} (${ratio.toFixed(2)}x)`;
}

export function table(rows) {
	return rows.map((r) => `${r.case.padEnd(12)} ${String(r.status ?? '-').padEnd(4)} ${verdict(r)}`).join('\n');
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
