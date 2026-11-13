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
  const { cleanerFor } = require('@laticent/lastra');
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
    // A `.lattice` is a file from anyone: one built by hand can carry a camera original with its location. So its
    // photos meet the cleaner the Studio's intake uses (`@laticent/lastra` `cleanerFor`), with the same refusal: a file
    // it cannot parse is left out and named. A photo the Studio wrote is already clean, so it comes out byte for byte.
    // Synchronous on purpose: `unpack` runs in the CLI's child process, with no page to hold up, and a photo here is
    // at most what a `.lattice` carries. The Studio, on a page, uses `cleanAsync`.
    const cleaned = cleanerFor(p.mime)?.(p.bytes);
    if (!cleaned) {
      refused.push({ name: p.name, why: `it does not read as a whole ${PHOTO_EXT[p.mime].toUpperCase()} file, so its metadata cannot be removed` });
      continue;
    }
    const at = `${p.name}.${PHOTO_EXT[p.mime]}`;
    fs.writeFileSync(path.join(assets, at), cleaned);
    written += cleaned.length;
    for (const a of p.aliases) aliases[a] = p.name;
    carried.push({ name: p.name, file: p.file, at, row: { ...p.row, bytes: cleaned.length } });
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

/** The picture types the Studio's "Keep original" keeps as they are (media-import.ts `encodeAs`: JPEG, PNG, WebP, GIF). */
const KEEPABLE = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' });

/**
 * One photo from a deck's `assets/` folder, made what the Studio's "Keep original" intake stores
 * (media-import.ts `encodeAs`): its metadata (EXIF, XMP, text chunks, comments, a phone's location) cut out by the
 * image library's cleaner, `@laticent/lastra` `cleanerFor`, with the pixels, transparency, animation and rotation
 * kept as they are. Where the Studio would re-encode instead (a type it does not keep, or a file the cleaner cannot
 * parse), the CLI, which has no encoder for that, leaves the photo out and says why.
 * @param {string} file  the photo on disk
 * @returns {{ bytes: Uint8Array, mime: string, ext: string, width: number, height: number } | { why: string }}  width and height
 *   are the DISPLAY size (a quarter turn swaps them)
 */
function cleanAssetPhoto(file) {
  const { cleanerFor, displaySize, imageFormat, IMAGE_MIME, readImage } = require('@laticent/lastra');
  const limits = require('../packages/limits.js');
  const size = fs.statSync(file).size;
  if (size > limits.MAX_MEDIA_FILE_BYTES) return { why: `it is ${Math.round(size / 1_048_576)} MB, and a photo may be at most ${Math.floor(limits.MAX_MEDIA_FILE_BYTES / 1_048_576)} MB` };
  const raw = new Uint8Array(fs.readFileSync(file));
  const format = imageFormat(raw);
  const mime = format ? IMAGE_MIME[format] : '';
  if (!KEEPABLE[mime]) {
    return { why: format ? `it is ${format.toUpperCase()}, which the CLI cannot convert; add it to the Studio's Library, which stores it as JPEG or PNG` : 'it is not a picture the CLI can read' };
  }
  // Synchronous on purpose: the CLI has no page to hold up, and the file is under MAX_MEDIA_FILE_BYTES (checked
  // above, 50 MB), which the cleaners walk in about a second at worst (50 MB of empty PNG chunks). The Studio, on a
  // page, uses `cleanAsync`.
  const cleaned = cleanerFor(mime)?.(raw);
  if (!cleaned) return { why: `it does not read as a whole ${format.toUpperCase()} file, so its metadata cannot be removed` };
  const info = readImage(cleaned);
  if (!info) return { why: `its ${format.toUpperCase()} header does not read once its metadata is removed` };
  // The DISPLAY size, as the Studio records it (media-import.ts: the decoder has already applied the rotation): a
  // quarter-turned phone photo is as tall as it looks, and the slide sizes its box from this.
  const { width, height } = displaySize(info);
  return { bytes: cleaned, mime, ext: KEEPABLE[mime], width, height };
}

