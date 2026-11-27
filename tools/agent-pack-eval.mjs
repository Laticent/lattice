#!/usr/bin/env node
/**
 * agent-pack-eval — does the agent pack make a model write a good deck?
 *
 * engineering/decisions/2026-11-17-agent-pack.md §4.5 and §4.9. A model gets ONE pack file as its
 * system prompt and a fixed brief, writes a deck, and the deck goes through the same machinery a
 * human's would: `lint:deck` and a real render through `dist/lattice.js`. Three arms:
 *
 *   start      dist/agent-kit/start.md                            one turn  (default anthropic/claude-sonnet-5.5)
 *   small      dist/agent-kit/paste/lattice-instructions-solo.md  one turn  (default anthropic/claude-haiku-5.5)
 *   retrieval  dist/agent-kit/start.md                            two turns: the model may name up to six kit
 *              files start.md links to (`READ: ./agents/layouts.md`), the harness serves them from
 *              dist/agent-kit, and the model then writes the deck  (default anthropic/claude-sonnet-5.5)
 *
 * A deck PASSES when it lints with zero errors and zero warnings, renders, reports no overflow,
 * has 6 to 16 slides, uses at least four different layouts, and carries no `marp: true`.
 * Suggestions are reported, not failed: they are taste, and the canon already asks for them.
 *
 * Usage:  OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/agent-pack-eval.mjs
 *           [--arm start|small|retrieval] [--model <openrouter id>|nightly] [--limit <n>] [--repeat <n>]
 *           [--temperature <t>] [--max-usd <n>] [--old <start.md> [--new <start.md>]] [--probe] [--out <dir>]
 *         node tools/agent-pack-eval.mjs --judge deck.md [--out <dir>]
 *           (judge one deck, no model call; its PDF goes to --out, never beside the deck)
 *         node tools/agent-pack-eval.mjs --nightly-model   (print tonight's model: Haiku and DeepSeek by day parity)
 *
 *   --max-usd   a hard cap, USD 1 by default. Before each deck (each PAIR in paired mode) the tool adds the
 *               worst case of its calls, priced from OpenRouter's public /api/v1/models list, to what
 *               OpenRouter reported spending so far, and stops if that would cross the cap. The worst case
 *               counts every 2 bytes of prompt as a token and every reply as max_tokens long, so a stop
 *               comes early, never late.
 *   --old       PAIRED mode: each brief and repeat runs once on the old start.md and once on the new one
 *               (--new, default dist/agent-kit/start.md), on the SAME model; one model per run, never mixed.
 *               The arm must be start or retrieval. The retrieval arm serves the CURRENT kit to both.
 *   --repeat    runs each brief n times, with seed = repeat index; pass --temperature above 0, or the
 *               repeats only measure the provider's own nondeterminism.
 *   --probe     one max_tokens-1 call per system file: what the prompt costs in tokens on this model (R0).
 *               Anthropic and Gemini have free token counters; use this only where none exists.
 *
 * Per-release check on a capable model (10 decks, about USD 0.45; RELEASE.md): dispatch the nightly
 * workflow with arm=retrieval model=anthropic/claude-sonnet-5.5 max_usd=0.75.
 *
 * Spends OUR OpenRouter key (HARD RULE #24): opt-in only, never on the PR path. Without
 * OPENROUTER_ALLOW_SPEND=1 it prints its plan and worst-case cost and exits 0. CI runs it from
 * .github/workflows/agent-pack-eval-nightly.yml, a sanctioned nightly + dispatch workflow.
 * Writes every deck, its PDF, summary.json (one row per deck) and summary.md (the table) to --out.
 *
 * Exit: 0 every deck passed (or a dry run), 1 a deck failed, 2 no key, no built kit or a bad option,
 * 3 stopped at the --max-usd cap before the plan finished.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classEntries } from '../lib/core/class-entries.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KIT = path.join(ROOT, 'dist', 'agent-kit');
/** Where the decks, their PDFs and summary.json go unless `--out` says otherwise. Never beside a committed deck. */
export const DEFAULT_OUT = path.join(ROOT, '.scratch', 'agent-pack-eval');
const API = 'https://openrouter.ai/api/v1';

