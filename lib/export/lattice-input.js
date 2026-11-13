/**
 * lib/export/lattice-input.js — the CLI reads and writes a `.lattice` project file.
 *
 * A `.lattice` is the Studio's own file: the deck, the photos it names as the Library stored them, and the saved
 * themes, components and plugins it uses. Before this, the CLI read one as Markdown and timed out after 60 s.
 *
 * READ (`lattice deck.lattice deck.pdf`). The file is opened by the ONE reader the Studio uses
 * (lib/packages/lattice-read.mjs: caps, zip-bomb guards, manifest check) and unpacked into a private temporary
 * folder shaped like a deck the CLI already renders:
 *
 *   <tmp>/deck.md                    the deck, as written
 *   <tmp>/assets/<name>.<ext>        each photo the deck names, ONCE, as its original bytes; an old name (alias)
 *                                    answers through the `asset:` map (`aliases`), never as a copy
 *   <tmp>/packages/<type>/<name>/    the file's packages: a package store searched BEFORE the user's installed one
 *
 * so every later step (the `asset:` map, the confiner, the package gates, the image policy) is the one a `.md` deck
 * takes. Nothing is written to the user's own store (`~/.lattice`): the file's packages are used for this render only,
 * and a file package with an installed one's name wins, because it is what the author used (owner ruling,
 * 2026-11-13). A code package runs only with the user's approval at its exact bytes, or `--trust`.
 *
 * WRITE (`lattice deck.md deck.lattice`). `writeSync` builds the zip with the writer the Studio uses
 * (lib/core/reopenable.js) and runs no browser and no package code. Which photos go is `photosToCarry`.
 *
 * The CLI is a synchronous script up to its render, and JSZip is asynchronous, so both run THIS FILE as a child
 * process: by its path in the package (`ENTRY`), never `__filename`, which inside the bundled CLI (dist/lattice.js)
 * is the CLI itself and would start it again, forever. The child stops if its parent dies, and hands its result
 * back in a file in the private folder, not on stdout.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pkgRootFrom } = require('../core/pkg-root.js');

/** This file, as shipped. In the bundle `__dirname` is dist/, and the package root is found from there. */
const ENTRY = path.join(pkgRootFrom(__dirname), 'lib', 'export', 'lattice-input.js');
/** The prefix of the private folder a `.lattice` input unpacks into (its tests check that none is left behind). */
const TMP_PREFIX = 'lattice-input-';
/**
 * Set in the environment of every child this file starts. An unpack asked for INSIDE such a child is refused at once
 * (`unpackSync`): if the child path ever resolved to the CLI again (the bundle's `__filename` once did), the CLI would
 * start itself on the same `.lattice`, forever. With the marker that is one typed error, never a chain of processes.
 */
const CHILD_MARK = 'LATTICE_UNPACK_CHILD';
/** A bound on one unpack or write. A 150 MB file unpacks in a few seconds; a stuck child must not hold the CLI. */
const CHILD_TIMEOUT_MS = 5 * 60 * 1000;

/** The first bytes of a zip archive (a local file header). A `.lattice` is a zip; a deck is text. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * What an input file is, from its own first bytes (never its extension): a zip (a `.lattice`), other binary
 * bytes (a PDF, a picture: refused, never parsed as Markdown), or text.
 * @param {string} file
 * @returns {'zip' | 'binary' | 'text'}
 */
function sniffInput(file) {
  let head;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      head = Buffer.alloc(8192);
      head = head.subarray(0, fs.readSync(fd, head, 0, head.length, 0));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return 'text'; // unreadable: the ordinary read reports it with its own message
  }
  if (ZIP_MAGIC.every((b, i) => head[i] === b)) return 'zip';
  // A NUL byte is in no text file anyone writes a deck in; it is in every PDF, picture and archive.
  return head.includes(0) ? 'binary' : 'text';
}

/**
 * Unpack a `.lattice` into `dir`. Run in the child process.
 * @param {string} file  the `.lattice`
 * @param {string} dir   an empty private folder
 */
