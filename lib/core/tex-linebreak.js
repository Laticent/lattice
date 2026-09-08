/**
 * tex-linebreak.js — REFLOW a display equation that is wider than the slide.
 *
 * THE PROBLEM THIS SOLVES, and why nothing else can. The Fit Spine's axiom order is
 * collapse → shed → split → never scale (engineering/decisions/2026-06-22-the-fit-spine.md).
 * A display equation defeats three of the four: it sheds nothing (every symbol is load-
 * bearing), and it cannot be SPLIT, because you cannot paginate one expression across two
 * slides. That left scaling — which is the axiom's own last resort and the move #2129 was
 * forced into four separate times, buying fit with legibility each time.
 *
 * COLLAPSE is the move that was missing. An equation set on one line has an intrinsic width
 * nobody chose; set on three, its width is the widest LINE, and that is a real reflow — the
 * same class of move as a two-column layout stacking at portrait. Nothing in the tree
 * preprocessed TeX before this: `renderTex` handed the source straight to KaTeX.
 *
 * MEASURED on `math feature`'s committed sample (the logistic log-likelihood) at
 * `size: portrait`, 972px stage, 2.4em display scale, via `.katex` ink width in a
 * max-content probe:
 *
 *   | form                                        | ink width | over the 972px box |
 *   |---------------------------------------------|-----------|--------------------|
 *   | as authored, one line                       |    2587px |              1615  |
 *   | `aligned`, broken at the top-level `=` only |    2606px |              1634  |
 *   | WHAT THIS PASS EMITS — two lines, descending|           |                    |
 *   | into the bracket                            |    1850px |               878  |
 *
 * Two things in that table decide the design. Breaking at the top-level `=` alone is WORSE
 * than not breaking (the `aligned` column adds width and the long side does not move), so a
 * depth-0-only pass is not merely weak — it is a regression. And the win comes from
 * DESCENDING into the delimiter group that dominates the long side, which is where the
 * author's `+` actually lives.
 *
 * AN EARLIER VERSION OF THIS TABLE DESCRIBED SOMETHING THIS PASS DOES NOT DO. It carried
 * 1743px and 1397px rows and concluded "it reaches 1397px" — but those were two of the
 * hand-written exploration candidates the design was CHOSEN from, not output: the pass emits
 * TWO lines and never puts the `\sum` prefix on a line of its own. Re-measured against the
 * exact string `reflowDisplayTex` returns. Found by the HARD RULE #25 checker — the PR body,
 * the decision record and `math.styles.css` all carried 1850px, and only this comment, the one
 * a maintainer reads, was wrong.
 *
 * WHAT IT DOES NOT DO. It does not close the gap alone — 1850px still exceeds 972px, and the
 * remainder is the tall families' 2.4em display scale-UP. That is the second lever
 * #2136 rules on, and it is applied in `math.styles.css` keyed on the `data-math-reflow`
 * attribute this pass emits: only an equation the pass actually broke is set smaller, so a
 * single-line hero that fits today is untouched.
 *
 * WHY IT REFUSES MORE THAN IT ACCEPTS. A wrong break is worse than no break: it can change
 * what an expression MEANS (a `-` that was a negation, a `+` inside a subscript), and TeX
 * gives no cheap way to be sure. So every rule below is a refusal:
 *
 *   · an author who wrote `\\` or any `\begin{…}` environment has already chosen the layout —
 *     untouched, which is also what keeps every `pmatrix`, `cases` and `aligned` in the
 *     corpus byte-identical;
 *   · only DEPTH-0 operators are break points, where depth counts `{}`, `()`, `[]`, `\left`/
 *     `\right` and `\begin`/`\end` alike — an operator inside a subscript, a fraction or a
 *     function argument is never one;
 *   · a `+`/`-` is binary only when something can precede it; a leading or post-operator sign
 *     is unary and is not a break point;
 *   · the descent runs at most once, into at most one group, and only when that group
 *     dominates the long side — it is a targeted move, not a recursive shredder;
 *   · and the caller re-typesets: `lib/engine/math.js` renders the reflowed source, checks for
 *     `katex-error`, and falls back to the original on any parse failure. This module can be
 *     wrong without a deck being wrong.
 *
 * Pure and fs-free (HARD RULE #7's shape) so the CLI, `validate()` and the browser share one
 * definition. Returns `{ tex, lines }`; `lines === 1` means nothing was changed and `tex` is
 * the input, identically.
 */

