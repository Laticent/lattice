#!/usr/bin/env node
/**
 * tools/platform-harness.js — a warm macOS / Windows runner that takes jobs from a pull request's comments.
 *
 * A platform-suites dispatch pays its setup on every round: about 17 minutes before the first test on an iOS suite
 * (run 44138306176: 5 m of plan and docs build, 7 m 50 s waiting for a macOS runner, 4 m of checkout, `npm ci` and
 * build). This script pays it once. `platform-suites.yml`'s `harness` job installs and builds, then runs this loop:
 *
 *   1. read the pull request's new comments; act on the ones that start with `/harness` and that the person who
 *      dispatched the run wrote (the same login; their write access is checked once at start);
 *   2. before each job, bring the checkout to the branch's newest commit, and rebuild only what that change needs;
 *   3. run the job with a stripped environment (no token) and reply on the pull request with the result;
 *   4. with no command waiting and a new commit on the branch, run the last job again (`/harness watch off` stops that);
 *   5. stop after IDLE minutes without a job, at the DEADLINE, or on `/harness stop`.
 *
 * Commands (one per comment, first line):
 *   /harness suite <name> [KEY=value ...]   the registry's `run` for that suite (.github/platform-suites.json), with the
 *                                           extra variables set, e.g. `/harness suite export-confine DEBUG=1` (a variable the
 *                                           suite's `run` sets inline is refused: bash would let that one win)
 *   /harness sh                             the first ```bash (or ```sh) fenced block in the comment, run by bash
 *   /harness rerun                          the last job again
 *   /harness watch on|off                   re-run the last job when a new commit lands (default on)
 *   /harness status                         reply with the commit, the job count and the time left
 *   /harness stop                           end the session; the workflow then uploads every job's artifacts
 * Any command may add `--no-build` after the verb to skip the rebuild a new commit would trigger.
 *
 * Contract and threat model: engineering/decisions/2026-11-17-platform-harness.md. The runner holds no secrets. The token
 * that reads and writes comments is kept out of a job's environment, out of `.git/config` (the workflow checks out with
 * `persist-credentials: false`) and out of every reply (`redact`). A job is killed at the deadline.
 *
 * Environment (set by the workflow): GH_TOKEN, REPO (owner/name), PR (number), ACTOR (the dispatching login), BRANCH,
 * HARNESS_OS, RUN_URL, DOCS_SITE ('1' to keep docs/dist built), HARNESS_T0 (epoch seconds the job started; the deadline
 * counts from it), IDLE_MINUTES (15), DEADLINE_MINUTES (90), POLL_SECONDS (15).
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MARK = '<!-- lattice-harness -->';
/** The repository permissions that may drive the runner: the ones that could push the same commands as a commit. */
const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);
const VERBS = new Set(['suite', 'sh', 'rerun', 'watch', 'status', 'stop']);
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
/** Variables a job may not set: they would change what runs rather than how a suite behaves. */
const RESERVED_ENV = new Set(['PATH', 'HOME', 'SHELL', 'NODE_OPTIONS', 'BASH_ENV', 'ENV', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'GH_TOKEN', 'GITHUB_TOKEN']);
const TAIL_LINES = 120;
const COMMENT_LIMIT = 60000; // GitHub's ceiling is 65536 characters

/**
 * Parse one comment into a command, or null when it is not one. Pure: the unit tests drive it.
 * @returns {null | {verb: string, noBuild: boolean, suite?: string, env?: Record<string,string>, script?: string,
 *   watch?: boolean, error?: string}}
 */
