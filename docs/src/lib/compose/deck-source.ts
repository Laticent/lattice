// A DEFAULT import: it is a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).

import { readDirectiveComment } from '../../../../lib/core/comment-directive.mjs';
import { isRecordOpener, parsePaneMarker, readRecord } from '../../../../lib/core/meta-door.mjs';
import { commentReadings } from '../../../../lib/core/meta-edit.mjs';
import { CLASS_VOCAB } from '../../../../lib/core/meta-keys.mjs';
import { math as MATH } from '../../../../lib/plugins/detect.generated.mjs';
import { splitSlides } from '../deck-lint';
import { frontMatterBlock, stripFrontMatter } from '../front-matter';
import { normalizeSourceText } from '../normalize-source-text';
import { fenceRanges } from '../slide-directives';
import { withoutModeledBlocks } from './raw-block';

// The math plugin's own detectors (math.syntax.mjs), through the generated detector table, never by
// importing the plugin's folder (tools/structure.js holds that line).
const hasDisplayMath = MATH.queries?.hasDisplayMath as (src: string) => boolean;


// Pure deck-source helpers — the fence-aware split/join between a Lattice deck's
// canonical markdown and its parts (front-matter, per-slide directives, prose).
// Zero DOM, zero editor dependency; the ProseMirror layer (deck-doc) is built on
// top of this. The front-matter + slide splitters are the SHARED engine ones
// (front-matter.ts / lint.ts) — one source of truth (HARD RULE #1), not a fork.

export type SlideChunk = { directives: string[]; prose: string };
export type ParsedSlide = SlideChunk & { raw: string };

