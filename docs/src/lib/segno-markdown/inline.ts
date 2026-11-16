/**
 * S2, the inline pass, for CommonMark as Lattice configures markdown-it (`commonmark` preset, `html: true`,
 * `strikethrough` enabled, plugin inline rules installed where their anchors say). It reads one leaf's text
 * (a paragraph's, a heading's, a table cell's) and writes a flat tape of inline records instead of markdown-it's
 * `Token` objects. The rules are markdown-it 14.3.3's, line for line, so the structure matches it by construction,
 * and the corpus differential (test/unit/core/deck-model-inline.test.js) holds the claim to every deck.
 *
 * Ported from markdown-it (https://github.com/markdown-it/markdown-it), MIT licence, Copyright (c) 2014
 * Vitaly Puzrin, Alex Kocharin. Each rule keeps markdown-it's name and order so a reader can diff the two.
 *
 * WHAT THE TAPE HOLDS. One record per markdown-it token, before `fragments_join`: a run of text that markdown-it
 * joins from pieces (an unmatched `*` next to the words after it) stays as its pieces, each with its own source
 * range, because an editor wants the ranges and the join is a concatenation any reader can do (the token adapter
 * does it). Every other token is markdown-it's, in its order, with its final `level`. No `content` string is
 * computed: a record holds the range it was read from, and the strings markdown-it would derive from that range
 * (a code span's trimmed text, an escape's character, an entity's decoding, a link's normalized href) are a
 * reader's to derive, from the range.
 *
 * BOUNDS (the stage contract, G5 in engineering/decisions/2026-10-22-segno-deck-pipeline.md). The rules are
 * markdown-it's, so their bounds are markdown-it's: the text rule visits each character once; `skipToken`'s cache
 * makes a link label scan read each position once per leaf; backtick runs are found once per leaf
 * (`backticksScanned`); an unterminated HTML comment, CDATA or processing instruction stops later searches
 * (`skipHtmlSpecial`). THE DELIMITER RESOLVER (`balancePairs`, CommonMark's "process emphasis") is linear in the
 * delimiters of one list: `openersBottom` remembers, per marker, closer kind and length mod 3, the lowest opener a
 * failed search reached, so no opener is passed twice by closers of one class, and `jumps` skip the matched pairs
 * between a closer and the opener below them. inline.test.ts counts the characters read (test/helpers/work-count.js) on hostile ladders
 * and holds every rule to about 10x for 10x input.
 */

import { isPunct, isWhiteSpace } from './punct.js';

/** Inline token kinds, in tape order. A plugin inline type is appended to the parser's own copy. */
export const INLINE_KINDS = [
	'text',
	'text_special',
	'softbreak',
	'hardbreak',
	'code_inline',
	'html_inline',
	'em_open',
	'em_close',
	'strong_open',
	'strong_close',
	's_open',
	's_close',
	'link_open',
	'link_close',
	'image',
] as const;

const I_TEXT = 0;
const I_TEXT_SPECIAL = 1;
const I_SOFTBREAK = 2;
const I_HARDBREAK = 3;
const I_CODE_INLINE = 4;
const I_HTML_INLINE = 5;
const I_EM_OPEN = 6;
const I_EM_CLOSE = 7;
const I_STRONG_OPEN = 8;
const I_STRONG_CLOSE = 9;
const I_S_OPEN = 10;
const I_S_CLOSE = 11;
const I_LINK_OPEN = 12;
const I_LINK_CLOSE = 13;
const I_IMAGE = 14;

export const IKIND = Object.freeze({
	text: I_TEXT,
	text_special: I_TEXT_SPECIAL,
	softbreak: I_SOFTBREAK,
	hardbreak: I_HARDBREAK,
	code_inline: I_CODE_INLINE,
	html_inline: I_HTML_INLINE,
	em_open: I_EM_OPEN,
	em_close: I_EM_CLOSE,
	strong_open: I_STRONG_OPEN,
	strong_close: I_STRONG_CLOSE,
	s_open: I_S_OPEN,
	s_close: I_S_CLOSE,
	link_open: I_LINK_OPEN,
	link_close: I_LINK_CLOSE,
	image: I_IMAGE,
});

/**
 * The inline tape: ISTRIDE integers per token, in markdown-it's token order (before `fragments_join`).
 *   I_KIND   index into the parser's `kinds`
 *   I_NEST   1 open, 0 self-contained, -1 close
 *   I_LEVEL  markdown-it's final `token.level` (as `fragments_join` recomputes it)
 *   I_FROM   where the token was read from, an offset into the leaf text (`InlineTape.src`)
 *   I_TO     one past its end. Text: its characters. A code span: the span with its backticks. Emphasis and
 *            strikethrough: their marker run. A link: `link_open` the `[`, `link_close` from the `]` to the end of
 *            the destination or reference. An image: the whole image. An escape or entity: as written
 *   I_AUX    per kind: a code span's backtick count; an emphasis or strikethrough token's marker character;
 *            a link's or image's record in `links`; a text_special's source (`SPECIAL_ESCAPE`, `SPECIAL_ENTITY`)
 *   I_FLAGS  `F_EMPTY`: a text token markdown-it emptied (the outer pair of a `**` run that became `strong`);
 *            `F_LINK_TEXT`: an autolink's text, which a reader shows as markdown-it's `normalizeLinkText(url)`;
 *            `F_SIDE`: a plugin token with a side record
 */
export const ISTRIDE = 7;
export const I_KIND = 0;
export const I_NEST = 1;
export const I_LEVEL = 2;
export const I_FROM = 3;
export const I_TO = 4;
export const I_AUX = 5;
export const I_FLAGS = 6;
export const F_EMPTY = 1;
export const F_LINK_TEXT = 2;
export const F_ISIDE = 4;
export const SPECIAL_ESCAPE = 0;
export const SPECIAL_ENTITY = 1;

/**
 * A link record: LSTRIDE integers per link or image, `I_AUX` of its `link_open` / `link_close` / `image` token.
 *   L_TYPE   `LINK_INLINE` (`[a](dest "title")`), `LINK_REF` (`[a][b]`, `[a][]`, `[a]`), `LINK_AUTO`
 *            (`<scheme:…>`), `LINK_EMAIL` (`<a@b.c>`)
 *   L_DEST0  the destination as written (inside `<>` when bracketed), or the autolink's URL; -1 when markdown-it's
 *   L_DEST1  href is '' (`[a]()`, or a destination `validateLink` refused that the link survived anyway)
 *   L_TITLE0 the title's text inside its quotes; -1 for none
 *   L_TITLE1
 *   L_REF    the reference's index in the parser's reference table (`LINK_REF`), else -1
 *   L_CHILD  an image's alt-text tape, its index in `InlineTape.children`, else -1
 */