async function unpack(file, dir) {
  const { readLatticeArchive, readLatticePhotos, PHOTO_EXT } = await import('../packages/lattice-read.mjs');
  const { assetRefs } = require('./deck-assets.js');
  const home = require('../packages/home.js');
  const { TYPES } = require('../packages/kinds.js');
  const limits = require('../packages/limits.js');
  const bytes = fs.readFileSync(file);
  const r = await readLatticeArchive(require('jszip'), bytes, bytes.length);

  // Zip-slip (#617): JSZip resolves `..` out of the names it keys by, so the RAW names are checked. An honest
  // file holds none of these, so the whole file is refused rather than unpacked as a cleaned-up guess.
  const unsafe = Object.values(r.zip.files).map((f) => f.unsafeOriginalName ?? f.name).filter(home.unsafeEntryName);
  if (unsafe.length) throw new Error('That .lattice file holds an entry that points outside its own folder, so it was not opened.');

  fs.writeFileSync(path.join(dir, 'deck.md'), r.source);

  // The photos the deck names. Each is written ONCE, under its own name; a name the deck still writes for it (an
  // alias) is handed back as `aliases`, which the `asset:` map points at the same file. The bytes written are
  // counted against the photo cap, so no file can fill the disk past what a `.lattice` may carry.
  const named = new Set(assetRefs(r.source).map((x) => x.name));
  const { photos, refused } = await readLatticePhotos(r.zip, named);
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(assets);
  const carried = [];
  const aliases = {};
  let written = 0;
  for (const p of photos) {
    if (written + p.bytes.length > limits.MAX_LATTICE_MEDIA_BYTES) {
      refused.push({ name: p.name, why: `over the ${Math.floor(limits.MAX_LATTICE_MEDIA_BYTES / 1_048_576)} MB of photos a .lattice carries` });
      continue;
    }
    const at = `${p.name}.${PHOTO_EXT[p.mime]}`;
    fs.writeFileSync(path.join(assets, at), p.bytes);
    written += p.bytes.length;
    for (const a of p.aliases) aliases[a] = p.name;
    carried.push({ name: p.name, file: p.file, at, row: p.row });
  }

  // The file's packages, written through the store's one writer and its path checks (home.js `install`) into a
  // store of their own. The CLI searches it before the user's installed store, so nothing is linked or copied.
  const store = path.join(dir, 'packages');
  fs.mkdirSync(store);
  const groups = new Map();
  for (const [p, text] of r.packageFiles) {
    const segs = p.split('/');
    if (segs.length !== 3 || !TYPES.includes(segs[0])) continue; // not a package folder's file: never read as one
    const key = `${segs[0]}/${segs[1]}`;
    if (!groups.has(key)) groups.set(key, {});
    groups.get(key)[segs[2]] = text;
  }
  const packages = [];
  for (const [key, files] of groups) {
    const [type, name] = key.split('/');
    home.install(store, type, name, files);
    packages.push({ type, name });
  }
  return { deck: path.join(dir, 'deck.md'), store, title: r.manifest.title, comments: r.manifest.comments, photos: carried, aliases, refused, packages };
}

/** Remove `dir` at exit, and turn a stop signal into an exit, so the exit hook runs (a signal alone skips it). */
function removeAtExit(dir) {
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
    // Only when nothing else handles it: a handler the CLI adds later keeps its own say over shutdown.
    if (!process.listenerCount(sig)) process.once(sig, () => process.exit(128 + n));
  }
}

/** Run this file as a child with `args`, wait, and read the JSON it wrote to `result`. */
function runChild(args, result) {
  const run = spawnSync(process.execPath, [ENTRY, ...args], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024, env: { ...process.env, [CHILD_MARK]: '1' } });
  if (run.error?.code === 'ETIMEDOUT') throw new Error(`reading it took longer than ${CHILD_TIMEOUT_MS / 60000} minutes`);
  if (run.status !== 0) throw new Error((run.stderr || run.error?.message || 'the file could not be read').trim().split('\n').pop());
  return JSON.parse(fs.readFileSync(result, 'utf8'));
}

/**
 * Unpack a `.lattice` into a new private temporary folder, synchronously, for the CLI's synchronous setup. The
 * folder is removed when the process exits, including on SIGINT, SIGTERM or SIGHUP. Throws
 * `Error(<the reader's own message>)` on a file it refuses.
 * @param {string} file
 * @param {{ tmpRoot?: string }} [opts]
 * @returns {{ dir: string, deck: string, store: string, title: string, comments: unknown[],
 *   photos: Array<{ name: string, file: string, at: string, row: object }>, aliases: Record<string, string>,
 *   refused: Array<{ name: string, why: string }>, packages: Array<{ type: string, name: string }> }}
 */
function unpackSync(file, { tmpRoot = os.tmpdir() } = {}) {
  if (process.env[CHILD_MARK]) {
    throw Object.assign(new Error('a .lattice reader started the CLI again on a .lattice, so it stopped instead of starting itself over and over'), { code: 'LATTICE_NESTED_UNPACK' });
  }
  const dir = fs.mkdtempSync(path.join(tmpRoot, TMP_PREFIX));
  removeAtExit(dir);
  const result = path.join(dir, 'result.json');
  return { dir, ...runChild(['unpack', path.resolve(file), dir, result], result) };
}

