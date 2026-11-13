// deck/say-key-case — `Say:` / `SAY:`, a capitalized spoken-line key, which the engine reads as a speaker NOTE.
//
// Migrated from lint-core's `findCapitalizedSayKey` (decision 2026-10-26-squadra-lint-library, M1b).
//
// The `say:` key is lowercase only (notes-core `SAY_MATCHER`), because the channel is PUBLIC and "Say: thank
// the ops team" is how a presenter might open a PRIVATE note. Matching it would publish the note into the
// `.vtt` and the audio of a shared deck. So the capitalized form stays a note, which is the safe default, and
// this WARNING tells the author which one they wrote: it never blocks, because a note that starts "Say:" is a
// perfectly good note.
//
// NO MACHINE FIX, on purpose. The census listed this rule as "a case swap", but lowercasing the key is the
// one edit that publishes a private note, so no tool should make it for the author. The hint says how.
//
// What the rule reads moved from a regex over the slide with hand-masked code to the language: every
// comment on a slide, block or inline, with fenced and indented code masked by `lattice-deck` (the deck
// model reads code the way markdown-it does) and inline code spans blanked, as before.

// The comment shape is the engine's (`<!--+ … --+!?>`, notes-core `COMMENT_SOURCE`), read in LINEAR time. lint-core
// matched it with one regex, `/<!-{2,}\s*(?!say\s*:)[Ss][Aa][Yy]\s*:[\s\S]*?-{2,}!?>/g`, which is quadratic on a run of
// unclosed openers (recheck's attack: `'<!--sAy:'.repeat(n)`). Here a sticky regex reads the opener and the key at each
// `<!--`, and one search finds the close, so every character is read a bounded number of times. The key is every
// casing of `say` but the lowercase one, spelled out because recheck cannot model the look-ahead the old regex used.
const OPENER_AND_KEY = /<!-{2,}\s*(?:S[Aa][Yy]|s(?:A[Yy]|aY))\s*:/y;
const CLOSE = /--!?>/g;

/** Each comment whose key is a capitalized `say:`, as `{ index, text }`, the matches the old regex made. */
function* capitalizedSayComments(text) {
  let i = text.indexOf('<!--');
  while (i >= 0) {
    OPENER_AND_KEY.lastIndex = i;
    if (!OPENER_AND_KEY.exec(text)) {
      i = text.indexOf('<!--', i + 1);
      continue;
    }
    CLOSE.lastIndex = OPENER_AND_KEY.lastIndex;
    const c = CLOSE.exec(text);
    // No close after this opener means none after any later one either: the old regex matched nothing more.
    if (!c) return;
    const end = c.index + c[0].length;
    yield { index: i, text: text.slice(i, end) };
    i = text.indexOf('<!--', end);
  }
}
// Inline code spans hold sample markup, not comments; blanked to spaces so offsets hold.
const CODE_SPAN = /`[^`\n]*`/g;

const sayKeyCase = {
  id: 'deck/say-key-case',
  legacy: 'say-key-case',
  language: 'lattice-deck',
  severity: 'warning',
  summary: 'Only lowercase `say:` is spoken; a capitalized key makes a speaker note.',
  examples: 'say-key-case.fixtures.md',
  budget: { ops: 1_000_000 },
  reads: { facts: ['slide.number'] },
  visit: {
    slide(node, ctx) {
      const number = ctx.fact('slide.number', node);
      if (number < 1) return;
      const text = ctx.text(node).replace(CODE_SPAN, (s) => ' '.repeat(s.length));
      for (const m of capitalizedSayComments(text)) {
        const lines = m.text.split('\n');
        const line = (lines.find((l) => /(caption|say)\s*:/i.test(l)) || lines[0]).trim().slice(0, 80);
        const from = node.from + m.index;
        ctx.report({
          span: { from, to: from + m.text.length },
          message: 'Only lowercase `say:` is spoken; this comment is a speaker note.',
          hint: 'To speak it, use `<!-- say: … -->`.',
          data: { slide: number, line, classToken: 'say' },
        });
      }
    },
  },
};

const fixtures = `# deck/say-key-case

A capitalized key is a speaker note, not a spoken line.

\`\`\`md bad
# Results

⟦<!-- Say: revenue grew in every region -->⟧
\`\`\`

\`\`\`md bad shout
# Results

⟦<!-- SAY: thank the ops team -->⟧
\`\`\`

The lowercase key is spoken, and a quoted comment in code is not a comment.

\`\`\`md good
# Results

<!-- say: revenue grew in every region -->

Write \`<!-- Say: … -->\` to keep it private.

~~~
<!-- Say: inside a fence -->
~~~
\`\`\`
`;

module.exports = { squadraRule: sayKeyCase, fixtures, file: 'say-key-case.fixtures.md' };
