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
const UNSAFE = /["\n\\]/;

const quote = (v) => `"${v}"`;

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
  for (let i = 0; i < lines.length; i++) {
    const m = ITEM.exec(lines[i]);
    if (!m || m[1].length) continue;
    const keyed = KEYED.exec(m[2]);
    if (keyed) {
      if (keyed[2] === 'caption' && caption < 0) caption = i;
      if (keyed[2] === 'poster' && poster < 0) poster = i;
      continue;
    }
    if (video >= 0) continue;
    const link = LINK.exec(m[2]);
    const url = link ? link[1] : m[2];
    if (detectProvider(url)) { video = i; address = url; }
  }
  if (video < 0) return null;
  const textOf = (i) => KEYED.exec(ITEM.exec(lines[i])[2])[1].trim();
  const title = caption >= 0 ? textOf(caption) : '';
  const posterRef = poster >= 0 ? textOf(poster) : '';
  if ([address, title, posterRef].some((v) => UNSAFE.test(v))) return null;
  const parts = [quote(address)];
  if (title) parts.push(`title=${quote(title)}`);
  if (posterRef) parts.push(`poster=${quote(posterRef)}`);
  const record = `\`@video{${parts.join(', ')}}\``;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === video) out.push(record);
    else if (i !== caption && i !== poster) out.push(lines[i]);
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
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (!inFence && /^---\s*$/.test(lines[i]) && i > 0) { flush(i); start = i; }
  }
  flush(lines.length);
  return { source: out.join(eol), changed, skipped };
}

module.exports = { migrateVideoBullets, migrateSlideLines };