function parseCommand(body) {
  if (typeof body !== 'string') return null;
  const text = body.replace(/\r\n?/g, '\n');
  const first = text.split('\n', 1)[0].trim();
  if (!/^\/harness(\s|$)/.test(first)) return null;
  const words = first.split(/\s+/).slice(1);
  const noBuild = words.includes('--no-build');
  const args = words.filter((w) => w !== '--no-build');
  const verb = args.shift() || '';
  if (!VERBS.has(verb)) return { verb: 'invalid', noBuild, error: `unknown verb \`${verb || '(none)'}\`; expected one of ${[...VERBS].join(', ')}` };
  if (verb === 'suite') {
    const suite = args.shift();
    if (!suite || !/^[a-z0-9][a-z0-9-]*$/.test(suite)) return { verb: 'invalid', noBuild, error: '`/harness suite` needs a suite name' };
    const env = {};
    for (const pair of args) {
      const eq = pair.indexOf('=');
      const name = eq > 0 ? pair.slice(0, eq) : '';
      if (!ENV_NAME.test(name)) return { verb: 'invalid', noBuild, error: `\`${pair}\` is not KEY=value` };
      if (RESERVED_ENV.has(name)) return { verb: 'invalid', noBuild, error: `\`${name}\` cannot be set by a job` };
      env[name] = pair.slice(eq + 1);
    }
    return { verb, noBuild, suite, env };
  }
  if (verb === 'sh') {
    const fence = text.match(/^```(?:bash|sh)[ \t]*\n([\s\S]*?)^```[ \t]*$/m);
    if (!fence) return { verb: 'invalid', noBuild, error: '`/harness sh` needs a ```bash fenced block' };
    return { verb, noBuild, script: fence[1] };
  }
  if (verb === 'watch') {
    const v = args[0];
    if (v !== 'on' && v !== 'off') return { verb: 'invalid', noBuild, error: '`/harness watch` takes on or off' };
    return { verb, noBuild, watch: v === 'on' };
  }
  return { verb, noBuild };
}

/**
 * Whether a comment may drive the runner: written by the person who dispatched the run, after the session started, and
 * never a reply this script wrote. Their write access is checked once at start (`canWrite`), not per comment from
 * `author_association`: the job's own token reads a private org member as CONTRIBUTOR (run 44163967462 ignored the
 * dispatcher's command that way), so that field depends on who asks.
 */
function authorized(comment, { actor, since }) {
  if (!comment?.user) return false;
  if (typeof comment.body === 'string' && comment.body.includes(MARK)) return false;
  if (comment.user.login !== actor) return false;
  return Date.parse(comment.created_at) >= since;
}

/** Whether a GET /repos/{r}/collaborators/{login}/permission answer grants push. */
function canWrite(answer) {
  return WRITE_PERMISSIONS.has(answer?.permission) || answer?.user?.permissions?.push === true;
}

/**
 * Paths no build reads: the iOS probes (run.sh and run.mjs load them from source at run time) and the two note folders.
 * Everything else rebuilds, because almost everything feeds a build: `.md` files feed the docs site and the component
 * docs, `test/integration/baseline-decks` feeds the portal, and `docs/scripts/*.mjs` run inside `build:e2e`.
 */
const INERT = ['docs/scripts/ios-safari/', 'followups.d/', 'changelog.d/'];

/**
 * Which rebuilds a change needs, from the paths it touched. Conservative: anything not known to be inert rebuilds both.
 * @returns {{install: boolean, docsInstall: boolean, build: boolean, docs: boolean}}
 */
function rebuildFor(changed) {
  const install = changed.some((p) => p === 'package-lock.json' || p === 'package.json');
  const docsInstall = install || changed.some((p) => p === 'docs/package-lock.json' || p === 'docs/package.json');
  const build = install || changed.some((p) => !INERT.some((dir) => p.startsWith(dir)));
  return { install, docsInstall, build, docs: build };
}

/** The variables a registry `run` sets inline (`PROBE=undo DEVICES=iPhone bash …`); bash lets those beat the environment. */
function inlineAssignments(run) {
  const names = [];
  for (const word of String(run).trim().split(/\s+/)) {
    const m = word.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!m) break;
    names.push(m[1]);
  }
  return names;
}

/** Remove a token, and the base64 forms git and checkout write it in, from text bound for a public comment. */
function redact(text, token) {
  if (!token) return text;
  let out = text;
  for (const secret of [token, Buffer.from(`x-access-token:${token}`).toString('base64'), Buffer.from(token).toString('base64')]) {
    out = out.split(secret).join('***');
  }
  return out;
}

