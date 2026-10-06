/**
 * `lattice packages list | add | check | export | remove`
 * (engineering/decisions/2026-09-23-portable-packages.md §6, phase 4).
 *
 *   lattice packages list   [--type theme|component|finish|motion]   shipped + installed, with a SOURCE column
 *   lattice packages add    <file.zip | folder> [--replace]          gate, then copy into the store
 *   lattice packages check  <file.zip | folder>                      gate only; installs nothing
 *   lattice packages export <type>/<name> [-o file.zip]              zip one package
 *   lattice packages remove <type>/<name>                            installed packages only
 *   lattice packages trust  component/<name> [--yes]                 approve an installed code package's code
 *   lattice packages untrust component/<name>                        withdraw that approval
 *   lattice packages new    plugin <name> [--dir <dir>]              scaffold a plugin (spec/LPM.md §11)
 *
 *   --packages <dir>   use <dir> as the store for this run (default $LATTICE_HOME/packages,
 *                      else ~/.lattice/packages)
 *
 * Every package goes through the same spine the build and the Studio use: its role files are
 * found by suffix, the manifest owns the name, and a shipped name is taken as `<name>-custom`
 * (§3.7). CSS passes the same gates the Studio's Library import runs, with the same refusing
 * rules (lib/packages/import-gate.js).
 *
 * CODE PACKAGES (a component with a `transform.js`; contract note §9). `add` installs one only
 * after the gate accepts its shape (lib/packages/gate.js refuseCode), then shows what the code is
 * and what contains it, and asks. The answer is recorded against the SHA-256 of the code
 * (lib/packages/trust.js), so changed code asks again. `--trust` answers yes without a prompt; with
 * no terminal to ask and no `--trust`, it installs unapproved and a render that uses it fails with
 * its name and the `trust` command. A code package is never renamed: its transform knows its own
 * name, so a reserved name is refused instead of taken as `<name>-custom`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { TYPES, NAME_RE, kindOf } = require('./kinds.js');
const { readPackage } = require('./read.js');
const { writePackage } = require('./write.js');
const { createRegistry } = require('./index.js');
const { packagesRoot, readFolder, listInstalled, findInstalled, install, uninstall } = require('./home.js');
const { refusePackage, printable } = require('./gate.js');
const { codeDigest, isTrusted, grantTrust, revokeTrust } = require('./trust.js');
const { codeNameRefusal } = require('./code-door-core.mjs');

/** Every class and component name Lattice ships (a code package's name may not start one). */
function knownClasses() {
  return [...require('./reserved-classes.generated.js').names, ...SHIPPED.packages.map((p) => p.name)];
}
const { renameComponentSelectors, renameClassDirectives } = require('./rename.js');
const { MAX_ZIP_BYTES, MAX_INFLATED_BYTES, MAX_ZIP_ENTRIES } = require('./limits.js');
const { readEntryCapped } = require('./zip-read.js');
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
  trust  component/<name> [--yes]                 approve an installed code package's code
  untrust component/<name>                        withdraw that approval
  new    plugin <name> [--dir <dir>]              scaffold a plugin in lib/plugins/<name>
                                                  (or <dir>/<name>); see spec/LPM.md

  add --trust        approve a code package's code without asking
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
    if (a === '--type' || a === '--packages' || a === '-o' || a === '--output' || a === '--dir') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) throw new Error(`${a} requires a value`);
      flags[a === '-o' ? 'output' : a.slice(2)] = v;
      i++;
      continue;
    }
    if (a === '--replace' || a === '--trust' || a === '--yes' || a === '--help' || a === '-h') {
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
  const m = /^([a-z]+)\/([a-z0-9][a-z0-9-]*)$/.exec(String(arg || ''));
  // The name rule is the kind's own (a finish or motion name may start with a digit), so
  // anything `add` can install, `export` and `remove` can name.
  if (!m || !TYPES.includes(m[1]) || !(kindOf(m[1]).nameRe || NAME_RE).test(m[2])) {
    throw new Error(`expected <type>/<name> with type one of ${TYPES.join(', ')} (got ${JSON.stringify(printable(arg))})`);
  }
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
  // A package folder is where a manifest sits — including the zip ROOT, the shape "Compress
  // items" makes from a folder's contents. The Studio's reader accepts it too (package-zip.ts).
  const dirs = [...new Set(paths.filter((p) => p.endsWith('.manifest.json')).map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')))].sort();
  const budget = { used: 0, max: MAX_INFLATED_BYTES, message: `${src} inflates past ${MAX_INFLATED_BYTES / 1024 / 1024} MB` };
  const out = [];
  for (const dir of dirs) {
    const segs = dir ? dir.split('/') : [path.basename(src).replace(/\.zip$/i, '').replace(/\.lattice-[a-z]+$/, '')];
    const files = {};
    for (const p of paths) {
      const rest = dir ? p.slice(dir.length + 1) : p;
      if ((dir && !p.startsWith(`${dir}/`)) || rest.includes('/')) continue;
      // Inflated in chunks against one running budget, so an entry that understates its size
      // stops at the cap instead of inflating in full first (zip-read.js).
      const body = await readEntryCapped(zip.file(p), TEXT_RE.test(rest) ? 'string' : 'uint8array', budget);
      files[rest] = typeof body === 'string' ? body : Buffer.from(body);
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
  // A name Lattice uses is reserved: the package is taken as <name>-custom, its identity
  // rewritten. That covers a shipped package and, for a component, a slide class the engine
  // owns (`finish`, `print`, `dark`…), which the component's `section.<name>` would restyle.
  const wanted = pkg.name;
  const name = registry.unreservedName(pkg.type, wanted);
  // A transform finds its slides by its own name, in code no rename can reach, so renamed it would
  // match nothing (the inversion lens on step 2 bundled `piechart`, renamed it, and got the slide
  // back unchanged). Refuse, and say why.
  if (name !== wanted && pkg.code) return { ok: false, name: wanted, why: `"${wanted}" is a name Lattice uses, and a code package can't be renamed (its transform knows its own name) — rename it where it was made` };
  if (pkg.code) {
    const clash = codeNameRefusal(wanted, knownClasses());
    if (clash) return { ok: false, name: wanted, why: `${clash} — rename it where it was made` };
  }
  if (name !== wanted) {
    notes.push(`"${wanted}" is a name Lattice uses for a ${pkg.type === 'component' ? 'component or slide class' : pkg.type}, so it installs as "${name}"`);
    const files = { ...pkg.files };
    if (pkg.type === 'component') {
      files[pkg.roles['styles.css']] = renameComponentSelectors(files[pkg.roles['styles.css']], wanted, name);
      files[pkg.roles['gallery.md']] = renameClassDirectives(files[pkg.roles['gallery.md']], wanted, name);
    }
    pkg = { ...pkg, name, manifest: { ...pkg.manifest, name }, files };
  }
  const out = writePackage(pkg);
  // Read back STRICTLY what will be installed: that is how the render path reads the store
  // (home.js findInstalled), so a package that installs is a package that renders. A lenient
  // read can accept what the writer cannot repair — a theme with no `@theme` line at all —
  // and `add` then said "added" for a theme no deck could use.
  const back = readPackage(out, { type: pkg.type, folder: name, strict: true });
  if (!back.ok) return { ok: false, name, why: back.errors.join('; ') };
  const why = refusePackage(back.pkg);
  if (why) return { ok: false, name, why };
  return { ok: true, type: pkg.type, name, files: out, notes, pkg: back.pkg };
}

/** What `add` and `trust` show before asking: the code, what contains it, and the OS layer here. */
function consentText(type, name, pkg, probed) {
  const file = pkg.roles['transform.js'];
  const body = pkg.files[file];
  const bytes = typeof body === 'string' ? Buffer.byteLength(body) : body.length;
  const remedy = probed.layer?.os === 'off' ? require('../core/os-sandbox.js').offRemedy(probed.layer.reason) : null;
  const why = probed.layer?.os === 'off' && probed.layer.tried?.length ? ` (${probed.layer.tried.join('; ')})${remedy ? `; ${remedy}` : ''}` : '';
  return [
    `${type}/${name} carries code: ${file} (${bytes.toLocaleString('en-US')} bytes, sha256 ${codeDigest(pkg)})`,
    `If you approve it, Lattice runs this code on every slide a deck gives the "${name}" component:`,
    '  - in a browser that has no network, in a page that holds only the slide it is drawing;',
    '  - its output is sanitized like any slide, and keeps no address the slide did not already hold;',
    `  - the OS sandbox on this machine: ${probed.summary}${why}.`,
    'Approve code only from someone you trust: a flaw in the browser could let it out of the sandbox.',
    'Changed code asks again: the approval is for these exact bytes, at this OS sandbox layer or a stronger one.',
  ];
}

/**
 * Launch the code sandbox once, on the SAME browser the render will use (lib/core/chrome-exec.js),
 * to say which OS layer this machine gives it (os-sandbox.js).
 * @returns {Promise<{ summary: string, layer: object|null }>}
 */
async function probeLayer() {
  try {
    const puppeteer = require('puppeteer');
    const { launchCodeSandbox } = require('../core/os-sandbox.js');
    const { detectChromeExecutable } = require('../core/chrome-exec.js');
    const s = await launchCodeSandbox(puppeteer, { executablePath: detectChromeExecutable() || undefined });
    await s.close();
    return { summary: s.layer.summary, layer: s.layer };
  } catch (e) {
    return { summary: `not checked, because the browser did not start here (${e.message.split('\n')[0]})`, layer: null };
  }
}

/** Ask a yes/no question on the terminal; resolves false with no terminal to ask. */
async function askTerminal(question) {
  if (!process.stdin.isTTY) return false;
  const rl = require('node:readline').createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await new Promise((r) => rl.question(question, r))).trim());
  } finally {
    rl.close();
  }
}

/**
 * Show the consent text and record the answer. `yes` (from `--trust` / `--yes`) approves without
 * asking; otherwise the terminal is asked, and with no terminal nothing is approved.
 */
async function consent(type, name, pkg, { yes, log, ask, probe }) {
  // A test's stub may hand back the summary alone.
  const raw = await probe();
  const probed = typeof raw === 'string' ? { summary: raw, layer: null } : raw;
  for (const line of consentText(type, name, pkg, probed)) log(line);
  const approved = yes || (await ask(`Run this code when a deck uses ${type}/${name}? [y/N] `));
  if (approved) {
    // The layer is pinned with the digest: a render whose browser gives the package a weaker OS
    // layer than the one approved here is refused (lib/packages/code-door.js).
    grantTrust(type, name, codeDigest(pkg), { layer: probed.layer?.os ?? null });
    log(`approved ${type}/${name} (sha256 ${codeDigest(pkg)})`);
  } else {
    log(`not approved: a render that uses ${type}/${name} fails until you run \`lattice packages trust ${type}/${name}\``);
  }
  return approved;
}

async function cmdAdd(args, flags, { checkOnly = false, log, ask, probe }) {
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
      log(`ok       ${p.type}/${p.name}${p.pkg.code ? ` (code: sha256 ${codeDigest(p.pkg)})` : ''}`);
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
    if (p.pkg.code && !isTrusted(p.type, p.name, codeDigest(p.pkg))) await consent(p.type, p.name, p.pkg, { yes: flags.trust, log, ask, probe });
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
    // Gated here as at render time: a folder placed in the store by hand never passed `add`.
    ...listInstalled(root).map((p) => {
      const refused = p.ok ? refusePackage(p.pkg) : null;
      // A name a later release started shipping hides the installed package (item 1 of
      // followups.d/2336): say so here as the render path does.
      const hidden = SHIPPED.packages.some((s) => s.type === p.type && s.name === p.name);
      const code = p.ok && p.pkg.code ? (isTrusted(p.type, p.name, codeDigest(p.pkg)) ? 'code, approved' : `code, NOT approved: lattice packages trust ${p.type}/${p.name}`) : '';
      const note = !p.ok ? `unreadable: ${p.errors[0]}` : refused ? `refused, not used: ${refused}` : hidden ? `hidden by the shipped ${p.type} of this name; re-add it to install as ${p.name}-custom` : code;
      return { type: p.type, name: p.name, source: 'installed', note };
    }),
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
  // Shipped components are not exported as code packages (owner, 2026-09-26): a frozen copy of
  // ours would not draw on import. An INSTALLED code package is already a self-contained bundle,
  // so it zips as it is, and its digest, and so the receiver's consent, survive the round trip.
  if (r.pkg.code && !inst) throw new Error(`${type}/${name} is a shipped component with a transform; shipped components are not exported as code packages`);
  if (r.pkg.code) {
    const why = refusePackage(r.pkg);
    if (why) throw new Error(`${type}/${name} is refused: ${why}`);
  }
  const files = writePackage(r.pkg);
  const JSZip = jszip();
  const zip = new JSZip();
  for (const [f, body] of Object.entries(files)) zip.file(`${name}/${f}`, body);
  const out = flags.output || `${name}.lattice-${type === 'motion' ? 'scene' : type}.zip`;
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  log(`exported ${type}/${name} (${inst ? 'installed' : 'shipped'}) → ${out}`);
  return 0;
}

async function cmdTrust(args, flags, { log, ask, probe }) {
  const { type, name } = ref(args[0]);
  const inst = findInstalled(packagesRoot({ flag: flags.packages }), type, name);
  if (!inst) throw new Error(`${type}/${name} is not installed`);
  if (!inst.pkg.code) throw new Error(`${type}/${name} carries no code, so there is nothing to approve`);
  const why = refusePackage(inst.pkg);
  if (why) throw new Error(`${type}/${name} is refused: ${why}`);
  return (await consent(type, name, inst.pkg, { yes: flags.yes, log, ask, probe })) ? 0 : 1;
}

function cmdUntrust(args, log) {
  const { type, name } = ref(args[0]);
  log(revokeTrust(type, name) ? `withdrew the approval of ${type}/${name}` : `${type}/${name} had no approval`);
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
 * `new plugin <name>` — write a plugin package that builds and passes the conformance harness as
 * written (lib/packages/new-plugin.js). In-tree by default: a plugin runs only from
 * `lib/plugins/` until the data layer admits other channels (plugin-system phase E), so the
 * default target is this checkout's `lib/plugins/<name>`. `--dir` writes elsewhere, for review.
 */
function cmdNew(args, flags, log) {
  const [kind, name, ...extra] = args;
  if (kind !== 'plugin') throw new Error('`packages new` scaffolds a plugin: lattice packages new plugin <name>');
  if (!name) throw new Error('`packages new plugin` needs a name');
  if (extra.length) throw new Error(`\`packages new plugin\` takes one name; unexpected: ${extra.join(' ')}`);
  const { scaffoldPlugin, nameRefusal } = require('./new-plugin.js');
  const pluginsDir = path.join(ROOT, 'lib', 'plugins');
  const { PLUGINS } = require('../plugins/host.js');
  const hljs = require('highlight.js');
  const languages = new Set();
  for (const lang of hljs.listLanguages()) {
    languages.add(lang);
    for (const alias of hljs.getLanguage(lang)?.aliases || []) languages.add(alias);
  }
  const refusal = nameRefusal(name, {
    plugins: PLUGINS.map((p) => p.name),
    fences: PLUGINS.flatMap((p) => Object.entries(p.fences).flatMap(([f, d]) => [f, ...d.aliases.map((a) => a.name)])),
    languages,
  });
  if (refusal) throw new Error(refusal);
  if (!flags.dir && !fs.existsSync(pluginsDir)) throw new Error('no lib/plugins here — run this in a Lattice checkout, or pass --dir <dir>');
  const dir = flags.dir ? path.resolve(flags.dir, name) : path.join(pluginsDir, name);
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists`);
  fs.mkdirSync(dir, { recursive: true });
  const { files } = scaffoldPlugin(name);
  for (const [file, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), text);
    log(`  + ${path.relative(process.cwd(), path.join(dir, file))}`);
  }
  log(`\nplugin "${name}" written. Next: npm run build (regenerates the plugin registry), then npm run test:plugins.`);
  return 0;
}

/**
 * Run a `packages` subcommand. Resolves to the process exit code; never calls process.exit,
 * so tests can drive it in-process.
 */
async function main(argv, { log: rawLog = (s) => console.log(s), err: rawErr = (s) => console.error(s), ask = askTerminal, probe = probeLayer } = {}) {
  // Every line this prints can carry a name from someone else's zip, and an ESC sequence in
  // a file name could clear the screen or forge a status line. Nothing reaches the terminal raw.
  const log = (s) => rawLog(printable(s));
  const err = (s) => rawErr(printable(s));
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
    if (cmd === 'add') return await cmdAdd(args, flags, { log, ask, probe });
    if (cmd === 'check') return await cmdAdd(args, flags, { checkOnly: true, log });
    if (cmd === 'trust') return await cmdTrust(args, flags, { log, ask, probe });
    if (cmd === 'untrust') return cmdUntrust(args, log);
    if (cmd === 'export') return await cmdExport(args, flags, log);
    if (cmd === 'remove') return cmdRemove(args, flags, log);
    if (cmd === 'new') return cmdNew(args, flags, log);
    err(`error: unknown command: packages ${cmd}\n\n${USAGE}`);
    return 1;
  } catch (e) {
    err(`error: ${e.message}`);
    return 1;
  }
}

module.exports = { main, USAGE, prepare, readSource, consentText };

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