export const LSTRIDE = 7;
export const L_TYPE = 0;
export const L_DEST0 = 1;
export const L_DEST1 = 2;
export const L_TITLE0 = 3;
export const L_TITLE1 = 4;
export const L_REF = 5;
export const L_CHILD = 6;
export const LINK_INLINE = 0;
export const LINK_REF = 1;
export const LINK_AUTO = 2;
export const LINK_EMAIL = 3;

/** What a plugin inline rule sees (the fields `lib/plugins/state-facade.mjs` exposes, and no more). */
export interface InlineState {
	readonly src: string;
	pos: number;
	readonly posMax: number;
	push(type: string, tag: string, nesting: number): InlineTokenHandle;
}

/** A plugin token's writable fields. */
export interface InlineTokenHandle {
	content: string;
	markup: string;
	info: string;
	meta: unknown;
}

/** A plugin token's side record: what its rule wrote, and the tag it pushed with. */
export interface InlineSide {
	tag: string;
	content?: string;
	markup?: string;
	info?: string;
	meta?: unknown;
}

export type InlineRuleFn = (state: InlineState, silent: boolean) => boolean;

/** An inline rule a host adds (Lattice's plugins: `math_inline`). */
export interface ExtraInlineRule {
	name: string;
	rule: InlineRuleFn;
	/** The core rule it runs after (markdown-it's `ruler.after`). */
	after?: string;
	/** The core rule it runs before (markdown-it's `ruler.before`). One of the two is required. */
	before?: string;
	/**
	 * The characters the rule can start on (a plugin manifest's `triggers`). Each must also stop markdown-it's
	 * text rule (be one of its terminator characters), or markdown-it would never try the rule there either.
	 * Omitted: tried at every position the text rule stops on.
	 */
	triggers?: string;
}

export interface InlineParserOptions {
	/** markdown-it's `html` option: inline HTML is recognized. Lattice: true. */
	html?: boolean;
	/** The GFM `~~` rule, which Lattice enables. */
	strikethrough?: boolean;
	/** Extra inline rules, in installation order. */
	rules?: readonly ExtraInlineRule[];
	/**
	 * Whether `&name;` is a named character reference (markdown-it: `decodeHTMLStrict(match) !== match`). The HTML
	 * entity table is a host's to supply (Lattice's bridge reads markdown-it's own); this package has none, and
	 * a named reference is a token only when this says so.
	 */
	namedEntity: (match: string) => boolean;
	/**
	 * Decide a link destination whose text holds an entity (`&…;`), as the block pass's option of the same name
	 * does: return markdown-it's `validateLink(normalizeLink(unescapeAll(dest)))`. Without it, such a destination
	 * is decoded for numeric references only and judged by the same protocol rule.
	 */
	linkOk?: (rawDestination: string) => boolean;
}

/** One leaf's inline parse. */
export interface InlineTape {
	/** The text parsed: the leaf's content, or an image's label. Offsets index it. */
	readonly src: string;
	/** Where `src` starts in its parent: 0 for a leaf, the label's offset for an image's alt text. */
	readonly base: number;
	readonly kinds: readonly string[];
	readonly tape: Int32Array;
	readonly length: number;
	/** LSTRIDE integers per link or image record. */
	readonly links: Int32Array;
	/** An image's alt-text parse, by `L_CHILD`. */
	readonly children: readonly InlineTape[];
	/** Plugin tokens' side records, by token index. */
	readonly side: ReadonlyMap<number, InlineSide>;
}

const MAX_NESTING = 20; // markdown-it's commonmark preset

const isSpace = (c: number) => c === 0x09 || c === 0x20;

// markdown-it's text rule stops on these, and only on these.
const TERMINATOR = new Uint8Array(128);
for (const c of '\n!#$%&*+-:<=>@[\\]^_`{}~') TERMINATOR[c.charCodeAt(0)] = 1;

const ESCAPABLE = new Uint8Array(256);
for (const c of '\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-') ESCAPABLE[c.charCodeAt(0)] = 1;
/** Whether markdown-it's escape rule unescapes this character (its `ESCAPED` table). */
export function isEscapable(c: number): boolean {
	return c < 256 && ESCAPABLE[c] === 1;
}

// ── Link helpers (markdown-it lib/helpers, lib/common/utils.mjs) ─────────────────────────────────────

const BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
const UNESCAPE_MD = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const NUMERIC_ENTITY = /&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g;

/** markdown-it's `validateLink(normalizeLink(unescapeAll(raw)))` for a destination with no named entity in it. */
export function defaultLinkOk(raw: string): boolean {
	let s = raw.indexOf('\\') >= 0 ? raw.replace(UNESCAPE_MD, '$1') : raw;
	if (s.indexOf('&') >= 0)
		s = s.replace(NUMERIC_ENTITY, (m, hex, dec) => {
			const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
			return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
		});
	const str = s.trim().toLowerCase();
	return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
}

/**
 * markdown-it's `normalizeReference`: the key a reference label is stored and looked up under. JavaScript's own
 * case mapping, as markdown-it uses it, so the two agree in every engine.
 */
export function normalizeReference(str: string): string {
	str = str.trim().replace(/\s+/g, ' ');
	// markdown-it's guard for an engine whose case mapping lowers U+1E9E wrongly (to U+1E7E).
	if ('ẞ'.toLowerCase() === String.fromCharCode(0x1e7e)) str = str.replace(/ẞ/g, 'ß');
	return str.toLowerCase().toUpperCase();
}

interface DestResult {
	ok: boolean;
	pos: number;
	/** The destination's text as written, inside `<>` when bracketed. */
	from: number;
	to: number;
}

function parseLinkDestination(str: string, start: number, max: number): DestResult {
	let pos = start;
	const result: DestResult = { ok: false, pos: 0, from: 0, to: 0 };
	if (str.charCodeAt(pos) === 0x3c) {
		pos++;
		while (pos < max) {
			const code = str.charCodeAt(pos);
			if (code === 0x0a || code === 0x3c) return result;
			if (code === 0x3e) {
				result.pos = pos + 1;
				result.from = start + 1;
				result.to = pos;
				result.ok = true;
				return result;
			}
			if (code === 0x5c && pos + 1 < max) {
				pos += 2;
				continue;
			}
			pos++;
		}
		return result;
	}
	let level = 0;
	while (pos < max) {
		const code = str.charCodeAt(pos);
		if (code === 0x20) break;
		if (code < 0x20 || code === 0x7f) break;
		if (code === 0x5c && pos + 1 < max) {
			if (str.charCodeAt(pos + 1) === 0x20) {
				pos++;
				continue;
			}
			pos += 2;
			continue;
		}
		if (code === 0x28) {
			level++;
			if (level > 32) return result;
		}
		if (code === 0x29) {
			if (level === 0) break;
			level--;
		}
		pos++;
	}
	if (start === pos) return result;
	if (level !== 0) return result;
	result.from = start;
	result.to = pos;
	result.pos = pos;
	result.ok = true;
	return result;
}

