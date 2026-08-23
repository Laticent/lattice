- **The two most-routed-to docs are now index-first, so finding something costs a fraction of
  the context it used to.** `engineering/gotchas.md` was ONE 290 KB file (75k tokens) whose own
  opening line told the reader to "read top-to-bottom" — on the single most common trigger in
  `CLAUDE.md`, "something behaving strangely". Its 145 entries now live in 10 topic files under
  `engineering/gotchas/`, and `gotchas.md` itself is a generated symptom index: one line per
  gotcha, linking straight to the entry (27 KB / **7k tokens**, a 10× cut on the landing read).
  `engineering/decisions/README.md` rendered every note summary in full (395 KB / 96k
  tokens); each row is now a one-line gist — first sentence, capped at 140 characters, `…`
  marking any cut — for 90 KB / **26k tokens**, with the full summary staying where it always
  was, in the note's own front-matter. Both indexes are one line per item, which makes them
  **greppable**: `grep -i mermaid` now returns lines rather than paragraphs.
- **Added `npm run gotchas:index` / `gotchas:index:check`**, wired into `npm run build` and
  `build:check` beside the decision index. The symptom index is generated from the entry
  headings in `engineering/gotchas/`, so it cannot drift — a stale map is worse than no map,
  because it misdirects confidently and the reader pays for the wrong file anyway. Its `--check`
  is deliberately relaxed the same way `decisions:index:check` is (per-entry rows, no row order,
  no totals), which is what keeps two concurrent PRs from ejecting each other from the merge
  queue (#1547).
- Anchor generation uses `github-slugger` — the implementation GitHub's own pipeline uses —
  rather than a local transcription. A hand-rolled version was written first and measured
  against it: **38 of 144 anchors disagreed**, because the reference also strips non-ASCII
  punctuation (em dash, `→`, curly quotes) and maps each space to its own hyphen instead of
  collapsing runs (`Marp / Chromium` → `marp--chromium`).
- One mis-leveled `##` section in the old `gotchas.md` ("G-gen merge must use non-G file's G-gen
  block") is now an entry under **Lattice internals**, where its Symptom/Cause/Mitigation shape
  says it always belonged.
- **Both indexes carry headings and gists only, so grep them for a SYMPTOM or a TOPIC — not for
  an API name.** `grep z-index engineering/gotchas.md` found 7 entries before the split and 0
  after; the words live in the entry bodies now. `CLAUDE.md`, the index prose, `workflow.md` and
  `design/skill.md` all name the second path: `grep -rn <term> engineering/gotchas/` (and
  `grep -rln <term> engineering/decisions/`), which costs the same because you pay for the hits,
  not the haystack.
- **Adding a gotcha now has one correct place, and the wrong one fails loudly.** Entries go in
  `engineering/gotchas/<topic>.md`; anything written into the generated `engineering/gotchas.md`
  used to be deleted on the next regeneration without a word, and now fails `gotchas:index:check`
  with a message naming the topic file to move it to.
- Heading extraction uses **markdown-it** rather than scanning lines, so the index agrees with the
  renderer about what a heading is. The line scanner silently dropped every entry after an
  unbalanced fence — the shape a gotcha about a swallowed fence quotes — while the gate stayed
  green, and it also disagreed about HTML comments, indented headings, setext underlines and
  closing sequences. Two headings that would slug to the same anchor are now rejected outright,
  so no anchor is positional and no deep link rots when a sibling entry is inserted.
- A decision-index row no longer stops on an abbreviation (`…surface vs.`) or on a first sentence
  too short to identify anything (`G8 Studio performance.`) — both rendered as complete claims
  with no truncation marker — and a cut can no longer leave an unbalanced code span.
