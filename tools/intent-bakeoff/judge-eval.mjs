/**
 * Does a model actually judge component fit better than BM25? Measured, not argued.
 *
 * Usage:  OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/intent-bakeoff/judge-eval.mjs [--model <id>] [--limit <n>] [--k <n>]
 *   Spends real credits on OUR key — opt-in only. Without OPENROUTER_ALLOW_SPEND=1 it prints the
 *   planned spend and exits. Validate on --limit 1 first; set a per-key cap at openrouter.ai/settings/keys.
 *
 * WHY THIS EXISTS. The deterministic facet scorer was supposed to turn the manifest's authored
 * `whenToUse` / `antiPatterns` into fit judgment, and the held-out benchmark refuted it
 * (tools/intent-bakeoff/fit-search.ts documents the numbers). The remaining hypothesis is that those
 * notes are the right INPUT but the wrong FEATURES — 25 words of authored reasoning is excellent
 * prompt context and useless as a term-frequency signal. This tests exactly that, on the same
 * 128 held-out cases, so the answer is comparable to everything already measured.
 *
 * THE SHAPE UNDER TEST is retrieve-then-judge, not judge-everything: BM25 narrows 61 components
 * to K, and the model re-ranks only those, reading their authored notes. That keeps the prompt
 * small enough to be affordable per query and is the only version worth shipping. Its ceiling is
 * therefore retrieval recall@K, which this reports first — a judge cannot pick what it never saw.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFitCorpus } from './fit-corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const arg = (flag, fallback) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : fallback);

const KEY = process.env.OPEN_ROUTER_KEY;
const MODEL = arg('--model', process.env.SMOKE_MODEL || 'anthropic/claude-sonnet-4.5');
const K = Math.max(3, Number(arg('--k', 10)) || 10);
const LIMIT = process.argv.includes('--limit') ? Math.max(1, Number(arg('--limit', 1)) || 1) : null;
// A ranked list of ≤K short names needs ~150 tokens. The ceiling is generous anyway because
// the model narrates unless firmly stopped, and a `finish_reason: length` truncation mid-JSON
// is indistinguishable from a refusal — the first run hit exactly that at 400.
const MAX_TOK = 900;

const raw = JSON.parse(readFileSync(join(ROOT, 'dist/docs/components.json'), 'utf8')).components;
const CATALOG = raw.map((c) => ({
	name: c.name,
	bucket: c.bucket,
	function: c.function || '',
	form: c.form || '',
	substance: c.substance || '',
	family: '',
	familyLabel: '',
	description: c.description || '',
	purpose: c.purpose || '',
	tags: Array.isArray(c.tags) ? c.tags : [],
	whenToUse: c.whenToUse ?? [],
	antiPatterns: c.antiPatterns ?? [],
	capacity: c.capacity ?? null,
}));
const BY_NAME = new Map(CATALOG.map((c) => [c.name, c]));

const cases = buildFitCorpus(CATALOG)
	.filter((c) => c.split === 'test' && c.note === 'selection')
	.slice(0, LIMIT ?? undefined);

if (!KEY) {
	console.error('no OPEN_ROUTER_KEY in env — judge eval skipped');
	process.exit(2);
}
// Budget guardrail (HARD RULE #24): spending OUR key is opt-in and cost-visible, never accidental.
if (process.env.OPENROUTER_ALLOW_SPEND !== '1') {
	console.error(
		'This eval SPENDS real OpenRouter credits on OUR key.\n' +
			`  plan: ${cases.length} case(s) x 1 call x ${MODEL}, K=${K} candidates each, up to ${MAX_TOK} output tokens.\n` +
			// ~380 input tokens per candidate, MEASURED on a --limit 1 run rather than guessed
			// (the first estimate here said 90 and was four times under).
			`  ~${((cases.length * K * 380) / 1000).toFixed(0)}k input + ~${((cases.length * MAX_TOK) / 1000).toFixed(1)}k output tokens max.\n` +
			'  Validate first on a tiny sample: --limit 1. Set a per-key spend cap at https://openrouter.ai/settings/keys.\n' +
			'  Re-run with OPENROUTER_ALLOW_SPEND=1 to proceed.',
	);
	process.exit(2);
}

// The shipped retriever, bundled from source so this measures what users get.
const tmp = mkdtempSync(join(tmpdir(), 'judge-eval-'));
const outFile = join(tmp, 'intent.mjs');
execFileSync('npx', ['esbuild', join(ROOT, 'docs/src/lib/intent-search.ts'), '--bundle', '--format=esm', `--outfile=${outFile}`, '--log-level=error'], {
	cwd: join(ROOT, 'docs'),
	stdio: ['ignore', 'ignore', 'inherit'],
});
const intent = await import(pathToFileURL(outFile).href);
const index = intent.buildIntentIndex(CATALOG);
const retrieve = (q) => intent.scoreIntent(index, q).slice(0, K).map((h) => h.name);

/**
 * One candidate, as the manifest describes it — the authored notes are the point.
 *
 * `excludeKey` drops the single note the QUERY was derived from. This is not a nicety: the
 * benchmark's questions ARE manifest notes, so without it the model is handed the answer
 * verbatim. Caught only because a debug dump showed the model saying so out loud — "the task
 * description is literally copied from the actors 'use when' note". The BM25 index had been
 * excluding it since the beginning; the prompt had not, which would have scored a leak.
 */
