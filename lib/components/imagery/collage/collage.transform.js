/**
 * collage kernel — turn an authored photo list into a packed grid.
 *
 * The author writes a flat list of photos, each optionally followed by a trailing code
 * span of hints (spec section 3):
 *
 *   - ![Tan derby](shoes/tan-derby.jpg) `hero`
 *   - ![Macro](shoes/macro.jpg) `top`
 *   - ![Brogue](shoes/brogue.jpg) `3:2`
 *
 * Markdown renders each item as `<li><img …> <code>hero</code></li>`. This kernel works in
 * two steps so the same code runs on the CLI build and in the browser preview (HARD RULE #1):
 *
 *   1. STRUCTURE (pure string work, needs no image sizes). Each photo becomes a flat
 *      `<li class="collage-tile">` holding only the `<img>`, the hint span is consumed, and
 *      the list is wrapped once in `.collage-fit`. The list stays flat and in written order
 *      (`_focus: item N`, tab order and lint messages all count in that order).
 *   2. STAMP (needs each photo's aspect). `planStamp` runs the packer kernel
 *      (`lib/core/collage-pack.js`) and returns the CSS grid style for the list and for each
 *      tile. The CLI feeds it sizes read from file headers; the browser measures
 *      `naturalWidth` / `naturalHeight`. Both call the same function, so they agree.
 *
 * Hints are plain code, never a Segno `{…}` record. A hint span is read all or nothing: if any
 * word is unknown the span is left in place and renders as the ordinary metadata pill. Hints
 * only ever select from fixed tables, and every value written into a `style` attribute is a
 * number this file formatted or a constant from a table below. No author text reaches a
 * style attribute (HARD RULE #22).
 *
 * See engineering/decisions/2026-10-11-collage-component.md.
 */

const { mapSections } = require('../../../core/section-walk');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { topLevelElements } = require('../../../core/coda');
const { packCollage, fallbackGrid, stageAspectEstimate, MAX_PHOTOS } = require('../../../core/collage-pack');

const SECTION_CLASS = 'collage';
const MARKER = 'collage-fit';
const MARKER_RE = /\sclass="[^"]*\bcollage-fit\b/;

// Where a photo's crop falls, as an `object-position` pair. A closed table: a hint word picks a
// row, so no author text becomes a style value.
const FOCAL = Object.freeze({
  top: '50% 0%', bottom: '50% 100%', left: '0% 50%', right: '100% 50%', center: '50% 50%',
});
const RATIO_RE = /^(\d{1,4}):(\d{1,4})$/;
const RATIO_MAX = 1000;

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" });

function decode(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos|nbsp|#0*39);/g, (_m, n) => ENTITIES[n.replace(/^#0+/, '#')] ?? ' ');
}

/**
 * Read one hint span's text. Returns `{hero, focal, ratio}` (any may be null/false) or null when
 * any word is unknown, repeated, or a ratio is out of range. All or nothing.
 */
function parseHints(text) {
  const words = decode(text).split(',').map((w) => w.trim().toLowerCase());
  if (!words.length || words.some((w) => !w)) return null;
  const out = { hero: false, focal: null, ratio: null };
  for (const w of words) {
    if (w === 'hero') { if (out.hero) return null; out.hero = true; continue; }
    if (Object.hasOwn(FOCAL, w)) { if (out.focal) return null; out.focal = w; continue; }
    const m = RATIO_RE.exec(w);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (out.ratio || a < 1 || b < 1 || a > RATIO_MAX || b > RATIO_MAX) return null;
      out.ratio = a / b;
      continue;
    }
    return null;
  }
  return out;
}

/** Slide options from the section's class tokens. */
function optionsFromClass(cls) {
  const tokens = String(cls || '').split(/\s+/);
  const has = (t) => tokens.includes(t);
  return {
    order: has('ordered') ? 'ordered' : 'free',
    fit: has('fill') ? 'fill' : 'tight',
    composition: has('bleed') ? 'bleed' : has('above') ? 'above' : 'beside',
  };
}

// ── step 1: structure ─────────────────────────────────────────────────────────────────

const IMG_RE = /<img\b[^>]*>/i;
const TAIL_CODE_RE = /^\s*<code>([^<]*)<\/code>\s*$/;

/** One authored `<li>` → `{imgTag, hints, extra}`, or null when it has no photo first. */
function parseTile(liInner) {
  const m = IMG_RE.exec(liInner);
  if (!m || liInner.slice(0, m.index).trim() !== '') return null;
  const rest = liInner.slice(m.index + m[0].length);
  const code = TAIL_CODE_RE.exec(rest);
  const hints = code ? parseHints(code[1]) : null;
  // A tail that is not a clean hint span is kept (it renders as the ordinary pill).
  const extra = hints || rest.trim() === '' ? '' : rest;
  return { imgTag: m[0], hints, extra };
}

