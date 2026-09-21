import { fenceLanguages, looksLikeShellScript, normalizeInfo, SCRIPT_TAGS, SESSION_TAGS } from '../../../../lib/core/fence-languages.js';

// The Compose language picker's CATALOG — pure, DOM-free, framework-free, so the
// grouping and the coaching can be tested without an editor (Cadenza-shaped, like
// `registers.ts` beside it).
//
// WHAT A FENCE TAG IS HERE. Three different things wear the same syntax, and the
// picker has to tell them apart because the author's intent differs completely:
//
//   1. An ENGINE SUB-LANGUAGE — `mermaid`, `anima`, `functionplot`. The fence body
//      is not code to be colored, it is a spec the engine RENDERS into a diagram, a
//      scene or a plot. Two thirds of the fences we ship are one of these
//      (142 `mermaid` of 214, censused at 651aa2b), which is why they lead the list.
//   2. A HIGHLIGHT.JS GRAMMAR — `js`, `python`, `sql`. The body is code, colored by
//      the engine's highlight.js and nothing more.
//   3. `text` — deliberately uncolored. Twelve shipped fences want exactly that, so
//      it is an offered choice rather than an absence.
//
// The hljs half of the catalog is read from the grammar manifest
// (`docs/public/playground/hljs/index.json`, built by tools/build-hljs-languages.js):
// `languages` are the 156 fetched on demand, `common` the 36 inside the engine
// bundle, and `aliases` resolves every spelling of a lazy grammar to its canonical
// name. That manifest is the only complete machine-readable answer to "what can this
// renderer actually color", so the picker reads it instead of carrying a list that
// would rot on the next highlight.js bump.

/** One row in the picker. `tag` is what lands in the source; everything else is display. */
export type FenceOption = {
	/** The info-string tag, exactly as it is written after the opening fence. */
	tag: string;
	/** A human name, for rows where the tag alone does not say what it draws. */
	label?: string;
	/** Other spellings the same grammar answers to — shown, and searched. */
	aliases?: string[];
	/** One line of context; the picker shows it under the row. */
	note?: string;
};

export type FenceGroup = { key: 'lattice' | 'deck' | 'all'; label: string; options: FenceOption[] };

/** The grammar manifest's shape. `common` was added for this picker — see the builder. */
export type HljsManifest = {
	languages?: Record<string, { file: string; bytes: number }>;
	aliases?: Record<string, string>;
	common?: Record<string, string[]>;
};

/**
 * The engine's own fenced sub-languages.
 *
 * `mermaid` and `functionplot` are the two `dist/docs/grammar.json` registers as LFM
 * fences (`tools/build-docs-portal.js` § FENCES); `anima` is recognized by the engine
 * (`animaSceneFences` in lib/integrations/markdown-it/plugins.js) and used by the
 * `scene` component, but is absent from that registry and from spec/LFM-1.0.md. That
 * gap is real and it is not this change's to close — the spec is not ours to edit on
 * the way past (CLAUDE.md § "is this decision mine to make") — so it is filed rather
 * than fixed here, and the catalog carries all three because an author who wants a
 * motion scene needs the row either way.
 *
 * `latticeFencesCovered` (below) pins the direction that matters: every tag the
 * registry DOES list has to appear here, so a fourth engine fence cannot ship without
 * the picker learning it.
 */
export const LATTICE_FENCES: readonly FenceOption[] = Object.freeze([
	{ tag: 'mermaid', label: 'Diagram', note: 'Mermaid — flowcharts, sequences, state charts. Pairs with `_class: diagram`.' },
	{ tag: 'anima', label: 'Motion', note: 'An Anima scene spec (JSON). Pairs with `_class: scene`.' },
	{ tag: 'functionplot', label: 'Plot', aliases: ['latticeplot'], note: 'A function-plot config (JSON). Pairs with `_class: math`.' },
]);

/** Deliberately uncolored. Offered, not implied — twelve shipped fences ask for it. */
export const PLAIN_FENCE: FenceOption = Object.freeze({ tag: 'text', label: 'Plain', note: 'No highlighting — the fence renders as undifferentiated mono.' });