interface TitleResult {
	ok: boolean;
	pos: number;
	from: number;
	to: number;
}

// markdown-it's parseLinkTitle without `prev_state`: an inline title never continues onto another source.
function parseLinkTitle(str: string, start: number, max: number): TitleResult {
	let pos = start;
	const result: TitleResult = { ok: false, pos: 0, from: 0, to: 0 };
	if (pos >= max) return result;
	let marker = str.charCodeAt(pos);
	if (marker !== 0x22 && marker !== 0x27 && marker !== 0x28) return result;
	start++;
	pos++;
	if (marker === 0x28) marker = 0x29;
	while (pos < max) {
		const code = str.charCodeAt(pos);
		if (code === marker) {
			result.pos = pos + 1;
			result.from = start;
			result.to = pos;
			result.ok = true;
			return result;
		} else if (code === 0x28 && marker === 0x29) {
			return result;
		} else if (code === 0x5c && pos + 1 < max) {
			pos++;
		}
		pos++;
	}
	return result;
}

// ── State ───────────────────────────────────────────────────────────────────────────────────────────

interface Delim {
	marker: number;
	length: number;
	token: number;
	end: number;
	open: boolean;
	close: boolean;
}

class Handle implements InlineTokenHandle {
	private readonly rec: InlineSide;
	constructor(rec: InlineSide) {
		this.rec = rec;
	}
	get content() {
		return this.rec.content ?? '';
	}
	set content(v) {
		this.rec.content = v;
	}
	get markup() {
		return this.rec.markup ?? '';
	}
	set markup(v) {
		this.rec.markup = v;
	}
	get info() {
		return this.rec.info ?? '';
	}
	set info(v) {
		this.rec.info = v;
	}
	get meta() {
		return this.rec.meta ?? null;
	}
	set meta(v) {
		this.rec.meta = v;
	}
}

// Shared empty outputs: most leaves have no links, no images and no plugin tokens.
const NO_LINKS = new Int32Array(0);
const NO_CHILDREN: readonly InlineTape[] = Object.freeze([]);
const NO_SIDE: ReadonlyMap<number, InlineSide> = new Map();

class State implements InlineState {
	src = '';
	readonly p: InlineParser;
	refs: ReadonlyMap<string, number> | null = null;
	pos = 0;
	posMax = 0;
	level = 0;
	/** markdown-it's `pending`, as a range: always one contiguous run of the source. */
	pStart = 0;
	pEnd = 0;
	pendingLevel = 0;
	cache: Map<number, number> | null = null;
	readonly top: Delim[] = [];
	delimiters: Delim[] = this.top;
	prevDelimiters: Delim[][] = [];
	/** markdown-it's `tokens_meta` delimiter lists, in the order their open tokens were pushed. */
	metaDelims: Delim[][] = [];
	backticks: number[] | null = null;
	backticksScanned = false;
	skipHtmlSpecial = false;
	/** The token buffer (markdown-it's `tokens`), ISTRIDE integers per token, `I_LEVEL` filled in at the end. */
	t = new Int32Array(64 * ISTRIDE);
	n = 0;
	links: number[] = [];
	children: InlineTape[] = [];
	side: Map<number, InlineSide> | null = null;

	constructor(p: InlineParser) {
		this.p = p;
	}

	/** Ready for a parse of `src`. A state is reused (the parser keeps one per nesting depth), so nothing survives. */
	reset(src: string, refs: ReadonlyMap<string, number> | null): void {
		this.src = src;
		this.refs = refs;
		this.pos = 0;
		this.posMax = src.length;
		this.level = 0;
		this.pStart = this.pEnd = 0;
		this.pendingLevel = 0;
		this.cache = null;
		// The top-level delimiter list and the scratch lists are reused; an open token's list is new (`pushT`).
		if (this.top.length) this.top.length = 0;
		this.delimiters = this.top;
		if (this.prevDelimiters.length) this.prevDelimiters.length = 0;
		if (this.metaDelims.length) this.metaDelims.length = 0;
		this.backticks = null;
		this.backticksScanned = false;
		this.skipHtmlSpecial = false;
		this.n = 0;
		if (this.links.length) this.links.length = 0;
		this.children = NO_CHILDREN as InlineTape[];
		this.side = null;
		this.view = null;
	}

	/**
	 * What a plugin rule is handed: a view of this parse, new per parse. A host keys per-parse state on the object a
	 * rule receives (Lattice's facade keeps a plugin's `memo` in a WeakMap by it), and this state object is reused
	 * across parses, so handing it over would carry one leaf's memo into the next.
	 */
	view: InlineState | null = null;
	pluginView(): InlineState {
		if (this.view) return this.view;
		const st = this;
		this.view = {
			get src() {
				return st.src;
			},
			get pos() {
				return st.pos;
			},
			set pos(v: number) {
				st.pos = v;
			},
			get posMax() {
				return st.posMax;
			},
			push: (type: string, tag: string, nesting: number) => st.push(type, tag, nesting),
		};
		return this.view;
	}

	/** markdown-it's `pending += src.slice(from, to)`. */
	addPending(from: number, to: number): void {
		if (this.pStart === this.pEnd) this.pStart = from;
		else if (this.pEnd !== from) throw new Error('segno-markdown inline: pending text is not contiguous');
		this.pEnd = to;
	}

	pushPending(): void {
		this.raw(I_TEXT, 0, this.pStart, this.pEnd, 0);
		this.pStart = this.pEnd;
	}

	private raw(kind: number, nesting: number, from: number, to: number, aux: number): number {
		if ((this.n + 1) * ISTRIDE > this.t.length) {
			const grown = new Int32Array(this.t.length * 2);
			grown.set(this.t);
			this.t = grown;
		}
		const at = this.n * ISTRIDE;
		const t = this.t;
		t[at + I_KIND] = kind;
		t[at + I_NEST] = nesting;
		t[at + I_FROM] = from;
		t[at + I_TO] = to;
		t[at + I_AUX] = aux;
		t[at + I_FLAGS] = 0;
		return this.n++;
	}

	/** markdown-it's `push`: flush pending text, keep the level and the delimiter lists. */
	pushT(kind: number, nesting: number, from: number, to: number, aux: number): number {
		if (this.pEnd > this.pStart) this.pushPending();
		if (nesting < 0) {
			this.level--;
			this.delimiters = this.prevDelimiters.pop() as Delim[];
		}
		const i = this.raw(kind, nesting, from, to, aux);
		if (nesting > 0) {
			this.level++;
			this.prevDelimiters.push(this.delimiters);
			this.delimiters = [];
			this.metaDelims.push(this.delimiters);
		}
		this.pendingLevel = this.level;
		return i;
	}

