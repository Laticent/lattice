/**
 * `lattice packages list | add | check | export | remove`
 * (engineering/decisions/2026-09-23-portable-packages.md §6, phase 4).
 *
 *   lattice packages list   [--type theme|component|finish|motion]   shipped + installed, with a SOURCE column
 *   lattice packages add    <file.zip | folder> [--replace]          gate, then copy into the store
 *   lattice packages check  <file.zip | folder>                      gate only; installs nothing
 *   lattice packages export <type>/<name> [-o file.zip]              zip one package (refused if it carries code)
 *   lattice packages remove <type>/<name>                            installed packages only
 *
 *   --packages <dir>   use <dir> as the store for this run (default $LATTICE_HOME/packages,
 *                      else ~/.lattice/packages)
 *
 * Every package goes through the same spine the build and the Studio use: its role files are
 * found by suffix, the manifest owns the name, and a shipped name is taken as `<name>-custom`
 * (§3.7). CSS passes the same gates the Studio's Library import runs, with the same refusing
 * rules (lib/packages/import-gate.js). A package carrying JavaScript is refused by name:
 * code packages need a consent prompt and containment that do not exist yet (§3.5, phase 6).
 */

const fs = require('node:fs');
const path = require('node:path');
const { TYPES, kindOf } = require('./kinds.js');
const { readPackage } = require('./read.js');
const { writePackage } = require('./write.js');
const { createRegistry } = require('./index.js');
const { packagesRoot, readFolder, listInstalled, findInstalled, install, uninstall } = require('./home.js');
const { firstRefusal } = require('./import-gate.js');
const { renameComponentSelectors, renameClassDirectives } = require('./rename.js');
const { MAX_ZIP_BYTES, MAX_INFLATED_BYTES, MAX_ZIP_ENTRIES } = require('./limits.js');
const { gateThemeCss } = require('../theme/gate.js');
const { gateCss } = require('../layout/gate.js');
const SHIPPED = require('./packages.generated.json');
const { pkgRootFrom } = require('../core/pkg-root.js');

// The package root, found by walking up to package.json, so the store and the shipped index
// resolve the same way from a repo checkout and from an installed package.
const ROOT = pkgRootFrom(__dirname);
const TEXT_RE = /\.(css|md|json|svg|js|txt)$/i;

const USAGE = `usage: lattice packages <command> [options]

  list   [--type theme|component|finish|motion]   shipped and installed packages
  add    <file.zip | folder> [--replace]          gate a package, then install it
  check  <file.zip | folder>                      gate only; installs nothing
  export <type>/<name> [-o file.zip]              zip one package
  remove <type>/<name>                            remove an installed package

  --packages <dir>   use <dir> as the package store for this run
                     (default: $LATTICE_HOME/packages, else ~/.lattice/packages)`;

function parse(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = /^(--[a-z-]+)=(.*)$/.exec(a);
    if (eq) {
      flags[eq[1].slice(2)] = eq[2];
      continue;
    }
    if (a === '--type' || a === '--packages' || a === '-o' || a === '--output') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) throw new Error(`${a} requires a value`);
      flags[a === '-o' ? 'output' : a.slice(2)] = v;
      i++;
      continue;
    }
    if (a === '--replace' || a === '--help' || a === '-h') {
      flags[a.replace(/^-+/, '')] = true;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    pos.push(a);
  }
  return { flags, pos };
}

/** `<type>/<name>` → `{ type, name }`, or throw naming the expected form. */
function ref(arg) {
  const m = /^([a-z]+)\/([a-z][a-z0-9-]*)$/.exec(String(arg || ''));
  if (!m || !TYPES.includes(m[1])) throw new Error(`expected <type>/<name> with type one of ${TYPES.join(', ')} (got ${JSON.stringify(arg)})`);
  return { type: m[1], name: m[2] };
}

function jszip() {
  try {
    return require('jszip');
  } catch {
    throw new Error('reading or writing a .zip needs the `jszip` package, which is not installed here — unzip the file and pass the folder instead');
  }
}