function candidateBlock(name, excludeKey) {
	const c = BY_NAME.get(name);
	if (!c) return '';
	const notes = (list, label, kind) => {
		const kept = list.map((n, i) => ({ n, i })).filter(({ i }) => excludeKey !== `${c.name}:${kind}:${i}`);
		return kept.length ? `\n  ${label}: ${kept.slice(0, 3).map(({ n }) => `${n.title ?? ''} — ${n.body ?? ''}`.trim()).join(' | ')}` : '';
	};
	const cap = c.capacity ? `\n  capacity: ${c.capacity.axis ?? 'item'}s, sweet ${c.capacity.sweet ?? '?'}, hard ${c.capacity.hard ?? '?'}` : '';
	// The name stands ALONE on its line. The first cut wrote `- name (function)` and the
	// model dutifully echoed "roadmap (progression)" back as the identifier, which then
	// matched no candidate and was silently discarded — see the parse notes below.
	return `- ${c.name}\n  role: ${c.function}\n  ${c.description}${cap}${notes(c.whenToUse, 'use when', 'whenToUse')}${notes(c.antiPatterns, 'do NOT use when', 'antiPatterns')}`;
}

const SYSTEM =
	'You choose the slide component that best fits a described task. ' +
	'You are given the task and a shortlist of candidate components, each with its description, ' +
	'capacity limits, and the author\'s notes on when to use it and when NOT to. ' +
	'Weigh the "do NOT use when" notes as heavily as the "use when" notes — ruling a candidate OUT is as ' +
	'valuable as ruling one in. Reply with JSON only — {"ranked":["name","name",...]} listing every ' +
	'candidate, best fit first, using the exact names given. Do not explain your reasoning; the JSON ' +
	'object must be the entire reply.';