	/** A plugin rule's push: its type must be one the parser knows (a plugin kind). */
	push(type: string, tag: string, nesting: number): InlineTokenHandle {
		const k = this.p.kindOf(type);
		const at = this.pos;
		const i = this.pushT(k, nesting, at, at, 0);
		const rec: InlineSide = { tag };
		(this.side ??= new Map()).set(i, rec);
		this.t[i * ISTRIDE + I_FLAGS] |= F_ISIDE;
		this.pluginTok = i;
		return new Handle(rec);
	}

	/** The last token a plugin pushed, whose `I_TO` the driver sets once the rule has moved `pos`. */
	pluginTok = -1;

	link(type: number, d0: number, d1: number, t0: number, t1: number, ref: number, child: number): number {
		const at = this.links.length / LSTRIDE;
		this.links.push(type, d0, d1, t0, t1, ref, child);
		return at;
	}

	swap(i: number, j: number): void {
		const t = this.t;
		for (let f = 0; f < ISTRIDE; f++) {
			const x = t[i * ISTRIDE + f];
			t[i * ISTRIDE + f] = t[j * ISTRIDE + f];
			t[j * ISTRIDE + f] = x;
		}
		const side = this.side;
		if (!side) return;
		const si = side.get(i);
		const sj = side.get(j);
		side.delete(i);
		side.delete(j);
		if (si) side.set(j, si);
		if (sj) side.set(i, sj);
	}

	/** markdown-it's `scanDelims`. */
	scanDelims(start: number, canSplitWord: boolean): { canOpen: boolean; canClose: boolean; length: number } {
		const max = this.posMax;
		const src = this.src;
		const marker = src.charCodeAt(start);
		let lastChar: number;
		if (start === 0) {
			lastChar = 0x20;
		} else if (start === 1) {
			lastChar = src.charCodeAt(0);
			if ((lastChar & 0xf800) === 0xd800) lastChar = 0xfffd;
		} else {
			lastChar = src.charCodeAt(start - 1);
			if ((lastChar & 0xfc00) === 0xdc00) {
				const highSurr = src.charCodeAt(start - 2);
				lastChar = (highSurr & 0xfc00) === 0xd800 ? 0x10000 + ((highSurr - 0xd800) << 10) + (lastChar - 0xdc00) : 0xfffd;
			} else if ((lastChar & 0xfc00) === 0xd800) {
				lastChar = 0xfffd;
			}
		}
		let pos = start;
		while (pos < max && src.charCodeAt(pos) === marker) pos++;
		const count = pos - start;
		let nextChar = pos < max ? src.charCodeAt(pos) : 0x20;
		if ((nextChar & 0xfc00) === 0xd800) {
			const lowSurr = src.charCodeAt(pos + 1);
			nextChar = (lowSurr & 0xfc00) === 0xdc00 ? 0x10000 + ((nextChar - 0xd800) << 10) + (lowSurr - 0xdc00) : 0xfffd;
		} else if ((nextChar & 0xfc00) === 0xdc00) {
			nextChar = 0xfffd;
		}
		const isLastPunctChar = isPunct(lastChar);
		const isNextPunctChar = isPunct(nextChar);
		const isLastWhiteSpace = isWhiteSpace(lastChar);
		const isNextWhiteSpace = isWhiteSpace(nextChar);
		const leftFlanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
		const rightFlanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
		const canOpen = leftFlanking && (canSplitWord || !rightFlanking || isLastPunctChar);
		const canClose = rightFlanking && (canSplitWord || !leftFlanking || isNextPunctChar);
		return { canOpen, canClose, length: count };
	}
}

// ── Rules (markdown-it lib/rules_inline/*.mjs; comments there) ───────────────────────────────────────

type Rule = (state: State, silent: boolean) => boolean;

function text(state: State, silent: boolean): boolean {
	let pos = state.pos;
	const src = state.src;
	const max = state.posMax;
	while (pos < max) {
		const c = src.charCodeAt(pos);
		if (c < 128 && TERMINATOR[c] === 1) break;
		pos++;
	}
	if (pos === state.pos) return false;
	if (!silent) state.addPending(state.pos, pos);
	state.pos = pos;
	return true;
}

function newline(state: State, silent: boolean): boolean {
	let pos = state.pos;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x0a) return false;
	const max = state.posMax;
	if (!silent) {
		const pmax = state.pEnd - 1;
		if (state.pEnd > state.pStart && src.charCodeAt(pmax) === 0x20) {
			if (pmax - 1 >= state.pStart && src.charCodeAt(pmax - 1) === 0x20) {
				let ws = pmax - 1;
				while (ws - 1 >= state.pStart && src.charCodeAt(ws - 1) === 0x20) ws--;
				state.pEnd = ws;
				state.pushT(I_HARDBREAK, 0, ws, pos + 1, 0);
			} else {
				state.pEnd = pmax;
				state.pushT(I_SOFTBREAK, 0, pmax, pos + 1, 0);
			}
		} else {
			state.pushT(I_SOFTBREAK, 0, pos, pos + 1, 0);
		}
	}
	pos++;
	while (pos < max && isSpace(src.charCodeAt(pos))) pos++;
	state.pos = pos;
	return true;
}

function escapeRule(state: State, silent: boolean): boolean {
	let pos = state.pos;
	const max = state.posMax;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x5c) return false;
	pos++;
	if (pos >= max) return false;
	let ch1 = src.charCodeAt(pos);
	if (ch1 === 0x0a) {
		if (!silent) state.pushT(I_HARDBREAK, 0, state.pos, pos + 1, 0);
		pos++;
		while (pos < max) {
			ch1 = src.charCodeAt(pos);
			if (!isSpace(ch1)) break;
			pos++;
		}
		state.pos = pos;
		return true;
	}
	if (ch1 === 0x20) {
		// markdown-it 14.3: `\` before a space is a literal backslash, and the space is read on its own.
		if (!silent) state.pushT(I_TEXT_SPECIAL, 0, state.pos, pos, SPECIAL_ESCAPE);
		state.pos = pos;
		return true;
	}
	if (ch1 >= 0xd800 && ch1 <= 0xdbff && pos + 1 < max) {
		const ch2 = src.charCodeAt(pos + 1);
		if (ch2 >= 0xdc00 && ch2 <= 0xdfff) pos++;
	}
	if (!silent) state.pushT(I_TEXT_SPECIAL, 0, state.pos, pos + 1, SPECIAL_ESCAPE);
	state.pos = pos + 1;
	return true;
}