/**
 * Write a `.lattice`, synchronously, with no browser and no package code: the job's deck, packages and photos, through
 * the writer the Studio uses. The job is a JSON file; photos and packages are named by path, read by the child.
 * @param {{ out: string, source: string, title: string, comments: unknown[], now: number,
 *   packages: Array<{ type: string, name: string, dir: string }>, media?: { index: string, files: Record<string, string> } }} job
 * @returns {{ bytes: number }}
 */
function writeSync(job) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-write-'));
  removeAtExit(dir);
  const jobFile = path.join(dir, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const result = path.join(dir, 'result.json');
  return runChild(['write', jobFile, result], result);
}

async function write(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const { readFolder } = require('../packages/home.js');
  const { buildLatticeZip } = require('../core/reopenable.js');
  const packages = job.packages.map((p) => ({ type: p.type, name: p.name, files: readFolder(p.dir) }));
  const media = job.media ? { index: job.media.index, files: Object.fromEntries(Object.entries(job.media.files).map(([k, f]) => [k, new Uint8Array(fs.readFileSync(f))])) } : undefined;
  const date = new Date(job.now);
  const bytes = await buildLatticeZip(require('jszip'), { source: job.source, title: job.title, comments: job.comments, now: job.now, packages, ...(media ? { media } : {}), date });
  fs.writeFileSync(job.out, bytes);
  return { bytes: bytes.length };
}

/**
 * The photos a `.lattice` this CLI writes may carry. A photo that came in a `.lattice` passes through as its bytes:
 * the Studio removed its location and camera data when it was added. A photo from a deck's `assets/` folder is a
 * camera original nothing has cleaned, so it is NOT packed yet; it waits for the shared metadata scrubber (the
 * Studio's, docs/src/components/studio/media-scrub.ts, is the only one today). This is the one place that decides,
 * so the scrubber drops in here.
 * @param {{ fromLattice?: { dir: string, photos: Array<{ name: string, file: string, at: string, row: object }> } | null,
 *           assetsDir?: string, names: ReadonlySet<string>, maxBytes: number }} opts
 * @returns {{ rows: object[], paths: Record<string, string>, included: string[], withheld: string[], omitted: string[] }}
 *   `paths`: `media/<file>` → the file on disk; `withheld`: from `assets/`, not cleaned; `omitted`: over `maxBytes`
 */
function photosToCarry({ fromLattice = null, assetsDir, names, maxBytes }) {
  const rows = [];
  const paths = {};
  const included = [];
  const omitted = [];
  let bytes = 0;
  for (const p of fromLattice?.photos ?? []) {
    const at = path.join(fromLattice.dir, 'assets', p.at);
    const size = fs.statSync(at).size;
    if (bytes + size > maxBytes) {
      omitted.push(p.name);
      continue;
    }
    bytes += size;
    paths[`media/${p.file}`] = at;
    rows.push(p.row);
    included.push(p.name);
  }
  // Every other photo the deck names that sits in assets/: withheld until a scrubber exists (owner, 2026-11-13).
  const withheld = [];
  if (!fromLattice && assetsDir) {
    const { buildAssetUrls } = require('./deck-assets.js');
    const { urls } = buildAssetUrls(path.dirname(assetsDir));
    for (const n of names) if (urls[n]) withheld.push(n);
  }
  return { rows, paths, included, withheld, omitted };
}

/** The `media` a writer takes from `photosToCarry`'s answer, with the bytes read: for the in-process `--reopenable`. */
function mediaOf(carry) {
  if (!carry.rows.length) return undefined;
  return { index: JSON.stringify(carry.rows, null, 2), files: Object.fromEntries(Object.entries(carry.paths).map(([k, f]) => [k, new Uint8Array(fs.readFileSync(f))])) };
}

module.exports = { ENTRY, CHILD_MARK, TMP_PREFIX, sniffInput, unpackSync, writeSync, photosToCarry, mediaOf };

if (require.main === module) {
  // A child must not outlive the CLI that started it: when the parent is gone, the child is handed to another
  // process and its parent id changes.
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) process.exit(1);
  }, 250).unref();
  const [mode, ...args] = process.argv.slice(2);
  const work = mode === 'unpack' ? unpack(args[0], args[1]) : mode === 'write' ? write(args[0]) : Promise.reject(new Error(`unknown mode ${mode}`));
  const result = mode === 'unpack' ? args[2] : args[1];
  work.then(
    (out) => fs.writeFileSync(result, JSON.stringify(out)),
    (e) => {
      process.stderr.write(`${e?.message || e}\n`);
      process.exit(1);
    },
  );
}
