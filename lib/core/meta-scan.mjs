/**
 * lib/core/meta-scan.mjs
 *
 * THE PER-SLIDE DIRECTIVE SCAN of a deck source, the part of the slide-metadata reader (lib/core/meta-record.mjs)
 * the linter reads: `scanMetaSource`, `directiveKey` and `hasMarker`. Its own module so the linter's browser bundle
 * carries this and not meta-record's editing helpers (docs/route-budget.json `lintCoreGz`); meta-record re-exports
 * all three, so its callers are unchanged.
 *
 * Every comment comes from the deck model (lib/core/directive-island.mjs, Segno P3,
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 landed). Pure and fs-free (HARD RULE #7).
 */

import { bodyModel } from './deck-model.mjs';
import { authoredComments, readIsland } from './directive-island.mjs';
import { DIRECTIVE_VOCAB, FLAG_KEYS, KNOWN_KEYS, MARKER_NAMES, SLIDE_ONLY_KEYS } from './meta-keys.mjs';
import { boundaryRulesGeneration, chunkBoundaryLines, frontMatterBlockOf, normalizeSourceText, slideBoundaryModel } from './slide-boundaries.mjs';

/**
 * True when `text` (one slide's source) carries the marker `name` as a comment of its own: a comment block, or one
 * the engine folds into another block, never one in a fence or in a line of prose. A substring test first, so the
 * linter's several asks per slide parse only the slides that could carry it.
 */
export function hasMarker(text, name) {
  const src = normalizeSourceText(String(text ?? ''));
  if (!MARKER_NAMES.has(name) || !src.includes(name)) return false;
  return authoredComments(bodyModel(src)).some((c) => c.closed && readIsland(c).marker === name);
}

/**
 * The key of a comment body's FIRST directive line (leading `_` stripped), or '' when the body
 * opens with prose. A key alone with no colon counts only for a bare-able (flag) key, so
 * `<!-- remember … -->` is never read as `remember`.
 * @param {string} body
 * @returns {string}
 */
export function directiveKey(body) {
  const t = String(body ?? '').trim();
  const m = /^_?([A-Za-z][\w-]*)\s*(:|$)/.exec(t);
  if (!m) return '';
  const key = m[1];
  if (!m[2] && !FLAG_KEYS.has(key)) return '';
  return KNOWN_KEYS.has(key) ? key : '';
}

// ── The walk: every comment that can be a directive, per slide ──────────────

/**
 * Every comment block of `text` (S0 text: `normalizeSourceText` applied), read, with the 0-based document lines
 * that cut it into `splitTopLevel`'s chunks.
 *
 * WHICH COMMENTS ARE BLOCKS IS THE DECK MODEL'S ANSWER (Segno P3, lib/core/directive-island.mjs): its block pass
 * is markdown-it's own rules, so a comment counts exactly where the engine opens an `html_block` for it, and it
 * runs to the first line holding `-->` or to the end of its container. The line walk this replaced kept its own
 * fence and opener regexes and approximated that. A comment that starts mid-sentence is inline text, which is
 * what makes a quoted example in a bullet harmless; one under a container prefix (`> <!-- … -->`,
 * `- <!-- … -->`) is a block inside the container, and is `prefixed`.
 *
 * The front matter is not walked: nothing in it is a block, and the engine reads no directive there but its keys.
 *
 * The comments the engine FOLDS into another block are listed too, marked `folded` (`authoredComments`): the
 * linter's rules for them say why the engine will not read them. They resolve nothing.
 */
function commentsOf(source, vocab) {
  // ONE normalization, the one `chunkBoundaryLines` applies to the same source, so the comments and the boundaries
  // count lines in one geometry (normalizing twice strips a second BOM, and the two then split front matter apart).
  const text = normalizeSourceText(source);
  const fm = frontMatterBlockOf(text);
  // The body's first line is the document line after the front matter's last `\n`. Counted by `\n`, because a
  // closing line with text after it (`---x`) ends the block mid-line and the body starts on that line.
  let skip = 0;
  for (let i = fm.indexOf('\n'); i !== -1; i = fm.indexOf('\n', i + 1)) skip++;
  const boundaries = chunkBoundaryLines(source);
  const body = text.slice(fm.length);
  // The boundary memo normalizes the body it is handed, which strips a BOM just after the front matter; the engine
  // reads that BOM as text (it turns the line into a paragraph), so such a body is read as it stands.
  const model = body.charCodeAt(0) === 0xfeff ? bodyModel(body) : slideBoundaryModel(body);
  const list = [];
  for (const island of authoredComments(model)) {
    if (!island.closed) continue; // unterminated: markdown-it runs it to its container's end; no directive
    const read = readIsland(island, vocab);
    list.push({
      folded: island.folded,
      line: island.fromLine + skip + 1,
      endLine: island.toLine + skip,
      raw: island.raw,
      indent: island.indent,
      // Anything before `<!--` other than up to three spaces is a container prefix (`> `, `- `).
      prefixed: !/^ {0,3}$/.test(island.indent),
      // Inside a list item or blockquote even with no prefix on its own line (a record indented under `- point`).
      nested: island.level !== 0,
      ...read,
    });
  }
  return { comments: list, boundaries };
}

/**
 * @typedef {object} MetaComment
 * @property {number} line      1-based line the comment opens on
 * @property {number} endLine   1-based line it closes on
 * @property {string} raw       the comment, delimiters included
 * @property {'directive'|'marker'|'record'|'note'} kind
 * @property {string} [key]     a directive's key
 * @property {boolean} [spot]   a directive written with the `_` (this slide only)
 * @property {string} [value]   a directive's value, quotes stripped
 * @property {string} [marker]  a marker's name
 * @property {boolean} prefixed a list or blockquote prefix (`- `, `> `) on its own line
 * @property {boolean} nested   inside a list item or blockquote, prefixed or indented under one
 * @property {boolean} bareOpener a bare `<!--` with the record on the next line
 * @property {true} [folded]   the engine reads it as part of another block (an HTML block, a container that ended
 *                             before its `-->`), so it resolves nothing: listed for the lint alone
 */

