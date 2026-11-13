// A PHOTO'S BYTES ARE NOT PROSE: the readers skip them.
//
// Readers that skip them: lint-core and review-core (lib/authoring) and the engine's `render` (lib/engine/index.js), on
// a photo line of its own only (lib/core/image-line-payloads.js `imageLineRanges`); the Studio's source checks
// (docs/src/lib/payload-elision.ts `analysisText`);
// and the Studio editor, which folds each payload to a chip (docs/src/components/studio/editor-payload-fold.ts). The
// web-image blocker does NOT: it decides what a page may fetch, so it reads the whole text.
//
// A deck can carry a picture inline, `![bg](data:image/jpeg;base64,…)`, and a phone photo is
// about 5 MB of base64 on one line. Every rule in lint-core and review-core reads the deck's
// text, most of them character by character (the inline-code scanner, the span finders, the
// markdown-it parse behind the web-image rule), so a three-photo deck cost 3.6 s of lint in Node
// and about 5 s in Firefox, on every edit, while the same deck with the payloads cut took 6 ms
// (PR #3153, measured). No rule reads a payload: none decodes one, and the web-image rule asks
// only whether the address is `data:`, which the stand-in keeps.
//
// So the readers lint a copy where each long base64 payload is a stand-in (its own first characters, then a marker:
// the URI still parses as the same URI), and every string in every finding gets the
// author's payload back, so a finding's `line`, `span` and fix name the author's text exactly
// and `applyFix` edits the real line. A `col` after a stand-in on its line moves by the length it
// lost. Lines are never added or removed, so every slide and line number is the author's.
//
// The stand-in carries a marker an author would not type; if the deck already contains it, the
// text is read as it is rather than risk restoring a payload into the author's own words.

