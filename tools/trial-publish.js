#!/usr/bin/env node
/**
 * Trial publish: publish the engine and its libraries to a throwaway local registry, install
 * `@laticent/lattice` into an empty folder from it, and render a deck with what got installed.
 *
 * Why: every other test runs the engine from this repository, where every package is installed
 * and every workspace library is symlinked. Only a real publish and a real install show what a
 * user gets: a library npm refuses to publish (`"private": true`), a file the `files` list
 * leaves out, a dependency the engine forgot to declare. The release desk measured the shape on
 * 2026-11-23 (#3438's trial): the engine plus its libraries publish in about 10 s, a cold
 * install takes 11 s, a render 5 s.
 *
 * What it does, in order, and the phase name each prints a time for:
 *   check    every @laticent package the engine depends on (and those depend on) is a
 *            workspace npm will publish. A private one fails here, before anything starts,
 *            because `npm install @laticent/lattice` could never resolve it.
 *   registry starts Verdaccio (pinned) on 127.0.0.1 with storage in a temp folder.
 *   libraries publishes every non-private library under docs/src/lib/, each through its own
 *            prepack (tools/library-prepack.js builds its dist/ and copies the license).
 *   engine   stages packages/lattice/ (tools/stage-engine-package.js) and publishes it with
 *            --ignore-scripts: the build is the caller's (CI already ran it), and the engine's
 *            prepublishOnly would run `npm run build && npm test` again.
 *   install  `npm install @laticent/lattice` into an empty folder whose .npmrc points only the
 *            @laticent scope at the local registry; the rest comes from npmjs, pinned to the
 *            repository lockfile's versions (pinnedOverrides) so a release npmjs published a
 *            minute ago cannot turn the job red. With npmjs down, this phase fails, and says so.
 *   render   `lattice --version` and `lat --version` print the published version, the root
 *            import returns the engine from require and import, and the installed CLI renders
 *            a 4-slide deck (a list, display math, a Mermaid diagram, a two-pane slide) to a
 *            PDF with 4 pages.
 * Then it stops the registry and removes the temp folder and the staged files, pass or fail.
 *
 * It does not build: run `npm run build` first (dist/ must exist). The render needs Chrome
 * (CHROME_PATH, or Puppeteer's own download). Linux and macOS only: it spawns npm and npx
 * without a shell and stops the registry by process group, neither of which Windows supports.
 *
 * A failure names its phase. A red `install` usually means npmjs (down, or a fresh release of
 * one of the few packages the lockfile cannot pin); a red `check`, `engine` or `render` is ours.
 *
 * Usage:
 *   node tools/trial-publish.js            run it; exit 0 on success, 1 on a failure
 *   node tools/trial-publish.js --keep     leave the temp folder for inspection
 *
 * TRIAL_PUBLISH_COMMAND swaps the publish step. When it is set, the `libraries` and `engine`
 * phases are replaced by that shell command, run from the repository root with
 * NPM_CONFIG_USERCONFIG pointing at an npmrc that names the local registry and its token (so a
 * plain `npm publish`, or a tool that calls it, publishes there) and TRIAL_REGISTRY_URL set. The
 * check, install and render phases are unchanged, so a release tool proves its own publish path:
 *   TRIAL_PUBLISH_COMMAND='npx changeset publish' node tools/trial-publish.js
 *
 * The CI job is .github/workflows/trial-publish.yml. RELEASE.md §The distribution contract
 * points here.
 */
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const VERDACCIO = 'verdaccio@6.1.6';
const ENGINE = '@laticent/lattice';
const SCOPE = '@laticent/';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * The workspaces the root declares, read from their own package.json files.
 * @returns {Map<string, {dir: string, private: boolean, dependencies: object}>} keyed by name
 */
