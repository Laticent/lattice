---
status: shipped
summary: "#1322 recorded that below-note promotion demotes a concluding sentence to a footnote on 5 `content` slides across 3 decks, and left the design call open. Re-measured: 17 `content` slides across 10 decks carry a promoted below-note, and the 5 could not be reconciled without re-deriving #1322's method — treat 17 as the current fact. Reading all 17, most are genuine footnotes and 4 exist to demonstrate the treatment. The audit's first cut also proposed suppressing 5 that read as conclusions, and an adversarial review killed 4 of them on a convention the audit never consulted: `engineering/workflow.md` §Feature decks prescribes a trailing below-note on exactly those slides, so on a FEATURE DECK the promotion is the house shape rather than a misread. What ships is one slide — `design/forms.gallery.md` p16, a stage direction on a design gallery, not a feature deck. Separately this fixes the reason p17 and p18 of that deck rendered differently: `isExcluded` tests the layout list with `cls.includes()`, so the chrome modifier `no-progress` matched the `progress` COMPONENT. The default stays promotion, and whether it should is still the owner's call — flipping it would strip the treatment from the twelve slides where it is right."
builds-on: 2026-08-04-below-note-opt-out.md
---

# Below-note promotion on `content` — what is actually promoted, and what should not be

## Why re-measure

`2026-08-02-default-slide-layout.md` §2 recorded the consequence of taking `content`
off below-note's `EXCLUDED` list under *"Recorded, not fixed"*: **"5 slides across 3
decks"** lose a concluding paragraph to promotion. `no-note` (#1359) then gave authors
the lever without deciding the question.

Re-derived on `75b3e1b6`, the count is **17 `content` slides across 10 decks**. The gap to
5 could not be reconciled without re-deriving #1322's method, so 17 is the current fact
and 5 is unverified.

Re-derive it with this — pure JS, no browser, ~20s:

```bash
node -e "
const {render}=require('./lib/engine');
const fs=require('fs'),path=require('path');
const walk=(d,o=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const f=path.join(d,e.name);
  if(e.isDirectory()){if(!/node_modules|\.git|\.scratch|dist/.test(f))walk(f,o)}
  else if(/\.md\$/.test(e.name))o.push(f)}return o};
const decks=[...walk('examples'),...walk('exemplars'),
  ...walk('lib/components').filter(f=>/\.gallery\.md\$/.test(f)),
  ...walk('design').filter(f=>/\.gallery\.md\$/.test(f)),
  ...walk('test/integration/baseline-decks')];
for(const d of decks){ let h; try{h=String(render(fs.readFileSync(d,'utf8'),{}).html||'')}catch{continue}
  h.split('<section').slice(1).forEach((p,i)=>{
    const cls=(p.match(/\sclass=\"([^\"]*)\"/)||[])[1]||'';
    const body=p.split('</section>')[0];
    if(!/\bcontent\b/.test(cls)||!body.includes('class=\"below-note\"'))return;
    console.log(d+' p'+(i+1));});}"
```

**The trap, for whoever measures next:** match `class="below-note"`, **not** the bare
string `below-note`. Several decks discuss the feature in prose, and the substring test
reports 19 with two phantom hits.

## Reading all 17

The grouping below is editorial judgment from reading the slides, not a measurement.
The test applied to each: **is the trailing sentence an aside ABOUT the slide, or the
point the slide lands on?** A footnote is the first. A conclusion is the second, and
promotion — muted ink, hairline rule, parked at the stage floor — actively misreads it.

**Genuine footnotes — promotion is right, unchanged (8):**

| Slide | The trailing sentence |
|---|---|
| `auto-glossary` p3 | an aside about where acronyms are defined |
| `chart-theme-gallery/README` p1 | a manifest line listing what the decks cover |
| `footer-cell` p6 | "This slide carries `footer-inset`" — a self-referential annotation |
| `slide-context-editor` p2 | a gloss on the list above it |
| `universal-table` p2, p4 | annotations on the specimen table |
| `frame-chrome-and-notes` p4 | the reading of the measurement table above it |
| `gallery` p78 | a closer, but in a long-running deck — see below |

**Demonstrating the treatment — must not change (4):** `default-slide-layout` p2, p3 and
p5, and `frame-chrome-and-notes` p5. Each is a slide whose subject *is* promotion.
`default-slide-layout` p5 deserves a note: its trailing paragraph is authored in italics
as an explicit aside, and the slide's heading is "A trailing block reaches the bottom" —
it is demonstrating that a promoted note reaches the stage floor. Changing it would
delete the thing it exists to show.

**Conclusions the promotion misread — the audit's first cut, and where it was wrong (5):**

| Slide | The reading | Verdict |
|---|---|---|
| `footer-cell` p2 | the list is placeholder filler (`one` / `two` / `three`); the paragraph carries the slide's entire content | **overturned** |
| `footer-cell` p5 | a substantive claim in the same register as the bullets, not a gloss on them | **overturned** |
| `speech-symbols` p8 | the reassuring closer the slide builds to | **overturned** |
| `forms.gallery` p16 | a stage direction — "The next three slides carry this exact claim" — the one line a reader must not skim past | **ships** |
| `forms.gallery` p17 | "reads as a caption, but see the sibling problem below" | **withdrawn** |

