/**
 * Read a `.lattice` project file from someone else: ONE reader, called by the Studio's import
 * (docs/src/components/studio/lattice-file.ts `readLatticeFile`) and the CLI's `.lattice` input
 * (lib/export/lattice-input.js). Before this module the Studio was the only reader, so the CLI read a
 * `.lattice` as Markdown and timed out (engineering/decisions/2026-10-12-library-media-assets.md §6).
 *
 * A `.lattice` is untrusted input, so every read is capped before anything inflates (the numbers are
 * lib/packages/limits.js, the declared-size checks lib/packages/zip-limits.js) and charged as it
 * inflates (lib/packages/zip-read.js), so an archive that lies about its sizes stops at the cap.
 *
 * The WRITE half and the manifest check are lib/core/reopenable.js. This half sits in lib/packages
 * because it reads through the package layer's capped reader, and lib/core is below it.
 *
 * JSZip is passed in, as reopenable.js takes it: the Studio bundles its own copy and the CLI uses
 * the root install, and an import here would ship a second copy beside the Studio's.
 */
import reopenable from '../core/reopenable.js';
import jsonGuard from './json-guard.js';
import limits from './limits.js';
import zipLimits from './zip-limits.js';
import zipRead from './zip-read.js';

/** The one refusal a reader shows for any over-size file, so a probe cannot tell which cap it hit. */
export const TOO_LARGE = 'That .lattice file is too large to open.';
/** `media.json` is an index of rows; a real one is a few KB, so anything near this is not one. */
const MAX_INDEX_BYTES = 16 * 1024 * 1024;
/** Most rows an index may hold: the writer stops at 1000 photos (lattice-media.ts MAX_LATTICE_PHOTOS). */
const MAX_INDEX_ROWS = 5000;
/** A photo's name, as the Library writes it (media-store.ts `isMediaName`). */
const NAME_OK = /^[a-z0-9][a-z0-9_-]*$/;
/** The picture types a `.lattice` carries, and the extension each is written under (workspace-media.ts EXT).
 *  SVG is not one: the Library never stores an SVG, because one opened as a document runs its script. */
export const PHOTO_EXT = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' });

/**
 * A running inflate budget for an archive: every read charges it, and the chunk that takes the
 * total over `max` stops the inflate and throws `Error(message)`.
 * @param {string} message
 * @param {number} [max]
 * @param {'string'|'uint8array'} [type]
 * @returns {(entry: object | null | undefined) => Promise<any>}
 */
export function readBudget(message, max = limits.MAX_INFLATED_BYTES, type = 'string') {
  const budget = { used: 0, max, message };
  return async (entry) => (entry ? zipRead.readEntryCapped(entry, type, budget) : undefined);
}

/**
 * Open a `.lattice`: refuse what is too large, check the manifest, and read the deck and the
 * package files through one budget. Reading saves nothing: the caller decides what to do with
 * the packages (the Studio gates and saves them; the CLI does not use them yet) and the photos.
 *
 * @param {typeof import('jszip')} JSZip
 * @param {Blob | Uint8Array} data  the file
 * @param {number} onDisk  its size in bytes
 * @returns {Promise<{ source: string, manifest: ReturnType<typeof reopenable.parseLatticeManifest>,
 *   packageFiles: Array<[string, string]>, carriesPhotos: boolean, zip: any }>}
 *   `packageFiles` are `[path under packages/, text]`, in archive order; `zip` is the open archive,
 *   for `readLatticePhotos`.
 */
export async function readLatticeArchive(JSZip, data, onDisk) {
  // Refuse an oversized archive before touching it. The photos ride on top of the ordinary cap,
  // so this first check refuses only what no file could be; the split is judged below.
  if (onDisk > limits.MAX_ZIP_BYTES + limits.MAX_LATTICE_MEDIA_BYTES) throw new Error(TOO_LARGE);
  const zip = await JSZip.loadAsync(data).catch(() => {
    throw new Error('That .lattice file is not a valid archive.');
  });
  const carriesPhotos = !!zip.file(reopenable.LATTICE_MEDIA_INDEX);
  // The extra room is for PHOTOS, not for whatever else a file holds. What the `media/` entries declare is held
  // to the photo cap and everything else must fit the ordinary cap, so an empty `media.json` does not raise it.
  const mediaDeclared = Object.keys(zip.files).filter((p) => p.startsWith('media/') && !zip.files[p].dir).reduce((n, p) => n + zipLimits.declaredInflatedBytes(zip.files[p]), 0);
  if (mediaDeclared > limits.MAX_LATTICE_MEDIA_BYTES || onDisk - (carriesPhotos ? mediaDeclared : 0) > limits.MAX_ZIP_BYTES) throw new Error(TOO_LARGE);
  const deckEntry = zip.file(reopenable.LATTICE_DECK_FILE);
  const manifestEntry = zip.file(reopenable.LATTICE_MANIFEST_FILE);
  if (!deckEntry || !manifestEntry) throw new Error('That .lattice file is missing its deck or manifest.');
  // Deflate-bomb guard on what the deck and manifest DECLARE.
  if (zipLimits.declaredInflatedBytes(deckEntry) + zipLimits.declaredInflatedBytes(manifestEntry) > limits.MAX_INFLATED_BYTES) throw new Error(TOO_LARGE);
  // The package folders count against the same cap, together with the deck.
  const packagePaths = Object.keys(zip.files).filter((p) => p.startsWith(reopenable.LATTICE_PACKAGES_DIR) && !zip.files[p].dir);
  zipLimits.assertZipWithinLimits(zip, TOO_LARGE, [reopenable.LATTICE_DECK_FILE, reopenable.LATTICE_MANIFEST_FILE, ...packagePaths]);
  // ONE running budget for the deck, the manifest and the packages, read in order so the charge is
  // deterministic. It stops an entry that understates its size at the cap.
  const charge = readBudget(TOO_LARGE);
  const source = (await charge(deckEntry)) ?? '';
  const manifestText = (await charge(manifestEntry)) ?? '';
  // Values are counted before the parse: the budget bounds the bytes, not what `JSON.parse` builds.
  if (jsonGuard.countJsonValues(manifestText) > jsonGuard.MAX_JSON_VALUES) throw new Error(TOO_LARGE);
  const manifest = reopenable.parseLatticeManifest(manifestText);
  const packageFiles = [];
  for (const p of packagePaths) packageFiles.push([p.slice(reopenable.LATTICE_PACKAGES_DIR.length), (await charge(zip.file(p))) ?? '']);
  return { source, manifest, packageFiles, carriesPhotos, zip };
}

