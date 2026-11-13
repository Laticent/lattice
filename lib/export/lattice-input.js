/**
 * lib/export/lattice-input.js — the CLI reads a `.lattice` project file (`lattice deck.lattice deck.pdf`).
 *
 * A `.lattice` is the Studio's own file: the deck, the photos it names as the Library stored them, and the saved
 * themes, components and other packages it uses. Before this, the CLI read one as Markdown and timed out after 60 s.
 *
 * The file is opened by the ONE reader the Studio uses (lib/packages/lattice-read.mjs: caps, zip-bomb guards,
 * manifest check) and unpacked into a private temporary folder shaped like a deck the CLI already renders:
 *
 *   <tmp>/deck.md                    the deck, as written
 *   <tmp>/assets/<name>.<ext>        each photo the deck names, as its original bytes (lib/export/deck-assets.js)
 *   <tmp>/packages/<type>/<name>/    a one-run package store: the file's packages, over links to the installed ones
 *
 * so every later step (the `asset:` map, the confiner, the package gates, the image policy) is the one a `.md` deck
 * takes, with nothing added beside it. Nothing is written to the user's own store (`~/.lattice`): the file's packages
 * are used for this render only, and a file package with an installed one's name wins, because it is what the author
 * used (owner ruling, 2026-11-13). A code package runs only with the user's approval at its exact bytes, or `--trust`.
 *
 * The CLI is a synchronous script up to its render, and JSZip reads asynchronously, so `lattice.js` runs
 * `unpackSync`, which runs this file as a child process: one short wait before anything renders.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
 * Unpack a `.lattice` into `dir`. Async: run by the child process `unpackSync` starts.
 * @param {string} file  the `.lattice`
 * @param {string} dir   an empty private folder
 * @param {string} installedRoot  the user's package store (`--packages`, else `$LATTICE_HOME/packages`, else ~/.lattice/packages)
 * @returns {Promise<object>}  what `unpackSync` returns
 */
async function unpack(file, dir, installedRoot) {
  const { readLatticeArchive, readLatticePhotos, PHOTO_EXT } = await import('../packages/lattice-read.mjs');
  const { assetRefs } = require('./deck-assets.js');
  const home = require('../packages/home.js');
  const { TYPES } = require('../packages/kinds.js');
  const bytes = fs.readFileSync(file);
  const r = await readLatticeArchive(require('jszip'), bytes, bytes.length);

  // Zip-slip (#617): JSZip resolves `..` out of the names it keys by, so the RAW names are checked. An honest
  // file holds none of these, so the whole file is refused rather than unpacked as a cleaned-up guess.
  const unsafe = Object.values(r.zip.files).map((f) => f.unsafeOriginalName ?? f.name).filter(home.unsafeEntryName);
  if (unsafe.length) throw new Error('That .lattice file holds an entry that points outside its own folder, so it was not opened.');

  fs.writeFileSync(path.join(dir, 'deck.md'), r.source);

  // The photos the deck names, under every name it uses for them (a photo's old name, an alias, still resolves).
  const named = new Set(assetRefs(r.source).map((x) => x.name));
  const { photos, refused } = await readLatticePhotos(r.zip, named);
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(assets);
  const carried = [];
  for (const p of photos) {
    const ext = PHOTO_EXT[p.mime];
    const written = [p.name, ...p.aliases].filter((x) => named.has(x)).map((n) => `${n}.${ext}`);
    for (const f of written) fs.writeFileSync(path.join(assets, f), p.bytes);
    carried.push({ name: p.name, file: p.file, at: written[0], row: p.row });
  }

  // The one-run package store. The file's packages are written through the store's one writer and its path checks
  // (home.js `install`); every installed package the file does not replace is linked in beside them, so the deck
  // still finds what the user installed. A name the file and the store share is the file's.
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
  const shadowed = [];
  for (const type of TYPES) {
    const base = path.join(installedRoot, type);
    let entries = [];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      if (groups.has(`${type}/${e.name}`)) {
        shadowed.push({ type, name: e.name });
        continue;
      }
      fs.mkdirSync(path.join(store, type), { recursive: true });
      fs.symlinkSync(path.join(base, e.name), path.join(store, type, e.name), 'dir');
    }
  }
  return { deck: path.join(dir, 'deck.md'), store, title: r.manifest.title, photos: carried, refused, packages, shadowed };
}

/**
 * Unpack a `.lattice` into a new private temporary folder, synchronously, for the CLI's synchronous setup. The
 * folder is removed when the process exits. Throws `Error(<the reader's own message>)` on a file it refuses.
 * @param {string} file
 * @param {{ installedRoot: string, tmpRoot?: string }} opts
 * @returns {{ dir: string, deck: string, store: string, title: string, photos: Array<{ name: string, file: string, at: string, row: object }>,
 *   refused: Array<{ name: string, why: string }>, packages: Array<{ type: string, name: string }>, shadowed: Array<{ type: string, name: string }> }}
 */
function unpackSync(file, { installedRoot, tmpRoot = os.tmpdir() }) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'lattice-input-'));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [__filename, file, dir, installedRoot], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) throw new Error((run.stderr || run.error?.message || 'the file could not be read').trim().split('\n').pop());
  return { dir, ...JSON.parse(run.stdout) };
}

/**
 * The photos a `.lattice` this CLI writes may carry. A photo that came in a `.lattice` passes through as its bytes:
 * the Studio removed its location and camera data when it was added. A photo from a deck's `assets/` folder is a
 * camera original nothing has cleaned, so it is NOT packed yet; it waits for the shared metadata scrubber (the
 * Studio's, docs/src/components/studio/media-scrub.ts, is the only one today). This is the one place that decides,
 * so the scrubber drops in here.
 * @param {{ fromLattice?: { dir: string, photos: Array<{ name: string, file: string, at: string, row: object }> } | null,
 *           assetsDir?: string, names: ReadonlySet<string>, maxBytes: number }} opts
 * @returns {{ media?: { index: string, files: Record<string, Uint8Array> }, included: string[],
 *   withheld: string[], omitted: string[] }}  `withheld`: from `assets/`, not cleaned; `omitted`: over `maxBytes`
 */
function photosToCarry({ fromLattice = null, assetsDir, names, maxBytes }) {
  const rows = [];
  const files = {};
  const included = [];
  const omitted = [];
  let bytes = 0;
  for (const p of fromLattice?.photos ?? []) {
    const data = fs.readFileSync(path.join(fromLattice.dir, 'assets', p.at));
    if (bytes + data.length > maxBytes) {
      omitted.push(p.name);
      continue;
    }
    bytes += data.length;
    files[`media/${p.file}`] = new Uint8Array(data);
    rows.push({ ...p.row, scope: 'library' });
    included.push(p.name);
  }
  // Every other photo the deck names that sits in assets/: withheld until a scrubber exists (owner, 2026-11-13).
  const withheld = [];
  if (!fromLattice && assetsDir) {
    const { buildAssetUrls } = require('./deck-assets.js');
    const { urls } = buildAssetUrls(path.dirname(assetsDir));
    for (const n of names) if (urls[n]) withheld.push(n);
  }
  return { ...(rows.length ? { media: { index: JSON.stringify(rows, null, 2), files } } : {}), included, withheld, omitted };
}

module.exports = { sniffInput, unpackSync, photosToCarry };

if (require.main === module) {
  const [file, dir, installedRoot] = process.argv.slice(2);
  unpack(file, dir, installedRoot).then(
    (out) => process.stdout.write(JSON.stringify(out)),
    (e) => {
      process.stderr.write(`${e?.message || e}\n`);
      process.exit(1);
    },
  );
}
