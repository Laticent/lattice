/**
 * MIGRATE A `video` SLIDE'S BULLETS TO THE `@video{…}` RECORD — pure, fs-free (shared by `lint:deck --fix`
 * and the one-off sweep of the shipped decks, HARD RULE #7).
 *
 * Before the video plugin, a `video` slide's address was a bare bullet, with optional bullets ending in `caption` and
 * `poster`, and a pass read them from the rendered page. That pass is gone (engineering/decisions/2026-10-16-media-plugins.md
 * § 4.5); the address now comes only from the author's own `@video{…}` span. This reads the SOURCE lines of one slide and
 * proposes the record. It reads Markdown the author wrote, at lint time, and never renders anything.
 */
const { detectProvider } = require('./video-providers.mjs');

const ITEM = /^(\s*)[-*+]\s+(.*\S)\s*$/;
const KEYED = /^(.*?)\s*`(caption|poster)`\s*$/;
const LINK = /^\[[^\]]*\]\((\S+?)\)$/;
const UNSAFE = /["\n\\`]/;

const quote = (v) => `"${v}"`;

/**
 * One step of fence tracking for a line, STRICT where CommonMark is simple and CONSERVATIVE where it is not. A fence at the left margin
 * (up to three spaces) opens on three or more backticks or tildes (the info string may follow; a backtick fence's may not hold a
 * backtick) and closes only on the same character, at least as long, with nothing after it. A fence-looking run inside a quote, a list
 * item or an indented block (four spaces) is `container: true`: whether it opens a fence depends on how the container ends, so a caller
 * that rewrites text must treat everything after it as uncertain, and one that only reads may carry on.
 * @param {string} line
 * @param {{ ch: string, len: number } | null} state
 * @returns {{ state: { ch: string, len: number } | null, inside: boolean, container: boolean }}
 */
function fenceStep(line, state) {
  const text = String(line);
  const margin = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if (!state) {
    if (margin && !(margin[1][0] === '`' && margin[2].includes('`'))) return { state: { ch: margin[1][0], len: margin[1].length }, inside: true, container: false };
    return { state: null, inside: false, container: /^(?:\s*(?:>|[-*+]\s|\d+[.)]\s))*\s*(?:`{3,}|~{3,})/.test(text) };
  }
  const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text);
  if (close && close[1][0] === state.ch && close[1].length >= state.len) return { state: null, inside: true, container: false };
  return { state, inside: true, container: false };
}

/** The words of a bullet other than its address: a link keeps its label, markup characters go, spaces collapse. */
function wordsAround(text, url) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(url, ' ')
    .replace(/[<>*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The migration of ONE slide's lines (a `video`-class slide), or null when it has no old-style address bullet
 * or holds something the record cannot carry (a `"` or `\` in a value).
 * @param {string[]} lines
 * @returns {{ lines: string[], record: string, from: number, to: number } | null}
 */
function migrateSlideLines(lines) {
  let video = -1;
  let caption = -1;
  let poster = -1;
  let address = '';
  let words = '';
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const step = fenceStep(lines[i], fence);
    fence = step.state;
    if (step.inside) continue;
    const m = ITEM.exec(lines[i]);
    if (!m || m[1].length) continue;
    const keyed = KEYED.exec(m[2]);
    if (keyed) {
      if (keyed[2] === 'caption' && caption < 0) caption = i;
      if (keyed[2] === 'poster' && poster < 0) poster = i;
      continue;
    }
    if (video >= 0) continue;
    // The address is the first URL in the bullet — a bare line, `<url>`, `**url**`, a link, or a URL with words after it — never the whole line.
    const link = LINK.exec(m[2]);
    const raw = link ? link[1] : (/https?:\/\/[^\s)>\]"*`]+/.exec(m[2]) || [m[2]])[0];
    const url = raw.replace(/[.,;:!?]+$/, ''); // trailing punctuation belongs to the sentence, not the address
    if (detectProvider(url)) { video = i; address = url; words = wordsAround(m[2], raw); }
  }
  if (video < 0) return null;
  const textOf = (i) => KEYED.exec(ITEM.exec(lines[i])[2])[1].trim();
  // The author's own words around the address become the title, so the fix deletes none of them; an explicit caption bullet wins.
  const title = caption >= 0 ? textOf(caption) : words;
  const posterRef = poster >= 0 ? textOf(poster) : '';
  if ([address, title, posterRef].some((v) => UNSAFE.test(v))) return null;
  const parts = [quote(address)];
  if (title) parts.push(`title=${quote(title)}`);
  if (posterRef) parts.push(`poster=${quote(posterRef)}`);
  const record = `\`@video{${parts.join(', ')}}\``;
  // The record stands alone: a neighbor line with text would make it a lazy continuation of that paragraph, and it would stay code.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === video) {
      if (out.length && out[out.length - 1].trim() !== '') out.push('');
      out.push(record);
      if (i + 1 < lines.length && lines[i + 1].trim() !== '' && i + 1 !== caption && i + 1 !== poster) out.push('');
    } else if (i !== caption && i !== poster) out.push(lines[i]);
  }
  const to = Math.max(video, caption, poster);
  const first = Math.min(...[video, caption, poster].filter((i) => i >= 0));
  // The span of source lines the rewrite touches, and what stands there after it: a fix replaces exactly this text.
  const after = [];
  for (let i = first; i <= to; i++) {
    if (i === video) after.push(record);
    else if (i !== caption && i !== poster) after.push(lines[i]);
  }
  return { lines: out, record, from: first, to, before: lines.slice(first, to + 1), after };
}

/**
 * Migrate every `video` slide of a deck's source. A slide is a `video` slide when a `_class:` comment on it names `video`.
 * @param {string} source
 * @returns {{ source: string, changed: number, skipped: number }}
 */
function migrateVideoBullets(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const out = [];
  let start = 0;
  let changed = 0;
  let skipped = 0;
  const flush = (end) => {
    const slide = lines.slice(start, end);
    const isVideo = slide.some((l) => /<!--\s*_class:\s*[^>]*\bvideo\b/.test(l));
    if (isVideo) {
      const r = migrateSlideLines(slide);
      if (r) { out.push(...r.lines); changed++; return; }
      if (slide.some((l) => ITEM.test(l) && detectProvider(ITEM.exec(l)[2]))) skipped++;
    }
    out.push(...slide);
  };
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const step = fenceStep(lines[i], fence);
    fence = step.state;
    if (!step.inside && /^---\s*$/.test(lines[i]) && i > 0) { flush(i); start = i; }
  }
  flush(lines.length);
  return { source: out.join(eol), changed, skipped };
}

module.exports = { migrateVideoBullets, migrateSlideLines, fenceStep };
