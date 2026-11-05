/**
 * S1, the block pass, for CommonMark as Lattice configures markdown-it (`commonmark` preset, `html: true`,
 * `table` enabled, plugin block rules installed before `fence`). It writes a flat tape of block records
 * instead of markdown-it's `Token` objects, and it computes no `content` strings, which is where its speed
 * comes from: the rules themselves are markdown-it 14.1.1's, line for line, so the structure matches it by
 * construction and the corpus differential (test/unit/core/deck-model.test.js) holds the claim to every deck.
 *
 * Ported from markdown-it (https://github.com/markdown-it/markdown-it), MIT licence, Copyright (c) 2014
 * Vitaly Puzrin, Alex Kocharin. Each rule keeps markdown-it's name and order so a reader can diff the two.
 *
 * Bounds (the stage contract, G5 in engineering/decisions/2026-10-22-segno-deck-pipeline.md): the same as
 * markdown-it's block parser, whose rules this is. Each line is classified a bounded number of times per
 * open container, and the nesting cap (`MAX_NESTING`, the commonmark preset's 20) bounds the containers.
 * The hostile ladders in the tests hold every rule to about 10x growth for 10x input.
 */

/** Token kinds, in tape order. A plugin block type is appended to the parser's own copy. */
export const CORE_KINDS = [
	'paragraph_open',
	'paragraph_close',
	'inline',
	'heading_open',
	'heading_close',
	'bullet_list_open',
	'bullet_list_close',
	'ordered_list_open',
	'ordered_list_close',
	'list_item_open',
	'list_item_close',
	'blockquote_open',
	'blockquote_close',
	'fence',
	'code_block',
	'html_block',
	'hr',
	'table_open',
	'table_close',
	'thead_open',
	'thead_close',
	'tbody_open',
	'tbody_close',
	'tr_open',
	'tr_close',
	'th_open',
	'th_close',
	'td_open',
	'td_close',
] as const;

const K_PARAGRAPH_OPEN = 0;
const K_PARAGRAPH_CLOSE = 1;
const K_INLINE = 2;
const K_HEADING_OPEN = 3;
const K_HEADING_CLOSE = 4;
const K_BULLET_LIST_OPEN = 5;
const K_BULLET_LIST_CLOSE = 6;
const K_ORDERED_LIST_OPEN = 7;
const K_ORDERED_LIST_CLOSE = 8;
const K_LIST_ITEM_OPEN = 9;
const K_LIST_ITEM_CLOSE = 10;
const K_BLOCKQUOTE_OPEN = 11;
const K_BLOCKQUOTE_CLOSE = 12;
const K_FENCE = 13;
const K_CODE_BLOCK = 14;
const K_HTML_BLOCK = 15;
const K_HR = 16;
const K_TABLE_OPEN = 17;
const K_TABLE_CLOSE = 18;
const K_THEAD_OPEN = 19;
const K_THEAD_CLOSE = 20;
const K_TBODY_OPEN = 21;
const K_TBODY_CLOSE = 22;
const K_TR_OPEN = 23;
const K_TR_CLOSE = 24;
const K_TH_OPEN = 25;
const K_TH_CLOSE = 26;
const K_TD_OPEN = 27;
const K_TD_CLOSE = 28;

export const KIND = Object.freeze({
	paragraph_open: K_PARAGRAPH_OPEN,
	paragraph_close: K_PARAGRAPH_CLOSE,
	inline: K_INLINE,
	heading_open: K_HEADING_OPEN,
	heading_close: K_HEADING_CLOSE,
	bullet_list_open: K_BULLET_LIST_OPEN,
	bullet_list_close: K_BULLET_LIST_CLOSE,
	ordered_list_open: K_ORDERED_LIST_OPEN,
	ordered_list_close: K_ORDERED_LIST_CLOSE,
	list_item_open: K_LIST_ITEM_OPEN,
	list_item_close: K_LIST_ITEM_CLOSE,
	blockquote_open: K_BLOCKQUOTE_OPEN,
	blockquote_close: K_BLOCKQUOTE_CLOSE,
	fence: K_FENCE,
	code_block: K_CODE_BLOCK,
	html_block: K_HTML_BLOCK,
	hr: K_HR,
	table_open: K_TABLE_OPEN,
	table_close: K_TABLE_CLOSE,
	thead_open: K_THEAD_OPEN,
	thead_close: K_THEAD_CLOSE,
	tbody_open: K_TBODY_OPEN,
	tbody_close: K_TBODY_CLOSE,
	tr_open: K_TR_OPEN,
	tr_close: K_TR_CLOSE,
	th_open: K_TH_OPEN,
	th_close: K_TH_CLOSE,
	td_open: K_TD_OPEN,
	td_close: K_TD_CLOSE,
});

/**
 * The tape: STRIDE integers per token, in markdown-it's token order.
 *   T_KIND   index into the parser's `kinds`
 *   T_LEVEL  markdown-it's `token.level` (nesting depth at the token)
 *   T_NEST   1 open, 0 self-contained, -1 close
 *   T_L0     `token.map[0]`, or -1 when markdown-it gives the token no map
 *   T_L1     `token.map[1]`
 *   T_FLAGS  bit 0: `hidden` (a tight list's paragraph); bit 1: the token has a side record (`side`)
 *   T_AUX    per kind: a heading's level (setext +8), an ordered list's start number, a fence's marker
 *            length, a table cell's column, an alignment code on `th_open`/`td_open`
 */
export const STRIDE = 7;
export const T_KIND = 0;
export const T_LEVEL = 1;
export const T_NEST = 2;
export const T_L0 = 3;
export const T_L1 = 4;
export const T_FLAGS = 5;
export const T_AUX = 6;
export const F_HIDDEN = 1;
export const F_SIDE = 2;

/** What a plugin block rule sees (the fields `lib/plugins/state-facade.mjs` exposes, and no more). */
export interface BlockState {
	readonly src: string;
	line: number;
	readonly bMarks: Int32Array;
	readonly eMarks: Int32Array;
	readonly tShift: Int32Array;
	readonly sCount: Int32Array;
	readonly blkIndent: number;
	isEmpty(line: number): boolean;
	push(type: string, tag: string, nesting: number): TokenHandle;
}

/** A token's writable fields, as a plugin rule's `push` hands them back. */
export interface TokenHandle {
	content: string;
	markup: string;
	info: string;
	map: [number, number] | null;
	block: boolean;
	meta: unknown;
	hidden: boolean;
}

export type BlockRuleFn = (state: BlockState, startLine: number, endLine: number, silent: boolean) => boolean;

/** A block rule a host adds (Lattice's plugins: `code_record`, `math_block`). */
export interface ExtraBlockRule {
	name: string;
	rule: BlockRuleFn;
	/** The core rule it runs before (markdown-it's `ruler.before`); `fence` when omitted. */
	before?: string;
	/** Chains it also terminates (markdown-it's `alt`): `paragraph`, `reference`, `blockquote`, `list`. */
	alt?: readonly string[];
	/**
	 * The characters the rule can start on (a plugin manifest's `triggers`): the rule is tried only on a
	 * line whose first non-indent character is one of them. A promise the rule must keep; the corpus
	 * differential holds every shipped plugin to it. Omitted: tried on every line, as markdown-it does.
	 */
	triggers?: string;
	/**
	 * The rule decides by reading lines PAST the block it opens (a manifest's `scansAhead`), or keeps state
	 * across calls (math's "no closer ahead" memo). The parse records every line such a rule is tried on
	 * (`BlockTape.forward`), so an incremental update knows when an earlier slide's decision can reach into
	 * the edit, or the edit into a later slide's, and parses the whole deck instead.
	 */
	scansAhead?: boolean;
	/** The core rule it runs after (markdown-it's `ruler.after`), instead of `before`. */
	after?: string;
}

