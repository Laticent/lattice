- `guards: strict` no longer claims a trim the delivered file does not carry. Exporting
  `-o deck.html` skips the guard — that file is written from a string before the page
  renders, so no clamp could ever reach it — and the console says so instead of printing
  `✂ TRIMMED` for a run whose only artifact is untrimmed. The `⚠ OVERFLOW` line then names
  the pages that really clip in that file, which it previously left off.
- Exporting a PDF keeps the trim and now warns that the `.html` sidecar beside it does not
  carry one, instead of leaving the two deliverables of a single export to disagree in
  silence. `--fluid` and `--player` both carry it and are named as the fix.