/**
 * The photos a `.lattice` this CLI writes may carry, decided in ONE place for a `.lattice` output and for
 * `--reopenable`'s copy:
 *   - a photo that came in a `.lattice` input goes as the bytes `unpack` wrote: already through the cleaner, so a
 *     Studio-made photo is unchanged and a hand-packed camera original has lost its metadata; its row is the
 *     reader's cleaned copy, with the cleaned size;
 *   - a photo from the deck's `assets/` folder is cleaned as the Studio's "Keep original" stores one
 *     (`cleanAssetPhoto`) and gets the Library's row shape. One the cleaner refuses is left out and named in
 *     `refused` with the reason;
 * and only the photos the deck names, up to `maxBytes` and MAX_LATTICE_PHOTOS; the rest are named in `omitted`.
 * Cleaned bytes are written to a private folder removed at exit, and handed back by path.
 * @param {{ fromLattice?: { dir: string, photos: Array<{ name: string, file: string, at: string, row: object }> } | null,
 *           assetsDir?: string, names: ReadonlySet<string>, maxBytes: number, now?: number,
 *           confine?: { allows: (file: string) => boolean } | null }} opts  `confine`: the render's file confiner
 * @returns {{ rows: object[], paths: Record<string, string>, included: string[], refused: Array<{ name: string, why: string }>, omitted: string[] }}
 *   `paths`: `media/<file>` → the file on disk
 */
function photosToCarry({ fromLattice = null, assetsDir, names, maxBytes, now = 0, confine = null }) {
  const limits = require('../packages/limits.js');
  const rows = [];
  const paths = {};
  const included = [];
  const refused = [];
  const omitted = [];
  let bytes = 0;
  const take = (name, size) => {
    if (bytes + size > maxBytes || rows.length >= limits.MAX_LATTICE_PHOTOS) {
      omitted.push(name);
      return false;
    }
    bytes += size;
    return true;
  };
  for (const p of fromLattice?.photos ?? []) {
    const at = path.join(fromLattice.dir, 'assets', p.at);
    if (!take(p.name, fs.statSync(at).size)) continue;
    paths[`media/${p.file}`] = at;
    rows.push(p.row);
    included.push(p.name);
  }
  if (!fromLattice && assetsDir) {
    const { buildAssetUrls } = require('./deck-assets.js');
    const { fileURLToPath } = require('node:url');
    const { urls } = buildAssetUrls(path.dirname(assetsDir));
    let out = null;
    for (const name of [...names].sort()) {
      if (!Object.hasOwn(urls, name)) continue;
      const file = fileURLToPath(urls[name]);
      // The packer reads only what the render may read: the render's own confiner (lib/core/file-confine.js, judged by
      // REAL path), so a link in assets/ that points outside the deck's folder is refused here exactly as it is there.
      if (confine && !confine.allows(file)) {
        refused.push({ name, why: "it points outside the deck's folder (a link), so it is not read" });
        continue;
      }
      const photo = cleanAssetPhoto(file);
      if (photo.why) {
        refused.push({ name, why: photo.why });
        continue;
      }
      if (!take(name, photo.bytes.length)) continue;
      if (!out) {
        out = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-clean-'));
        removeAtExit(out);
      }
      const fileName = `${name}.${photo.ext}`;
      fs.writeFileSync(path.join(out, fileName), photo.bytes);
      paths[`media/${fileName}`] = path.join(out, fileName);
      // The Library's row for a photo kept as it was added (media-import.ts: `original: true`). No aliases: a file in
      // assets/ has one name, its own.
      rows.push({ name, kind: 'image', scope: 'library', mime: photo.mime, bytes: photo.bytes.length, width: photo.width, height: photo.height, sourceName: path.basename(file), original: true, addedAt: now, file: fileName });
      included.push(name);
    }
  }
  return { rows, paths, included, refused, omitted };
}

/** The `media` a writer takes from `photosToCarry`'s answer, with the bytes read: for the in-process `--reopenable`. */
function mediaOf(carry) {
  if (!carry.rows.length) return undefined;
  return { index: JSON.stringify(carry.rows, null, 2), files: Object.fromEntries(Object.entries(carry.paths).map(([k, f]) => [k, new Uint8Array(fs.readFileSync(f))])) };
}

module.exports = { ENTRY, CHILD_MARK, TMP_PREFIX, sniffInput, unpackSync, writeSync, cleanAssetPhoto, photosToCarry, mediaOf };

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
