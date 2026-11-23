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
 *            prepublishOnly would only re-run the unit suite.
 *   install  `npm install @laticent/lattice` into an empty folder whose .npmrc points only the
 *            @laticent scope at the local registry; the rest comes from npmjs as for a user.
 *   render   `lattice --version` and `lat --version` print the published version, the root
 *            import returns the engine from require and import, and the installed CLI renders
 *            a 4-slide deck (a list, display math, a Mermaid diagram, a two-pane slide) to a
 *            PDF with 4 pages.
 * Then it stops the registry and removes the temp folder and the staged files, pass or fail.
 *
 * It does not build: run `npm run build` first (dist/ must exist). The render needs Chrome
 * (CHROME_PATH, or Puppeteer's own download).
 *
 * Usage:
 *   node tools/trial-publish.js            run it; exit 0 on success, 1 on a failure
 *   node tools/trial-publish.js --keep     leave the temp folder for inspection
 *
 * The CI job is .github/workflows/trial-publish.yml. RELEASE.md §The distribution contract
 * points here.
 */
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
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

/** The deck the installed CLI renders: each slide reaches a different part of the engine. */
const DECK = [
  '---\ntheme: indaco\n---',
  '## Revenue grew\n\n- EMEA leads\n- APAC holds',
  '## A formula\n\n$$ \\sigma(x) = \\frac{1}{1 + e^{-x}} $$',
  '## A diagram\n\n```mermaid\nflowchart LR\n  A --> B\n```',
  '<!-- _class: columns ratio-50-50 -->\n\n## Two panes\n\n<!-- _pane: content -->\n\n- Left pane\n\n<!-- _pane: content -->\n\n- Right pane',
].join('\n\n---\n\n');
const DECK_PAGES = 4;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` exited ${r.status ?? r.signal}\n${(r.stdout || '').slice(-2000)}${(r.stderr || '').slice(-4000)}`);
  }
  return r.stdout;
}

async function waitForRegistry(url, deadlineMs) {
  const end = Date.now() + deadlineMs;
  for (;;) {
    try {
      const res = await fetch(`${url}/-/ping`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > end) throw new Error(`the local registry did not answer at ${url} within ${deadlineMs / 1000} s`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  const keep = process.argv.includes('--keep');
  const times = [];
  const phase = async (name, fn) => {
    const start = Date.now();
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
  const port = 4873 + Math.floor(Math.random() * 1000); // flaky-ok: a free-port pick, not test input
  const url = `http://127.0.0.1:${port}`;
  const auth = `--//127.0.0.1:${port}/:_authToken=trial-only`;
  const stager = require('./stage-engine-package.js');
  let registry;
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
      registry = spawn('npx', ['--yes', VERDACCIO, '--config', path.join(tmp, 'config.yaml')], { cwd: tmp, detached: true, stdio: 'ignore' });
      await waitForRegistry(url, 120000);
    });

    const libs = publishSet();
    await phase(`libraries (${libs.length})`, () => {
      for (const lib of libs) run('npm', ['publish', '--workspace', lib, '--registry', url, auth], { cwd: ROOT });
    });

    const version = readJson(stager.MANIFEST).version;
    await phase('engine', () => {
      const entries = stager.stagedEntries();
      try {
        stager.stage(entries);
        run('npm', ['publish', '--workspace', ENGINE, '--ignore-scripts', '--registry', url, auth], { cwd: ROOT });
      } finally {
        stager.clean(entries);
      }
    });

    const room = path.join(tmp, 'room');
    await phase('install', () => {
      fs.mkdirSync(room);
      fs.writeFileSync(path.join(room, 'package.json'), '{"name":"trial-room","private":true}\n');
      fs.writeFileSync(path.join(room, '.npmrc'), `${SCOPE.slice(0, -1)}:registry=${url}/\n`);
      run('npm', ['install', ENGINE, '--no-audit', '--no-fund', '--cache', path.join(tmp, 'cache')], {
        cwd: room,
        env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' },
      });
    });

    await phase('render', () => {
      const bin = path.join(room, 'node_modules', '.bin');
      for (const name of ['lattice', 'lat']) {
        const out = run(path.join(bin, name), ['--version'], { cwd: room }).trim();
        if (out !== `lattice ${version}`) throw new Error(`\`${name} --version\` printed "${out}", not "lattice ${version}"`);
      }
      run(process.execPath, ['-e', `if (typeof require('${ENGINE}').render !== 'function') process.exit(1)`], { cwd: room });
      run(process.execPath, ['--input-type=module', '-e', `const m = await import('${ENGINE}'); if (typeof m.default.render !== 'function') process.exit(1);`], { cwd: room });
      fs.writeFileSync(path.join(room, 'deck.md'), DECK);
      run(path.join(bin, 'lattice'), ['deck.md', 'deck.pdf', '--quiet'], { cwd: room });
      const pdf = fs.readFileSync(path.join(room, 'deck.pdf'));
      if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('the installed CLI wrote a deck.pdf that is not a PDF');
      const pages = Number(execFileSync(process.execPath, ['-e', `require('pdf-lib').PDFDocument.load(require('fs').readFileSync(${JSON.stringify(path.join(room, 'deck.pdf'))})).then((d) => process.stdout.write(String(d.getPageCount())))`], { cwd: ROOT, encoding: 'utf8' }));
      if (pages !== DECK_PAGES) throw new Error(`the rendered deck has ${pages} pages, not ${DECK_PAGES}`);
    });
  } catch (e) {
    console.error(`trial-publish: ${e.message}`);
    return 1;
  } finally {
    if (registry) {
      try {
        process.kill(-registry.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    if (keep) console.log(`trial-publish: kept ${tmp}`);
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('\ntrial-publish: OK');
  for (const [name, s] of times) console.log(`  ${name.padEnd(16)} ${s.toFixed(1)} s`);
  return 0;
}

if (require.main === module) main().then((code) => process.exit(code));

module.exports = { publishSet, blockers, workspaces };