export interface BlockParserOptions {
	/** markdown-it's `html` option: HTML blocks are recognized. Lattice: true. */
	html?: boolean;
	/** The GFM table rule, which Lattice enables. */
	table?: boolean;
	/** Extra block rules, in installation order. */
	rules?: readonly ExtraBlockRule[];
	/**
	 * Decide a link reference definition's destination whose text holds an entity (`&…;`), which this
	 * package does not decode. Gets the destination as written; return markdown-it's
	 * `validateLink(normalizeLink(unescapeAll(dest)))`. Without it, such a destination is decoded for
	 * numeric references only and judged by the same protocol rule.
	 */
	linkOk?: (rawDestination: string) => boolean;
}

/** The scratch line index `parseFrom` reads: `bMarks`/`eMarks` with room for `lines + 1` entries. */
export function lineScratch(lines: number): { bMarks: Int32Array; eMarks: Int32Array } {
	if (lines + 1 > scratch.lines) grow(Math.max(lines + 1, scratch.lines * 2));
	return { bMarks: scratch.bMarks, eMarks: scratch.eMarks };
}

/** A line index a caller already holds, and the line a parse will start on. */
export interface LineIndex {
	readonly bMarks: Int32Array;
	readonly eMarks: Int32Array;
	readonly lines: number;
	readonly from: number;
}

/** One parse's output. Line numbers index `src.split('\n')`, as markdown-it's `token.map` does. */
export interface BlockTape {
	readonly src: string;
	readonly kinds: readonly string[];
	/** STRIDE integers per token. */
	readonly tape: Int32Array;
	/** Token count. */
	readonly length: number;
	/** Line count (markdown-it's `lineMax`). */
	readonly lines: number;
	/** Line start offsets, `lines + 1` entries (the last is `src.length`). */
	readonly bMarks: Int32Array;
	/** Line end offsets (the `\n`, or `src.length`). */
	readonly eMarks: Int32Array;
	/** Side records for tokens a plugin wrote content, info or meta on, by token index. */
	readonly side: ReadonlyMap<number, { content?: string; info?: string; markup?: string; meta?: unknown }>;
	/** Every line a `scansAhead` rule was tried on, in the order tried. */
	readonly forward: readonly number[];
}

const MAX_NESTING = 20; // markdown-it's commonmark preset
const isSpace = (c: number) => c === 0x09 || c === 0x20;

// ── HTML block sequences (markdown-it lib/rules_block/html_block.mjs, lib/common/html_*.mjs) ─────────
const BLOCK_NAMES = [
	'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd',
	'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu',
	'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search', 'section', 'summary', 'table', 'tbody',
	'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul',
];
const ATTR_NAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const ATTR_VALUE = `(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*")`;
const ATTRIBUTE = `(?:\\s+${ATTR_NAME}(?:\\s*=\\s*${ATTR_VALUE})?)`;
const OPEN_TAG = `<[A-Za-z][A-Za-z0-9\\-]*${ATTRIBUTE}*\\s*\\/?>`;
const CLOSE_TAG = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';
const HTML_OPEN_CLOSE_TAG = `^(?:${OPEN_TAG}|${CLOSE_TAG})`;
// markdown-it's seven HTML-block start/end conditions (CommonMark §4.6), which decide where a BLOCK ends, not
// what HTML is safe: sanitizing is `sanitizeSlideHtml`'s job (HARD RULE #22), and widening an end condition
// here would split blocks differently from the renderer. Condition 2, the comment (`<!--` to `-->`), is
// decided in `htmlBlock`'s fast path before this table is read, so its slot holds a pattern that never
// matches; the slot stays so the condition numbers (the tape's T_AUX, `1` for a comment) keep markdown-it's.
const NEVER = /(?!)/;
const HTML_SEQUENCES: [RegExp, RegExp, boolean][] = [
	[/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true],
	[NEVER, NEVER, true],
	[/^<\?/, /\?>/, true],
	[/^<![A-Z]/, />/, true],
	[/^<!\[CDATA\[/, /\]\]>/, true],
	[new RegExp(`^</?(${BLOCK_NAMES.join('|')})(?=(\\s|/?>|$))`, 'i'), /^$/, true],
	[new RegExp(`${HTML_OPEN_CLOSE_TAG}\\s*$`), /^$/, false],
];

// ── Link reference helpers (markdown-it lib/helpers, lib/common/utils.mjs) ─────────────────────────
const BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
const ESCAPABLE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const NUMERIC_ENTITY = /&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g;

function defaultLinkOk(raw: string): boolean {
	let s = raw.indexOf('\\') >= 0 ? raw.replace(ESCAPABLE, '$1') : raw;
	if (s.indexOf('&') >= 0)
		s = s.replace(NUMERIC_ENTITY, (m, hex, dec) => {
			const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
			return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
		});
	const str = s.trim().toLowerCase();
	return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
}

interface LinkResult {
	ok: boolean;
	pos: number;
	raw: string;
}