**Four of the five are overturned by a convention the audit never consulted.**
`engineering/workflow.md` §Feature decks, authoring step 4, prescribes the shape of a
feature-deck slide:

> the eyebrow above the heading, the heading itself, the demo, and **a one-line below-note
> explaining the change**

`examples/footer-cell.md` and `examples/speech-symbols.md` are feature decks, and all three
of those trailing sentences are exactly that. The audit inferred authorial intent from the
prose while a written contract governing that class of deck already said what the intent
was. Reading prose is a fair way to find the question; it is not a way to overrule the
answer.

`forms.gallery` p17 is withdrawn for a different reason: by this audit's own stated test —
is the sentence an aside ABOUT the slide, or the point it lands on? — "Read as a working
slide. The full chrome orients a reader paging through the deck" is a caption on a
specimen, i.e. an aside. The first cut changed it anyway, for consistency with p18, which
silently substituted a second criterion for the stated one. The sibling problem is real;
the fix is the bug below, not a second editorial edit.

**So one slide ships:** `design/forms.gallery.md` p16. It is a design gallery rather than a
feature deck, so step 4 does not govern it, and its trailing sentence is an instruction to
the reader about the next three slides — the slide's payload, not a note about it.

## The sibling problem, and the bug behind it

`forms.gallery` p17 and p18 are a matched pair: identical structure, a Key Insight followed
by one gloss sentence, differing only in the Frame each demonstrates. **They rendered
differently** — p17 promoted, p18 not.

p18 was un-promoted **by a bug**. `isExcluded` tests the layout list with `cls.includes(x)`,
a substring test, and p18's class list is `content no-progress form`.
`'content no-progress form'.includes('progress')` is `true`, so the chrome modifier that
suppresses the **progress rail** was read as the **progress component**, and the slide was
excluded from a treatment that has nothing to do with either.

The kernel's own comment claims this is safe — *"a real class list does not contain `quote`
as a fragment of another token"*. That is false, and `no-progress` is the counterexample
sitting in the corpus.

It is fixed in this branch rather than filed, because #1358's class-read fix made it
**reachable deck-wide** for the first time: before that, below-note read `data-class`, which
never carries a deck-wide token, so the Studio's own "Hide rail" switch (which writes
`class: no-progress` into front matter) would have silently stripped the treatment from
every `_class:`-carrying slide in the deck. `no-*` suppression tokens are withheld from the
substring arm — no `EXCLUDED` entry begins with `no-`, so a `no-*` token can never
legitimately name a layout. See `2026-08-04-data-class-shadows-resolved-class.md`
§ "The regression this change created". **p18 now promotes, matching p17**, which is why
neither needs an editorial edit.

## What is logged rather than fixed

**`isExcluded`'s substring test should be token-exact all the way, like `hasOptOut` beside
it — and that is not this change.** The `no-*` half is fixed above because #1358 made it a
live regression; the rest is not. Measured across the corpus, going fully token-exact flips
the exclusion verdict on **28 slides**:

| Collision | Slides | Is exclusion actually wanted? |
|---|---|---|
| `no-progress` ⊃ `progress` | 1 | **No** — a chrome modifier read as a component |
| `progress-1`…`progress-6` (agenda's marker) ⊃ `progress` | 18 | **No** — an agenda is not a progress chart |
| `compare-code` ⊃ `code` | 7 | **Probably yes**, but by accident, not by decision |
| `pull-quote` ⊃ `quote` | 2 | **Probably yes**, same |

Going fully token-exact would add a hairline note to 28 slides, 3 of them in
`test/integration/baseline-decks/gallery.md` and `examples/gallery-jargon.md` — the
long-running decks HARD RULE #8 isolates from feature work — and the `compare-code` /
`pull-quote` cases need a genuine ruling on whether those layouts should promote at all.
Off-path, real blast radius, needs its own visual review: HARD RULE #18 says log it.
Tracked as **#1363**.

`gallery` p78 is left alone for the same reason — a closing sentence I would otherwise
have suppressed, in a page-count-asserted long-running deck.

## What is still the owner's call

**Whether promotion should remain the default for `content`.** This change does not
settle it, and deliberately: it changes one slide, and leaves the question answerable either
way. The audit is the deliverable — the reading of all 17 above is what makes the default
question answerable with evidence rather than by feel.

**The recommendation is not to flip it.** Of the 17, ~8 are genuine footnotes and 4
demonstrate the treatment — a flipped default strips the hairline from all twelve to
serve five. If the owner does want it flipped, the shape is a `no-note` **default** in
`lib/core/below-note.js`, **not** re-adding `content` to `EXCLUDED`; the
*"Why not re-add `content` to `EXCLUDED`"* section of `2026-08-04-below-note-opt-out.md`
covers that and does not need relitigating.

## Cross-references

- `2026-08-02-default-slide-layout.md` §2 — the *Recorded, not fixed* entry this audits.
- `2026-08-04-below-note-opt-out.md` — the `no-note` token itself.
- `2026-08-04-data-class-shadows-resolved-class.md` — why the deck-wide form
  (`class: no-note`) works at all now; before it, only the per-slide form was reliable.
