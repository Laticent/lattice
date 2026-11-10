#!/usr/bin/env node
/**
 * Check every model id the Studio names (docs/src/lib/models.config.json) against each provider's
 * LIVE model list, so a retired id is caught overnight and not by an author. Listing is free:
 * nothing here spends. Run nightly by .github/workflows/model-guard-nightly.yml.
 *
 * Lists: OpenRouter chat and speech (public, no key), Gemini (GEMINI_API_KEY), Anthropic
 * (ANTHROPIC_API_KEY) and OpenAI (OPENAI_API_KEY). A list whose key is unset is SKIPPED and says
 * so; it never reads as a pass. A billing or quota answer (classifyProviderError → 'billing') is a
 * PASS for that list's connection: the keys may run without funds, and the check is about
 * connections and ids, never credit (owner, 2026-11-08). It never reads our own OpenRouter key:
 * OpenRouter's lists are public (HARD RULE #24).
 *
 * Usage:
 *   node tools/check-model-ids.mjs [--md report.md] [--retire <id>]... [--offline <dir>]
 *   --md        write a Markdown report (the issue body) as well as the console lines
 *   --retire    add a deliberately missing id to the OpenRouter chat defaults (a dry run that proves
 *               the check can fail: `--retire openrouter-guard/not-a-model`)
 *   --offline   read recorded lists from <dir>/<list>.json instead of the network (tests)
 * Exit: 0 every checked id is live; 1 an id is gone or a list could not be read; 2 the config is invalid.
 * The last line is `checked=<n> skipped=<lists> billing=<n>`, which the workflow parses.
 * engineering/decisions/2026-11-09-model-guard-rails.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { configuredIds, validateModelsConfig } = await import(path.join(ROOT, 'docs/src/lib/models-config.js'));
const { classifyProviderError } = await import(path.join(ROOT, 'docs/src/lib/provider-errors.js'));

/** How to fetch each list: its URL, the env variable holding its key (null = public) and its headers. */
export const LISTS = {
	openrouter: { url: 'https://openrouter.ai/api/v1/models', env: null },
	'openrouter-voice': { url: 'https://openrouter.ai/api/v1/models?output_modalities=speech', env: null },
	gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', env: 'GEMINI_API_KEY', headers: (k) => ({ 'x-goog-api-key': k }) },
	anthropic: { url: 'https://api.anthropic.com/v1/models?limit=1000', env: 'ANTHROPIC_API_KEY', headers: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }) },
	openai: { url: 'https://api.openai.com/v1/models', env: 'OPENAI_API_KEY', headers: (k) => ({ Authorization: `Bearer ${k}` }) },
};

/** The ids in a provider's list body (`models/gemini-…` loses its prefix; Gemini pages are followed by the caller). */
export function idsOf(body) {
	const rows = body?.data ?? body?.models ?? [];
	return rows.map((m) => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean);
}

/**
 * Score the configured ids against the lists that answered.
 * @param {ReturnType<typeof configuredIds>} wanted
 * @param {Record<string, { status: 'ok' | 'billing' | 'skipped' | 'error', ids?: string[], why?: string }>} lists
 */
export function score(wanted, lists, familyRegExp) {
	const gone = [];
	let checked = 0;
	for (const w of wanted) {
		const l = lists[w.list];
		if (!l || l.status !== 'ok') continue;
		checked++;
		const live = l.ids;
		const ok = w.kind === 'exact' ? live.includes(w.id) : w.kind === 'prefix' ? live.some((id) => id === w.id || id.startsWith(w.id)) : live.some((id) => familyRegExp(w.id).test(id));
		if (!ok) gone.push(w);
	}
	return { gone, checked };
}

async function fetchList(name, spec, offline) {
	if (offline) {
		const f = path.join(offline, `${name}.json`);
		if (!fs.existsSync(f)) return { status: 'skipped', why: 'no recording' };
		const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
		if (rec.status && rec.status !== 200) return answerOf(rec.status, JSON.stringify(rec.body ?? ''));
		return { status: 'ok', ids: idsOf(rec.body ?? rec) };
	}
	// `env` names the variable that holds the list's key; only its NAME is ever printed.
	const key = spec.env ? process.env[spec.env] : null;
	if (spec.env && !key) return { status: 'skipped', why: `${spec.env} is not set` };
	const ids = [];
	let url = spec.url;
	for (let page = 0; page < 20 && url; page++) {
		let res;
		try {
			res = await fetch(url, { headers: spec.headers?.(key) ?? {}, signal: AbortSignal.timeout(30_000) });
		} catch (e) {
			return { status: 'error', why: `no answer (${e.message})` };
		}
		const text = await res.text();
		if (!res.ok) return answerOf(res.status, text);
		let body;
		try {
			body = JSON.parse(text);
		} catch {
			// A 200 that is not JSON (a maintenance or captive page): the list was not read, so nothing was checked.
			return { status: 'error', why: `HTTP ${res.status} but the body is not JSON: ${text.slice(0, 120)}` };
		}
		ids.push(...idsOf(body));
		// Gemini pages with nextPageToken, Anthropic with has_more + last_id; OpenAI and OpenRouter answer in one page.
		if (body.nextPageToken) url = `${spec.url}&pageToken=${encodeURIComponent(body.nextPageToken)}`;
		else if (body.has_more && body.last_id) url = `${spec.url}&after_id=${encodeURIComponent(body.last_id)}`;
		else url = null;
	}
	return { status: 'ok', ids };
}

