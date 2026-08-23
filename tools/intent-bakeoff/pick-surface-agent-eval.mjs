#!/usr/bin/env node

/**
 * pick-surface-agent-eval.mjs — the pick-surface bake-off, as a harness rather than a
 * transcription.
 *
 * WHY THIS EXISTS (#1734). `engineering/decisions/2026-08-17-component-pick-surface.md`
 * reports that the 3.8k `components.pick.md` reaches the same picks as the 95k
 * `components.json` at roughly a quarter of the context. Every number in that note
 * recomputes exactly from `pick-surface-agent-runs.json` — and that file is a HAND
 * TRANSCRIPTION of what eight subagents returned. Recomputing it verifies the arithmetic
 * and nothing about provenance. Under HARD RULE #23 the surface was "four Opus subagents"
 * and the artifact was a human's copy of them: an honest report, not a reproducible
 * measurement. This script makes the picks re-runnable, so the claim can be re-earned
 * instead of re-argued.
 *
 * WHAT IT IS NOT — and read this before assuming it duplicates something.
 * `pick-surface-eval.mjs` (`intent:pick-eval`) answers a DIFFERENT question with a
 * LOCAL LEXICAL RANKER and no model at all: how much indexable retrieval signal survives
 * in a pick row. Its own header says so — "It does NOT measure how an agent actually
 * picks". `intent:judge` and `tools/component-gen-eval.mjs` do drive a model, but both
 * spend OUR OpenRouter key over the HTTP API and neither pins a reading surface. So
 * nothing here already spawns agents against a pinned surface (HARD RULE #15 checked
 * first, as the issue asked); this is the missing piece, not a second copy of one.
 *
 * HOW A SURFACE IS PINNED — a sandbox, and NO whole-tool Read grant.
 * Each agent runs with its working directory set to a fresh temp dir containing exactly
 * ONE file: a copy of the surface under test. The subtlety is what is NOT passed:
 *
 *     `Read` is deliberately absent from `--allowed-tools`.
 *
 * A first cut passed `--allowed-tools Read`, reasoning that the sandbox made the pin
 * physical. It did not, and the checker pass (HARD RULE #25) caught it. `--allowed-tools
 * Read` is a WHOLE-TOOL allow rule carrying no path specifier, and in the CLI's permission
 * pipeline such a rule is consulted AFTER the tool's own "outside the working directory"
 * verdict — which is `ask`, not `deny`, and is not terminal. The allow rule therefore wins
 * and the read is permitted. Measured on the real CLI, not reasoned: with
 * `--allowed-tools Read` an agent sitting in the sandbox read
 * `/home/user/lattice/package.json` and returned its `name`, and `permission_denials`
 * came back EMPTY — an escaped run the artifact would have recorded as a clean, pinned one.
 *
 * With the grant removed and the same prompt: the read is refused, the agent answers
 * `BLOCKED`, and `permission_denials` carries the attempted absolute path. In-sandbox
 * reads still succeed on working-directory containment alone (also measured). That is the
 * whole difference between a pin and a request, and it is why the tool policy below looks
 * like it is missing something.
 *
 * `--disallowed-tools` then names the tools whose absence should be LOUD rather than
 * incidental. It is not an exhaustive list of the CLI's registry and does not need to be:
 * anything unnamed still falls through to `ask`, which is terminal under bare `-p`. The
 * named ones are the surveying tools (Glob, Grep, LS) and the escape hatches (Bash, Task,
 * ToolSearch) — the shapes that would let an agent learn about the surface without a Read
 * and make the tool-call count mean something other than what it says.
 *
 * WHAT IT RECORDS, AND WHICH NUMBER TO TRUST.
 * Every agent's RAW returned text is stored verbatim alongside the parsed picks, the
 * per-tool call counts, the `usage` and `modelUsage` blocks, and the cost.
 *
 * `surface_reads` — the count of Read calls — is the headline, NOT `tool_uses_total`. A
 * denied tool call still appears in the transcript as an emitted `tool_use` block (denial
 * happens after emission, which is what `permission_denials` books), so a total would
 * count attempts the pin refused. The claim under test is what reading this surface cost,
 * and that is Reads.
 *
 * `context_tokens` sums `usage`, which the CLI's own schema flags as main-loop-only and
 * per-turn, and which accumulates `cache_read_input_tokens` on EVERY turn — so for a
 * condition needing ten paginated reads it counts a growing cached prefix ten times and is
 * not comparable to a one-read condition. `model_tokens` derives from `modelUsage`, which
 * the same schema says to prefer for token accounting, and is the figure to quote. Both
 * are recorded so the difference stays visible rather than being an editorial choice made
 * once and forgotten. Neither compares to the `subagent_tokens` in the older
 * `pick-surface-agent-runs.json`, which came from the Agent TOOL inside an interactive
 * session and carries no `claude -p` system prompt.
 *
 * SPEND. This drives Claude subagents, not the OpenRouter API, so HARD RULE #24's gate
 * (which keys on OUR key's NAME) has nothing to catch — and it stays out of `test/**`
 * and out of every `test`-family npm script regardless, which is what that rule asks
 * for. It is not free, though: CLAUDE.md calls the Claude spend a real constraint, so it
 * borrows `component-gen-eval.mjs`'s idiom — print the planned cost, exit without an
 * explicit opt-in, and validate small first. HARD RULE #27: `--model opus`, always.
 *
 * Usage:
 *   node tools/intent-bakeoff/pick-surface-agent-eval.mjs --dry-run
 *       Print the exact prompt, the tool policy and the planned spend. Spends nothing.
 *       This is the reviewable form — the whole experiment is visible without running it.
 *
 *   LATTICE_ALLOW_AGENT_SPEND=1 node tools/intent-bakeoff/pick-surface-agent-eval.mjs \
 *       [--briefs <file>] [--replicates 2] [--conditions pick,full] [--out <file>] [--json]
 *
 *   --briefs      pick-surface-briefs.json (default) | pick-surface-briefs-confusable.json
 *   --replicates  agents per condition (default 2 — what the original run used)
 *   --conditions  comma list of pick,full (default both)
 *   --out         runs JSON to write (default pick-surface-agent-runs.harness.json)
 *   --score-only [file]  re-score an existing runs file without spawning anything. Free.
 *
 *   Both `--flag value` and `--flag=value` are accepted, and an unrecognized flag is an
 *   error rather than a silent default — `--score-only=x.json` used to fall through to the
 *   spend path and launch the whole paid plan.
 *
 * Exit codes: 0 scored; 1 an agent failed or returned unparseable picks; 2 no opt-in.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// ── Conditions ───────────────────────────────────────────────────────────────
// The surface is copied into the sandbox under its OWN basename, so the prompt can
// name the file the agent will actually see and the two conditions differ in exactly
// one thing: which bytes are on the disk.
const CONDITIONS = {
  pick: { key: 'pick', surface: 'dist/docs/components.pick.md' },
  full: { key: 'full', surface: 'dist/docs/components.json' },
};

// EMPTY, and that is the fix rather than an oversight — see "HOW A SURFACE IS PINNED".
// A whole-tool `Read` grant overrides the working-directory refusal and silently unpins
// the experiment; without it, containment allows the in-sandbox read and refuses — and
// RECORDS — everything else.
const ALLOWED_TOOLS = [];

// The tools whose absence should be loud. Not exhaustive by design: anything unnamed
// still falls to `ask`, terminal under bare `-p`.
const DENIED_TOOLS = [
  'Bash', 'BashOutput', 'KillShell', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit',
  'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'ToolSearch',
  'TodoWrite', 'SlashCommand', 'Skill', 'REPL', 'Monitor',
];

// The full-catalog condition needs one Read per chunk of a 387 KB file. The first
// validation run capped this at 12 and that agent spent 10 Reads + 2 ToolSearch, hit
// turn 13, and was killed before it could answer — recorded as an unparseable return
// that looked like a model failure and was not. A cap exists to stop a runaway, so it
// belongs well above the work rather than next to it.
const rawMaxTurns = process.env.PICK_SURFACE_MAX_TURNS;
const MAX_TURNS = rawMaxTurns === undefined ? 40 : Number(rawMaxTurns);
if (!Number.isInteger(MAX_TURNS) || MAX_TURNS < 1) {
  console.error(`PICK_SURFACE_MAX_TURNS must be a positive integer, got '${rawMaxTurns}'`);
  process.exit(1);
}

// ── Arguments ────────────────────────────────────────────────────────────────
// `--flag value` and `--flag=value` both work, a flag that needs a value and has none is
// an error, and an unknown flag is an error. The first parser accepted only the spaced
// form and silently ignored anything it did not recognize, so `--score-only=runs.json`
// skipped the free re-score branch entirely and spawned the whole paid plan.
const argv = process.argv.slice(2);
const BOOLEAN_FLAGS = new Set(['dry-run', 'json']);
const VALUE_FLAGS = new Set(['briefs', 'replicates', 'conditions', 'out']);
const OPTIONAL_VALUE_FLAGS = new Set(['score-only']);

const parsedArgs = new Map();
for (let i = 0; i < argv.length; i++) {
  const token = argv[i];
  if (!token.startsWith('--')) { console.error(`unexpected argument '${token}'`); process.exit(1); }
  const eq = token.indexOf('=');
  const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
  const inlineValue = eq === -1 ? null : token.slice(eq + 1);
  if (!BOOLEAN_FLAGS.has(name) && !VALUE_FLAGS.has(name) && !OPTIONAL_VALUE_FLAGS.has(name)) {
    console.error(`unknown flag '--${name}'`);
    process.exit(1);
  }
  if (BOOLEAN_FLAGS.has(name)) {
    if (inlineValue !== null) { console.error(`--${name} takes no value`); process.exit(1); }
    parsedArgs.set(name, true);
    continue;
  }
  if (inlineValue !== null) { parsedArgs.set(name, inlineValue); continue; }
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith('--')) { parsedArgs.set(name, next); i++; continue; }
  if (OPTIONAL_VALUE_FLAGS.has(name)) { parsedArgs.set(name, true); continue; }
  console.error(`--${name} needs a value`);
  process.exit(1);
}
const flag = (name, fallback = null) => (parsedArgs.has(name) && parsedArgs.get(name) !== true ? parsedArgs.get(name) : fallback);
const has = (name) => parsedArgs.has(name);

const DRY_RUN = has('dry-run');
const JSON_OUT = has('json');
const SCORE_ONLY = has('score-only') ? flag('score-only', 'pick-surface-agent-runs.harness.json') : null;
const BRIEFS_FILE = flag('briefs', 'pick-surface-briefs.json');
const OUT_FILE = flag('out', 'pick-surface-agent-runs.harness.json');
const WANTED = flag('conditions', 'pick,full').split(',').map((s) => s.trim()).filter(Boolean);

const REPLICATES = Number(flag('replicates', '2'));
if (!Number.isInteger(REPLICATES) || REPLICATES < 1) {
  console.error(`--replicates must be a positive integer, got '${flag('replicates', '2')}'`);
  process.exit(1);
}
for (const c of WANTED) {
  if (!CONDITIONS[c]) {
    console.error(`unknown condition '${c}' — expected one of ${Object.keys(CONDITIONS).join(', ')}`);
    process.exit(1);
  }
}

/** Load a briefs document, refusing anything that is not one. */
function loadBriefs(file, why) {
  const p = join(HERE, basename(file));
  if (!existsSync(p)) { console.error(`briefs file not found: ${p}${why ? ` (${why})` : ''}`); process.exit(1); }
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(doc.briefs) || !doc.briefs.length) {
    console.error(`${p} has no \`briefs\` array — that is not a briefs file.`);
    process.exit(1);
  }
  for (const b of doc.briefs) {
    if (b == null || b.id === undefined || !Array.isArray(b.expect)) {
      console.error(`${p}: every brief needs an \`id\` and an \`expect\` array.`);
      process.exit(1);
    }
  }
  return doc.briefs;
}
const BRIEFS = loadBriefs(BRIEFS_FILE);

