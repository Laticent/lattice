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
	// REQUIRED, and it throws rather than defaulting to empty sets. An empty vocabulary silently
	// synthesizes an empty prelude for every slide — which reads as a plausible equivalence rate and
	// moves the baseline band by 0.0 points, so nothing anywhere would catch a caller that dropped
	// the argument. A loud failure is the only detectable one.
	if (!vocab?.known || !vocab?.flags) throw new TypeError('synthesizePrelude needs { known, flags } — the engine directive vocabulary');
	const known = vocab.known;
	const flags = vocab.flags;
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
	// SPLIT, not fused. These two were one bucket, and on the corpus it reads 44 invisible id
	// counters to 5 `cat-N` — so 90% of a bucket named for both was the harmless half, and the
	// visible half (a proof panel showing the wrong hue, the bug this whole feature line exists to
	// fix) was labeled with it. Worse, the overlay renders that bucket with a reassuring line about
	// a known repair being owed, which is the last thing an author should read when their slide is
	// actually the wrong color. Test them separately, most-visible first.
	const noIds = (s) => String(s ?? '').replace(/\blat-svg[td]-\d+\b/g, '');
	const noCat = (s) => String(s ?? '').replace(/\bcat-\d\b/g, '');
	if (noCat(got) === noCat(want)) return 'cat-N (categorical hue)';
	if (noIds(got) === noIds(want)) return 'generated ids (seedRenderIds row)';
	if (noIds(noCat(got)) === noIds(noCat(want))) return 'cat-N + generated ids';
	if (/tile-watermark/.test(got) !== /tile-watermark/.test(want)) return 'watermark glyph';
	return 'unclassified';
}

/**
 * Break two rendered `<section>`s into the NAMED things that differ, rather than a window of raw
 * markup.
 *
 * WHY. Quoting the first N characters where two renders part company is honest but unreadable: it
 * lands mid-attribute and prints `ndaco" data-lattice-pagination="2" style="--paginate:true`, which
 * an author cannot act on. What actually differs between two renders of the same slide is almost
 * always one of three named things — a section attribute, a class token, or the text — and naming
 * them is the difference between a dump and a diagnostic.
 *
 * Returns one entry per difference, most identifiable first:
 *   { kind: 'attribute' | 'class' | 'text' | 'markup', name, got, want }
 * `got`/`want` are `undefined` when that side does not have the thing at all (a missing attribute,
 * a class only one side carries). `markup` is the honest fallback for a difference inside the body
 * that isn't attributable to any of the above — it carries the raw window, clearly labeled as the
 * last resort rather than the headline.
 */
export function diffSections(got, want) {
	const A = parseSectionTag(got);
	const B = parseSectionTag(want);
	const out = [];

	// Class TOKENS, compared as sets — the engine's own reading (`cls.split(/\s+/)`). Reporting the
	// whole class string would make one added token look like a wholesale rewrite.
	const ca = new Set(A.classes);
	const cb = new Set(B.classes);
	const onlyGot = A.classes.filter((c) => !cb.has(c));
	const onlyWant = B.classes.filter((c) => !ca.has(c));
	if (onlyGot.length || onlyWant.length) {
		out.push({ kind: 'class', name: 'class', got: onlyGot.join(' ') || undefined, want: onlyWant.join(' ') || undefined });
	}

	// Every other attribute on the section, by name. Sorted so the readout is stable between runs.
	for (const key of [...new Set([...Object.keys(A.attrs), ...Object.keys(B.attrs)])].sort()) {
		if (key === 'class') continue;
		if (A.attrs[key] !== B.attrs[key]) out.push({ kind: 'attribute', name: key, got: A.attrs[key], want: B.attrs[key] });
	}

	// The words on the slide. Compared after tag-stripping, so a markup-only difference does not
	// masquerade as changed copy.
	const ta = sectionText(got);
	const tb = sectionText(want);
	if (ta !== tb) out.push({ kind: 'text', name: 'text', got: ta || undefined, want: tb || undefined });

	// The raw window, as the LAST RESORT: the bodies differ but neither the section tag nor the words
	// explain it (a nested element's attribute, a reordered child).
	//
	// Gated on `ta === tb` DELIBERATELY, not incidentally. When the words already differ, that is the
	// bigger and more legible signal, and appending a markup window underneath it would add noise to
	// 755 of the corpus's 1076 real divergences. An earlier cut wrote `(!out.length || ta === tb)`,
	// which is the same condition with a dead disjunct — `ta !== tb` always pushes a row above, so
	// `!out.length` implies `ta === tb`. Stated plainly so the precedence reads as a choice.
	//
	// Bodies are compared WHITESPACE-COLLAPSED, because HTML collapses whitespace when it paints, so
	// a re-wrap is not a difference an author can see and reporting it would be noise dressed as a
	// finding. (`<pre>` is the exception where whitespace does paint — a known gap, and the caller's
	// empty-list wording is careful not to claim otherwise.)
	const ba = collapse(A.body);
	const bb = collapse(B.body);
	if (ba !== bb && ta === tb) {
		const d = firstDivergence(ba, bb);
		if (d) out.push({ kind: 'markup', name: 'markup', got: d.got, want: d.want });
	}
	return out;
}