/**
 * Source-length budget, in TeX characters, above which a display equation is a REFLOW
 * candidate. Not a width — this pass runs before any box exists.
 *
 * Calibrated against the corpus rather than guessed. Every `$$…$$` in every committed deck was
 * measured for source length; the shipped equations that FIT their tall-family box top out at
 * 60 characters (`math matrix`'s pmatrix is longer but carries `\\`, so it is refused before
 * this number is consulted), and the one that does not fit is 130. 80 sits between them with
 * room on both sides: a 20-character margin over the widest fitting equation, so an author's
 * slightly-longer-but-fine expression is still left alone, and a 50-character margin under the
 * one this exists for. (Those last two read 42 and 122 — hand-counted, both wrong; re-derived
 * over the real `math_block` token contents by the HARD RULE #25 checker.)
 */
const REFLOW_BUDGET = 80;

/** Relations, longest first so `\leq` is matched before `\le`. */
const RELATIONS = [
  '\\Leftrightarrow', '\\Longrightarrow', '\\leftrightarrow', '\\rightarrow',
  '\\subseteq', '\\supseteq', '\\approx', '\\equiv', '\\mapsto', '\\propto',
  '\\subset', '\\supset', '\\simeq', '\\neq', '\\leq', '\\geq', '\\sim',
  '\\le', '\\ge', '\\ne', '\\to', '\\in',
  '=', '<', '>',
];

/** Openers that raise depth, and the closer each expects. */
const OPENERS = { '{': '}', '(': ')', '[': ']' };
const CLOSERS = new Set(['}', ')', ']']);

/**
 * Scan `src` once, recording the DEPTH at every index.
 *
 * `\left…\right` and `\begin{…}…\end{…}` raise depth exactly as a brace does, so an operator
 * inside either is invisible to the break scan. A `\{` / `\}` / `\)` escape does NOT move
 * depth — it is a literal glyph, and counting it flips the whole rest of the expression to
 * the wrong depth, which is how a scanner like this silently starts breaking inside a set.
 *
 * @returns {{depth:Int32Array, groups:Array<{start:number,end:number,inner:[number,number],open:string,close:string,left:boolean}>}}
 *   `groups` are the DEPTH-0 delimiter groups, in source order — the descent's candidates.
 */
