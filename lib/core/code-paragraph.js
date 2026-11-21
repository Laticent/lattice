/**
 * lib/core/code-paragraph.js — find the paragraphs whose whole content is one code span (`<p><code>…</code></p>`).
 *
 * Several engine passes lift such a paragraph out of a section: a chart's eyebrow (lib/transformers/chart-frame.js), a
 * label set or a legend (lib/core/lift-label-set.js), a split page's eyebrow (lib/core/split-envelope.js). Each used a
 * regex of the shape `<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>`, which is quadratic on markup with many `<p`
 * and no `>`, or many code spans and no closing `</p>`: every start scanned to the end before failing (HARD RULE #32,
 * followups.d/3045-p2-regex-recheck-gate.md). These walkers answer what those regexes answered in one pass: each
 * search position only moves forward, and once a search misses, no later start can match.
 * test/unit/core/code-paragraph.test.js holds each to the regex it replaced by a seeded fuzz.
 *
 * Pure string work: both render paths call it.
 */

/**
 * Every code-only paragraph, left to right and not overlapping, as one of two global regexes finds them:
 *   loose (default)   `/<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/g`: `<p` with no boundary (so `<pre` opens one),
 *                     and a lazy body that runs past a `</code>` to the first one a `</p>` follows;
 *   tight             `/<p\b[^>]*>\s*<code[^>]*>((?:(?!<\/code>)[\s\S])*)<\/code>\s*<\/p>/g`: `<p` closed by a non-word
 *                     character, and a body that stops at the first `</code>`, which a `</p>` must then follow.
 * `limit` stops after that many. Each match: { index, end, inner }.
 *
 * Linear: each search remembers its answer and the starts only move forward, and each blank run is walked once and its
 * end remembered by where the walk began (many starts can share one `>` and the run after it).
 */
function codeParagraphs(html, { tight = false, limit = Infinity } = {}) {
  const src = String(html);
  const at = codeParagraphAt(src, tight);
  const out = [];
  for (let pos = 0; out.length < limit; ) {
    const lt = src.indexOf('<p', pos);
    if (lt < 0) break;
    const m = at(lt);
    if (m === undefined) break;
    pos = m ? m.end : lt + 1;
    if (m) out.push(m);
  }
  return out;
}

/**
 * `at(lt)`: the code-only paragraph that starts at the `<p` at `lt`, as the regex anchored there finds it, or null; and
 * undefined once no `<p` at `lt` or later can open one. Call it with starts that never decrease: the masthead's eyebrow
 * scan (lib/forms/cell/masthead/masthead.transform.js) asks at each top-level `<p`, in order.
 */
function codeParagraphAt(html, tight = false) {
  const src = String(html);
  const runEnd = new Map();
  const skip = (i) => {
    let e = runEnd.get(i);
    if (e === undefined) {
      for (e = i; e < src.length && /\s/.test(src[e]); ) e++;
      runEnd.set(i, e);
    }
    return e;
  };
  // `find(from)` for a `from` that never decreases: an answer stands until passed, and a miss is final.
  const finder = (find) => {
    let p = -1;
    let none = false;
    return (from) => {
      if (none) return -1;
      if (p < from) p = find(from);
      none = p < 0;
      return p;
    };
  };
  const pGt = finder((f) => src.indexOf('>', f));
  const codeGt = finder((f) => src.indexOf('>', f));
  // The next `</code>`: in the loose reading, the next one a `\s*</p>` follows.
  const closed = finder((f) => {
    for (let k = f; ; k++) {
      k = src.indexOf('</code>', k);
      if (k < 0 || tight || src.startsWith('</p>', skip(k + 7))) return k;
    }
  });
  return (lt) => {
    if (tight && /\w/.test(src[lt + 2] || '')) return null;
    const gt = pGt(lt + 2);
    if (gt < 0) return undefined;
    const c = skip(gt + 1);
    if (!src.startsWith('<code', c)) return null;
    const cgt = codeGt(c + 5);
    const close = cgt < 0 ? -1 : closed(cgt + 1);
    if (close < 0) return undefined;
    const end = skip(close + 7);
    // tight: the first `</code>` must be followed by `</p>`
    return src.startsWith('</p>', end) ? { index: lt, end: end + 4, inner: src.slice(cgt + 1, close) } : null;
  };
}

/**
 * The code-only paragraph that ends the string, as `/<p[^>]*>\s*<code>([^<]+?)<\/code>\s*<\/p>\s*$/` finds it: a bare
 * `<code>`, a body with no `<` and at least one character, and nothing but blanks after `</p>`. Read from the end
 * (`trimEnd` strips what `\s` matches). Returns { index, inner } or null.
 */
function trailingCodeParagraph(html) {
  const src = String(html);
  const a = src.trimEnd();
  if (!a.endsWith('</p>')) return null;
  const b = a.slice(0, -4).trimEnd();
  if (!b.endsWith('</code>')) return null;
  const close = b.length - 7;
  const lt = b.lastIndexOf('<', close - 1);
  if (lt < 0 || !b.startsWith('<code>', lt) || lt + 6 >= close) return null;
  const pre = b.slice(0, lt).trimEnd();
  if (!pre.endsWith('>')) return null;
  // The leftmost `<p` after the previous `>`, whose `[^>]*` then reaches this one.
  const gt = pre.length - 1;
  const p = src.indexOf('<p', src.lastIndexOf('>', gt - 1) + 1);
  return p < 0 || p + 2 > gt ? null : { index: p, inner: b.slice(lt + 6, close) };
}

module.exports = { codeParagraphs, codeParagraphAt, trailingCodeParagraph };