/** OpenRouter ids, checked against the live catalog on 2026-11-27. */
export const MODELS = {
  sonnet: 'anthropic/claude-sonnet-5.5',
  haiku: 'anthropic/claude-haiku-5.5',
  deepseek: 'deepseek/deepseek-v4.1-flash',
};

export const ARMS = {
  start: { file: 'start.md', model: process.env.AGENT_PACK_MODEL || MODELS.sonnet, turns: 1 },
  small: { file: 'paste/lattice-instructions-solo.md', model: process.env.AGENT_PACK_SMALL_MODEL || MODELS.haiku, turns: 1 },
  retrieval: { file: 'start.md', model: process.env.AGENT_PACK_MODEL || MODELS.sonnet, turns: 2 },
};

const MAX_TOKENS = 6000;
/** The retrieval arm serves at most this many files, and at most this many bytes of them in all. */
export const SERVE_MAX_FILES = 6;
export const SERVE_MAX_BYTES = 160_000;

/**
 * The model for tonight's run: Haiku on even days since the epoch (UTC), DeepSeek on odd ones. The owner's
 * call (desk session_015KSkL4AtPNjvKkBShG56Nu, 2026-11-27): alternate the two, never both on one run.
 * Days since the epoch, not day of the year, so the year end never puts the same model on two nights.
 */
export function nightlyModel(date = new Date()) {
  return Math.floor(date.getTime() / 86_400_000) % 2 === 0 ? MODELS.haiku : MODELS.deepseek;
}

/** Three briefs, three registers: a board ask, a teaching deck, a data-led review. Fixed, so nights compare. */
export const BRIEFS = [
  {
    slug: 'board-ask',
    text:
      'Write a deck for a board meeting. Our company wants approval to open a second warehouse in Rotterdam. ' +
      'Facts: current warehouse in Antwerp runs at 94% capacity; EU orders grew 41% this year to 2.3M; ' +
      'average delivery time to Germany is 3.8 days against a 2-day target; the Rotterdam site costs EUR 6.2M ' +
      'to fit out and EUR 1.9M a year to run; payback is 26 months; the alternative was expanding Antwerp ' +
      '(EUR 4.1M, but it only adds 12% capacity and does not fix delivery times). We need a decision this quarter.',
  },
  {
    slug: 'teaching',
    text:
      'Write a deck for a 30-minute lesson to new engineers on how our code review works. Points: every change ' +
      'needs one approving review; reviewers answer within one working day; the author resolves every comment ' +
      'or says why not; small changes (under 400 lines) get reviewed twice as fast; the three most common ' +
      'review findings are missing tests, unclear names and unhandled errors; and a checklist they can use ' +
      'before asking for review.',
  },
  {
    slug: 'data-review',
    text:
      'Write a quarterly support review deck. Numbers for Q3: 18,400 tickets (Q2: 15,900); median first ' +
      'response 2.1 hours (target 2.0); customer satisfaction 91% (Q2: 88%); tickets by channel: email 52%, ' +
      'chat 31%, phone 17%; top three causes: login problems 24%, billing questions 19%, export errors 11%. ' +
      'Recommend one change for Q4.',
  },
];

/** The user turn every arm opens with. */
export const DECK_ASK = 'Reply with the complete deck as one Markdown file and nothing else.';
export const RETRIEVAL_ASK =
  `You may read the kit files start.md links to before you write. To read some, reply with nothing but one line per file, ` +
  `\`READ: <path as start.md links it>\`, at most ${SERVE_MAX_FILES} files. Otherwise ${DECK_ASK.charAt(0).toLowerCase()}${DECK_ASK.slice(1)}`;

/**
 * The deck in a model's reply. A reply that starts with front matter is the deck. Otherwise the
 * deck is the first ```markdown (or ```md, or bare) fence, taken to the LAST line that closes
 * it with the same backtick run: a lazy match stopped at the deck's own first code or mermaid
 * fence and judged half a deck.
 */
