import { buildDeckIndex } from '@/lib/deck-outline';
import { renumberFrontMatterSay } from '../../../../lib/core/renumber-say.mjs';
import { frontMatterBlock } from './front-matter';

// Structural slide editing on the deck SOURCE — add / delete / duplicate / move / replace.
//
// TOUCH ONLY WHAT YOU CHANGE (engineering/decisions/2026-10-27-slide-structure-strip.md §8). The deck is
// read as SLOTS, one per authored slide, from the slide index the rail and the preview already use: each
// slot keeps its own leading and trailing blank lines, and each separator its own text (`---`, `***`, a
// trailing space). An op changes only the CONTENT of the slots it involves, so every other byte of the
// deck comes back as it was: the editor sees a small edit rather than a whole replace, a Live peer's
// typing elsewhere survives the rebase, and an author's `***` stays `***`. (Until 2026-10-27 the ops
// split the body, trimmed every slide and rejoined with one canonical separator: moving the last slide of
// a 30-slide deck rewrote 557 of its 595 characters.)
//
// Every op returns the new source, the slot the caller should make active, and `moved`: for each old
// slot, its index in the new deck, or -1 if the op removed it. The front-matter `say:` narration, keyed by slide
// number, is renumbered to match, so each entry stays with its slide (§8).

/** Default body for a freshly-added slide. */
export const NEW_SLIDE = '<!-- _class: content -->\n\n## New slide\n\nReplace this with your point.';

/** The canonical slide separator. Exported because the previews reassemble a viewed slide LIST back into a
 *  deck document too (they render the deck for context and display one slide, so the engine's page number
 *  is true), and that document must split back into the same slides the engine and the rail see. It is
 *  also the separator an op writes into a deck that has none of its own to copy. */
export const SLIDE_SEP = '\n\n---\n\n';

export type DeckOpResult = { source: string; active: number; moved?: number[] };

// `lead` is the slot's leading LINE BREAKS; `indent` the spaces or tabs before its first character, which belong to the
// content (an indented first line is a code block) and so never pass to other content. `touched` marks a slot whose
// content an op changed; `sealed` one an op put before a separator it did not sit before.
type Slot = { lead: string; indent: string; content: string; trail: string; touched?: boolean; sealed?: boolean };
// `src` is the source the deck was read from.
type Deck = { src: string; head: string; pre: string; slots: Slot[]; seps: string[] };

/** Read `source` as front matter, slots and the separators between them, byte for byte. */
function read(source: string): Deck {
	const ix = buildDeckIndex(source);
	const head = frontMatterBlock(source);
	const units = ix.units;
	const pre = source.slice(head.length, units[0]?.from ?? source.length);
	const slots = units.map((u) => {
		const raw = source.slice(u.from, u.end);
		const content = raw.trim();
		const ws = raw.slice(0, raw.length - raw.trimStart().length);
		const cut = ws.lastIndexOf('\n') + 1;
		return { lead: ws.slice(0, cut), indent: ws.slice(cut), content, trail: raw.slice(ws.length + content.length) };
	});
	const seps = units.slice(1).map((u, k) => source.slice(units[k].end, u.from));
	return { src: source, head, pre, slots, seps };
}
function write(d: Deck): string {
	const st = style(d);
	// A deck with no front matter must not START with a separator line: `---` at the top of a file opens front matter,
	// and the deck would vanish into it. A blank first slide with no whitespace of its own keeps one line ahead.
	const first = d.slots[0];
	if (!d.head && !d.pre && first && !first.content && !first.lead && d.seps.length) first.lead = '\n';
	// Front matter with no final newline would fuse its closing `---` to the first slide.
	const head = d.head && !d.head.endsWith('\n') && d.slots.some((s) => s.content) ? `${d.head}\n` : d.head;
	let out = head + d.pre;
	d.slots.forEach((s, k) => {
		// Content an op wrote into a slot must sit on its own lines and end in a BLANK line before the next separator:
		// `---` straight under a paragraph is a heading underline, which would merge two slides, and a blank slide's
		// slot has no line break at all. Written content goes flush left, as the old rejoin wrote it. Untouched slots
		// are written exactly as read.
		if ((s.touched || s.sealed) && k < d.seps.length && !BLANK.test(s.trail)) s.trail = st.trail;
		// A lead is added only where the content would otherwise share the separator's line: under a separator that
		// already ends its line, the author's spacing stays (an edit to one slide changes no other byte).
		if (s.touched && s.content && k > 0 && !s.lead.includes('\n') && !d.seps[k - 1]?.endsWith('\n')) s.lead = st.lead;
		out += s.lead + (s.touched ? '' : s.indent) + s.content + s.trail + (k < d.seps.length ? d.seps[k] : '');
	});
	return out;
}
// The whitespace a slot BETWEEN two separators carries, and the separator text, borrowed from the deck itself so an
// added slide looks like its neighbors; the canonical `SLIDE_SEP` split three ways when the deck has nothing to copy.
const MID = { lead: '\n', trail: '\n\n', sep: '---\n' };
// A trail that holds a blank line: the only whitespace that keeps a separator a separator after any content.
const BLANK = /\n[ \t]*\r?\n/;
function style(d: Deck): { lead: string; trail: string; sep: string } {
	// From slots with content, whose whitespace is real spacing (a blank slide's slot is not a model).
	const lead = d.slots.find((s, k) => k > 0 && s.content && s.lead.includes('\n'))?.lead ?? MID.lead;
	const trail = d.slots.find((s, k) => k < d.seps.length && s.content && BLANK.test(s.trail))?.trail ?? MID.trail;
	return { lead, trail, sep: d.seps[0] ?? MID.sep };
}
const identity = (n: number) => Array.from({ length: n }, (_, k) => k);
/** Write `d` and settle the result: the engine drops a BLANK first slide, so an op that leaves one first has a deck one
 *  slide shorter than its slots, and `moved` and `active` shift down with it. `copies` lists the new slots that repeat
 *  an old one (a duplicate), as [old, new], so its `say:` entry is copied too. */