function backticks(state: State, silent: boolean): boolean {
	let pos = state.pos;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x60) return false;
	const start = pos;
	pos++;
	const max = state.posMax;
	while (pos < max && src.charCodeAt(pos) === 0x60) pos++;
	const openerLength = pos - start;
	if (state.backticksScanned && (state.backticks?.[openerLength] || 0) <= start) {
		if (!silent) state.addPending(start, pos);
		state.pos += openerLength;
		return true;
	}
	let matchEnd = pos;
	let matchStart: number;
	// markdown-it searches the whole source here, past `posMax`, and so does this port.
	while ((matchStart = src.indexOf('`', matchEnd)) !== -1) {
		matchEnd = matchStart + 1;
		while (matchEnd < max && src.charCodeAt(matchEnd) === 0x60) matchEnd++;
		const closerLength = matchEnd - matchStart;
		if (closerLength === openerLength) {
			if (!silent) state.pushT(I_CODE_INLINE, 0, start, matchEnd, openerLength);
			state.pos = matchEnd;
			return true;
		}
		(state.backticks ??= [])[closerLength] = matchStart;
	}
	state.backticksScanned = true;
	if (!silent) state.addPending(start, pos);
	state.pos += openerLength;
	return true;
}

function strikethroughTokenize(state: State, silent: boolean): boolean {
	const start = state.pos;
	const marker = state.src.charCodeAt(start);
	if (silent) return false;
	if (marker !== 0x7e) return false;
	const scanned = state.scanDelims(state.pos, true);
	let len = scanned.length;
	if (len < 2) return false;
	let at = start;
	if (len % 2) {
		state.pushT(I_TEXT, 0, at, at + 1, 0);
		at++;
		len--;
	}
	for (let i = 0; i < len; i += 2) {
		const tok = state.pushT(I_TEXT, 0, at, at + 2, 0);
		at += 2;
		state.delimiters.push({ marker, length: 0, token: tok, end: -1, open: scanned.canOpen, close: scanned.canClose });
	}
	state.pos += scanned.length;
	return true;
}

function emphasisTokenize(state: State, silent: boolean): boolean {
	const start = state.pos;
	const marker = state.src.charCodeAt(start);
	if (silent) return false;
	if (marker !== 0x5f && marker !== 0x2a) return false;
	const scanned = state.scanDelims(state.pos, marker === 0x2a);
	for (let i = 0; i < scanned.length; i++) {
		const tok = state.pushT(I_TEXT, 0, start + i, start + i + 1, 0);
		state.delimiters.push({ marker, length: scanned.length, token: tok, end: -1, open: scanned.canOpen, close: scanned.canClose });
	}
	state.pos += scanned.length;
	return true;
}

/** markdown-it's `parseLinkLabel`. */
function parseLinkLabel(state: State, start: number, disableNested: boolean): number {
	const max = state.posMax;
	const oldPos = state.pos;
	let found = false;
	state.pos = start + 1;
	let level = 1;
	while (state.pos < max) {
		const marker = state.src.charCodeAt(state.pos);
		if (marker === 0x5d) {
			level--;
			if (level === 0) {
				found = true;
				break;
			}
		}
		const prevPos = state.pos;
		skipToken(state);
		if (marker === 0x5b) {
			if (prevPos === state.pos - 1) {
				level++;
			} else if (disableNested) {
				state.pos = oldPos;
				return -1;
			}
		}
	}
	let labelEnd = -1;
	if (found) labelEnd = state.pos;
	state.pos = oldPos;
	return labelEnd;
}

function destinationOk(state: State, from: number, to: number): boolean {
	const raw = state.src.slice(from, to);
	const linkOk = state.p.linkOk;
	return raw.indexOf('&') >= 0 && linkOk ? linkOk(raw) : defaultLinkOk(raw);
}

function skipLinkSpace(src: string, pos: number, max: number): number {
	for (; pos < max; pos++) {
		const code = src.charCodeAt(pos);
		if (!isSpace(code) && code !== 0x0a) break;
	}
	return pos;
}

function link(state: State, silent: boolean): boolean {
	const src = state.src;
	if (src.charCodeAt(state.pos) !== 0x5b) return false;
	let start = state.pos;
	let parseReference = true;
	let d0 = -1;
	let d1 = -1;
	let t0 = -1;
	let t1 = -1;
	let ref = -1;
	const oldPos = state.pos;
	const max = state.posMax;
	const labelStart = state.pos + 1;
	const labelEnd = parseLinkLabel(state, state.pos, true);
	if (labelEnd < 0) return false;
	let pos = labelEnd + 1;
	if (pos < max && src.charCodeAt(pos) === 0x28) {
		parseReference = false;
		pos++;
		pos = skipLinkSpace(src, pos, max);
		if (pos >= max) return false;
		start = pos;
		const res = parseLinkDestination(src, pos, state.posMax);
		if (res.ok) {
			if (destinationOk(state, res.from, res.to)) {
				d0 = res.from;
				d1 = res.to;
				pos = res.pos;
			}
			start = pos;
			pos = skipLinkSpace(src, pos, max);
			const title = parseLinkTitle(src, pos, state.posMax);
			if (pos < max && start !== pos && title.ok) {
				t0 = title.from;
				t1 = title.to;
				pos = title.pos;
				pos = skipLinkSpace(src, pos, max);
			}
		}
		if (pos >= max || src.charCodeAt(pos) !== 0x29) parseReference = true;
		pos++;
	}
	if (parseReference) {
		if (state.refs === null) return false;
		let label: string | undefined;
		if (pos < max && src.charCodeAt(pos) === 0x5b) {
			start = pos + 1;
			pos = parseLinkLabel(state, pos, false);
			if (pos >= 0) label = src.slice(start, pos++);
			else pos = labelEnd + 1;
		} else {
			pos = labelEnd + 1;
		}
		if (!label) label = src.slice(labelStart, labelEnd);
		const found = state.refs.get(normalizeReference(label));
		if (found === undefined) {
			state.pos = oldPos;
			return false;
		}
		ref = found;
		d0 = d1 = t0 = t1 = -1;
	}
	if (!silent) {
		const rec = state.link(parseReference ? LINK_REF : LINK_INLINE, d0, d1, t0, t1, ref, -1);
		state.pos = labelStart;
		state.posMax = labelEnd;
		state.pushT(I_LINK_OPEN, 1, oldPos, labelStart, rec);
		tokenize(state);
		state.pushT(I_LINK_CLOSE, -1, labelEnd, pos, rec);
	}
	state.pos = pos;
	state.posMax = max;
	return true;
}