/**
 * The opening `<section …>` tag broken into class tokens + attributes, plus everything inside it.
 *
 * Both regexes are QUOTE-AWARE, which matters because the failure mode of a naive one is a
 * confidently WRONG row rather than a missing one:
 *   - `[^>]*` for the tag stopped at the first `>`, so a value containing one (`data-x="a>b"`) cut
 *     the tag in half and the remainder surfaced as a difference labeled `text` — under a tap
 *     explanation reading "the words on the slide differ", quoting attribute markup.
 *   - matching only `="…"` made a single-quoted `class='a b'` parse as three empty attributes
 *     (`class`, `a`, `b`), inventing rows named after class tokens.
 * Neither is reachable from engine output today (markdown-it escapes `>` and always double-quotes),
 * but this parses author HTML too, and "wrong" is the expensive direction.
 *
 * THE ALTERNATIVES MUST STAY DISJOINT — the catch-all is `[^>"']`, not `[^>]`. With `[^>]` a quote
 * is matchable by BOTH the quoted branch and the catch-all, so a run of `""` decomposes
 * exponentially many ways and the regex backtracks catastrophically on a crafted section tag
 * (CodeQL js/redos, flagged high on this file). Excluding quotes from the catch-all leaves exactly
 * one parse. The cost is that an UNBALANCED quote inside a tag no longer matches at all — which
 * degrades to "no attributes named", the safe direction, rather than a wrong row.
 */
function parseSectionTag(html) {
	const s = String(html ?? '');
	const m = /^\s*<section\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(s);
	const attrs = {};
	for (const a of (m?.[1] ?? '').matchAll(/([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
		if (a[1]) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? '';
	}
	const classes = (attrs.class ?? '').trim().split(/\s+/).filter(Boolean);
	const body = m ? s.slice(m[0].length).replace(/<\/section>\s*$/i, '') : s;
	return { attrs, classes, body };
}

/**
 * Two values shortened around WHERE THEY DIFFER, not around their start.
 *
 * A naive head-truncation is useless for the values that actually show up here: two `style`
 * attributes that share 40 characters of custom properties before diverging both render as
 * `--paginate:tr…`, so the row says "these differ" and shows the part that doesn't. This finds the
 * first parting point and takes the window from there, marking any elision with an ellipsis so a
 * shortened value is never mistaken for the whole one.
 */
export function contrastValues(a, b, span = 14) {
	const x = String(a ?? '');
	const y = String(b ?? '');
	let i = 0;
	while (i < x.length && i < y.length && x[i] === y[i]) i += 1;
	// Back off a few characters so the window has a little of the shared run for context.
	const from = Math.max(0, i - 3);
	const cut = (v) => (from > 0 ? '…' : '') + v.slice(from, from + span) + (from + span < v.length ? '…' : '');
	return { got: cut(x), want: cut(y) };
}

/** Runs of whitespace to a single space — what HTML itself does when it paints. */
const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The visible words of a rendered section — tags stripped, whitespace collapsed.
 *
 * The tag pattern is QUOTE-AWARE for the same reason parseSectionTag's is: a naive `<[^>]*>` stops
 * at the first `>`, so an attribute value containing one leaks the rest of the tag into the "words"
 * and surfaces as a wording difference that quotes markup. Its alternatives are disjoint
 * (`[^>"']`, never `[^>]`) so it cannot backtrack exponentially — see parseSectionTag's note.
 */
export function sectionText(html) {
	return String(html ?? '')
		.replace(/<(?:"[^"]*"|'[^']*'|[^>"'])*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
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
