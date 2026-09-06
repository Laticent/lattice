---
status: proposed
summary: >
  Fabricate Motion crafts a MOTION ASSET — a drawing plus a plan for how it reveals — and that is
  what makes it a Fabricate tab rather than a control panel. Its three siblings each bring a named,
  previewable, reusable thing into existence; the retired Motion tab did too, and the reason to
  rebuild it rather than delete it is that ANIME.JS REMOVED THE BLOCKER. 2026-07-19 §4 already
  designed this faculty ("choreograph a drawing") and its §4.4a recorded exactly why it could not
  ship: Vivus drove the whole drawing off ONE progress scalar, so per-element windows were
  "explicitly not honored", and `reveal`, `highlight` and `slide` had no painting at all. Measured
  against today's tree, five of that note's six target verbs are live and only `fill` is unpainted.
  THE CONSUMER ALSO ALREADY EXISTS, which is the fact that most changes the plan: a ```anima fence
  on a `scene` slide is lifted to `data-scene-spec` by the component transform and mounted by the
  live host, so a crafted motion has a real place to land. The old faculty's defect was never the
  idea — it was that it saved to a shelf with no door and never wrote that pair. v1 leads with the
  BRING on-ramp (paste or drop an SVG, auto-id its parts, choreograph, save, insert) because
  Describe rests on the make-or-break assumption §4.2 itself flagged UNVERIFIED, and Bring proves
  the choreograph surface and the whole Library lifecycle without betting on it. The auto-id pass
  is named as the piece most likely to be underestimated: a pasted flat SVG usually has no
  addressable ids, and without them Bring is inert.
companion:
  - ./2026-09-02-motion-engine-bakeoff.md
  - ./2026-09-02-frame-model-for-motion.md
  - ./2026-07-19-anima-svg-first-cut-zdog.md
  - ./2026-09-06-fabricate-motion-sheet.md
---

# Fabricate Motion — craft a drawing that moves

**Date:** 2026-09-06 · **Status:** proposed — design only, nothing built

---

## 0. The gap this closes

**No active decision record says what the Fabricate Motion tab is for.** That is not an oversight to
excuse; it is the thing that let a redesign put a control panel in a workshop.

| Doc | Answers | Status |
|---|---|---|
| `2026-09-02-motion-engine-bakeoff.md` | *what paints* — anime.js v4 | shipped in `90a2b41` |
| `2026-09-02-frame-model-for-motion.md` | *what motion is* — known frames | proposed; nothing implements `at(k/N)` |
| `2026-09-06-fabricate-motion-sheet.md` | where the deck's motion CONTROLS live — the Inspector | shipped |
| **this note** | **what Fabricate Motion CRAFTS** | **the missing one** |

The frame model narrowed motion to *"a property of things the engine already draws"* and pushed the
scene faculty out in §7b — with three options, all of them about disposal (leave it, retire it,
delete it) and none about what it should become. So the only design for crafting is
`2026-07-19-anima-svg-first-cut-zdog.md` §4, and that note is `superseded`. A good design, blocked
on an engine that has since been replaced, filed under "no longer applies."

## 1. The decision

> **Fabricate Motion crafts a MOTION ASSET: a drawing, plus a plan for how it reveals.**
> You bring or generate an SVG; the faculty finds its parts, you assign each a motion role and an
> order, and you save the pair to the Library — named, previewable, reusable, insertable.

That is what makes it a Fabricate tab. Its three siblings each bring something into existence that
did not exist before — a theme, a component, a finish — with a live preview and a Library shelf. A
motion asset is the same shape. **Adjusting how an existing chart animates is a different job, it is
a property, and it now lives in the deck Inspector** (`2026-09-06-fabricate-motion-sheet.md`).

## 2. Why now — anime.js removed the blocker

`2026-07-19` §4.4a is unusually honest about why the faculty could not ship, and every reason it
gives is an *engine* reason:

> Today's svg backend is a **stroke-draw renderer**, not a motion engine: `draw(state)` calls
> `vivus.setFrameProgress(progressOf(state))` — **one scalar for the whole SVG** … Per-element
> `at`/`span` windows are explicitly **not** honored.

Measured against today's tree, that is no longer true:

| §4.4 verb | July (Vivus) | Today | Where |
|---|---|---|---|
| `draw` / `trace` | one scalar for the whole drawing | ✅ per-element seek | `backends/drawable.ts` — each track seeks to **its own** element's `reveal` |
| `sequence` | document-order aggregate | ✅ | `compile.ts` window arithmetic |
| `reveal` | net-new: "painting per-element OPACITY is new" | ✅ | `svg-paint.ts` — `isFade` → per-part `opacity` |
| `highlight` | net-new: "needs a new emphasis channel" | ✅ | `svg-paint.ts` — `hasHighlight` → stroke-weight bump |
| `slide` | net-new: "`SvgElement` has no `transform` field" | ✅ | `types.ts` `SvgElement.transform`; `composeTransform` |
| `fill` | net-new painting | ❌ **still unpainted** | `level` is computed by `compile.ts` and **no backend reads it** |

**Five of six.** The one gap is `fill`, and §11 keeps it out of v1 rather than pretending.

## 3. The consumer already exists — the fact that most changes the plan

The retired faculty is usually described as having "no consumer". That is true of the **Library**
shelf and it was the defect. It is **not** true of the deck: the placement path exists and works.

1. An author writes a ```` ```anima ```` fence on a `scene` slide.
2. `animaSceneFences` (`lib/integrations/markdown-it/plugins.js:1525`) emits a hidden div carrying
   the spec as **base64** — chosen so it re-stamps verbatim with no HTML-special characters.