function scanDepth(src) {
  const depth = new Int32Array(src.length);
  const groups = [];
  const stack = [];
  let d = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      // A control sequence. `\left`/`\right` and `\begin`/`\end` move depth; every other
      // escape (including `\{`, `\}`, `\|`) is one opaque token whose characters must not
      // be read as delimiters.
      const word = /^\\([a-zA-Z]+)/.exec(src.slice(i));
      if (word && (word[1] === 'left' || word[1] === 'begin')) {
        depth[i] = d;
        // CONSUME THE DELIMITER TOKEN TOO. `\left` is followed by ONE delimiter (`[`, `(`,
        // `\{`, `.`) and `\begin` by `{name}` — and both of those are ALSO plain openers.
        // Skipping only the control word leaves the `[` to be read again on the next
        // iteration, which double-counts the depth and pushes a phantom group; the real
        // `\left…\right` pair then never closes at depth 0 and the descent never sees it.
        const after = word[1] === 'left' ? delimEnd(src, i + word[0].length) : envEnd(src, i + word[0].length);
        if (d === 0) stack.push({ start: i, left: word[1] === 'left', openEnd: after });
        d += 1;
        for (let k = i; k < after; k++) depth[k] = d - 1;
        i = after - 1;
        continue;
      }
      if (word && (word[1] === 'right' || word[1] === 'end')) {
        const after = word[1] === 'right' ? delimEnd(src, i + word[0].length) : envEnd(src, i + word[0].length);
        d = Math.max(0, d - 1);
        for (let k = i; k < after; k++) depth[k] = d;
        if (d === 0 && stack.length) {
          const g = stack.pop();
          // `\left<delim>` … `\right<delim>` — the inner span sits between the two delimiter
          // tokens, which is exactly what the descent re-wraps in fixed-size delimiters.
          if (g.left) {
            groups.push({ start: g.start, end: after, inner: [g.openEnd, i],
              open: src.slice(g.start, g.openEnd), close: src.slice(i, after), left: true });
          }
        }
        i = after - 1;
        continue;
      }
      // `\{` and `\}` are LITERAL BRACES — a set, not a TeX group — and they must still move
      // depth here, because what this scan is looking for is a place it is SAFE TO BREAK. A
      // set-builder is one visual unit: `S = \{x : f(x) < y\}` carries a `<` that is a relation
      // by every other test in this file, and breaking there aligns a run on the inside of a
      // set. They are deliberately NOT recorded as descent candidates — a set's contents are not
      // a sum of terms to paginate.
      //
      // Only this pair. `\lvert`, `\langle` and the rest are delimiters too, but pairing them
      // by name is guesswork (`\vert` opens AND closes), and a wrong pair corrupts the depth of
      // everything after it. An operator inside one of those is simply not found, which costs a
      // break the pass would otherwise have taken and can never cause a wrong one.
      if (word === null && (src[i + 1] === '{' || src[i + 1] === '}')) {
        if (src[i + 1] === '{') { depth[i] = d; depth[i + 1] = d; d += 1; }
        else { d = Math.max(0, d - 1); depth[i] = d; depth[i + 1] = d; }
        i += 1;
        continue;
      }
      // Any other escape: skip the backslash AND its name (or its single escaped char), so its
      // characters are never read as delimiters.
      depth[i] = d;
      const len = word ? word[0].length : 2;
      for (let k = 1; k < len && i + k < src.length; k++) depth[i + k] = d;
      i += len - 1;
      continue;
    }
    if (OPENERS[c]) {
      depth[i] = d;
      if (d === 0) stack.push({ start: i, plain: c });
      d += 1;
      continue;
    }
    if (CLOSERS.has(c)) {
      d = Math.max(0, d - 1);
      depth[i] = d;
      if (d === 0 && stack.length) {
        const g = stack.pop();
        if (g.plain) groups.push({ start: g.start, end: i + 1, inner: [g.start + 1, i], open: g.plain, close: c, left: false });
      }
      continue;
    }
    depth[i] = d;
  }
  return { depth, groups };
}

/**
 * Does `src` carry an unescaped `%` — a LaTeX COMMENT?
 *
 * `\%` is a literal percent sign and `\\%` is a line break followed by a comment, so the test is
 * whether the run of backslashes immediately before the `%` is EVEN.
 */
function hasComment(src) {
  for (let i = src.indexOf('%'); i >= 0; i = src.indexOf('%', i + 1)) {
    let back = 0;
    for (let k = i - 1; k >= 0 && src[k] === '\\'; k--) back += 1;
    if (back % 2 === 0) return true;
  }
  return false;
}

/** The index just past a `\begin{name}` / `\end{name}` brace group starting at `at`. */
function envEnd(src, at) {
  if (src[at] !== '{') return at;
  const close = src.indexOf('}', at);
  return close < 0 ? at + 1 : close + 1;
}

/** The index just past a `\left`/`\right` delimiter token starting at `at`. */
function delimEnd(src, at) {
  while (at < src.length && /\s/.test(src[at])) at += 1;
  if (src[at] === '\\') {
    const w = /^\\([a-zA-Z]+|.)/.exec(src.slice(at));
    return at + (w ? w[0].length : 1);
  }
  return at + 1;
}