function parseLinkDestination(str: string, start: number, max: number): LinkResult {
	let pos = start;
	const result: LinkResult = { ok: false, pos: 0, raw: '' };
	if (str.charCodeAt(pos) === 0x3c) {
		pos++;
		while (pos < max) {
			const code = str.charCodeAt(pos);
			if (code === 0x0a || code === 0x3c) return result;
			if (code === 0x3e) {
				result.pos = pos + 1;
				result.raw = str.slice(start + 1, pos);
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
			if (str.charCodeAt(pos + 1) === 0x20) break;
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
	result.raw = str.slice(start, pos);
	result.pos = pos;
	result.ok = true;
	return result;
}

interface TitleState {
	ok: boolean;
	can_continue: boolean;
	pos: number;
	nonEmpty: boolean;
	marker: number;
}

// The title's TEXT matters to the reference rule only through `if (title)`: whether it is non-empty.
function parseLinkTitle(str: string, start: number, max: number, prev?: TitleState): TitleState {
	let pos = start;
	const state: TitleState = { ok: false, can_continue: false, pos: 0, nonEmpty: false, marker: 0 };
	if (prev) {
		state.nonEmpty = prev.nonEmpty;
		state.marker = prev.marker;
	} else {
		if (pos >= max) return state;
		let marker = str.charCodeAt(pos);
		if (marker !== 0x22 && marker !== 0x27 && marker !== 0x28) return state;
		start++;
		pos++;
		if (marker === 0x28) marker = 0x29;
		state.marker = marker;
	}
	while (pos < max) {
		const code = str.charCodeAt(pos);
		if (code === state.marker) {
			state.pos = pos + 1;
			if (pos > start) state.nonEmpty = true;
			state.ok = true;
			return state;
		} else if (code === 0x28 && state.marker === 0x29) {
			return state;
		} else if (code === 0x5c && pos + 1 < max) {
			pos++;
		}
		pos++;
	}
	state.can_continue = true;
	if (pos > start) state.nonEmpty = true;
	return state;
}

// ── The parser ───────────────────────────────────────────────────────────────────────────────────────

type Rule = (s: State, startLine: number, endLine: number, silent: boolean) => boolean;

class Handle implements TokenHandle {
	private readonly st: State;
	private readonly i: number;
	constructor(st: State, i: number) {
		this.st = st;
		this.i = i;
	}
	private sideRec() {
		const t = this.st.tape;
		t[this.i * STRIDE + T_FLAGS] |= F_SIDE;
		let r = this.st.side.get(this.i);
		if (!r) this.st.side.set(this.i, (r = {}));
		return r;
	}
	get content() {
		return this.st.side.get(this.i)?.content ?? '';
	}
	set content(v: string) {
		this.sideRec().content = v;
	}
	get markup() {
		return this.st.side.get(this.i)?.markup ?? '';
	}
	set markup(v: string) {
		this.sideRec().markup = v;
	}
	get info() {
		return this.st.side.get(this.i)?.info ?? '';
	}
	set info(v: string) {
		this.sideRec().info = v;
	}
	get meta() {
		return this.st.side.get(this.i)?.meta ?? null;
	}
	set meta(v: unknown) {
		this.sideRec().meta = v;
	}
	get block() {
		return true;
	}
	set block(_v: boolean) {}
	get hidden() {
		return (this.st.tape[this.i * STRIDE + T_FLAGS] & F_HIDDEN) !== 0;
	}
	set hidden(v: boolean) {
		const at = this.i * STRIDE + T_FLAGS;
		this.st.tape[at] = v ? this.st.tape[at] | F_HIDDEN : this.st.tape[at] & ~F_HIDDEN;
	}
	get map(): [number, number] | null {
		const t = this.st.tape;
		const l0 = t[this.i * STRIDE + T_L0];
		return l0 < 0 ? null : [l0, t[this.i * STRIDE + T_L1]];
	}
	set map(v: [number, number] | null) {
		const t = this.st.tape;
		t[this.i * STRIDE + T_L0] = v ? v[0] : -1;
		t[this.i * STRIDE + T_L1] = v ? v[1] : -1;
	}
}

const scratch = { lines: 0, bMarks: new Int32Array(0), eMarks: new Int32Array(0), tShift: new Int32Array(0), sCount: new Int32Array(0), bsCount: new Int32Array(0), tape: new Int32Array(1024 * STRIDE) };

/**
 * Give back the token scratch a large deck grew, returning it to its starting size. The scratch only grows, so after
 * one very large deck a long-lived host holds that deck's tape until it calls this. The tests also use it to make a
 * parse grow the tape on purpose.
 */
export function releaseScratch(): void {
	scratch.tape = new Int32Array(1024 * STRIDE);
}

/** Grow the per-line scratch to `size` entries, keeping what is written. */
function grow(size: number): number {
	const keep = (old: Int32Array) => {
		const next = new Int32Array(size);
		next.set(old.subarray(0, Math.min(old.length, size)));
		return next;
	};
	scratch.bMarks = keep(scratch.bMarks);
	scratch.eMarks = keep(scratch.eMarks);
	scratch.tShift = keep(scratch.tShift);
	scratch.sCount = keep(scratch.sCount);
	scratch.bsCount = new Int32Array(size);
	scratch.lines = size;
	return size;
}

class State implements BlockState {
	src: string;
	bMarks!: Int32Array;
	eMarks!: Int32Array;
	tShift!: Int32Array;
	sCount!: Int32Array;
	bsCount!: Int32Array;
	blkIndent = 0;
	line = 0;
	lineMax = 0;
	tight = false;
	listIndent = -1;
	parentType = 'root';
	level = 0;
	tape!: Int32Array;
	n = 0;
	side = new Map<number, { content?: string; info?: string; markup?: string; meta?: unknown }>();
	p: BlockParser;

	/** Called after each top-level thematic break with its line; true stops the parse there. */
	stop: ((line: number) => boolean) | null = null;
	stopped = false;
	/** Lines a `scansAhead` rule was tried on. */
	forward: number[] = [];
	/**
	 * The last `-->` search: from `closeFrom`, the next one is at `closeAt` (-1: none to the end). Any search from
	 * a position in `[closeFrom, closeAt]` (or past `closeFrom` when there is none) has the same answer, so a run
	 * of unclosed comments costs one scan of the rest of the source, not one each.
	 */
	closeFrom = -1;
	closeAt = -1;

	/** The first `-->` at or after `from`, as `src.indexOf('-->', from)`, reusing the last search when it answers. */
	nextClose(from: number): number {
		if (this.closeFrom >= 0 && from >= this.closeFrom && (this.closeAt < 0 || from <= this.closeAt)) return this.closeAt;
		this.closeFrom = from;
		this.closeAt = this.src.indexOf('-->', from);
		return this.closeAt;
	}

	constructor(src: string, p: BlockParser, index?: LineIndex) {
		this.src = src;
		this.p = p;
		if (index) {
			this.adopt(index);
			return;
		}
		// One pass for the line index (markdown-it's StateBlock constructor), into module scratch that every
		// parse reuses (parsing is synchronous and no rule can start another parse); allocating and zeroing
		// per parse was a fifth of the gallery's time. `bMarks` and `eMarks` are copied out at their final
		// length, because the tape's readers need them; the tape is copied out the same way in `parse`.
		const len = src.length;
		let cap = scratch.lines;
		let bm = scratch.bMarks;
		let em = scratch.eMarks;
		let ts = scratch.tShift;
		let sc = scratch.sCount;
		let L = 0;
		let start = 0;
		while (start < len) {
			let end = src.indexOf('\n', start);
			if (end < 0) {
				end = len;
				// markdown-it's line loop never closes a last line that has no `\n` and holds only spaces and
				// tabs: its indent branch `continue`s past the end-of-input test. So that line is not a line.
				let k = start;
				while (k < len && (src.charCodeAt(k) === 0x20 || src.charCodeAt(k) === 0x09)) k++;
				if (k >= len) break;
			}
			if (L + 2 > cap) {
				cap = grow(Math.max(64, cap * 2));
				bm = scratch.bMarks;
				em = scratch.eMarks;
				ts = scratch.tShift;
				sc = scratch.sCount;
			}
			let pos = start;
			let offset = 0;
			for (; pos < end; pos++) {
				const ch = src.charCodeAt(pos);
				if (ch === 0x20) offset++;
				else if (ch === 0x09) offset += 4 - (offset % 4);
				else break;
			}
			bm[L] = start;
			em[L] = end;
			ts[L] = pos - start;
			sc[L] = offset;
			L++;
			start = end + 1;
		}
		if (L + 1 > cap) grow(L + 1);
		const lines = L;
		this.bMarks = scratch.bMarks;
		this.eMarks = scratch.eMarks;
		this.tShift = scratch.tShift;
		this.sCount = scratch.sCount;
		this.bsCount = scratch.bsCount;
		this.bsCount.fill(0, 0, lines + 1);
		this.bMarks[lines] = len;
		this.eMarks[lines] = len;
		this.tShift[lines] = 0;
		this.sCount[lines] = 0;
		this.lineMax = lines;
		this.tape = scratch.tape;
	}

	/**
	 * Use the line index the caller wrote into the scratch (`lineScratch`), and compute the indents only
	 * from `index.from` down: no rule reads a line above the line a parse starts on.
	 */
	private adopt(index: LineIndex): void {
		const lines = index.lines;
		const src = this.src;
		const bm = scratch.bMarks;
		const em = scratch.eMarks;
		const ts = scratch.tShift;
		const sc = scratch.sCount;
		for (let L = index.from; L < lines; L++) {
			let pos = bm[L];
			const end = em[L];
			let offset = 0;
			for (; pos < end; pos++) {
				const ch = src.charCodeAt(pos);
				if (ch === 0x20) offset++;
				else if (ch === 0x09) offset += 4 - (offset % 4);
				else break;
			}
			ts[L] = pos - bm[L];
			sc[L] = offset;
		}
		bm[lines] = src.length;
		em[lines] = src.length;
		ts[lines] = 0;
		sc[lines] = 0;
		this.bMarks = bm;
		this.eMarks = em;
		this.tShift = ts;
		this.sCount = sc;
		this.bsCount = scratch.bsCount;
		this.bsCount.fill(0, index.from, lines + 1);
		this.lineMax = lines;
		this.tape = scratch.tape;
	}

	/**
	 * `pushK`, then the token's per-kind number. A separate call because `state.tape[state.pushK(…) * STRIDE + T_AUX]`
	 * reads `state.tape` BEFORE `pushK` runs, and a push that grows the tape replaces the array: the write then lands
	 * in the old one and is lost. It lost a comment block's mark, a fence's marker length and a heading's level, on
	 * whichever token a parse grew the shared scratch tape at (the first 10,050-item list in a process, say).
	 */
	pushAux(kind: number, nesting: number, l0: number, l1: number, aux: number): number {
		const i = this.pushK(kind, nesting, l0, l1);
		this.tape[i * STRIDE + T_AUX] = aux;
		return i;
	}

	pushK(kind: number, nesting: number, l0: number, l1: number): number {
		if ((this.n + 1) * STRIDE > this.tape.length) {
			const grown = new Int32Array(this.tape.length * 2);
			grown.set(this.tape);
			this.tape = scratch.tape = grown;
		}
		if (nesting < 0) this.level--;
		const at = this.n * STRIDE;
		const t = this.tape;
		t[at] = kind;
		t[at + 1] = this.level;
		t[at + 2] = nesting;
		t[at + 3] = l0;
		t[at + 4] = l1;
		t[at + 5] = 0;
		t[at + 6] = 0;
		if (nesting > 0) this.level++;
		return this.n++;
	}

	push(type: string, _tag: string, nesting: number): TokenHandle {
		return new Handle(this, this.pushK(this.p.kindOf(type), nesting, -1, -1));
	}

	/** The line's first character after its indent, as an index into the dispatch tables (128: other). */
	cls(line: number): number {
		const c = this.src.charCodeAt(this.bMarks[line] + this.tShift[line]);
		return c < 128 ? c : 128;
	}

	isEmpty(line: number): boolean {
		return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
	}

	skipEmptyLines(from: number): number {
		for (const max = this.lineMax; from < max; from++) {
			if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) break;
		}
		return from;
	}

	skipSpaces(pos: number): number {
		const s = this.src;
		for (const max = s.length; pos < max; pos++) if (!isSpace(s.charCodeAt(pos))) break;
		return pos;
	}

	skipSpacesBack(pos: number, min: number): number {
		if (pos <= min) return pos;
		while (pos > min) if (!isSpace(this.src.charCodeAt(--pos))) return pos + 1;
		return pos;
	}

	skipChars(pos: number, code: number): number {
		const s = this.src;
		for (const max = s.length; pos < max; pos++) if (s.charCodeAt(pos) !== code) break;
		return pos;
	}

	skipCharsBack(pos: number, code: number, min: number): number {
		if (pos <= min) return pos;
		while (pos > min) if (code !== this.src.charCodeAt(--pos)) return pos + 1;
		return pos;
	}
}

// ── Rules (markdown-it lib/rules_block/*.mjs; comments there) ───────────────────────────────────────

function getLine(state: State, line: number): string {
	return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function escapedSplitCount(str: string): { count: number; first: boolean; last: boolean } {
	// markdown-it's escapedSplit, reduced to what the table rule reads: how many columns, and whether the
	// first and last are empty. A column is "empty" exactly when its text is '' before trimming.
	let count = 1;
	let isEscaped = false;
	let lastPos = 0;
	let firstEmpty = false;
	let current = 0; // characters accumulated in the current column
	const max = str.length;
	for (let pos = 0; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 0x7c) {
			if (!isEscaped) {
				if (count === 1) firstEmpty = current + (pos - lastPos) === 0;
				count++;
				current = 0;
				lastPos = pos + 1;
			} else {
				current += pos - 1 - lastPos;
				lastPos = pos;
			}
		}
		isEscaped = ch === 0x5c;
	}
	const lastLen = current + (max - lastPos);
	if (count === 1) firstEmpty = lastLen === 0;
	return { count, first: firstEmpty, last: lastLen === 0 };
}

function trimmedColumns(str: string): number {
	const c = escapedSplitCount(str);
	let n = c.count;
	if (n && c.first) n--;
	if (n && c.last && !(c.count === 1 && c.first)) n--;
	return n;
}

const ALIGN_RE = /^:?-+:?$/;

function table(state: State, startLine: number, endLine: number, silent: boolean): boolean {
	if (startLine + 2 > endLine) return false;
	let nextLine = startLine + 1;
	if (state.sCount[nextLine] < state.blkIndent) return false;
	if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
	let pos = state.bMarks[nextLine] + state.tShift[nextLine];
	if (pos >= state.eMarks[nextLine]) return false;
	const src = state.src;
	const firstCh = src.charCodeAt(pos++);
	if (firstCh !== 0x7c && firstCh !== 0x2d && firstCh !== 0x3a) return false;
	if (pos >= state.eMarks[nextLine]) return false;
	const secondCh = src.charCodeAt(pos++);
	if (secondCh !== 0x7c && secondCh !== 0x2d && secondCh !== 0x3a && !isSpace(secondCh)) return false;
	if (firstCh === 0x2d && isSpace(secondCh)) return false;
	while (pos < state.eMarks[nextLine]) {
		const ch = src.charCodeAt(pos);
		if (ch !== 0x7c && ch !== 0x2d && ch !== 0x3a && !isSpace(ch)) return false;
		pos++;
	}
	let lineText = getLine(state, startLine + 1);
	const columns = lineText.split('|');
	const aligns: number[] = [];
	for (let i = 0; i < columns.length; i++) {
		const t = columns[i].trim();
		if (!t) {
			if (i === 0 || i === columns.length - 1) continue;
			return false;
		}
		if (!ALIGN_RE.test(t)) return false;
		if (t.charCodeAt(t.length - 1) === 0x3a) aligns.push(t.charCodeAt(0) === 0x3a ? 3 : 2);
		else if (t.charCodeAt(0) === 0x3a) aligns.push(1);
		else aligns.push(0);
	}
	lineText = getLine(state, startLine).trim();
	if (lineText.indexOf('|') === -1) return false;
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	const columnCount = trimmedColumns(lineText);
	if (columnCount === 0 || columnCount !== aligns.length) return false;
	if (silent) return true;

	const oldParentType = state.parentType;
	state.parentType = 'table';
	const terminatorRules = state.p.chain.blockquote;
	const tableTok = state.pushK(K_TABLE_OPEN, 1, startLine, 0);
	state.pushK(K_THEAD_OPEN, 1, startLine, startLine + 1);
	state.pushK(K_TR_OPEN, 1, startLine, startLine + 1);
	for (let i = 0; i < columnCount; i++) {
		state.pushAux(K_TH_OPEN, 1, -1, -1, aligns[i]);
		state.pushAux(K_INLINE, 0, -1, -1, i);
		state.pushK(K_TH_CLOSE, -1, -1, -1);
	}
	state.pushK(K_TR_CLOSE, -1, -1, -1);
	state.pushK(K_THEAD_CLOSE, -1, -1, -1);

	let tbodyTok = -1;
	let autocompletedCells = 0;
	for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
		if (state.sCount[nextLine] < state.blkIndent) break;
		const terminate = terminates(terminatorRules, state, nextLine, endLine);
		if (terminate) break;
		lineText = getLine(state, nextLine).trim();
		if (!lineText) break;
		if (state.sCount[nextLine] - state.blkIndent >= 4) break;
		autocompletedCells += columnCount - trimmedColumns(lineText);
		if (autocompletedCells > 0x10000) break;
		if (nextLine === startLine + 2) tbodyTok = state.pushK(K_TBODY_OPEN, 1, startLine + 2, 0);
		state.pushK(K_TR_OPEN, 1, nextLine, nextLine + 1);
		for (let i = 0; i < columnCount; i++) {
			state.pushAux(K_TD_OPEN, 1, -1, -1, aligns[i]);
			state.pushAux(K_INLINE, 0, -1, -1, i);
			state.pushK(K_TD_CLOSE, -1, -1, -1);
		}
		state.pushK(K_TR_CLOSE, -1, -1, -1);
	}
	if (tbodyTok >= 0) {
		state.pushK(K_TBODY_CLOSE, -1, -1, -1);
		state.tape[tbodyTok * STRIDE + T_L1] = nextLine;
	}
	state.pushK(K_TABLE_CLOSE, -1, -1, -1);
	state.tape[tableTok * STRIDE + T_L1] = nextLine;
	state.parentType = oldParentType;
	state.line = nextLine;
	return true;
}

function code(state: State, startLine: number, endLine: number): boolean {
	if (state.sCount[startLine] - state.blkIndent < 4) return false;
	let nextLine = startLine + 1;
	let last = nextLine;
	while (nextLine < endLine) {
		if (state.isEmpty(nextLine)) {
			nextLine++;
			continue;
		}
		if (state.sCount[nextLine] - state.blkIndent >= 4) {
			nextLine++;
			last = nextLine;
			continue;
		}
		break;
	}
	state.line = last;
	state.pushK(K_CODE_BLOCK, 0, startLine, state.line);
	return true;
}

function fence(state: State, startLine: number, endLine: number, silent: boolean): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	if (pos + 3 > max) return false;
	const src = state.src;
	const marker = src.charCodeAt(pos);
	if (marker !== 0x7e && marker !== 0x60) return false;
	let mem = pos;
	pos = state.skipChars(pos, marker);
	const len = pos - mem;
	if (len < 3) return false;
	const markerLen = len;
	if (marker === 0x60) {
		const tick = src.indexOf('`', pos);
		if (tick >= 0 && tick < max) return false;
	}
	if (silent) return true;
	let nextLine = startLine;
	let haveEndMarker = false;
	for (;;) {
		nextLine++;
		if (nextLine >= endLine) break;
		pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
		max = state.eMarks[nextLine];
		if (pos < max && state.sCount[nextLine] < state.blkIndent) break;
		if (src.charCodeAt(pos) !== marker) continue;
		if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
		pos = state.skipChars(pos, marker);
		if (pos - mem < len) continue;
		pos = state.skipSpaces(pos);
		if (pos < max) continue;
		haveEndMarker = true;
		break;
	}
	state.line = nextLine + (haveEndMarker ? 1 : 0);
	state.pushAux(K_FENCE, 0, startLine, state.line, markerLen);
	return true;
}

