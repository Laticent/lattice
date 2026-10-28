# Skill — Create a component showcase deck

> A showcase deck teaches one component: what it looks like, when to use it, and
> when not to. This skill tells you how much text each kind of showcase slide can
> hold, so you size the words before you render instead of guessing and clipping.

**Read this when** you add or edit a component's showcase (its `<name>.gallery.md`,
which the Playground walks as "Explore"), write a feature demo deck for a component, or
trim the manifest prose the generator turns into slides. **You'll produce** manifest
fields (`sample`, `stressDoc`, `variantDocs`, `antiPatterns`, `related`) that the
generator builds into slides, or a hand-written `examples/<slug>.md` that follows the same
word budgets.

---

## The 10/10 bar

- **Every slide fits with room to spare.** "Fits" is the floor. A slide that fills 716 of
  720 px (the old `statute-stack` anti-pattern slide did) is one font or content change from
  clipping. Keep a third of the room unused. Never shrink or scale type to get there: body
  size is a design constant that only `venue:` changes.
- **One idea per slide.** A showcase slide shows the component or names one rule. It is not
  a docs page.
- **The slide says it in the component's own density.** A component calibrated for 16 words
  an item cannot carry 29. Use the budgets below, or pick a component that carries more.
- **A reader can act on each line.** Anti-patterns name the redirect (`use X`), not only the
  warning.

## Mental model

The Playground does not hold decks of its own. It reads three sources:

| Source | Built from | Walked as |
|---|---|---|
| A component's **plan** (`?c=<name>`) | `galleryPlan(m)` in `tools/build-component-docs.js` | Explore: one slide per step |
| A **curated or family deck** (Galleries sheet) | the decks listed in `docs/src/playground/galleries.mjs` (hand-authored `.md`) | Whole deck |
| An **example deck** (Galleries sheet) | `examples/*.md` | Whole deck |

A plan is the same slides the committed `<name>.gallery.md` holds, in this order, each with
a stable `kind` key:

| Slide | `kind` | Source field | Budget |
|---|---|---|---|
| Title | `title` | `name`, `function · form · substance`, `description` | one sentence |
| Default | `default` | `sample` | the component's own capacity |
| One per variant | `variant:<v>` | `variantDocs[v].sample` + `.summary` | the component's own capacity |
| Stress test | `stress` | `stressDoc.sample` | the upper limit, and must still render clean |
| Composition | `composition:<mod>` | `sample` + `dark` / `compact` / `accent` | generated |
| Anti-patterns | `anti-patterns[:n]` | `antiPatterns[]` (`title`, `body`) | caps below |
| See also | `see-also` | `related[]` (`name`, `when`) | ~5 rows |

`<name>.gallery.md` and `<name>.docs.md` are **generated**. Edit the manifest
(`lib/components/<bucket>/<name>/<name>.manifest.json`), then run
`node tools/build-component-docs.js`. Never edit the generated files.

## Word budgets (measured)

Measured on the real engine at design size. "Holds" means no clipped slide and nothing in the
12 px tolerance band. Rows count body words only, with a ~4-word title on top.

| Slide form | Holds (body words per card or row) | Notes |
|---|---|---|
| `cards-grid three`, 3 cards | **50** (58 clips) | With `claim-hero`: clips at 90. |
| `cards-grid`, 2 cards | 66 or more | With `claim-hero`: past 140. |
| `cards-grid`, 1 card | 200 or more | |
| `cards-stack`, 3 cards | 34 | Calibrated for ~16. |
| `cards-stack`, 4 cards | 18 | Never use it for prose. |
| `list-tabular`, 3 rows | 42 | 4 rows: 26. |
| `q-and-a`, 3 pairs | 42 | 4 pairs: 18. `rail`: 26 for 3 pairs. |

Three short columns beat a tall stack for prose because a stack spends its width on two-line
paragraphs and runs out of height. When you need a number for a form not in the table,
measure it (below); do not extrapolate from the component's `Density` line. Set a card's cap at about two thirds of the clip point.

### Anti-pattern text

`antiPatterns[].body` is read twice: as prose on the docs page and as a card on the slide.
Write for the slide's cap, and put the full explanation in `whenToUse` or the variant docs.