/** The last lines of a log, trimmed to fit a comment. */
function tail(text, lines = TAIL_LINES, limit = COMMENT_LIMIT - 4000) {
  let out = text.split('\n').slice(-lines).join('\n');
  if (out.length > limit) out = out.slice(out.length - limit);
  return out.replace(/```/g, '`​``');
}

function minutes(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

// ---------------------------------------------------------------- side effects below

async function api(method, url, body) {
  const res = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** The job's environment: the runner's, minus every token and the variables a job must not see. */
function jobEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const k of Object.keys(env)) {
    if (k === 'GH_TOKEN' || k === 'GITHUB_TOKEN' || k.startsWith('ACTIONS_') || /TOKEN|SECRET/.test(k)) delete env[k];
    // The files that set later steps' environment, PATH and outputs: a job writing NODE_OPTIONS there would run code
    // inside the upload and cache post-steps, which hold the runtime token.
    if (k === 'GITHUB_ENV' || k === 'GITHUB_PATH' || k === 'GITHUB_OUTPUT' || k === 'GITHUB_STATE') delete env[k];
  }
  return env;
}

/** Run a bash script; resolve with its exit code and combined output (also streamed to the job log). Killed at `limitMs`. */
function run(script, env, log, limitMs = Infinity) {
  return new Promise((resolve) => {
    const posix = process.platform !== 'win32';
    const child = spawn('bash', ['-c', script], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: posix });
    let out = '';
    let timedOut = false;
    const timer = Number.isFinite(limitMs) ? setTimeout(() => {
      timedOut = true;
      out += `\n[harness] killed after ${minutes(limitMs)}: the session deadline\n`;
      try { posix ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL'); } catch { /* already gone */ }
    }, Math.max(0, limitMs)) : null;
    child.on('error', (e) => { if (timer) clearTimeout(timer); resolve({ code: 127, out: `${out}\n[harness] could not start bash: ${e.message}\n`, timedOut }); });
    const take = (chunk) => {
      const s = chunk.toString();
      out += s;
      if (out.length > 4_000_000) out = out.slice(-2_000_000);
      process.stdout.write(s);
      if (log) fs.appendFileSync(log, s);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code, signal) => { if (timer) clearTimeout(timer); resolve({ code: code ?? (signal ? 128 : 1), out, timedOut }); });
  });
}