function blockquote(state: State, startLine: number, endLine: number, silent: boolean): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max: number;
	const oldLineMax = state.lineMax;
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	const src = state.src;
	if (src.charCodeAt(pos) !== 0x3e) return false;
	if (silent) return true;
	const oldBMarks: number[] = [];
	const oldBSCount: number[] = [];
	const oldSCount: number[] = [];
	const oldTShift: number[] = [];
	const terminatorRules = state.p.chain.blockquote;
	const oldParentType = state.parentType;
	state.parentType = 'blockquote';
	let lastLineEmpty = false;
	let nextLine: number;
	for (nextLine = startLine; nextLine < endLine; nextLine++) {
		const isOutdented = state.sCount[nextLine] < state.blkIndent;
		pos = state.bMarks[nextLine] + state.tShift[nextLine];
		max = state.eMarks[nextLine];
		if (pos >= max) break;
		if (src.charCodeAt(pos++) === 0x3e && !isOutdented) {
			let initial = state.sCount[nextLine] + 1;
			let spaceAfterMarker: boolean;
			let adjustTab: boolean | undefined;
			if (src.charCodeAt(pos) === 0x20) {
				pos++;
				initial++;
				adjustTab = false;
				spaceAfterMarker = true;
			} else if (src.charCodeAt(pos) === 0x09) {
				spaceAfterMarker = true;
				if ((state.bsCount[nextLine] + initial) % 4 === 3) {
					pos++;
					initial++;
					adjustTab = false;
				} else {
					adjustTab = true;
				}
			} else {
				spaceAfterMarker = false;
			}
			let offset = initial;
			oldBMarks.push(state.bMarks[nextLine]);
			state.bMarks[nextLine] = pos;
			while (pos < max) {
				const ch = src.charCodeAt(pos);
				if (isSpace(ch)) {
					if (ch === 0x09) offset += 4 - ((offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4);
					else offset++;
				} else break;
				pos++;
			}
			lastLineEmpty = pos >= max;
			oldBSCount.push(state.bsCount[nextLine]);
			state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
			oldSCount.push(state.sCount[nextLine]);
			state.sCount[nextLine] = offset - initial;
			oldTShift.push(state.tShift[nextLine]);
			state.tShift[nextLine] = pos - state.bMarks[nextLine];
			continue;
		}
		if (lastLineEmpty) break;
		const terminate = terminates(terminatorRules, state, nextLine, endLine);
		if (terminate) {
			state.lineMax = nextLine;
			if (state.blkIndent !== 0) {
				oldBMarks.push(state.bMarks[nextLine]);
				oldBSCount.push(state.bsCount[nextLine]);
				oldTShift.push(state.tShift[nextLine]);
				oldSCount.push(state.sCount[nextLine]);
				state.sCount[nextLine] -= state.blkIndent;
			}
			break;
		}
		oldBMarks.push(state.bMarks[nextLine]);
		oldBSCount.push(state.bsCount[nextLine]);
		oldTShift.push(state.tShift[nextLine]);
		oldSCount.push(state.sCount[nextLine]);
		state.sCount[nextLine] = -1;
	}
	const oldIndent = state.blkIndent;
	state.blkIndent = 0;
	const open = state.pushK(K_BLOCKQUOTE_OPEN, 1, startLine, 0);
	state.p.tokenize(state, startLine, nextLine);
	state.pushK(K_BLOCKQUOTE_CLOSE, -1, -1, -1);
	state.lineMax = oldLineMax;
	state.parentType = oldParentType;
	state.tape[open * STRIDE + T_L1] = state.line;
	for (let i = 0; i < oldTShift.length; i++) {
		state.bMarks[i + startLine] = oldBMarks[i];
		state.tShift[i + startLine] = oldTShift[i];
		state.sCount[i + startLine] = oldSCount[i];
		state.bsCount[i + startLine] = oldBSCount[i];
	}
	state.blkIndent = oldIndent;
	return true;
}

