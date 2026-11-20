- **The Studio chat's find and replace take a pattern and keep case.** `replace_text` gains `preserve_case`: each
  match keeps its case, so replacing `oct` with `October` writes `OCTOBER` in an all-caps eyebrow, `October` in a
  title and `october` in a sentence. `find_text` and `replace_text` gain `regex`: the words to find are a JavaScript
  regular expression, and the replacement can use `$1`, `$<name>` and `$&`. A pattern runs in a Worker, never on the
  page's main thread, and the Studio stops it after 2 seconds, so a pattern that backtracks forever cannot freeze the
  page (#3208).
- **The Studio chat knows the deck may have moved since its last card.** When it is told what the author did with
  its earlier cards, it is now also told how many slides the deck has and that slide numbers from earlier turns may
  name other slides, so it re-reads the deck instead of acting on a stale number (#3208).
