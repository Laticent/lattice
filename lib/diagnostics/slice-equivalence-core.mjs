/**
 * Slice/deck equivalence — the PURE core, shared by the two surfaces that ask the same question.
 *
 * THE QUESTION. The preview shows one slide. Rendering that slide ALONE is far cheaper than
 * re-parsing the whole deck on every keystroke — but a slide can render things whose value comes
 * from OTHER slides (its page number, its section on the progress rail, its `cat-N` hue). So:
 * **does the slide rendered alone come out the same as that slide rendered inside the deck?**
 *
 * Two surfaces ask it, and neither should own the answer alone (HARD RULE #15, and the shape
 * lib/authoring/lint-core.js already set — pure, fs-free, so it bundles for the browser):
 *
 *   - `tools/slice-equivalence.mjs` — HEADLESS. Sweeps every committed deck and reports a rate
 *     against a committed baseline. No browser, so it can be automated and gated.
 *   - `docs/src/components/studio/PreviewFidelityOverlay.tsx` — AUTHOR-FACING. Answers it for the
 *     one slide in front of the author, on their real device, when something looks wrong.
 *
 * This module holds only what BOTH need: how to cut a deck into slides, how to rebuild the
 * directive context a slice lost, how to compare two renders fairly, and how to name a difference.
 * Nothing here touches `fs`, the network, or the DOM.
 *
 * NO IMPORTS, on purpose — the same constraint lib/authoring/lint-core.js works under, for the same
 * reason. The engine's directive VOCABULARY lives in lib/engine/directives.js, which is CommonJS;
 * the docs bundler resolves `lib/**.mjs` as ESM but will not do named-export interop on a CJS file
 * there, so importing it would break the browser build outright. The vocabulary is DATA, not logic,
 * so `synthesizePrelude` takes it as an argument: the Node CLI hands it the real sets, and the
 * browser — which never synthesizes a prelude, only compares renders — never loads it at all.
 */

/** Leading YAML front matter, or '' — kept verbatim so a slice renders under the deck's globals. */
export function frontMatterOf(src) {
	return (/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(String(src ?? '')) || [''])[0];
}