// A directive comment (`<!-- _class: kpi -->`) or a slide-metadata record (`<!-- {layout=kpi} -->`, `<!-- @meta{…} -->`,
// record note §4): both set the slide's attributes, so both are hoisted out of the prose the same way.
// A multi-line comment's body may not cross another `<!--`, so a comment with text after it on its line cannot run on to
// a later comment and hoist the whole slide between them (red team, 2026-11-11). On ONE line it may: a line holding two
// comments is one compound directive line to Compose, as it was.
const DIRECTIVE_LINE_RE = /^[ \t]*<!--\s*(?:_[A-Za-z][\w-]*:|\{|@meta\{)(?:[^\n]*?|(?:(?!<!--)[\s\S])*?)-->[ \t]*$/gm;

/** The `class` slice of the directive vocabulary (lib/core/comment-directive.mjs binds one key). */

/** The class PAYLOAD one directive line carries (`<!-- _class: kpi dark -->` → `kpi dark`), or null
 *  when the line is not a class directive. Read through the engine's own comment grammar
 *  (lib/core/comment-directive.mjs, what lib/engine/slides.js binds), so Compose cannot read a
 *  class the render does not apply: quotes are stripped the engine's way, and a compound comment
 *  is a class directive only when `_class` is its FIRST key. */
export function classPayloadOf(directive: string): string | null {
	const text = String(directive ?? '').trim();
	// A record's class is the words its typed fields compose (lib/core/meta-door.mjs `readRecord`), as the engine applies them.
	if (text.startsWith('<!--') && text.endsWith('-->') && isRecordOpener(text.slice(4, -3))) {
		const rec = readRecord(text.slice(4, -3));
		return rec?.ok && rec.d.class !== undefined ? rec.d.class : null;
	}
	return readDirectiveComment(text, CLASS_VOCAB)?.value ?? null;
}

/** The component of one directive line: the first token of its class payload, or null. */
export function classNameOf(directive: string): string | null {
	return classPayloadOf(directive)?.split(/\s+/)[0] || null;
}
const SEP = '\n\n---\n\n';

/** CRLF → LF. The slide separator `\n-{3,}\n` doesn't match `\r\n---\r\n`, so a CRLF
 *  deck must be normalized before splitting or it collapses to one slide.
 *
 *  DELEGATES to the shared `toLf` rather than carrying its own `.replace` (HARD RULE #15).
 *  This predates the LF policy and was an independent second implementation of the same
 *  regex — exactly the duplication the policy exists to end, and it is why `SANCTIONED_EOL_BOUNDARIES` in `tools/check-ownership.js`
 *  can be trusted as the boundary list: a second normalizer outside that grep would make the
 *  list a lie. Kept as a named export because callers here read better for it. */
export function normalizeSource(source: string): string {
	return normalizeSourceText(source);
}

/** Split one slide chunk into preserved directive lines + the prose body. FENCE-AWARE:
 *  a `<!-- _x -->` inside a fenced code sample is left in the prose, never hoisted. */
export function splitSlideDirectives(chunk: string): SlideChunk {
	const fences = fenceRanges(chunk);
	const inFence = (i: number) => fences.some(([s, e]) => i >= s && i < e);
	// Hoist only what the engine applies (`commentReadings`): a comment in indented code or folded into an HTML block is an
	// example, and lifting it would turn it on. Walk every comment the engine applies in order, and keep in place any
	// that cannot move (one in a quote, a pane marker, a line the hoist does not match) together with any that sets a
	// field one of those kept sets: last wins, so lifting it past them would change the winner (the checkers on #3136).
	// A kept comment Compose cannot write back as it is locks the slide (`hasLossyConstruct`).
	const readings = commentReadings(chunk);
	const lineStarts = [0];
	for (let i = chunk.indexOf('\n'); i !== -1; i = chunk.indexOf('\n', i + 1)) lineStarts.push(i + 1);
	const lineOf = (offset: number) => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
	// A line is lifted only when the next non-blank line is not indented: lifting it out from between a list and an
	// indented line would make that line part of the list item, where an indented example becomes live (the seeded
	// round trip in deck-source.test.ts found it).
	const matched = new Map<number, string>();
	for (const m of chunk.matchAll(DIRECTIVE_LINE_RE)) {
		const at = (m.index ?? 0) + m[0].search(/\S/);
		const next = chunk.slice((m.index ?? 0) + m[0].length).match(/^(?:[ \t]*\r?\n)*([^\n]*)/)?.[1] ?? '';
		if (!inFence(at) && !/^[ \t]/.test(next)) matched.set(lineOf(at), m[0]);
	}
	const chunkLines = chunk.split('\n');
	// Past a pane marker a setting belongs to that pane, so nothing after the first one moves (a record lifted out of a
	// pane took its class to the slide; the checker on #3136).
	const firstPane = chunkLines.findIndex((l) => l.trim().startsWith('<!--') && parsePaneMarker(l.trim())?.pane) + 1 || Number.POSITIVE_INFINITY;
	const kinds = lineKinds(chunkLines);
	const hoist = new Set<number>();
	const kept = new Set<string>();
	for (const line of [...readings.keys()].sort((a, b) => a - b)) {
		const r = readings.get(line);
		if (!r || r.kind === 'note') continue;
		const text = matched.get(line);
		// A directive nested in a list moves too, as it always did: left in place, Compose's parser reads it as list text
		// and escapes its underscore, and the slide loses it (the checker on #3136). Lifting it changes no field.
		// It stays when: it is a pane marker or comes after one; it is a record carrying a speaker note (lifting it would
		// reorder the slide's notes); it sits between two lists (lifting it would merge them); or it is indented in a list
		// item after a blank line (lifting it would draw a loose list tight).
		const body = text?.trim().slice(4, -3) ?? '';
		const carriesNote = r.kind === 'record' && isRecordOpener(body) && Object.keys(readRecord(body)?.notes ?? {}).length > 0;
		const betweenLists = listAbove(kinds, line) && listBelow(kinds, line + (text?.trim().split('\n').length ?? 1) - 2);
		// Indented in a list item after a blank line: that blank line is what makes the list loose (each item a
		// paragraph), so lifting the comment would draw the list tight. Kept, the slide opens in Markdown.
		const loosensList = /^[ \t]/.test(chunkLines[line - 1] ?? '') && kinds[line - 2] === 'blank' && listAbove(kinds, line);
		const movable =
			(r.kind === 'directive' || r.kind === 'record' || r.kind === 'nested') &&
			text !== undefined &&
			!parsePaneMarker(text.trim())?.pane &&
			line < firstPane &&
			!carriesNote &&
			!betweenLists &&
			!loosensList;
		const keys = [...r.keys].map((k) => scopedKey(k, r.kind, chunkLines.slice(line - 1, line + 2).join('\n')));
		if (movable && !keys.some((k) => kept.has(k))) hoist.add(line);
		else for (const k of keys) kept.add(k);
	}
	const directives: string[] = [];
	const prose = chunk
		.replace(DIRECTIVE_LINE_RE, (line, offset: number) => {
			// A `_pane` marker is not a slide directive: it marks WHERE a pane starts, so its place in
			// the body is its meaning. Hoisted to the head, one keystroke re-emitted both markers above
			// the `##` and the slide lost its panes. Left in the prose it parses as a comment node,
			// which round-trips its bytes in place (comment-block.ts), and Compose draws it as the
			// pane's component picker (pane-model.ts).
			// The marker is read by the one shared reader (lib/core/meta-door.mjs `parsePaneMarker`), in every spelling: a
			// record that names a pane (`<!-- {pane=bar} -->`) stays in place too, whatever else it sets.
			if (inFence(offset) || parsePaneMarker(line.trim())?.pane) return line;
			if (!hoist.has(lineOf(offset + line.search(/\S/)))) return line;
			directives.push(line.trim());
			return '';
		})
		// Leading BLANK lines only: a leading indent is an indented code block, and stripping it would turn an example
		// into a live comment (the checker on #3136).
		.replace(/^(?:[ \t]*\r?\n)+/, '')
		.trimEnd();
	return { directives, prose };
}

/** Re-assemble a slide chunk from its directives + prose. */
export function composeSlideChunk(directives: string[], prose: string): string {
	const head = directives.join('\n');
	const body = prose.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
	if (!head) return body;
	return body ? `${head}\n\n${body}` : head;
}

// Constructs the engine renders (commonmark + html:true + strikethrough) but the Compose
// parser does NOT model — so re-serializing a slide that contains one would flatten/escape
// it. A slide whose prose matches is LOCKED in Compose (read-only, "edit in Markdown"), so a
// keystroke can never reflow it. Inline HTML is excluded: it round-trips as literal text
// byte-exact (it is still SHOWN as a raw tag in Compose, which is untidy but harmless).
//
// HTML COMMENTS are excluded for a stronger reason as of 2026-09-15: they are no longer prose at
// all. `comment-block.ts` models them as an atom node carrying their source bytes, so Compose
// hides them behind a chip and the serializer writes them back verbatim. Before that they were
// excluded on the claim that they "round-trip as literal text byte-exact" — true of a ONE-LINE
// comment and false of every other shape. A multi-line one was reflowed onto a single line, and
// one with a blank line inside parsed its tail as an INDENTED CODE BLOCK, so the round-trip put
// the closing fence inside a code fence and the engine rendered an empty `pre` onto the slide.
// 25 such comments across 7 shipped decks were one keystroke away from that.
//
// MODELED since 2026-10-22 (raw-block.ts): a top-level block of HTML, a top-level `$$` block and inline `$x$` math. Each is an
// atom node that carries its source bytes, so none locks the slide. The same constructs inside a list item stay
// unmodeled (modeling them changes the render), and the patterns below still catch them.
//
// GFM pipe TABLES are NOT here: the Compose parser now models them as real schema nodes and
// round-trips them to pipe syntax (deck-markdown, 2026-07-19-compose-table-editing.md), so a
// table slide is editable in place. A table cell that ITSELF holds an unmodeled construct
// (math, block HTML, strikethrough, footnote) still trips the matching detector below and
// locks the whole slide — the guard degrades safely; we only unlock what we can round-trip.
// An HTML tag opener/closer (not an `<!-- comment -->`): `<div`, `</span>`, `<br/>`.
const HTML_TAG = String.raw`<(?!!--)\/?[a-zA-Z][\w-]*(?:\s|>|\/)`;
const LOSSY_CONSTRUCTS: RegExp[] = [
	/~~/, // strikethrough
	new RegExp(`^\\s*${HTML_TAG}`, 'm'), // block-level HTML tag at line start
	// Inline HTML on any line that is ALSO a table row — either order, and NOT requiring a leading
	// pipe (GFM allows borderless tables). The engine renders that HTML (html:true), and a pipe
	// inside a tag attribute splits the cell, so the slide must lock (Axis F). The old rule anchored
	// on a leading `|` and missed borderless rows / tag-before-pipe (adversarial-trio gaps).
	new RegExp(`^[^\\n]*\\|[^\\n]*${HTML_TAG}`, 'm'), // pipe … then a tag
	new RegExp(`^[^\\n]*${HTML_TAG}[^\\n]*\\|`, 'm'), // a tag … then pipe
	// An ENTITY-encoded tag (`&lt;img`, `&#60;script`, `&#x3c;div`) — the parser (html:false) decodes
	// the entity to a literal `<` and the serializer emits it unescaped, turning inert escaped text
	// into LIVE markup in the export on the next edit. Lock it everywhere (also closes the same
	// pre-existing gap in plain prose). Harmless entities (`&amp;`, `&copy;`) don't match.
	/&(?:lt|#0*60|#x0*3c);[!?/a-zA-Z]/i,
	// A BACKSLASH-escaped tag (`\<b>`): the same hazard by the other spelling. html:false reads `\<b>` and `<b>` as the same text,
	// so the serializer writes the escape away and the export draws live HTML; and the faithful write-back cannot tell which
	// bytes were which (2026-11-10-compose-first.md §6; the checker's catch on #3128). Lock it, as the entity form is.
	// A comment (`\<!--`) and a processing instruction (`\<?`) are the same hazard (the third checker's catch), in both spellings.
	/\\<[!?/a-zA-Z]/,
	// A list item led by `[X]`. The six markers (lib/core/checks-registry.js) round-trip now: the
	// serializer keeps a list item's leading marker unescaped, as it does in a table cell. `[X]` is
	// not one of the six (GFM reads it as a checked box, the opposite of a cross), so it stays locked.
	/^\s*(?:[-*+]|\d+[.)])\s+\[X\]/m,
	/\[\^[^\]]+\]/, // footnote reference / definition
	// An HTML block of types 3-5 (`<?php`, `<!DOCTYPE`, `<![CDATA[`): the engine draws raw HTML, Compose would show text.
	/^\s*<(?:\?|!\[CDATA\[|![A-Za-z])/m,
	// An ESCAPED dollar (`\$5`): the serializer writes it back bare, and next to math one bare `$` changes what the engine draws.
	/\\\$/,
];

/** Blank fenced code blocks (fence-aware) and inline-code spans before construct detection,
 *  so a `$…$` shell snippet, a pipe row in a code sample, or a `~~` in a fence never trips a
 *  lock — the engine renders code literally, so neither math nor a table lives inside it. */
function withoutCode(prose: string): string {
	const fences = fenceRanges(prose);
	let out = '';
	let pos = 0;
	for (const [start, end] of fences) {
		out += prose.slice(pos, start);
		pos = end;
	}
	out += prose.slice(pos);
	return out.replace(/`[^`\n]*`/g, ' '); // strip inline-code spans
}

/** Whether a slide's prose carries a construct the Compose round-trip would corrupt, so the
 *  slide must be locked read-only in Compose (edited in Markdown mode instead). Detection runs
 *  on prose with code blanked (code round-trips fine and never renders math/tables), and math
 *  uses the ENGINE's own currency-safe rules (`sourceHasMath`) — so `$a_1$` locks the slide but
 *  a `$400M` figure, or a `$x` in a shell fence, does not: the lock matches what the engine renders. */
export function hasLossyConstruct(prose: string): boolean {
	if (strandsADirective(prose)) return true;
	// Modeled blocks first, on the prose as the parser reads it (line numbers must match), then code. An HTML block or a `$$`
	// block at the top level is an atom that writes its bytes back, so it no longer locks; one inside a list or a quote
	// is still prose to the parser, and what is left of it below still trips the matching rule. Inline math is modeled
	// everywhere inline text is parsed, so only a display `$$` line can be left.
	const bare = withoutCode(withoutModeledBlocks(prose));
	return hasDisplayMath(bare) || LOSSY_CONSTRUCTS.some((re) => re.test(bare));
}

/** A comment the engine applies that the lift left in the prose where Compose's parser does not read it as a comment:
 *  nested in a list item, or right under a line of text (a list item would take it in). Compose would write it back as
 *  list text with an escaped `_`, and the slide would lose it, so the slide is edited in Markdown (the checker on #3136). */
function strandsADirective(prose: string): boolean {
	const lines = prose.split('\n');
	const kinds = lineKinds(lines);
	// What the engine applies: its readings, and the pane markers (which commentReadings does not report).
	const applied = new Set<number>();
	for (const [line, r] of commentReadings(prose)) if (r.kind !== 'note') applied.add(line);
	lines.forEach((l, i) => {
		if (l.trim().startsWith('<!--') && parsePaneMarker(l.trim())?.pane) applied.add(i + 1);
	});
	for (const line of applied) {
		const text = lines[line - 1] ?? '';
		// Indented: it sits in a list item.
		if (/^[ \t]/.test(text)) return true;
		// A bare directive (`<!-- class: dark -->`) under an item locks too, though the engine would read it the same once
		// the editor took it in: an editable slide is re-serialized whole, and the item's other lines then move with it
		// (an indented example re-indented; the seeded editor arm on #3136). Over-locking is the safe direction.
		// The first line above that is not a comment touching this one: a note between a list item and a setting is
		// taken into the item with it (the checker on #3136: `- a` / `<!-- note -->` / `<!-- _class: dark -->`).
		let j = line - 2;
		while (j >= 0 && kinds[j] === 'comment') j--;
		const above = lines[j] ?? '';
		// Under a list item or its indented continuation: the item takes it in. A heading, a paragraph or a blank line
		// above does not (two stacked settings must stay editable). A lazy line under an item's text counts too.
		if (j < 0) continue;
		if (LIST_ITEM.test(above) || kinds[j] === 'indented') return true;
		if (kinds[j] === 'para' && listAbove(kinds, j + 2)) return true;
	}
	return false;
}

type LineKind = 'blank' | 'comment' | 'list' | 'indented' | 'para' | 'other';

/** What each line is, as far as list membership goes. A comment block (one line or several) is `comment`; a heading,
 *  quote, fence, HTML line or thematic break is `other` (it ends a list item's lazy text); plain text is `para`. */
function lineKinds(lines: string[]): LineKind[] {
	const kinds: LineKind[] = [];
	let inComment = false;
	// Fenced code is code, not comments or list items: an unclosed `<!--` inside one swallowed the rest of the slide.
	// The shared CommonMark scan (`fenceRanges`) decides where a fence opens and closes, a closer indented differently
	// included; every line of one fence, blank lines too, takes one kind from its opener: inside a list item (indented)
	// it is that item's text, at the margin it ends any list (the checkers on #3136).
	const text = lines.join('\n');
	const fences = fenceRanges(text).map(([start, end]) => ({ start, end, kind: (/^[ \t]/.test(text.slice(start, start + 1)) ? 'indented' : 'other') as LineKind }));
	let at = 0;
	let f = 0;
	for (const l of lines) {
		while (f < fences.length && fences[f].end < at) f++;
		const fence = f < fences.length && at >= fences[f].start && at <= fences[f].end ? fences[f] : null;
		at += l.length + 1;
		if (fence) kinds.push(fence.kind);
		else if (inComment) {
			kinds.push('comment');
			if (l.includes('-->')) inComment = false;
		} else if (!l.trim()) kinds.push('blank');
		else if (/^[ \t]*<!--/.test(l)) {
			kinds.push('comment');
			inComment = !l.slice(l.indexOf('<!--') + 4).includes('-->');
		} else if (LIST_ITEM.test(l)) kinds.push('list');
		else if (/^[ \t]/.test(l)) kinds.push('indented');
		else if (/^(?:#{1,6}(?:[ \t]|$)|>|```|~~~|<|(?:[-*_][ \t]*){3,}$)/.test(l)) kinds.push('other');
		else kinds.push('para');
	}
	return kinds;
}

