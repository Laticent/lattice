/**
 * lib/core/lattice-doc.js
 *
 * The Lattice document manifest envelope — the SINGLE source-of-truth container
 * that both the self-contained `.html` player and the `.lattice` project zip
 * encode (2026-06-16-lattice-export-format.md §3; 2026-07-07-html-lattice-player.md).
 * This is the P2 kernel the parent named but never built.
 *
 * The one rule (parent §3a): carry the deck SOURCE verbatim, never scrape the
 * render. Round-trip is lossless BY CONSTRUCTION — `parseEnvelope(serializeEnvelope(
 * buildManifest(deck)))` returns the exact source bytes back. NOTE the guarantee is
 * for `source` (a string) only: the optional `config`/`theme`/`assets` projections
 * pass through `JSON.stringify`, so JSON-lossy values (Date → ISO, `undefined`/
 * function → dropped, `NaN`/`Infinity` → null) do NOT round-trip. Editing re-parses
 * `source`, so this is a viewing-projection caveat, not a data-loss bug.
 *
 * SECURITY — the whole envelope is base64'd, not just `source`
 * (2026-07-07 §Security 2, the stored-XSS blocker). The parent's §3b schema
 * base64'd only `source`, leaving `title`/`config`/`theme` as plaintext JSON inside
 * `<script type="application/lattice+json">` — a deck titled `</script><script>…`
 * then breaks out of the envelope and executes. Base64 over the ENTIRE manifest
 * makes the inlined payload pure [A-Za-z0-9+/=]: no `<`, so nothing can terminate
 * the script element. Decode enforces a size cap (base64 bomb) and refuses a
 * newer-than-known format version.
 *
 * Pure + fs-free (lib/core convention): no I/O, `now`/`build`/`playerVersion`
 * are injected by the caller, never read here — so it unit-tests without a browser,
 * a zip, or a clock. The assembler (lib/export) and the importer both consume it;
 * neither reimplements the escaping.
 */

/** Envelope format version. Bump on a breaking manifest-shape change. */
const LATTICE_DOC_VERSION = 1;

/** The non-executable node the `.html` carries the manifest in (parent §3b). */
const ENVELOPE_ID = 'lattice-doc';
const ENVELOPE_MIME = 'application/lattice+json';

/**
 * Decode guard — a shared file is untrusted, so a hostile base64 blob must not
 * OOM the importer. Mirrors the shipped `.lattice` inflate cap
 * (docs/src/components/studio/lattice-file.ts `MAX_UNCOMPRESSED_BYTES`).
 */
const MAX_ENVELOPE_BYTES = 64 * 1024 * 1024; // 64 MB decoded JSON
const MAX_TITLE_LEN = 120; // same clamp as the .lattice import path
// base64 expands ~4/3; a payload under this can't decode past MAX_ENVELOPE_BYTES.
const MAX_ENCODED_BYTES = Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3);

/**
 * Clamp an untrusted manifest title the same way the shipped `.lattice` import path
 * does (lattice-file.ts): collapse whitespace, trim, cap length — a hostile envelope
 * must not push a multi-MB or newline-laden title into the app's deck index.
 */
function clampTitle(title) {
	const t = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LEN) : '';
	return t || 'Untitled deck';
}

/**
 * Build the manifest object for a deck. Pure: the caller supplies the already-
 * resolved fields (the kernel packages, it does not parse the deck). `source` is
 * the verbatim LFM — the truth for re-import; everything else is a projection for
 * viewing. Provenance (`now`, `build`, `playerVersion`) is injected.
 *
 * @param {object} deck
 * @param {string} deck.source            verbatim LFM source (the source of truth)
 * @param {string} [deck.title]           display title
 * @param {object} [deck.theme]           { name, palette, mode, css? }
 * @param {Array}  [deck.components]       [{ name, css }] library components
 * @param {object} [deck.assets]          { id: dataUri } or zip file pointers
 * @param {object} [deck.config]          frontmatter / deck settings
 * @param {boolean}[deck.notes]           whether notes ride along
 * @param {object} [opts]
 * @param {number} [opts.now=0]           ms epoch stamp (injected, never read)
 * @param {string} [opts.build='']        engine build id
 * @param {string} [opts.playerVersion=''] frozen player-runtime version stamp
 * @returns {object} the manifest
 */
function buildManifest(deck, opts = {}) {
	if (!deck || typeof deck !== 'object' || typeof deck.source !== 'string') {
		throw new TypeError('buildManifest: deck.source (verbatim LFM string) is required.');
	}
	const manifest = {
		format: 'lattice',
		version: LATTICE_DOC_VERSION,
		engine: 'lattice',
		build: String(opts.build || ''),
		// The frozen player runtime a `.html` carries — lets a re-import detect a
		// stale/defective player and offer a re-bake (2026-07-07 §Security).
		playerVersion: String(opts.playerVersion || ''),
		generatedAt: Number.isFinite(opts.now) ? opts.now : 0,
		title: String(deck.title || 'Untitled deck'),
		source: deck.source, // verbatim — the round-trip truth
	};
	// Optional projections — only carried when present, to keep the envelope lean.
	if (deck.theme) manifest.theme = deck.theme;
	if (deck.components) manifest.components = deck.components;
	if (deck.assets) manifest.assets = deck.assets;
	if (deck.config) manifest.config = deck.config;
	if (typeof deck.notes === 'boolean') manifest.notes = deck.notes;
	return manifest;
}