function done(d: Deck, active: number, moved: number[], copies: [number, number][] = []): DeckOpResult {
	const source = write(d);
	const drop = d.slots.length - read(source).slots.length;
	const shift = (m: number) => (m < 0 ? m : m - drop < 0 ? -1 : m - drop);
	const out = drop <= 0 ? moved : moved.map(shift);
	return { source: carrySay(d.src, source, out, drop <= 0 ? copies : copies.map(([a, b]) => [a, shift(b)])), active: drop <= 0 ? active : Math.max(0, active - drop), moved: out };
}

/**
 * Carry the front-matter `say:` narration through a structural edit from `before` to `after`. Its keys are rendered
 * slide numbers: slide `n` is part `k` of some block, and after the edit it is part `k` of wherever `moved` sent that
 * block (and of each copy `copies` lists, as [old, new]). A deleted block's entries go, and so does a part past the end
 * of its block's new parts (an edit that rewrote the block shorter). A number with no slide behind it is left alone.
 * Exported for Compose, whose own add and delete rebuild the deck without these ops.
 */
export function carrySay(before: string, after: string, moved: readonly number[], copies: readonly [number, number][] = []): string {
	if (!/^say:[ \t]*$/m.test(frontMatterBlock(after))) return after;
	const was = buildDeckIndex(before).units.map((u) => u.parts.length);
	const now = buildDeckIndex(after).units.map((u) => u.parts.length);
	if (was.length !== moved.length) return after;
	const base = (parts: number[]) => {
		const out: number[] = [];
		for (let k = 0, at = 0; k < parts.length; at += parts[k++]) out.push(at);
		return out;
	};
	const wasAt = base(was);
	const nowAt = base(now);
	return renumberFrontMatterSay(after, (n: number) => {
		const flat = n - 1;
		const i = wasAt.findLastIndex((b) => b <= flat);
		if (i < 0 || flat >= wasAt[i] + was[i]) return [n];
		const k = flat - wasAt[i];
		const to = [moved[i], ...copies.filter(([a]) => a === i).map(([, b]) => b)];
		return to.filter((t) => t !== undefined && t >= 0 && t < now.length && k < now[t]).map((t) => nowAt[t] + k + 1);
	});
}
const clampIndex = (i: number, len: number) => Math.max(0, Math.min(i, len - 1));

/** Put a new slot with `content` at position `at` (0…n), wiring separators and the deck's edge whitespace. */
function insertAt(d: Deck, at: number, content: string): void {
	const st = style(d);
	const n = d.slots.length;
	if (!n) {
		d.slots.push({ lead: '', indent: '', content, trail: '', touched: true });
		return;
	}
	const fresh: Slot = { lead: st.lead, indent: '', content, trail: st.trail, touched: true };
	if (at >= n) {
		// A new LAST slot takes the deck's ending whitespace; the old last becomes a middle slot.
		const last = d.slots[n - 1];
		fresh.trail = last.trail;
		last.trail = st.trail;
		last.sealed = true;
		d.slots.push(fresh);
		d.seps.push(st.sep);
	} else if (at <= 0) {
		// A new FIRST slot takes the deck's opening whitespace; the old first becomes a middle slot.
		const first = d.slots[0];
		fresh.lead = first.lead;
		first.lead = st.lead;
		d.slots.unshift(fresh);
		d.seps.unshift(st.sep);
	} else {
		d.slots.splice(at, 0, fresh);
		d.seps.splice(at, 0, st.sep);
	}
}