let inTok = 0;
let outTok = 0;
let parseFailures = 0;
let unmatched = 0;
let fellBack = 0;
async function judge(task, candidates, excludeKey) {
	const user = `TASK: ${task}\n\nCANDIDATES:\n${candidates.map((n) => candidateBlock(n, excludeKey)).join('\n')}`;
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
			response_format: { type: 'json_object' },
			max_tokens: MAX_TOK,
			temperature: 0,
		}),
	});
	if (!res.ok) {
		const detail = (await res.text()).slice(0, 200);
		// 402 = the key ran dry mid-run. That is an expected end, not a crash: the cases already
		// scored are real data and must survive. Anything else is a genuine fault.
		const err = new Error(`HTTP ${res.status}: ${detail}`);
		err.outOfCredit = res.status === 402;
		throw err;
	}
	const body = await res.json();
	inTok += body.usage?.prompt_tokens ?? 0;
	outTok += body.usage?.completion_tokens ?? 0;
	// PARSING IS WHERE THIS HARNESS LIED ONCE, so it is deliberately defensive AND loud.
	// The first full run reported "0 changed verdicts" across 80 cases — not because the model
	// agreed with BM25, but because `response_format: json_object` still came back wrapped in a
	// ```json fence, JSON.parse threw, and the catch fell back to the BM25 order. A silent
	// fallback that looks exactly like "no effect" is the worst possible failure for an
	// experiment, so unmatched responses are now COUNTED and printed.
	// Take the LAST parsable {"ranked":[…]} object in the reply. Models fence their JSON, narrate
	// around it, and sometimes emit a correction ("wait, X wasn't in the list — let me redo that"),
	// so requiring the whole content to be JSON fails on perfectly good answers, and taking the
	// first block would keep the one the model itself retracted.
	const text = String(body.choices?.[0]?.message?.content ?? '');
	let ranked = [];
	for (const m of text.matchAll(/\{[\s\S]*?"ranked"[\s\S]*?\]\s*\}/g)) {
		try {
			const parsed = JSON.parse(m[0]);
			if (Array.isArray(parsed.ranked)) ranked = parsed.ranked;
		} catch {
			/* keep scanning — a truncated tail block is expected */
		}
	}
	if (!ranked.length) parseFailures++;
	// Normalize before matching: the model may return "roadmap (progression)", "`roadmap`" or
	// "1. roadmap" however firmly the prompt asks for a bare name.
	const canon = (v) => String(v).trim().toLowerCase().replace(/^\d+[.)]\s*/, '').replace(/[`"']/g, '').replace(/\s*\(.*$/, '').trim();
	const byCanon = new Map(candidates.map((n) => [n.toLowerCase(), n]));
	const valid = [];
	for (const r of ranked) {
		const hit = byCanon.get(canon(r));
		if (hit && !valid.includes(hit)) valid.push(hit);
	}
	if (ranked.length && !valid.length) unmatched++;
	if (!valid.length) fellBack++;
	// Append anything the model dropped so both rankers are scored over the same set.
	return [...new Set([...valid, ...candidates])];
}

const score = { retrievedRecall: 0, bm25Top1: 0, judgeTop1: 0, bm25Top3: 0, judgeTop3: 0, bm25Avoid: 0, judgeAvoid: 0, avoidable: 0 };
const flips = [];

let completed = 0;
let stoppedEarly = '';
for (const [i, c] of cases.entries()) {
	const shortlist = retrieve(c.query);
	const inList = shortlist.some((n) => c.expect.includes(n));
	if (inList) score.retrievedRecall++;

	let judged;
	try {
		judged = await judge(c.query, shortlist, c.excludeKey);
	} catch (err) {
		stoppedEarly = err.outOfCredit
			? `out of OpenRouter credit after ${completed} of ${cases.length} cases — top up the key and re-run`
			: `call failed after ${completed} of ${cases.length} cases: ${err.message}`;
		break;
	}
	completed++;
	const rankOf = (list) => list.findIndex((n) => c.expect.includes(n));
	const badOf = (list) => list.findIndex((n) => c.avoid.includes(n));
	const b = rankOf(shortlist);
	const j = rankOf(judged);
	if (b === 0) score.bm25Top1++;
	if (j === 0) score.judgeTop1++;
	if (b >= 0 && b < 3) score.bm25Top3++;
	if (j >= 0 && j < 3) score.judgeTop3++;
	if (c.avoid.length) {
		score.avoidable++;
		const bb = badOf(shortlist);
		const jb = badOf(judged);
		if (bb === -1 || (b >= 0 && b < bb)) score.bm25Avoid++;
		if (jb === -1 || (j >= 0 && j < jb)) score.judgeAvoid++;
	}
	if ((b === 0) !== (j === 0)) flips.push(`${j === 0 ? 'FIXED  ' : 'BROKE  '} ${c.query.slice(0, 62)} → bm25:${shortlist[0]} judge:${judged[0]}`);
	if ((i + 1) % 10 === 0) process.stdout.write(`  …${i + 1}/${cases.length}\n`);
}

if (!completed) {
	console.log(`\n⚠ NO cases completed — ${stoppedEarly || 'unknown reason'}. Nothing measured.`);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(2);
}
const n = completed;
const pct = (x) => `${((x / n) * 100).toFixed(1)}%`.padStart(6);
if (stoppedEarly) {
	console.log(`\n⚠ STOPPED EARLY — ${stoppedEarly}`);
	console.log(`  Everything below covers the ${completed} completed case(s) only, not the ${cases.length} planned.`);
}
console.log(`\nmodel ${MODEL} · K=${K} · ${completed} of ${cases.length} held-out selection cases\n`);
console.log(`retrieval recall@${K}  ${pct(score.retrievedRecall)}   ← the judge's ceiling; it can only rank what BM25 surfaced\n`);
console.log(`${'ranker'.padEnd(10)}  top1    top3    avoided-the-wrong-one`);
console.log(`${'BM25'.padEnd(10)}${pct(score.bm25Top1)}  ${pct(score.bm25Top3)}   ${score.avoidable ? `${((score.bm25Avoid / score.avoidable) * 100).toFixed(1)}%` : 'n/a'}`);
console.log(`${'+ judge'.padEnd(10)}${pct(score.judgeTop1)}  ${pct(score.judgeTop3)}   ${score.avoidable ? `${((score.judgeAvoid / score.avoidable) * 100).toFixed(1)}%` : 'n/a'}`);

console.log(`\nchanged verdicts (${flips.length}):`);
for (const f of flips.slice(0, 20)) console.log(`  ${f}`);

// Cost, printed always — a spender that hides what it spent is the thing HARD RULE #24 forbids.
// Health of the harness itself, printed before the cost. A high fell-back count means the
// comparison above is measuring BM25 against BM25 and the verdict is worthless.
console.log(`\nharness: ${parseFailures} unparsable response(s) · ${unmatched} parsed-but-unmatched · ${fellBack} fell back to BM25 order`);
if (fellBack > n * 0.1) console.log('  ⚠ more than 10% fell back — the judge column is NOT a real measurement.');
console.log(`\ntokens: ${inTok} in / ${outTok} out over ${n} call(s) · ~${Math.round(inTok / n)} in per query`);
console.log('cost: see https://openrouter.ai/activity for the exact charge on this key.');
rmSync(tmp, { recursive: true, force: true });
