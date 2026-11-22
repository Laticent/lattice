#!/usr/bin/env node
/**
 * May the night desk merge this PR while the owner is away? One answer, read from
 * GitHub, the same way every time.
 *
 * The owner hands the night desk merge authority by typing "good night" or "afk" in a
 * session they opened with `/desk-night` (.claude/hooks/owner-merge-gate.mjs). That word
 * covers only PRs that pass every rule below. The merge gate runs THIS tool itself, taken
 * from `origin/main` rather than the working tree, before each merge, so the rules hold
 * whatever the desk believes. The owner's choices, 2026-11-21, after a red team, an
 * inversion and a checker reviewed the first draft:
 *   - VERY HIGH only: the newest 🚦 card, posted by the owner's account and never edited,
 *     reads VERY HIGH on its confidence line, names a checker on its graded-by line, and
 *     names the PR's current head sha (a card that names an older head graded other code);
 *   - the owner's own work: the PR and the card come from an owner login, from this
 *     repository (no forks), and not from the night session itself;
 *   - green: the `ci` check from GitHub Actions succeeded on the head, GitHub reports the
 *     PR clean or merely behind `main`, and no nightly or golden-bless run on `main` is red;
 *   - non-visual and outside the control plane: every changed path, old and new, sits under
 *     an allowed root and matches no never-merge pattern (visual surfaces wait for the
 *     morning digest); no `**Breaking:**` fragment; no security, release or dependency
 *     label; not a release; no bot.
 * Anything unreadable, missing or over a size limit is a no.
 *
 * Usage: node tools/night-eligible.mjs <pr> --session <session_…> [--json]
 *   exit 0 eligible · 1 not eligible (the reasons print) · 2 bad input · 3 GitHub could
 *   not be read (the gate treats every non-zero exit as "no", so it fails closed).
 * Needs GITHUB_TOKEN. Contract: engineering/workflow.md §Desks, "Night mode".
 */

const REPO = 'Laticent/lattice';
/** Logins whose PRs and cards count as the owner's. */
export const OWNER_LOGINS = ['saden1'];

/** A night merge may only touch files under these roots. */
export const ALLOWED_ROOTS = [/^lib\//, /^tools\//, /^test\//, /^engineering\//, /^design\//, /^followups\.d\//, /^changelog\.d\//];

/** ...and never these, even under an allowed root: control plane, gates, export, visual. */
export const NEVER_PATHS = [
  // the merge gate, the card, the checker and the gates the next night depends on
  /^tools\/night-eligible\.mjs$/,
  /^tools\/card\.js$/,
  /^tools\/check-ownership\.js$/,
  /^tools\/(affected-tests|lint-deck)\.js$/,
  /^tools\/check-commit-msg\.sh$/,
  /^tools\/flaky-test-baseline\.json$/,
  /^lib\/authoring\/lint-core\.js$/,
  /^test\/unit\/tools\/(owner-merge-gate|night-eligible)\.test\.js$/,
  /^engineering\/(workflow|orchestration|house-style)\.md$/,
  // security code (HARD RULE #22)
  /sanitize/i,
  // export and fonts
  /^lib\/(export|cli|fonts)\//,
  // visual surfaces: these wait for the owner's eyes in the morning digest
  /^lib\/(components|base|plugins|finishes|tokens|theme|typography|layout|forms|motion|shared|exemplars|samples)\//,
  /\.css$/,
  /\.(png|jpe?g|webp|gif|svg|pdf|pptx|woff2?|ttf|otf)$/i,
  /(^|\/)package(-lock)?\.json$/,
];

const NEVER_LABELS = /security|release|depend|breaking/i;
/** Workflows on `main` that must not be red: a red base stops the night. */
export const MAIN_GUARDS = ['CI', 'Golden bless (nightly)', 'Integration nightly (render-regression tier)'];
const MAX_FILES = 300;

/** Pure: the reason a path may not merge tonight, or '' if it may. */
export function pathReason(file) {
  if (!ALLOWED_ROOTS.some((re) => re.test(file))) return `${file} is outside the roots a night merge may touch`;
  if (NEVER_PATHS.some((re) => re.test(file))) return `${file} is control-plane, security, export or visual, which waits for the owner`;
  return '';
}

/** Pure: the value lines under a card heading such as `confidence` or `graded by`. */
export function cardField(body, name) {
  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.trim().toLowerCase() === name);
  if (i < 0) return '';
  const out = [];
  for (const l of lines.slice(i + 1)) {
    if (!/^\s{4,}\S/.test(l)) break;
    out.push(l.trim());
  }
  return out.join(' ');
}

