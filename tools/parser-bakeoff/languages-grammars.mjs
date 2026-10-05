/**
 * parser-bakeoff languages arm — grammars. CSS, HTML and Markdown written as Segno grammars, the
 * probe behind decision 21 of engineering/decisions/2026-09-28-segno-unified-inline-notation.md.
 *
 * They are a TOKENIZER layer, not three parsers: no element tree, no rule-versus-declaration
 * split, no CommonMark block pass — those take code on top. What each grammar still cannot do is
 * marked STILL. What `greedy()` and `until()` made possible, which the strict LL(1) check refused,
 * is marked NEEDS.
 *
 * In all three, every run of like characters is a greedy loop, so a run next to a run takes the
 * longest match (NEEDS greedy).
 */

/** @param S the Segno module (index.ts) */
export function languageGrammars(S) {
  const { seq, alt, many, opt, ref, node, chars, noneOf, greedy, until } = S;
  const any = S.any;
  const C = S.charset;
  const cr = (a, b) => C.ofRange(a, b);
  const WS = ' \t\r\n\f';
  const NONASCII = cr('\u0080', '\uffff');
  /** A run of one or more characters from `x`, longest match. */
  const run1 = (x) => seq(x, greedy(many(x)));

  // ── CSS ─────────────────────────────────────────────────────────────────────
  // NEEDS greedy: `/` is a delimiter and the start of `/*`; `greedy(opt(...))` says a star after a
  //   slash always opens a comment.
  // NEEDS until: a comment reads to `*/`, and an unclosed one to the end, as CSS Syntax L3 says.
  // STILL: declaration vs nested rule — an unbounded prefix; a short pass over the flat run splits them.
  const wch = alt(S.set(C.union(C.ofChars('-_.#%@!'), cr('a', 'z'), cr('A', 'Z'), cr('0', '9'), NONASCII), 'a word character'), seq('\\', any()));
  const cssStr = (q) => seq(q, many(alt(noneOf(`${q}\\\n`), seq('\\', any()))), q);
  const css = {
    start: 'run',
    rules: {
      run: many(alt(
        run1(chars(WS)),
        node('word', run1(wch)),
        node('string', alt(cssStr('"'), cssStr("'"))),
        node('punct', chars(':;,>+~=|^$&<?*')),
        node('block', seq('{', ref('run'), '}')),
        node('paren', seq('(', ref('run'), ')')),
        node('bracket', seq('[', ref('run'), ']')),
        seq('/', greedy(opt(node('comment', seq('*', until('*/', { orEnd: true })))))),
      )),
    },
  };

  // ── HTML ────────────────────────────────────────────────────────────────────
  // NEEDS until: raw text. `<script>` and `<style>` read to their close tag, so a `<` inside a
  //   script is script. The tag name is matched letter by letter (a small trie), so `<strong>`,
  //   `<sc>` and `<scripts>` are still ordinary tags.
  // NEEDS greedy: spaces around `=` in an attribute, and `/` inside an unquoted value.
  // NEEDS until: a comment reads to `-->`, and an unclosed one to the end, as browsers do.
  // STILL: a close tag is not checked against its open tag, and implied closes are not applied —
  //   both are a stack walk over the flat output, in code.
  // STILL: until() is case-sensitive, so `</SCRIPT>` does not end a lower-case `<script>`.
  const nameCs = C.union(cr('a', 'z'), cr('A', 'Z'), cr('0', '9'), C.ofChars('-_:.'));
  const nameCh = S.set(nameCs, 'a name character');
  const attrCh = noneOf(`${WS}"'>/=<`, 'an attribute name');
  const val = alt(seq('"', many(noneOf('"')), '"'), seq("'", many(noneOf("'")), "'"), run1(noneOf(`${WS}"'>=<\``)));
  const attrs = many(alt(run1(chars(WS)), node('attr', run1(attrCh)), seq('=', greedy(many(chars(WS))), val), '/'));
  // After a tag name: a space, a slash or `>` — anything else would still be the name.
  // A named rule, not an inlined expression: the generator copies an expression into every place it
  // is used, and the trie uses this at every letter of every raw name. Inlined, r_lt was 141k
  // characters — past what V8 will optimize — and the page parsed 7x slower.
  const openRest = ref('openRest');

  /** `<` + a tag name, where the names in `raw` switch to raw text until their close tag. */
  function tagTrie(raw) {
    const root = { kids: new Map(), end: null };
    for (const w of raw) { let n = root; for (const ch of w) { if (!n.kids.has(ch)) n.kids.set(ch, { kids: new Map(), end: null }); n = n.kids.get(ch); } n.end = w; }
    const generic = (exclude) => seq(S.set(C.intersect(nameCs, C.complement(C.ofChars(exclude)))), greedy(many(nameCh)), openRest);
    const build = (n, depth) => {
      const branches = [];
      for (const [ch, kid] of n.kids) branches.push(seq(chars(ch + ch.toUpperCase()), build(kid, depth + 1)));
      const taken = [...n.kids.keys()].map((c) => c + c.toUpperCase()).join('');
      // Another name character: an ordinary tag whose name merely starts like a raw one.
      if (depth === 0) branches.push(seq(S.set(C.intersect(C.union(cr('a', 'z'), cr('A', 'Z')), C.complement(C.ofChars(taken)))), greedy(many(nameCh)), openRest));
      else branches.push(generic(taken));
      // The name ends here.
      if (n.end) branches.push(seq(openRest, node('raw', until(`</${n.end}`, { orEnd: true })), greedy(many(noneOf('>'))), greedy(opt('>'))));
      else if (depth > 0) branches.push(openRest);
      return alt(...branches);
    };
    return node('open', build(root, 0));
  }

  const html = {
    start: 'doc',
    rules: {
      doc: many(alt(node('text', run1(noneOf('<'))), seq('<', ref('lt')))),
      lt: alt(
        tagTrie(['script', 'style']),
        node('close', seq('/', S.set(C.union(cr('a', 'z'), cr('A', 'Z'))), greedy(many(nameCh)), greedy(many(chars(WS))), '>')),
        seq('!', alt(
          node('comment', seq('--', until('-->', { orEnd: true }))),
          node('decl', seq(noneOf('-'), until('>', { orEnd: true }))))),
        node('decl', seq('?', until('>', { orEnd: true }))),
        node('text', seq(chars(`${WS}0123456789=<`), greedy(many(noneOf('<'))))), // a stray `<`, read as text
      ),
      openRest: alt(seq(chars(`${WS}/`), attrs, '>'), '>'),
    },
  };

  // ── Markdown ────────────────────────────────────────────────────────────────
  // NEEDS greedy: a last line with no newline — `greedy(opt('\n'))` ends each line.
  // NEEDS until: a fence body reads to the closing fence in one search (strictly, each body line
  //   starting with a backtick recursed, and spent the 64-level nesting cap).
  // NEEDS greedy: a code span left open ends at the line end, rather than failing the document.
  // STILL: a line's meaning cannot depend on the next line (setext headings) or on its container
  //   (lists, quotes). That is CommonMark's block pass, in code.
  // STILL: a code span that wraps onto the next line is read as two half-spans.
  // STILL: a fence inside a list item closes at the first ``` (its indent is not tracked).
  const rest = greedy(many(noneOf('\n')));
  const code = node('code', seq('`', greedy(many(noneOf('`\n'))), greedy(opt('`'))));
  const inl = greedy(many(alt(code, run1(noneOf('`\n')))));
  const T3 = '\n```';
  /** After an opening fence's newline: the closing fence at once, or a body to the next `T`. */
  const bodyFrom = (T) => alt(
    seq('`', alt(
      seq('`', alt(seq('`', rest), seq(noneOf('`'), until(T, { orEnd: true }), rest))),
      seq(noneOf('`'), until(T, { orEnd: true }), rest))),
    seq(noneOf('`'), until(T, { orEnd: true }), rest));
  // A line that starts with spaces: an indented fence (inside a list item), or indented text.
  const afterIndentTick = alt(
    seq('`', greedy(opt(alt(
      node('fence', seq('`', until('```', { orEnd: true }), rest)),   // a fence inside a list item
      node('indent', seq(noneOf('`\n'), inl)))))),
    node('indent', seq(node('code', seq(noneOf('`\n'), greedy(many(noneOf('`\n'))), greedy(opt('`')))), inl)));
  const indented = seq(chars(' \t'), greedy(many(chars(' \t'))), greedy(opt(alt(
    node('indent', seq(noneOf(' \t\n`'), inl)),
    seq('`', greedy(opt(afterIndentTick)))))));
  const md = {
    start: 'doc',
    rules: {
      doc: many(alt('\n', seq(ref('line'), greedy(opt('\n'))))),
      line: alt(
        seq('#', greedy(many('#')), greedy(opt(alt(node('heading', seq(chars(' \t'), inl)), node('para', seq(noneOf('# \t\n'), inl)))))),
        node('quote', seq('>', inl)),
        node('table', seq('|', inl)),
        seq('-', greedy(opt(alt(node('item', seq(chars(' \t'), inl)), node('rule', seq('-', rest)), node('para', seq(noneOf('- \t\n'), inl)))))),
        seq('*', greedy(opt(alt(node('item', seq(chars(' \t'), inl)), node('rule', seq('*', rest)), node('para', seq(noneOf('* \t\n'), inl)))))),
        node('item', seq('+', inl)),
        node('olist', seq(run1(S.charRange('0', '9')), inl)),
        seq('`', greedy(opt(alt(
          seq('`', greedy(opt(alt(
            node('fence', seq('`', alt(
              seq('`', until('\n````', { orEnd: true }), rest),   // ````: closes only on four
              seq('\n', bodyFrom(T3)),                            // ``` with no info string
              seq(noneOf('`\n'), until(T3, { orEnd: true }), rest)))),
            node('para', seq(noneOf('`\n'), inl)))))),
          node('para', seq(node('code', seq(noneOf('`\n'), greedy(many(noneOf('`\n'))), greedy(opt('`')))), inl)))))),
        indented,
        node('para', seq(noneOf('\n#>|-*+`0123456789 \t'), inl)),
      ),
    },
  };

  return { css, html, md };
}
