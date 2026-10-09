# Gotchas

Things in this codebase that look wrong but aren't, plus workarounds
whose rationale lives in commit messages and would otherwise be lost.

This is a **living reference**. When you hit something surprising — a hack
in the code, a quirk in a dependency, a behavior that took a bisect to
understand — add an entry. Future-you and future-collaborators (human
or LLM) will thank you.

## How to use this file

The gotchas live one topic per file under `engineering/gotchas/`. The **symptom
index** — one line per gotcha, grouped by topic, each linking to its entry — is
generated into **`dist/engineering/gotchas.md`** and is not committed: `npm install`,
the SessionStart hook and `npm run build` write it (no `dist/`? run
`npm run gotchas:index`). Do not read the topic files top-to-bottom; they are a
reference, not a narrative.

**Two ways in, and picking the wrong one is how you conclude "gotchas has nothing":**

- **You can describe the SYMPTOM** ("the ring lags an edit", "type falls back in the
  PDF") — skim or `grep` `dist/engineering/gotchas.md`, then open the ONE file it
  points at.
- **You have a NAME instead** — an API, a CSS property, a selector, a token, an error
  string (`z-index`, `srcdoc`, `container-type`, `getBoundingClientRect`) — then
  **`grep -rn <term> engineering/gotchas/`**. Those words are in the entry BODIES,
  which this index does not carry: it lists headings only. Grepping the index for
  `z-index` returns nothing while seven entries discuss it. Grep costs the same on
  the directory as on one file — you pay for the hits, not the haystack.

When fixing or working around something subtle, add an entry **before** committing
the fix so the commit message can link to it. Add it to the topic file as a `##`
heading — that is the whole job: the index is regenerated from the headings, and
`npm run gotchas:index:check` (inside `build:check`) validates them. Never write an
entry in this file. **Keep the heading to a
symptom a reader can scan.** It is rendered twice in its index row — as the link label,
then slugged again as the anchor — so a character there costs two, and a heading over
`ROW_CAP` (280 characters of row) fails the check and names your entry. The
detail belongs in the entry body, where nobody pays for it until they open the file.

Each entry has the same shape:

- **Symptom** — what you'd see if you didn't know about this
- **Cause** — root cause, in one paragraph
- **Mitigation** — what the code does about it (with file:line links)
- **Triggered by** — what flow exercises this path
- **Removable when** — what upstream change would let us delete the
  workaround (often "never", which is fine to say)
- **Commits** — the SHAs that introduced or fixed this

Keep entries terse — one screen each. If something needs a deep dive,
spin out a `engineering/decisions/YYYY-MM-DD-topic.md` and link to it from here.