/** UTF-8 → base64 (pure Node Buffer; no dependency). */
function toBase64(str) {
	return Buffer.from(str, 'utf8').toString('base64');
}
/** base64 → UTF-8. */
function fromBase64(b64) {
	return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * Serialize a manifest to the inline envelope node. The manifest JSON is base64'd
 * WHOLE (security note above), so the returned string's payload is pure base64 and
 * cannot contain `</script>` regardless of deck content.
 *
 * @param {object} manifest
 * @returns {string} `<script type="application/lattice+json" id="lattice-doc">…</script>`
 */
function serializeEnvelope(manifest) {
	let json;
	try {
		json = JSON.stringify(manifest);
	} catch (err) {
		// A BigInt / circular value in config/theme would throw here — turn the raw
		// TypeError into a clear author-facing message instead of an opaque crash.
		throw new Error(`Cannot serialize the Lattice envelope — a config/theme value is not JSON-safe: ${err.message}`);
	}
	const payload = toBase64(json);
	return `<script type="${ENVELOPE_MIME}" id="${ENVELOPE_ID}">${payload}</script>`;
}

/**
 * Extract the raw base64 payload from a full HTML document (or an envelope
 * `<script>` string). Returns null if no Lattice envelope node is present.
 * The payload is pure base64, so this regex is robust — no `<` can appear inside.
 */
function readEnvelopePayload(html) {
	if (typeof html !== 'string') return null;
	// First match wins — intentional: our exporter writes exactly one envelope node,
	// and on re-import the whole file is attacker-controlled anyway (the decoded
	// `source` is re-sanitized at render time, §Security 1). A decoy earlier node
	// only changes which attacker-controlled bytes we read, not a trust boundary.
	const re = new RegExp(
		`<script[^>]*\\bid=["']${ENVELOPE_ID}["'][^>]*>([A-Za-z0-9+/=\\s]*)</script>`,
		'i',
	);
	const m = html.match(re);
	return m ? m[1].replace(/\s+/g, '') : null;
}

/**
 * Parse a manifest from an envelope. Accepts a full HTML document, the envelope
 * `<script>` string, or a bare base64 payload. Validates shape, enforces the size
 * cap, and refuses a newer-than-known format version with a clear message.
 *
 * @param {string} input
 * @returns {object} the manifest (with `source` byte-identical to what was built)
 */
function parseEnvelope(input) {
	if (typeof input !== 'string') {
		throw new Error('Not a Lattice envelope — expected a string.');
	}
	// Bound the input BEFORE the extractor regex/`replace` allocate copies of it —
	// a valid envelope's payload can't exceed the encoded ceiling, so anything past
	// it (+ slack for the surrounding HTML document) is rejected cheaply. (The caller
	// that reads a file from disk should still cap file size, as the .lattice path does.)
	if (input.length > MAX_ENCODED_BYTES + 1024) {
		throw new Error('Lattice envelope exceeds the size limit.');
	}
	// Full HTML / <script> wrapper → extract payload; else treat input as the payload.
	let payload = readEnvelopePayload(input);
	if (payload == null) {
		payload = /^[A-Za-z0-9+/=\s]+$/.test(input.trim()) ? input.trim().replace(/\s+/g, '') : null;
	}
	if (payload == null) {
		throw new Error('Not a Lattice envelope — no lattice-doc node found.');
	}
	// Size guard BEFORE decode-to-string work grows unbounded: base64 is ~4/3 of
	// the decoded bytes, so cap the encoded length against the decoded ceiling.
	if (payload.length > MAX_ENCODED_BYTES) {
		throw new Error('Lattice envelope exceeds the size limit.');
	}
	const json = fromBase64(payload);
	if (Buffer.byteLength(json, 'utf8') > MAX_ENVELOPE_BYTES) {
		throw new Error('Lattice envelope exceeds the size limit.');
	}
	let m;
	try {
		m = JSON.parse(json);
	} catch {
		throw new Error('Not a Lattice envelope — the manifest is unreadable.');
	}
	if (!m || typeof m !== 'object' || m.format !== 'lattice') {
		throw new Error('Not a Lattice envelope — missing the Lattice manifest.');
	}
	if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) {
		throw new Error('Not a Lattice envelope — the manifest version is invalid.');
	}
	if (m.version > LATTICE_DOC_VERSION) {
		throw new Error(`This Lattice file needs a newer Lattice (format v${m.version}).`);
	}
	if (typeof m.source !== 'string') {
		throw new Error('Not a Lattice envelope — the deck source is missing.');
	}
	// Clamp the untrusted title (the sibling .lattice guard) — no multi-MB / newline
	// title reaches the app index. `source` stays byte-exact; only the display title
	// is normalized.
	m.title = clampTitle(m.title);
	return m;
}

/** Convenience: build → serialize in one call. */
function buildEnvelope(deck, opts) {
	return serializeEnvelope(buildManifest(deck, opts));
}

module.exports = {
	LATTICE_DOC_VERSION,
	ENVELOPE_ID,
	ENVELOPE_MIME,
	MAX_ENVELOPE_BYTES,
	MAX_TITLE_LEN,
	buildManifest,
	serializeEnvelope,
	buildEnvelope,
	readEnvelopePayload,
	parseEnvelope,
};