function workspaces(root = ROOT) {
  const out = new Map();
  for (const dir of readJson(path.join(root, 'package.json')).workspaces || []) {
    const file = path.join(root, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = readJson(file);
    out.set(pkg.name, { dir, private: pkg.private === true, dependencies: { ...pkg.dependencies, ...pkg.optionalDependencies } });
  }
  return out;
}

/** The libraries a publish sends: every non-private workspace under docs/src/lib/. */
function publishSet(root = ROOT) {
  return [...workspaces(root)].filter(([, w]) => !w.private && w.dir.startsWith('docs/src/lib/')).map(([name]) => name).sort();
}

/**
 * Why an install of the engine could not resolve: each @laticent package the engine needs,
 * directly or through another @laticent package, that is not a workspace or is private.
 * @returns {string[]} one plain sentence per blocker; empty when the install can resolve
 */
function blockers(root = ROOT) {
  const ws = workspaces(root);
  const problems = [];
  const seen = new Set();
  const visit = (name, via) => {
    if (seen.has(name)) return;
    seen.add(name);
    const w = ws.get(name);
    if (!w) {
      problems.push(`${name} (needed by ${via}) is not a workspace of this repository, so this trial cannot publish it`);
      return;
    }
    if (w.private && name !== ENGINE) {
      problems.push(`${name} (needed by ${via}) is "private": true in ${w.dir}/package.json, so npm will not publish it and \`npm install ${ENGINE}\` cannot resolve it`);
    }
    for (const dep of Object.keys(w.dependencies || {})) if (dep.startsWith(SCOPE)) visit(dep, name);
  };
  visit(ENGINE, 'the install');
  return problems;
}

/**
 * The package an `npm install` failure could not fetch, when the failure is npmjs's and not ours:
 * an E404 or ETARGET for a package outside @laticent. A version npmjs has just published can be
 * listed in its metadata minutes before its tarball serves (#3471's trial met `@bramus/specificity`
 * 2.4.4 404ing for over 3 minutes after its release). A miss on an @laticent package is never
 * upstream: the trial published those itself, so it fails at once.
 * @param {string} output  npm's stderr and stdout
 * @returns {string|null} the missing package's name, or null when the failure is not that
 */
function upstreamMiss(output) {
  let name = null;
  const get = /404 Not Found - GET (\S+)/.exec(output);
  if (get) {
    // https://registry/<name>[/-/<file>.tgz], <name> being `pkg`, `@scope/pkg` or `@scope%2fpkg`
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(get[1]).pathname).replace(/^\/+/, '');
    } catch {
      return null;
    }
    const parts = pathname.split('/-/')[0].split('/');
    name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  } else {
    const nv = /No matching version found for (@?[^@\s]+)@/.exec(output);
    if (nv) name = nv[1];
  }
  if (!name || name.startsWith(SCOPE)) return null;
  return name;
}

/**
 * Exact versions for the clean install's third-party packages, from the repository's lockfile.
 * Without them the install takes the newest version in range at that minute, which can be a
 * release npmjs has listed but not yet served (#3471's trial: @bramus/specificity 2.4.4, a 404
 * for minutes). A name the lockfile holds at one version only is pinned to it; a name it holds at
 * several (an old major beside a new one) cannot be forced to one without breaking a dependent,
 * so it stays on its range. @laticent packages are the trial's own and are never pinned.
 * @returns {{overrides: Record<string, string>, floating: string[]}}
 */
function pinnedOverrides(lock) {
  const versions = new Map();
  for (const [key, pkg] of Object.entries(lock.packages || {})) {
    const at = key.lastIndexOf('node_modules/');
    if (at < 0 || pkg.link || !pkg.version) continue;
    const name = key.slice(at + 'node_modules/'.length);
    if (name.startsWith(SCOPE)) continue;
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(pkg.version);
  }
  const overrides = {};
  const floating = [];
  for (const [name, set] of [...versions].sort(([a], [b]) => a.localeCompare(b))) {
    if (set.size === 1) overrides[name] = [...set][0];
    else floating.push(name);
  }
  return { overrides, floating };
}

/** The deck the installed CLI renders: each slide reaches a different part of the engine. */
const DECK = [
  '---\ntheme: indaco\n---',
  '## Revenue grew\n\n- EMEA leads\n- APAC holds',
  '## A formula\n\n$$ \\sigma(x) = \\frac{1}{1 + e^{-x}} $$',
  '## A diagram\n\n```mermaid\nflowchart LR\n  A --> B\n```',
  '<!-- _class: columns ratio-50-50 -->\n\n## Two panes\n\n<!-- _pane: content -->\n\n- Left pane\n\n<!-- _pane: content -->\n\n- Right pane',
].join('\n\n---\n\n');
const DECK_PAGES = 4;

