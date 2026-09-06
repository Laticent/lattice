---
status: in-progress
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
  BRING on-ramp (paste or drop an SVG, auto-id its parts, choreograph, save to the Library, insert
  from its card) because
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

**Date:** 2026-09-06 · **Status:** in-progress — §10 answered by the author 2026-09-06; the faculty is being built

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

### 4.1 Where it lands — the exact markdown Insert writes

Read off the shipped worked deck (`examples/anima-scene.md`, the `source: "svg"` slide) rather than
inferred, because Insert has to produce this byte shape and nothing else:

````markdown
<!-- _class: scene -->
<!-- _footer: "svg · the flow draws itself, node by node" -->

## The pipeline assembles in order.

The drawing ORDER is the meaning — which a static diagram can only present all-at-once.

<svg viewBox="0 0 460 150" fill="none" stroke-width="3" …><rect id="n1" …/><path id="a1" …/></svg>

```anima
{ "source": "svg", "duration": 3600, "hero": 1, "asset": "flow",
  "elements": [
    { "id": "n1", "pathRef": "n1", "color": "var(--cat-2-mark)", "motion": [{ "verb": "draw", "at": 0,    "span": 0.2  }] },
    { "id": "a1", "pathRef": "a1", "color": "var(--text-muted)", "motion": [{ "verb": "draw", "at": 0.2,  "span": 0.15 }] }
  ] }
```
````

**Four facts in that shape settle design questions people otherwise argue about.**