/**
 * The type a picture's own bytes say it is, or '' for anything else. Bytes, not the row: a row can
 * say `image/png` over any bytes.
 * @param {Uint8Array} b
 */
export function sniffPhotoMime(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}

/**
 * The photos a `.lattice` carries for the names its deck uses, read and checked, never saved. A
 * row answers to its name and its aliases. Each row must name a file Lattice writes
 * (`<name>.<ext>`, the extension its type takes), be a photo (a clip is refused: a `.lattice`
 * carries photos only), and its bytes must be the type it claims. All the photos together are
 * held to `MAX_LATTICE_MEDIA_BYTES` as they inflate. A refused row is named with its reason and
 * never fails the whole read: the deck renders that photo as the stand-in it draws for a name it
 * cannot find.
 *
 * This reads; it does not clean. The Studio wrote these bytes after scrubbing their metadata at
 * intake, and its own import scrubs again before storing (workspace-media.ts `restoreMedia`). A
 * caller that stores them must do the same.
 *
 * @param {any} zip  the open archive from `readLatticeArchive`
 * @param {ReadonlySet<string>} names  the lowercase `asset:` names the deck uses
 * @returns {Promise<{ photos: Array<{ name: string, aliases: string[], file: string, mime: string, bytes: Uint8Array, row: object }>,
 *   refused: Array<{ name: string, why: string }> }>}
 */
export async function readLatticePhotos(zip, names) {
  const photos = [];
  const refused = [];
  const index = zip.file(reopenable.LATTICE_MEDIA_INDEX);
  if (!index || !names.size) return { photos, refused };
  const all = (why) => {
    refused.push({ name: 'photos', why });
    return { photos, refused };
  };
  if (zipLimits.declaredInflatedBytes(index) > MAX_INDEX_BYTES) return all('the photo index is too large to read');
  let rows;
  try {
    rows = jsonGuard.parseJsonCapped(await readBudget('the photo index is too large to read', MAX_INDEX_BYTES)(index), 'the photo index holds too many values');
  } catch {
    return all('the photo index is not readable');
  }
  if (!Array.isArray(rows)) return all('the photo index is not readable');
  if (rows.length > MAX_INDEX_ROWS) return all('the photo index lists more photos than a .lattice carries');
  const charge = readBudget(`over the ${Math.floor(limits.MAX_LATTICE_MEDIA_BYTES / 1_048_576)} MB of photos a .lattice carries`, limits.MAX_LATTICE_MEDIA_BYTES, 'uint8array');
  const taken = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.name !== 'string' || !NAME_OK.test(row.name)) continue;
    const aliases = Array.isArray(row.aliases) ? row.aliases.filter((a) => typeof a === 'string' && NAME_OK.test(a)) : [];
    // Only the photos the deck names: a row for any other name is not part of what this render needs.
    if (![row.name, ...aliases].some((n) => names.has(n))) continue;
    if (taken.has(row.name)) continue;
    const skip = (why) => refused.push({ name: row.name, why });
    const mime = typeof row.mime === 'string' ? row.mime.toLowerCase() : '';
    const ext = PHOTO_EXT[mime];
    if (row.kind !== 'image' || !ext) {
      skip('a .lattice carries photos only, as JPEG, PNG, WebP or GIF');
      continue;
    }
    if (row.file !== `${row.name}.${ext}`) {
      skip('its file is not one Lattice writes');
      continue;
    }
    const entry = zip.file(`media/${row.file}`);
    if (!entry) {
      skip('its file is not in the archive');
      continue;
    }
    let bytes;
    try {
      bytes = await charge(entry);
    } catch (e) {
      skip(e?.message || 'its file could not be read');
      continue;
    }
    if (sniffPhotoMime(bytes) !== mime) {
      skip(`its bytes are not the ${ext.toUpperCase()} its row says`);
      continue;
    }
    taken.add(row.name);
    photos.push({ name: row.name, aliases, file: row.file, mime, bytes, row });
  }
  return { photos, refused };
}