/**
 * Every package folder in a zip or a directory: a folder holding a `*.manifest.json`,
 * optionally under a `<type>/` folder that says its type.
 * @returns {Promise<Array<{ folder: string, typeHint?: string, files: Record<string, string|Buffer> }>>}
 */
async function readSource(src) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    // The same byte budget as a zip's inflated total, so a folder is no way around it.
    let used = 0;
    const readCapped = (d) => {
      const files = readFolder(d);
      for (const body of Object.values(files)) used += body.length;
      if (used > MAX_INFLATED_BYTES) throw new Error(`${src} holds more than ${MAX_INFLATED_BYTES / 1024 / 1024} MB`);
      return files;
    };
    const hasManifest = (d) => fs.readdirSync(d).some((f) => f.endsWith('.manifest.json'));
    if (hasManifest(src)) return [{ folder: path.basename(src), files: readCapped(src) }];
    const out = [];
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = path.join(src, e.name);
      if (hasManifest(d)) out.push({ folder: e.name, files: readCapped(d) });
      else if (TYPES.includes(e.name)) {
        for (const c of fs.readdirSync(d, { withFileTypes: true })) {
          if (c.isDirectory() && hasManifest(path.join(d, c.name))) out.push({ folder: c.name, typeHint: e.name, files: readCapped(path.join(d, c.name)) });
        }
      }
    }
    return out;
  }
  if (st.size > MAX_ZIP_BYTES) throw new Error(`${src} is larger than ${MAX_ZIP_BYTES / 1024 / 1024} MB`);
  const zip = await jszip().loadAsync(fs.readFileSync(src));
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  if (paths.length > MAX_ZIP_ENTRIES) throw new Error(`${src} holds more than ${MAX_ZIP_ENTRIES} files`);
  // Refuse on the sizes the archive DECLARES before inflating anything — the Studio's
  // `declaredInflatedBytes` check. The running count below still catches an entry that lies.
  const declared = paths.reduce((n, p) => n + (Number(zip.files[p]?._data?.uncompressedSize) || 0), 0);
  if (declared > MAX_INFLATED_BYTES) throw new Error(`${src} inflates past ${MAX_INFLATED_BYTES / 1024 / 1024} MB`);
  const dirs = [...new Set(paths.filter((p) => p.endsWith('.manifest.json') && p.includes('/')).map((p) => p.slice(0, p.lastIndexOf('/'))))].sort();
  let used = 0;
  const out = [];
  for (const dir of dirs) {
    const segs = dir.split('/');
    const files = {};
    for (const p of paths) {
      const rest = p.slice(dir.length + 1);
      if (!p.startsWith(`${dir}/`) || rest.includes('/')) continue;
      const body = TEXT_RE.test(rest) ? await zip.file(p).async('string') : Buffer.from(await zip.file(p).async('uint8array'));
      used += body.length;
      if (used > MAX_INFLATED_BYTES) throw new Error(`${src} inflates past ${MAX_INFLATED_BYTES / 1024 / 1024} MB`);
      files[rest] = body;
    }
    out.push({ folder: segs[segs.length - 1], typeHint: segs.length >= 2 && TYPES.includes(segs[segs.length - 2]) ? segs[segs.length - 2] : undefined, files });
  }
  return out;
}

/**
 * Read, gate and normalize one package. Returns `{ ok, type, name, files, notes }` with the
 * files the store should hold, or `{ ok: false, name, why }`.
 */