async function main() {
  const { REPO, PR, ACTOR, BRANCH, GH_TOKEN } = process.env;
  const os = process.env.HARNESS_OS || process.platform;
  const idleMs = Number(process.env.IDLE_MINUTES || 15) * 60_000;
  const t0 = process.env.HARNESS_T0 ? Number(process.env.HARNESS_T0) * 1000 : Date.now();
  const deadline = t0 + Number(process.env.DEADLINE_MINUTES || 90) * 60_000;
  const pollMs = Number(process.env.POLL_SECONDS || 15) * 1000;
  const docsSite = process.env.DOCS_SITE === '1';
  const out = path.resolve('harness-artifacts');
  fs.mkdirSync(out, { recursive: true });
  const ref = `refs/remotes/origin/${BRANCH}`;
  // An explicit refspec: a bare branch name resolves tags first, and a tag named like the branch would make the fetched
  // commit and ls-remote's disagree on every poll, so watch would re-run the job back to back.
  const fetchBranch = () => { git('fetch', '--depth=1', 'origin', `+refs/heads/${BRANCH}:${ref}`); return git('rev-parse', ref); };

  // The pull request must be this branch, in this repository: otherwise one branch's code would report on another's PR.
  const pr = await api('GET', `/repos/${REPO}/pulls/${PR}`);
  if (pr.head.ref !== BRANCH || pr.head.repo?.full_name !== REPO) {
    throw new Error(`PR #${PR} is ${pr.head.repo?.full_name}:${pr.head.ref}, not ${REPO}:${BRANCH}; refusing to serve it`);
  }
  // Dispatching needs write access already; check it anyway, so the harness never runs for anyone who could not push.
  const perm = await api('GET', `/repos/${REPO}/collaborators/${encodeURIComponent(ACTOR)}/permission`);
  if (!canWrite(perm)) throw new Error(`${ACTOR} has ${perm?.permission ?? 'no'} permission on ${REPO}; the harness serves only a login that can push`);

  const reply = async (text) => {
    try {
      await api('POST', `/repos/${REPO}/issues/${PR}/comments`, { body: `${MARK}\n${redact(text, GH_TOKEN)}` });
    } catch (e) {
      console.error(`reply failed: ${e.message}`);
    }
  };
  const started = Date.now();
  let head = git('rev-parse', 'HEAD');
  let builtAt = head; // the commit dist/ and docs/dist were last built from; it lags `head` after a failed or skipped build
  let lastJob = null;
  let watch = true;
  let lastActivity = Date.now();
  let lastWatched = head;
  let jobs = 0;
  let errors = 0;
  const seen = new Set();
  // GitHub's `since` filters on updated_at at one-second grain; ask a minute back and dedupe by id.
  let cursor = new Date(started - 60_000).toISOString();

  // The one reply that must land: if the harness cannot comment, nobody can see it, so fail loudly instead of looping.
  await api('POST', `/repos/${REPO}/issues/${PR}/comments`, { body: `${MARK}\n**harness ready** on \`${os}\` at \`${head.slice(0, 7)}\`, taking commands from \`${ACTOR}\`. ` +
    `Post \`/harness suite <name>\`, \`/harness sh\` + a bash block, \`rerun\`, \`watch on|off\`, \`status\` or \`stop\`. ` +
    `Idle stop after ${minutes(idleMs)}, hard stop in ${minutes(deadline - Date.now())}. [run](${process.env.RUN_URL})` });

  async function sync(noBuild) {
    const next = fetchBranch();
    const tStart = Date.now();
    if (next !== head) { git('reset', '--hard', next); head = next; }
    if (builtAt === head) return { took: 0, note: '' };
    if (noBuild) return { took: 0, note: `rebuild skipped (--no-build); dist/ is from \`${builtAt.slice(0, 7)}\`` };
    const need = rebuildFor(git('diff', '--name-only', builtAt, head).split('\n').filter(Boolean));
    const steps = [];
    if (need.install) steps.push('npm ci');
    if (need.build) steps.push('npm run build');
    if (docsSite && need.docs) {
      // Drop the marker first: a failed docs build must not leave run.sh serving the old site as "prebuilt".
      steps.push(`rm -f docs/dist/.prebuilt && (cd docs && ${need.docsInstall ? 'npm ci && ' : ''}npm run build:e2e) && printf '%s built on the harness\\n' "$(git rev-parse HEAD)" > docs/dist/.prebuilt`);
    }
    if (steps.length) {
      const r = await run(`set -e\n${steps.join('\n')}`, jobEnv(), null, deadline - Date.now());
      if (r.code !== 0) return { took: Date.now() - tStart, failed: true, out: r.out, note: steps.join(' && ') };
    }
    builtAt = head;
    return { took: Date.now() - tStart, note: steps.length ? steps.map((x) => x.startsWith('rm -f') ? 'docs build:e2e' : x).join(', ') : 'nothing to rebuild' };
  }

  async function execute(job, why) {
    jobs += 1;
    const n = jobs;
    lastActivity = Date.now();
    const label = job.verb === 'suite' ? `suite ${job.suite}${Object.keys(job.env).length ? ' ' + Object.entries(job.env).map(([k, v]) => `${k}=${v}`).join(' ') : ''}` : 'sh';
    const s = await sync(job.noBuild);
    lastWatched = head;
    if (s.failed) {
      await reply(`**harness #${n}** \`${label}\`: the rebuild for \`${head.slice(0, 7)}\` FAILED (\`${s.note}\`), so the job did not run. The next job retries the rebuild.\n\n<details open><summary>last ${TAIL_LINES} lines</summary>\n\n\`\`\`\n${tail(s.out)}\n\`\`\`\n</details>`);
      return;
    }
    let script;
    if (job.verb === 'suite') {
      // Read after the sync, so a suite the latest push added or changed is the one that runs.
      const registry = JSON.parse(fs.readFileSync('.github/platform-suites.json', 'utf8')).suites;
      const entry = registry.find((e) => e.name === job.suite);
      if (!entry) { await reply(`**harness #${n}**: no suite \`${job.suite}\` in .github/platform-suites.json at \`${head.slice(0, 7)}\`.`); return; }
      if (!entry.os.includes(os)) { await reply(`**harness #${n}**: \`${job.suite}\` runs on ${entry.os.join(', ')}, and this harness is \`${os}\`.`); return; }
      const clash = inlineAssignments(entry.run).filter((k) => k in job.env);
      if (clash.length) { await reply(`**harness #${n}**: \`${job.suite}\` sets ${clash.map((k) => `\`${k}\``).join(', ')} itself (\`${entry.run}\`), which would beat yours. Use \`/harness sh\` with the command written out.`); return; }
      script = entry.run;
    } else {
      script = job.script;
    }
    const left = deadline - Date.now();
    if (left < 60_000) { await reply(`**harness #${n}**: less than a minute before the hard stop; not starting \`${label}\`.`); return; }
    fs.rmSync('platform-suite-artifacts', { recursive: true, force: true });
    const log = path.join(out, `job-${n}.log`);
    const tJob = Date.now();
    const r = await run(script, jobEnv({ ...(job.env || {}), SUITE_NAME: job.suite || 'sh', SUITE_OS: os, HARNESS_JOB: String(n) }), log, left);
    if (fs.existsSync('platform-suite-artifacts')) fs.cpSync('platform-suite-artifacts', path.join(out, `job-${n}`), { recursive: true });
    lastActivity = Date.now();
    const verdict = r.timedOut ? 'KILLED at the hard stop' : r.code === 0 ? 'passed' : `FAILED (exit ${r.code})`;
    await reply([
      `**harness #${n}** \`${label}\` on \`${head.slice(0, 7)}\`: **${verdict}** in ${minutes(Date.now() - tJob)}` +
        `${s.note ? ` (synced in ${minutes(s.took)}: ${s.note})` : ''}${why ? ` — ${why}` : ''}.`,
      '',
      `<details${r.code === 0 ? '' : ' open'}><summary>last ${TAIL_LINES} lines</summary>`,
      '',
      '```',
      tail(r.out),
      '```',
      '</details>',
      '',
      `Full log and any \`platform-suite-artifacts/\` upload as \`harness-${os}\` when the session ends. [run](${process.env.RUN_URL})`,
    ].join('\n'));
  }

  async function poll() {
    const all = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await api('GET', `/repos/${REPO}/issues/${PR}/comments?since=${encodeURIComponent(cursor)}&per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all.sort((a, b) => a.id - b.id);
  }

  /** One pass: read commands and run them. Returns 'stop' to end the session. */
  async function tick() {
    for (const c of await poll()) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.updated_at > cursor) cursor = c.updated_at;
      const cmd = parseCommand(c.body);
      if (!cmd) continue;
      if (!authorized(c, { actor: ACTOR, since: started })) {
        console.log(`ignored comment ${c.id} by ${c.user?.login}: only ${ACTOR}'s comments after the start run`);
        continue;
      }
      if (cmd.verb === 'invalid') { await reply(`**harness**: ${cmd.error}.`); continue; }
      if (cmd.verb === 'stop') return 'stop';
      if (cmd.verb === 'status') {
        await reply(`**harness status**: \`${os}\` at \`${head.slice(0, 7)}\` (built at \`${builtAt.slice(0, 7)}\`), ${jobs} job(s), watch ${watch ? 'on' : 'off'}, ` +
          `idle stop in ${minutes(idleMs - (Date.now() - lastActivity))}, hard stop in ${minutes(deadline - Date.now())}.`);
        lastActivity = Date.now();
        continue;
      }
      if (cmd.verb === 'watch') { watch = cmd.watch; lastActivity = Date.now(); await reply(`**harness**: watch ${watch ? 'on' : 'off'}.`); continue; }
      if (cmd.verb === 'rerun') {
        if (!lastJob) { await reply('**harness**: nothing to re-run yet.'); continue; }
        await execute({ ...lastJob, noBuild: cmd.noBuild }, 'rerun');
        continue;
      }
      lastJob = cmd;
      await execute(cmd);
    }
    if (watch && lastJob) {
      const remote = git('ls-remote', 'origin', `refs/heads/${BRANCH}`).split(/\s/)[0];
      // Once per remote commit: lastWatched only moves forward when a job synced to it, so a mismatch cannot spin.
      if (remote && remote !== head && remote !== lastWatched) {
        lastWatched = remote;
        await execute({ ...lastJob, noBuild: false }, 'new commit');
      }
    }
    return 'continue';
  }

  for (;;) {
    if (Date.now() >= deadline - 60_000) { await reply(`**harness stopping**: hard deadline reached after ${jobs} job(s).`); break; }
    if (Date.now() - lastActivity >= idleMs) { await reply(`**harness stopping**: idle for ${minutes(idleMs)} after ${jobs} job(s).`); break; }
    try {
      if ((await tick()) === 'stop') { await reply(`**harness stopping** on request after ${jobs} job(s).`); break; }
      errors = 0;
    } catch (e) {
      // A transient API or git failure must not end a session that cost 17 minutes to warm; five in a row does.
      errors += 1;
      console.error(`harness error ${errors}/5: ${e.stack || e.message}`);
      if (errors >= 5) { await reply(`**harness stopping**: five errors in a row; the last was \`${String(e.message).slice(0, 300)}\`.`); throw e; }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}

module.exports = { parseCommand, authorized, canWrite, rebuildFor, inlineAssignments, redact, tail, jobEnv, MARK };
