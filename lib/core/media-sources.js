/**
 * Media sources — the ONE table that says how a picture or clip reference is turned into
 * bytes, and whether naming it tells a third party anything.
 *
 * Before this file the answer lived in scheme checks repeated across three core files
 * (`bg-image.js`, `background-image.js`, `remote-ref.js`), so a new source meant editing
 * all of them and the security predicate (`isRemoteUrl`) could drift from the resolver
 * (engineering/decisions/2026-10-16-media-plugins.md §3 D2, §4.1). Now `isRemoteUrl`
 * (remote-ref.js) is DERIVED from `locality` here, and the resolver reads the same rows.
 *
 * SIX ROWS: `data`, `relative`, `file`, `web`, `sample`, `asset`. A reference whose scheme no
 * row claims (`blob:`, `javascript:`, `ftp:` …) matches no row and is REMOTE: the predicate
 * fails closed, so a source added later is refused until someone writes its row.
 *
 * `locality` answers one question: does rendering this reference reach a stranger's server?
 * (HARD RULE #22 — a request is a beacon that says who opened the file and when.) The `file`
 * row is `remote` on purpose. The markup gates (a package's sample slide, motion art) run on a
 * stranger's content, and `file:` there names a file on the IMPORTER's disk, or on a network
 * share (a credential leak on Windows). The CLI's own deck-folder references are built by
 * `resolveRelative`, never typed as `file:`, so the row costs the author nothing.
 *
 * Each row also carries its `scheme` and a `resolve(ref, host)`, so `resolveAssetUrl` (bg-image.js) loops the table instead of
 * branching on a row's id, and a scan of CSS text for `sample:` / `asset:` reads its scheme list from `NAMED_SCHEMES`. A new
 * source is one new row, with no edit to the resolver (media note §4.1).
 *
 * A dependency-free CommonJS leaf: remote-ref.js and the docs site load it as-is.
 */