/** Is the `+`/`-` at `i` BINARY (something precedes it) rather than a sign? */
function isBinarySign(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return false;
  const c = src[j];
  // After an opener, another operator, or a relation, a sign is unary.
  if ('+-*/^_=<>([{,&'.includes(c)) return false;
  if (c === '\\') return false;
  return true;
}

/** Depth-0 break points of one kind. Returns `[{at, len, sym}]` in source order. */
function breakPoints(src, depth, kind) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (depth[i] !== 0) continue;
    if (kind === 'rel') {
      const sym = RELATIONS.find((r) => src.startsWith(r, i));
      if (!sym) continue;
      // `\leq` must not match inside `\leqslant`; a control sequence ends at a non-letter.
      if (sym[0] === '\\' && /[a-zA-Z]/.test(src[i + sym.length] || '')) continue;
      out.push({ at: i, len: sym.length, sym });
      i += sym.length - 1;
    } else {
      if (src[i] !== '+' && src[i] !== '-') continue;
      if (!isBinarySign(src, i)) continue;
      out.push({ at: i, len: 1, sym: src[i] });
    }
  }
  return out;
}

/** Split `src` at the given break points → `[{op, text}]`, first `op` null. */
function segmentsAt(src, points) {
  const out = [];
  let from = 0;
  let op = null;
  for (const p of points) {
    out.push({ op, text: src.slice(from, p.at).trim() });
    op = p.sym;
    from = p.at + p.len;
  }
  out.push({ op, text: src.slice(from).trim() });
  return out.filter((s) => s.text || s.op);
}

/**
 * A line's rendered WEIGHT, in glyphs — not its source length.
 *
 * Source length is a bad proxy for width and the error is not small: `\sigma` is six
 * characters and one glyph, `\hat\beta` is nine and one, while `y_i` is three and two. A
 * refusal threshold read off raw length would refuse a symbol-dense equation that reflows
 * beautifully and accept a plain one that gains nothing. Each control sequence counts 1, each
 * ordinary non-space character counts 1, and grouping braces count 0 — they set no type.
 */
function weight(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) continue;
    if (c === '{' || c === '}') continue;
    if (c === '\\') {
      const w = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
      i += (w ? w[0].length : 1) - 1;
      n += 1;
      continue;
    }
    n += 1;
  }
  return n;
}

/** The widest emitted line, in glyphs (the operator rides its own line). */
const widest = (segs) => segs.reduce((m, s, i) => Math.max(m, weight(s.text) + (i > 1 && s.op ? weight(s.op) + 1 : 0)), 0);

/**
 * A break must EARN the `aligned` wrapper. Below this fraction of the unbroken expression's
 * weight, it does; at or above it, the wrapper costs more than the break saves.
 *
 * Measured, and this number is the one the whole pass turns on. Breaking `feature`'s sample
 * at its top-level `=` and nothing else leaves the long side at 0.90 of the whole and renders
 * 2606px — WIDER than the 2587px it started at, because `aligned` adds an alignment column
 * and the long side never moved. Descending into the bracket leaves it at 0.45 and renders
 * 1850px. 0.75 sits between them, nearer the useless break than the useful one, because the
 * failure this guards against is shipping a two-line equation that is no narrower.
 */
const MIN_GAIN = 0.75;

/** Render segments as an `aligned` block. */
function emit(segs) {
  const relLed = segs.length > 1 && RELATIONS.includes(segs[1].op);
  const lines = [];
  if (relLed) {
    // `lhs ={}& rhs` — the relation sets the alignment column, which is what a reader
    // follows down a multi-line equation. `{}` keeps `=` a binary relation rather than a
    // line-leading one, so its spacing matches the single-line form.
    lines.push(`${segs[0].text} ${segs[1].op}{}& ${segs[1].text}`);
    for (let i = 2; i < segs.length; i++) lines.push(`&\\quad ${segs[i].op} ${segs[i].text}`);
  } else {
    // No relation: a bare sum of terms. The column opens on the first line so the operators
    // stack under one another.
    lines.push(`& ${segs[0].text}`);
    for (let i = 1; i < segs.length; i++) lines.push(`&\\quad ${segs[i].op} ${segs[i].text}`);
  }
  return { tex: `\\begin{aligned}\n${lines.join(' \\\\\n')}\n\\end{aligned}`, lines: lines.length };
}