function image(state: State, silent: boolean): boolean {
	const src = state.src;
	let d0 = -1;
	let d1 = -1;
	let t0 = -1;
	let t1 = -1;
	let ref = -1;
	let isRef = false;
	const oldPos = state.pos;
	const max = state.posMax;
	if (src.charCodeAt(state.pos) !== 0x21) return false;
	if (src.charCodeAt(state.pos + 1) !== 0x5b) return false;
	const labelStart = state.pos + 2;
	const labelEnd = parseLinkLabel(state, state.pos + 1, false);
	if (labelEnd < 0) return false;
	let pos = labelEnd + 1;
	if (pos < max && src.charCodeAt(pos) === 0x28) {
		pos++;
		pos = skipLinkSpace(src, pos, max);
		if (pos >= max) return false;
		const res = parseLinkDestination(src, pos, state.posMax);
		if (res.ok) {
			if (destinationOk(state, res.from, res.to)) {
				d0 = res.from;
				d1 = res.to;
				pos = res.pos;
			}
		}
		const start = pos;
		pos = skipLinkSpace(src, pos, max);
		const title = parseLinkTitle(src, pos, state.posMax);
		if (pos < max && start !== pos && title.ok) {
			t0 = title.from;
			t1 = title.to;
			pos = title.pos;
			pos = skipLinkSpace(src, pos, max);
		}
		if (pos >= max || src.charCodeAt(pos) !== 0x29) {
			state.pos = oldPos;
			return false;
		}
		pos++;
	} else {
		if (state.refs === null) return false;
		let label: string | undefined;
		if (pos < max && src.charCodeAt(pos) === 0x5b) {
			const start = pos + 1;
			pos = parseLinkLabel(state, pos, false);
			if (pos >= 0) label = src.slice(start, pos++);
			else pos = labelEnd + 1;
		} else {
			pos = labelEnd + 1;
		}
		if (!label) label = src.slice(labelStart, labelEnd);
		const found = state.refs.get(normalizeReference(label));
		if (found === undefined) {
			state.pos = oldPos;
			return false;
		}
		ref = found;
		isRef = true;
	}
	if (!silent) {
		// markdown-it parses the label as a document of its own (a fresh state over the label's text).
		const child = state.p.parseAt(src.slice(labelStart, labelEnd), state.refs, labelStart);
		if (state.children === NO_CHILDREN) state.children = [];
		const ci = state.children.length;
		state.children.push(child);
		const rec = state.link(isRef ? LINK_REF : LINK_INLINE, d0, d1, t0, t1, ref, ci);
		state.pushT(I_IMAGE, 0, oldPos, pos, rec);
	}
	state.pos = pos;
	state.posMax = max;
	return true;
}

/** markdown-it's AUTOLINK_RE and EMAIL_RE, written as scans (the same languages). */
function isAutolinkUrl(src: string, from: number, to: number): boolean {
	// /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/
	let pos = from;
	const c0 = src.charCodeAt(pos);
	if (!((c0 >= 0x41 && c0 <= 0x5a) || (c0 >= 0x61 && c0 <= 0x7a))) return false;
	pos++;
	let n = 0;
	for (; pos < to; pos++) {
		const c = src.charCodeAt(pos);
		const ok = (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2e || c === 0x2d;
		if (!ok) break;
		n++;
	}
	if (n < 1 || n > 31 || pos >= to || src.charCodeAt(pos) !== 0x3a) return false;
	for (pos++; pos < to; pos++) {
		const c = src.charCodeAt(pos);
		if (c === 0x3c || c === 0x3e || c <= 0x20) return false;
	}
	return true;
}

const EMAIL_RE =
	/^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;

function autolink(state: State, silent: boolean): boolean {
	let pos = state.pos;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x3c) return false;
	const start = state.pos;
	const max = state.posMax;
	for (;;) {
		if (++pos >= max) return false;
		const ch = src.charCodeAt(pos);
		if (ch === 0x3c) return false;
		if (ch === 0x3e) break;
	}
	let type: number;
	if (isAutolinkUrl(src, start + 1, pos)) {
		// The scheme alone decides `validateLink` here: normalizeLink keeps it, and nothing is unescaped.
		const lower = src.slice(start + 1, Math.min(pos, start + 16)).toLowerCase();
		if (BAD_PROTO_RE.test(lower) && !GOOD_DATA_RE.test(src.slice(start + 1, pos).trim().toLowerCase())) return false;
		type = LINK_AUTO;
	} else if (EMAIL_RE.test(src.slice(start + 1, pos))) {
		type = LINK_EMAIL;
	} else {
		return false;
	}
	if (!silent) {
		const rec = state.link(type, start + 1, pos, -1, -1, -1, -1);
		state.pushT(I_LINK_OPEN, 1, start, start + 1, rec);
		const t = state.pushT(I_TEXT, 0, start + 1, pos, 0);
		state.t[t * ISTRIDE + I_FLAGS] |= F_LINK_TEXT;
		state.pushT(I_LINK_CLOSE, -1, pos, pos + 1, rec);
	}
	state.pos = pos + 1;
	return true;
}

// markdown-it lib/common/html_re.mjs: an open or close tag.
const attr_name = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const unquoted = '[^"\'=<>`\\x00-\\x20]+';
const single_quoted = "'[^']*'";
const double_quoted = '"[^"]*"';
const attr_value = `(?:${unquoted}|${single_quoted}|${double_quoted})`;
const attribute = `(?:\\s+${attr_name}(?:\\s*=\\s*${attr_value})?)`;
const open_tag = `<[A-Za-z][A-Za-z0-9\\-]*${attribute}*\\s*\\/?>`;
const close_tag = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';
// Sticky (`y`) at `pos` instead of markdown-it's `src.slice(pos).match(/^…/)`: the same match, without reading the rest
// of the leaf into a new string at every `<`.
const HTML_OPEN_CLOSE_TAG_RE = new RegExp(`(?:${open_tag}|${close_tag})`, 'y');

const isLetter = (ch: number) => {
	const lc = ch | 0x20;
	return lc >= 0x61 && lc <= 0x7a;
};

function scanSpecial(state: State, pos: number): number {
	const src = state.src;
	let start: number;
	let terminator: string;
	if (src.startsWith('<!--', pos)) {
		if (src.startsWith('>', pos + 4)) return pos + 5;
		if (src.startsWith('->', pos + 4)) return pos + 6;
		start = pos + 4;
		terminator = '-->';
	} else if (src.startsWith('<![CDATA[', pos)) {
		start = pos + 9;
		terminator = ']]>';
	} else if (src.charCodeAt(pos + 1) === 0x3f) {
		start = pos + 2;
		terminator = '?>';
	} else if (isLetter(src.charCodeAt(pos + 2))) {
		start = pos + 3;
		terminator = '>';
	} else {
		return -1;
	}
	if (state.skipHtmlSpecial) return -1;
	const end = src.indexOf(terminator, start);
	if (end < 0) {
		state.skipHtmlSpecial = true;
		return -1;
	}
	return end + terminator.length;
}

function htmlInline(state: State, silent: boolean): boolean {
	if (!state.p.html) return false;
	const max = state.posMax;
	const pos = state.pos;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x3c || pos + 2 >= max) return false;
	let end: number;
	const ch = src.charCodeAt(pos + 1);
	if (ch === 0x21 || ch === 0x3f) {
		end = scanSpecial(state, pos);
	} else if (ch === 0x2f || isLetter(ch)) {
		HTML_OPEN_CLOSE_TAG_RE.lastIndex = pos;
		const match = HTML_OPEN_CLOSE_TAG_RE.exec(src);
		end = match ? pos + match[0].length : -1;
	} else {
		return false;
	}
	if (end < 0) return false;
	if (!silent) state.pushT(I_HTML_INLINE, 0, pos, end, 0);
	state.pos = end;
	return true;
}

const DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
const NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;

function entity(state: State, silent: boolean): boolean {
	const pos = state.pos;
	const max = state.posMax;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x26) return false;
	if (pos + 1 >= max) return false;
	const ch = src.charCodeAt(pos + 1);
	if (ch === 0x23) {
		const match = src.slice(pos, pos + 12).match(DIGITAL_RE);
		if (match) {
			if (!silent) state.pushT(I_TEXT_SPECIAL, 0, pos, pos + match[0].length, SPECIAL_ENTITY);
			state.pos += match[0].length;
			return true;
		}
	} else {
		const match = src.slice(pos, pos + 35).match(NAMED_RE);
		if (match && state.p.namedEntity(match[0])) {
			if (!silent) state.pushT(I_TEXT_SPECIAL, 0, pos, pos + match[0].length, SPECIAL_ENTITY);
			state.pos += match[0].length;
			return true;
		}
	}
	return false;
}

// ── The driver (markdown-it lib/parser_inline.mjs) ──────────────────────────────────────────────────

function skipToken(state: State): void {
	const pos = state.pos;
	const cache = (state.cache ??= new Map());
	const cached = cache.get(pos);
	if (cached !== undefined) {
		state.pos = cached;
		return;
	}
	let ok = false;
	if (state.level < MAX_NESTING) {
		const c = state.src.charCodeAt(pos);
		const rules = state.p.chainAt(c);
		for (let i = 0; i < rules.length; i++) {
			state.level++;
			ok = rules[i](state, true);
			state.level--;
			if (ok) {
				if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
				break;
			}
		}
	} else {
		state.pos = state.posMax;
	}
	if (!ok) state.pos++;
	cache.set(pos, state.pos);
}

function tokenize(state: State): void {
	const end = state.posMax;
	const src = state.src;
	while (state.pos < end) {
		const prevPos = state.pos;
		let ok = false;
		if (state.level < MAX_NESTING) {
			const rules = state.p.chainAt(src.charCodeAt(prevPos));
			for (let i = 0; i < rules.length; i++) {
					ok = rules[i](state, false);
				if (ok) {
					if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
					break;
				}
			}
		}
		if (ok) {
			if (state.pos >= end) break;
			continue;
		}
		state.addPending(state.pos, state.pos + 1);
		state.pos++;
	}
	if (state.pEnd > state.pStart) state.pushPending();
}

// ── Post-processing (markdown-it ruler2: balance_pairs, strikethrough, emphasis) ─────────────────────

function processDelimiters(delimiters: Delim[]): void {
	const openersBottom = new Map<number, number[]>();
	const max = delimiters.length;
	if (!max) return;
	let headerIdx = 0;
	let lastTokenIdx = -2;
	const jumps: number[] = [];
	for (let closerIdx = 0; closerIdx < max; closerIdx++) {
		const closer = delimiters[closerIdx];
		jumps.push(0);
		if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) headerIdx = closerIdx;
		lastTokenIdx = closer.token;
		closer.length = closer.length || 0;
		if (!closer.close) continue;
		let bottoms = openersBottom.get(closer.marker);
		if (!bottoms) openersBottom.set(closer.marker, (bottoms = [-1, -1, -1, -1, -1, -1]));
		const minOpenerIdx = bottoms[(closer.open ? 3 : 0) + (closer.length % 3)];
		let openerIdx = headerIdx - jumps[headerIdx] - 1;
		let newMinOpenerIdx = openerIdx;
		for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
			const opener = delimiters[openerIdx];
			if (opener.marker !== closer.marker) continue;
			if (opener.open && opener.end < 0) {
				let isOddMatch = false;
				if (opener.close || closer.open) {
					if ((opener.length + closer.length) % 3 === 0) {
						if (opener.length % 3 !== 0 || closer.length % 3 !== 0) isOddMatch = true;
					}
				}
				if (!isOddMatch) {
					const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
					jumps[closerIdx] = closerIdx - openerIdx + lastJump;
					jumps[openerIdx] = lastJump;
					closer.open = false;
					opener.end = closerIdx;
					opener.close = false;
					newMinOpenerIdx = -1;
					lastTokenIdx = -2;
					break;
				}
			}
		}
		if (newMinOpenerIdx !== -1) bottoms[(closer.open ? 3 : 0) + ((closer.length || 0) % 3)] = newMinOpenerIdx;
	}
}

function strikethroughPost(state: State, delimiters: Delim[]): void {
	const loneMarkers: number[] = [];
	const max = delimiters.length;
	for (let i = 0; i < max; i++) {
		const startDelim = delimiters[i];
		if (startDelim.marker !== 0x7e) continue;
		if (startDelim.end === -1) continue;
		const endDelim = delimiters[startDelim.end];
		state.t[startDelim.token * ISTRIDE + I_KIND] = I_S_OPEN;
		state.t[startDelim.token * ISTRIDE + I_NEST] = 1;
		state.t[startDelim.token * ISTRIDE + I_AUX] = 0x7e;
		state.t[endDelim.token * ISTRIDE + I_KIND] = I_S_CLOSE;
		state.t[endDelim.token * ISTRIDE + I_NEST] = -1;
		state.t[endDelim.token * ISTRIDE + I_AUX] = 0x7e;
		const prev = endDelim.token - 1;
		if (state.t[prev * ISTRIDE + I_KIND] === I_TEXT && isLoneTilde(state, prev)) loneMarkers.push(prev);
	}
	while (loneMarkers.length) {
		const i = loneMarkers.pop() as number;
		let j = i + 1;
		while (j < state.n && state.t[j * ISTRIDE + I_KIND] === I_S_CLOSE) j++;
		j--;
		if (i !== j) state.swap(i, j);
	}
}

/** markdown-it's `tokens[i].content === '~'`, for a text token. */
function isLoneTilde(state: State, i: number): boolean {
	if (state.t[i * ISTRIDE + I_FLAGS] & (F_EMPTY | F_LINK_TEXT)) return false;
	return state.t[i * ISTRIDE + I_TO] - state.t[i * ISTRIDE + I_FROM] === 1 && state.src.charCodeAt(state.t[i * ISTRIDE + I_FROM]) === 0x7e;
}

