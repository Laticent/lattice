# Check your work

You have written a deck. Before you hand it over, find what is wrong with it.

## Run the checker

```sh
node check.mjs your-deck.md
```

It prints findings like this:

```
3 findings

  slide 1  [title-incomplete]  the title slide has no subtitle — one line of framing orients the room
  slide 4  [label-title]       "Next Steps" is a label, not a takeaway — say what the slide proves
  deck     [no-ask]            no clear ask or recommendation — what should the audience do?
```

Pass more than one file to check them all. Add `--strict` to exit non-zero when
anything is found.

`--json` emits one envelope, whatever the file count:

```json
{ "partial": false, "files": [ { "file": "deck.md", "findings": [ … ] } ] }
```

`partial` is `true` when `../reference/components.json` was not found beside the
checker — half the rules are skipped without it, so an empty `findings` in that
state does NOT mean clean. Keep the kit together and it stays `false`.

## Why run it rather than self-review

It is **code, not a model.** It cannot be talked into approving a deck, it costs
**no tokens**, and it runs in about a tenth of a second offline. It is the same
reviewer AND the same linter the Lattice Studio runs on decks its own model writes,
so it cannot drift into a second opinion.

A model checking its own draft against a rubric it read two minutes ago will tell you
the draft is fine. That is the failure this file exists to prevent.

## What it does and does not catch

It runs TWO passes and merges them, because they answer different questions.

**The linter asks whether the deck is valid.** An invented `_class`, a card written
as one inline line when the layout needs nested bullets, a front-matter key that does
not exist. Reported as `error` / `warning` and listed first — these are the ones that
stop a deck rendering the way you meant, and an invented component name is the single
most likely mistake a model makes here.

**The reviewer asks whether the deck is any good** — the falsifiable half of that:
placeholder titles, headings that are labels rather than takeaways, a data slide with
no "so what", a hero number with nothing to compare it to, elements past their word
budget, a deck with no ask, duplicate claims, missing image alt text. Reported as
`suggestion`.

**Neither catches whether the argument is any good.** No checker can. Clean output
means the deck is valid and clears the mechanical bar — the judgment is still yours,
against `../authoring/deck-canon.md`.

## Files

- `check.mjs` — the checker (452 KB, self-contained, needs Node 18+)
- `rubric.md` — the same checks in plain form, for reading or for a human pass

The checker reads `../reference/components.json` for per-element word budgets. Keep the
kit together and it just works; move `check.mjs` alone and it still runs, minus that check.
