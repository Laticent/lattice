- **The Studio chat's find and replace take a pattern and keep case.** `replace_text` gains `preserve_case`: each
  match keeps its case, so replacing `oct` with `October` writes `OCTOBER` in an all-caps eyebrow, `October` in a
  title and `october` in a sentence. `find_text` and `replace_text` gain `regex`: the words to find are a JavaScript
  regular expression, and the replacement can use `$1`, `$<name>` and `$&`. A pattern runs in a Worker, never on the
  page's main thread, and the Studio stops it after 2 seconds, so a pattern that backtracks forever cannot freeze the
  page (#3208).