/**
 * Run a command and resolve to its stdout. Asynchronous on purpose: a synchronous spawn blocks
 * the event loop, so a Ctrl-C or SIGTERM would wait for the whole trial before the cleanup ran.
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(new Error(`\`${cmd}\` did not start: ${err.message}`));
      reject(new Error(`\`${cmd} ${args.join(' ')}\` exited ${err.code ?? err.signal}\n${String(stdout).slice(-2000)}${String(stderr).slice(-4000)}`));
    });
  });
}

/** A port nothing is listening on: the OS picks it, so a stale local registry cannot answer for ours. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Wait until the registry answers, or fail at once if its process has already exited. */
async function waitForRegistry(url, deadlineMs, child, logFile) {
  let exited = null;
  child.once('exit', (code, signal) => { exited = code ?? signal; });
  const end = Date.now() + deadlineMs;
  const logTail = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-2000) : '');
  for (;;) {
    if (exited !== null) throw new Error(`the local registry exited (${exited}) before it answered:\n${logTail()}`);
    try {
      const res = await fetch(`${url}/-/ping`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > end) throw new Error(`the local registry did not answer at ${url} within ${deadlineMs / 1000} s:\n${logTail()}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  const keep = process.argv.includes('--keep');
  const times = [];
  let current = '';
  const phase = async (name, fn) => {
    const start = Date.now();
    current = name;
    process.stdout.write(`▸ ${name}\n`);
    const out = await fn();
    times.push([name, (Date.now() - start) / 1000]);
    return out;
  };

  const problems = await phase('check', () => blockers());
  if (problems.length) {
    console.error(`trial-publish: ${ENGINE} cannot be installed from a registry:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    return 1;
  }
  if (!fs.existsSync(path.join(ROOT, 'dist', 'lattice.js'))) {
    console.error('trial-publish: dist/ is not built. Run `npm run build` first.');
    return 1;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-trial-publish-'));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stager = require('./stage-engine-package.js');
  let registry;
  // The registry runs in its own process group (so one signal stops npx and Verdaccio together),
  // which also means a Ctrl-C here never reaches it. Stop it, and the staged files, on a signal too.
  const stopRegistry = () => {
    if (!registry) return;
    try {
      process.kill(-registry.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    registry = null;
  };
  const onSignal = (sig) => {
    stopRegistry();
    stager.clean(stager.stagedEntries());
    if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await phase('registry', async () => {
      fs.mkdirSync(path.join(tmp, 'storage'));
      fs.writeFileSync(path.join(tmp, 'config.yaml'), [
        `storage: ${path.join(tmp, 'storage')}`,
        'uplinks: {}',
        'packages:',
        "  '**':",
        '    access: $all',
        '    publish: $anonymous',
        `listen: 127.0.0.1:${port}`,
        `log: { type: file, path: ${path.join(tmp, 'verdaccio.log')}, level: warn }`,
        'max_body_size: 300mb',
      ].join('\n'));
      const out = fs.openSync(path.join(tmp, 'verdaccio.out'), 'a');
      registry = spawn('npx', ['--yes', VERDACCIO, '--config', path.join(tmp, 'config.yaml')], { cwd: tmp, detached: true, stdio: ['ignore', out, out] });
      await waitForRegistry(url, 120000, registry, path.join(tmp, 'verdaccio.out'));
    });

    // Every npm the publish step starts reads the registry and the token from this user config, so a
    // TRIAL_PUBLISH_COMMAND (a release tool that calls `npm publish` itself) needs no flags of ours.
    const npmrc = path.join(tmp, 'npmrc');
    fs.writeFileSync(npmrc, `registry=${url}/\n//127.0.0.1:${port}/:_authToken=trial-only\n`);
    const publishEnv = { ...process.env, NPM_CONFIG_USERCONFIG: npmrc, TRIAL_REGISTRY_URL: url };

    const custom = process.env.TRIAL_PUBLISH_COMMAND;
    if (custom) {
      // THE SWAPPABLE STEP. A release tool (Changesets, #3471) proves its own publish path here: its
      // command runs from the repo root against the local registry, in place of the two phases below.
      // It owns staging the engine (its prepack, or `node tools/stage-engine-package.js`) and should
      // leave the tree clean; the install and render phases then check what it published.
      await phase('publish (TRIAL_PUBLISH_COMMAND)', () => run('bash', ['-c', custom], { cwd: ROOT, env: publishEnv }));
    } else {
      const libs = publishSet();
      await phase(`libraries (${libs.length})`, async () => {
        for (const lib of libs) await run('npm', ['publish', '--workspace', lib], { cwd: ROOT, env: publishEnv });
      });
      await phase('engine', async () => {
        const entries = stager.stagedEntries();
        try {
          stager.stage(entries);
          await run('npm', ['publish', '--workspace', ENGINE, '--ignore-scripts'], { cwd: ROOT, env: publishEnv });
        } finally {
          stager.clean(entries);
        }
      });
    }
    const version = readJson(stager.MANIFEST).version;

    const room = path.join(tmp, 'room');
    await phase('install', async () => {
      fs.mkdirSync(room);
      const { overrides } = pinnedOverrides(readJson(path.join(ROOT, 'package-lock.json')));
      fs.writeFileSync(path.join(room, 'package.json'), `${JSON.stringify({ name: 'trial-room', private: true, overrides }, null, 2)}\n`);
      fs.writeFileSync(path.join(room, '.npmrc'), `${SCOPE.slice(0, -1)}:registry=${url}/\n`);
      const install = () => run('npm', ['install', ENGINE, '--no-audit', '--no-fund', '--cache', path.join(tmp, 'cache')], {
        cwd: room,
        env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' },
      });
      try {
        await install();
      } catch (e) {
        // One retry, and only for a third-party package npmjs has not finished serving
        // (upstreamMiss). The pins above make that rare: only a name the lockfile holds at several
        // versions can still float to a fresh release. Anything else, ours above all, fails here.
        const missing = upstreamMiss(e.message);
        if (!missing) throw e;
        console.log(`  npmjs could not serve ${missing} yet (a fresh upstream release?); retrying the install once in 90 s`);
        await new Promise((r) => setTimeout(r, 90000));
        await install();
      }
    });

    await phase('render', async () => {
      const bin = path.join(room, 'node_modules', '.bin');
      for (const name of ['lattice', 'lat']) {
        const out = (await run(path.join(bin, name), ['--version'], { cwd: room })).trim();
        if (out !== `lattice ${version}`) throw new Error(`\`${name} --version\` printed "${out}", not "lattice ${version}"`);
      }
      await run(process.execPath, ['-e', `if (typeof require('${ENGINE}').render !== 'function') process.exit(1)`], { cwd: room });
      await run(process.execPath, ['--input-type=module', '-e', `const m = await import('${ENGINE}'); if (typeof m.default.render !== 'function') process.exit(1);`], { cwd: room });
      fs.writeFileSync(path.join(room, 'deck.md'), DECK);
      await run(path.join(bin, 'lattice'), ['deck.md', 'deck.pdf', '--quiet'], { cwd: room });
      const pdf = fs.readFileSync(path.join(room, 'deck.pdf'));
      if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('the installed CLI wrote a deck.pdf that is not a PDF');
      const pages = Number(await run(process.execPath, ['-e', `require('pdf-lib').PDFDocument.load(require('fs').readFileSync(${JSON.stringify(path.join(room, 'deck.pdf'))})).then((d) => process.stdout.write(String(d.getPageCount())))`], { cwd: ROOT }));
      if (pages !== DECK_PAGES) throw new Error(`the rendered deck has ${pages} pages, not ${DECK_PAGES}`);
    });
  } catch (e) {
    console.error(`trial-publish: failed in the ${current} phase: ${e.message}`);
    return 1;
  } finally {
    stopRegistry();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    if (keep) console.log(`trial-publish: kept ${tmp}`);
    else {
      try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
      } catch (e) {
        console.error(`trial-publish: could not remove ${tmp}: ${e.message}`);
      }
    }
  }
  console.log('\ntrial-publish: OK');
  for (const [name, s] of times) console.log(`  ${name.padEnd(16)} ${s.toFixed(1)} s`);
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`trial-publish: ${e.stack || e}`);
      process.exit(1);
    },
  );
}

module.exports = { publishSet, blockers, workspaces, upstreamMiss, pinnedOverrides };