export function deckFrom(reply) {
  // A model reply is external input: strip a BOM and fold CRLF and lone CR before `^---` is tested.
  const text = String(reply).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (/^---\n/.test(text.trimStart())) return `${text.trim()}\n`;
  const lines = text.split('\n');
  // Walk fences in pairs, so a ```yaml block's closing line is never read as the deck's opening.
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^(`{3,})([\w-]*)[ \t]*$/);
    if (!f) continue;
    if (['', 'markdown', 'md'].includes(f[2])) {
      open = i;
      break;
    }
    const end = lines.findIndex((l, j) => j > i && l.trim() === f[1]);
    if (end === -1) break;
    i = end;
  }
  if (open === -1) return `${text.trim()}\n`;
  const ticks = lines[open].match(/^`+/)[0];
  let close = -1;
  for (let i = lines.length - 1; i > open; i--) {
    if (lines[i].trim() === ticks) {
      close = i;
      break;
    }
  }
  const body = lines.slice(open + 1, close === -1 ? lines.length : close).join('\n');
  return `${body.trim()}\n`;
}

/**
 * The kit files a retrieval-arm reply asks for: its `READ: <path>` lines. A reply that already holds a deck
 * (front matter or a fence) asks for nothing, so a model that writes straight away gets judged on its deck.
 */
export function readRequests(reply) {
  const text = String(reply).replace(/\r\n?/g, '\n').trim();
  if (/^---\n/.test(text) || /^```/m.test(text)) return [];
  const asks = [...text.matchAll(/^\s*[-*]?\s*`?READ:\s*`?\s*([^\s`]+)`?\s*$/gim)].map((m) => m[1]);
  return [...new Set(asks)].slice(0, SERVE_MAX_FILES);
}

/**
 * Serve the asked-for files from the kit folder: an anchor (`#…`) and a leading `./` are dropped, and a path
 * that leaves the kit, or names no file in it, is answered with a note rather than read.
 */