// ── The prompt ───────────────────────────────────────────────────────────────
// Deliberately says nothing about which surface is "better", names no component, and
// asks for a strict JSON envelope so parsing is not prose archaeology. `low_confidence`
// is kept because the original runs recorded it and it is the only self-report the note
// cites; it is descriptive, never scored.
function buildPrompt(surfaceFile, briefs = BRIEFS) {
  const list = briefs.map((b) => `${b.id}. ${b.brief}`).join('\n');
  return [
    `You are picking a slide component for each authoring brief below.`,
    ``,
    `The ONLY reference material available to you is the file \`${surfaceFile}\` in the`,
    `current directory. Read it. Do not look for any other file, and do not rely on`,
    `memory of this component library — if it is not in that file, you do not know it.`,
    ``,
    `Briefs:`,
    list,
    ``,
    `Reply with ONLY a JSON object, no prose and no code fence, in exactly this shape:`,
    `{"picks":{"1":"<component-name>", ... ,"${briefs.length}":"<component-name>"},"low_confidence":[<brief ids you are unsure about>]}`,
    ``,
    `"picks" must be a JSON OBJECT keyed by brief id, never an array. Every brief id from 1`,
    `to ${briefs.length} must appear in it. Each value is a single component name exactly as`,
    `spelled in the file.`,
  ].join('\n');
}