/** A URL as the URL parser reads it, lowercased: tab and newline dropped, C0 and spaces trimmed off the front. */
function urlAsParsed(raw) {
  return String(raw ?? '')
    .replace(/[\t\n\r]/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips them, so must we.
    .replace(/^[\u0000- ]+/, '')
    .toLowerCase();
}

// `sample:<name>` — a file in Lattice's one sample-art folder, lib/samples/. The folder is FLAT,
// so a name is one path segment of plain characters.
const SAMPLE_REF = /^sample:([A-Za-z0-9][A-Za-z0-9._-]*)$/i;
// `asset:<name>` — a photo or video in the Studio Library. The grammar is the library's own name
// rule (`isMediaName` in docs/src/components/studio/media-store.ts): lowercase, digits, `-`, `_`.
const ASSET_REF = /^asset:([a-z0-9][a-z0-9_-]*)$/i;

/** The file name a `sample:` reference names, or null when it is not a well-formed one. */
function sampleName(raw) {
  const m = SAMPLE_REF.exec(String(raw).trim());
  return m && !m[1].includes('..') ? m[1] : null;
}
/** The asset name an `asset:` reference names, or null when it is not a well-formed one. */
function assetName(raw) {
  const m = ASSET_REF.exec(String(raw).trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * What a row's `resolve` is handed: only what the host (the CLI, the Studio, the playground) supplies.
 * @typedef {object} MediaHost
 * @property {string} [baseUrl]     the deck's folder as a URL, ending in `/`
 * @property {string} [samplesUrl]  where `sample:<name>` files live
 * @property {Record<string,string>|null} [assetUrls]  name → URL for `asset:<name>`
 */

/**
 * @typedef {object} MediaSource
 * @property {string} id            row name
 * @property {string|string[]|null} scheme  matched on the reference's scheme; null for a relative path
 * @property {'local'|'remote'} locality   remote = naming it reaches a third party
 * @property {'inline'|'copy'|'link'} exportAs  what an export does with it
 * @property {(ref: string) => string|null} parse  the row's id for a reference, null when malformed (refused)
 * @property {(ref: string, host: MediaHost) => string|null} resolve  the URL to render, `ref` itself to pass it through,
 *   or null for "draw the missing-picture stand-in" (the caller owns the drawing)
 * @property {boolean} [named]      the reference NAMES a file the host holds (`sample:`, `asset:`) instead of addressing it;
 *   a scan of CSS text for such references reads these schemes from the table
 */

const passThrough = (ref) => ref;

/** @type {readonly MediaSource[]} */
const SOURCES = Object.freeze([
  { id: 'data', scheme: 'data', locality: 'local', exportAs: 'inline', parse: (ref) => (/^data:/i.test(urlAsParsed(ref)) ? ref : null), resolve: passThrough },
  // A relative reference resolves inside the deck's folder; one that leaves it is the stand-in (resolveRelative).
  { id: 'relative', scheme: null, locality: 'local', exportAs: 'copy', parse: (ref) => ref, resolve: (ref, host) => (host.baseUrl ? resolveRelative(ref, host.baseUrl) : ref) },
  { id: 'file', scheme: 'file', locality: 'remote', exportAs: 'copy', parse: (ref) => ref, resolve: passThrough },
  { id: 'web', scheme: ['http', 'https'], locality: 'remote', exportAs: 'link', parse: (ref) => ref, resolve: passThrough },
  // Without a `samplesUrl`, and for a malformed name, the reference passes through untouched.
  {
    id: 'sample', scheme: 'sample', named: true, locality: 'local', exportAs: 'link', parse: sampleName,
    resolve: (ref, host) => {
      const name = sampleName(ref);
      if (!name || !host.samplesUrl) return ref;
      try { return new URL(name, host.samplesUrl).href; } catch { return ref; }
    },
  },
  // A host that supplies a map owns every `asset:` reference, a malformed one included: a name it cannot hold is a
  // missing photo (null), never a dead `asset:` URL in the output. Without any map the reference passes through.
  {
    id: 'asset', scheme: 'asset', named: true, locality: 'local', exportAs: 'inline', parse: assetName,
    resolve: (ref, host) => {
      if (!host.assetUrls) return ref;
      const key = assetName(ref);
      return key && Object.hasOwn(host.assetUrls, key) && typeof host.assetUrls[key] === 'string' ? host.assetUrls[key] : null;
    },
  },
]);
const BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
const BY_SCHEME = new Map(SOURCES.flatMap((s) => (s.scheme === null ? [] : [].concat(s.scheme).map((sc) => [sc, s]))));

/** The `sample` / `asset` schemes as a regex alternation (`(?:sample|asset)`), for scans of CSS and HTML text. */
const NAMED_SCHEMES = `(?:${SOURCES.filter((s) => s.named).flatMap((s) => [].concat(s.scheme)).map((sc) => sc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;

/**
 * Which row claims this reference, or null when none does (an unknown scheme).
 * @param {string|null|undefined} raw  an attribute value or url() target, entities decoded
 * @returns {MediaSource|null}
 */
function classify(raw) {
  const s = urlAsParsed(raw);
  if (/^[/\\]{2}/.test(s)) return BY_ID.web; // protocol-relative: `//host`, and the `\\host` a URL parser folds into it
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(s);
  if (!scheme) return BY_ID.relative;
  return BY_SCHEME.get(scheme[1]) ?? null;
}

/**
 * Does naming this reference reach a network address other than the page's own origin?
 * Derived from the table: an unclaimed scheme is remote, a malformed `sample:` / `asset:` is
 * remote (it resolves to nothing and stays refused), and every other row answers by `locality`.
 */
function isRemoteRef(raw) {
  const row = classify(raw);
  if (!row) return true;
  if ((row.id === 'sample' || row.id === 'asset') && row.parse(raw) === null) return true;
  return row.locality === 'remote';
}

/**
 * Resolve a deck-relative reference against the deck's folder URL. On a `file:` base it also
 * refuses a reference that leaves the folder: `../x.png`, `/etc/hostname` and `a/../../x` all
 * resolve OUTSIDE it, and a render that follows them reads any file the process can (red team,
 * 2026-10-16). Only the lexical half lives here (the URL parser has already folded `%2e%2e` and
 * `\\` into `..` and `/`); a symlink inside the folder that points out of it is for the inline
 * export, which has the file system to check (§4.11, slice 4).
 *
 * A NON-`file:` base is not confined. The Studio and the playground pass the site's own samples
 * folder as `baseUrl`, and there `/images/x.jpg` and `../themes/x.svg` are same-origin fetches
 * the site ships on purpose (changelog 2358), not reads of the visitor's disk.
 *
 * Call it for a reference `classify` calls `relative`. A folder base must end in `/`: like the
 * URL parser, a base without one names a FILE, and the folder is its parent.
 * @param {string} ref        the author's reference
 * @param {string} baseUrl    the deck folder as a URL
 * @returns {string|null}     the absolute URL, or null when it escapes a `file:` folder
 */
function resolveRelative(ref, baseUrl) {
  let url;
  let base;
  try {
    base = new URL(baseUrl);
    url = new URL(ref, baseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== 'file:') return url.href;
  if (url.protocol !== base.protocol || url.host !== base.host) return null;
  const dir = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
  return url.pathname.startsWith(dir) ? url.href : null;
}

module.exports = { SOURCES, NAMED_SCHEMES, classify, isRemoteRef, resolveRelative, urlAsParsed, sampleName, assetName };
