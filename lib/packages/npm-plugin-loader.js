/**
 * The npm-plugin LOADER: what turns a project's explicit plugin list into the `source: 'npm'`
 * entries the door admits (threat-model note engineering/decisions/2026-10-16-npm-plugin-threat-model.md
 * §5.1 G2, §6 decisions 7 to 9).
 *
 * THE LIST is `lattice-plugins.json`, found in the deck's folder or the nearest folder above it,
 * the way npm finds `package.json`. Each entry names one plugin exactly:
 *
 *     { "plugins": [ { "name": "gantt", "package": "@acme/lattice-gantt", "version": "1.4.2",
 *                      "fence": "gantt", "sha256": "<64 hex>", "bundle": "lattice-plugin.js" } ] }
 *
 * `name` is the plugin's Lattice name (a deck lists it in `plugins:` and approves it as
 * `plugin/<name>`); `package` and `version` say which npm tarball holds it, and the version is
 * exact, never a range; `sha256` pins the BUNDLE's bytes; `bundle` is its path inside the tarball
 * (default `lattice-plugin.js`). An optional top-level `registry` replaces
 * `https://registry.npmjs.org`; it must be `https:`, or `http:` on a loopback address.
 *
 * TWO STEPS, AND ONLY THE FIRST TOUCHES THE NETWORK.
 *   - `lattice packages fetch` (`fetchListed`) downloads each listed tarball, reads the one
 *     bundle file out of it, and keeps it only when `admitNpmBundle` accepts its bytes against the
 *     pin. Nothing is installed: no `npm`, no lifecycle script, no dependency (decision 8).
 *   - A render (`npmPluginEntries`) reads the cache alone, so an export never waits on, or reaches,
 *     a registry. A plugin the deck lists that is not cached is named with the command that
 *     fetches it.
 *
 * THIS MODULE NEVER RUNS WHAT IT DOWNLOADS. It takes bytes, gunzips them, reads tar headers and
 * hashes; it never `require`s, `import`s or evaluates a bundle (G5). The one place a bundle runs is
 * the door's locked page, which refuses it again unless its bytes hash to the pin, and refuses it
 * where the OS layer reads OFF (decision 7, `npmLayerRefusal`).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { admitNpmBundle } = require('./npm-plugin-admission.js');
const { returnsRefusal, pluginReturnFields } = require('./code-shape.mjs');
const { codeDigest, trustOf } = require('./trust.js');

const LIST_FILE = 'lattice-plugins.json';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_BUNDLE = 'lattice-plugin.js';
/** Size caps, so a hostile or broken registry cannot fill memory: the download, the unpacked tar, the one bundle. */
const MAX_TARBALL = 8 * 1024 * 1024;
const MAX_UNPACKED = 32 * 1024 * 1024;
const MAX_BUNDLE = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60000;
const MAX_LIST = 1024 * 1024;
/** At most this many plugins in one list, and this many redirects per download. */
const MAX_ENTRIES = 64;
const MAX_REDIRECTS = 5;

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// npm's own package-name rule, lowercase, with an optional scope.
const PACKAGE_RE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]{0,213}$/;
// An EXACT version: no range, no tag, no `latest` (G2: "exact versions").
const VERSION_RE = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,64})?$/; // no `+build`: a registry serves no tarball by it
const SHA_RE = /^[0-9a-f]{64}$/;
const BUNDLE_RE = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]{1,200}$/;

/**
 * The nearest `lattice-plugins.json` at or above `dir`, or null. The search stops at the first
 * folder that holds `.git` (a project's root) and never climbs above the home folder, so a list
 * someone left in a parent folder, `/tmp` or `$HOME`'s parent is not picked up by an unrelated deck
 * (the inversion review, 2026-10-19).
 */