3. `scene.transform.js` lifts it onto the `<section>` as `data-scene-spec` and drops the div.
4. `anima-scenes.ts` selects `section.scene[data-scene-spec]` (`SCENE_SEL`) and mounts the live
   animation; the PDF freezes the inline poster.

`examples/anima-scene.md` ships as a worked deck. **So the faculty's output has a real place to
land, and always did.** What the old tab never did was WRITE that pair — it saved a spec to
IndexedDB and stopped. The fix is not a new rendering path; it is finishing the arc.

**This reframes the work.** v1 is not "build a motion engine surface". It is: get an SVG, find its
parts, let the author choreograph them, and emit the poster + fence the engine already understands.

## 4. The artifact

```
MotionAsset {
  name, label, description        // the Library identity every sibling has
  art:    string                  // the DRAWING — sanitized SVG markup
  spec:   Scene                   // { source:'svg', asset, elements:[{ pathRef, motion }], duration, hero }
  poster: string                  // the serialized still the PDF freezes
  specVersion: number             // stamped, per the §7c lesson
}
```

**The drawing travels WITH the plan, in one record.** The alternative — a plan that references a
drawing supplied per deck — recreates exactly the dangling-reference class that produced the §7c
data-loss defect: a stored record whose meaning depends on something that can move or vanish
underneath it. One record has one lifetime.

`art`, `poster` and `spec` are the three fields `StudioScene` **already declares**, so this is the
existing shape finally being filled rather than a new one. The old faculty wrote only `spec`.

## 5. Three on-ramps — and why Bring leads v1

`2026-07-19` §4.2 names Describe · Bring · Template, and flags Describe as the risk in its own words:

> **UNVERIFIED** until the proof gate shows a real model producing on-brand, choreographable SVG at
> the bar — this is the make-or-break assumption of the whole pivot.

**v1 leads with Bring.** Paste or drop an SVG → auto-id its parts → choreograph → preview → save →
insert. It is certain to work, it exercises the choreograph surface and the entire Library
lifecycle, and it hardens the sanitize boundary — so Describe later lands on a proven surface
instead of being the thing that has to work first. Describe is v2 and gets its own proof gate.
Template is v3 and is cheap once the other two exist (a house drawing is just a pre-supplied Bring).

## 6. The choreograph surface

