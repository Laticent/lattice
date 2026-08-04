---
status: shipped
summary: #1322 took `content` off below-note's `EXCLUDED` list, which was right — the `STRUCTURAL` guard already prevented the case the exclusion claimed to guard, and the exclusion cost `content` the treatment on every slide where a note genuinely followed a list or a table. It also left authors with no lever: "a list, then a concluding sentence" is an ordinary prose shape, and promotion turns that conclusion into a footnote — muted, hairline-ruled, pushed to the stage floor by the spacer. 5 slides across 3 decks land that way. This adds `no-note`, a per-slide (or deck-wide) suppression token, and changes NO existing rendering. A re-added `EXCLUDED` entry was the alternative and is the wrong shape: it would withhold the treatment from every `content` slide — which after #1292 means every un-classed slide in the corpus — to serve the minority that wants the paragraph plain, and would make `content` special again exactly where #1322 made it consistent. The default stays promotion; the escape hatch is per-slide. Token-exact rather than the substring test the layout list uses, so a future `no-notebook` cannot silently disable notes.
builds-on: 2026-08-02-default-slide-layout.md
---

# `no-note` — the author's lever over below-note promotion

## The gap this fills

`lib/core/below-note.js` promotes a layout's trailing `<p>` to a `.below-note` when it
follows a structural block. #1322 removed `content` from the `EXCLUDED` list, for a reason
that holds up: the stated justification for the exclusion — that a prose layout claims its
trailing paragraph as main content — described a case the `STRUCTURAL` guard already
prevents, since **a paragraph following a paragraph is never promoted, on any layout.**

What the exclusion actually cost was the treatment on slides where a note genuinely *did*
follow a list or a table: no hairline, no muted ink, no `--fs-body` sizing. And after
#1292 made `content` the default, that was every un-classed slide in the corpus. Removing
it was correct.

The consequence #1322 recorded under *"Recorded, not fixed"* is real all the same:

> **`content` slides lose a concluding paragraph to below-note promotion.** "List, then a
> concluding sentence" is a common prose shape, and promotion turns that conclusion into a
> footnote — muted, hairline-ruled, and now pushed to the stage floor by the spacer. 5
> slides across 3 decks, two of them long-running galleries. This is change §2 working as
> designed and as every other non-excluded layout has always worked, so `content` is now
> *consistent* rather than special — but the design call deserves the owner's eye rather
> than a silent landing.

Both halves of that are true at once, and that is the whole problem. Promotion is the right
default — a trailing note after a table usually *is* a footnote. But the promotion decides
something about the author's meaning, and the author had no way to say otherwise.

## What shipped

`no-note`, a universal modifier. On a slide `_class`, or deck-wide in `class:`:

```markdown
<!-- _class: content no-note -->

## What we decided.

- We ship the migration in two phases.
- Phase one lands before the freeze.

These two phases are one decision, and the second does not stand without the first.
```

It suppresses promotion and nothing else. A Key Insight (`> blockquote`) on the same slide
is untouched, since that is a different register with its own trigger.

### The deck-wide form has a caveat, and it is the engine's rather than this feature's