/**
 * @typedef {object} MetaEntry  the directive that wins for one key on one slide
 * @property {string} value
 * @property {string} text      the winning comment, verbatim: what a lint finding quotes back
 * @property {number} line      its 1-based document line
 * @property {boolean} spot
 * @property {true} [record]  set by a field of a record (`<!-- {layout=cards} -->`), not a directive comment
 */

/**
 * Every comment of the source that can be a directive, indexed EXACTLY as `splitTopLevel(source)`
 * indexes its chunks (front-matter chunks included), and the per-key resolution of each slide.
 *
 * RESOLUTION IS THE ENGINE'S RULE, per key: a spot (`_key`) replaces the running global (`key`),
 * the LAST spot on a slide wins, a global applies from its own slide onward, a spot lasts one
 * slide, and a slide-only key (`header`, `footer`) is a spot in either spelling (`lib/engine/slides.js`: `{ ...runningGlobal, ...slideLocal }`).
 *
 * @param {string} source
 * @param {{vocab?: {known: Set<string>, flags?: Set<string>}}} [opts]
 * @returns {{slides: Array<{comments: MetaComment[], resolved: Map<string, MetaEntry>}>}}
 */
export function scanMetaSource(source, { vocab = DIRECTIVE_VOCAB } = {}) {
  // THE ENGINE'S LINE GEOMETRY, because the boundary line numbers are counted in it: `\r\n` and a
  // lone `\r` fold to `\n`, a BOM is dropped, and U+2028 / U+2029 are NOT terminators.
  const { comments: found, boundaries } = commentsOf(String(source ?? ''), vocab);
  return { slides: resolveSlides(found, boundaries) };
}

/**
 * `scanMetaSource(source)` under the default vocabulary, remembered for the last source. The linter reads the scan
 * from two places for one text: lint-core's rules and the Squadra deck rules (lib/authoring/squadra/deck-language.js
 * `deck.meta`). One memo here means one scan. Callers treat the result as read-only, as they already treat
 * `scanMetaSource`'s.
 * @param {string} source
 */
let lastScan = { source: null, generation: -1, scan: null };
export function scanMetaSourceShared(source) {
  const s = String(source ?? '');
  // Keyed on the plugin block rules too: a host that switches them (`setBoundaryPluginsOff`, the Studio's lint worker
  // on a deck's `plugins:` change) splits the same text into other slides.
  const generation = boundaryRulesGeneration();
  if (lastScan.source !== s || lastScan.generation !== generation) lastScan = { source: s, generation, scan: scanMetaSource(s) };
  return lastScan.scan;
}

/**
 * The per-slide resolution over comments in source order and the sorted 0-based boundary lines: one slide per
 * chunk, `boundaries.length + 1` of them.
 */
function resolveSlides(found, boundaries) {
  const slides = [];
  const globals = new Map();
  let spots = new Map();
  let list = [];
  const resolveNow = () => {
    const out = new Map(globals);
    for (const [k, v] of spots) out.set(k, v);
    return out;
  };
  const endSlide = () => {
    slides.push({ comments: list, resolved: resolveNow() });
    spots = new Map();
    list = [];
  };
  let b = 0;
  for (const c of found) {
    // `<=`: a comment ON a boundary line sits after it. Only the front matter's closing line can hold one
    // (`--- <!-- _class: k -->`: the engine's front matter ends at `---` and its body starts on that line).
    while (b < boundaries.length && boundaries[b] <= c.line - 1) { endSlide(); b++; }
    const base = { line: c.line, endLine: c.endLine, raw: c.raw, prefixed: c.prefixed, nested: c.nested, bareOpener: c.bareOpener };
    if (c.folded) base.folded = true;
    if (c.dirs.length) {
      // A record lists one entry per field it sets, all on its own line: each resolves as the directive comment it
      // replaces would.
      for (const dir of c.dirs) {
        // `record`: the field of a record, not a `<!-- key: v -->` line of its own. A rule written for that line (its
        // machine fix deletes or rewrites the line) leaves a record alone: the line holds every other field too.
        list.push({ ...base, kind: 'directive', key: dir.key, spot: dir.spot, value: dir.value, ...(c.record ? { record: true } : {}) });
        // A folded comment is listed for the lint and resolves nothing: the engine never reads it.
        if (c.folded) continue;
        const entry = { value: dir.value, text: c.raw, line: c.line, spot: dir.spot, ...(c.record ? { record: true } : {}) };
        // LAST spot on a slide wins; a global lands on its own slide too unless a spot names the key. A slide-only key
        // (`header`, `footer`) is a spot in either spelling, as the engine reads it (lib/engine/slides.js). A `paginate:`
        // comment governs nothing: the engine ignores it (front matter, classes and the manifest decide), so it stays
        // listed for the lint and resolves no value.
        if (dir.key !== 'paginate') (dir.spot || SLIDE_ONLY_KEYS.has(dir.key) ? spots : globals).set(dir.key, entry);
      }
    } else if (c.marker) {
      list.push({ ...base, kind: 'marker', marker: c.marker });
    } else {
      list.push({ ...base, kind: c.record ? 'record' : 'note' });
    }
  }
  for (; b < boundaries.length; b++) endSlide();
  endSlide();
  return slides;
}