/**
 * Pure core: every reason the PR may not merge tonight; [] means it may.
 * @param {object} f facts read from GitHub
 */
export function reasons(f) {
  const out = [];
  const { pr } = f;
  const short = (f.headSha || '').slice(0, 7);
  if (!f.session || !/^session_[A-Za-z0-9]+$/.test(f.session)) out.push('the night session id is missing, so its own PRs cannot be told apart');
  if (f.state !== 'open') out.push(`#${pr} is ${f.state}`);
  if (f.draft) out.push(`#${pr} is a draft`);
  if (!['clean', 'behind'].includes(f.mergeableState)) out.push(`GitHub reports #${pr} ${f.mergeableState || 'unknown'}, not clean`);
  if (!OWNER_LOGINS.includes(f.author)) out.push(`#${pr} was opened by ${f.author || 'unknown'}, not the owner's account`);
  if (f.headRepo !== REPO) out.push(`#${pr} comes from ${f.headRepo || 'an unknown repository'}, not ${REPO}`);
  if (/\brelease\b/i.test(f.headRef || '') || /\brelease\b/i.test(f.title || '')) out.push(`#${pr} is a release`);
  for (const l of f.labels || []) if (NEVER_LABELS.test(l)) out.push(`#${pr} is labeled ${l}`);
  if (f.session && (f.commitMessages || []).some((m) => m.includes(`/${f.session}`))) {
    out.push(`#${pr} has commits from this night session (no self-approval)`);
  }
  const ci = (f.checks || []).find((c) => c.name === 'ci' && c.app === 'github-actions');
  if (!ci) out.push(`no \`ci\` check from GitHub Actions on head ${short}`);
  else if (ci.conclusion !== 'success') out.push(`\`ci\` on head ${short} is ${ci.conclusion || ci.status}`);
  for (const red of f.redOnMain || []) out.push(`the latest ${red} run on main is red, so nothing merges tonight`);
  if (!Number.isInteger(f.changedFiles) || (f.files || []).length !== f.changedFiles) {
    out.push(`#${pr}'s file list could not be read in full`);
  }
  if (f.changedFiles > MAX_FILES) out.push(`#${pr} changes ${f.changedFiles} files, over the night limit of ${MAX_FILES}`);
  for (const file of f.files || []) {
    for (const p of [file.filename, file.previous].filter(Boolean)) {
      const why = pathReason(p);
      if (why) out.push(why);
    }
  }
  for (const frag of f.breakingFragments || []) out.push(`#${pr} carries a breaking-change changelog fragment (${frag})`);
  const cards = (f.comments || []).filter((c) => new RegExp(`🚦 Pre-merge — #${pr}\\b`).test(c.body || ''));
  const card = cards[cards.length - 1];
  if (!card) out.push(`#${pr} has no 🚦 pre-merge card`);
  else {
    if (!OWNER_LOGINS.includes(card.author)) out.push(`#${pr}'s newest card was posted by ${card.author}, not the owner's account`);
    if (card.updatedAt !== card.createdAt) out.push(`#${pr}'s newest card was edited after it was posted`);
    if (!/^VERY HIGH\b/.test(cardField(card.body, 'confidence'))) out.push(`#${pr}'s newest card is not VERY HIGH`);
    if (!/^checker\b/i.test(cardField(card.body, 'graded by'))) out.push(`#${pr}'s newest card was not graded by a checker`);
    if (!short || !card.body.includes(short)) out.push(`#${pr}'s newest card does not name its head ${short}, so it may have graded other code`);
  }
  return [...new Set(out)];
}