function hr(state: State, startLine: number, _endLine: number, silent: boolean): boolean {
	const max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	const src = state.src;
	const marker = src.charCodeAt(pos++);
	if (marker !== 0x2a && marker !== 0x2d && marker !== 0x5f) return false;
	let cnt = 1;
	while (pos < max) {
		const ch = src.charCodeAt(pos++);
		if (ch !== marker && !isSpace(ch)) return false;
		if (ch === marker) cnt++;
	}
	if (cnt < 3) return false;
	if (silent) return true;
	state.line = startLine + 1;
	state.pushAux(K_HR, 0, startLine, state.line, marker);
	return true;
}

function skipBulletListMarker(state: State, startLine: number): number {
	const max = state.eMarks[startLine];
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	const marker = state.src.charCodeAt(pos++);
	if (marker !== 0x2a && marker !== 0x2d && marker !== 0x2b) return -1;
	if (pos < max && !isSpace(state.src.charCodeAt(pos))) return -1;
	return pos;
}

function skipOrderedListMarker(state: State, startLine: number): number {
	const start = state.bMarks[startLine] + state.tShift[startLine];
	const max = state.eMarks[startLine];
	let pos = start;
	if (pos + 1 >= max) return -1;
	const src = state.src;
	let ch = src.charCodeAt(pos++);
	if (ch < 0x30 || ch > 0x39) return -1;
	for (;;) {
		if (pos >= max) return -1;
		ch = src.charCodeAt(pos++);
		if (ch >= 0x30 && ch <= 0x39) {
			if (pos - start >= 10) return -1;
			continue;
		}
		if (ch === 0x29 || ch === 0x2e) break;
		return -1;
	}
	if (pos < max && !isSpace(src.charCodeAt(pos))) return -1;
	return pos;
}