/** Whether the text above 1-based `line` ends inside a list: a list item, its indented continuation lines (blank lines
 *  between them included), or a paragraph that runs straight on from one (lazy text, `- a` / `more`). A paragraph with a
 *  blank line or the slide top above it, or a heading, quote, fence or HTML line, ends the list. Comments are skipped.
 *  Lifting a setting from between such a list and the next one merges the two (the checkers on #3136). */
function listAbove(kinds: LineKind[], line: number): boolean {
	for (let i = line - 2; i >= 0; i--) {
		const k = kinds[i];
		if (k === 'list') return true;
		if (k === 'blank' || k === 'comment' || k === 'indented') continue;
		if (k === 'other') return false;
		// A paragraph: walk to its first line, then ask what is right above it.
		while (i > 0 && kinds[i - 1] === 'para') i--;
		if (kinds[i - 1] === 'list') return true;
		if (kinds[i - 1] !== 'indented') return false;
		// Right under an item's indented text: keep walking up from there.
	}
	return false;
}

/** Whether the next line after 0-based `last` that is not blank or a comment is a list item. */
function listBelow(kinds: LineKind[], last: number): boolean {
	for (let i = last + 1; i < kinds.length; i++) if (kinds[i] !== 'blank' && kinds[i] !== 'comment') return kinds[i] === 'list';
	return false;
}