// ── Spawning one agent ───────────────────────────────────────────────────────
/**
 * Parse the `stream-json` transcript. The final `type:"result"` event carries usage,
 * cost and permission_denials; every assistant message may carry `tool_use` blocks,
 * which is the only place a per-tool count can come from (the `json` output format
 * reports usage but not tool calls).
 *
 * Two frame classes are skipped rather than counted. `is_meta` assistant frames are
 * synthesized by the CLI and can carry a fabricated `tool_use` block no model emitted.
 * A frame carrying `supersedes` replaces already-delivered messages, so counting both it
 * and what it replaces double-counts. Messages are also de-duplicated by `message.id`,
 * since a re-delivered frame is the same tool call rather than a second one.
 */
function parseStream(stdout) {
  const toolUses = {};
  const seenMessages = new Set();
  const superseded = new Set();
  const perMessage = [];
  let result = null;
  for (const line of stdout.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(s); } catch { continue; }
    if (ev.type === 'result') { result = ev; continue; }
    if (ev.type !== 'assistant' || ev.is_meta) continue;
    const content = ev?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const u of ev.supersedes ?? []) superseded.add(u);
    const id = ev?.message?.id ?? ev.uuid ?? null;
    if (id !== null) {
      if (seenMessages.has(id)) continue;
      seenMessages.add(id);
    }
    const calls = content.filter((b) => b?.type === 'tool_use').map((b) => b.name);
    if (calls.length) perMessage.push({ uuid: ev.uuid ?? null, calls });
  }
  for (const { uuid, calls } of perMessage) {
    if (uuid !== null && superseded.has(uuid)) continue;
    for (const name of calls) toolUses[name] = (toolUses[name] || 0) + 1;
  }
  return { toolUses, result };
}

