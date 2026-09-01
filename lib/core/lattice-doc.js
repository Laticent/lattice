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
 * @param {object} [deck.readAlong]       read-along section — `{version, audioMode, voice}`,
 *                                        built by `buildReadAlong` below. It records WHAT
 *                                        NARRATED the deck and nothing else: the audio rides in
 *                                        its own inert per-slide blocks and the caption track
 *                                        travels beside it, NOT in this envelope
 *                                        (player-core.mjs `narrationBlocks` explains why — the
 *                                        envelope is base64'd whole, so audio nested here would
 *                                        be encoded twice and could only be reached by parsing
 *                                        the entire manifest). The 2026-07-08 ADR's `slides[]`
 *                                        slot is therefore deliberately unused rather than
 *                                        empty; see READ_ALONG_VERSION.
 * @param {Array<{term:string,definition:string}>} [deck.glossary]  term→definition entries
 *                                        from the acronym registry (#920); carried only when
 *                                        non-empty. See 2026-07-11-manifest-speech-contract §18.
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
	if (deck.readAlong) manifest.readAlong = deck.readAlong;
	// Auto-glossary term→definition projection (#920) — only when the deck defines terms, so
	// the envelope stays lean for the common (no-glossary) deck.
	if (Array.isArray(deck.glossary) && deck.glossary.length) manifest.glossary = deck.glossary;
	// A PROJECTION SAYS SO. When `--lens` reduced the deck, `source` above is the projection
	// rather than the author's deck — so a re-import silently yields a shorter deck, and the
	// `lenses:` block rides along carrying approval hashes that no longer match its own (now
	// shorter) membership, which reads as `drifted`. Without this an importer cannot tell "I
	// lost slides" from "the approvals broke". One optional field answers both.
	if (deck.lensProjection) manifest.lensProjection = deck.lensProjection;
	return manifest;
}

// Base64 + byte-length, cross-environment. The envelope is assembled in Node (the
// CLI `--player` export) AND in the browser (the Studio "Download as webpage"
// export, which bundles this module) — Buffer exists only in Node. The Node branch
// is unchanged, so the CLI envelope stays byte-identical; a browser/Worker without
// Buffer uses TextEncoder/btoa (chunked to dodge String.fromCharCode arg limits).
/** UTF-8 → base64. */
function toBase64(str) {
	if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
	const bytes = new TextEncoder().encode(str);
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	return btoa(bin);
}
/** base64 → UTF-8. */
function fromBase64(b64) {
	if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}
/** UTF-8 byte length. */
function utf8ByteLength(str) {
	return typeof Buffer !== 'undefined' ? Buffer.byteLength(str, 'utf8') : new TextEncoder().encode(str).length;
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
	if (utf8ByteLength(json) > MAX_ENVELOPE_BYTES) {
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

/**
 * The `readAlong` section's own version, independent of the manifest's.
 *
 * `1.1`, not `1.0`, and the difference is the point. The 2026-07-08 ADR specified `1.0` as a
 * section whose `slides[]` carried a per-slide caption `track` and, under
 * `audioMode:"embedded"`, the audio itself. What SHIPPED puts neither there: the audio rides in
 * one inert block per slide (player-core.mjs's `narrationBlocks`, to avoid the envelope's
 * double-base64 and its eager whole-manifest parse) and the caption track travels out-of-band
 * beside it. So the section this repo writes is a different shape from the one the ADR named,
 * and calling it `1.0` would tell a future reader it was the shape they have a spec for.
 */
const READ_ALONG_VERSION = '1.1';

/**
 * Build the manifest's `readAlong` section — what NARRATED this deck, in terms a document
 * format can carry.
 *
 * WHY THIS IS A FUNCTION AND NOT AN OBJECT LITERAL AT THE CALL SITE. The section had shipped as
 * `{ voice: { rung, model, voice, speed } }`, which is missing both forward-compat fields the
 * prior ADR existed to establish and carries one field that should never have left the Studio
 * (#1462 item 1):
 *
 *  · NO `version`. The field whose entire purpose is to let a future player migrate an old
 *    artifact. Absent, every reader must forever treat "field missing" as a legacy dialect —
 *    and that cost only grows once decks are sitting in other people's inboxes. Two lines now,
 *    or a compatibility branch forever.
 *
 *  · NO `audioMode`. An artifact could not say whether its audio was carried or was meant to be
 *    re-synthesized on play — and the only mode that exists in the shipping producer is the one
 *    the ADR made the OPT-IN. A reader had to infer it by going looking for audio blocks.
 *
 *  · `rung` (`'openrouter' | 'kokoro'`) is the Studio's internal voice-ladder identity. It is a
 *    name for a code path in this repository, and it was being written into a document that
 *    goes out to boards. It is replaced by `engine`, which says the same useful thing in the
 *    document's own vocabulary — `'on-device'` or `'cloud'` — and it is genuinely needed rather
 *    than merely nice: the on-device and hosted Kokoro rungs share a model id, so the model
 *    alone cannot say which one spoke.
 *
 * Deliberately NOT carried, on the ADR's own single-source-of-truth reasoning: the narration
 * TEXT (it is in `source`, and re-derivable through the same Cadenza path the live reader uses)
 * and the deck's `pace` (declared in `source`'s front matter; a second copy here could disagree
 * with the first).
 */
function buildReadAlong(voice, opts = {}) {
	if (!voice || typeof voice !== 'object') return undefined;
	const rung = String(voice.rung || 'openrouter');
	return {
		version: READ_ALONG_VERSION,
		// "embedded" = the clips ride in this file and it plays with no key and no network.
		// "regenerate" = captions only; a player must synthesize to hear anything.
		audioMode: opts.hasAudio ? 'embedded' : 'regenerate',
		voice: {
			engine: rung === 'kokoro' ? 'on-device' : 'cloud',
			model: String(voice.model || ''),
			voice: String(voice.voice || ''),
			speed: Number.isFinite(voice.speed) ? voice.speed : 1,
		},
	};
}

/** Convenience: build → serialize in one call. */
function buildEnvelope(deck, opts) {
	return serializeEnvelope(buildManifest(deck, opts));
}

module.exports = {
	LATTICE_DOC_VERSION,
	READ_ALONG_VERSION,
	buildReadAlong,
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
