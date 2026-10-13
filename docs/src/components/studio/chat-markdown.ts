// Studio Architect chat — a tiny, XSS-safe Markdown renderer that SEGMENTS a reply
// into prose runs and fenced code blocks.
//
// The Architect (cloud tier) replies in Markdown — **bold**, lists, `code`, fenced
// blocks — and authors must see it rendered, not raw. Safety model (chat bubbles are
// NOT under HARD RULE #22, which gates srcdoc preview-frame builders; the guarantee
// here is our own): PROSE is HTML-escaped FIRST (no model tag can execute), then a
// fixed set of safe tags is layered on the escaped text; links are scheme-checked.
// CODE is returned as raw strings in `code` segments — never turned into HTML here —
// so the React `ChatCodeBlock` renders each token as an escaped text child (React
// escapes), and the Copy button lives OUTSIDE any sanitized string. The consumer runs
// the prose HTML through DOMPurify as defense-in-depth.
//
// Two fence markers are supported: ``` and ~~~ . A block opened with one marker closes
// only on a line of the SAME marker, at least as long, carrying no info-string — the
// CommonMark rule, so ``` can appear literally inside a ~~~ block and vice-versa.
// `lattice-edit` protocol blocks (architect-edits.js) are DROPPED from the rendered
// stream whatever marker wraps them — they surface as reviewable diff cards, never as
// visible code. (This scanner had the fence semantics right all along; the EDIT parser
// next door did not, which is what let a ```mermaid payload close its own wrapper. The
// protocol now specifies ~~~ for the wrapper — see architect-edits.js EDIT_PROTOCOL.)
//
// Pure + fs-free, so it is fully unit-tested.

export type ChatSegment = { type: 'html'; html: string } | { type: 'code'; lang: string; code: string };