> **RETRACTED (#1358, same day).** The mechanism below is not real and the rule it
> derives — *"put the token on the slide when the slide names its own `_class:`"* — is
> withdrawn. `class: no-note` reaches every slide. The deck-class merge is a markdown-it
> **core ruler**: it runs inside `md.render`, so the class list is already complete when
> the first HTML-stage transform runs. What was actually wrong is that below-note read
> `data-class="<raw _class: payload>"` instead of the resolved `class` — an unguarded
> `/class="([^"]*)"/` matches leftmost, and `data-class` comes first in the tag. **The
> instrumentation printed below reads the wrong attribute by the same bug it was
> measuring**, which is why it agreed with the theory.
> See `2026-08-04-data-class-shadows-resolved-class.md`. The section is kept as written
> because a plausible wrong diagnosis is part of what this note teaches.

`class: no-note` in front matter reaches every slide that declares **no `_class:` of its
own**. A slide that carries its own `_class:` does not see it at the stage promotion runs.
Instrumented on the engine path:

```
[HTML-transform stage sees] cls="content"     ← the `_class: content` slide; no `no-note`
[HTML-transform stage sees] cls="no-note"     ← the un-classed slide; correct
--- final rendered classes ---
  slide1  content no-note form                ← the token IS there, just not yet
  slide2  no-note content form
```

The deck-wide token is merged into the class attribute only **after** the HTML-stage
transforms have run, so any transform keyed on a deck-wide `class:` token reads a stale
list on exactly the slides that name their own class. **This is general, not ours** —
`class: dark` instruments identically — so it is a pre-existing engine defect that this
feature's documented deck-wide path happens to walk into, and under HARD RULE #18's
off-path rule it is logged rather than pulled into this diff — #1358. Fixing it means moving the
deck-class merge ahead of `applyAllToHtml`, which changes what *every* class-keyed
transform sees and wants its own change and its own render pass.

Found by the adversarial trio's red team, which is also why the feature deck exercises the
per-slide form: the deck-wide claim was documented in four places and tested in none.
**The author-facing rule is therefore: put the token on the slide when the slide names its
own `_class:`.**

**No existing rendering changes.** This is purely additive: no deck in the corpus carries
the token, so the 5 slides named above still render exactly as they do today. **The default
question is therefore still open and is still the owner's** — this note does not settle
whether promotion should be the default for `content`; it removes the reason the question
was urgent, by making the answer reachable per slide either way.

### Why not re-add `content` to `EXCLUDED`

That was the other available shape, and #1322's handoff explicitly ruled it out. The
reasoning is worth keeping:

- It is **the wrong granularity.** The exclusion list is per-LAYOUT; the problem is
  per-SLIDE. A deck whose `content` slides sometimes end in a footnote and sometimes in a
  conclusion — which is most decks — is not served by either setting of a layout-wide flag.
- It **withholds the treatment from the majority to serve the minority.** After #1292,
  `content` is what every un-classed slide resolves to. Excluding it would take the hairline
  treatment away from the whole corpus so that 5 slides can keep a plain paragraph.
- It **re-specialises `content`.** #1322's argument for removing it was that `content` should
  behave like every other non-excluded layout. Putting it back makes it the exception again,
  and the next person to read the list finds an entry whose stated reason is a case the
  `STRUCTURAL` guard already handles — which is exactly the confusion #1322 cleared.

### Why its own vocabulary group, not `chrome`

`UNIVERSAL_GROUPS.chrome` is `silent` / `no-header` / `no-footer` / `no-paginate` /
`no-progress` / `form` / `no-form` — every one of which suppresses part of the running
**frame**. None of that is the author's words. This suppresses a treatment applied to the
author's own last sentence, so it is a different kind of thing and gets a `note` group.

The practical consequence of that distinction: **`silent` does not imply `no-note`.** A slide
delivered without header, footer or page number still gets its notes, because hiding the
frame says nothing about whether a trailing sentence is a footnote.

### Token-exact, unlike the list beside it

`isExcluded` tests the layout list with `cls.includes(x)`. That substring test is safe for
component names — a real class list does not contain `quote` as a fragment of another token —
but it is not safe for a suppression flag, where a false positive silently turns a treatment
off. `hasOptOut` splits the class string and compares tokens, so `no-notebook` and `notes-on`
do not disable notes. Both are pinned by a test.

## Where it applies

One kernel, three consumers, so the token is honored on every render path — `isExcluded` is
the single gate all three already call:

| Path | Entry | Consumer |
|---|---|---|
| emulator / CLI / PDF, and the browser playground | `applyToHtml` | `lib/engine` |
| pre-chrome section body | `wrapSectionBody` | kernel helper |
| live DOM (marp-vscode preview) | `applyToDom` | `lattice-runtime.js` |

Covered by unit tests on the HTML and DOM paths plus the kernel helper, asserting a
`no-note` section and an ordinary one side by side so the assertion is a difference rather
than an absence. Verified on a real emulator render as well
(`examples/frame-chrome-and-notes.md` pages 5 and 6 are the same slide with and without the
token): exactly one `.below-note` wrapper in the document.

## Cross-references

- `engineering/decisions/2026-08-02-default-slide-layout.md` §2 — why `content` left
  `EXCLUDED`, and the *Recorded, not fixed* entry this answers.
- `lib/base/base.docs.md` § Below-Note → *Opting out* — the author-facing contract.
- `examples/frame-chrome-and-notes.md` — the feature deck.
