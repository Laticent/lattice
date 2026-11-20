# LFM 2.0 — Lattice-Flavored Markdown

<!-- spec-parts
schema: lib/plugins/meta/meta.manifest.json
reference: lib/core/note-grammar.mjs lib/authoring/notes-core.js lib/authoring/lint-core.js
tests: spec/conformance/lfm/ tools/lfm-conformance.js
-->

**Version:** 2.0 · **Status:** Draft, for the owner's sign-off · **Date:** 2026-11-20 · **Owner:** @saden1
**Supersedes:** [LFM 1.1](./LFM-1.1.md) once ratified.
**License:** CC-BY-4.0, as [LFM 1.1 §12](./LFM-1.1.md#12-governance--license).

LFM 2.0 is a **Major** version (LFM 1.1 §7): it changes what a 1.x deck means. This draft is
written as changes against [LFM 1.1](./LFM-1.1.md). **Every section not listed here reads as in
1.1.** Further 2.0 changes (the slide-metadata record that replaces directive comments,
`engineering/decisions/2026-10-17-meta-record.md` §9 step 7) land here as they are decided.

## What changes from 1.1

| § | In 1.1 | In 2.0 |
|---|---|---|
| 3.5 | Any comment that is neither a directive nor a tooling pragma is the slide's speaker note (Marp's semantics). | A slide has four notes, each a named comment. A plain comment is not a note. |

A 1.x deck whose plain comments were speaker notes renders the same slides under 2.0, but its
notes are gone. `lattice migrate notes` rewrites a 1.x deck as a 2.0 deck.

---

## 3.5 Notes

A slide carries up to four **notes**. A note is an HTML comment whose whole body, after
whitespace is trimmed, is `@name{…}` with `name` one of four lowercase words. The name is
where the note shows up:

| Note | What it is for | A conformant L1 renderer that offers the surface SHOULD put it in |
|---|---|---|
| `@note{…}` | the presenter, while presenting | its presenter channel (speaker notes) |
| `@say{…}` | someone listening | its narration and captions; it replaces any narration the renderer generates for the slide |
| `@alt{…}` | someone who cannot see the slide | the slide's text alternative (WCAG 1.1.1) |
| `@handout{…}` | someone reading the deck alone, later | its reading surface, and after the speaker note where the format has one notes field |

```markdown
## Where the pipeline leaks.

<!-- @note{Open on the drop.} -->
<!-- @say{The pipeline holds until activation, then loses seventy percent before paid.} -->
<!-- @alt{Funnel chart: 12,000 visitors narrowing to 620 paid.} -->
<!-- @handout{Activation-to-paid is measured over 30 days.} -->
```

**The body** runs from the `{` after the name to the brace that balances it, and MUST be the
end of the comment: text after that brace makes the comment not a note. The body MAY span
lines and paragraphs; the note's text is the body with the indentation its non-blank lines
share removed, then trimmed. Inside the body:

- A comment cannot contain `-->` (or `--!>`, which ends it in a browser). A note that needs one
  writes `--\>` (`--!\>`), and each further backslash before the `>` is a literal one: a reader
  removes one backslash, before it reads the escapes below.
- `\\` is a literal backslash, and `\{` and `\}` a literal brace that does not count toward the
  balance. A backslash before any other character is itself, so a hand-written `C:\Users` reads as
  written. A writer escapes every backslash, and every brace when the braces do not balance, so
  any text round-trips and no body can escape its own closing brace.

**Several notes of one name** on a slide join in source order: `@note` and `@handout` as
paragraphs (separated by a blank line), `@say` and `@alt` into one line (separated by a space).

**Not a note:** a comment whose name is not exactly one of the four (`@Say{…}`, `@speaker{…}`),
whose braces never balance, or that holds text after the closing brace; a directive (§2.1,
§2.3); a tooling pragma (`markdownlint-*`, `prettier-ignore[-start|-end]`,
`lint disable|enable|ignore …`); and a **plain comment**. A comment that is not a note MUST NOT
reach a renderer's presenter channel, narration, captions, text alternative or reading surface.
A comment inside a code fence, an indented code block or an inline code span is slide text,
never a note.

**Degradation.** Every note is an HTML comment, so a CommonMark viewer that has no knowledge of
Lattice shows nothing (§5's governing rule holds unchanged).

**Removed from 1.x, with no alias.** A conformant L2 linter SHOULD report each as an error that
names its replacement: a `say:`, `describe:` or `reader:` comment key (now `@say`, `@alt`,
`@handout`), and a front-matter `say:` map keyed by slide number (each line goes on its slide as
`@say`). The reference linter's rules are `note-key-retired` and `note-malformed`.

The reference implementation is `lib/core/note-grammar.mjs` (the grammar) and
`lib/authoring/notes-core.js` (the notes a rendered slide carries). The shared test case is
`spec/conformance/lfm/four-notes`. Design record: `engineering/decisions/2026-11-20-four-notes.md`.