function emphasisPost(state: State, delimiters: Delim[]): void {
	const max = delimiters.length;
	for (let i = max - 1; i >= 0; i--) {
		const startDelim = delimiters[i];
		if (startDelim.marker !== 0x5f && startDelim.marker !== 0x2a) continue;
		if (startDelim.end === -1) continue;
		const endDelim = delimiters[startDelim.end];
		const isStrong =
			i > 0 &&
			delimiters[i - 1].end === startDelim.end + 1 &&
			delimiters[i - 1].marker === startDelim.marker &&
			delimiters[i - 1].token === startDelim.token - 1 &&
			delimiters[startDelim.end + 1].token === endDelim.token + 1;
		state.t[startDelim.token * ISTRIDE + I_KIND] = isStrong ? I_STRONG_OPEN : I_EM_OPEN;
		state.t[startDelim.token * ISTRIDE + I_NEST] = 1;
		state.t[startDelim.token * ISTRIDE + I_AUX] = startDelim.marker;
		state.t[endDelim.token * ISTRIDE + I_KIND] = isStrong ? I_STRONG_CLOSE : I_EM_CLOSE;
		state.t[endDelim.token * ISTRIDE + I_NEST] = -1;
		state.t[endDelim.token * ISTRIDE + I_AUX] = startDelim.marker;
		if (isStrong) {
			// markdown-it turns the inner markers into the strong tokens and empties the outer markers' text. The
			// emptied tokens stay on the tape with their character's range, so an editor sees every `*`.
			const outerO = delimiters[i - 1].token;
			const outerC = delimiters[startDelim.end + 1].token;
			state.t[outerO * ISTRIDE + I_FLAGS] |= F_EMPTY;
			state.t[outerC * ISTRIDE + I_FLAGS] |= F_EMPTY;
			i--;
		}
	}
}

function postProcess(state: State): void {
	processDelimiters(state.delimiters);
	for (const d of state.metaDelims) processDelimiters(d);
	if (state.p.strikethrough) {
		strikethroughPost(state, state.delimiters);
		for (const d of state.metaDelims) strikethroughPost(state, d);
	}
	emphasisPost(state, state.delimiters);
	for (const d of state.metaDelims) emphasisPost(state, d);
}

// ── The parser ───────────────────────────────────────────────────────────────────────────────────────

const CORE_RULES: readonly [string, Rule, string | null][] = [
	// name, rule, the characters it can start on (null: text's own test)
	['text', text, null],
	['newline', newline, '\n'],
	['escape', escapeRule, '\\'],
	['backticks', backticks, '`'],
	['strikethrough', strikethroughTokenize, '~'],
	['emphasis', emphasisTokenize, '*_'],
	['link', link, '['],
	['image', image, '!'],
	['autolink', autolink, '<'],
	['html_inline', htmlInline, '<'],
	['entity', entity, '&'],
];


export class InlineParser {
	readonly kinds: string[];
	readonly html: boolean;
	readonly strikethrough: boolean;
	readonly namedEntity: (match: string) => boolean;
	readonly linkOk?: (raw: string) => boolean;
	/** The rule chain per first character (0-127), and for every other character (index 128). */
	private readonly chains: Rule[][];
	private readonly kindIndex = new Map<string, number>();
	private readonly pool: State[] = [];
	private depth = 0;

	constructor(opts: InlineParserOptions) {
		this.html = opts.html !== false;
		this.strikethrough = opts.strikethrough !== false;
		this.namedEntity = opts.namedEntity;
		this.linkOk = opts.linkOk;
		this.kinds = [...INLINE_KINDS];
		for (let i = 0; i < this.kinds.length; i++) this.kindIndex.set(this.kinds[i], i);
		// The chain in markdown-it's order, plugin rules placed by their anchors as `ruler.before/after` would.
		const chain: { name: string; rule: Rule; starts: string | null }[] = CORE_RULES.filter(([name]) => name !== 'strikethrough' || this.strikethrough).map(([name, rule, starts]) => ({
			name,
			rule,
			starts,
		}));
		for (const extra of opts.rules ?? []) {
			const anchor = extra.after ?? extra.before;
			const at = chain.findIndex((r) => r.name === anchor);
			if (at < 0) throw new Error(`segno-markdown inline: no rule "${anchor}" to anchor "${extra.name}" to`);
			if (!this.kindIndex.has(extra.name)) {
				this.kindIndex.set(extra.name, this.kinds.length);
				this.kinds.push(extra.name);
			}
			const fn = extra.rule;
			const rule: Rule = (state, silent) => {
				state.pluginTok = -1;
				const ok = fn(state.pluginView(), silent);
				if (ok && state.pluginTok >= 0) state.t[state.pluginTok * ISTRIDE + I_TO] = state.pos;
				return ok;
			};
			chain.splice(extra.after ? at + 1 : at, 0, { name: extra.name, rule, starts: extra.triggers ?? '' });
		}
		this.chains = [];
		for (let c = 0; c <= 128; c++) {
			const stops = c < 128 && TERMINATOR[c] === 1;
			this.chains.push(
				chain
					.filter((r) => {
						if (r.starts === null) return !stops; // text: only where it does not stop
						if (r.starts === '') return true; // a plugin rule with no triggers
						// Index 128 holds every character above ASCII, so a rule with any such trigger is tried on all of them.
						if (c === 128) return [...r.starts].some((t) => t.charCodeAt(0) >= 128);
						return r.starts.indexOf(String.fromCharCode(c)) >= 0;
					})
					.map((r) => r.rule),
			);
		}
	}

	/** @internal */
	chainAt(c: number): Rule[] {
		return this.chains[c < 128 ? c : 128];
	}

	/** @internal A plugin token type's kind index. */
	kindOf(type: string): number {
		const k = this.kindIndex.get(type);
		if (k === undefined) throw new Error(`segno-markdown inline: unknown token type "${type}"`);
		return k;
	}

	/**
	 * S2 over one leaf's text. `refs`: the deck's reference labels, normalized (`normalizeReference`), each to its
	 * index in the caller's reference table; null when the deck defines none (markdown-it's `env.references`
	 * undefined, which a reference link reads the same way as a label it cannot find).
	 */
	parse(src: string, refs: ReadonlyMap<string, number> | null = null): InlineTape {
		return this.parseAt(src, refs, 0);
	}

	/** @internal */
	parseAt(src: string, refs: ReadonlyMap<string, number> | null, base: number): InlineTape {
		// One state per nesting depth (an image's alt text parses inside its parent's parse), reused across parses.
		const depth = this.depth++;
		const state = (this.pool[depth] ??= new State(this));
		state.reset(src, refs);
		try {
			tokenize(state);
			postProcess(state);
			const n = state.n;
			const tape = state.t.slice(0, n * ISTRIDE);
			let level = 0;
			for (let at = 0; at < tape.length; at += ISTRIDE) {
				const nest = tape[at + I_NEST];
				if (nest < 0) level--;
				tape[at + I_LEVEL] = level;
				if (nest > 0) level++;
			}
			const out: InlineTape = { src, base, kinds: this.kinds, tape, length: n, links: state.links.length ? Int32Array.from(state.links) : NO_LINKS, children: state.children, side: state.side ?? NO_SIDE };
			// Hold no leaf text past the parse (a pooled state outlives it).
			state.src = '';
			state.refs = null;
			return out;
		} finally {
			this.depth--;
		}
	}
}