async function gh(path, token, accept = 'application/vnd.github+json') {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'lattice-night-eligible' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`GitHub ${path}: ${r.status}`);
  return accept.endsWith('raw') ? r.text() : r.json();
}

async function pages(path, token, max = 10) {
  const all = [];
  for (let page = 1; page <= max; page++) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new Error(`${path} has more than ${max * 100} items`);
}

/** The guard workflows whose newest completed run on main failed. */
async function redOnMain(token) {
  const runs = await gh('actions/runs?branch=main&status=completed&per_page=100', token);
  const red = [];
  for (const name of MAIN_GUARDS) {
    const last = runs.workflow_runs.find((r) => r.name === name);
    if (last && last.conclusion !== 'success' && last.conclusion !== 'skipped') red.push(name);
  }
  return red;
}

/** Read every fact `reasons` needs from GitHub. */
export async function facts(pr, session, token) {
  const p = await gh(`pulls/${pr}`, token);
  const sha = p.head.sha;
  if (p.changed_files > MAX_FILES) {
    return { pr, session, state: p.state, changedFiles: p.changed_files, files: [], headSha: sha };
  }
  const [files, comments, checks, commits, red] = await Promise.all([
    pages(`pulls/${pr}/files`, token, 3),
    pages(`issues/${pr}/comments`, token),
    gh(`commits/${sha}/check-runs?check_name=ci&per_page=100`, token),
    pages(`pulls/${pr}/commits`, token, 3),
    redOnMain(token),
  ]);
  const breakingFragments = [];
  for (const f of files.filter((x) => /^changelog\.d\/.+\.md$/.test(x.filename) && x.status !== 'removed')) {
    const text = await gh(`contents/${f.filename.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, token, 'application/vnd.github.raw');
    if (/\*\*\s*breaking/i.test(text)) breakingFragments.push(f.filename);
  }
  return {
    pr,
    session,
    state: p.merged ? 'merged' : p.state,
    draft: p.draft,
    mergeableState: p.mergeable_state,
    author: p.user?.login,
    headRepo: p.head.repo?.full_name,
    headRef: p.head.ref,
    headSha: sha,
    title: p.title,
    labels: (p.labels || []).map((l) => l.name),
    changedFiles: p.changed_files,
    files: files.map((f) => ({ filename: f.filename, previous: f.previous_filename })),
    breakingFragments,
    commitMessages: commits.map((c) => c.commit?.message || ''),
    checks: checks.check_runs.map((c) => ({ name: c.name, app: c.app?.slug, status: c.status, conclusion: c.conclusion })),
    redOnMain: red,
    comments: comments.map((c) => ({ body: c.body || '', author: c.user?.login, createdAt: c.created_at, updatedAt: c.updated_at })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const pr = Number(args[0]);
  const si = args.indexOf('--session');
  const session = si >= 0 ? args[si + 1] || '' : '';
  const json = args.includes('--json');
  const say = (out, code) => {
    if (json) console.log(JSON.stringify(out));
    process.exit(code);
  };
  if (!Number.isInteger(pr) || pr < 1) {
    console.error('usage: node tools/night-eligible.mjs <pr> --session <session_…> [--json]');
    process.exit(2);
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('night-eligible: GITHUB_TOKEN is not set, so GitHub cannot be read');
    say({ pr, eligible: false, reasons: ['GITHUB_TOKEN is not set'] }, 3);
  }
  let f;
  try {
    f = await facts(pr, session, token);
  } catch (err) {
    console.error(`night-eligible: ${err.message}`);
    say({ pr, eligible: false, reasons: [`GitHub could not be read: ${err.message}`] }, 3);
  }
  const why = reasons(f);
  if (json) say({ pr, head: f.headSha, eligible: why.length === 0, reasons: why }, why.length ? 1 : 0);
  for (const r of why) console.log(`no: ${r}`);
  if (!why.length) console.log(`yes: #${pr} at ${f.headSha.slice(0, 7)} may merge tonight`);
  process.exit(why.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