/**
 * The closing delimiter token of a `\left…\right` group — READ OFF THE GROUP, never searched for.
 *
 * This used to be `src.lastIndexOf('\\right', g.end)`, and that is wrong twice. `lastIndexOf`
 * accepts a match starting AT `from`, and `g.end` is the index just past the group — so a token
 * that merely BEGINS with `\right` and sits immediately after it wins. `\rightarrow` is the common
 * one: `\left( … \right)\rightarrow w` produced the closer `a` and emitted `\Bigra`, an undefined
 * control sequence, with the group's `)` silently gone. `\rightharpoonup` and
 * `\rightleftharpoons` do the same.
 *
 * `scanDepth` already records the exact close token when it balances the pair, so there is
 * nothing to search for. (Found by the HARD RULE #25 red team, on a real render.)
 */
function closerOf(_src, g) {
  return String(g.close || '').replace(/^\\right/, '').trim();
}

/**
 * `[` → `\Bigl[`, `\{` → `\Bigl\{`, `.` → `` (a null delimiter needs no fixed form).
 *
 * A `\left…\right` pair CANNOT span a `\\` inside `aligned` — each line must balance its own
 * pair — so the descent trades the auto-sized pair for a fixed-size one. `\Big` rather than
 * `\big` or `\Bigg`: measured on the `feature` sample, `\Bigl[` sets the same bracket height
 * beside a `\sum` that the `\left[` did.
 */
function fixedDelim(token, side) {
  const d = String(token).replace(/^\\left/, '').replace(/^\\right/, '').trim();
  if (!d || d === '.') return '';
  return `\\Big${side}${d}`;
}

/**
 * The DESCENT: break inside the one delimiter group that dominates the long side.
 *
 * This is where the win is. `feature`'s `+` lives inside `\left[ … \right]`, so a depth-0
 * scan cannot see it — and the depth-0 break alone renders WIDER than no break at all.
 * Returns segments, or null when there is nothing safe to descend into: no group, more than
 * one candidate, a group that is a minority of the side, or no operator inside it.
 */
function descend(body, groups, relPt) {
  const relAt = relPt ? relPt.at + relPt.len : 0;
  const side = body.slice(relAt);
  const cands = groups.filter((g) => g.start >= relAt && (g.end - g.start) / side.length >= 0.6);
  if (cands.length !== 1) return null;
  const g = cands[0];
  const inner = body.slice(g.inner[0], g.inner[1]);
  const innerOps = breakPoints(inner, scanDepth(inner).depth, 'op');
  if (!innerOps.length) return null;
  const pieces = segmentsAt(inner, innerOps);
  if (pieces.length < 2) return null;
  const open = g.left ? fixedDelim(g.open, 'l') : `\\Bigl${g.open}`;
  const close = g.left ? fixedDelim(closerOf(body, g), 'r') : `\\Bigr${g.close}`;
  const head = body.slice(relAt, g.start).trim();
  const after = body.slice(g.end).trim();
  const last = pieces.length - 1;
  const lead = `${head} ${open} ${pieces[0].text}`.trim();
  const tailPieces = pieces.slice(1).map((p, k) => ({
    op: p.op,
    text: k === last - 1 ? `${p.text} ${close}${after ? ` ${after}` : ''}`.trim() : p.text,
  }));
  // NO RELATION MEANS NO RELATION — the lead is the first segment, not the second.
  //
  // This used to emit `{op: null, text: ''}` followed by `{op: relPt ? relPt.sym : '+', …}`, so a
  // long expression that is one dominant group with no top-level relation came out with a `+` the
  // author never wrote, in front of the opening bracket, under an empty `aligned` row. A sign is
  // meaning. (Found by the HARD RULE #25 red team, on a real render.)
  if (!relPt) return [{ op: null, text: lead }, ...tailPieces];
  return [
    { op: null, text: body.slice(0, relPt.at).trim() },
    { op: relPt.sym, text: lead },
    ...tailPieces,
  ];
}

