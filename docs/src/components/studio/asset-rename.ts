// Renaming a saved asset, propagated into the decks that use it.
//
// WHY THIS EXISTS. A saved asset is referenced by NAME, and the name is the wiring,
// not a label: a deck says `theme: midnight` in its front matter, `<!-- _class:
// finish-velvet -->` on a slide, `<!-- _class: scorecard -->` for a component. Rename
// the asset and every one of those references points at something that no longer
// exists — the deck renders unstyled, the linter reports an unknown component, and
// for a theme it is worse than that: the Studio remembers the active palette by name
// too, so the shell finds a dead pointer and heals it by resetting to the default.
// The author sees their theme silently vanish from a deck they did not touch.
//
// So a rename is not a field edit. It is a rename PLUS a rewrite of every deck that
// referred to the old name, and this module is the rewrite half.
//
// BUILT OUT OF THE EXISTING PRIMITIVES, NOT A NEW PARSER. `comments()` finds the
// directive comments fence-aware (so a `code` slide DEMONSTRATING `_class:` is not
// edited); `getClassTokens`/`setClassTokens` read and splice a directive's tokens
// span-surgically, touching no other byte; `writeFrontMatterLine` owns the front
// matter. A regex sweep over the source would have been shorter and would have
// rewritten the example inside the code fence — which is exactly the bug those
// primitives were written to stop (see slide-directives.ts's header).
//
// PURE. It takes a source and returns a source, so the risky part — "we are about to
// edit decks you are not looking at" — is testable without a store, a deck list, or a
// browser.

import { getFrontMatter, writeFrontMatterLine } from './front-matter';
import { comments, directiveKey, getClassTokens, setClassTokens } from './slide-directives';

/** The asset kinds whose name appears in deck source. */
export type RenamableKind = 'theme' | 'component' | 'finish';

/**
 * The class TOKEN a kind contributes to a slide's `_class`, or null when the kind
 * never appears there. A finish is written `finish-<name>`; a component is its bare
 * name; a theme is front matter only.
 */
function classTokenFor(kind: RenamableKind, name: string): string | null {
	if (kind === 'component') return name;
	if (kind === 'finish') return `finish-${name}`;
	return null;
}

/** Rewrite every `_class` directive token `from` → `to`. Right-to-left, so each
 *  splice leaves the spans of the ones still to come untouched. */
function renameClassTokens(source: string, from: string, to: string): { source: string; hits: number } {
	const dirs = comments(source).filter((c) => directiveKey(c.body) === 'class');
	let out = source;
	let hits = 0;
	for (const c of [...dirs].reverse()) {
		const slice = out.slice(c.start, c.end);
		const tokens = getClassTokens(slice);
		if (!tokens.includes(from)) continue;
		const next = setClassTokens(slice, tokens.map((t) => (t === from ? to : t)));
		if (next === slice) continue; // not editable (a duplicate/array shape) — left alone
		out = out.slice(0, c.start) + next + out.slice(c.end);
		hits += 1;
	}
	return { source: out, hits };
}

/**
 * Rewrite one deck's references to a renamed asset.
 *
 * Returns the new source and how many references moved. `hits === 0` means the deck
 * never mentioned the asset, so the caller can skip writing it — which matters:
 * rewriting a deck's bytes for no reason would bump it in every "recently changed"
 * surface and add a version to its history for nothing.
 */
export function renameAssetInSource(source: string, kind: RenamableKind, from: string, to: string): { source: string; hits: number } {
	const text = String(source ?? '');
	if (!from || !to || from === to) return { source: text, hits: 0 };
	let out = text;
	let hits = 0;

	// Deck-wide front matter: `theme:` for a theme, `finish:` for a finish. A
	// component is never a deck-wide key.
	const fmKey = kind === 'theme' ? 'theme' : kind === 'finish' ? 'finish' : null;
	if (fmKey && getFrontMatter(out, fmKey)?.trim() === from) {
		out = writeFrontMatterLine(out, fmKey, to);
		hits += 1;
	}

	// Per-slide class tokens.
	const token = classTokenFor(kind, from);
	if (token) {
		const next = renameClassTokens(out, token, classTokenFor(kind, to) as string);
		out = next.source;
		hits += next.hits;
	}

	// NOTE, because it looks like it should be here and is not: `finish-override:` is
	// NOT keyed on the finish name. It is keyed on the LAYER names of whichever finish
	// is active (`backdrop`, `wash`, `mark`, `edge` — see parseFinishOverride), so a
	// rename leaves it correct as it stands. An earlier draft "moved" it and would have
	// renamed a layer key to the new finish name, silently voiding the author's tuning.

	return { source: out, hits };
}

/**
 * The same rewrite across a whole workspace. `decks` maps deck id → source; the
 * result holds ONLY the decks that actually changed, so the caller writes the
 * minimum.
 */
export function renameAssetAcrossDecks(
	decks: Iterable<[string, string]>,
	kind: RenamableKind,
	from: string,
	to: string,
): { changed: Map<string, string>; hits: number } {
	const changed = new Map<string, string>();
	let hits = 0;
	for (const [id, source] of decks) {
		const next = renameAssetInSource(source, kind, from, to);
		if (!next.hits) continue;
		changed.set(id, next.source);
		hits += next.hits;
	}
	return { changed, hits };
}