export function serveKitFiles(asks, kitDir = KIT) {
  let budget = SERVE_MAX_BYTES;
  const served = [];
  const parts = asks.slice(0, SERVE_MAX_FILES).map((ask) => {
    const rel = ask.replace(/#.*$/, '').replace(/^\.\//, '');
    const full = path.resolve(kitDir, rel);
    const inside = path.relative(kitDir, full);
    if (!rel || inside.startsWith('..') || path.isAbsolute(inside)) return `## ${ask}\n\n(not served: outside the kit)`;
    if (!existsSync(full)) return `## ${ask}\n\n(not served: no such file in the kit)`;
    let body = readFileSync(full, 'utf8');
    const bytes = Buffer.from(body);
    if (bytes.length > budget) body = `${bytes.subarray(0, budget).toString('utf8')}\n\n(cut: the served files reached ${SERVE_MAX_BYTES} bytes)`;
    budget -= Math.min(budget, bytes.length);
    served.push(rel);
    return `## ${rel}\n\n${body}`;
  });
  return { served, text: `${parts.join('\n\n')}\n\nNow write the deck. ${DECK_ASK}` };
}

/** OpenRouter's public price list (no key needed): model id → USD per prompt and per completion token. */
export async function loadPrices(fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/models`);
  if (!res.ok) throw new Error(`OpenRouter /models ${res.status}`);
  const j = await res.json();
  return new Map(j.data.map((m) => [m.id, { in: Number(m.pricing.prompt), out: Number(m.pricing.completion) }]));
}

const bytesOf = (messages) => messages.reduce((n, m) => n + Buffer.byteLength(m.content), 0);
/** The most one call can cost: every 2 bytes of prompt a token, the reply as long as max_tokens allows. */
export function worstCase(promptBytes, maxTokens, price) {
  return Math.ceil(promptBytes / 2) * price.in + maxTokens * price.out;
}

/** One chat completion. Returns what OpenRouter reported; a call cut at max_tokens returns, so its cost still counts. */
export async function complete({ model, messages, maxTokens = MAX_TOKENS, temperature = 0, seed }, { fetchImpl = fetch, now = Date.now } = {}) {
  const t0 = now();
  const res = await fetchImpl(`${API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPEN_ROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, ...(seed === undefined ? {} : { seed }), usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const cost = j.usage?.cost;
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    finish: j.choices?.[0]?.finish_reason ?? null,
    tokensIn: Number(j.usage?.prompt_tokens ?? 0),
    tokensOut: Number(j.usage?.completion_tokens ?? 0),
    cost: Number(cost ?? 0),
    costReported: cost !== undefined && cost !== null,
    latencyMs: now() - t0,
  };
}

function judge(deckPath, pdfPath) {
  const deck = readFileSync(deckPath, 'utf8');
  const lint = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'lint-deck.js'), '--json', deckPath], { encoding: 'utf8' });
  let findings = [];
  let review = [];
  try {
    const parsed = JSON.parse(lint.stdout);
    findings = parsed.findings;
    review = parsed.reviewFindings ?? [];
  } catch {
    findings = [{ severity: 'error', rule: 'lint-crashed', slide: 0 }];
  }
  const render = spawnSync(process.execPath, [path.join(ROOT, 'dist', 'lattice.js'), deckPath, pdfPath], { encoding: 'utf8' });
  const renderOut = `${render.stdout}\n${render.stderr}`;
  // The first word of every spot class the deck sets, comment or record (`@meta{layout=…}`): the shared reader.
  const classes = classEntries(deck).filter((e) => e.spot).map((e) => e.value.trim().split(/\s+/)[0]).filter(Boolean);
  // The renderer's own count: a slide with no `_class` still counts, and a `_class` quoted in a
  // code fence does not. The `_class` count is the fallback when the render failed.
  const rendered = renderOut.match(/(\d+) slides? →/);
  const slides = rendered ? Number(rendered[1]) : classes.length;
  const problems = [];
  const errs = findings.filter((f) => f.severity === 'error' || f.severity === 'warning');
  for (const f of errs) problems.push(`slide ${f.slide}: ${f.severity} ${f.rule}`);
  if (render.status !== 0 || !existsSync(pdfPath)) problems.push(`render failed: ${renderOut.trim().split('\n').slice(-2).join(' ')}`);
  if (/OVERFLOW/.test(renderOut)) problems.push('render reports overflow');
  if (/CONTENT CLIPPED/.test(renderOut)) problems.push('render reports clipped content');
  if (slides < 6 || slides > 16) problems.push(`${slides} slides (want 6 to 16)`);
  if (new Set(classes).size < 4) problems.push(`only ${new Set(classes).size} different layouts`);
  if (/^marp:\s*true/m.test(deck)) problems.push('carries marp: true');
  return {
    slides,
    layouts: [...new Set(classes)],
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    suggestions: findings.filter((f) => f.severity === 'suggestion').length + review.length,
    problems,
  };
}