/**
 * Reflow one display equation onto `aligned` lines.
 *
 * @param {string} src the TeX between `$$…$$`, exactly as authored
 * @param {{budget?:number}} [opts]
 * @returns {{tex:string, lines:number}} `lines === 1` → `tex` is `src`, unchanged
 */
function reflowDisplayTex(src, opts = {}) {
  const keep = { tex: src, lines: 1 };
  if (typeof src !== 'string') return keep;
  const budget = opts.budget ?? REFLOW_BUDGET;
  const body = src.trim();
  if (!body || body.length <= budget) return keep;
  // The author already chose a multi-line layout. Refuse: this pass has nothing to add and
  // everything to break. This is also what keeps every `pmatrix` in the corpus untouched.
  //
  // FOUR SPELLINGS, not one. `\\` and any `\begin{…}` environment were the original pair;
  // `\cr` and `\newline` are the other two ways to break a line in KaTeX and were missed, so an
  // author's own two-line layout was overridden and the emitted `\cr \\` pair inserted a blank
  // band (measured on a real render — and it turned a fitting slide into a clipped one).
  if (body.includes('\\\\') || /\\begin\{/.test(body)) return keep;
  if (/\\(?:cr|newline)(?![a-zA-Z])/.test(body)) return keep;
  // A `%` COMMENT MAKES THIS PASS UNSOUND IN BOTH DIRECTIONS, so any source carrying one is
  // refused outright. `emit` joins segments with a literal ` \\`, and a `%` earlier on that line
  // comments the terminator out — the next line merges in as a third alignment column. Worse, the
  // break scan reads straight through a comment, so an operator INSIDE it becomes a break point
  // and everything the author commented OUT is put back on the slide (measured: nine terms
  // restored, and a slide that fitted came back tagged "Content clipped").
  //
  // Reasoning about comments is not worth it: strip them and the pass changes what the author
  // wrote; honor them and every offset in `scanDepth` needs a comment-aware skip. Refusing costs
  // a break on an equation that carries a note, which is rare and harmless.
  if (hasComment(body)) return keep;

  const { depth, groups } = scanDepth(body);
  const relPt = breakPoints(body, depth, 'rel')[0] || null;
  const ops = breakPoints(body, depth, 'op');

  const plain = segmentsAt(body, [...(relPt ? [relPt] : []), ...ops].sort((a, b) => a.at - b.at));
  const deep = descend(body, groups, relPt);

  const whole = weight(body);
  const options = [plain.length > 1 ? plain : null, deep].filter(Boolean);
  if (!options.length) return keep;
  const best = options.reduce((a, b) => (widest(b) < widest(a) ? b : a));
  // A break that does not measurably shorten the longest line is not a break — see MIN_GAIN.
  if (widest(best) >= whole * MIN_GAIN) return keep;
  const out = emit(best);
  // ONE emitted line is not a break, and the RETURN CONTRACT says so. A two-segment relation
  // split emits a single `lhs ={}& rhs` row, so `lines` came back 1 while `tex` had been
  // rewritten — which contradicts this function's own docblock ("`lines === 1` means nothing was
  // changed and `tex` is the input, identically") and would hand a future caller an `aligned`
  // wrapper it was told it could not receive. Today `displayBlock` tests `lines > 1` first, so
  // this was latent; it is closed at the source rather than left as a landmine.
  return out.lines > 1 ? out : keep;
}

module.exports = { reflowDisplayTex, REFLOW_BUDGET, MIN_GAIN, _scanDepth: scanDepth, _weight: weight };