/** A field's key in the walk's `kept` set. `class` is scoped: a spot `_class` or a record's class beats a bare `class:`
 *  in either order, so a bare one kept in place does not pin a later local one (the checker on #3136). Every other
 *  field is last-comment-wins, whatever its scope. */
function scopedKey(key: string, kind: string, source: string): string {
	return key === 'class' && kind === 'directive' && /^\s*<!--\s*class\s*:/.test(source) ? 'class:global' : key;
}

/** A list item's first line: a bullet or a number, then a space or the end of the line. */
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

/** The `_class` component name of a slide's directives (first token), or 'content'. */
export function slideClassOf(directives: string[]): string {
	for (const d of directives) {
		const name = classNameOf(d);
		if (name) return name;
	}
	return 'content';
}

/** Parse a deck source into front-matter + per-slide { directives, prose, raw },
 *  using the SHARED engine splitters after a CRLF normalize. */
export function parseDeck(source: string): { fm: string; slides: ParsedSlide[] } {
	const src = normalizeSource(source);
	const fm = frontMatterBlock(src);
	const slides = splitSlides(stripFrontMatter(src)).map((raw) => ({ ...splitSlideDirectives(raw), raw }));
	return { fm, slides };
}

/** Rebuild deck source, replacing one slide's prose; every OTHER slide keeps its
 *  exact original bytes (`raw`) so an edit is a minimal diff. */
export function recompileDeck(slides: ParsedSlide[], fm: string, editedIndex: number, editedProse: string): string {
	const body = slides.map((c, i) => (i === editedIndex ? composeSlideChunk(c.directives, editedProse) : c.raw)).join(SEP);
	return fm ? fm + body : body;
}