function findPluginList(dir, { home = os.homedir() } = {}) {
  let d = path.resolve(dir);
  const top = path.resolve(home);
  for (;;) {
    const f = path.join(d, LIST_FILE);
    if (fs.existsSync(f)) return f;
    if (d === top || fs.existsSync(path.join(d, '.git'))) return null;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/**
 * The list file's text, read only if it is a REGULAR file under the cap. A symlink to `/dev/zero`
 * ran a render out of memory and one to a FIFO hung it (the red team): the file is opened without
 * blocking, checked with `fstat`, and read up to the cap and no further.
 */
function readListText(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw new Error('it is not a regular file');
    if (st.size > MAX_LIST) throw new Error(`it is over ${MAX_LIST / 1024 / 1024} MB`);
    const buf = Buffer.alloc(st.size);
    const n = fs.readSync(fd, buf, 0, st.size, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** Is `registry` a URL the loader may download from? */
function registryRefusal(registry) {
  let u;
  try {
    u = new URL(registry);
  } catch {
    return `registry ${JSON.stringify(String(registry).slice(0, 80))} is not a URL`;
  }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')) return null;
  return `registry ${u.origin} is not https`;
}

/**
 * Read and check a plugin list. Never throws: an unreadable file or a bad entry is a problem line,
 * and the good entries still load.
 * @returns {{ file: string, registry: string, entries: Array<{ name: string, package: string, version: string, fence: string, sha256: string, bundle: string }>, problems: string[] }}
 */
function readPluginList(file) {
  const out = { file, registry: DEFAULT_REGISTRY, entries: [], problems: [] };
  let doc;
  try {
    doc = JSON.parse(readListText(file));
  } catch (e) {
    out.problems.push(`${file} cannot be read: ${String(e.message).slice(0, 160)}`);
    return out;
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.plugins)) {
    out.problems.push(`${file} has no "plugins" list`);
    return out;
  }
  if (doc.registry !== undefined) {
    const no = registryRefusal(doc.registry);
    if (no) {
      out.problems.push(`${file}: ${no}, so nothing in it is fetched`);
      return out;
    }
    out.registry = String(doc.registry).replace(/\/+$/, '');
  }
  if (doc.plugins.length > MAX_ENTRIES) {
    out.problems.push(`${file} lists ${doc.plugins.length} plugins, more than ${MAX_ENTRIES}, so nothing in it is fetched`);
    return out;
  }
  const seen = new Set();
  // A name is echoed only as JSON, so a newline or a bidi control in it cannot forge a line (the red team).
  const shown = (v) => JSON.stringify(String(v).slice(0, 64));
  for (const [i, p] of doc.plugins.entries()) {
    const at = `${file} plugins[${i}]`;
    if (!p || typeof p !== 'object') {
      out.problems.push(`${at} is not an object`);
      continue;
    }
    const bad = [];
    if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) bad.push('"name" must be lowercase letters, digits and hyphens');
    if (typeof p.package !== 'string' || !PACKAGE_RE.test(p.package)) bad.push('"package" must be an npm package name');
    if (typeof p.version !== 'string' || !VERSION_RE.test(p.version)) bad.push('"version" must be an exact version such as 1.4.2, never a range or a tag');
    if (typeof p.fence !== 'string' || !NAME_RE.test(p.fence)) bad.push('"fence" must be lowercase letters, digits and hyphens');
    if (typeof p.sha256 !== 'string' || !SHA_RE.test(p.sha256)) bad.push('"sha256" must be the bundle’s SHA-256 in lowercase hex');
    if (p.bundle !== undefined && (typeof p.bundle !== 'string' || !BUNDLE_RE.test(p.bundle))) bad.push('"bundle" must be a relative path inside the package');
    // `returns`: the values the plugin may hand back, declared as a zip plugin's manifest declares them
    // (code-shape.mjs `returnsRefusal`). The list is the npm plugin's manifest, so it is pinned into consent from here.
    const returned = p.returns === undefined || typeof p.name !== 'string' ? null : returnsRefusal({ contributes: { returns: p.returns } });
    if (returned) bad.push(`"returns": ${returned.replace(/^its contributes\.returns/, 'it')}`);
    if (bad.length) {
      out.problems.push(`${at}${typeof p.name === 'string' ? ` (${shown(p.name)})` : ''}: ${bad.join('; ')}`);
      continue;
    }
    if (seen.has(p.name)) {
      out.problems.push(`${at}: ${shown(p.name)} is listed twice`);
      continue;
    }
    seen.add(p.name);
    out.entries.push({ name: p.name, package: p.package, version: p.version, fence: p.fence, sha256: p.sha256, bundle: p.bundle ?? DEFAULT_BUNDLE, ...(p.returns !== undefined ? { returns: p.returns } : {}) });
  }
  return out;
}

/** The registry's tarball URL for one exact version (npm's layout: a scoped name keeps its scope in the path only). */
function tarballUrl(registry, pkg, version) {
  const base = pkg.includes('/') ? pkg.slice(pkg.indexOf('/') + 1) : pkg;
  const scoped = pkg.startsWith('@') ? `${pkg.slice(0, pkg.indexOf('/'))}/${base}` : base;
  return `${registry}/${scoped}/-/${base}-${version}.tgz`;
}

/** The pax records of one extended header, parsed by their length prefix as `tar` parses them. */
function paxRecords(data) {
  const out = [];
  let k = 0;
  while (k < data.length) {
    const sp = data.indexOf(0x20, k);
    const len = sp > k ? Number(data.subarray(k, sp).toString('latin1')) : NaN;
    if (!/^\d+$/.test(data.subarray(k, sp).toString('latin1')) || !(len > sp - k) || k + len > data.length || data[k + len - 1] !== 0x0a) throw new Error('the tarball has a malformed pax record');
    const rec = data.subarray(sp + 1, k + len - 1).toString('utf8');
    const eq = rec.indexOf('=');
    if (eq < 0) throw new Error('the tarball has a malformed pax record');
    out.push([rec.slice(0, eq), rec.slice(eq + 1)]);
    k += len;
  }
  return out;
}

/**
 * One file out of a gzipped tar, by its path BELOW the tarball's top folder (npm packs into
 * `package/`, some tools into another name, so the first segment is dropped). Throws on a malformed
 * archive; returns null when the file is not there.
 *
 * Strict on purpose: a reviewer reads the package with `tar` or the registry's file view, and the
 * loader must read the SAME file or the review proves nothing (the red team found four ways they
 * differed). So it takes regular files, folders and pax headers and refuses every other entry type
 * (a GNU long name, a contiguous file, a link, a device); it parses pax records by length and
 * refuses two `path` records; it requires a strictly octal size; it refuses a `..` segment; and it
 * refuses a bundle path that appears twice after `./` and `//` are normalized away (tar keeps the
 * last). The unpacked size and the bundle size are capped.
 * @param {Uint8Array} tgz
 * @param {string} want
 * @returns {Buffer|null}
 */
function readTarFile(tgz, want) {
  const tar = zlib.gunzipSync(Buffer.from(tgz), { maxOutputLength: MAX_UNPACKED });
  const str = (b, s, n) => {
    const raw = b.subarray(s, s + n);
    const z = raw.indexOf(0);
    return raw.subarray(0, z < 0 ? raw.length : z).toString('utf8');
  };
  let found = null;
  let paxPath = null;
  for (let off = 0; off + 512 <= tar.length; ) {
    const h = tar.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const sizeField = str(h, 124, 12).replace(/[ ]+$/, '').replace(/^[ ]+/, '');
    if (!/^[0-7]{1,11}$/.test(sizeField)) throw new Error('the tarball has a malformed header');
    const size = parseInt(sizeField, 8);
    const type = h[156] === 0 ? '0' : String.fromCharCode(h[156]);
    const body = off + 512;
    if (body + size > tar.length) throw new Error('the tarball is cut short');
    const data = tar.subarray(body, body + size);
    off = body + Math.ceil(size / 512) * 512;
    if (type === 'x' || type === 'g') {
      const paths = paxRecords(data).filter(([k]) => k === 'path');
      if (type === 'g' && paths.length) throw new Error('the tarball sets a global pax path');
      if (paths.length > 1) throw new Error('the tarball names one entry twice in a pax header');
      if (type === 'x') paxPath = paths[0]?.[1] ?? null;
      continue;
    }
    if (type !== '0' && type !== '5') throw new Error(`the tarball holds an entry of type ${JSON.stringify(type)}, which the loader does not read`);
    // The ustar prefix field exists only in a ustar header; an old v7 header has other data there.
    const ustar = h.subarray(257, 262).toString('latin1') === 'ustar';
    const prefix = ustar ? str(h, 345, 155) : '';
    const full = paxPath ?? (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100));
    paxPath = null;
    const segs = full.split('/').filter((x) => x && x !== '.');
    if (segs.includes('..')) throw new Error('the tarball holds a path with ..');
    if (type !== '0') continue;
    if (segs.slice(1).join('/') === want) {
      if (found) throw new Error(`the tarball holds ${want} twice`);
      if (size > MAX_BUNDLE) throw new Error(`${want} is over ${MAX_BUNDLE / 1024 / 1024} MB`);
      found = Buffer.from(data);
    }
  }
  return found;
}

/** The cache folder: `$LATTICE_HOME/npm-plugins` (default `~/.lattice/npm-plugins`). One file per pinned hash. */
function cacheDir(env = process.env) {
  const home = env.LATTICE_HOME ? path.resolve(env.LATTICE_HOME) : path.join(os.homedir(), '.lattice');
  return path.join(home, 'npm-plugins');
}

/** The cached bundle at `sha256`, re-hashed on read, or null. A cache file that no longer hashes to its name is removed. */
function readCached(sha256, dir = cacheDir()) {
  if (!SHA_RE.test(sha256)) return null;
  const f = path.join(dir, `${sha256}.js`);
  let bytes;
  try {
    bytes = fs.readFileSync(f);
  } catch {
    return null;
  }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha256) {
    fs.rmSync(f, { force: true });
    return null;
  }
  return bytes;
}

