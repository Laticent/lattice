// deck/tag-alias — `banner-tag` is the `tag-band` placement under its older name.
//
// Migrated from lint-core's `findCardTagAliases` (decision 2026-10-26-squadra-lint-library, M1b). The
// detector reads what it always read: the class directive in force on each slide, from the directive scan
// (lib/core/meta-scan.mjs), and stays quiet on a slide that already names a placement word. What the move
// adds is the fix the census found it was one step from: the finding's span is the `banner-tag` word in
// the directive comment, and the fix swaps that word for `tag-band`. The render is the same either way,
// so the fix is `safe`.
//
// It still renders, so this is advice, never a block: `info`, the tier `--strict` routes to suggestions.
// engineering/decisions/2026-09-27-card-tag-register.md §3.3, §6 phase 4.

const { editsFix } = require('@laticent/squadra');

const OLD = 'banner-tag';
const NEW = 'tag-band';
const PLACEMENT = /^tag-(corner|foot|notch|band|inline)$/;

/** Where the `banner-tag` word sits in the directive comment that set it, or null. */
function wordSpan(text, starts, entry) {
  const lineAt = starts[entry.line - 1];
  if (lineAt == null) return null;
  // The comment opens on its line; its key comes after the opener. Search the source, not the scan's
  // normalized copy, so a CRLF deck's offsets stay the author's.
  const open = text.indexOf('<!--', lineAt);
  if (open < 0) return null;
  const close = text.indexOf('-->', open);
  const end = close < 0 ? text.length : close;
  const key = /_?class\s*:/g;
  key.lastIndex = open;
  const k = key.exec(text);
  if (!k || k.index >= end) return null;
  const word = new RegExp(`(^|\\s)${OLD}(?=\\s|$|-->)`, 'g');
  word.lastIndex = k.index + k[0].length;
  const m = word.exec(text);
  if (!m || m.index >= end) return null;
  const from = m.index + m[1].length;
  return { from, to: from + OLD.length };
}

const tagAlias = {
  id: 'deck/tag-alias',
  legacy: 'tag-alias',
  language: 'lattice-deck',
  severity: 'info',
  summary: '`banner-tag` is an old name for `tag-band`.',
  examples: 'tag-alias.fixtures.md',
  fixable: true,
  budget: { ops: 1_000_000 },
  reads: { facts: ['deck.meta', 'deck.frontMatterChunks', 'deck.lineStarts'] },
  check(root, ctx) {
    const scan = ctx.fact('deck.meta');
    const fm = ctx.fact('deck.frontMatterChunks');
    const starts = ctx.fact('deck.lineStarts');
    const text = ctx.raw(root);
    scan.slides.forEach(({ resolved, comments }, idx) => {
      if (idx < fm) return;
      const entry = resolved.get('class');
      if (!entry) return;
      const own = entry.value.split(/\s+/).filter(Boolean);
      if (own.some((t) => PLACEMENT.test(t)) || !own.includes(OLD)) return;
      const span = wordSpan(text, starts, entry);
      if (!span) return;
      // A running `class:` set on an earlier slide is reported on every slide it reaches, as lint-core did, but
      // only the slide that holds the comment offers the fix: a fix is applied within its finding's slide
      // (lint-core `applyFix`), and fixing the comment there clears the finding on every later slide.
      const here = (comments || []).some((c) => c.line === entry.line);
      ctx.report({
        span,
        message: '`banner-tag` is an old name for `tag-band`.',
        hint: 'Replace it with `tag-band`.',
        fixes: here ? [editsFix(`Use '${NEW}'.`, { op: 'replace', span, text: NEW })] : [],
        data: { slide: Math.max(1, idx - fm + 1), line: entry.text, classToken: OLD, didYouMean: NEW },
      });
    });
  },
};

const fixtures = `# deck/tag-alias

A slide that names \`banner-tag\`, the old name for \`tag-band\`.

\`\`\`md bad
# Teams

<!-- _class: cards ⟦banner-tag⟧ -->

- Platform
  - Owns the build.
\`\`\`

\`\`\`md fixed
# Teams

<!-- _class: cards tag-band -->

- Platform
  - Owns the build.
\`\`\`

A slide that already names a placement has met the register.

\`\`\`md good
<!-- _class: cards banner-tag tag-corner -->

# Teams
\`\`\`

A quoted directive in a code fence is not a directive.

\`\`\`md good fenced
# How to

~~~
<!-- _class: cards banner-tag -->
~~~
\`\`\`
`;

module.exports = { squadraRule: tagAlias, fixtures, file: 'tag-alias.fixtures.md' };
