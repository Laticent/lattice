// The Drawing Board — a tiny, safe Markdown renderer for the chat thread.
//
// The Architect (especially the cloud tier) replies in Markdown — **bold**, lists,
// `code`, fenced blocks — but the bubble used to render plain text, so authors saw
// the raw syntax. This turns a reply into safe HTML: it HTML-escapes EVERYTHING
// first (so no tag from the model can execute), then layers our own formatting on
// the escaped text. Links are scheme-checked (no javascript:/data:). Deliberately
// basic — bold/italic/inline-code/links/headings/lists + fenced code — and pure,
// so it's fully unit-tested. Used only for Architect messages; user text stays raw.

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Allow http(s)/mailto and relative (#, /) links; reject everything else
// (javascript:, data:, …). Input is already HTML-escaped.
function safeUrl(u) {
  const t = u.trim();
  if (/^(https?:|mailto:)/i.test(t)) return t;
  if (/^[#/]/.test(t)) return t;
  return null;
}

// Inline spans on an already-escaped line. Inline code is protected first so its
// contents aren't re-formatted, then restored.
function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\uE000${codes.length - 1}\uE000`; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const safe = safeUrl(url);
    return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : m;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/\uE000(\d+)\uE000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const isFence = (l) => /^\s*```+/.test(l);
const isHeading = (l) => /^#{1,6}\s+/.test(l);
const isItem = (l) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l);

export function renderMarkdown(md) {
  const lines = escapeHtml(md || '').split('\n');
  const out = [];
  let i = 0;
  let listTag = null;
  let items = [];
  const flush = () => {
    if (listTag) { out.push(`<${listTag} class="db-md-list">${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${listTag}>`); listTag = null; items = []; }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (isFence(line)) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // consume the closing fence (if present)
      out.push(`<pre class="db-md-pre"><code>${buf.join('\n')}</code></pre>`);
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { flush(); out.push(`<div class="db-md-h">${inline(h[1])}</div>`); i++; continue; }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (listTag && listTag !== tag) flush();
      listTag = tag;
      items.push(ul ? ul[1] : ol[1]);
      i++;
      continue;
    }
    if (line.trim() === '') { flush(); i++; continue; }

    // A paragraph: gather consecutive plain lines, joined with <br>.
    flush();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !isFence(lines[i]) && !isHeading(lines[i]) && !isItem(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  flush();
  return out.join('');
}

// Streaming-safe wrapper. While a reply streams in token-by-token, the buffer
// always ends mid-construct — an open ``` fence, a half-typed `code` span, a
// `[label](partial` link. Rendering the raw buffer would flash a block that then
// "unwraps" when the construct closes (the worst offender: an open fence greedily
// wrapping the whole tail in <pre>). This holds back ONLY the trailing incomplete
// construct, so everything already complete renders styled and the cursor sits at
// a clean boundary. Inline emphasis (* / **) is left to degrade naturally
// (literal until the closer arrives) — balancing it safely isn't worth the risk,
// and the flip is a single character. The FINAL render uses renderMarkdown on the
// complete text, so the end state is always exact regardless of what we held here.
export function renderMarkdownStream(md) {
  return renderMarkdown(clampStreaming(String(md || '')));
}

function clampStreaming(md) {
  const lines = md.split('\n');

  // 1. Unclosed code fence: an odd number of fence lines means the last one is an
  //    opener with no closer yet. Hold everything from that opener onward.
  let fences = 0;
  let lastFence = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isFence(lines[i])) { fences++; lastFence = i; }
  }
  if (fences % 2 === 1) {
    return lines.slice(0, lastFence).join('\n').replace(/[ \t]+$/, '');
  }

  // 2. A trailing incomplete inline construct on the last line (inline spans don't
  //    cross newlines in this renderer). Skip fence lines — step 1 already balanced
  //    them, and a closing ``` would look like an "unmatched" backtick run here.
  const last = lines.length - 1;
  let tail = lines[last];
  if (!isFence(tail)) {
    // Unclosed inline code: an odd number of backticks → hold from the last one.
    if ((tail.match(/`/g) || []).length % 2 === 1) {
      tail = tail.slice(0, tail.lastIndexOf('`'));
    }
    // Unclosed link: a trailing '[' whose `](url)` hasn't fully arrived → hold it.
    const open = tail.lastIndexOf('[');
    if (open > -1 && !/^\[[^\]]*\]\([^)\s]+\)/.test(tail.slice(open))) {
      tail = tail.slice(0, open);
    }
    lines[last] = tail;
  }
  return lines.join('\n');
}

// The pure visibility logic for the scroll-to-top/bottom control — separated from
// the DOM so it's testable (jsdom doesn't compute scroll metrics). Returns which
// jump affordances should show given the scroller's metrics.
export function scrollJumpState({ scrollTop = 0, scrollHeight = 0, clientHeight = 0 }, threshold = 120) {
  const overflowing = scrollHeight - clientHeight > threshold;
  if (!overflowing) return { top: false, bottom: false };
  return {
    top: scrollTop > threshold,
    bottom: scrollHeight - scrollTop - clientHeight > threshold,
  };
}
