#!/usr/bin/env node
/**
 * agent-pack-eval — does the agent pack make a model write a good deck?
 *
 * engineering/decisions/2026-11-17-agent-pack.md §4.5. A model gets ONE pack file as its
 * whole system prompt and a fixed brief, writes a deck, and the deck goes through the same
 * machinery a human's would: `lint:deck` and a real render through `dist/lattice.js`.
 * Two arms, one per entry point the pack advertises:
 *
 *   start   dist/agent-kit/start.md                         a capable model (default sonnet-class)
 *   small   dist/agent-kit/paste/lattice-instructions-solo.md  a small model (default gpt-4o-mini)
 *
 * A deck PASSES when it lints with zero errors and zero warnings, renders, reports no
 * overflow, has 6 to 16 slides, uses at least four different layouts, and carries no
 * `marp: true`. Suggestions are reported, not failed: they are taste, and the canon already
 * asks for them.
 *
 * Usage:  OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/agent-pack-eval.mjs
 *           [--arm start|small] [--limit <n>] [--out <dir>]
 *         node tools/agent-pack-eval.mjs --judge deck.md [--out <dir>]
 *           (judge one deck, no model call; its PDF goes to --out, never beside the deck)
 *
 * Spends OUR OpenRouter key (HARD RULE #24): opt-in only, never on the PR path. Without
 * OPENROUTER_ALLOW_SPEND=1 it prints what it would spend and exits 0. It prints the real
 * cost from OpenRouter's usage report when it is done. CI runs it from
 * .github/workflows/agent-pack-eval-nightly.yml, a sanctioned nightly workflow.
 *
 * Exit: 0 every deck passed (or a dry run), 1 a deck failed, 2 no key or no built kit.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'dist', 'agent-kit');
/** Where the decks, their PDFs and summary.json go unless `--out` says otherwise. Never beside a committed deck. */
export const DEFAULT_OUT = path.join(ROOT, '.scratch', 'agent-pack-eval');
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);

const ARMS = {
  start: { file: 'start.md', model: process.env.AGENT_PACK_MODEL || 'anthropic/claude-sonnet-5.5' },
  small: { file: 'paste/lattice-instructions-solo.md', model: process.env.AGENT_PACK_SMALL_MODEL || 'openai/gpt-4o-mini' },
};

/** Three briefs, three registers: a board ask, a teaching deck, a data-led review. Fixed, so nights compare. */
const BRIEFS = [
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

function priceNote() {
  // Measured 2026-11-19 from OpenRouter's public /api/v1/models prices: start.md is ~43.7 KB
  // (~11k tokens), sonnet-5.5 is USD 2 / 10 per million in / out, gpt-4o-mini 0.15 / 0.60.
  // Three start-arm calls at ~11k in and 2.5k to 6k out cost USD 0.14 to 0.25; the small arm
  // adds about one cent. The tool prints OpenRouter's own figure after a real run.
  return 'about 6 completions, the start arm over an ~11k-token prompt: roughly USD 0.15 to 0.26 a run';
}

/**
 * The deck in a model's reply. A reply that starts with front matter is the deck. Otherwise the
 * deck is the first ```markdown (or ```md, or bare) fence, taken to the LAST line that closes
 * it with the same backtick run: a lazy match stopped at the deck's own first code or mermaid
 * fence and judged half a deck.
 */
export function deckFrom(reply) {
  // A model reply is external input: strip a BOM and fold CRLF and lone CR before `^---` is tested.
  const text = String(reply).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
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

async function complete(model, system, user) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPEN_ROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 6000,
      temperature: 0,
      usage: { include: true },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  // A reply cut off at max_tokens is a truncated deck: say so rather than judge half of it.
  if (j.choices?.[0]?.finish_reason === 'length') throw new Error(`reply hit max_tokens (${j.usage?.completion_tokens ?? '?'} tokens)`);
  return { text: j.choices?.[0]?.message?.content ?? '', cost: Number(j.usage?.cost ?? 0) };
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
  const classes = [...deck.matchAll(/<!--\s*_class:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
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
    suggestions: findings.filter((f) => f.severity === 'suggestion').length + review.length,
    problems,
  };
}

async function main() {
  const arms = arg('--arm') ? [arg('--arm')] : Object.keys(ARMS);
  const limit = Number(arg('--limit', BRIEFS.length));
  const out = path.resolve(arg('--out', DEFAULT_OUT));
  for (const a of arms) {
    if (!ARMS[a]) {
      console.error(`unknown arm ${a}; one of ${Object.keys(ARMS).join(', ')}`);
      return 2;
    }
    if (!existsSync(path.join(KIT, ARMS[a].file))) {
      console.error(`missing ${path.join(KIT, ARMS[a].file)}: run \`npm run build\` first.`);
      return 2;
    }
  }
  const briefs = BRIEFS.slice(0, limit);
  console.log(`agent-pack-eval: ${arms.length} arm(s) × ${briefs.length} brief(s); ${priceNote()}.`);
  if (process.env.OPENROUTER_ALLOW_SPEND !== '1') {
    console.log('Dry run: set OPENROUTER_ALLOW_SPEND=1 to spend OUR OpenRouter key and run it.');
    return 0;
  }
  if (!process.env.OPEN_ROUTER_KEY) {
    console.error('no OPEN_ROUTER_KEY in the environment: the eval did not run.');
    return 2;
  }
  mkdirSync(out, { recursive: true });
  const rows = [];
  let cost = 0;
  for (const a of arms) {
    const system = readFileSync(path.join(KIT, ARMS[a].file), 'utf8');
    for (const b of briefs) {
      const base = path.join(out, `${a}-${b.slug}`);
      let row;
      try {
        const reply = await complete(ARMS[a].model, system, `${b.text}\n\nReply with the complete deck as one Markdown file and nothing else.`);
        cost += reply.cost;
        writeFileSync(`${base}.md`, deckFrom(reply.text));
        row = { arm: a, model: ARMS[a].model, brief: b.slug, ...judge(`${base}.md`, `${base}.pdf`) };
      } catch (e) {
        row = { arm: a, model: ARMS[a].model, brief: b.slug, slides: 0, layouts: [], suggestions: 0, problems: [`request failed: ${e.message}`] };
      }
      rows.push(row);
      console.log(`${row.problems.length ? 'FAIL' : 'pass'}  ${a.padEnd(5)} ${b.slug.padEnd(11)} ${row.slides} slides, ${row.layouts.length} layouts, ${row.suggestions} suggestions${row.problems.length ? `\n      ${row.problems.join('\n      ')}` : ''}`);
    }
  }
  const failed = rows.filter((r) => r.problems.length).length;
  const summary = { date: new Date().toISOString(), cost: Number(cost.toFixed(4)), passed: rows.length - failed, failed, rows };
  writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n${rows.length - failed}/${rows.length} decks passed. Spent USD ${cost.toFixed(4)} of our OpenRouter key. Decks, PDFs and summary.json in ${path.relative(ROOT, out) || out}.`);
  return failed ? 1 : 0;
}

// Run only as a script: a test imports deckFrom without spending anything.
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
  console.log(JSON.stringify(judgeOne(arg('--judge'), arg('--out', DEFAULT_OUT)), null, 2));
  process.exit(0);
}

if (isMain) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