function prepare(src, registry) {
  const r = readPackage(src.files, { type: src.typeHint, folder: src.folder });
  if (!r.ok) return { ok: false, name: src.folder, why: r.errors.join('; ') };
  let pkg = r.pkg;
  const notes = [...r.renames, ...(pkg.dropped || []).map((f) => `left out ${f}`)];
  if (pkg.code) {
    return { ok: false, name: pkg.name, why: 'it carries code (a transform), and code packages are not supported yet — they need a consent prompt and a sandbox (portable-packages §3.5)' };
  }
  // A shipped name is reserved: the package is taken as <name>-custom, its identity rewritten.
  const wanted = pkg.name;
  const name = registry.unreservedName(pkg.type, wanted);
  if (name !== wanted) {
    notes.push(`"${wanted}" is a shipped ${pkg.type}, so it installs as "${name}"`);
    const files = { ...pkg.files };
    if (pkg.type === 'component') {
      files[pkg.roles['styles.css']] = renameComponentSelectors(files[pkg.roles['styles.css']], wanted, name);
      files[pkg.roles['gallery.md']] = renameClassDirectives(files[pkg.roles['gallery.md']], wanted, name);
    }
    pkg = { ...pkg, name, manifest: { ...pkg.manifest, name }, files };
  }
  const out = writePackage(pkg);
  const text = (role) => String(out[`${name}.${role}`] ?? '');
  // The same gates, and the same refusing rules, as the Studio's Library import.
  let refusal = null;
  if (pkg.type === 'theme') {
    // `knownThemes` is what the RENDER can resolve (the gate's own rule): the base and the
    // shipped palettes. Another installed theme is not in it, because the render path
    // resolves an installed theme's parent only among the shipped ones.
    refusal = firstRefusal(gateThemeCss(text('css'), { knownThemes: ['lattice', ...registry.reservedNames('theme')] }).findings, name);
  } else if (pkg.type === 'component') {
    refusal = firstRefusal(gateCss(text('styles.css'), name).findings, name);
  } else {
    const role = pkg.type === 'finish' ? 'recipe.json' : 'scene.json';
    try {
      JSON.parse(text(role));
    } catch (e) {
      refusal = { name, why: `${name}.${role} is not valid JSON (${e.message})` };
    }
  }
  if (refusal) return { ok: false, name, why: refusal.why };
  return { ok: true, type: pkg.type, name, files: out, notes };
}

async function cmdAdd(args, flags, { checkOnly = false, log }) {
  const src = args[0];
  if (!src) throw new Error(`${checkOnly ? 'check' : 'add'} needs a .zip or a folder`);
  if (!fs.existsSync(src)) throw new Error(`not found: ${src}`);
  const root = packagesRoot({ flag: flags.packages });
  const registry = createRegistry(SHIPPED);
  const sources = await readSource(src);
  if (!sources.length) throw new Error(`${src} holds no package (a folder with a <name>.manifest.json)`);
  let failed = 0;
  for (const s of sources) {
    const p = prepare(s, registry);
    if (!p.ok) {
      failed++;
      log(`refused  ${p.name}: ${p.why}`);
      continue;
    }
    for (const n of p.notes) log(`  note   ${n}`);
    if (checkOnly) {
      log(`ok       ${p.type}/${p.name}`);
      continue;
    }
    // Presence, not readability: a hand-broken install still needs --replace to overwrite.
    const existed = fs.existsSync(path.join(root, p.type, p.name));
    if (existed && !flags.replace) {
      failed++;
      log(`refused  ${p.type}/${p.name}: already installed — pass --replace to overwrite it`);
      continue;
    }
    install(root, p.type, p.name, p.files);
    log(`${existed ? 'replaced' : 'added'}  ${p.type}/${p.name}  → ${path.join(root, p.type, p.name)}`);
    if (p.type === 'finish' || p.type === 'motion') {
      log(`  note   the CLI stores ${p.type} packages but does not render them by name yet (portable-packages §10)`);
    }
  }
  return failed ? 1 : 0;
}

function cmdList(flags, log) {
  if (flags.type && !TYPES.includes(flags.type)) throw new Error(`--type must be one of ${TYPES.join(', ')}`);
  const root = packagesRoot({ flag: flags.packages });
  const rows = [
    ...SHIPPED.packages.map((p) => ({ type: p.type, name: p.name, source: 'shipped', note: p.code ? 'code' : '' })),
    ...listInstalled(root).map((p) => ({ type: p.type, name: p.name, source: 'installed', note: p.ok ? '' : `unreadable: ${p.errors[0]}` })),
  ].filter((r) => !flags.type || r.type === flags.type);
  const w = Math.max(4, ...rows.map((r) => r.name.length));
  log(`${'TYPE'.padEnd(10)}${'NAME'.padEnd(w + 2)}SOURCE`);
  for (const r of rows) log(`${r.type.padEnd(10)}${r.name.padEnd(w + 2)}${r.source}${r.note ? `  (${r.note})` : ''}`);
  log(`\nstore: ${root}`);
  return 0;
}

