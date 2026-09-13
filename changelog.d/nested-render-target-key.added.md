- **New lint rule** `nested-render-target-key` — the deck linter warns when `fluid:`,
  `player:` or `present:` is written indented. The export reads an indented key as the
  deck's own register, so a nested `fluid: "true"` ships the fluid viewer even when a
  top-level `fluid: false` says no. The warning names what the export does and points at
  the line; it reports only lines a reader arm really reads, so it never claims the export
  acts on a line it ignores.
- The fix text names an escape that keeps a legitimate nested entry. `lexicon:` and
  `acronyms:` take arbitrary word keys, and `present` is a word an author might well teach a
  deck to pronounce — quoting the key (`"present": pre ZENT`) is the same mapping to YAML
  and stops the export reading it as the register. The rule carries no autofix: de-indenting
  the key, quoting it and deleting it are all plausible, and the source does not say which
  was meant.
- The reader is unchanged, deliberately. Narrowing it to read only column-0 keys would turn
  off decks in the field — six measured input shapes read as on today and would stop — so
  the kernel keeps believing an indented key and the author gets told instead
  (`lib/core/render-target-keys.js`).
- The Studio editor anchors a warning to the line a finding quoted VERBATIM, indentation
  included, before falling back to a trimmed match. Without it a nested `fluid: true` on a
  deck that also carries a top-level `fluid: true` underlined the innocent top-level line
  while the message said it was indented.
