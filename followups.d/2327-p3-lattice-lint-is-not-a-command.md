---
origin: 2327
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2327
---

# The retired-Form render warning points at a `lattice lint` command that does not exist

Found while #2327 added a render warning beside it. `lattice-emulator.js` tells an author
with a retired Form opt-out to "run `lattice lint` for the full list and the fix". The
`lattice` CLI has no `lint` subcommand: `lattice lint deck.md` is read as a render to an
output named `deck.md` and fails with "unsupported output extension '.md'". The linter,
`tools/lint-deck.js`, is not in the published package's `files`, so a package user has no
lint command at all. #2327's own warning avoids the problem by saying what to write on each
slide, and names `npm run lint:deck` only as a checkout command.

```text
  P3 · Point the retired-Form warning at a command the reader has
       why now   — the one line meant to unblock an author sends them to an error.
       where     — lattice-emulator.js, the retired-Form warning block (search
                   "lattice lint"); package.json `bin` / `files`.
       done when — the warning names a command that works from the published
                   package, or says what to change on each slide instead.
       evidence  — the warning text, and the named command run against a deck
                   with a retired Form opt-out.
       verify    — tier 1: render such a deck from an installed package.
```
