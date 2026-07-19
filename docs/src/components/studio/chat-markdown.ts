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
// only on a line of the SAME marker, at least as long — so ``` can appear literally
// inside a ~~~ block (the `~~~` convention the author asked for) and vice-versa. The
// four-backtick `lattice-edit` protocol blocks (architect-edits.js) are DROPPED from
// the rendered stream — they surface as reviewable diff cards, never as visible code.
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
const isItem = (l: string) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l);

// The language token surfaced as a code-block label. Derived from the info-string
// AFTER escaping (never from raw model source — R7), first word only.
function langLabel(info: string): string {
	return escapeHtml(info).split(/\s+/)[0] || '';
}

// Render a run of prose (no fences) to safe HTML: escape everything, then layer
// headings / lists / paragraphs / inline spans on the escaped text.
export function renderProse(md: string): string {
	const lines = escapeHtml(md).split('\n');
	const out: string[] = [];
	let i = 0;
	let listTag: string | null = null;
	let items: string[] = [];
	const flush = () => {
		if (listTag) {
			out.push(`<${listTag} class="cm-md-list">${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${listTag}>`);
			listTag = null;
			items = [];
		}
	};
	while (i < lines.length) {
		const line = lines[i];
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			flush();
			out.push(`<div class="cm-md-h cm-md-h${h[1].length}">${inline(h[2])}</div>`);
			i++;
			continue;
		}
		const ul = line.match(/^\s*[-*]\s+(.*)$/);
		const ol = line.match(/^\s*\d+\.\s+(.*)$/);
		if (ul || ol) {
			const tag = ul ? 'ul' : 'ol';
			if (listTag && listTag !== tag) flush();
			listTag = tag;
			items.push(ul ? ul[1] : (ol as RegExpMatchArray)[1]);
			i++;
			continue;
		}
		if (line.trim() === '') {
			flush();
			i++;
			continue;
		}
		flush();
		const para = [line];
		i++;
		while (i < lines.length && lines[i].trim() !== '' && !isHeading(lines[i]) && !isItem(lines[i]) && !fenceOpen(lines[i])) {
			para.push(lines[i]);
			i++;
		}
		out.push(`<p>${para.map(inline).join('<br>')}</p>`);
	}
	flush();
	return out.join('');
}

// Split a reply into ordered prose/code segments. Edit-protocol blocks
// (`lattice-edit …`) are dropped — they become diff cards, never visible code.
export function renderMessageSegments(md: string): ChatSegment[] {
	const lines = String(md || '').split('\n');
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
	const lines = md.split('\n');
	// 1. An unclosed fence: scan tracking the open marker; if one is still open at the
	//    end, hold everything from its opener onward (marker-aware — a ~~~ block is only
	//    closed by ~~~, so a ``` line inside it does not prematurely balance it). This
	//    also holds the four-backtick lattice-edit block until it closes.
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