/** Parse the command line into run options. Throws on a bad value: the caller exits 2. */
export function parseArgs(argv, date = new Date()) {
  const has = (n) => argv.includes(n);
  const val = (n, fallback) => {
    const i = argv.indexOf(n);
    if (i === -1) return fallback;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${n} needs a value`);
    return v;
  };
  const num = (n, fallback, ok) => {
    const v = Number(val(n, fallback));
    if (!Number.isFinite(v) || !ok(v)) throw new Error(`${n} ${val(n, fallback)} is out of range`);
    return v;
  };
  const arms = val('--arm') ? [val('--arm')] : ['start', 'small'];
  for (const a of arms) if (!ARMS[a]) throw new Error(`unknown arm ${a}; one of ${Object.keys(ARMS).join(', ')}`);
  let model = val('--model');
  if (model === 'nightly') model = nightlyModel(date);
  const old = val('--old');
  if (old && arms.some((a) => ARMS[a].file !== 'start.md')) throw new Error('--old compares start.md: pass --arm start or --arm retrieval');
  if (has('--new') && !old) throw new Error('--new needs --old');
  return {
    arms,
    model,
    limit: num('--limit', BRIEFS.length, (v) => Number.isInteger(v) && v >= 1),
    repeat: num('--repeat', 1, (v) => Number.isInteger(v) && v >= 1),
    temperature: num('--temperature', 0, (v) => v >= 0 && v <= 2),
    maxUsd: num('--max-usd', 1, (v) => v > 0),
    old: old ? path.resolve(old) : null,
    new: val('--new') ? path.resolve(val('--new')) : null,
    probe: has('--probe'),
    out: path.resolve(val('--out', DEFAULT_OUT)),
  };
}

/** The decks (or probes) a run makes, in order. In paired mode the old and new decks of one brief and repeat form one unit. */
export function plan(opts, kitDir = KIT, read = (f) => readFileSync(f, 'utf8')) {
  const units = [];
  for (const arm of opts.arms) {
    const model = opts.model || ARMS[arm].model;
    const variants = opts.old
      ? [
          { variant: 'old', system: read(opts.old) },
          { variant: 'new', system: read(opts.new || path.join(kitDir, ARMS[arm].file)) },
        ]
      : [{ variant: null, system: read(path.join(kitDir, ARMS[arm].file)) }];
    if (opts.probe) {
      units.push(variants.map((v) => ({ ...v, arm, model, probe: true, brief: null, repeat: 0 })));
      continue;
    }
    for (const b of BRIEFS.slice(0, opts.limit)) {
      for (let r = 0; r < opts.repeat; r++) units.push(variants.map((v) => ({ ...v, arm, model, brief: b, repeat: r })));
    }
  }
  return units;
}

const firstUser = (job) => (job.probe ? 'Reply OK.' : `${job.brief.text}\n\n${ARMS[job.arm].turns === 2 ? RETRIEVAL_ASK : DECK_ASK}`);

/** The worst case of a job's FIRST call. A retrieval deck's second call is checked when its prompt is known. */
export function firstCallWorstCase(job, price) {
  return worstCase(Buffer.byteLength(job.system) + Buffer.byteLength(firstUser(job)), job.probe ? 1 : MAX_TOKENS, price);
}

/**
 * The worst case of every call a job could make: the plan's ceiling, printed on a dry run. The second
 * retrieval turn re-sends the first, the whole first reply (at most max_tokens; 4 bytes a token is
 * generous), the served files, and up to 2,000 bytes of headers, notes and the closing ask.
 */
export function jobWorstCase(job, price) {
  const first = Buffer.byteLength(job.system) + Buffer.byteLength(firstUser(job));
  let usd = firstCallWorstCase(job, price);
  if (!job.probe && ARMS[job.arm].turns === 2) usd += worstCase(first + MAX_TOKENS * 4 + SERVE_MAX_BYTES + 2000, MAX_TOKENS, price);
  return usd;
}

/** Thrown when the next call could cross --max-usd: the run stops there. */
export class CapStop extends Error {}

/** Run one job: its call(s), and the judge on the deck. Returns its row. */
async function runJob(job, opts, deps, spent) {
  const base = path.join(opts.out, [job.arm, job.variant, job.brief?.slug ?? 'probe', `r${job.repeat}`].filter(Boolean).join('-'));
  const row = {
    model: job.model,
    arm: job.arm,
    variant: job.variant,
    brief: job.brief?.slug ?? null,
    repeat: job.repeat,
    calls: 0,
    fetched: [],
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    latencyMs: 0,
  };
  const call = async (messages, maxTokens) => {
    const ceiling = worstCase(bytesOf(messages), maxTokens, deps.price);
    if (spent.usd + ceiling > opts.maxUsd) throw new CapStop(`USD ${spent.usd.toFixed(4)} spent; the next call could cost up to USD ${ceiling.toFixed(4)}, past the USD ${opts.maxUsd} cap`);
    const r = await deps.complete({ model: job.model, messages, maxTokens, temperature: opts.temperature, seed: job.repeat }, deps);
    row.calls++;
    row.tokensIn += r.tokensIn;
    row.tokensOut += r.tokensOut;
    // A cost OpenRouter did not report is counted at its worst case: the cap stays a cap.
    const usd = r.costReported ? r.cost : worstCase(bytesOf(messages), maxTokens, deps.price);
    row.cost += usd;
    spent.usd += usd;
    row.latencyMs += r.latencyMs;
    return r;
  };
  const messages = [
    { role: 'system', content: job.system },
    { role: 'user', content: firstUser(job) },
  ];
  try {
    if (job.probe) {
      await call(messages, 1);
      return { ...row, pass: null, problems: [] };
    }
    let reply = await call(messages, MAX_TOKENS);
    if (ARMS[job.arm].turns === 2) {
      const asks = readRequests(reply.text);
      if (asks.length) {
        const { served, text } = serveKitFiles(asks, deps.kitDir);
        row.fetched = served;
        reply = await call([...messages, { role: 'assistant', content: reply.text }, { role: 'user', content: text }], MAX_TOKENS);
      }
    }
    mkdirSync(opts.out, { recursive: true });
    writeFileSync(`${base}.md`, deckFrom(reply.text));
    // A reply cut off at max_tokens is a truncated deck: say so rather than judge half of it.
    if (reply.finish === 'length') return { ...row, slides: 0, layouts: [], errors: 0, warnings: 0, suggestions: 0, pass: false, problems: [`reply hit max_tokens (${reply.tokensOut} tokens)`] };
    const verdict = deps.judgeFn(`${base}.md`, `${base}.pdf`);
    return { ...row, ...verdict, pass: verdict.problems.length === 0 };
  } catch (e) {
    // A capped deck is not a failed one: it carries no verdict, and the run stops after it.
    if (e instanceof CapStop) return { ...row, slides: 0, layouts: [], errors: 0, warnings: 0, suggestions: 0, pass: null, capped: true, problems: [`stopped at the cap: ${e.message}`] };
    return { ...row, slides: 0, layouts: [], errors: 0, warnings: 0, suggestions: 0, pass: false, problems: [`request failed: ${e.message}`] };
  }
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** One row per (model, arm, variant): sample size, pass rate, means. Paired runs add the pair outcomes. */
export function aggregate(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = [r.model, r.arm, r.variant ?? ''].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const table = [...groups.values()].map((g) => ({
    model: g[0].model,
    arm: g[0].arm,
    variant: g[0].variant,
    n: g.length,
    passed: g.filter((r) => r.pass).length,
    meanErrors: mean(g.map((r) => r.errors ?? 0)),
    meanWarnings: mean(g.map((r) => r.warnings ?? 0)),
    meanTokensIn: mean(g.map((r) => r.tokensIn)),
    meanTokensOut: mean(g.map((r) => r.tokensOut)),
    fetchedAny: g.filter((r) => r.fetched?.length).length,
    cost: g.reduce((a, r) => a + r.cost, 0),
    medianLatencyMs: median(g.map((r) => r.latencyMs)),
  }));
  const byPair = new Map();
  for (const r of rows.filter((x) => x.variant && x.pass !== null)) {
    const k = [r.model, r.arm, r.brief, r.repeat].join('|');
    if (!byPair.has(k)) byPair.set(k, {});
    byPair.get(k)[r.variant] = r.pass;
  }
  const pairs = [...byPair.values()].filter((p) => 'old' in p && 'new' in p);
  const paired = pairs.length
    ? {
        pairs: pairs.length,
        both: pairs.filter((p) => p.old && p.new).length,
        oldOnly: pairs.filter((p) => p.old && !p.new).length,
        newOnly: pairs.filter((p) => !p.old && p.new).length,
        neither: pairs.filter((p) => !p.old && !p.new).length,
      }
    : null;
  return { table, paired };
}

/** The summary as a short Markdown table (it also goes to the workflow's step summary). */
export function markdownTable(summary) {
  const usd = (n) => n.toFixed(4);
  const lines = [
    `### Agent pack eval, ${summary.date.slice(0, 10)}: exploratory, n per row below`,
    '',
    '| model | arm | start.md | n | passed | errors (mean) | warnings (mean) | tokens in (mean) | tokens out (mean) | fetched | USD | latency (median s) |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...summary.aggregate.table.map(
      (g) =>
        `| ${g.model} | ${g.arm} | ${g.variant ?? 'current'} | ${g.n} | ${g.passed} | ${g.meanErrors.toFixed(1)} | ${g.meanWarnings.toFixed(1)} | ${Math.round(g.meanTokensIn)} | ${Math.round(g.meanTokensOut)} | ${g.fetchedAny} | ${usd(g.cost)} | ${(g.medianLatencyMs / 1000).toFixed(1)} |`,
    ),
  ];
  const p = summary.aggregate.paired;
  if (p) lines.push('', `Pairs (same model, brief and repeat): ${p.pairs}; both pass ${p.both}, old only ${p.oldOnly}, new only ${p.newOnly}, neither ${p.neither}.`);
  lines.push('', `Spent USD ${usd(summary.cost)} of a USD ${summary.maxUsd} cap${summary.stoppedAtCap ? `; STOPPED at the cap after ${summary.rows.filter((r) => !r.capped).length} of ${summary.planned}` : ''}.`);
  return `${lines.join('\n')}\n`;
}