/** A shipped package's files, from its repo path in the generated index. */
function shippedFiles(entry) {
  const kind = kindOf(entry.type);
  if (kind.layout === 'flat') {
    const dir = path.join(ROOT, path.dirname(entry.path));
    const files = {};
    for (const role of entry.roles) files[`${entry.name}.${role}`] = fs.readFileSync(path.join(dir, `${entry.name}.${role}`), 'utf8');
    return files;
  }
  return readFolder(path.join(ROOT, entry.path));
}

async function cmdExport(args, flags, log) {
  const { type, name } = ref(args[0]);
  const root = packagesRoot({ flag: flags.packages });
  const inst = findInstalled(root, type, name);
  const entry = SHIPPED.packages.find((p) => p.type === type && p.name === name);
  if (!inst && !entry) throw new Error(`${type}/${name} is neither shipped nor installed — \`lattice packages list\` shows what is`);
  const r = inst ? { ok: true, pkg: inst.pkg } : readPackage(shippedFiles(entry), { type, strict: true });
  // The npm tarball leaves every `*.gallery.md` out (package.json `files`), so a shipped
  // component is complete only in a repo checkout. Say that, rather than "unreadable".
  if (!r.ok && !inst && type === 'component' && !fs.existsSync(path.join(ROOT, entry.path, `${name}.gallery.md`))) {
    throw new Error(`component/${name} ships without its gallery in the npm package, so it can't be exported from here — export it from a Lattice repo checkout`);
  }
  if (!r.ok) throw new Error(`${type}/${name} is unreadable: ${r.errors.join('; ')}`);
  if (r.pkg.code) throw new Error(`${type}/${name} carries code (a transform) and can't be exported until code packages exist (portable-packages §3.5)`);
  const files = writePackage(r.pkg);
  const JSZip = jszip();
  const zip = new JSZip();
  for (const [f, body] of Object.entries(files)) zip.file(`${name}/${f}`, body);
  const out = flags.output || `${name}.lattice-${type === 'motion' ? 'scene' : type}.zip`;
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  log(`exported ${type}/${name} (${inst ? 'installed' : 'shipped'}) → ${out}`);
  return 0;
}

function cmdRemove(args, flags, log) {
  const { type, name } = ref(args[0]);
  const root = packagesRoot({ flag: flags.packages });
  if (uninstall(root, type, name)) {
    log(`removed  ${type}/${name}`);
    return 0;
  }
  if (SHIPPED.packages.some((p) => p.type === type && p.name === name)) throw new Error(`${type}/${name} is shipped with Lattice and can't be removed`);
  throw new Error(`${type}/${name} is not installed in ${root}`);
}

/**
 * Run a `packages` subcommand. Resolves to the process exit code; never calls process.exit,
 * so tests can drive it in-process.
 */
async function main(argv, { log = (s) => console.log(s), err = (s) => console.error(s) } = {}) {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (e) {
    err(`error: ${e.message}\n\n${USAGE}`);
    return 1;
  }
  const { flags, pos } = parsed;
  const [cmd, ...args] = pos;
  if (flags.help || flags.h || !cmd) {
    (cmd ? log : err)(USAGE);
    return cmd || flags.help || flags.h ? 0 : 1;
  }
  try {
    if (cmd === 'list') return cmdList(flags, log);
    if (cmd === 'add') return await cmdAdd(args, flags, { log });
    if (cmd === 'check') return await cmdAdd(args, flags, { checkOnly: true, log });
    if (cmd === 'export') return await cmdExport(args, flags, log);
    if (cmd === 'remove') return cmdRemove(args, flags, log);
    err(`error: unknown command: packages ${cmd}\n\n${USAGE}`);
    return 1;
  } catch (e) {
    err(`error: ${e.message}`);
    return 1;
  }
}

module.exports = { main, USAGE, prepare, readSource };

// Run directly: `lattice packages …` spawns this file (see lattice-emulator.js).
if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`error: ${e?.message ?? e}`);
      process.exit(1);
    },
  );
}