1. **The drawing rides INLINE in the deck**, as the slide's poster `<svg>`. `scene.transform.js` wraps
   it in `.scene-figure` and reads the aspect from its `viewBox`; the ```anima fence is lifted to
   `data-scene-spec` on the section and mounted by `anima-scenes.ts` against `SCENE_SEL`
   (`section.scene[data-scene-spec]`). So a deck carrying a crafted asset is self-contained with no
   further work — §10.1's portability is a property of the target, not something Insert has to add.
2. **`spec.asset` is a self-keying LABEL, not a path.** `parseScene` requires a non-empty string
   for an svg scene, and `hydrate.ts`'s `assetsFor` then builds a ONE-ENTRY `AssetMap`
   — `{ [scene.asset]: assetMarkup }` — whose markup is the slide's own poster `<svg>`, re-sanitized
   at the point of use. So the string is a map key that always finds itself: it never names a file,
   nothing is fetched, and any non-empty value works as long as the spec uses one value. Set it to
   the asset's slug so the fence reads meaningfully to a human, and do not build a file picker.
3. **`pathRef` is the whole addressing contract**, and `parseScene` requires it UNIQUE across
   elements — two parts may not choreograph the same node (the paint would be silently last-wins).
   That is a validation the choreograph surface should enforce as it edits, not discover at save.
4. **Each part carries its own `color` as a `var(--token)`.** So the faculty needs a token picker,
   never a color picker: the part's paint has to stay palette-blind (#3) or the asset stops being
   portable across themes the moment it lands in a deck with a different palette.

`hero: 1` on a draw scene is also deliberate and worth copying: the still the PDF freezes is the
FINAL frame — the finished drawing — because a half-drawn diagram is not a fallback, it is a defect.

## 5. Three on-ramps — and why Bring leads v1

`2026-07-19` §4.2 names Describe · Bring · Template, and flags Describe as the risk in its own words:

> **UNVERIFIED** until the proof gate shows a real model producing on-brand, choreographable SVG at
> the bar — this is the make-or-break assumption of the whole pivot.

**v1 leads with Bring.** Paste or drop an SVG → auto-id its parts → choreograph → preview → save to
the Library → insert from its card (§10.2: those last two are separate acts). It is certain to work, it exercises the choreograph surface and the entire Library
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

### 7.1 What the structure actually looks like — measured, and it kills the obvious heuristic

The obvious pass is "one group, one part". Measured over the 353 SVG files in this repo, it does not
work:

| Signal | Reality |
|---|---|
| files with **no** top-level `<g>` at all | **39%** — the drawing is flat, so there are no groups to be parts |
| top-level `<g>` count, for files that have any | **median 1** — one wrapper around everything, which is not a part boundary, it is the drawing |
| `<g>` elements carrying an `id` | 13% |
| `<g>` elements carrying a `<title>` or `aria-label` | **0% and 0%** — there is no human-authored name to borrow |

So there is no structural signal for "part" waiting to be read. A group-based pass returns one part
("everything") for the median file and zero for four in ten.

**What does work is one rule: unwrap a lone wrapper, then take the paintable children.** Descend
while the current node has exactly one non-`<defs>` child and that child is a `<g>`; every paintable
child of where you land is a candidate part. Same corpus:

| Candidate parts | Files | Share |
|---|---|---|
| 2–12 — a list a human reads and edits directly | **300** | **84%** |
| 13–40 — needs grouping help before it is a list | 29 | 8% |
| 41+ — needs a different strategy entirely | 21 | 5% |
| 0 or 1 — nothing to choreograph | 3 | 1% |

Median 4, p75 9, p90 20. **So the brief's "3 / 400 / 0" cases are 84% / 5% / 1% of real files**, and
v1 should be built for the 84% while refusing the tail honestly rather than pretending to handle it.

**Two caveats, because this corpus is not the user's corpus.** These are *our* SVGs — flags, logos,
component art — not arbitrary pastes, and the 41+ tail is almost entirely country flags, which
nobody will choreograph. Treat the shape of the distribution as evidence and the exact percentages
as indicative. And a candidate part is not yet a *named* one: with 0% of groups carrying a title or
label, every name this pass produces is synthesized from tag and position, which is precisely why
the surface has to let a human rename, merge and split what it proposes. **The pass proposes; the
person decides.** Anything that hides the split behind a spinner is guessing on the user's behalf
with a 16% chance of being obviously wrong.

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

### 8.1 What the guard COSTS the drawing — measured, because two common exports come out blank

The rule above says what is stripped. It does not say what that does to a real file, and the answer
decides a whole screen of this faculty. Measured in REAL CHROMIUM with the installed DOMPurify
3.4.11 and the config imported from `lib/core/sanitize-slide-html.mjs` rather than retyped
(`docs/e2e/svg-paste-guard.spec.ts`). Node + jsdom returns byte-identical output, and
`svg-paint.ts`'s `STRIP_TAGS` carries the same two tags, so all three agree — but the pin is taken
on the browser, because that is the surface that ships (#23):

| Pasted construct | Survives? | What it means for the faculty |
|---|---|---|
| `id`, `class`, `data-*` on any node | **yes** | the whole addressing scheme is safe — choreography can target what it finds |
| `<g transform>`, `<defs>`, `linearGradient`, `clipPath`, `mask`, `filter` | **yes** | structure and paint survive; a grouped drawing keeps its groups |
| `pathLength`, `stroke-dasharray`, `stroke-dashoffset` | **yes** | the draw channel's own mechanism is untouched |
| inline `style="…"` (incl. `var(--token)`) | **yes** | per-element paint survives, tokens included |
| `<text>`, `<title>`, `<desc>` | **yes** | labels and the a11y names survive |
| **`<style>` block** | **NO — element deleted** | classes survive with nothing defining them |
| **`<use>`** | **NO — element deleted** | by DOMPurify's own default, not our config |
| `<foreignObject>`, `<script>`, `on*`, `<animate>` | no | intended; SMIL is not our animation channel |

**Two of those are not edge cases, they are default exports.** Illustrator's "Style Elements" CSS
option puts every fill and stroke in one `<style>` block and references it by `class`; an icon sprite
or a Figma component with repeated instances is `<symbol>` + `<use>`. Run either through the guard and
the markup is still well-formed and still full of addressable ids — it just paints **nothing**. The
`<use>` case is the crueler one: the `<defs>`/`<symbol>` survive, so the drawing looks structurally
intact to any code that counts nodes, and renders as an empty box.

So the faculty cannot treat sanitizing as a silent internal step. **It has to compare before and
after, at paste time, and say what it lost** — naming the construct, saying which export option
produced it, and telling the user the one-line fix ("re-export with presentation attributes", "flatten
instances"). A guard that quietly returns a blank drawing is indistinguishable from a broken faculty,
and the user will blame the faculty. `<use>` in particular can be *offered* as an automatic fix: it is
a reference to a node already in the document, so inlining it before sanitizing is a lossless
rewrite the faculty can do on the user's behalf.

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

## 10. The three questions, answered

Asked in the first draft of this note, settled by the author the same day. All three ran the same
way: **the asset is a thing you own, not a pointer into our machinery.**

### 10.1 The asset CARRIES the drawing — it is self-contained and portable

> *"assets are self contained and portable."*

So a motion asset embeds its SVG. It does not reference a file, a URL, or another Library record.
Three consequences follow and they are not optional:

- **No dangling reference is possible.** This is the §7c failure mode from the other end: a record
  that points at something which can vanish is a record that can rot. One that carries its own
  bytes cannot.
- **A backup round-trips it whole.** `packWorkspace` already zips asset records; an embedded
  drawing needs nothing new to survive an export/restore, and a restore onto a clean profile
  yields a *working* asset rather than a broken pointer.
- **The size cost is real and is accepted.** An inlined SVG is bigger than a reference. The
  measurement that matters is the one against the alternative's failure mode, not against zero.
  The faculty should still refuse a drawing large enough to bloat a deck, and say so at paste time
  rather than at save time.
  **Pick the ceiling from evidence, not a round number.** Across this repo's 82 non-flag SVGs —
  logos, component art, sample imagery, the kind of thing someone would actually choreograph — the
  median is **1.3 KB**, p90 is **2.7 KB**, and the largest is **28.7 KB**. Nothing real comes close
  to 64 KB. So **warn above ~24 KB** (past the p99 of genuine design assets: still workable, but
  worth telling the author their deck just gained a page-weight problem) and **refuse above 64 KB**
  (double the largest real asset — anything there is a traced photo or a map, which is not a
  drawing you choreograph). Measure the SANITIZED bytes, since that is what lands in the deck.
  The 256 KB `MAX_SPEC_B64` ceiling in `hydrate.ts` bounds the ```anima fence, not the drawing —
  a spec never approaches it, so it is not the guard this needs.