// Shorter payloads are left alone: they cost nothing, and an icon-sized URI stays exactly as typed.
const MIN_PAYLOAD = 1024;
const HEAD = ';base64,';
const BASE64 = new Uint8Array(128);
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/') BASE64[c.charCodeAt(0)] = 1;
// What may follow a payload: a character that ends a URL in every reader (a quote, a parenthesis, an entity's `&`, a
// tag's angle bracket, white space), or the end of the text. Anything else (`.`, `:`, a letter after the padding) means
// the run is not a URL's payload and is read as it is.
const ENDS = new Set([34, 39, 41, 38, 60, 62, 32, 9, 10, 13, 12]);
// What must come before `;base64,`, read from at most 128 characters back: the media type, and before `data:` what opens
// a URL VALUE (a markdown destination `](` or `](<`, a CSS `url(` with or without its quote, or an attribute's `=` with
// or without its quote). Only there is the run a value's text to every reader. Written where a tag's attribute NAME
// goes, as in `<img "data:a/b;base64,AAAA…/src="https://…">`, its `/` ends the name and `src` is a real attribute: the
// checker's second case (PR #3153).
const OPENER = /(?:\]\(<?|url\((?:["']|&quot;|&#39;|&#x27;)?|=\s*["']?)data:[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/i;
const MARK = 'LatticeElidedPayload';
const STAND_IN = /LatticeElidedPayload(\d+)x/g;
// A stand-in is the payload's own first KEEP characters, then the marker. A rule that quotes a line cut short (80
// characters, 72) therefore quotes the author's own characters, as it does on the whole text, and a stand-in is over
// any length a reader caps below MIN_PAYLOAD, as the payload is.
const KEEP = MIN_PAYLOAD - 64;

/**
 * Where each long base64 payload of a `data:` URI sits: `[start, end)` of the payload alone, after its `;base64,`,
 * with its `=` padding. The one definition of "a payload worth skipping", shared by every reader that skips one and by
 * the Studio editor, which shows each as a chip (docs/src/components/studio/editor-payload-fold.ts).
 *
 * It is narrow on purpose, because a run that is NOT a URL's payload can carry syntax: inside a tag `/` separates
 * attributes and `=` starts a value, so `;base64,AAAA…/src=https://…` hides an attribute in what looks like base64
 * (the checker's cases, PR #3153). A payload is only a run that follows `data:<type>/<subtype>;base64,` where a URL
 * value opens (`OPENER`), holds no `=` but its final padding, does not end in `/` (a self-closing `/>` in SVG), and is
 * followed by a character that ends a URL. The web-image blocker, which decides what a page may fetch, skips nothing
 * all the same: it reads the whole text, fast (lib/core/web-ref-readers.js copies runs, not characters). A hand-written scan: over a 16 MB deck `/;base64,[A-Za-z0-9+/]{1024,}/g` took 170 ms, this 25.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
function payloadRanges(text) {
  /** @type {Array<[number, number]>} */
  const out = [];
  for (let at = text.indexOf(HEAD); at >= 0; at = text.indexOf(HEAD, at + 1)) {
    const start = at + HEAD.length;
    let end = start;
    while (end < text.length && BASE64[text.charCodeAt(end)]) end++;
    const body = end;
    for (let pad = 0; pad < 2 && text.charCodeAt(end) === 61; pad++) end++; // `=`
    const next = end < text.length ? text.charCodeAt(end) : 32;
    if (body - start >= MIN_PAYLOAD && text.charCodeAt(body - 1) !== 47 && ENDS.has(next) && OPENER.test(text.slice(Math.max(0, at - 128), at))) out.push([start, end]);
    at = end - 1;
  }
  return out;
}


/**
 * The text with each long base64 payload replaced by a stand-in, and the way back, or null when there is nothing to
 * elide (the common case costs one `indexOf`). `rangesOf`: which payloads to cut, every one by default (the engine passes its narrower `imageLineRanges`).
 * `restoreText` gives back a string with every stand-in in it replaced by its payload (the engine's `html`, `css`,
 * …); `standIns` lists each stand-in, so a caller can check every one came through; `lost[k]` is how many characters
 * stand-in k is short of its payload. Putting FINDINGS back (objects walked, a `col` moved past a stand-in) is lint's
 * and review's job alone, so it lives beside them (lib/authoring/elided-findings.js) and stays out of the engine
 * bundle every docs page loads (route budget, PR #3153).
 * @param {string} source
 * @param {{ rangesOf?: (text: string) => Array<[number, number]> }} [opts]
 * @returns {{ text: string, standIns: string[], lost: number[], restoreText: (s: string) => string } | null}
 */
function elidePayloads(source, { rangesOf = payloadRanges } = {}) {
  if (typeof source !== 'string' || source.length < MIN_PAYLOAD || source.indexOf(HEAD) < 0) return null;
  if (source.includes(MARK)) return null;
  /** @type {string[]} */
  const payloads = [];
  const standIns = [];
  const parts = [];
  let from = 0;
  for (const [start, end] of rangesOf(source)) {
    const k = payloads.push(source.slice(start, end)) - 1;
    const standIn = `${source.slice(start, start + KEEP)}${MARK}${k}x`;
    standIns.push(standIn);
    parts.push(source.slice(from, start), standIn);
    from = end;
  }
  if (!payloads.length) return null;
  parts.push(source.slice(from));
  const text = parts.join('');
  // The marker is replaced by the rest of its payload: the KEEP characters before it are the payload's own. A marker with
  // no payload of that number (text this deck did not write, echoing the pattern) is left as it is.
  const back = (s) => s.replace(STAND_IN, (m, k) => (payloads[Number(k)] === undefined ? m : payloads[Number(k)].slice(KEEP)));
  // How many characters each stand-in is short of its payload: lib/authoring/elided-findings.js moves a finding's `col` by it.
  const lost = payloads.map((p, k) => p.length - standIns[k].length);
  return { text, standIns, lost, restoreText: (s) => (s.includes(MARK) ? back(s) : s) };
}

// How many characters lint-core's and review-core's rules and the engine's render were handed, summed over every pass:
// a count of work the tests and the bench assert on (HARD RULE #32), never a timing. A photo deck that reaches them whole
// reads 16 MB a pass.
const readStats = { lintChars: 0, reviewChars: 0, renderChars: 0 };

module.exports = { MARK, elidePayloads, payloadRanges, readStats, MIN_PAYLOAD };