/**
 * Download `url` into memory with a size cap and a timeout. Redirects are followed by hand, at
 * most `MAX_REDIRECTS`, and each target must pass `registryRefusal` and keep the scheme: `fetch`'s
 * own following let an https registry send the loader to a plain-http internal address (the red team).
 */
async function download(url, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let at = url;
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(at, { signal: ctrl.signal, redirect: 'manual' });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), at);
        if (hop >= MAX_REDIRECTS || registryRefusal(next.href) || next.protocol !== new URL(at).protocol) throw new Error('redirect');
        at = next.href;
        continue;
      }
      if (!res.ok) throw new Error('status');
      if (Number(res.headers.get('content-length') ?? 0) > MAX_TARBALL) throw new Error('too large');
      const chunks = [];
      let total = 0;
      for await (const c of res.body) {
        total += c.length;
        if (total > MAX_TARBALL) throw new Error('too large');
        chunks.push(c);
      }
      return Buffer.concat(chunks);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch one listed plugin into the cache. Resolves `{ ok: true, code, cached }` (`cached`: it was
 * already there and nothing was downloaded) or `{ ok: false, reason }`. Writes the cache only when
 * the door's own admission accepts the bytes.
 */
async function fetchOne(entry, { registry = DEFAULT_REGISTRY, fetchImpl = globalThis.fetch, dir = cacheDir() } = {}) {
  const have = readCached(entry.sha256, dir);
  if (have) return { ok: true, code: have, cached: true };
  const no = registryRefusal(registry);
  if (no) return { ok: false, reason: no };
  let tgz;
  try {
    tgz = await download(tarballUrl(registry, entry.package, entry.version), fetchImpl);
  } catch (e) {
    // One reason for every way a download fails: a status or an error text that differs by cause
    // tells a list's author which ports answer on this machine (the red team).
    const why = e?.message === 'too large' ? `it is over ${MAX_TARBALL / 1024 / 1024} MB` : 'it could not be downloaded';
    return { ok: false, reason: `${entry.package}@${entry.version} from ${new URL(registry).origin}: ${why}` };
  }
  let code;
  try {
    code = readTarFile(tgz, entry.bundle);
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e).slice(0, 300) };
  }
  if (!code) return { ok: false, reason: `${entry.package}@${entry.version} holds no ${entry.bundle}` };
  const admitted = admitNpmBundle({ name: entry.name, code, sha256: entry.sha256 });
  if (!admitted.ok) return { ok: false, reason: admitted.reason };
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${entry.sha256}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, code);
  fs.renameSync(tmp, path.join(dir, `${entry.sha256}.js`));
  return { ok: true, code, cached: false };
}