export function escapeHtml(s: string): string {
	return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

// Allow http(s)/mailto and relative (#, /) links; reject everything else
// (javascript:, data:, …). Input is already HTML-escaped.
function safeUrl(u: string): string | null {
	const t = u.trim();
	if (/^(https?:|mailto:)/i.test(t)) return t;
	if (/^[#/]/.test(t)) return t;
	return null;
}

// Inline spans on an already-escaped line. Inline code is protected first (behind a
// §N§ sentinel that cannot arise from escaping) so its contents aren't re-formatted,
// then restored — a bare-number placeholder would collide with digits in prose.
function inline(text: string): string {
	const codes: string[] = [];
	let s = text.replace(/`([^`]+)`/g, (_, c) => {
		codes.push(c);
		return `§${codes.length - 1}§`;
	});
	s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
		const safe = safeUrl(url);
		return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : m;
	});
	s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
	s = s.replace(/§(\d+)§/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
	return s;
}

// A fence opener: `marker` is '`' or '~', `len` its run length, `info` the trailing
// info-string (language). Returns null for a non-fence line.
function fenceOpen(line: string): { marker: string; len: number; info: string } | null {
	const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
	if (!m) return null;
	return { marker: m[1][0], len: m[1].length, info: m[2].trim() };
}
// A line closes an OPEN fence iff it is the same marker char, run length >= the
// opener's, and carries no info-string.
function isFenceClose(line: string, open: { marker: string; len: number }): boolean {
	const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
	if (!m) return false;
	return m[1][0] === open.marker && m[1].length >= open.len;
}

const isHeading = (l: string) => /^#{1,6}\s+/.test(l);
// A horizontal rule is three or more of one marker. Tested BEFORE list items: `* * *` and
// `- - -` look like an item to `isItem`.
const isRule = (l: string) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
const isItem = (l: string) => !isRule(l) && (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l));
// Prose is escaped BEFORE it is parsed, so a quote marker arrives as `&gt;`.
const isQuote = (l: string) => /^\s{0,3}&gt;/.test(l);
// A table separator row: `| --- | :-: |`. At least one `-` per cell, cells split by pipes.
const isTableSep = (l: string) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string): string[] => {
	// An escaped pipe stays inside its cell; swap it for a sentinel while splitting.
	const t = l.trim().replace(/\\\|/g, '\uE000').replace(/^\|/, '').replace(/\|$/, '');
	return t.split('|').map((c) => c.trim().split('\uE000').join('|'));
};
const isTableStart = (lines: string[], i: number) => i + 1 < lines.length && lines[i].includes('|') && isTableSep(lines[i + 1]) && splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
// Anything that begins a block of its own ends a paragraph.
const startsBlock = (lines: string[], i: number) => isHeading(lines[i]) || isItem(lines[i]) || isRule(lines[i]) || isQuote(lines[i]) || !!fenceOpen(lines[i]) || isTableStart(lines, i);
const indentOf = (l: string) => (/^\s*/.exec(l)?.[0] ?? '').replace(/\t/g, '    ').length;

// The language token surfaced as a code-block label. Derived from the info-string
// AFTER escaping (never from raw model source — R7), first word only.
function langLabel(info: string): string {
	return escapeHtml(info).split(/\s+/)[0] || '';
}

// Render a run of prose (no fences) to safe HTML: escape everything, then layer
// headings / lists / tables / quotes / paragraphs / inline spans on the escaped text.
/** Every line ending a reply can carry, as one: CRLF, a lone CR, and the Unicode line and paragraph
 *  separators. `.` in the item regex matches none of them, so a list line ending in one used to match
 *  `isItem` but not the item regex and the list loop never advanced (a frozen tab on a model that emits
 *  CRLF). Normalized at both entry points so no later stage sees a line break it does not split on. */
const normalizeEol = (s: string): string => s.replace(/\r\n?|\u2028|\u2029/g, '\n');

/** Quote nesting past this renders as plain text: each level recurses, and a line of thousands of `>`
 *  overflowed the stack. */
const MAX_QUOTE_DEPTH = 8;

export function renderProse(md: string): string {
	return renderBlocks(escapeHtml(normalizeEol(md)).split('\n'), 0);
}

type ListItem = { indent: number; tag: 'ul' | 'ol'; num: number; paras: string[][] };
type OpenList = { indent: number; tag: 'ul' | 'ol'; start: number; lis: string[] };

// Render the items of ONE list block, nested by indent. A `<li>` stays open until its list
// closes so a deeper list can be appended to it.
function renderList(items: ListItem[]): string {
	const stack: OpenList[] = [];
	let out = '';
	const liHtml = (it: ListItem) => it.paras.map((p, k) => (k === 0 ? p.map(inline).join('<br>') : `<div class="cm-md-li-p">${p.map(inline).join('<br>')}</div>`)).join('');
	const close = () => {
		const l = stack.pop() as OpenList;
		const start = l.tag === 'ol' && l.start !== 1 ? ` start="${l.start}"` : '';
		const html = `<${l.tag} class="cm-md-list"${start}>${l.lis.map((x) => `<li>${x}</li>`).join('')}</${l.tag}>`;
		if (stack.length) stack[stack.length - 1].lis[stack[stack.length - 1].lis.length - 1] += html;
		else out += html;
	};
	for (const it of items) {
		while (stack.length && it.indent < stack[stack.length - 1].indent) close();
		const top = stack[stack.length - 1];
		if (top && it.indent === top.indent && it.tag !== top.tag) close();
		const cur = stack[stack.length - 1];
		if (!cur || it.indent > cur.indent) stack.push({ indent: it.indent, tag: it.tag, start: it.num, lis: [liHtml(it)] });
		else cur.lis.push(liHtml(it));
	}
	while (stack.length) close();
	return out;
}

// Already-escaped lines in, HTML out. Recursive only for a quote's body.
function renderBlocks(lines: string[], depth: number): string {
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.trim() === '') {
			i++;
			continue;
		}
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			out.push(`<div class="cm-md-h cm-md-h${h[1].length}">${inline(h[2])}</div>`);
			i++;
			continue;
		}
		if (isRule(line)) {
			out.push('<hr class="cm-md-hr">');
			i++;
			continue;
		}
		if (isQuote(line) && depth < MAX_QUOTE_DEPTH) {
			const body: string[] = [];
			while (i < lines.length && isQuote(lines[i])) {
				body.push(lines[i].replace(/^\s{0,3}&gt;\s?/, ''));
				i++;
			}
			out.push(`<blockquote class="cm-md-quote">${renderBlocks(body, depth + 1)}</blockquote>`);
			continue;
		}
		if (isTableStart(lines, i)) {
			const head = splitRow(lines[i]);
			const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : ''));
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|') && !startsBlock(lines, i)) {
				rows.push(splitRow(lines[i]));
				i++;
			}
			const cell = (tag: 'th' | 'td', text: string, k: number) => `<${tag}${align[k] ? ` class="cm-al-${align[k]}"` : ''}>${inline(text ?? '')}</${tag}>`;
			out.push(
				`<div class="cm-md-table-wrap"><table class="cm-md-table"><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead>` +
					`<tbody>${rows.map((r) => `<tr>${head.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`,
			);
			continue;
		}
		if (isItem(line)) {
			// ONE list per run of items. A blank line does not end a list when another item (or an
			// indented continuation) follows it: models separate loose items with blank lines, and
			// closing the list there restarted every numbered item at 1.
			const items: ListItem[] = [];
			while (i < lines.length) {
				const l = lines[i];
				const m = /^(\s*)([-*]|(\d+)[.)])\s+(.*)$/.exec(l);
				if (m && !isRule(l)) {
					items.push({ indent: indentOf(m[1]), tag: m[3] !== undefined ? 'ol' : 'ul', num: m[3] !== undefined ? Number(m[3]) : 1, paras: [[m[4]]] });
					i++;
					continue;
				}
				if (l.trim() === '') {
					let j = i;
					while (j < lines.length && lines[j].trim() === '') j++;
					if (j < lines.length && isItem(lines[j])) {
						i = j;
						continue;
					}
					// An indented line after a blank is a new paragraph INSIDE the last item.
					if (j < lines.length && indentOf(lines[j]) >= 2 && !startsBlock(lines, j)) {
						items[items.length - 1].paras.push([lines[j].trim()]);
						i = j + 1;
						continue;
					}
					break;
				}
				if (startsBlock(lines, i)) break;
				// A lazy continuation line of the current item's paragraph.
				const last = items[items.length - 1];
				last.paras[last.paras.length - 1].push(l.trim());
				i++;
			}
			// A line `isItem` accepted but the item pattern did not leaves no items: never loop on it.
			if (!items.length) {
				out.push(`<p>${inline(line)}</p>`);
				i++;
				continue;
			}
			out.push(renderList(items));
			continue;
		}
		const para = [line];
		i++;
		while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i)) {
			para.push(lines[i]);
			i++;
		}
		out.push(`<p>${para.map(inline).join('<br>')}</p>`);
	}
	return out.join('');
}

// Split a reply into ordered prose/code segments. Edit-protocol blocks
// (`lattice-edit …`) are dropped — they become diff cards, never visible code.
export function renderMessageSegments(md: string): ChatSegment[] {
	const lines = normalizeEol(String(md || '')).split('\n');
	const segs: ChatSegment[] = [];
	let prose: string[] = [];
	const flushProse = () => {
		if (prose.length && prose.join('\n').trim()) segs.push({ type: 'html', html: renderProse(prose.join('\n')) });
		prose = [];
	};
	let i = 0;
	while (i < lines.length) {
		const open = fenceOpen(lines[i]);
		if (open) {
			flushProse();
			const lang = langLabel(open.info);
			const body: string[] = [];
			i++;
			while (i < lines.length && !isFenceClose(lines[i], open)) {
				body.push(lines[i]);
				i++;
			}
			i++; // consume the closing fence (if present)
			// Drop the edit protocol — it is rendered as a reviewable diff, not code.
			if (!/^lattice-edit\b/.test(open.info)) segs.push({ type: 'code', lang, code: body.join('\n') });
			continue;
		}
		prose.push(lines[i]);
		i++;
	}
	flushProse();
	return segs;
}

// Streaming-safe: hold back the trailing incomplete construct so a half-typed fence,
// inline-code, or link never flickers, then segment. The FINAL render uses
// renderMessageSegments on the complete text, so the end state is always exact.
export function renderMessageSegmentsStreaming(md: string): ChatSegment[] {
	return renderMessageSegments(clampStreaming(String(md || '')));
}

// Trim the trailing incomplete construct from a streaming buffer.
export function clampStreaming(md: string): string {
	const lines = normalizeEol(md).split('\n');
	// 1. An unclosed fence: scan tracking the open marker; if one is still open at the
	//    end, hold everything from its opener onward (marker-aware — a ~~~ block is only
	//    closed by ~~~, so a ``` line inside it does not prematurely balance it). This
	//    also holds a `lattice-edit` block (tilde- or backtick-wrapped) until it closes.
	let openAt = -1;
	let open: { marker: string; len: number } | null = null;
	for (let i = 0; i < lines.length; i++) {
		if (open) {
			if (isFenceClose(lines[i], open)) open = null;
		} else {
			const o = fenceOpen(lines[i]);
			if (o) {
				open = { marker: o.marker, len: o.len };
				openAt = i;
			}
		}
	}
	if (open) return lines.slice(0, openAt).join('\n').replace(/[ \t]+$/, '');

	// 2. A trailing incomplete inline construct on the last line (inline spans don't
	//    cross newlines). Skip a fence line (step 1 balanced them).
	const last = lines.length - 1;
	let tail = lines[last];
	if (last >= 0 && !fenceOpen(tail)) {
		if ((tail.match(/`/g) || []).length % 2 === 1) tail = tail.slice(0, tail.lastIndexOf('`'));
		const openBracket = tail.lastIndexOf('[');
		if (openBracket > -1 && !/^\[[^\]]*\]\([^)\s]+\)/.test(tail.slice(openBracket))) tail = tail.slice(0, openBracket);
		lines[last] = tail;
	}
	return lines.join('\n');
}
