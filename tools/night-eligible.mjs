#!/usr/bin/env node
/**
 * May the night desk merge this PR while the owner is away? One answer, read from
 * GitHub, the same way every time.
 *
 * The owner hands the night desk merge authority by typing "good night" or "afk" in
 * its session (.claude/hooks/owner-merge-gate.mjs). That word covers only PRs that pass
 * every rule below, and the merge gate runs THIS tool itself before each merge, so the
 * rules hold whatever the desk believes. The owner's choices, 2026-11-21:
 *   - VERY HIGH only: the PR's newest 🚦 card reads VERY HIGH, was graded by a checker,
 *     and was posted after the head commit (a card older than the head graded other code);
 *   - green: the `ci` check on the head succeeded, and GitHub reports the PR clean or
 *     merely behind `main` (the queue re-tests it on `main`);
 *   - never, even at VERY HIGH: CI, hooks and canonical docs; the export pipeline and
 *     fonts; a `**Breaking:**` changelog fragment; security, releases and dependency
 *     bumps; and the night desk's own PRs (a PR whose body names its session).
 *
 * Usage: node tools/night-eligible.mjs <pr> [--session <id>] [--json]
 *   exit 0 eligible · 1 not eligible (the reasons print) · 2 bad input · 3 GitHub could
 *   not be read (the gate treats 3 as "no", so it fails closed).
 * Needs GITHUB_TOKEN. Contract: engineering/workflow.md §Desks, "Night mode".
 */

/** Paths a night merge never touches: CI, hooks, canonical docs, export and fonts. */
export const NEVER_PATHS = [
  /^\.github\//,
  /^lefthook\.ya?ml$/,
  /^\.claude\/hooks\//,
  /^\.claude\/settings[^/]*\.json$/,
  /^CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^engineering\/workflow\.md$/,
  /^tools\/check-ownership\.js$/,
  /^tools\/night-eligible\.mjs$/,
  /^lib\/export\//,
  /^lib\/fonts\//,
  /^assets\/fonts\//,
  /^RELEASE\.md$/,
  /^package(-lock)?\.json$/,
];

const NEVER_LABELS = /^(security|release|dependencies|breaking)$/i;
const CARD = (pr) => new RegExp(`🚦 Pre-merge — #${pr}\\b`);

/**
 * Pure core: every reason the PR may not merge tonight; [] means it may.
 * @param {object} f facts read from GitHub
 */
export function reasons(f) {
  const out = [];
  const { pr } = f;
  if (f.state !== 'open') out.push(`#${pr} is ${f.state}`);
  if (f.draft) out.push(`#${pr} is a draft`);
  if (!['clean', 'behind'].includes(f.mergeableState)) out.push(`GitHub reports #${pr} ${f.mergeableState || 'unknown'}, not clean`);
  if (/\[bot\]$/.test(f.author || '')) out.push(`#${pr} was opened by ${f.author} (dependency and bot PRs have their own rule)`);
  if (/^release/i.test(f.headRef || '') || /^release/i.test(f.title || '')) out.push(`#${pr} is a release`);
  for (const l of f.labels || []) if (NEVER_LABELS.test(l)) out.push(`#${pr} is labeled ${l}`);
  if (f.session && (f.body || '').includes(f.session)) out.push(`#${pr} was written by this session (no self-approval)`);
  const ci = (f.checks || []).find((c) => c.name === 'ci');
  if (!ci) out.push(`no \`ci\` check on head ${f.headSha.slice(0, 7)}`);
  else if (ci.conclusion !== 'success') out.push(`\`ci\` on head ${f.headSha.slice(0, 7)} is ${ci.conclusion || ci.status}`);
  for (const file of f.files || []) {
    if (NEVER_PATHS.some((re) => re.test(file))) out.push(`#${pr} changes ${file}, which a night merge never touches`);
  }
  for (const frag of f.breakingFragments || []) out.push(`#${pr} carries a **Breaking:** changelog fragment (${frag})`);
  const cards = (f.comments || []).filter((c) => CARD(pr).test(c.body || ''));
  const card = cards[cards.length - 1];
  if (!card) out.push(`#${pr} has no 🚦 pre-merge card`);
  else {
    const body = card.body;
    if (!/confidence\s*\n\s*VERY HIGH\b/.test(body)) out.push(`#${pr}'s newest card is not VERY HIGH`);
    if (!/graded by\s*\n[^\n]*checker/i.test(body)) out.push(`#${pr}'s newest card was not graded by a checker`);
    if (f.headDate && card.createdAt && card.createdAt < f.headDate) {
      out.push(`#${pr}'s newest card (${card.createdAt}) is older than its head commit (${f.headDate})`);
    }
  }
  return out;
}

async function gh(path, token, accept = 'application/vnd.github+json') {
  const r = await fetch(`https://api.github.com/repos/Laticent/lattice/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'lattice-night-eligible' },
  });
  if (!r.ok) throw new Error(`GitHub ${path}: ${r.status}`);
  return accept.endsWith('raw') ? r.text() : r.json();
}

async function pages(path, token) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/** Read every fact `reasons` needs from GitHub. */
export async function facts(pr, session, token) {
  const p = await gh(`pulls/${pr}`, token);
  const sha = p.head.sha;
  const [files, comments, checks, commit] = await Promise.all([
    pages(`pulls/${pr}/files`, token),
    pages(`issues/${pr}/comments`, token),
    gh(`commits/${sha}/check-runs?per_page=100`, token),
    gh(`commits/${sha}`, token),
  ]);
  const fragments = files.filter((f) => /^changelog\.d\/.+\.md$/.test(f.filename) && f.status !== 'removed');
  const breakingFragments = [];
  for (const f of fragments) {
    const text = await gh(`contents/${encodeURIComponent(f.filename).replace(/%2F/g, '/')}?ref=${sha}`, token, 'application/vnd.github.raw');
    if (/\*\*Breaking:\*\*/.test(text)) breakingFragments.push(f.filename);
  }
  return {
    pr,
    session,
    state: p.merged ? 'merged' : p.state,
    draft: p.draft,
    mergeableState: p.mergeable_state,
    author: p.user?.login,
    headRef: p.head.ref,
    headSha: sha,
    headDate: commit.commit?.committer?.date,
    title: p.title,
    body: p.body || '',
    labels: (p.labels || []).map((l) => l.name),
    files: files.map((f) => f.filename),
    breakingFragments,
    checks: checks.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion })),
    comments: comments.map((c) => ({ body: c.body, createdAt: c.created_at })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const pr = Number(args[0]);
  const si = args.indexOf('--session');
  const session = si >= 0 ? args[si + 1] : '';
  if (!Number.isInteger(pr) || pr < 1) {
    console.error('usage: node tools/night-eligible.mjs <pr> [--session <id>] [--json]');
    process.exit(2);
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('night-eligible: GITHUB_TOKEN is not set, so GitHub cannot be read');
    process.exit(3);
  }
  let f;
  try {
    f = await facts(pr, session, token);
  } catch (err) {
    console.error(`night-eligible: ${err.message}`);
    process.exit(3);
  }
  const why = reasons(f);
  if (args.includes('--json')) console.log(JSON.stringify({ pr, head: f.headSha, eligible: !why.length, reasons: why }));
  else if (why.length) for (const r of why) console.log(`no: ${r}`);
  else console.log(`yes: #${pr} at ${f.headSha.slice(0, 7)} may merge tonight`);
  process.exit(why.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