function markTightParagraphs(state: State, idx: number): void {
	const level = state.level + 2;
	const t = state.tape;
	for (let i = idx + 2, l = state.n - 2; i < l; i++) {
		if (t[i * STRIDE + T_LEVEL] === level && t[i * STRIDE + T_KIND] === K_PARAGRAPH_OPEN) {
			t[(i + 2) * STRIDE + T_FLAGS] |= F_HIDDEN;
			t[i * STRIDE + T_FLAGS] |= F_HIDDEN;
			i += 2;
		}
	}
}

function list(state: State, startLine: number, endLine: number, silent: boolean): boolean {
	let max: number;
	let pos: number;
	let start = 0;
	let nextLine = startLine;
	let tight = true;
	if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
	if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) return false;
	let isTerminatingParagraph = false;
	if (silent && state.parentType === 'paragraph') {
		if (state.sCount[nextLine] >= state.blkIndent) isTerminatingParagraph = true;
	}
	let isOrdered: boolean;
	let markerValue = 0;
	let posAfterMarker: number;
	const src = state.src;
	if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
		isOrdered = true;
		start = state.bMarks[nextLine] + state.tShift[nextLine];
		markerValue = Number(src.slice(start, posAfterMarker - 1));
		if (isTerminatingParagraph && markerValue !== 1) return false;
	} else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) {
		isOrdered = false;
	} else {
		return false;
	}
	if (isTerminatingParagraph) {
		if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
	}
	if (silent) return true;
	const markerCharCode = src.charCodeAt(posAfterMarker - 1);
	const listTokIdx = state.n;
	const listTok = state.pushK(isOrdered ? K_ORDERED_LIST_OPEN : K_BULLET_LIST_OPEN, 1, nextLine, 0);
	// markdown-it writes a `start` attribute only when the number is not 1; the tape keeps the number.
	if (isOrdered) state.tape[listTok * STRIDE + T_AUX] = markerValue;
	let prevEmptyEnd = false;
	const terminatorRules = state.p.chain.list;
	const oldParentType = state.parentType;
	state.parentType = 'list';
	while (nextLine < endLine) {
		pos = posAfterMarker;
		max = state.eMarks[nextLine];
		const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
		let offset = initial;
		while (pos < max) {
			const ch = src.charCodeAt(pos);
			if (ch === 0x09) offset += 4 - ((offset + state.bsCount[nextLine]) % 4);
			else if (ch === 0x20) offset++;
			else break;
			pos++;
		}
		const contentStart = pos;
		let indentAfterMarker: number;
		if (contentStart >= max) indentAfterMarker = 1;
		else indentAfterMarker = offset - initial;
		if (indentAfterMarker > 4) indentAfterMarker = 1;
		const indent = initial + indentAfterMarker;
		const itemTok = state.pushK(K_LIST_ITEM_OPEN, 1, nextLine, 0);
		const oldTight = state.tight;
		const oldTShift = state.tShift[nextLine];
		const oldSCount = state.sCount[nextLine];
		const oldListIndent = state.listIndent;
		state.listIndent = state.blkIndent;
		state.blkIndent = indent;
		state.tight = true;
		state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
		state.sCount[nextLine] = offset;
		if (contentStart >= max && state.isEmpty(nextLine + 1)) {
			state.line = Math.min(state.line + 2, endLine);
		} else {
			state.p.tokenize(state, nextLine, endLine);
		}
		if (!state.tight || prevEmptyEnd) tight = false;
		prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
		state.blkIndent = state.listIndent;
		state.listIndent = oldListIndent;
		state.tShift[nextLine] = oldTShift;
		state.sCount[nextLine] = oldSCount;
		state.tight = oldTight;
		state.pushK(K_LIST_ITEM_CLOSE, -1, -1, -1);
		nextLine = state.line;
		state.tape[itemTok * STRIDE + T_L1] = nextLine;
		if (nextLine >= endLine) break;
		if (state.sCount[nextLine] < state.blkIndent) break;
		if (state.sCount[nextLine] - state.blkIndent >= 4) break;
		const terminate = terminates(terminatorRules, state, nextLine, endLine);
		if (terminate) break;
		if (isOrdered) {
			posAfterMarker = skipOrderedListMarker(state, nextLine);
			if (posAfterMarker < 0) break;
		} else {
			posAfterMarker = skipBulletListMarker(state, nextLine);
			if (posAfterMarker < 0) break;
		}
		if (markerCharCode !== src.charCodeAt(posAfterMarker - 1)) break;
	}
	state.pushK(isOrdered ? K_ORDERED_LIST_CLOSE : K_BULLET_LIST_CLOSE, -1, -1, -1);
	state.tape[listTok * STRIDE + T_L1] = nextLine;
	state.line = nextLine;
	state.parentType = oldParentType;
	if (tight) markTightParagraphs(state, listTokIdx);
	return true;
}