/** Insert a new slide after `index` (-1 / before-0 prepends). Active = the new one.
 *  A non-finite `index` (an empty-deck entry point that never set a cursor) coerces
 *  to -1 → insert at 0, so the returned `active` is always a real number and never
 *  NaN — a NaN active would silently poison the rail highlight + every later insert. */
export function addSlideAfter(source: string, index: number, body: string = NEW_SLIDE): DeckOpResult {
	const d = read(source);
	const n = d.slots.length;
	const from = Number.isFinite(index) ? index : -1;
	const at = Math.max(0, Math.min(from + 1, n));
	insertAt(d, at, body.trim());
	return done(d, at, identity(n).map((k) => (k < at ? k : k + 1)));
}

/** Duplicate slide `index`; the copy lands right after it and becomes active. */
export function duplicateSlide(source: string, index: number): DeckOpResult {
	const d = read(source);
	const n = d.slots.length;
	if (!n) return { source, active: 0, moved: [] };
	const i = clampIndex(index, n);
	insertAt(d, i + 1, d.slots[i].content);
	return done(d, i + 1, identity(n).map((k) => (k <= i ? k : k + 1)), [[i, i + 1]]);
}

/** Delete slide `index`. The last slide is never deleted (a deck needs ≥1). */
export function deleteSlide(source: string, index: number): DeckOpResult {
	const d = read(source);
	const n = d.slots.length;
	if (n <= 1) return { source, active: 0, moved: identity(n) };
	const i = clampIndex(index, n);
	if (i === n - 1) {
		// The new last slot takes the deck's ending whitespace.
		d.slots[i - 1].trail = d.slots[i].trail;
		d.seps.pop();
	} else if (i === 0) {
		// The new first slot takes the deck's opening whitespace.
		d.slots[1].lead = d.slots[0].lead;
		d.seps.shift();
	} else {
		d.seps.splice(i, 1);
	}
	d.slots.splice(i, 1);
	return done(d, clampIndex(i, n - 1), identity(n).map((k) => (k < i ? k : k === i ? -1 : k - 1)));
}

/** Replace slide `index`'s body in place (e.g. after editing its speaker note). */
export function replaceSlide(source: string, index: number, body: string): DeckOpResult {
	const d = read(source);
	const n = d.slots.length;
	if (!n) return { source, active: 0, moved: [] };
	const i = clampIndex(index, n);
	d.slots[i].content = body.trim();
	d.slots[i].touched = true;
	return done(d, i, identity(n));
}

/** Move slide `from` to position `to` (clamped). Active follows the moved slide. Only the contents of the
 *  slots between `from` and `to` change places; every slot keeps its own whitespace and separator. */
export function moveSlide(source: string, from: number, to: number): DeckOpResult {
	const d = read(source);
	const n = d.slots.length;
	if (n <= 1) return { source, active: 0, moved: identity(n) };
	const f = clampIndex(from, n);
	const t = clampIndex(to, n);
	if (f === t) return { source, active: f, moved: identity(n) };
	const contents = d.slots.map((s) => s.content);
	const [moved] = contents.splice(f, 1);
	contents.splice(t, 0, moved);
	d.slots.forEach((s, k) => {
		if (s.content !== contents[k]) s.touched = true;
		s.content = contents[k];
	});
	const order = identity(n);
	order.splice(f, 1);
	order.splice(t, 0, f);
	const where: number[] = [];
	order.forEach((old, k) => {
		where[old] = k;
	});
	return done(d, t, where);
}

// ── Ops on a RENDERED slide (2026-10-27-slide-structure-strip.md §6) ──────────────────────────────────────────────────
//
// The ops above act on BLOCKS. Under `split: headings` one block renders as several slides, and the strip shows those
// slides, so an op on a slide inside a block first CUTS the block at that slide's heading: a `---` goes in just above
// the heading. That renders the same, because a heading that splits is a slide boundary either way (the rewrite
// `lib/core/bake-splits.js` makes for export, which its parity test pins), and the slide is then a block of its own.
// Only the boundaries an op needs are cut, so the rest of the block keeps its form.

/** A rendered slide: part `part` of block `unit` (0 when the block is not split). */
export type SlideAt = { unit: number; part: number };

/** Cut `source` so a new block begins at each slide in `starts` (a slide that already begins its block needs no cut).
 *  Returns the new source and, for a slide named by its place in the OLD source, its block index in the new one. */