/**
 * The package object the CLI's gate and consent read (`refusePackage`, `consentText`,
 * `codeDigest`), built from a list entry and its bytes: one fence, one `render.js`. It reaches the
 * same refusals a zip plugin does (shape, syntax, a reserved name, a shipped fence, a highlighted
 * language).
 */
function npmPluginPkg(entry, code) {
  const file = `${entry.name}.render.js`;
  return {
    type: 'plugin',
    name: entry.name,
    code: true,
    manifest: { name: entry.name, type: 'plugin', format: 1, contributes: { fences: { [entry.fence]: {} }, ...(entry.returns !== undefined ? { returns: entry.returns } : {}) } },
    roles: { 'render.js': file },
    files: { [file]: Buffer.from(code).toString('utf8') },
  };
}

/**
 * The door entries for the npm plugins a deck lists, read from the CACHE only (no network).
 * `listed` is the set of plugin names the deck's front matter names. Returns the entries and a
 * warning line for each listed plugin that cannot run, with the command that fixes it.
 * @param {string} deckDir
 * @param {Set<string>|string[]} listed
 * @param {{ approvals?: object, taken?: Set<string>, dir?: string }} [opts]  `taken`: names a shipped or installed plugin already uses
 */
function npmPluginEntries(deckDir, listed, { approvals = {}, taken = new Set(), dir = cacheDir() } = {}) {
  const want = new Set(listed);
  const file = findPluginList(deckDir);
  if (!file || !want.size) return { entries: [], warnings: [] };
  const list = readPluginList(file);
  const warnings = []; // the list's own problems are the caller's to print (it knows whether the deck asked)
  const entries = [];
  for (const e of list.entries.filter((x) => want.has(x.name))) {
    if (taken.has(e.name)) {
      warnings.push(`warning: the npm plugin ${e.name} has the name of a plugin Lattice ships or one installed in the package store, so it is not used; rename it in the list`);
      continue;
    }
    const code = readCached(e.sha256, dir);
    if (!code) {
      warnings.push(`warning: the npm plugin ${e.name} (${e.package}@${e.version}) is not fetched, so its blocks stay code. To fetch it: lattice packages fetch`);
      continue;
    }
    const pkg = npmPluginPkg(e, code);
    // The layer this PIN was approved at: another project's pin of the same plugin keeps its own (trust.js PINS).
    const layer = trustOf(approvals, 'plugin', e.name, codeDigest(pkg))?.layer ?? null;
    entries.push({ name: e.name, fence: e.fence, kinds: [], returns: pluginReturnFields(pkg.manifest), code: new Uint8Array(code), source: 'npm', pin: e.sha256, layer });
  }
  return { entries, warnings };
}

module.exports = {
  LIST_FILE,
  DEFAULT_REGISTRY,
  MAX_TARBALL,
  MAX_BUNDLE,
  MAX_ENTRIES,
  findPluginList,
  readPluginList,
  registryRefusal,
  tarballUrl,
  readTarFile,
  cacheDir,
  readCached,
  fetchOne,
  npmPluginPkg,
  npmPluginEntries,
};