function tileHtml(t) {
  const hero = t.hints?.hero ? ' data-hero="1"' : '';
  const ratio = t.hints?.ratio ? ` data-collage-ratio="${t.hints.ratio.toFixed(4)}"` : '';
  const focal = t.hints?.focal ? ` style="--collage-focal:${FOCAL[t.hints.focal]}"` : '';
  // The alt text, already escaped by the engine, names the tile for the Present Guide: a narrated
  // sentence that opens with it lets the pointer land on this photo (a mark's `data-label`).
  const alt = readAttr(t.imgTag, 'alt');
  const label = alt ? ` data-label="${alt}"` : '';
  return `<li class="collage-tile"${hero}${ratio}${label}${focal}>${t.imgTag}${t.extra}</li>`;
}

/** Rebuild the first top-level list of `container` into the tile grid. */
function rebuildList(container) {
  let out = '';
  let cursor = 0;
  for (const el of topLevelElements(container)) {
    if (el.tag !== 'ul' && el.tag !== 'ol') continue;
    const openEnd = container.indexOf('>', el.start) + 1;
    const closeStart = container.lastIndexOf('</', el.end);
    const tiles = parseTopLevelLis(container.slice(openEnd, closeStart)).map(parseTile);
    if (!tiles.length || tiles.some((t) => !t)) return container; // not a photo list: leave it
    out += container.slice(cursor, el.start)
      + `<div class="${MARKER}"><ul class="collage-list" data-collage="pending" data-collage-n="${tiles.length}">${tiles.map(tileHtml).join('')}</ul></div>`;
    cursor = el.end;
    return out + container.slice(cursor);
  }
  return container;
}

function findStage(inner) {
  for (const el of topLevelElements(inner)) {
    if (el.tag !== 'div') continue;
    const open = inner.slice(el.start, inner.indexOf('>', el.start) + 1);
    if (/\sclass="[^"]*\bcell-stage\b/.test(open)) return el;
  }
  return null;
}

function structureSection(inner) {
  if (typeof inner !== 'string' || inner.indexOf('<li') === -1) return inner;
  if (MARKER_RE.test(inner)) return inner; // idempotent
  const stage = findStage(inner);
  if (!stage) return rebuildList(inner);
  const openEnd = inner.indexOf('>', stage.start) + 1;
  const closeStart = inner.lastIndexOf('</', stage.end);
  return inner.slice(0, openEnd) + rebuildList(inner.slice(openEnd, closeStart)) + inner.slice(closeStart);
}

// ── step 2: stamp ─────────────────────────────────────────────────────────────────────

const fr = (v) => `minmax(0,${(v * 1000).toFixed(3)}fr)`;

/**
 * Decide the grid for one section.
 * @param {(number|null)[]} aspects   measured width/height per photo, written order; null = unknown
 * @param {(number|null)[]} ratios    the `3:2` hint per photo, used only when that aspect is unknown
 * @param {boolean[]}       heroes    which photos carry `hero`
 * @param {{order,fit,composition}} opts   from `optionsFromClass`
 * @param {string} orientation        the deck's `data-orientation`
 * @returns {{mode:'packed'|'fallback', listStyle:string, tileStyles:string[], result:object}}
 */
function planStamp(aspects, ratios, heroes, opts, orientation) {
  const n = aspects.length;
  // Portrait and square decks stack the text above, so the beside estimate never applies to them.
  const composition = opts.composition === 'beside' && orientation !== 'landscape' ? 'above' : opts.composition;
  const stageAspect = stageAspectEstimate({ orientation, composition });
  const resolved = aspects.map((a, i) => (Number.isFinite(a) && a > 0 ? a : (ratios[i] || null)));
  const known = resolved.every((a) => a != null);
  let res;
  let mode = 'packed';
  if (!known || n > MAX_PHOTOS) {
    res = fallbackGrid(n, stageAspect, known ? 'too-many' : 'unreadable');
    mode = 'fallback';
  } else {
    res = packCollage(resolved, { stageAspect, order: opts.order, fit: opts.fit, hero: heroes.indexOf(true) });
    if (res.fallback) mode = 'fallback';
  }
  const num = (v) => (Number.isFinite(v) ? v : 1);
  const listStyle = `--collage-ar:${num(res.ar).toFixed(4)};grid-template-columns:${res.cols.map(fr).join(' ')};grid-template-rows:${res.rows.map(fr).join(' ')}`;
  const lastCol = res.cols.length + 1;
  const lastRow = res.rows.length + 1;
  // A hovered tile grows toward the collage interior: a tile on an edge pins that edge, so it can
  // never spill off the slide. A closed table of three words per axis, never author text.
  const origin = (start, end, last) => (start === 1 && end === last ? '50%' : start === 1 ? '0%' : end === last ? '100%' : '50%');
  const tileStyles = res.areas.map((a) => {
    const [r1, c1, r2, c2] = a.map((v) => Math.max(1, Math.round(v)));
    return `grid-area:${r1}/${c1}/${r2}/${c2};--collage-origin:${origin(c1, c2, lastCol)} ${origin(r1, r2, lastRow)}`;
  });
  return { mode, listStyle, tileStyles, result: res };
}

