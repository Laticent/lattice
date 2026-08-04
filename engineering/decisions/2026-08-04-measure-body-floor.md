---
status: shipped
summary: "#1355 says `--measure-body` is 36em because narrower clips shipped decks, not because 36em is right, and the handoff guessed the premise was stale after #1359 gave `examples/finish-backdrops.md` ~46px of stage height back. Re-measured with the real oracle — `npm run overflow:check`, 257 emulator renders through Chromium, one full sweep per candidate: 36em and 35em are both CLEAN at the committed baseline of 8 clipped slides; 34em clips 2 more (`finish-backdrops` p2, `mode-frontmatter` p2); 33em clips 2 more again (`chart-theme-gallery/README` p1, `exemplars/README` p1). So the premise is NOT stale — the token comment's claim that four decks clip at 33em still holds — but the FLOOR is 35em, not 36em, which the comment implied. The value is deliberately left at 36em: the notch buys ~2 characters, still lands outside the 45–75 band, and would reflow every `content` slide in the corpus and every committed PDF with it. The next move is trimming the two ledes that block 34em, and the measurement now names them."
builds-on: 2026-08-02-default-slide-layout.md
---

# What `--measure-body` can actually be, measured

## The question

`--measure-body: 36em` holds ~78–83 characters, above the 45–75 band a reading measure is
usually held to. The token's own comment says so honestly and calls itself a compatibility
value: narrower clips shipped decks. #1355 asks whether that is still true.

The on-deck handoff guessed it was probably stale, because #1322's blocking set included
`examples/finish-backdrops.md` — a `finish:` deck with a `header:` that got ~46px of stage
height back from #1359's frame-chrome fix.

## The measurement

`npm run overflow:check` — 257 real emulator renders through Chromium, compared against the
committed ratchet in `test/integration/overflow-baseline.json` (8 intentionally-clipped
slides). One full sweep per candidate value, each in an isolated worktree so no build raced
a sweep.

| value | clipped slides | decks that newly clip |
|---|---|---|
| 36em (shipped) | 8 = baseline | — |
| **35em** | **8 = baseline** | **— clean** |
| 34em | 10 | `finish-backdrops` p2 · `mode-frontmatter` p2 |
| 33em | 12 | + `chart-theme-gallery/README` p1 · `exemplars/README` p1 |

**The premise is not stale.** The comment's claim — four decks clip at 33em, none at 36em —
is still exactly right, #1359's 46px notwithstanding. What the comment got wrong by
implication is that 36em is the floor. **It is one notch above it.**

## Why the value is not changed

35em is clean and buys about two characters (~76–81 instead of ~78–83). That is not worth
what it costs:

- it is **still outside the band**, so it does not resolve #1355, it only moves the number;
- it reflows **every `content` slide in the corpus** — which after #1292 is every un-classed
  slide — changing line breaks and therefore every committed PDF;
- a corpus-wide typographic change is a QUALITY BAR visual review, not a token nudge.

**The next move on this token is a trim, not a nudge**, and the measurement above is what
makes that actionable: two slides block 34em, two more block 33em, and they are named.

## What blocks the next notch

`finish-backdrops` p2 and `mode-frontmatter` p2 are the same shape — a three-line lede
paragraph above a three-item nested list, on a slide that also carries a finish or a mode
banner. Both ledes restate their heading before adding anything:

> `finish:` names the whole-deck surface in one token — orthogonal to `theme:`, which still
> owns the palette. The engine reads it once and paints the layered finish behind every
> slide, so you never repeat a class.

That is one sentence of content and one of scaffolding. Trimming the scaffolding on those
two slides is what buys 34em, and it is an editorial change to two feature decks — properly
its own change under HARD RULE #17, not a rider on a token edit.

## The trap, for whoever measures next

**Do not hand-roll a `scrollHeight - clientHeight` probe.** `lib/core/overflow-probe.js`
documents why the raw delta is wrong: it counts out-of-flow decorative chrome as content
overflow. A hand-rolled one reported `finish-backdrops` clipping at *every* candidate
value **including the shipped 36em**, which the emulator calls clean. The oracle is
`npm run overflow:check` and nothing else.

**Do not run `npm run build` (or `css:build`) mid-sweep.** `check-overflow-corpus.js` reads
`dist/` per render, so a rebuild during a sweep corrupts its verdict. Each candidate here was
measured in a separate `git worktree` with its own `dist/`, which also let the sweeps run
while other work continued in the main tree.

## Cross-references

- `lib/base/base.tokens.css` — the token, which now carries this table.
- `engineering/decisions/2026-08-02-default-slide-layout.md` §3 — where 36em came from.
- `lib/core/overflow-probe.js` — why the naive probe is wrong.