/** A non-2xx list answer: billing passes (the connection works), anything else is an error that fails the run. */
function answerOf(status, text) {
	const kind = classifyProviderError(status, text);
	if (kind === 'billing') return { status: 'billing', why: `HTTP ${status}: billing or quota — the connection works; ids not checked` };
	return { status: 'error', why: `HTTP ${status} (${kind}): ${String(text).slice(0, 200)}` };
}

async function main(argv) {
	const md = argv.includes('--md') ? argv[argv.indexOf('--md') + 1] : null;
	const offline = argv.includes('--offline') ? argv[argv.indexOf('--offline') + 1] : null;
	const retire = argv.flatMap((a, i) => (a === '--retire' ? [argv[i + 1]] : []));
	const cfgPath = path.join(ROOT, 'docs/src/lib/models.config.json');
	const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
	const invalid = validateModelsConfig(cfg);
	if (invalid.length) {
		for (const e of invalid) console.error(`config: ${e}`);
		return 2;
	}
	const { familyRegExp } = await import(path.join(ROOT, 'docs/src/lib/models-config.js'));
	const wanted = configuredIds(cfg);
	for (const id of retire) wanted.push({ where: 'dry run (--retire)', id, kind: 'exact', list: 'openrouter' });

	const lists = {};
	for (const [name, spec] of Object.entries(LISTS)) {
		lists[name] = await fetchList(name, spec, offline);
		const l = lists[name];
		console.log(`list ${name}: ${l.status}${l.ids ? ` (${l.ids.length} ids)` : ''}${l.why ? ` — ${l.why}` : ''}`);
	}
	const { gone, checked } = score(wanted, lists, familyRegExp);
	const errored = Object.entries(lists).filter(([, l]) => l.status === 'error');
	const skipped = Object.entries(lists).filter(([, l]) => l.status === 'skipped' || l.status === 'billing').map(([n]) => n);
	for (const g of gone) console.log(`GONE ${g.list}: ${g.id} (${g.kind}, ${g.where})`);

	if (md) {
		const out = [];
		if (gone.length) {
			out.push(`**${gone.length} configured model id(s) are no longer on their provider's live list.** Fix: in \`docs/src/lib/models.config.json\`, move a gone default to a live id, or move the id into \`retired\` (stored selections naming it then read "Model retired").`, '');
			out.push('| List | Id | Kind | Where in the config |', '|---|---|---|---|');
			for (const g of gone) out.push(`| ${g.list} | \`${g.id}\` | ${g.kind} | \`${g.where}\` |`);
			out.push('');
		}
		if (errored.length) {
			out.push(`**${errored.length} list(s) could not be read**, so their ids were NOT checked:`, '');
			for (const [n, l] of errored) out.push(`- \`${n}\`: ${l.why}`);
			out.push('');
		}
		if (!gone.length && !errored.length) out.push(`Every checked id is live (${checked} checked).`, '');
		out.push('| List | Result |', '|---|---|');
		for (const [n, l] of Object.entries(lists)) out.push(`| ${n} | ${l.status}${l.ids ? `, ${l.ids.length} ids` : ''}${l.why ? ` — ${l.why}` : ''} |`);
		fs.writeFileSync(md, `${out.join('\n')}\n`);
	}
	// `billing=` counts lists that answered but were not measured tonight (out of funds). An unset secret
	// is the same every night, so it cannot hide a recovery; a billing answer can, and the stand-down
	// refuses to close on a night that has one.
	const billing = Object.values(lists).filter((l) => l.status === 'billing').length;
	console.log(`checked=${checked} skipped=${skipped.join(',') || 'none'} billing=${billing}`);
	return gone.length || errored.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	process.exitCode = await main(process.argv.slice(2));
}