/**
 * The whole run. `deps` is the seam the tests use: `fetchImpl` (the network), `complete`, `judgeFn` (the
 * render), `now`, `log`, `kitDir`, and `allowSpend` / `hasKey` (read from the environment by default, so a test
 * never names or sets the key). Returns the exit code.
 */
export async function run(opts, deps = {}) {
  const d = { fetchImpl: fetch, complete, judgeFn: judge, now: Date.now, log: console.log, kitDir: KIT, allowSpend: process.env.OPENROUTER_ALLOW_SPEND === '1', hasKey: Boolean(process.env.OPEN_ROUTER_KEY), ...deps };
  for (const a of opts.arms) {
    if (!existsSync(path.join(d.kitDir, ARMS[a].file))) {
      console.error(`missing ${path.join(d.kitDir, ARMS[a].file)}: run \`npm run build\` first.`);
      return 2;
    }
  }
  for (const f of [opts.old, opts.new].filter(Boolean)) {
    if (!existsSync(f)) {
      console.error(`missing ${f}`);
      return 2;
    }
  }
  const units = plan(opts, d.kitDir);
  const jobs = units.flat();
  const models = [...new Set(jobs.map((j) => j.model))];
  let prices;
  try {
    prices = await loadPrices(d.fetchImpl);
  } catch (e) {
    console.error(`cannot price the run (${e.message}): without prices there is no cap, so nothing ran.`);
    return 2;
  }
  for (const m of models) {
    if (!prices.has(m)) {
      console.error(`${m} is not in OpenRouter's model list: check the id.`);
      return 2;
    }
  }
  const worst = jobs.reduce((a, j) => a + jobWorstCase(j, prices.get(j.model)), 0);
  d.log(
    `agent-pack-eval: ${jobs.length} ${opts.probe ? 'probe(s)' : 'deck(s)'} on ${models.join(', ')}` +
      `${opts.old ? ' (paired: old vs new start.md)' : ''}, temperature ${opts.temperature}; cap USD ${opts.maxUsd}. Ceiling if every reply ran ` +
      `to ${MAX_TOKENS} tokens and every retrieval read ${SERVE_MAX_BYTES / 1000} KB: USD ${worst.toFixed(4)}; the real figure is OpenRouter's, printed at the end.`,
  );
  if (!d.allowSpend) {
    d.log('Dry run: set OPENROUTER_ALLOW_SPEND=1 to spend OUR OpenRouter key and run it.');
    return 0;
  }
  if (!d.hasKey) {
    console.error('no OPEN_ROUTER_KEY in the environment: the eval did not run.');
    return 2;
  }
  mkdirSync(opts.out, { recursive: true });
  const rows = [];
  const spent = { usd: 0 };
  let stoppedAtCap = false;
  for (const unit of units) {
    if (stoppedAtCap) break;
    // A pair's first calls are checked together, so a stop between pairs never leaves an old deck
    // without its new one. Every call is checked again just before it goes (runJob); a pair a second
    // retrieval turn cuts short is left out of the pair counts.
    const need = unit.reduce((a, j) => a + firstCallWorstCase(j, prices.get(j.model)), 0);
    if (spent.usd + need > opts.maxUsd) {
      stoppedAtCap = true;
        d.log(`STOP: USD ${spent.usd.toFixed(4)} spent; the next ${unit.length > 1 ? 'pair' : 'deck'}'s first call(s) could cost up to USD ${need.toFixed(4)}, past the USD ${opts.maxUsd} cap.`);
      break;
    }
    for (const job of unit) {
      const row = await runJob(job, opts, { ...d, price: prices.get(job.model) }, spent);
      if (row.capped) {
        stoppedAtCap = true;
        d.log(`STOP: ${row.problems[0]}.`);
        rows.push(row);
        break;
      }
      rows.push(row);
      const what = [row.arm, row.variant, row.brief ?? 'probe', `r${row.repeat}`].filter(Boolean).join(' ');
      if (job.probe) d.log(`probe ${what}: ${row.tokensIn} prompt tokens, USD ${row.cost.toFixed(5)}`);
      else
        d.log(
          `${row.pass ? 'pass' : 'FAIL'}  ${what}: ${row.slides} slides, ${row.layouts.length} layouts, ${row.errors}e/${row.warnings}w/${row.suggestions}s, ` +
            `${row.tokensIn}→${row.tokensOut} tokens, USD ${row.cost.toFixed(4)}${row.fetched.length ? `, read ${row.fetched.join(' ')}` : ''}` +
            `${row.problems.length ? `\n      ${row.problems.join('\n      ')}` : ''}`,
        );
    }
  }
  const summary = {
    date: new Date(d.now()).toISOString(),
    models,
    temperature: opts.temperature,
    maxUsd: opts.maxUsd,
    cost: Number(spent.usd.toFixed(6)),
    planned: jobs.length,
    stoppedAtCap,
    passed: rows.filter((r) => r.pass).length,
    failed: rows.filter((r) => r.pass === false).length,
    aggregate: aggregate(rows.filter((r) => !r.capped)),
    rows,
  };
  writeFileSync(path.join(opts.out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const md = markdownTable(summary);
  writeFileSync(path.join(opts.out, 'summary.md'), md);
  d.log(`\n${md}\nDecks, PDFs, summary.json and summary.md in ${path.relative(ROOT, opts.out) || opts.out}.`);
  if (stoppedAtCap) return 3;
  return summary.failed ? 1 : 0;
}

// Run only as a script: a test imports the module without spending anything.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
/**
 * Judge one deck already on disk, with no model call: how the gate itself is tested. The PDF goes to `outDir`,
 * never beside the deck: judging a committed example once wrote over its golden (`examples/split-horizontal.pdf`).
 * `judgeFn` is the seam a test uses to see where the PDF would go without rendering.
 */
export function judgeOne(deckPath, outDir = DEFAULT_OUT, judgeFn = judge) {
  const deck = path.resolve(deckPath);
  const out = path.resolve(outDir);
  mkdirSync(out, { recursive: true });
  return judgeFn(deck, path.join(out, `${path.basename(deck, '.md')}.pdf`));
}

if (isMain && process.argv.includes('--judge')) {
  const i = process.argv.indexOf('--out');
  const deck = process.argv[process.argv.indexOf('--judge') + 1];
  console.log(JSON.stringify(judgeOne(deck, i === -1 ? DEFAULT_OUT : process.argv[i + 1]), null, 2));
  process.exit(0);
}

if (isMain && process.argv.includes('--nightly-model')) {
  console.log(nightlyModel());
  process.exit(0);
}

if (isMain) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`agent-pack-eval: ${e.message}`);
    process.exit(2);
  }
  run(opts).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