"Portable" also constrains the *plan*, not just the drawing: a motion asset must not depend on
deck-level front matter or a theme token that may not exist where it lands. It carries everything
it needs to render, and it inherits color from the element (#3, #29) rather than freezing it.

### 10.2 Save saves to the LIBRARY — insert is a separate act

> *"save saves to the library."*

Save is not insert. The faculty's Save button puts a named record on the shelf beside your themes,
components and finishes — and that is all it does. Placing the asset in the current deck is a
separate, explicit action.

This is the more conservative of the two options §10 offered, and it is the right one for a reason
the first draft undersold: **crafting and placing are different intents.** You may craft three
variants and place none; you may place one you crafted last week. Insert-on-save couples them and
makes the Library a byproduct of deck editing rather than a shelf you keep.

What this does NOT license is the old tab's actual defect. The retired faculty saved to a shelf
**with no door** — no card, no list, no reopen, no delete, `deleteStudioScene` with zero callers.
Save-to-Library is only a coherent answer if the Library end is built: a card that shows the
asset, reopens it for editing, deletes it, and offers Insert. The door is part of v1, not a
follow-up.

### 10.3 Versioning is wanted, but NOT in v1

> *"whether they are versioned is something we want but not yet."*

So `scene` does not join `VERSIONED_KINDS` now. The requirement on v1 is therefore a *negative*
one, and it is the whole content of this answer: **do not design anything that makes versioning
hard to add later.**

Concretely — the record keeps its stable `id` (a version history keys off it), keeps its
`specVersion` stamp (#2081 added it, and it is what lets a schema change migrate rather than
drop), and never mutates a saved asset in place from a path that could not later be snapshotted.
`asset-store.js` excludes scenes today only because they had no Library card; 10.2 gives them one,
so the exclusion becomes a deliberate deferral rather than an accident. Say so in the code, at the
`VERSIONED_KINDS` definition, or the next reader will re-derive the wrong reason.