const LATTICE_TAGS = new Set(LATTICE_FENCES.map((f) => f.tag));

/** Is this tag one the engine renders rather than colors? */
export function isEngineFence(tag: string): boolean {
	const t = normalizeInfo(tag);
	if (LATTICE_TAGS.has(t)) return true;
	return LATTICE_FENCES.some((f) => f.aliases?.includes(t));
}

/**
 * Every tag the catalog knows, canonical name → its row. Built once per manifest.
 *
 * A lazy grammar and a `common` one are indistinguishable to an author — both color
 * a fence — so they are one flat set here; only `ensure-hljs-language` cares which
 * half a name came from, and it reads the manifest itself.
 */
export function hljsOptions(manifest: HljsManifest | null | undefined): FenceOption[] {
	if (!manifest) return [];
	const aliasesFor = new Map<string, string[]>();
	for (const [alias, canonical] of Object.entries(manifest.aliases || {})) {
		const list = aliasesFor.get(canonical);
		if (list) list.push(alias);
		else aliasesFor.set(canonical, [alias]);
	}
	const out: FenceOption[] = [];
	for (const name of Object.keys(manifest.languages || {})) {
		if (LATTICE_TAGS.has(name)) continue; // the engine's own row wins (mermaid ships as an hljs grammar too)
		out.push({ tag: name, aliases: aliasesFor.get(name)?.sort() });
	}
	for (const [name, aliases] of Object.entries(manifest.common || {})) {
		if (LATTICE_TAGS.has(name)) continue;
		out.push({ tag: name, aliases: aliases.length ? [...aliases].sort() : undefined });
	}
	return out.sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Resolve a tag to the catalog row that owns it — following aliases, so `js`, `JS`
 * and ````js {1,3}` all land on `javascript`. Returns null for a tag nothing knows,
 * which is not an error: `anima` colors nowhere, and an author may tag a fence with
 * a language this highlighter has never heard of.
 */
export function resolveFenceTag(tag: string, manifest: HljsManifest | null | undefined): FenceOption | null {
	const t = normalizeInfo(tag);
	if (!t) return null;
	const lattice = LATTICE_FENCES.find((f) => f.tag === t || f.aliases?.includes(t));
	if (lattice) return lattice;
	if (t === PLAIN_FENCE.tag) return PLAIN_FENCE;
	if (!manifest) return null;
	// `Object.hasOwn` throughout: `t` is a fence INFO STRING, i.e. author text, and a
	// ```constructor fence resolves truthy against any plain object's prototype. The
	// shipped manifest happens to be safe, but the type permits one without `aliases`,
	// and this is the same footgun `ensure-hljs-language.ts` already paid for once.
	// Written out per map rather than through a helper, because a predicate FUNCTION
	// does not narrow the optional away for the reader or the compiler.
	const aliases = manifest.aliases;
	const languages = manifest.languages;
	const common = manifest.common;
	const canonical = aliases && Object.hasOwn(aliases, t) ? aliases[t] : t;
	if (languages && Object.hasOwn(languages, canonical)) return { tag: canonical, aliases: aliasesOfCommon(manifest, canonical) };
	if (common && Object.hasOwn(common, canonical)) return { tag: canonical, aliases: common[canonical] };
	// A `common` grammar's alias is not in `manifest.aliases` (that map exists to point
	// a spelling at a FILE to fetch), so it is resolved by scanning the common half.
	for (const [name, aliases] of Object.entries(manifest.common || {})) {
		if (aliases.includes(t)) return { tag: name, aliases };
	}
	return null;
}

function aliasesOfCommon(manifest: HljsManifest, canonical: string): string[] | undefined {
	const out = Object.entries(manifest.aliases || {})
		.filter(([, c]) => c === canonical)
		.map(([a]) => a)
		.sort();
	return out.length ? out : undefined;
}

/** The distinct tags this deck's fences already use, in first-appearance order.
 *  A thin re-export of the engine's own `fenceLanguages` — this used to re-implement
 *  its dedupe loop over `scanFences`, which is a second answer to a question the
 *  kernel beside it already answers (HARD RULE #1). Kept as a named export because the
 *  callers here read better for the deck-shaped name. */
