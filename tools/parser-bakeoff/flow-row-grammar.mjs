/**
 * The flowchart row (`Storefront -SEV1-> Payments`) as a Segno grammar, with `attempt()`.
 *
 * Phase 3 of engineering/decisions/2026-09-28-segno-unified-inline-notation.md moves the
 * flowchart's list text onto Segno; this is its starting point, and the one copy of it. Two
 * readers use it: `npm run parser:bakeoff:flow` (parity and speed against the kernel) and
 * test/unit/tools/flow-row-grammar.test.js, which holds it to `splitRow`
 * (lib/core/flowchart-grammar.js) on the corpus and a fuzz on every PR, so an engine change that
 * breaks it fails CI rather than waiting for someone to run the bake-off. When phase 3 deletes
 * `splitRow`, freeze its outputs first: the test needs an oracle that outlives it.
 *
 * Pass the Segno API in (`makeRowGrammar(S)`): the bake-off bundles Segno's TypeScript source,
 * the test loads its built dist.
 */

// The kernel's character classes: SPACE is a label character, a newline is not, and both end an
// arrow (`isSpace` in flowchart-grammar.js).
export const SPACE = ' \t\r';
export const BOUNDARY = ' \t\r\n'; // what must follow an arrow (or the end)
export const LABEL_MAX = 61; // readArrow's `j - i <= LABEL_MAX + 1`, as a label length
const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

export function makeRowGrammar(S) {
  const { alt, any, attempt, chars, greedy, many, many1, node, noneOf, opt, ref, seq } = S;

  /** A label character that keeps the arrow open after a non-space. */
  const labelChar = (c) => noneOf(`${SPACE}\n<>${c}`, 'a label character');
  /** The label's running text: a space run must be followed by a label character or a shaft (a
   *  shaft after a space never closes). */
  const running = (c) => many(alt(labelChar(c), seq(many1(chars(SPACE, 'a space')), alt(labelChar(c), c))));

  /** Every arrow whose shaft is `c`, after an optional `<`. `left` decides whether a bare shaft is
   *  an arrow (`<-` is; `-` is not). The label is not a node: it is the text between the first
   *  shaft and the closing run, so the reader takes it off the arrow's own offsets. */
  function shaft(c, left) {
    const N = labelChar(c);
    const U = running(c);
    const head = node('head', '>');
    const closing = seq(many1(c), many(seq(N, U, many1(c))), opt(head));
    const labeled = seq(alt(N, '<'), U, closing);
    const doubled = seq(c, opt(alt(head, seq(node('third', c), opt(head)))));
    const branches = [node('doubled', doubled), head, node('labeled', labeled)];
    return left ? seq(c, opt(alt(...branches))) : seq(c, alt(...branches));
  }

  /** A labeled arrow that MUST end in `>`. The kernel caps the LABEL at 61 characters, so a headed
   *  and an unheaded arrow at the cap differ in length by one, and each is its own attempt. */
  function headedLabel(c) {
    const N = labelChar(c);
    const U = running(c);
    return seq(c, node('labeled', seq(alt(N, '<'), U, many1(c), many(seq(N, U, many1(c))), node('head', '>'))));
  }

  const both = (make) => alt(node('dash', make('-')), node('eq', make('=')));
  const wchar = alt(
    seq('\\', greedy(opt(node('esc', chars(PUNCT, 'punctuation'))))),
    noneOf(`${BOUNDARY}\\`, 'a word character'),
  );
  const arrowAt = (x, max) => attempt(node('arrow', x), { max, next: BOUNDARY });

  // At a word start, try an arrow; a failed attempt hands the character on to the word. Headed
  // first, because the unheaded window is one shorter and would read a headed arrow at the cap as
  // an unheaded one followed by `>` (which its `next` check then refuses).
  const rowSpec = {
    start: 'row',
    rules: {
      row: many(alt(chars(BOUNDARY, 'a space'), ref('word'))),
      word: alt(
        arrowAt(both(headedLabel), 1 + LABEL_MAX + 2),
        arrowAt(both((c) => shaft(c, false)), 1 + LABEL_MAX + 1),
        arrowAt(seq('<', both(headedLabel)), 2 + LABEL_MAX + 2),
        arrowAt(seq('<', both((c) => shaft(c, true))), 2 + LABEL_MAX + 1),
        seq(wchar, greedy(many(wchar))),
      ),
    },
  };

  // The spike's finding, kept as a check: the arrow ALONE is a strict LL(1) grammar.
  const arrowSpec = {
    start: 'window',
    rules: {
      window: seq(ref('arrow'), opt(seq(chars(BOUNDARY, 'a space'), many(any())))),
      arrow: alt(
        node('dash', shaft('-', false)),
        node('eq', shaft('=', false)),
        seq('<', alt(node('dash', shaft('-', true)), node('eq', shaft('=', true)))),
      ),
    },
  };

  return { rowSpec, arrowSpec, shaft };
}