/**
 * Pull the JSON envelope out of the agent's reply.
 *
 * Scans BRACE-BALANCED from each `{`, rather than slicing `indexOf('{')` to
 * `lastIndexOf('}')`. The naive slice is only correct when the object is the outermost
 * brace pair in the whole reply, so one prose brace on either side — "Here is the mapping
 * {brief -> component}:" — widened the slice until `JSON.parse` threw and a paid run was
 * discarded as unparseable. Fenced blocks are preferred, LAST fence first, so an example
 * fence before the real answer does not win.
 *
 * An ARRAY `picks` is rejected here rather than scored: it passes `typeof === 'object'`,
 * and `picks[String(id)]` then reads it POSITIONALLY, so a perfect answer in the wrong
 * container scored 0% strict and would have been published as a catastrophic failure.
 */
function parsePicks(text) {
  if (typeof text !== 'string') return null;
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fences.reverse(), text];
  for (const candidate of candidates) {
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] !== '{') continue;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let j = i; j < candidate.length; j++) {
        const ch = candidate[j];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth !== 0) continue;
          try {
            const obj = JSON.parse(candidate.slice(i, j + 1));
            if (obj && typeof obj.picks === 'object' && obj.picks !== null && !Array.isArray(obj.picks)) return obj;
          } catch { /* not this brace pair — keep scanning */ }
          break;
        }
      }
    }
  }
  return null;
}