export function deckFenceTags(source: string): string[] {
	return fenceLanguages(source) as string[];
}

/**
 * The picker's model: three groups, in the order an author reaches for them.
 *
 * A `query` filters the third group only — the first two are short enough to read,
 * and hiding "what this deck already uses" behind a search term is what makes a
 * picker feel like a database. With a query long enough to be a search, the Lattice
 * and deck groups are filtered too, so typing `py` does not leave three unrelated
 * rows pinned above the answer.
 */
export function fenceGroups(opts: { source?: string; manifest?: HljsManifest | null; query?: string; limit?: number }): FenceGroup[] {
	const { source = '', manifest = null, query = '', limit = 40 } = opts;
	const q = query.trim().toLowerCase();
	const matches = (o: FenceOption) => !q || o.tag.includes(q) || (o.label || '').toLowerCase().includes(q) || !!o.aliases?.some((a) => a.includes(q));

	const lattice = LATTICE_FENCES.filter(matches);

	const shown = new Set<string>(lattice.map((o) => o.tag));
	const deck: FenceOption[] = [];
	for (const tag of deckFenceTags(source)) {
		const row = resolveFenceTag(tag, manifest) || { tag, note: 'No grammar for this tag — the fence renders uncolored.' };
		if (shown.has(row.tag) || !matches(row)) continue;
		shown.add(row.tag);
		deck.push(row);
	}

	const rest: FenceOption[] = [];
	for (const row of [PLAIN_FENCE, ...hljsOptions(manifest)]) {
		if (shown.has(row.tag) || !matches(row)) continue;
		shown.add(row.tag);
		rest.push(row);
		if (rest.length >= limit) break;
	}

	const groups: FenceGroup[] = [];
	if (lattice.length) groups.push({ key: 'lattice', label: 'Lattice', options: lattice });
	if (deck.length) groups.push({ key: 'deck', label: 'In this deck', options: deck });
	if (rest.length) groups.push({ key: 'all', label: q ? 'Matches' : 'All languages', options: rest });
	return groups;
}

/**
 * The one line of coaching a chosen tag earns, or null when it earns none. We warn
 * and we coach; we never refuse an author's tag (HARD RULE #29's posture, applied to
 * the other authoring surface that could have been a gate).
 *
 * Two findings, both from `lib/core/fence-languages.js` rather than re-derived:
 *
 *  · SCRIPT TAGGED AS A SESSION. `shell`/`console`/`shellsession` are terminal-SESSION
 *    grammars whose job is to mark the `$` prompt; `bash`/`sh`/`zsh` parse a script.
 *    Measured there on one eleven-line script: ```sh gives 15 highlight spans and
 *    ```shell gives 2. The author sees "highlighting is broken" and the tag is why.
 *  · NO GRAMMAR AT ALL. An engine sub-language is rendered, not colored, and a tag
 *    nothing knows stays mono. Saying so beats a silently monochrome block.
 */
export function fenceAdvice(tag: string, body: string, manifest: HljsManifest | null | undefined): string | null {
	const t = normalizeInfo(tag);
	if (!t) return 'Untagged — this fence renders as undifferentiated mono. Pick a language.';
	if ((SESSION_TAGS as readonly string[]).includes(t) && looksLikeShellScript(body)) {
		return `\`${t}\` is a terminal-session grammar — it only marks the \`$\` prompt. This body is a script, so tag it \`${SCRIPT_TAGS[0]}\` to color it.`;
	}
	if (isEngineFence(t)) return null; // rendered by the engine, not colored — that is the point
	if (t === PLAIN_FENCE.tag) return null;
	if (!manifest) return null; // catalog not loaded yet — say nothing rather than guess
	if (!resolveFenceTag(t, manifest)) return `No grammar for \`${t}\` — the fence will render uncolored.`;
	return null;
}

/** Every tag `dist/docs/grammar.json` registers as an LFM fence must have a row above.
 *  Exported for the test that pins it; nothing else calls it. */
export function latticeFencesCovered(registryTags: string[]): string[] {
	return registryTags.filter((t) => !isEngineFence(t));
}