function reference(state: State, startLine: number, _endLine: number, silent: boolean): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	let nextLine = startLine + 1;
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	if (state.src.charCodeAt(pos) !== 0x5b) return false;

	function getNextLine(nl: number): string | null {
		const endLine = state.lineMax;
		if (nl >= endLine || state.isEmpty(nl)) return null;
		let isContinuation = false;
		if (state.sCount[nl] - state.blkIndent > 3) isContinuation = true;
		if (state.sCount[nl] < 0) isContinuation = true;
		if (!isContinuation) {
			const terminatorRules = state.p.chain.reference;
			const oldParentType = state.parentType;
			state.parentType = 'reference';
			const terminate = terminates(terminatorRules, state, nl, endLine);
			state.parentType = oldParentType;
			if (terminate) return null;
		}
		const p = state.bMarks[nl] + state.tShift[nl];
		const m = state.eMarks[nl];
		return state.src.slice(p, m + 1);
	}

	let str = state.src.slice(pos, max + 1);
	max = str.length;
	let labelEnd = -1;
	for (pos = 1; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 0x5b) {
			return false;
		} else if (ch === 0x5d) {
			labelEnd = pos;
			break;
		} else if (ch === 0x0a) {
			const lineContent = getNextLine(nextLine);
			if (lineContent !== null) {
				str += lineContent;
				max = str.length;
				nextLine++;
			}
		} else if (ch === 0x5c) {
			pos++;
			if (pos < max && str.charCodeAt(pos) === 0x0a) {
				const lineContent = getNextLine(nextLine);
				if (lineContent !== null) {
					str += lineContent;
					max = str.length;
					nextLine++;
				}
			}
		}
	}
	if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 0x3a) return false;
	for (pos = labelEnd + 2; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 0x0a) {
			const lineContent = getNextLine(nextLine);
			if (lineContent !== null) {
				str += lineContent;
				max = str.length;
				nextLine++;
			}
		} else if (isSpace(ch)) {
			/* skip */
		} else break;
	}
	const destRes = parseLinkDestination(str, pos, max);
	if (!destRes.ok) return false;
	const linkOk = state.p.linkOk;
	if (!(destRes.raw.indexOf('&') >= 0 && linkOk ? linkOk(destRes.raw) : defaultLinkOk(destRes.raw))) return false;
	pos = destRes.pos;
	const destEndPos = pos;
	const destEndLineNo = nextLine;
	const start = pos;
	for (; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 0x0a) {
			const lineContent = getNextLine(nextLine);
			if (lineContent !== null) {
				str += lineContent;
				max = str.length;
				nextLine++;
			}
		} else if (isSpace(ch)) {
			/* skip */
		} else break;
	}
	let titleRes = parseLinkTitle(str, pos, max);
	while (titleRes.can_continue) {
		const lineContent = getNextLine(nextLine);
		if (lineContent === null) break;
		str += lineContent;
		pos = max;
		max = str.length;
		nextLine++;
		titleRes = parseLinkTitle(str, pos, max, titleRes);
	}
	let title: boolean;
	if (pos < max && start !== pos && titleRes.ok) {
		title = titleRes.nonEmpty;
		pos = titleRes.pos;
	} else {
		title = false;
		pos = destEndPos;
		nextLine = destEndLineNo;
	}
	while (pos < max) {
		if (!isSpace(str.charCodeAt(pos))) break;
		pos++;
	}
	if (pos < max && str.charCodeAt(pos) !== 0x0a) {
		if (title) {
			pos = destEndPos;
			nextLine = destEndLineNo;
			while (pos < max) {
				if (!isSpace(str.charCodeAt(pos))) break;
				pos++;
			}
		}
	}
	if (pos < max && str.charCodeAt(pos) !== 0x0a) return false;
	// markdown-it's normalizeReference(label) is empty exactly when the label is all whitespace.
	if (!/\S/.test(str.slice(1, labelEnd))) return false;
	if (silent) return true;
	state.line = nextLine;
	return true;
}

function htmlBlock(state: State, startLine: number, endLine: number, silent: boolean): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	if (state.src.charCodeAt(pos) !== 0x3c) return false;
	const src = state.src;
	// The comment opener, which is most of a deck's HTML (every directive), decided without a slice or a
	// regular expression: `<!--` cannot match sequence 0 (a letter must follow `<`), so it is sequence 1,
	// and that sequence ends on the first line holding `-->`.
	if (src.charCodeAt(pos + 1) === 0x21 && src.charCodeAt(pos + 2) === 0x2d && src.charCodeAt(pos + 3) === 0x2d && pos + 3 < max) {
		if (silent) return true;
		let nextLine = startLine + 1;
		// The next `-->` at or after a position, found once and reused until passed, so a long unclosed
		// comment costs one scan, not one per line.
		let close = state.nextClose(pos);
		if (close < 0 || close >= max) {
			for (; nextLine < endLine; nextLine++) {
				if (state.sCount[nextLine] < state.blkIndent) break;
				const p = state.bMarks[nextLine] + state.tShift[nextLine];
				if (close >= 0 && close < p) close = state.nextClose(p);
				if (close < 0) continue;
				if (close < state.eMarks[nextLine]) {
					nextLine++;
					break;
				}
			}
		}
		state.line = nextLine;
		state.pushAux(K_HTML_BLOCK, 0, startLine, nextLine, 1);
		return true;
	}
	let lineText = src.slice(pos, max);
	let i = 0;
	for (; i < HTML_SEQUENCES.length; i++) if (HTML_SEQUENCES[i][0].test(lineText)) break;
	if (i === HTML_SEQUENCES.length) return false;
	if (silent) return HTML_SEQUENCES[i][2];
	let nextLine = startLine + 1;
	if (!HTML_SEQUENCES[i][1].test(lineText)) {
		for (; nextLine < endLine; nextLine++) {
			if (state.sCount[nextLine] < state.blkIndent) break;
			pos = state.bMarks[nextLine] + state.tShift[nextLine];
			max = state.eMarks[nextLine];
			lineText = state.src.slice(pos, max);
			if (HTML_SEQUENCES[i][1].test(lineText)) {
				if (lineText.length !== 0) nextLine++;
				break;
			}
		}
	}
	state.line = nextLine;
	state.pushAux(K_HTML_BLOCK, 0, startLine, nextLine, i);
	return true;
}

function heading(state: State, startLine: number, _endLine: number, silent: boolean): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	const max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	const src = state.src;
	let ch = src.charCodeAt(pos);
	if (ch !== 0x23 || pos >= max) return false;
	let level = 1;
	ch = src.charCodeAt(++pos);
	while (ch === 0x23 && pos < max && level <= 6) {
		level++;
		ch = src.charCodeAt(++pos);
	}
	if (level > 6 || (pos < max && !isSpace(ch))) return false;
	if (silent) return true;
	state.line = startLine + 1;
	state.pushAux(K_HEADING_OPEN, 1, startLine, state.line, level);
	state.pushK(K_INLINE, 0, startLine, state.line);
	state.pushK(K_HEADING_CLOSE, -1, -1, -1);
	return true;
}

function lheading(state: State, startLine: number, endLine: number): boolean {
	const terminatorRules = state.p.chain.paragraph;
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	const oldParentType = state.parentType;
	state.parentType = 'paragraph';
	let level = 0;
	let nextLine = startLine + 1;
	const src = state.src;
	for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
		if (state.sCount[nextLine] - state.blkIndent > 3) continue;
		if (state.sCount[nextLine] >= state.blkIndent) {
			let pos = state.bMarks[nextLine] + state.tShift[nextLine];
			const max = state.eMarks[nextLine];
			if (pos < max) {
				const marker = src.charCodeAt(pos);
				if (marker === 0x2d || marker === 0x3d) {
					pos = state.skipChars(pos, marker);
					pos = state.skipSpaces(pos);
					if (pos >= max) {
						level = marker === 0x3d ? 1 : 2;
						break;
					}
				}
			}
		}
		if (state.sCount[nextLine] < 0) continue;
		const terminate = terminates(terminatorRules, state, nextLine, endLine);
		if (terminate) break;
	}
	// markdown-it does NOT restore parentType on this path, and the paragraph rule that runs next saves the
	// stale 'paragraph' and restores it. Kept as markdown-it has it: parity is the contract, not tidiness.
	if (!level) return false;
	state.line = nextLine + 1;
	state.pushAux(K_HEADING_OPEN, 1, startLine, state.line, level + 8);
	state.pushK(K_INLINE, 0, startLine, state.line - 1);
	state.pushK(K_HEADING_CLOSE, -1, -1, -1);
	state.parentType = oldParentType;
	return true;
}

function paragraph(state: State, startLine: number, endLine: number): boolean {
	const terminatorRules = state.p.chain.paragraph;
	const oldParentType = state.parentType;
	let nextLine = startLine + 1;
	state.parentType = 'paragraph';
	for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
		if (state.sCount[nextLine] - state.blkIndent > 3) continue;
		if (state.sCount[nextLine] < 0) continue;
		const terminate = terminates(terminatorRules, state, nextLine, endLine);
		if (terminate) break;
	}
	state.line = nextLine;
	state.pushK(K_PARAGRAPH_OPEN, 1, startLine, state.line);
	state.pushK(K_INLINE, 0, startLine, state.line);
	state.pushK(K_PARAGRAPH_CLOSE, -1, -1, -1);
	state.parentType = oldParentType;
	return true;
}

