/**
 * The shared builder for a workspace library under docs/src/lib/<name>/: ESM + CJS bundles
 * and `.d.ts` declarations into its gitignored `dist/`, or `--check` that `dist/` is current.
 *
 * Extracted from tools/build-suono-lib.js so a NEW library is a few lines over this rather
 * than a ninth ~300-line copy. Every builder now runs on it: tavola, and the eight that were
 * ~300-line near-copies (cadenza, calco, lente, ltt, segno, suono, trama, vetrina), each of
 * which states only what is particular to it through the optional settings below. Each
 * setting defaults to what tavola, the first user, builds with, and each of the eight passes
 * the values its own copy used, so its dist/ is byte-for-byte what that copy built.
 * What every library shares:
 *
 * - Build into a pid-suffixed sibling staging directory and swap it in only on success, so a
 *   failed build never leaves `dist/` deleted, and two concurrent runs never write into each
 *   other's tree (#2117). A dead run's staging is swept by pid.
 * - Losing the final swap to a concurrent run is not a failure when what landed is what we
 *   built: the build is deterministic, so equal trees mean the job is done.
 * - A rebuild that would change nothing touches nothing. The build goes to a scratch folder
 *   outside the repo first, and only output that differs from `dist/` is staged in the tree
 *   and swapped in. `npm pack` runs this through `prepack`, and test/unit/tools/
 *   package-nodenext-types.test.js packs every library while other unit tests walk
 *   docs/src/lib in parallel; deleting an unchanged `dist/` (or creating a `.dist.tmp-*`
 *   beside it) under them failed CI with ENOENT (#2613).
 */

const esbuild = require('esbuild');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const TSC = require.resolve('typescript/bin/tsc');
const STAGING_PREFIX = '.dist.tmp-';

/** Every `.ts` source under `dir`, tests and declarations excluded, sorted. */
function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'dist' || e.name.startsWith('.') || e.name === 'node_modules') continue;
      out.push(...sourceFiles(p));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out.sort();
}

function readTree(dir, base = dir) {
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      for (const [rel, contents] of readTree(full, base)) out.set(rel, contents);
    } else {
      out.set(path.relative(base, full), fs.readFileSync(full, 'utf8'));
    }
  }
  return out;
}

/** Symmetric: `extra:` covers a file present only in `have`. */
function diffTrees(want, have) {
  const drift = [];
  for (const [name, contents] of want) {
    if (!have.has(name)) drift.push(`missing: ${name}`);
    else if (have.get(name) !== contents) drift.push(`changed: ${name}`);
  }
  for (const name of have.keys()) if (!want.has(name)) drift.push(`extra: ${name}`);
  return drift;
}

/**
 * @param {object} spec
 * @param {string} spec.name       the folder under docs/src/lib/, e.g. 'tavola'
 * @param {{ entry: string, out: string }[]} spec.entries  source path (relative to the
 *   library) and output basename, e.g. { entry: 'adapters/trystero.ts', out: 'trystero' }
 * @param {string[]} [spec.external]  bare packages left as imports (peer dependencies)
 * @param {'node'|'neutral'|'browser'} [spec.platform]
 * @param {string} [spec.script]   the npm script that rebuilds it, named in messages
 * @param {string} [spec.target]   esbuild's target (default es2022). A library whose functions
 *   ship as `fn.toString()` source (calco, trama) needs es2022 so nothing is lowered into a
 *   helper outside a function.
 * @param {Record<string, string>} [spec.alias]  esbuild aliases: a sibling library inlined
 *   from SOURCE, so this build never waits on that library's dist/ (builders run in parallel)
 * @param {(entry: string) => string} [spec.banner]  the banner for one entry's bundles
 *   (default: one banner naming docs/src/lib/<name>/*.ts)
 * @param {{ module: string, moduleResolution: string, lib?: string | null }} [spec.types]
 *   tsc's module settings for the declarations (default nodenext, with lib es2022,dom;
 *   `lib: null` passes no --lib)
 * @param {boolean} [spec.outfile]  write each bundle with esbuild's `outfile`, as the eight
 *   older copies did. The bytes differ only in a name: esbuild calls a CJS bundle's export
 *   object after the FILE that way (`index_exports`) and after the folder otherwise
 *   (`tavola_exports`). Kept so those eight dists stay byte-identical.
 * @param {() => Promise<void> | void} [spec.preflight]  runs before anything is built; it
 *   exits the process itself to refuse (segno refuses a stale generated grammar)
 */