/** One arrow node (from either runtime) as the kernel's arrow record. */
function arrowOf(s, a) {
  const shaftNode = a.kids[0]; // dash | eq
  const left = s[a.from] === '<';
  const heavy = shaftNode.kind === 'eq';
  const sub = shaftNode.kids.find((k) => k.kind === 'doubled' || k.kind === 'labeled');
  const headed = (n) => n.kids.some((k) => k.kind === 'head');
  if (sub?.kind === 'labeled') {
    const has = headed(sub);
    return { heavy, label: s.slice(sub.from, a.to - (has ? 2 : 1)), dir: has ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false };
  }
  if (sub?.kind === 'doubled') {
    if (headed(sub)) return { heavy, label: '', dir: left ? 'both' : 'out', mermaid: true };
    if (left) return { heavy, label: '', dir: 'in', mermaid: true };
    return { heavy, label: '', dir: 'none', mermaid: sub.kids.some((k) => k.kind === 'third') };
  }
  return { heavy, label: '', dir: headed(shaftNode) ? (left ? 'both' : 'out') : 'in', mermaid: false };
}

/** compile()'s tree as splitRow's parts and arrows: text between arrows, an escape's backslash
 *  dropped (`\&` becomes U+0001, as the kernel's ESC_AMP). */
export function rowFromNodes(s, top) {
  const parts = [];
  const arrows = [];
  let text = '';
  let at = 0;
  const visit = (n) => {
    if (n.kind === 'arrow') { text += s.slice(at, n.from); parts.push(text); text = ''; at = n.to; arrows.push(arrowOf(s, n)); return; }
    if (n.kind === 'esc') { text += s.slice(at, n.from - 1) + (s[n.from] === '&' ? '\u0001' : s[n.from]); at = n.to; return; }
    for (const k of n.kids) visit(k);
  };
  for (const n of top) visit(n);
  parts.push(text + s.slice(at));
  return { parts, arrows };
}

const subtree = (buf, kinds, lo, hi) => {
  const out = [];
  for (let j = lo; j < hi; j = buf[j + 3]) out.push({ kind: kinds[buf[j]], from: buf[j + 1], to: buf[j + 2], kids: subtree(buf, kinds, j + 4, buf[j + 3]) });
  return out;
};

/** The generated parser's flat tree (four integers per node), read in place. */
export function rowFromFlat(s, { buf, top, kinds }) {
  const ARROW = kinds.indexOf('arrow');
  const ESC = kinds.indexOf('esc');
  const parts = [];
  const arrows = [];
  let text = '';
  let at = 0;
  for (let k = 0; k < top; ) {
    const kind = buf[k];
    if (kind === ARROW) {
      text += s.slice(at, buf[k + 1]); parts.push(text); text = ''; at = buf[k + 2];
      arrows.push(arrowOf(s, { kind: 'arrow', from: buf[k + 1], to: buf[k + 2], kids: subtree(buf, kinds, k + 4, buf[k + 3]) }));
      k = buf[k + 3];
      continue;
    }
    if (kind === ESC) { text += s.slice(at, buf[k + 1] - 1) + (s[buf[k + 1]] === '&' ? '\u0001' : s[buf[k + 1]]); at = buf[k + 2]; }
    k += 4;
  }
  parts.push(text + s.slice(at));
  return { parts, arrows };
}

/** The bake-off's fuzz: short rows over the characters that matter, and labels around the cap. */
export function flowFuzz(count = 200_000, seed = 0x2462) {
  // `\r` too: it is a label space and a boundary (`isSpace`), and without it a grammar that
  // dropped `\r` from either passed (the PR's second checker).
  const ALPHA = ['-', '=', '<', '>', ' ', 'a', 'b', '\\', '&', '\t', '\n', '\r', 'x', '-', '-', '>', '='];
  let st = seed;
  const rand = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
  const out = [];
  for (let n = 0; n < count; n++) {
    let t = '';
    const len = 1 + Math.floor(rand() * 24);
    for (let k = 0; k < len; k++) t += ALPHA[Math.floor(rand() * ALPHA.length)];
    out.push(t);
  }
  for (let L = 55; L <= 70; L++) {
    for (const c of ['-', '=']) out.push(`A ${c}${'y'.repeat(L)}${c}> B`, `A <${c}${'y'.repeat(L)}${c} B`, `A ${c}${'y '.repeat(L >> 1)}y${c}>`);
  }
  return out;
}