/** Fence-aware slide split — a `---` inside a fenced block is a horizontal rule, not a boundary. */
export function splitSlides(body) {
	const out = [[]];
	let fence = null;
	for (const line of String(body ?? '').split('\n')) {
		const m = /^[ \t]*(```|~~~)/.exec(line);
		if (m) fence = fence === m[1] ? null : (fence ?? m[1]);
		if (!fence && /^-{3,}[ \t]*$/.test(line)) {
			out.push([]);
			continue;
		}
		out[out.length - 1].push(line);
	}
	return out.map((l) => l.join('\n'));
}

/**
 * The running-global directives in force when slide `k` renders, rebuilt as a prelude.
 *
 * A directive comment WITHOUT the `_` spot prefix applies to its slide AND every one after, so a
 * slice loses everything it inherited. This is the GENERAL repair — unlike a page number or a
 * section index, a running `header:` is text, so there is no count to hand over; the context has to
 * be reconstructed and the engine left to derive from it.
 *
 * Keyed on the ENGINE's own vocabulary, in both directive spellings:
 *   - `key: value` — only for a key the engine actually knows. Treating any `name: value` comment
 *     as a running global injected slide-local `describe:` notes into every later slide (32 false
 *     mismatches, all this synthesizer's fault rather than the engine's).
 *   - the bare flag form — `build`, `debug` and `lens` are legal written `<!-- build -->`
 *     (FLAG_DIRECTIVES). Missing them UNDER-synthesizes the prelude, which likewise reports a
 *     mismatch this file caused. Found in review.
 *
 * `vocab` is `{ known, flags }` — the engine's own `KNOWN_DIRECTIVES` / `FLAG_DIRECTIVES` sets,
 * injected rather than imported (see the module header).
 */
export function synthesizePrelude(slides, k, vocab) {
	const known = vocab?.known ?? new Set();
	const flags = vocab?.flags ?? new Set();
	const running = new Map();
	for (let i = 0; i < k && i < slides.length; i++) {
		for (const m of String(slides[i] ?? '').matchAll(/<!--\s*([A-Za-z][\w]*)\s*(?::\s*([\s\S]*?))?-->/g)) {
			const [, key, value] = m;
			if (value === undefined) {
				if (flags.has(key)) running.set(key, '');
				continue;
			}
			if (known.has(key)) running.set(key, value.trim());
		}
	}
	return [...running].map(([key, v]) => (v === '' ? `<!-- ${key} -->` : `<!-- ${key}: ${v} -->`)).join('\n');
}

/** The rendered `<section>` elements of an engine render, in order. */
export function sectionsOf(html) {
	return String(html ?? '').match(/<section[\s\S]*?<\/section>/g) || [];
}

/**
 * Neutralize differences before comparing two renders. **Every neutralizer flatters the result**,
 * so each is named and each is a choice — and the two surfaces make OPPOSITE choices, which is the
 * whole reason this takes options rather than being one fixed pipeline:
 *
 *   - The HEADLESS sweep measures the prelude prototype in isolation, so it neutralizes the repairs
 *     that already ship (`pagination`, `rail`) to keep them out of the prototype's score.
 *   - The AUTHOR-FACING overlay is checking whether the preview is telling the truth, and a wrong
 *     page number or a wrong rail is precisely the bug it exists to catch. Neutralizing those there
 *     would hide the finding. It leaves them ON and neutralizes only `ids`.
 *
 * Defaults are the strict reading — nothing hidden unless a caller asks for it.
 *
 *   ids         positional `id="N"` — a counter from the document start. The one residual with no
 *               shipped repair yet (`resetRenderIds` → `seedRenderIds`), so both surfaces drop it.
 *   pagination  the `data-lattice-pagination` attribute AND its painted `.lat-pagination` span.
 *               Supplied today (#1272). Neutralizing the attribute but not the span once read
 *               34.2% where the truth was 90.5% — they move together or not at all.
 *   rail        the progress tile. Supplied today (#1280).
 *   whitespace  inter-block whitespace. An artifact of rendering a fragment rather than a deck:
 *               block adjacency shifts, so the body re-parses tight-vs-loose. Not a visible
 *               difference, and owed to a better instrument on both surfaces.
 */
export function normalizeSection(s, { ids = false, pagination = false, rail = false, whitespace = false } = {}) {
	let out = String(s ?? '');
	if (ids) out = out.replace(/\sid="\d+"/g, '');
	if (pagination) {
		out = out.replace(/data-lattice-pagination(?:-total)?="\d+"/g, '').replace(/(<span class="lat-pagination">)\d+(<\/span>)/g, '$1$2');
	}
	if (rail) out = out.replace(/<div class="tile-progress"[\s\S]*?<\/div>/g, '');
	if (whitespace) out = out.replace(/>\s+</g, '><');
	return out.trim();
}

/** What the headless sweep neutralizes — see normalizeSection. */
export const PROTOTYPE_NEUTRALIZERS = { ids: true, pagination: true, rail: true, whitespace: true };
/** What the author-facing overlay neutralizes: only the residual with no shipped repair. */
export const SHIPPED_NEUTRALIZERS = { ids: true, whitespace: true };

/**
 * Name WHY two normalized renders differ. The buckets map to the repair-cascade rows of
 * engineering/decisions/2026-07-30-preview-deck-context-and-render-cost.md §5, so a residual points
 * at the fix that would close it rather than at a raw diff.
 */
export function classifyDivergence(got, want) {
	const strip = (s) => String(s ?? '').replace(/\blat-svg[td]-\d+\b/g, '').replace(/\bcat-\d\b/g, '');
	if (strip(got) === strip(want)) return 'generated ids / cat-N (seedRenderIds row)';
	if (/tile-watermark/.test(got) !== /tile-watermark/.test(want)) return 'watermark glyph';
	return 'unclassified';
}

/**
 * The first place two strings part company, with a little context either side — what an author
 * needs to SEE the difference, rather than a boolean telling them one exists. `span` is how much
 * of each side to quote.
 */
export function firstDivergence(got, want, span = 60) {
	const a = String(got ?? '');
	const b = String(want ?? '');
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
	if (i === a.length && i === b.length) return undefined;
	const from = Math.max(0, i - 12);
	return { at: i, got: a.slice(from, i + span), want: b.slice(from, i + span) };
}