/** The characters each core rule can open on; a rule absent here can open on any line. */
const CORE_STARTS: Record<string, string> = {
	fence: '`~',
	blockquote: '>',
	hr: '*-_',
	list: '*-+0123456789',
	reference: '[',
	html_block: '<',
	heading: '#',
};

function terminates(chain: Rule[][], state: State, line: number, endLine: number): boolean {
	const rules = chain[state.cls(line)];
	for (let i = 0, l = rules.length; i < l; i++) if (rules[i](state, line, endLine, true)) return true;
	return false;
}

const CORE_RULES: [string, Rule, string[]][] = [
	['table', table, ['paragraph', 'reference']],
	['code', code, []],
	['fence', fence, ['paragraph', 'reference', 'blockquote', 'list']],
	['blockquote', blockquote, ['paragraph', 'reference', 'blockquote', 'list']],
	['hr', hr, ['paragraph', 'reference', 'blockquote', 'list']],
	['list', list, ['paragraph', 'reference', 'blockquote']],
	['reference', reference, []],
	['html_block', htmlBlock, ['paragraph', 'reference', 'blockquote']],
	['heading', heading, ['paragraph', 'reference', 'blockquote']],
	['lheading', lheading, []],
	['paragraph', paragraph, []],
];

/** A configured block parser. Stateless between parses; build one per configuration and reuse it. */
export class BlockParser {
	readonly kinds: string[] = [...CORE_KINDS];
	readonly ruleNames: readonly string[];
	readonly rules: Rule[];
	readonly chain: { paragraph: Rule[][]; reference: Rule[][]; blockquote: Rule[][]; list: Rule[][] };
	/** The main chain by the line's first character (`State.cls`): only the rules that can open there. */
	readonly byChar: Rule[][];
	readonly linkOk?: (raw: string) => boolean;
	private readonly kindIds = new Map<string, number>(CORE_KINDS.map((k, i) => [k, i]));

	constructor(opts: BlockParserOptions = {}) {
		const html = opts.html !== false;
		const withTable = opts.table !== false;
		const list: [string, Rule, readonly string[]][] = CORE_RULES.filter(([n]) => (n !== 'table' || withTable) && (n !== 'html_block' || html));
		for (const extra of opts.rules ?? []) {
			const anchor = extra.after ?? extra.before ?? 'fence';
			let at = list.findIndex(([n]) => n === anchor);
			if (at < 0) throw new Error(`segno-markdown: no block rule "${anchor}" to install "${extra.name}" ${extra.after ? 'after' : 'before'}`);
			if (extra.after) at++;
			const raw = extra.rule as unknown as Rule;
			const fn: Rule = extra.scansAhead
				? (st, line, end, silent) => {
						st.forward.push(line);
						return raw(st, line, end, silent);
					}
				: raw;
			list.splice(at, 0, [extra.name, fn, extra.alt ?? []]);
		}
		this.ruleNames = list.map(([n]) => n);
		this.rules = list.map(([, r]) => r);
		// Dispatch by first character: a rule whose opening character the line does not start with would
		// return false on its first test, so leaving it out of that character's list changes no answer.
		const starts = new Map<string, string | null>(list.map(([n]) => [n, CORE_STARTS[n] ?? null]));
		for (const extra of opts.rules ?? []) starts.set(extra.name, extra.triggers || null);
		const dispatch = (entries: [string, Rule, readonly string[]][]): Rule[][] => {
			const out: Rule[][] = [];
			for (let c = 0; c <= 128; c++) {
				const ch = c < 128 ? String.fromCharCode(c) : null;
				out.push(entries.filter(([n]) => {
					const st = starts.get(n);
					if (st == null) return true;
					// Bucket 128 holds every line that opens with a character above ASCII, so a rule with any such
					// trigger is tried on all of them and decides for itself.
					if (ch === null) return [...st].some((t) => t.charCodeAt(0) >= 128);
					return st.includes(ch);
				}).map(([, r]) => r));
			}
			return out;
		};
		this.byChar = dispatch(list);
		const chainOf = (name: string) => dispatch(list.filter(([, , alt]) => alt.includes(name)));
		this.chain = { paragraph: chainOf('paragraph'), reference: chainOf('reference'), blockquote: chainOf('blockquote'), list: chainOf('list') };
		this.linkOk = opts.linkOk;
	}

	/** The tape id of a token type, adding a plugin's type the first time it is pushed. */
	kindOf(type: string): number {
		let id = this.kindIds.get(type);
		if (id === undefined) {
			id = this.kinds.length;
			this.kinds.push(type);
			this.kindIds.set(type, id);
		}
		return id;
	}

	/** markdown-it's ParserBlock#tokenize. */
	tokenize(state: State, startLine: number, endLine: number): void {
		const byChar = this.byChar;
		let line = startLine;
		let hasEmptyLines = false;
		while (line < endLine) {
			state.line = line = state.skipEmptyLines(line);
			if (line >= endLine) break;
			if (state.sCount[line] < state.blkIndent) break;
			if (state.level >= MAX_NESTING) {
				state.line = endLine;
				break;
			}
			const prevLine = state.line;
			let ok = false;
			const rules = byChar[state.cls(line)];
			for (let i = 0, len = rules.length; i < len; i++) {
				ok = rules[i](state, line, endLine, false);
				if (ok) {
					if (prevLine >= state.line) throw new Error("segno-markdown: block rule didn't increment state.line");
					break;
				}
			}
			if (!ok) throw new Error('segno-markdown: none of the block rules matched');
			if (state.stop !== null && state.level === 0) {
				const at = (state.n - 1) * STRIDE;
				if (state.tape[at] === K_HR && state.tape[at + T_LEVEL] === 0 && state.stop(state.tape[at + T_L0])) {
					state.stopped = true;
					break;
				}
			}
			state.tight = !hasEmptyLines;
			if (state.isEmpty(state.line - 1)) hasEmptyLines = true;
			line = state.line;
			if (line < endLine && state.isEmpty(line)) {
				hasEmptyLines = true;
				line++;
				state.line = line;
			}
		}
	}

	/**
	 * The block structure of `src`, which must already be normalized (S0: no BOM, `\n` line ends), as
	 * markdown-it's `md.block.parse` would tokenize it. `startLine` begins the parse part-way down, which
	 * is exact at a line where every container is closed (just after a top-level thematic break).
	 */
	parse(src: string, startLine = 0): BlockTape {
		const state = new State(src, this);
		if (src) this.tokenize(state, startLine, state.lineMax);
		const n = state.lineMax + 1;
		return { src, kinds: this.kinds, tape: state.tape.slice(0, state.n * STRIDE), length: state.n, lines: state.lineMax, bMarks: state.bMarks.slice(0, n), eMarks: state.eMarks.slice(0, n), side: state.side, forward: state.forward };
	}

	/**
	 * The incremental door. The caller writes the line index into `lineScratch(lines)` (every line from
	 * `from` down; lines above it are never read), then this parses `src` from `from`, stopping after the
	 * first top-level thematic break for which `stop(line)` is true. Returns the tokens parsed and whether
	 * it stopped (false: it ran to the end of the input). The scratch index is left as the parse found it,
	 * so the caller can copy the lines it needs out of it.
	 */
	parseFrom(src: string, lines: number, from: number, stop: (line: number) => boolean): { tape: Int32Array; length: number; stopped: boolean; side: BlockTape['side']; forward: readonly number[] } {
		const state = new State(src, this, { bMarks: scratch.bMarks, eMarks: scratch.eMarks, lines, from });
		state.stop = stop;
		if (src) this.tokenize(state, from, state.lineMax);
		return { tape: state.tape.slice(0, state.n * STRIDE), length: state.n, stopped: state.stopped, side: state.side, forward: state.forward };
	}
}