function runAgent(condition, replicate, surfaceFile) {
  const sandbox = mkdtempSync(join(tmpdir(), `pick-surface-${condition.key}-`));
  try {
    copyFileSync(join(ROOT, condition.surface), join(sandbox, surfaceFile));
    const prompt = buildPrompt(surfaceFile);
    const spawnArgs = [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--model', 'opus',                       // HARD RULE #27 — one tier, always named.
      '--max-turns', String(MAX_TURNS),
      ...(ALLOWED_TOOLS.length ? ['--allowed-tools', ...ALLOWED_TOOLS] : []),
      '--disallowed-tools', ...DENIED_TOOLS,
    ];
    const started = Date.now();
    let stdout = '';
    let spawnError = null;
    try {
      stdout = execFileSync('claude', spawnArgs, {
        cwd: sandbox, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      stdout = e.stdout || '';
      // NOT `e.message`: execFileSync puts the ENTIRE argv in it, and the argv here
      // carries the whole multi-line prompt. The first validation run logged that
      // verbatim and buried the actual cause — a turn-limit kill — in 40 echoed lines.
      spawnError = e.stderr?.toString().trim().split('\n').slice(0, 3).join(' ')
        || `claude exited ${e.status ?? '?'}${e.signal ? ` on ${e.signal}` : ''}`;
    }
    const { toolUses, result } = parseStream(stdout);
    const raw = result?.result ?? null;
    // A turn-limit kill produces no final result and otherwise reads as a model failure.
    // Name it, so the artifact records a harness limit as a harness limit.
    if (!raw && !spawnError && (result?.num_turns ?? 0) >= MAX_TURNS) {
      spawnError = `hit --max-turns ${MAX_TURNS} before answering (raise PICK_SURFACE_MAX_TURNS)`;
    }
    const picks = parsePicks(raw);
    const usage = result?.usage ?? null;
    const modelUsage = result?.modelUsage ?? null;
    const modelTokens = modelUsage
      ? Object.values(modelUsage).reduce(
        (sum, m) => sum + (m.inputTokens || 0) + (m.cacheCreationInputTokens || 0) + (m.cacheReadInputTokens || 0),
        0,
      )
      : null;
    return {
      condition: condition.key,
      replicate,
      surface: condition.surface,
      sandbox_file: surfaceFile,
      model: 'opus',
      max_turns: MAX_TURNS,
      wall_ms: Date.now() - started,
      error: spawnError || (result?.is_error ? (result?.api_error_status ?? 'is_error') : null),
      // The harness's OWN accounting — never a human's copy.
      tool_uses: toolUses,
      tool_uses_total: Object.values(toolUses).reduce((a, b) => a + b, 0),
      // The headline. A denied call still emits a tool_use block, so the TOTAL counts
      // attempts the pin refused; the question is what reading the surface cost.
      surface_reads: toolUses.Read ?? 0,
      permission_denials: result?.permission_denials ?? [],
      num_turns: result?.num_turns ?? null,
      cost_usd: result?.total_cost_usd ?? null,
      usage,
      model_usage: modelUsage,
      // Prefer model_tokens; the header explains why context_tokens over-counts.
      model_tokens: modelTokens,
      context_tokens: usage
        ? (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
        : null,
      output_tokens: usage?.output_tokens ?? null,
      raw_return: raw,
      picks: picks?.picks ?? null,
      low_confidence: Array.isArray(picks?.low_confidence) ? picks.low_confidence : null,
    };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// Strict = the manifest's own `expect`. Defensible = `expect ∪ ok`, the alternatives the
// briefs file pre-registered as answers a competent author could defend. Both come from
// the committed ground truth; this function invents no verdicts.
//
// TWO miss lists, because one hid the only divergence the real data contains. `misses`
// (outside `expect ∪ ok`) was the sole report, so a pick that fails STRICT but lands in
// `ok` — brief 3, where the pick surface answers `timeline-list` and ground truth says
// `list-steps` — printed as 91.7%/100.0% with nothing naming it.
function score(run, briefs) {
  if (!run.picks) return { scored: false, n: briefs.length, strict: 0, defensible: 0, misses: [], strictOnly: [] };
  let strict = 0;
  let defensible = 0;
  const misses = [];
  const strictOnly = [];
  for (const b of briefs) {
    const got = run.picks[String(b.id)];
    const expect = new Set(b.expect || []);
    const okSet = new Set([...(b.expect || []), ...(b.ok || [])]);
    if (expect.has(got)) strict += 1;
    if (okSet.has(got)) {
      defensible += 1;
      if (!expect.has(got)) strictOnly.push({ id: b.id, got, expect: [...expect] });
    } else {
      misses.push({ id: b.id, got: got ?? null, expect: [...expect], ok: b.ok || [] });
    }
  }
  return { scored: true, n: briefs.length, strict, defensible, misses, strictOnly };
}

// ── Report ───────────────────────────────────────────────────────────────────
function report(doc, briefs) {
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a');
  const rows = doc.runs.map((r) => ({ r, s: score(r, briefs) }));
  if (JSON_OUT) {
    console.log(JSON.stringify({
      briefs: doc.briefs_file, cases: briefs.length,
      runs: rows.map(({ r, s }) => ({
        condition: r.condition, replicate: r.replicate, scored: s.scored,
        strict: s.strict, defensible: s.defensible, n: s.n,
        surface_reads: r.surface_reads, tool_uses_total: r.tool_uses_total,
        model_tokens: r.model_tokens, context_tokens: r.context_tokens,
        cost_usd: r.cost_usd, error: r.error,
      })),
    }, null, 2));
    return rows;
  }
  console.log(`\nbriefs: ${doc.briefs_file}  (${briefs.length} cases)`);
  console.log(`tools granted: ${ALLOWED_TOOLS.length ? ALLOWED_TOOLS.join(', ') : '(none — sandbox containment is the pin)'}\n`);
  console.log(`${'run'.padEnd(12)} ${'strict'.padEnd(9)} ${'defensible'.padEnd(12)} ${'reads'.padEnd(7)} ${'model tok'.padEnd(12)} cost`);
  for (const { r, s } of rows) {
    const label = `${r.condition}${String.fromCharCode(64 + r.replicate)}`;
    if (!s.scored) { console.log(`${label.padEnd(12)} UNPARSEABLE RETURN${r.error ? ` — ${r.error}` : ''}`); continue; }
    console.log(
      `${label.padEnd(12)} ${pct(s.strict, s.n).padEnd(9)} ${pct(s.defensible, s.n).padEnd(12)} ` +
      `${String(r.surface_reads).padEnd(7)} ${String(r.model_tokens ?? '?').padEnd(12)} ` +
      `${r.cost_usd != null ? `$${r.cost_usd.toFixed(2)}` : '?'}`,
    );
  }
  for (const { r, s } of rows) {
    const label = `${r.condition}${String.fromCharCode(64 + r.replicate)}`;
    if (s.scored && s.strictOnly.length) {
      console.log(`\n${label} defensible but not strict:`);
      for (const m of s.strictOnly) console.log(`  brief ${m.id}: picked ${m.got} — expect ${m.expect.join('/')}`);
    }
    if (s.scored && s.misses.length) {
      console.log(`\n${label} outside expect ∪ ok:`);
      for (const m of s.misses) console.log(`  brief ${m.id}: got ${m.got} — expect ${m.expect.join('/')}${m.ok.length ? ` ok ${m.ok.join('/')}` : ''}`);
    }
    if (r.permission_denials?.length) {
      console.log(`\n${label} PERMISSION DENIALS — the pin refused a read, and recorded it:`);
      for (const d of r.permission_denials) console.log(`  ${d.tool_name}: ${JSON.stringify(d.tool_input)}`);
    }
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────
if (SCORE_ONLY) {
  const p = join(HERE, basename(SCORE_ONLY));
  if (!existsSync(p)) { console.error(`runs file not found: ${p}`); process.exit(1); }
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(doc.runs)) { console.error(`${p} has no \`runs\` array — --score-only reads this harness's own output format.`); process.exit(1); }
  // Ground truth comes from the RUNS FILE, never from --briefs. A runs file records the
  // briefs it was scored against; re-scoring it against a different set silently reports
  // a number for an experiment that never happened — and the two briefs files here share
  // ids 1-12, so every lookup would succeed and nothing would look wrong.
  if (!doc.briefs_file) { console.error(`${p} records no \`briefs_file\` — cannot know what to score it against.`); process.exit(1); }
  if (has('briefs') && basename(BRIEFS_FILE) !== basename(doc.briefs_file)) {
    console.error(`--briefs ${BRIEFS_FILE} disagrees with the runs file's own ${doc.briefs_file}; scoring against the recorded one.`);
  }
  const rows = report(doc, loadBriefs(doc.briefs_file, `recorded in ${basename(p)}`));
  process.exit(rows.some(({ s }) => !s.scored) ? 1 : 0);
}

// Preflight both surfaces before anything is printed or spawned. `dist/` is gitignored,
// so on a fresh clone the free `--dry-run` used to die in a stack trace inside its own
// cost estimate — and mid-loop, a missing surface threw AFTER paid runs had completed and
// BEFORE the runs file was written, losing every one of them.
for (const key of WANTED) {
  if (!existsSync(join(ROOT, CONDITIONS[key].surface))) {
    console.error(`surface missing: ${CONDITIONS[key].surface}\n  It is a build artifact and \`dist/\` is gitignored — run \`npm run build\` first.`);
    process.exit(1);
  }
}

const plan = [];
for (const key of WANTED) {
  for (let i = 1; i <= REPLICATES; i++) plan.push({ condition: CONDITIONS[key], replicate: i });
}

// Cost guardrail. Not HARD RULE #24 (that gate keys on OUR OpenRouter key, which this
// never touches) — this is CLAUDE.md's "my GitHub + Claude spend is a real constraint",
// wearing component-gen-eval.mjs's opt-in shape because it is the one this repo already
// reads as "this costs money".
const surfaceKb = (c) => Math.round(readFileSync(join(ROOT, c.surface)).length / 1024);
if (DRY_RUN || process.env.LATTICE_ALLOW_AGENT_SPEND !== '1') {
  console.error([
    `pick-surface-agent-eval — planned run (nothing spawned yet)`,
    ``,
    `  briefs      ${basename(BRIEFS_FILE)}  (${BRIEFS.length} cases)`,
    `  agents      ${plan.length}  = ${WANTED.length} condition(s) x ${REPLICATES} replicate(s)`,
    `  model       opus (HARD RULE #27)`,
    `  tools       grant ${ALLOWED_TOOLS.length ? ALLOWED_TOOLS.join(',') : '(none — a whole-tool Read grant would unpin the sandbox)'}`,
    `              deny  ${DENIED_TOOLS.join(',')}`,
    `  max turns   ${MAX_TURNS}  (full-catalog needs ~10 Reads for a 387 KB file)`,
    `  sandbox     one temp dir per agent, containing ONLY its surface`,
    ``,
    ...plan.map(({ condition, replicate }) =>
      `    ${condition.key}${String.fromCharCode(64 + replicate)}  ${condition.surface}  (${surfaceKb(condition)} KB)`),
    ``,
    `  This SPENDS Claude tokens — each agent reads its whole surface, and the`,
    `  full-catalog condition reads ~${surfaceKb(CONDITIONS.full)} KB. Re-run with LATTICE_ALLOW_AGENT_SPEND=1.`,
    `  Validate small first: --conditions pick --replicates 1.`,
    ``,
    `  Prompt sent to every agent (identical but for the filename):`,
    ``,
    buildPrompt(basename(CONDITIONS[WANTED[0]].surface)).split('\n').map((l) => `    | ${l}`).join('\n'),
  ].join('\n'));
  process.exit(DRY_RUN ? 0 : 2);
}

const doc = {
  _note:
    'GENERATED by tools/intent-bakeoff/pick-surface-agent-eval.mjs — do not hand-edit. Each run ' +
    "records the agent RAW return verbatim plus the harness's own tool-call and usage accounting. " +
    'Quote `model_tokens` (from modelUsage), not `context_tokens` (from usage, which re-counts the ' +
    'cached prefix on every turn); neither compares to `subagent_tokens` in ' +
    'pick-surface-agent-runs.json, which came from the Agent tool inside an interactive session.',
  briefs_file: `tools/intent-bakeoff/${basename(BRIEFS_FILE)}`,
  replicates: REPLICATES,
  conditions: WANTED,
  allowed_tools: ALLOWED_TOOLS,
  denied_tools: DENIED_TOOLS,
  max_turns: MAX_TURNS,
  runs: [],
};
const outPath = join(HERE, basename(OUT_FILE));

for (const { condition, replicate } of plan) {
  const label = `${condition.key}${String.fromCharCode(64 + replicate)}`;
  process.stderr.write(`· ${label} (${condition.surface}) … `);
  const run = runAgent(condition, replicate, basename(condition.surface));
  doc.runs.push(run);
  // Persist after EVERY agent — a later failure must not discard what was already paid for.
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  process.stderr.write(
    run.error ? `ERROR: ${run.error}\n`
      : `${run.surface_reads} read(s), ${run.model_tokens} model tok, $${(run.cost_usd ?? 0).toFixed(2)}\n`,
  );
}
process.stderr.write(`\nwrote ${outPath}\n`);

const rows = report(doc, BRIEFS);
process.exit(rows.some(({ s }) => !s.scored) || doc.runs.some((r) => r.error) ? 1 : 0);