function cut(source: string, starts: readonly SlideAt[]): { source: string; unit: (s: SlideAt) => number } {
	const ix = buildDeckIndex(source);
	const at = (s: SlideAt) => {
		const u = ix.units[s.unit];
		return s.part > 0 && u && s.part < u.parts.length ? u.from + u.parts[s.part] : -1;
	};
	const cuts = [...new Set(starts.map(at).filter((c) => c >= 0))].sort((a, b) => a - b);
	let out = source;
	for (let k = cuts.length - 1; k >= 0; k--) {
		// The heading's line starts at the cut. A blank line must sit above the `---`, or under a paragraph it would
		// read as that paragraph's heading underline and merge the two slides.
		const above = out.slice(0, cuts[k]);
		out = `${above}${/\n[ \t]*\n$/.test(above) ? '' : '\n'}---\n\n${out.slice(cuts[k])}`;
	}
	return {
		source: out,
		// Every cut at or before a slide's own start puts one more block ahead of it (or starts its own).
		unit: (s) => {
			const here = at(s) >= 0 ? at(s) : (ix.units[s.unit]?.from ?? 0);
			return s.unit + cuts.filter((c) => c <= here).length;
		},
	};
}

/** The rendered slide after `s` (`dir` 1) or before it (`dir` -1), across blocks; null at either end of the deck. */
export function slideNext(source: string, s: SlideAt, dir: -1 | 1): SlideAt | null {
	const units = buildDeckIndex(source).units;
	const u = units[s.unit];
	if (!u) return null;
	if (dir > 0) return s.part + 1 < u.parts.length ? { unit: s.unit, part: s.part + 1 } : s.unit + 1 < units.length ? { unit: s.unit + 1, part: 0 } : null;
	return s.part > 0 ? { unit: s.unit, part: s.part - 1 } : s.unit > 0 ? { unit: s.unit - 1, part: units[s.unit - 1].parts.length - 1 } : null;
}

/** How many slides the deck renders: every block's parts. */
export function renderedCount(source: string): number {
	return buildDeckIndex(source).units.reduce((n, u) => n + u.parts.length, 0);
}

const after = (s: SlideAt): SlideAt => ({ unit: s.unit, part: s.part + 1 });

/** Duplicate rendered slide `s`; the copy lands right after it and becomes active. */
export function duplicateAt(source: string, s: SlideAt): DeckOpResult {
	const c = cut(source, [s, after(s)]);
	return duplicateSlide(c.source, c.unit(s));
}

/** Delete rendered slide `s`. The deck's last slide is never deleted. */
export function deleteAt(source: string, s: SlideAt): DeckOpResult {
	if (renderedCount(source) <= 1) return { source, active: 0, moved: identity(slideCount(source)) };
	const c = cut(source, [s, after(s)]);
	return deleteSlide(c.source, c.unit(s));
}

/** Insert a new slide right after rendered slide `s`. Active = the new one. */
export function addAfterAt(source: string, s: SlideAt, body: string = NEW_SLIDE): DeckOpResult {
	const c = cut(source, [after(s)]);
	return addSlideAfter(c.source, c.unit(s), body);
}

/** Insert a new slide right before rendered slide `s`. Active = the new one. */
export function addBeforeAt(source: string, s: SlideAt, body: string = NEW_SLIDE): DeckOpResult {
	const c = cut(source, [s]);
	return addSlideAfter(c.source, c.unit(s) - 1, body);
}

/** Move rendered slide `s` one place, past the slide next to it. Active follows it. */
export function moveAt(source: string, s: SlideAt, dir: -1 | 1): DeckOpResult {
	const n = slideNext(source, s, dir);
	if (!n) return { source, active: s.unit, moved: identity(slideCount(source)) };
	const c = cut(source, [s, after(s), n, after(n)]);
	return moveSlide(c.source, c.unit(s), c.unit(n));
}

/**
 * What a delete of one block takes, in words a confirm can show (2026-10-27-slide-structure-strip.md §12
 * item 2): its title, and how many rendered slides go with it. A block whose headings split it renders as
 * several slides, and deleting it takes all of them; the confirm says so instead of "slide 4".
 */
export function deleteTargetName(title: string, slides: number): string {
	const t = title.trim();
	const named = t ? `“${t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t}”` : '';
	if (slides > 1) return named ? `${named} (${slides} slides)` : `these ${slides} slides`;
	return named || 'this slide';
}

/** How many authored slides (blocks) the deck holds, as the ops count them. */
export function slideCount(source: string): number {
	return read(source).slots.length;
}