function defineLibraryBuild(spec) {
  const LIB_DIR = path.join(ROOT, 'docs', 'src', 'lib', spec.name);
  const DIST_DIR = path.join(LIB_DIR, 'dist');
  const tag = `[build-${spec.name}-lib]`;
  const script = spec.script ?? `${spec.name}-lib:build`;
  const banner =
    spec.banner ??
    (() => `/* Auto-generated by tools/build-${spec.name}-lib.js — DO NOT EDIT.\n` + `   Source: docs/src/lib/${spec.name}/*.ts. Rebuild: npm run ${script} */`);
  const types = spec.types ?? { module: 'nodenext', moduleResolution: 'nodenext', lib: 'es2022,dom' };

  // One esbuild call per entry and format: with no code splitting it is the same bundle a
  // multi-entry call writes, and it lets each entry carry its own banner.
  async function buildBundles(outDir) {
    for (const e of spec.entries) {
      for (const { format, ext } of [{ format: 'cjs', ext: 'cjs' }, { format: 'esm', ext: 'mjs' }]) {
        await esbuild.build({
          ...(spec.outfile
            ? { entryPoints: [path.join(LIB_DIR, e.entry)], outfile: path.join(outDir, `${e.out}.${ext}`) }
            : { entryPoints: { [e.out]: path.join(LIB_DIR, e.entry) }, outdir: outDir, outExtension: { '.js': `.${ext}` } }),
          bundle: true,
          format,
          platform: spec.platform ?? 'neutral',
          target: [spec.target ?? 'es2022'],
          external: spec.external ?? [],
          minify: false,
          legalComments: 'none',
          // Pin the TS config INLINE so esbuild never auto-discovers docs/tsconfig.json, whose
          // `extends astro/...` resolves in some environments and not others: an empty raw
          // config makes the emitted bytes the same everywhere.
          tsconfigRaw: '{}',
          ...(spec.alias ? { alias: spec.alias } : {}),
          banner: { js: banner(e.entry) },
          logLevel: 'silent',
        });
      }
    }
  }

  function buildTypes(outDir) {
    const r = spawnSync(
      process.execPath,
      [
        TSC, '--declaration', '--emitDeclarationOnly', '--outDir', outDir, '--rootDir', LIB_DIR,
        '--module', types.module, '--moduleResolution', types.moduleResolution, '--target', 'es2022',
        '--strict', '--skipLibCheck', ...(types.lib === null ? [] : ['--lib', types.lib ?? 'es2022,dom']), ...sourceFiles(LIB_DIR),
      ],
      { cwd: ROOT, stdio: 'inherit' },
    );
    if (r.status !== 0) throw new Error('tsc declaration emit failed');
  }

  async function buildInto(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    await buildBundles(outDir);
    buildTypes(outDir);
  }

  function sweepStaleStaging() {
    let entries;
    try {
      entries = fs.readdirSync(LIB_DIR);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.startsWith(STAGING_PREFIX)) continue;
      const pid = Number(name.slice(STAGING_PREFIX.length));
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
      try {
        process.kill(pid, 0);
        continue; // still running
      } catch (e) {
        if (e.code === 'EPERM') continue; // exists, not ours
      }
      fs.rmSync(path.join(LIB_DIR, name), { recursive: true, force: true });
    }
  }

  function installStaging(staging) {
    const want = readTree(staging);
    for (let attempt = 0; ; attempt++) {
      try {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
        fs.renameSync(staging, DIST_DIR);
        return;
      } catch (e) {
        let installed;
        try {
          installed = readTree(DIST_DIR);
        } catch {
          installed = null;
        }
        if (installed && !diffTrees(want, installed).length) return;
        if (attempt >= 4 || !fs.existsSync(staging)) throw e;
      }
    }
  }

  async function main(argv = process.argv.slice(2)) {
    const check = argv.includes('--check');
    const silent = argv.includes('--silent') || check;
    if (spec.preflight) await spec.preflight();
    if (check) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${spec.name}-lib-`));
      try {
        await buildInto(tmp);
        const drift = diffTrees(readTree(tmp), readTree(DIST_DIR));
        if (drift.length) {
          console.error(`${tag} STALE — run \`npm run ${script}\`:\n  ${drift.join('\n  ')}`);
          process.exit(1);
        }
        if (!silent) console.log(`${tag} up to date.`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      return;
    }
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `${spec.name}-lib-`));
    const staging = path.join(LIB_DIR, `${STAGING_PREFIX}${process.pid}`);
    try {
      await buildInto(scratch);
      let current = null;
      try {
        current = readTree(DIST_DIR);
      } catch {
        // no dist/ yet
      }
      if (current && !diffTrees(readTree(scratch), current).length) {
        if (!silent) console.log(`${tag} ${path.relative(ROOT, DIST_DIR)}/ is already current; left it untouched.`);
        return;
      }
      // Staging stays in LIB_DIR, beside dist/, so the final rename never crosses filesystems.
      sweepStaleStaging();
      fs.rmSync(staging, { recursive: true, force: true });
      fs.cpSync(scratch, staging, { recursive: true });
      installStaging(staging);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
      fs.rmSync(staging, { recursive: true, force: true });
    }
    if (!silent) {
      console.log(`${tag} wrote ${path.relative(ROOT, DIST_DIR)}/ (${[...readTree(DIST_DIR).keys()].join(', ')})`);
    }
  }

  return {
    main,
    run() {
      main().catch((e) => {
        console.error(`${tag} failed:`, e.message);
        process.exit(1);
      });
    },
  };
}

module.exports = { defineLibraryBuild, diffTrees, readTree };