1. **Title: ≤ 8 words**, the tempting mistake ("A fifth metric"), not the rule.
2. **Body: ≤ 35 words.** One reason, then the redirect with the component in backticks
   ("Use `line`, whose job is the movement.").
3. **Never past 60 words** title plus body. Over 60 pulls the slide to two cards, over 100 to
   one, and the unit test fails past 200.
4. **No backticks in titles** (the generator strips them), no markdown tables, no nested lists.

The slide carries `claim-hero` (drops the masthead and footer bands) so the cards get the extra height; never shrink type instead. The generator pages the cards (`antiPatternPages`): all cards ≤ 60 words balance three across
(4 become 2 + 2, 5 become 3 + 2); a longer card pulls its slide to two across or one.

## Recipe

1. **Pick the component and read it.** `lib/components/<bucket>/<name>/<name>.docs.md`
   and its manifest. Note `Capacity` and `Density`.
2. **Write `sample`** at the component's *typical* load, not its limit. Real prose, no
   lorem ipsum, a heading that is a sentence.
3. **Write `stressDoc`** at the upper limit and say in `summary` which limit it shows.
   It must still render without clipping.
4. **Write one `variantDocs` entry per modifier**, each with a `sample` that changes only
   that modifier, so the reader sees the difference.
5. **Write `antiPatterns`** (3 is the norm, 2–4 allowed) to the anti-pattern rules above.
6. **Write `related`** with a `when` clause of the form "the rows are X, not Y".
7. **Regenerate:** `node tools/build-component-docs.js`.
8. **Gate it:** `node --test test/unit/tools/anti-pattern-pages.test.js` and
   `npm run lint`. Then `npm run build:check`.
9. **Look at it.** Render the gallery (`node lattice.js <name>.gallery.md out.pdf cuoio`),
   read the `OVERFLOW` line, and open the slides (`tools/rasterize-for-review.sh`). A slide
   that fits but sits against the frame edge is not done.

## Measure a form before you trust a number

Build a deck of the same card at 18 / 26 / 34 / 42 words, one slide per count, and render it:

```bash
node lattice.js sweep.md sweep.pdf cuoio 2>&1 | grep -E "CLIPPED|INSIDE THE FIT"
```

Two lines matter. `CLIPPED … pages N` is a failure. `INSIDE THE FIT TOLERANCE` lists slides
that paint up to 12 px past a box that crops: nothing reports them, and they are the ones
that clip on a different device. Treat both as fails.

On the real surface, check the Playground at `?c=<name>&view=read&s=<kind>`: the runtime
tags a clipped slide `section.overflow` and draws the red "OVERFLOWS" tab.

## Common mistakes

| Mistake | Fix |
|---|---|
| Copying the docs-page `body` into a card unchanged. | Cut to one reason and one redirect; the docs page keeps the long form elsewhere. |
| Calling a slide "fits" because the export printed no `OVERFLOW` line. | Read the `INSIDE THE FIT TOLERANCE` line too. |
| Putting four prose cards on one slide. | Split into 2 + 2 slides; the generator does this for anti-patterns. |
| A stress slide that clips. | The stress sample is the *limit that still fits*. Lower it. |
| Editing `<name>.gallery.md` by hand. | Edit the manifest; regenerate. |
| Typing `→` or `✓` as a mark. | Use the component's own marks; typed glyphs are barred (HARD RULE #29). |
| A hex color or fixed font size in a hand-written deck's `<style>`. | Use `var(--token)` (HARD RULE #3). |

## Ship checklist

- [ ] `node tools/build-component-docs.js` run; generated files committed with the manifest.
- [ ] `node --test test/unit/tools/anti-pattern-pages.test.js` passes.
- [ ] Gallery renders with no `CLIPPED` page and no `INSIDE THE FIT TOLERANCE` slide.
- [ ] Slides looked at, not just counted.
- [ ] `changelog.d/<slug>.changed.md` fragment added.

## Canonical sources

- `tools/build-component-docs.js` — `galleryPlan`, `antiPatternPages`, the caps.
- `engineering/decisions/2026-10-26-playground-anti-pattern-slide.md` — the measurements
  behind the budgets above.
- `engineering/decisions/2026-07-05-specimen-book-playground.md` — why the Playground reads
  these decks.
- `design/skills/component.md` — building the component itself.
- `design/editorial.md` — the words on a slide.