function readAttr(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/**
 * String-path stamp: given a structured section's inner HTML and each photo's aspect, write the
 * grid styles. Idempotent on `data-collage="packed|fallback"`.
 */
function stampSection(inner, aspects, opts, orientation) {
  if (typeof inner !== 'string' || inner.indexOf('data-collage="pending"') === -1) return inner;
  // `focus.js` runs between the structure and stamp steps and may add `lat-focus` / `lat-recede`
  // to a tile's class, so match the class token, not the whole attribute.
  const tileRe = /<li class="(collage-tile(?: [^"]*)?)"([^>]*)>/g;
  const ratios = [];
  const heroes = [];
  let m;
  while ((m = tileRe.exec(inner))) {
    const r = readAttr(`<x${m[2]}>`, 'data-collage-ratio');
    ratios.push(r ? Number(r) : null);
    heroes.push(/\sdata-hero="1"/.test(m[2]));
  }
  if (ratios.length !== aspects.length) return inner;
  const plan = planStamp(aspects, ratios, heroes, opts, orientation);
  let i = 0;
  let out = inner.replace(tileRe, (_all, cls, attrs) => {
    const style = plan.tileStyles[i++];
    const hasStyle = /\sstyle="/.test(attrs);
    const next = hasStyle ? attrs.replace(/\sstyle="([^"]*)"/, (_s, v) => ` style="${style};${v}"`) : `${attrs} style="${style}"`;
    return `<li class="${cls}"${next}>`;
  });
  out = out.replace(/<ul class="collage-list" data-collage="pending"/, `<ul class="collage-list" data-collage="${plan.mode}" style="${plan.listStyle}"`);
  return out;
}

// ── entry points ──────────────────────────────────────────────────────────────────────

const classRe = new RegExp(`(?:^|\\s)${SECTION_CLASS}(?:\\s|$)`);

/** Engine path: structure every `section.collage`. Stamping needs sizes and happens after. */
function applyToRenderedHtml(html) {
  if (typeof html !== 'string' || html.indexOf(SECTION_CLASS) === -1) return html;
  return mapSections(html, (_openTag, cls, inner) => (classRe.test(cls) ? structureSection(inner) : null));
}

/**
 * Live path (Playground, Studio, preview). Structures the section, then measures each photo and
 * stamps once. Until every photo is measured the list carries `data-collage="pending"`, capped at
 * `PENDING_CAP_MS` so one slow photo cannot leave the slide unlaid.
 */
const PENDING_CAP_MS = 4000;

function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll(`section.${SECTION_CLASS}`)) {
    if (!sec.querySelector(`.${MARKER}`)) {
      for (const img of sec.querySelectorAll('img')) {
        if (img.getAttribute('src') && img.src) img.setAttribute('src', img.src);
      }
      const next = structureSection(sec.innerHTML);
      if (next !== sec.innerHTML) sec.innerHTML = next;
    }
    const list = sec.querySelector('ul.collage-list[data-collage="pending"]');
    if (list) stampLive(sec, list);
  }
}

function stampLive(sec, list) {
  const imgs = Array.from(list.querySelectorAll(':scope > li > img'));
  const opts = optionsFromClass(sec.getAttribute('class'));
  const orientation = sec.getAttribute('data-orientation') || 'landscape';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const aspects = imgs.map((im) => (im.naturalWidth > 0 && im.naturalHeight > 0 ? im.naturalWidth / im.naturalHeight : null));
    const tiles = Array.from(list.querySelectorAll(':scope > li'));
    const ratios = tiles.map((t) => Number(t.getAttribute('data-collage-ratio')) || null);
    const heroes = tiles.map((t) => t.getAttribute('data-hero') === '1');
    const plan = planStamp(aspects, ratios, heroes, opts, orientation);
    list.setAttribute('style', plan.listStyle);
    tiles.forEach((t, i) => {
      const own = t.getAttribute('style');
      t.setAttribute('style', own ? `${plan.tileStyles[i]};${own}` : plan.tileStyles[i]);
    });
    list.setAttribute('data-collage', plan.mode);
  };
  const waiting = imgs.filter((im) => !(im.complete && im.naturalWidth > 0));
  if (!waiting.length) { finish(); return; }
  let left = waiting.length;
  const one = () => { if (--left <= 0) finish(); };
  waiting.forEach((im) => { im.addEventListener('load', one, { once: true }); im.addEventListener('error', one, { once: true }); });
  setTimeout(finish, PENDING_CAP_MS);
}

module.exports = {
  applyToRenderedHtml,
  applyToDom,
  structureSection,
  stampSection,
  planStamp,
  parseHints,
  optionsFromClass,
  FOCAL,
  PENDING_CAP_MS,
};