The house shape, taken from `FinishStudio`: a 50px header with the name and Save; a live preview in
the centre under a `Live preview` eyebrow; a control aside that flips from a bottom border to a left
border at `lg`.

- **Left / aside — the parts.** The SVG's paths, groups and text labels, listed by id. Selecting one
  assigns a **motion role** (`draw` · `reveal` · `highlight` · `slide`) plus an **order** and a
  **window**. This is more legible than a 3-D primitive tree, which is §4.3's point: *you choreograph
  a drawing you can already see.*
- **Centre — the live preview.** A real `DeckPreview` rendering a `scene` slide built from the
  asset, so the author sees what the deck will show, in the deck's own theme. **This is the piece
  the retired tab's replacement lacked and every sibling has.**
- **The generated fence**, read-only, in a `Collapsible` with a Copy button — the same treatment
  `FinishStudio` gives its generated CSS, with the reason stated.

## 7. The auto-id pass — the piece most likely to be underestimated

§4.3 states it as core scope, not an open question:

> a pasted flat SVG usually has *no* addressable ids, so an **auto-id / group-detection pass** is
> required to make its parts choreographable at all — without it the Bring path is inert.

This is load-bearing because `SvgElement.pathRef` addresses parts **by id**, and `svg-paint.ts`
resolves them by id at mount. An SVG exported from a drawing tool typically has none.

It is also the piece with the most room to be wrong: the pass has to produce ids that are **stable**
(re-running it on the same drawing gives the same names, or a saved plan breaks), **meaningful**
enough to choose from a list, and **grouped** the way a human would group them (a five-part arrow is
one thing to reveal, not five). **v1 should prove this on real exported SVGs before the surface is
designed around it** — it is the honest analogue of the Describe proof gate.

## 8. Security — the spine, not an afterthought

A brought SVG is **untrusted third-party markup**, and it reaches a preview frame. HARD RULE #22
governs, and the boundary already exists in three places this design must use rather than reinvent:

- `sanitizeSlideHtml` (DOMPurify) at the **store boundary** — `saveStudioScene` already sanitizes
  `art` and `poster` on every write, so no caller can persist raw markup.
- `svg-paint.ts` `STRIP_TAGS` — `script`, `foreignobject`, `style`, `image`, `use`, `animate`,
  `animatetransform`, `animatemotion`, `set` — stripped as defense-in-depth at parse.
- The preview builder owes **both** channels, markup and stylesheet (`sanitizeStyleText`), per #22's
  §9 finding that a `</style>` inside theme CSS ends the element and the remainder parses as markup.

**A dropped file is a new ingest**, so it also owes the line-ending/BOM boundary
(`2026-08-04-line-endings-lf-boundaries.md` + `SANCTIONED_EOL_BOUNDARIES`).

## 9. What v1 does NOT do

Stated so it is not implied:

- **No `fill`.** `level` is computed and no backend paints it. A data-bound verb is v2 at the
  earliest, and needs a painting change first.
- **No Describe.** v2, behind its own proof gate.
- **No 3-D.** `spin` / `orbit` / `explode` retired with Zdog and are not coming back.
- **No timeline authoring.** The frame model deleted the easing curve and the poster slider as
  authored surfaces; the window (`at` / `span`) and the order survive, because those are frame
  indices rather than clock settings.
- **No export bytes change.** A `scene` slide's PDF is its inline poster, exactly as today.

## 10. Open questions for the human

1. **Does the asset carry the drawing, or reference one?** §4 recommends carrying it, on the §7c
   dangling-reference argument. This is the one decision that shapes the schema.
2. **Does Save also INSERT?** The arc "craft → save → place in this deck" is what the old faculty
   never closed. Insert-on-save is the strongest fix; a separate "Insert" action on the Library card
   is the more conservative one.
3. **Does a motion asset get version history?** `VERSIONED_KINDS` is `theme`/`component`/`finish`
   today, and `asset-store.js` says scenes are excluded only because they have no Library card yet.
   Giving them a card removes that reason.
