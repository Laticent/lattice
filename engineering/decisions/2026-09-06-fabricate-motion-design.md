---
status: in-progress
summary: >
  The design the Fabricate Motion faculty is BUILT from — the winner of a five-track design
  competition (5 tracks x 5 internal iterations, one fresh critic each, one shared fact-checker,
  comparative judging), picked by both surviving judges at 8.7 and 9.0 with zero refuted claims
  across the densest verification set of the five. Its spine is one idea: the drawing passes a
  visible DOORWAY before it earns a plan — an Intake Receipt that says what was rewritten, removed
  and kept, before you spend a minute choreographing. It is the only track that solved all three
  ingest constructs that decide whether Bring works at all: bounded `<use>` expansion BEFORE the
  sanitizer deletes it, `<style>` loss reported with its re-export fix, and the net-new strips
  DOMPurify KEEPS (`<image>` with an off-origin href, `<animateTransform>`, `<animateMotion>`) which
  `svg-paint.ts` removes later — so without an intake strip the stored drawing does not equal the
  painted one and an exported deck carries a tracker into every recipient's copy. It is also the only
  one that namespaces ids so two assets on one deck cannot corrupt each other, and the only one that
  caps the POSTER — the artifact that actually inlines into the slide. Section 14 records the grafts
  taken from the four runners-up and the two calls the judges left open.
companion:
  - ./2026-09-06-fabricate-motion-craft.md
  - ./2026-09-02-frame-model-for-motion.md
  - ./2026-07-19-anima-svg-first-cut-zdog.md
---

# Fabricate Motion — the design we build

**Date:** 2026-09-06 · **Status:** in-progress · **Provenance:** winner of a five-track design
competition; see §14 for the grafts and the two open calls the judges handed back.

---

# Fabricate → Motion (v1, Bring)

## Designed outward from the worst case

The brief asked me to design from the worst failure mode: **a 400-part SVG with no ids that the sanitizer mangles.** I traced that case through the real code and it is worse than the brief implies — it fails in *five* independent places, and four of them fail *silently*:

| # | Where | What actually happens | Measured / read at |
|---|---|---|---|
| 1 | `sanitizeSlideHtml` | `<style>` is in `FORBID_TAGS` → **deleted**, while `class="cls-1"` survives. Every CSS-styled fill reverts to the SVG default (black fill, no stroke). The drawing looks *wrong*, not broken. | pinned in `docs/e2e/svg-paste-guard.spec.ts` (real Chromium) |
| 2 | `sanitizeSlideHtml` | `<use>` is **deleted** (both `href` and `xlink:href` forms), `<symbol>` survives. A sprite-built drawing renders **blank** — unless we expand `<use>` before the sanitizer, which §4.2b now does. | pinned in `docs/e2e/svg-paste-guard.spec.ts` |
| 3 | the parts list | 400 flat `<path>`s with no ids. A flat list is unusable, and `compile.ts`'s `sequence` tiles the *whole sequenced subset*, so 400 parts at 3000 ms is 7.5 ms each — invisible. | `docs/src/lib/anima/compile.ts` |
| 4 | the painter | `svg-paint.ts` `mount()` does a `getBBox()` **and** a `getComputedStyle()` per part; `drawable.ts` `buildTracks()` builds one anime.js instance per drawn part and seeks all of them every frame. | source |
| 5 | Save / Insert | ~500 KB of art + ~500 KB of poster into IndexedDB, then the poster onto one markdown line and the spec into a base64 attribute. | `scene-library.ts`, `plugins.js` `toBase64` |

Two more are the *inverse* danger — things the sanitizer **keeps** that we do not want: `<image href="https://…">` survives DOMPurify and `<animateTransform>` survives DOMPurify (both measured on jsdom; both are being added as assertions to the Chromium paste-guard spec, §10), yet both are stripped later by `svg-paint.ts`'s `STRIP_TAGS`. So **the stored drawing would not equal the painted drawing** — the card, the poster and the deck could all show something the stage never did.

Everything below is shaped by that. The spine of this design is one idea:

> **The drawing passes a doorway before it earns a plan.** Intake is a designed, visible, first-class step that tells you exactly what it did to your drawing — *before* you spend a minute choreographing it.

---

## 1. The one-sentence model

> **A motion asset is a drawing plus a running order: the parts, and the beat each one arrives on.**

Nine words the user actually holds: **parts** and **beats**. Not timeline, not window, not `at`/`span`, not easing. The frame model is taught by the frame strip under the stage — five stops, the last one labeled **Poster** — never by exposing `at(k/N)`.

---

## 2. Layout skeleton

### Desktop ~1440 — three panes under the house 50px header

```
┌ 50px header ─────────────────────────────────────────────────────────────────────┐
│ [x] ● motion-<name>▏ [Desc▾]  [Theme|Component|Finish|MOTION]      [Export][Save] │
├──────────────────┬────────────────────────────────────┬──────────────────────────┤
│ PARTS      300px │ STAGE                        fluid │ INSPECTOR          330px │
│ (scrolls)        │ (scrolls)                          │ (scrolls)                │
│                  │                                    │                          │
│ ▸ INTAKE ────────│ LIVE PREVIEW      [Live │ On slide]│ ┌ SELECTED PART ───────┐ │
│  8 parts · 1 grp │ ┌────────────────────────────────┐ │ │ Rule, upper left  [✎]│ │
│  1 stylesheet    │ │                                │ │ │ path · has outline   │ │
│  removed  [why]  │ │   section.scene, hydrated by   │ │ │                      │ │
│                  │ │   hydrateScene() — the real    │ │ │ Arrives by           │ │
│ RUNNING ORDER    │ │   host the deck uses           │ │ │ [Draw|Fade|Slide|—]  │ │
│ ─ BEAT 1 ─────── │ │                                │ │ │ From   ← ▪ → ↑ ↓     │ │
│  ▸ Frame         │ └────────────────────────────────┘ │ │ Distance ▭▭▭▭ 18%    │ │
│  ▸ Baseline      │                                    │ │ Emphasize    [ off ] │ │
│ ─ BEAT 2 ─────── │ FRAMES                             │ └──────────────────────┘ │
│  ▸ Rule       ◀  │ [0][1][2][3][4·POSTER]             │ ┌ PLAN ────────────────┐ │
│  ▸ Label         │                                    │ │ Pace  [Calm│Brisk]   │ │
│ ─ BEAT 3 ─────── │ Plays on screen; the PDF freezes   │ │ 4 beats · 2.8s       │ │
│  ▸ Group of 12   │ the LAST frame.                    │ │ 6 of 8 parts move    │ │
│    [Choreograph  │                                    │ └──────────────────────┘ │
│     separately]  │ ▸ GENERATED FENCE          [Copy]  │ ┌ READS AS INFORMATION?│ │
│                  │   (Collapsible, read-only)         │ │ advisory · never     │ │
│ [ + Beat ]       │                                    │ │ blocks               │ │
│ [ Replace drawing│                                    │ └──────────────────────┘ │
└──────────────────┴────────────────────────────────────┴──────────────────────────┘
```

Header contents, left to right, matching `FinishStudio`'s 50px bar exactly: close/back `X`, the accent dot, the inline-editable name field prefixed `motion-`, the Description disclosure (`Text` + chevron), the four-way faculty toggle, spacer, `Export` (outline), `Save` (primary, validity-gated with a `Tip` explaining any refusal). Below the header, a full-width `role="alert"` row for a name refusal — the row FinishStudio added because a truncated tooltip is invisible at 390px.

**Export is defined, not decorative** (it was an unspecified control in the first draft). It is `downloadText` of two files zipped through the existing `shareAsset` path: the sanitized `art` as `<name>.svg`, and the generated `anima` fence as `<name>.anima.md`. It duplicates nothing — the fence's `Copy` puts one artifact on the clipboard; Export puts both on disk. Below `sm` it is icon-only (`Upload`) with `aria-label="Export drawing and plan"`.

**What scrolls:** at `lg` the three panes scroll independently (`lg:grid lg:overflow-hidden` on the wrapper, `lg:overflow-y-auto` on each pane), matching `FinishStudio`'s `lg:[grid-template-columns:1fr_330px]` shape. Below `lg` there is one page scroll.

### Tablet ~820 — two columns, inspector goes inline

```
┌ 44px header (labels drop to icons below sm) ───────────────────────────┐
├──────────────────┬─────────────────────────────────────────────────────┤
│ PARTS      260px │ STAGE + FRAMES + fence                              │
│ ▸ INTAKE         │                                                     │
│ ─ BEAT 1 ──────  │                                                     │
│  ▸ Frame         │                                                     │
│  ▾ Rule      ◀   │                                                     │
│   ┌ inspector ─┐ │                                                     │
│   │ Arrives by │ │   ← the SAME inspector component, rendered INSIDE    │
│   │ From  ← →  │ │     the selected row instead of in an aside          │
│   │ Emphasize  │ │                                                     │
│   └────────────┘ │                                                     │
└──────────────────┴─────────────────────────────────────────────────────┘
```

The inspector is **one component placed by breakpoint** — the pattern `Fabricate.tsx` already uses for `compManifestPanel` ("One element, placed by breakpoint"). At `lg` it renders into the aside; below `lg` it renders inside the selected row as a `Collapsible`. Stacking the three panes vertically (FinishStudio's answer) is wrong here: a choreography tool where you cannot see the parts list and the stage at once is a different, worse tool, and 820px has room for both.

### Mobile ~390 — one column, stage pinned

```
┌ 44px header: [x] [●][name…] [◱◱◱◱] [↧][✓]   (icon-only, sm:inline labels)
├──────────────────────────────────────────────
│ STAGE  16:9, position:sticky top-0, z-10
│ FRAMES  ─ horizontally scrollable strip ─→
├──────────────────────────────────────────────
│ ▸ INTAKE  8 parts · 1 stylesheet removed
├──────────────────────────────────────────────
│ ─ BEAT 1 ────────────────────────────────
│  ▸ Frame                          [Draw ▾]
│  ▾ Rule                                  ◀
│    ┌ inspector, inline ─────────────────┐
│    └────────────────────────────────────┘
│ [ + Beat ]
│ ▸ Generated fence
└──────────────────────────────────────────────
```

The stage is **sticky**, so scrolling the parts list never loses sight of what you are choreographing. Every control below `sm` is icon-only with an `aria-label`, exactly as the three siblings do (`<span className="hidden sm:inline">`). The compass and the distance slider are full-width rows, not a joystick.

---

## 3. The interaction arc, with every state

### 3.0 Empty — the front door

The Parts pane is replaced by one full-height intake card. It is a real `<textarea>`, not a div with a paste handler: ⌘V works, the field is labeled, and a keyboard/screen-reader user reaches it by Tab.

```
┌──────────────────────────────────────────┐
│         Bring a drawing                  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Paste SVG markup here — or drop a  │  │
│  │ .svg file anywhere on this panel.  │  │
│  │                             (⌘V)   │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [ Choose a file… ]                      │
│                                          │
│  We find its parts, you give each one    │
│  a beat, and it plays.                   │
└──────────────────────────────────────────┘
```

Drop is accepted on the whole panel (a `dragover`/`drop` handler with a dashed accent ring), matching the Library's "one gesture for every kind" precedent.

**Where Describe (v2) goes, and why it costs no rewrite.** Describe produces *an SVG string*. That is exactly what `intake(raw)` already takes. So v2 adds one row above the textarea — the same `Sparkles` command bar the Theme and Finish tabs ship, with the same `useArchitectStatus()` / `Connect` degrade — and its success path calls `intake(out.svg)`. Nothing else moves. **v1 ships no dead control**: no disabled prompt, no "coming soon" chip. A control that does not move something is not in this tab.

### 3.1 Pasting

The moment content arrives, the pane swaps to a working state for the length of one intake (measured on jsdom + DOMPurify 3.4.11: 8.6 ms at 40 parts, 34.7 ms at 400, 150 ms at 2000 — Chromium will be faster, but the shape is linear and the 2000 case is a visible beat). A `Loader2` spinner and the text **"Reading the drawing…"**. Above 64 KB the label adds "— this is a large drawing."

### 3.2 The Intake Receipt — the screen this design exists for

Not a toast. A persistent, collapsible card at the top of the Parts pane, and the **first thing focus lands on** after intake, with a `role="status"` announcement of its headline.

```
┌ INTAKE ──────────────────────────────────── ▾ ┐
│ 8 parts found in 1 group · 12.4 KB art        │
│ (+ 9.1 KB poster · 21.5 KB stored)            │
│                                               │
│ REWRITTEN                                     │
│  · 12 reused symbols expanded in place        │
│  · 31 ids namespaced so two drawings on one   │
│    deck cannot collide                        │
│                                               │
│ REMOVED                                       │
│  · 1 stylesheet — colors set by CSS classes   │
│    are gone. Re-export with "presentation     │
│    attributes" to keep them.                  │
│  · 1 embedded image — a motion asset carries  │
│    vector only.                               │
│  · 3 unsafe nodes (script, event handlers)    │
│                                               │
│ KEPT AS-IS                                    │
│  · 6 fixed colors — this drawing will not     │
│    recolor with the deck's theme.             │
│                                               │
│           [ Replace the drawing ]             │
└───────────────────────────────────────────────┘
```

Severity is carried by the **words** `REWRITTEN` / `REMOVED` / `KEPT AS-IS`, never by color alone (WCAG 1.4.1). Each line names the cost *and* the fix. The receipt collapses to its one-line headline once you start choreographing, and reopens from that line.

This is the piece that turns silent damage into information. Without it the `<style>` case — the single commonest real-world export — is a drawing that silently turns black and a `Draw` control that silently does nothing.

### 3.3 Choreograph

Focus is on the first part row. Every part starts at **Beat 1, "Fade in"** — a plan that already plays. You are never staring at a dead stage deciding what a verb is.

Select a row (click, or `↑/↓` in the roving-tabindex listbox) → the inspector fills. `Alt+↑/↓` moves the part between beats. `Space` toggles "arrive with the part above" (same beat). `+ Beat` appends. `F2` (or the row's pencil) renames the part inline — see §4.6b.

A band row (§4.5) carries one extra action, **Choreograph these separately**, which replaces the band with its member rows. Clicking a shape on the stage does the same thing for that shape: it selects it if it is already a row, and promotes it out of its band if it is not.

### 3.4 Save → the Library

Save is disabled until `slugify(name)` is non-empty **and** `parseScene(spec).ok` **and** the name is not taken by another saved scene (`findNameClash` from `library/save-guard.ts`, the same rule the three siblings use, with the same `owned` set so re-saving your own record is legal). The disabled reason is in a `Tip` **and** in the `role="alert"` row.

On success: `saveStudioScene({ id?, name, label, description, spec, art, poster })`, a `notify("Saved \"<label>\" to your Library — insert it from its card.")`, and `onSaved?.()` so the shell refreshes.

### 3.5 Insert — a separate act, from the card

Save does not insert (§10.2). The Library's Motion card carries `Insert`, wired to the **existing** `onInsert(skeleton, name)` prop, which `StudioShell.tsx:5050` already routes to `applyDeckOp(addSlideAfter(source, curIndex, skeleton))`. No new insert path is built.

### The full state table

| State | Trigger | Surface | Copy |
|---|---|---|---|
| **empty** | fresh tab | the intake card | "Bring a drawing." |
| **pasting** | content arrives | spinner in the intake card | "Reading the drawing…" |
| **too big (art)** | sanitized art > 256 KB | intake card, refusal ring, nothing stored | "That drawing is 412 KB — too big to travel inside a deck. The ceiling is 256 KB. Simplify it in your drawing tool, or crop to the part you want to animate." |
| **too big (poster)** | serialized poster > 256 KB after plan change | plan card, Save disabled | "The still this plan produces is 280 KB — over the 256 KB ceiling. Draw fewer parts, or simplify the drawing." |
| **large (soft)** | art 64–256 KB | receipt line, non-blocking | "This drawing is 96 KB — the slide it lands on will be slow to edit." |
| **not an SVG** | sanitize returns `''`, or no `<svg>` in the parse | intake card | "That paste has no `<svg>` element in it. Copy the SVG markup itself, or drop the `.svg` file." |
| **no coordinate box** | root has no usable `viewBox` and no px width/height, and the union bbox is empty | intake card | "This drawing has no coordinate box, so we cannot place its parts. Re-export it with a viewBox." |
| **nothing survived** | census finds 0 paintable nodes after expansion + sanitize | intake card, with the receipt's REMOVED list already expanded | "Nothing in this drawing can be animated one part at a time — its shapes are references we could not resolve. Flatten or expand it on export and bring it again." |
| **one part** | census finds exactly 1 | **not an error** — normal surface, one row, role preset to Draw | — |
| **crowded** | > 24 addressable rows | receipt headline leads with it | "400 shapes, grouped into 17 bands automatically. Open a band to choreograph its parts separately, or re-export with layer groups for better grouping." |
| **band expanded** | "Choreograph these separately" | the band row is replaced by its member rows; an "Undo grouping" affordance sits on the beat header | "24 parts can carry a verb; this band has 50." (refusal when the expansion would exceed the cap) |
| **verb cap reached** | a 25th part is given a role | soft refusal on the inspector's role control | "24 moving parts is the frame budget. Set this one to Already there, or free a beat." |
| **no outline / not drawable** | selected part is a group, `<text>`, or has no stroke | Draw and Emphasize disabled, with the words beside them | "groups and text can't be drawn — expand the group to draw its shapes" / "no outline to draw" |
| **replaced** | Replace the drawing, then a successful intake | reconciliation line in the receipt, with Cancel | "18 parts matched, 2 are new, 1 is gone — its beat was dropped." |
| **part missing on reopen** | `sceneToPlan` finds a `pathRef` with no node | a disabled row naming the `pathRef` | "This part is no longer in the drawing. Remove it, or bring the original drawing back." |
| **invalid** | `parseScene(spec).ok === false` | red row, Save disabled, errors listed verbatim, `[Copy the plan]` | "The plan didn't validate — that's a bug on our side, not yours. Copy it and tell us." |
| **saving** | Save pressed | button → `Loader2` + "Saving…" | — |
| **saved** | resolved | toast + `role="status"` | "Saved \"Value chain\" to your Library — insert it from its card." |
| **failed (clash)** | store throws with `REFUSAL_PREFIX` | toast, verbatim store message | "Can't save — \"value-chain\" is already another saved scene. Rename that one first." |
| **failed (store)** | any other throw | toast | "Could not save — your browser may block storage (private mode?)." |

---

## 4. The parts pass — auto-id, grouping, naming

This gets the most design because it is the thing that decides whether Bring works at all.

### 4.1 Normalize the ingest (new ingest ⇒ the LF/BOM boundary)

Strip a leading `﻿` and fold `\r\n?` → `\n`. Both are load-bearing, not hygiene: **a BOM survives the sanitizer as a text node** (measured — `"﻿<svg …>"` comes back with the BOM intact), so it would sit in the stored `art`, in the poster, and on the author's markdown line. `\r?\n` is the wrong pattern here; `\r\n?` is what `SANCTIONED_EOL_BOUNDARIES` arm 5 requires, because it covers lone-CR too.

### 4.2 Two parses of the same bytes, for two different jobs

```
raw ──┬─→ DOMParser(raw, 'text/html')   → the HINT + REWRITE document (inert, never attached)
      │      ├─ harvest naming hints the sanitizer will destroy
      │      └─ expand <use> (§4.2b), then re-serialize
      └─→ sanitizeSlideHtml(rewritten)  → the SECURITY boundary → `art`
```

The hint parse exists for one measured reason: **the sanitizer destroys exactly the attributes drawing tools use to name things.** `inkscape:label` and `serif:id` are stripped; `data-name`, `<title>`, `aria-label`, `id` and `class` survive. Illustrator writes `data-name`, Inkscape writes `inkscape:label`, Affinity writes `serif:id` — two of those three die at the boundary.

The hint document is the same primitive `svg-paint.ts` already uses (`new DOMParser().parseFromString(markup, 'text/html')` — inert: scripts do not run, subresources do not load). Nothing is ever *attached* from it; the rewritten string still crosses `sanitizeSlideHtml` before a single node is created in the host document, and harvested labels are filtered to `[A-Za-z0-9 _.-]` and truncated to 32 chars. Labels are data, not markup.

### 4.2b Expand `<use>` before the sanitizer deletes it

The accepted ADR (`2026-09-06-fabricate-motion-craft.md` §8.1) asks for this by name: "`<use>` … is a reference to a node already in the document, so inlining it before sanitizing is a lossless rewrite the faculty can do on the user's behalf." An earlier draft of this design declined it and sent every sprite export — Figma component instances, icon sprites, both default export shapes — to the `nothing survived` dead end. That was the wrong call and it is reversed here.

On the hint document, for each `<use>`:

1. resolve `href` / `xlink:href` to an in-document `<symbol>`, `<defs>` child or plain element by id; a reference to another document is not resolved (it is dropped, and counted as removed);
2. deep-clone the referent, unwrap a `<symbol>` into a `<g>`, and put the clone inside a wrapping `<g>` that carries the `<use>`'s `transform`, plus `translate(x, y)` from its `x`/`y`;
3. replace the `<use>` with that `<g>`.

Bounds, because a sprite can reference a sprite: expansion depth caps at **4**, total expanded node count at **4000**, and a cycle (a symbol that reaches itself) stops at the first repeat. Exceeding either cap aborts the expansion pass entirely rather than shipping a half-expanded drawing, and the receipt says so. `width`/`height` on a `<use>` are honored only when the referent is a `<symbol>` with its own `viewBox`; otherwise they have no effect in SVG 1.1 either and are dropped.

The receipt reports it: **"12 reused symbols expanded"**. `nothing survived` remains, but now it means what it says — every reference was unresolvable.

### 4.3 Strip what the painter will strip anyway — at intake

Split precisely, because the difference is what proves §4.2b has to run *before* the sanitizer:

- **Already gone at the sanitizer, nothing for us to do:** `script`, `style`, `foreignobject`, `use`, `animate`, `set`, `on*` handlers, `javascript:` hrefs.
- **Net-new strips we perform on the sanitized art:** `image`, `animatetransform`, `animatemotion`.

DOMPurify **keeps** `<image>` (including an external `href`) and **keeps** `<animateTransform>`. `svg-paint.ts`'s `STRIP_TAGS` removes both at mount. So without this step the stored art, the card thumbnail and the deck's markdown would carry an off-origin fetch and a foreign SMIL loop that the stage never shows. After this step, **the stored drawing equals the painted drawing.** Each removal is counted into the receipt.

### 4.3b Namespace every id, and rewrite every reference to it

A deck is one document. Two slides carrying inline SVGs that both define `id="a"` — and `id="a"`, `id="gradient1"`, `id="clip0"` are what every exporter writes — make every `url(#a)` in the second resolve to the first. The same corruption happens when one asset is inserted twice. The painter itself is safe (`svg-paint.ts` scopes `querySelectorAll('[id]')` to the parsed asset), but the deck is not, and §7's claim that the asset is self-contained is only true in isolation without this pass.

So intake prefixes **every** `id` in the sanitized art — `<defs>` ids included, which the census in §4.4 otherwise never touches — with the asset's stable slug-hash (`va1b2c3-`), and rewrites every reference that points at a rewritten id: `url(#…)` wherever it appears (`fill`, `stroke`, `clip-path`, `mask`, `filter`, `marker`, `marker-start/mid/end`), and `href` / `xlink:href` fragment references. One pass over the tree the census already walks.

This also makes `pathRef` collision-proof and makes double-insert safe. Author ids are still *recognizable* (`va1b2c3-arrow`), which is what §4.6's naming cascade reads.

### 4.4 The census — which nodes are addressable

Walk the sanitized art:

- **Drawable leaves** (`SVGGeometryElement`): `path, rect, circle, ellipse, line, polyline, polygon`.
- **Other paintable leaves:** `text`.
- **Groups:** a `<g>` with ≥ 2 paintable descendants.
- **Excluded:** anything inside `defs, clipPath, mask, marker, symbol, pattern`. These do not paint on their own. Animating them addresses a node the viewer cannot see. (Their *ids* are still namespaced, §4.3b.)

### 4.5 Group before you name — the 3 / 400 / 0 answers

> **We show the shallowest cut of the drawing's own tree that a human can read — and we always leave a way down to a single shape.**

Take the SVG root's element children as the cut. While the cut has **fewer than 2** members, descend into the single member (this unwraps the ubiquitous `<g id="Layer_1">` wrapper). While the cut has **more than 24** members, **do not descend** — bin instead.

The row cap and the binning trigger are **the same number**, deliberately. An earlier draft descended below 2 and binned above 12 with `N = clamp(2, 8, ceil(n/50))`, which made a 13-part drawing collapse into 2 bands of 6 — a worse outcome than the 12-part drawing next to it, and pinned at 2 bands all the way to 100 parts, which is the normal size of the diagrams this faculty exists for. Now:

```
rows ≤ 24 → every member is its own row, no binning at all
rows > 24 → N = ceil(n / 24) contiguous bands of document order
```

so band count grows with the drawing instead of flattening it.

**3 parts.** The root's three children *are* the cut. Three rows, three names, done. Nothing clever happens and nothing needs to.

**400 parts, flat, no groups.** The cut is 400 and cannot be descended (they are leaves). Bin into `ceil(400/24) = 17` contiguous runs of **document order**, each wrapped in a synthetic `<g id="va1b2c3-band-1">` inserted into the sanitized art.

- Document order, not spatial order, because that is what the exporter emitted, it is what a human drew, and it is the order `compile.ts` itself uses for `sequence` (tree pre-order).
- Wrapping **mutates the sanitized art** — legitimate precisely because the only bytes added are `<g>` elements we authored. No input byte moves and none is reinterpreted.
- A band's name is a count plus a place word from its combined bbox against the viewBox thirds: **"Group of 24 · upper left"**, **"Group of 24 · center"**.
- **A band is not a wall.** Selecting one offers **Choreograph these separately**, which replaces that band row with its member rows (refused, with the count, if that would push the plan past the 24-verb cap of §4.9). Clicking a shape on the stage promotes it out of its band the same way. Without this the tool physically cannot choreograph one specific part of any drawing over 24 leaves, which is its whole purpose.
- **A band cannot be drawn.** See §4.8 — a band gets Fade, Slide and Already there; Draw and Emphasize are disabled with the reason beside them, and "expand the group to draw its shapes" is the named fix.

**0 parts.** Three genuinely different causes, three different messages, because they have three different fixes — see the state table (`nothing survived`, `not an SVG`, `no coordinate box`), plus the non-error `one part`. Collapsing them into one "no parts found" is the failure this design most wants to avoid.

### 4.5b No `viewBox` is a real case, and it breaks three things at once

`lib/core/image-aspect.js` `aspectFromSvgTag` falls back to `viewBox` only when width/height are absent or non-px, and `scene.transform.js` uses it to pick the slide composition; `svg-paint.ts` `svgSize` falls back to `width`/`height` and then to a hardcoded 300×150; and §4.5's place words are computed against "the viewBox thirds", which means nothing without one. A `width="100%" height="100%"` export — routine for inline posters, per `image-aspect.js`'s own comment — hits all three.

Intake therefore normalizes the coordinate box, in order: use a usable `viewBox` if present; else derive one from px `width`/`height` and stamp it; else mount the sanitized art hidden once, take the union bbox, and stamp that; else refuse with the `no coordinate box` state. The place-word namer reads the stamped box, so it always has one.

### 4.6 Naming a part — the hint cascade

First hit wins, each rung verified against what survives:

1. the node's own `id` (with our namespace prefix stripped for display), if **humane**: matches `/^[a-z][a-z0-9 _-]{1,31}$/i` **and** is not an exporter serial (`/^(path|g|rect|circle|layer|vector|group|shape|_?\d+|[0-9a-f]{6,})/i` → rejected);
2. `data-name` (Illustrator — survives);
3. a child `<title>`'s text (survives);
4. `aria-label` (survives);
5. `inkscape:label` / `serif:id` — **from the hint document only** (destroyed by the sanitizer);
6. for `<text>`, its own text content ("Revenue" is a perfect name);
7. otherwise **shape word + place word**: "Rectangle · upper left", "Line · center", "Group of 12 · lower right".

Then: trimmed to 32 chars, ASCII-filtered, and de-duplicated by suffixing ` 2`, ` 3`.

### 4.6b Renaming, and making the name survive a save

Auto-names are often wrong or ambiguous — that is the nature of rung 7 — so the row carries **inline rename** (`F2` or the row pencil, the same inline-editable pattern as the header name field).

The display string is kept **separate from the slug**, and it is stored **in the drawing**, not only in the spec: renaming writes `data-name="<label>"` onto the node in the sanitized art. `data-name` survives the sanitizer (pinned), and §4.6 rung 2 already reads it back — so the label round-trips through save/reopen and through `Replace` for free, instead of degrading to `group-of-50-upper-left` the way a slug-only round-trip does. `SvgElement.id` still carries the slug, because that is what `parseScene` requires to be unique and what `auditScene` quotes.

### 4.7 Two ids, and neither is a schema change

`SvgElement` already carries **two** string fields, and this design uses both for their natural jobs:

- **`pathRef` is the machine address** — always the node's namespaced id (§4.3b). Where the source gave a usable id we keep it inside the namespace (`va1b2c3-arrow`), so a hand-prepared SVG stays readable; otherwise the suffix is `lm-<hash>` over the node's *structural signature*: tag name, index among same-tag siblings, the ancestor chain, and the first 64 chars of `d`/`points`/text. **Same bytes in ⇒ same id out**, which is the stability the decision doc demands.
- **`id` is the human name** — the display name slugged to ASCII, with `data-name` (§4.6b) as its durable home in the drawing.

**Ids must be ASCII, and this is not fastidiousness.** `plugins.js` `toBase64` encodes UTF-8, but `hydrate.ts` `decodeSpec` decodes with `atob` and never UTF-8-decodes, so a non-ASCII codepoint in a spec round-trips as mojibake. The naming pipeline filters to ASCII for that reason.

### 4.7b Replace is a diff, not a reset

The realistic loop is: paste, choreograph 20 parts, notice one shape is wrong, fix it in Illustrator, re-paste. The structural hash is stable against the *same* bytes, but touching one path shifts sibling indices, so ids change for everything after it and the plan silently maps onto nothing. `Replace the drawing` appears twice in the UI (§3.0, §3.2) and must not be a silent reset.

Replace therefore runs a full intake on the new markup into a *staged* result, then reconciles against the current plan:

1. match by `data-name` / author id first (survives an edit);
2. then by structural signature (survives a rename);
3. then by ordinal position within the same parent, only when the tag matches.

The receipt shows the outcome — **"18 parts matched, 2 are new, 1 is gone — its beat was dropped"** — with **Cancel** next to it. Only on confirmation does the staged art become the live art. New parts land at Beat 1 / Fade in. The same reconciliation runs on reopen, where `sceneToPlan` can meet a `pathRef` with no node: that entry becomes a **disabled row naming the missing `pathRef`**, never a silent drop.

### 4.8 Which parts can actually move — the drawable flag

Two separate gates, and conflating them was a bug in the first draft.

**Draw requires an `SVGGeometryElement`**, not merely a stroke. `drawable.ts` calls `createDrawable(part.node)`, and anime.js's drawable module sets `pathLength="1000"` on the target and writes `stroke-dasharray` / `stroke-dashoffset` **on that node**. On a `<g>`, `pathLength` is meaningless and the normalized dash values are inherited by children whose real path lengths are in their own user units — at draw `'0 0.5'` the dash `500 510` covers any child shorter than ~500 units entirely. The group flashes on rather than draws, and it does not throw, so `drawable.ts`'s `catch` never fires and nothing reports it. `<text>` has the same problem. So: **`path, line, polyline, polygon, rect, circle, ellipse` can be drawn; `<g>` and `<text>` cannot**, and the disabled control says "groups and text can't be drawn — expand the group to draw its shapes."

**Emphasize requires a stroke.** `highlight` paints only stroke-width (`svg-paint.ts` sets `style.strokeWidth = base × (1 + emphasis × 0.9)`, defaulting `base` to 2 when unreadable). The census tags each part `strokeable` (a `stroke` presentation attribute or inline style, on itself or an ancestor, that is not `none`). On a fill-only shape — which is what a sanitized Illustrator export *becomes*, once its `<style>` is gone — it does nothing, so it is disabled with "no outline to draw".

Fade, Slide and Already there are always available, on every part and every band.

**Drawing a whole group, honestly.** If a user wants a band to draw, the answer is the expansion in §4.5: replace the band with its drawable leaves, each its own `SvgElement` sharing one beat window. `parseScene` allows that — only `pathRef` must be unique — and it makes the strokeable/drawable test per-leaf and correct.

### 4.9 The budget, refused at paste time — and at plan time

| Cap | Value | Why |
|---|---|---|
| sanitized art | **256 KB**, hard, at paste | the store holds it and the poster derives from it |
| serialized poster | **256 KB**, hard, re-checked on every plan change | **this is the artifact that lands on the slide.** §7's skeleton writes the *poster*, not `art`, and the poster is `painter.root().outerHTML` after `createDrawable` has stamped `pathLength="1000"` plus dash attributes on every drawn node — art plus unbounded per-node residue. Capping art alone left the thing that actually inlines into the deck unmeasured. |
| record footprint | art + poster, shown in the receipt and on the card | `StudioScene` carries both, so a 256 KB drawing is up to ~512 KB per record in IndexedDB and in every `packWorkspace` zip. The number is stated rather than hidden. |
| art | 64 KB, soft warning | as above |
| rows in the list | **24** | a presentation cap, met by binning (§4.5) — never by dropping parts, and always escapable by expanding a band |
| parts carrying a verb | **24** | each drawn part is one anime.js instance seeked every frame plus one `getBBox` + `getComputedStyle` at mount. Enforced as a soft refusal on the role control, with the count and the reason. |

None of these is a schema limit; `parseScene` already caps at `MAX_ELEMENTS = 2000`. Ours are legibility and frame-budget caps.

**The 256 KB number is chosen, not measured, and that is a known gap.** The sibling precedent for a scene-shaped payload is `MAX_SPEC_B64 = 256 * 1024` in `hydrate.ts`. The measurement that would set it properly — compose-view keystroke latency with an N-KB poster on the slide — is a few minutes' work on the built docs site and **should be taken before this ships**, because the whole intake refusal rests on it. Until it is, the number is a borrowed default and the doc says so.

---

## 5. The choreograph controls

Five controls. Every one maps to a verb that is **painted today**, verified in `backends/svg-paint.ts` and `backends/drawable.ts`.

| Control | Emits | Painted by | Gate |
|---|---|---|---|
| **Arrives by → Draw** | `{verb:'draw'}` | `drawable.ts` `buildTracks` → per-element `createDrawable` seek to *its own* `reveal` | `SVGGeometryElement` only (§4.8) |
| **Arrives by → Fade in** | `{verb:'reveal'}` | `svg-paint.ts` `isFadeElement` → per-part `opacity` | always |
| **Arrives by → Slide in** | `{verb:'slide', from:[dx,dy]}` + `{verb:'reveal'}` | `svg-paint.ts` `composeTransform` (`hasTransform`) + opacity | always |
| **Arrives by → Already there** | *no presence verb* | — | always; the right answer for a background frame |
| **Emphasize** | `{verb:'highlight'}` | `svg-paint.ts` `hasHighlight` → inline `style.strokeWidth` | strokeable only (§4.8) |
| **From / Distance** | the `from` vector | as `slide` | shown only for Slide in |

**Not offered, and why, in one line each:**
- `fill` — `compile.ts` computes `level` and **no backend reads it**. Verified: `level` appears in `compile.ts` and `types.ts` and nowhere in `svg-paint.ts`, `drawable.ts` or `marks.ts`.
- `sequence` — see §5.2; it would silently override the beats.
- `spin` / `orbit` / `explode` — `VERB_SOURCE` marks them `built`-only; `parseScene` rejects them in an svg scene.
- `trace` — identical painting to `draw` in this backend; two names for one behavior is a control that does not move something new.
- easing, per-part duration, poster time — the frame model deleted them as authored surfaces.

**Draw and Fade are a radio, not two chips**, because `parseScene` explicitly rejects `reveal` combined with `draw`/`trace` on one part. The UI shape is derived from the validator, so the invalid combination is not reachable.

### 5.0b Why there is no color control in v1, stated rather than assumed

The ADR (§4.1, fact 4) asks for a token picker: "Each part carries its own `color` as a `var(--token)`. So the faculty needs a token picker, never a color picker." v1 declines it, and the argument is short enough to make in full rather than leave as receipt text.

`svg-paint.ts` sets **only** `stroke` from `el.color` (`if (el.color) node.setAttribute('stroke', …)`). It never touches `fill`. So the token channel can theme a stroked line drawing and can do **nothing at all** for the commonest real export — a fill-only Illustrator SVG whose `<style>` the sanitizer deleted. A picker that silently works on some parts and not others is exactly the "control that does not move something" this tab bans.

What v1 does instead: it **preserves the author's paint** and reports the consequence as information, not refusal — *"6 fixed colors — this drawing will not recolor with the deck's theme."* The plan sets no `SvgElement.color`, so the drawing is palette-frozen and portable-as-drawn.

**This is a real cost and it is the second-biggest hole in the design** (§12.1 is the first, and they are the same root cause). The honest v2 is a `fill` channel in the painter plus a token `Select` over `--cat-N-mark` / `--text-*`, landed together — not a stroke-only picker shipped early because the ADR named one.

### 5.1 Order without a clock — beats

The plan is a **numbered running order**. Parts sit in beats 1..N; parts sharing a beat arrive together. That is the whole authored model.

Compilation is arithmetic, done once in `plan.ts`:

```
N        = number of distinct beats
beat k   → at = (k-1)/N,  span = 1/N        // explicit per-part windows
duration = N × beatMs                        // Calm 900 ms · Brisk 550 ms
hero     = 1                                 // the poster IS the last frame
```

`beatMs` has exactly **two** values behind a `Calm | Brisk` segmented control, not a slider. A slider invites tuning a clock the frame model says does not exist; two words name a feeling. (Both values are chosen defaults, not measured constants — a 4-beat Calm plan runs 3.6 s, near `examples/anima-scene.md`'s authored 3000 ms.)

**`hero: 1` is a real commitment.** `compile.ts`'s `poster()` samples `at(clamp01(hero) × duration)`, so the poster is the settled final frame — which is what the frame model wants, what a reduced-motion viewer should see, and what dissolves the transitional-poster class of bug. There is no poster slider anywhere in this tab.

### 5.2 Why explicit windows and not `sequence`

`compile.ts` implements `sequence` by tiling the **whole sequenced subset in tree pre-order**: `slot = span / seqCount`, `start = at + rank × slot`. It has no idea about beats. Emitting `sequence` would mean the user sets three beats and the engine plays eight evenly-spaced ones. Explicit `at`/`span` per part is what `compile` honors exactly, and it is what makes the beats the user sees the beats the deck plays.

---

## 6. The preview

### 6.1 The live stage — the real host, not a mock

A `<section class="scene" data-scene-spec="…">` containing a `.scene-figure` **that holds the sanitized art as the poster `<svg>`**, handed to `hydrateScene(section, { eager: true, sanitize: sanitizeSlideHtml, rendererFor, reducedMotion, startSettled })`.

**`data-scene-spec` must be base64**, not raw JSON — `hydrate.ts` `decodeSpec` runs `atob` on it. Combined with §4.7's ASCII rule, the builder writes `btoa(JSON.stringify(spec))` and can rely on the spec being Latin-1-safe by construction.

The poster-in-figure part is not optional and it is where the retired tab was broken. `hydrate.ts`'s `resolveSpecSource` does:

```ts
const poster = figure.querySelector('svg');
const assetMarkup = scene.source === 'svg' && poster ? sanitize(poster.outerHTML) : null;
```

and `assetsFor` returns `undefined` when `assetMarkup` is null, so `painter.mount(target, s, undefined)` hits `if (!doc || !markup) return false` and paints nothing. **The deleted `MotionStudio.tsx` built an empty `.scene-figure`** (`figure.className = 'scene-figure'; section.appendChild(figure)` with no child) — which worked for its Zdog default but means that stage could never have previewed an `svg` scene at all. *(Derived from source, not run — the file is deleted.)*

The stage mounts into the **host document**, not a frame, so this tab assembles no preview document and injects no `<script>` — see §10.

### 6.2 The frame strip — one renderer, N stills

Under the stage, a row of N+1 stills. They come from **the single offscreen renderer §6.4 already stands up**, not from a mount per stop: `Renderer.poster(state)` returns `{svg, width, height}` — a serialized still — from an already-mounted renderer, so the strip is one mount plus N sequential `poster(timeline.at(k/N × duration))` calls, rendered as inert SVG strings. Same output, one ninth of the mounts. (The reason the poster renderer is *separate from the live stage* still holds — `poster()` scrubs whatever it is mounted on — but that argues for one offscreen instance, not one per frame.)

This is the only place the frame model is stated, and it is stated as a picture rather than a sentence: motion here is a finite ordered set of known frames, and you can see all of them at once.

- The strip is a `role="radiogroup"`; `←/→` moves; each stop is announced as "Frame 3 of 5", the last as "Poster".
- The last one is labeled **POSTER · the still the PDF gets**.
- Capped at **9** stops; re-serialized on a 300 ms debounce, deferred until after the main stage mounts.
- The same instance gives the strip a cheap scrub for free, without touching `hydrateScene`.

A scrubber that drives the *live* stage is still not designed: `hydrateScene` returns only `{ dispose }` and exposes no seek, and adding one is an engine change outside this tab's scope.

### 6.3 The second view — `On a slide`

A tab beside `Live`, rendering a `DeckPreview` of the *actual slide markdown Insert would write*. This is the proof that the asset lands: same heading, same poster, same fence, in the deck's own theme. It renders lazily and only when selected. `DeckPreview` routes through `single-slide-render.ts`, already a sanctioned #22 builder that owns both channels.

### 6.4 The poster

Generated by a **separate** `drawableRenderer()` from the live stage, because `renderer.poster()` is documented mount-scoped and non-pure and "scrubs the live instance (call it on a separate renderer if you're also previewing live)". This is the one instance §6.2 also drives.

Three implementation constraints that will bite whoever builds this:

1. The poster host must be **`visibility: hidden`, positioned off-screen — not `display: none`** — because `svg-paint.ts` calls `getBBox()` per part at mount. (It catches the throw and defaults the pivot to 0/0, which our translate-only slides tolerate, but a laid-out host is the honest one.)
2. `drawable.ts` stamps `pathLength="1000"` on every drawn node, and anime.js adds its own dash attributes. At `at(duration)` the draw is complete, so the still is visually correct — but the serialized poster carries that residue. **Scrub `pathLength` and the dash attributes from the serialized poster** so the still does not depend on the drawing library's leftovers. *(The `pathLength` stamp is asserted in `drawable.ts`'s own header; the dash attribute names are library-internal and must be confirmed on the real surface.)*
3. Measure the scrubbed poster and enforce the §4.9 ceiling on it — this is the artifact that inlines into the deck.

### 6.5 Reduced motion

`hydrate.ts`'s `effectiveTier` returns `legible` (not `still`) under `prefers-reduced-motion` unless every verb is vestibular — and `VESTIBULAR` is `{spin, orbit}`, neither of which we emit. **So the default behavior would autoplay the full plan at a viewer who asked for less motion.** That is the wrong default on a surface whose entire subject is motion.

The faculty therefore reads the preference itself and passes **`reducedMotion: true, startSettled: true`**. `hydrateOne`'s `mountSettled()` draws `timeline.at(durationMs)`, sets `ended = true`, and the corner control shows **replay** — so a reduced-motion user sees the settled drawing, never an autoplay, and can still choose to play it.

**And the frame strip is their whole surface**: every frame as a still, keyboard-reachable, no motion required. A reduced-motion user can choreograph this asset completely and verify every beat without a single animation.

---

## 7. The Library card — the door the retired tab never built

`deleteStudioScene` has **zero callers today** (verified: the only occurrence in `docs/` is its own definition). This closes that.

A new `Motions` pill joins `PillTabs`' list (`all · theme · component · finish · motion · refdoc`), and a scene section joins the card grid, in the same shape as the other three:

```
┌───────────────────────────┐
│  ▓▓ the POSTER svg ▓▓     │  ← h-[88px], the record's own `poster`
│                           │
├───────────────────────────┤
│ Value chain      [MOTION] │
│ value-chain · 8 parts ·   │
│ 4 beats · 21.5 KB stored  │
│ [ + Insert ] [✎] [⇪] [🗑] │
└───────────────────────────┘
```

The meta line states **art + poster**, the record's real footprint (§4.9), not the art size alone.

- **Insert** (primary) → `onInsert(skeleton, name)` → the existing `applyDeckOp(addSlideAfter(source, curIndex, skeleton))`. Toast: "Inserted \"Value chain\"."
- **Edit** (icon-only, same slot as the theme/component/finish pencil) → `onEditMotion(record)` → `Fabricate` opens on the Motion tab with `seed = { kind:'motion', record }`.
- **Share** → the existing `shareAsset` zip path.
- **Delete** (armed two-step `DeleteBtn`) → `deleteStudioScene(id)`.
- Selection checkbox, top-left, exactly as the other three.

**The skeleton Insert writes:**

```markdown
<!-- _class: scene -->

## Value chain

<svg viewBox="0 0 800 400" role="img" aria-labelledby="va1b2c3-t va1b2c3-d" xmlns="http://www.w3.org/2000/svg"><title id="va1b2c3-t">Value chain</title><desc id="va1b2c3-d">Five stages…</desc>…</svg>

```anima
{ "source": "svg", "asset": "value-chain", "duration": 3600, "hero": 1, "elements": [ … ] }
```
```

**The shipped graphic carries its own accessible name.** An earlier draft emitted a bare `<svg>`, so every deck carrying a crafted motion asset shipped an unlabeled graphic — on a surface whose §11 is otherwise careful. The record already holds the two strings (`label`, `description`), the sanitizer keeps `<title>` and `aria-label` (pinned), and §4.6 already reads `<title>` as a naming hint, so it costs nothing. The tab's Description field is therefore labeled as what it becomes: **"Alt text — what a screen reader says instead of seeing this drawing."** One assertion in the demo deck's e2e checks the emitted `role="img"` + `<title>`.

The poster must be emitted on **one line with no blank line inside it** — markdown block-HTML ends at a blank line, and `examples/anima-scene.md` is single-line for exactly this reason. From there the existing chain runs untouched: `animaSceneFences` (`lib/integrations/markdown-it/plugins.js`) base64s the fence into `<div class="anima-spec" data-scene-spec>`, `scene.transform.js` lifts it onto the `<section>` and wraps the poster in `.scene-figure`, and `anima-scenes.ts` selects `section.scene[data-scene-spec]` and mounts it live. The PDF freezes the inline poster. **No new rendering path.**

**Versioning stays off (§10.3)** — `scene` does not join `VERSIONED_KINDS`, so no version chip and no `AssetVersions` wiring. But `asset-store.js` currently carries a comment telling the next change to add `'scene'` "when scenes get a card". That comment becomes false the day this ships, so **it must be rewritten to say deferred, and why** — or the next reader will re-derive the wrong reason, which is the exact failure §10.3 names.

---

## 8. File plan

**New**

| Path | What |
|---|---|
| `docs/src/components/studio/MotionStudio.tsx` | the faculty (the deleted file's name, a new premise) |
| `docs/src/components/studio/motion/svg-intake.ts` | **pure**: normalize → harvest hints → expand `<use>` → sanitize → strip → namespace ids → normalize viewBox → census → group/bin → stamp → name → receipt |
| `docs/src/components/studio/motion/reconcile.ts` | **pure**: match new parts to an existing plan (Replace + reopen), §4.7b |
| `docs/src/components/studio/motion/plan.ts` | **pure**: `planToScene`, `sceneToPlan` (the invertible mapping), `slideSkeleton` |
| `docs/src/components/studio/motion/MotionParts.tsx` | the running-order list, band expansion, inline rename |
| `docs/src/components/studio/motion/MotionInspector.tsx` | one component, placed by breakpoint |
| `docs/src/components/studio/motion/MotionFrames.tsx` | the frame strip |
| `docs/src/components/studio/motion/svg-intake.test.ts` | the 3 / 25 / 400 / 0 cases, `<use>` expansion incl. depth cap and cycle, id namespacing + reference rewrite, viewBox normalization, each sanitizer-damage class, id stability across two runs |
| `docs/src/components/studio/motion/reconcile.test.ts` | matched / new / gone across an edited drawing |
| `docs/src/components/studio/motion/plan.test.ts` | beats → windows, and the `sceneToPlan(planToScene(p)) === p` round-trip |
| `examples/motion-asset.md` + `.pdf` | HARD RULE #9 — this changes what a human sees on a slide |
| `changelog.d/fabricate-motion-craft.added.md` | HARD RULE #10 |

**Edited**

| Path | Change |
|---|---|
| `Fabricate.tsx` | `tab` union gains `'motion'`; `FabricateSeed` gains `{kind:'motion'; record: StudioScene}`; a `motion` early-return branch mirroring `tab === 'finish'`. **Trap:** the faculty toggle exists **twice** — the `facTab` helper used by the finish branch, and an inline copy in the Theme/Component header. Both need the fourth tab or the toggle disagrees with itself. |
| `Library.tsx` | the `Motions` pill, the scene card, `onEditMotion`, delete → `deleteStudioScene` |
| `StudioShell.tsx` | `refreshScenes()`, `savedScenes` into `Fabricate`, `editMotion`, the new Library props. **Insert needs no new wiring.** |
| `docs/e2e/svg-paste-guard.spec.ts` | add the two net-new survival assertions §4.3 depends on: `<image href="https://…">` and `<animateTransform>` survive DOMPurify (so the strip pass has a gate behind it) |
| `docs/e2e/fabricate.spec.ts` | the Motion tab's real-surface arc — see §12.7 |
| `library/asset-store.js` | the `VERSIONED_KINDS` comment (see §7) |
| `scene-library.ts` | header note that `art` is now author-brought, not AI-authored; no signature change |

**Primitives reused (HARD RULE #15):** `Button`, `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`, `Select`, `Slider`, `Switch`, `Tip` (tooltip), `PillTabs`, `PanelEmpty`, `ScrollArea`, `Separator`, `DropdownMenu`, `CodeField` (the read-only fence, with the Copy button `FinishStudio` gives its generated CSS), `DeckPreview`. Plus the Studio's own `notify`, `findNameClash` (`docs/src/components/studio/library/save-guard.ts` — note `.ts`, while `asset-store.js` beside it really is `.js`), `REFUSAL_PREFIX`, `slugify` and `saveStudioScene` (`scene-library.ts`), `downloadText`, `shareAsset`.

**Icons (HARD RULE #29 — no typed shape glyphs anywhere):** lucide `Film`, `Clipboard`, `Upload`, `MoveRight`, `Eye`, `Highlighter`, `Plus`, `Check`, `Loader2`, `Trash2`, `Pencil`. The stage's playback control is the engine's own, already drawn from `--shape-triangle-right` / `--shape-pause` / `--shape-refresh` masks in `lib/components/imagery/scene/scene.styles.css`. The deleted file's inline `<style>` typed its glyphs; nothing here does.

---

## 9. The state model

**Component state (ephemeral, never persisted)**
`art` (expanded + sanitized + stripped + namespaced), `parts[]` (`{pathRef, id, label, tag, drawable, strokeable, bandOf, childCount, bbox}`), `plan` (`Map<pathRef, {role, beat, from, emphasize}>`), `pace`, `selected`, `expandedBands`, `view`, `name`, `desc`, `editingId`, `owned`, `saving`, `intake` (the receipt), `staged` (a pending Replace, §4.7b). **`raw` is dropped from state in the same tick it is sanitized.**

**Derived (`useMemo`)**
`spec = planToScene(parts, plan, pace)` · `valid = parseScene(spec)` · `audit = auditScene(spec)` · `poster` (the one offscreen renderer, debounced) · `posterBytes` (checked against the ceiling) · `skeleton = slideSkeleton(...)` · `frames[]` (serialized from that same renderer) · `nameOk` / `takenBy`.

**Persisted** — exactly the existing `StudioScene`: `{id, name, label, description, spec, art, poster}` + the `specVersion` stamp `saveStudioScene` writes. **No new field, no schema churn.**

**Reopening is a derivation, not a stored blob.** `StudioScene` has nowhere to put roles and beats, and this design does not add one. Instead `sceneToPlan` inverts the mapping, which is possible because every UI choice maps onto exactly one spec construct:

| UI | Spec |
|---|---|
| role | the verb set on the element (`draw` / `reveal` / `reveal`+`slide` / none) |
| beat | `round(at × N) + 1`, where `N = round(1 / span)` |
| direction, distance | the sign and magnitude of `slide.from` |
| emphasize | presence of `highlight` |
| pace | `duration / N` |
| the part's name | the element's `id`, with `data-name` in the art as its durable label (§4.6b) |
| the part's address | the element's `pathRef` |

**When it does not invert** — a hand-edited or imported spec whose windows do not quantize to equal beats within 1 ms — the plan is shown **read-only as "Custom timing"**, with one explicit **"Convert to beats"** action that states what it will change. A saved asset is never silently re-timed. A `pathRef` that no longer resolves becomes a disabled row (§4.7b), never a silent drop. This is also what keeps §10.3's "do not foreclose versioning" true: the record keeps its stable `id`, keeps its `specVersion`, and is never mutated from a path that could not have been snapshotted first.

---

## 10. Where sanitization sits — both channels

**Markup channel — four calls, three of them already in the tree:**

1. **Intake (new).** `sanitizeSlideHtml(expandUses(normalize(raw)))` in the paste/drop handler, before anything is rendered, measured, stored or named. The `<use>` expansion happens on an inert `DOMParser` document that is never attached, and its output still crosses the sanitizer. Everything downstream operates on the sanitized string.
2. **Store boundary (existing).** `saveStudioScene` → `sanitizeSceneAssets` → `sanitizeSlideHtml` on both `art` and `poster`. We neither bypass it nor rely on it alone — it is a documented no-op in a window-less context.
3. **Point of use (existing).** `hydrate.ts`'s `resolveSpecSource` calls the injected `sanitize(poster.outerHTML)` before the markup enters the painter's `AssetMap`. We pass `sanitize: sanitizeSlideHtml`.
4. **Defense in depth (existing).** `svg-paint.ts`'s `parseSvgInert` + `STRIP_TAGS` + `on*`/`javascript:` attribute scrub at mount.

**Stylesheet channel.** This tab **builds no preview document**, and that is a design goal rather than an accident:
- the Live stage mounts into the *host* document — no `<style>` is assembled, so there is no RAWTEXT terminator to neutralize;
- the `On a slide` view delegates to `DeckPreview` → `single-slide-render.ts`, already listed in `SANCTIONED_PREVIEW_BUILDERS` and already owning both channels.

So **no new `SANCTIONED_PREVIEW_BUILDERS` entry is required**, and none should be added. The file header must say this out loud: *the moment this file assembles a document with an embedded `<style>`, it takes on `sanitizeStyleText` and a #22 sanction, and today it deliberately does neither.*

One consequence of the host-document stage worth stating plainly: the sanitized drawing becomes real nodes in the Studio's own origin — the origin HARD RULE #24 puts the user's OpenRouter key in. `sanitizeSlideHtml` is exactly the guard for that (it is the same guard `deck-preview.js` uses), and it runs at intake, before a single node is created.

### What sanitization costs the drawing — and where that is pinned

Most of this table is **already pinned on the real surface**: `docs/e2e/svg-paste-guard.spec.ts` runs in real Chromium against `/studio/` and imports `FORBID_TAGS`/`ADD_TAGS`/`ADD_ATTR` from `lib/core/sanitize-slide-html.mjs` rather than retyping them. An earlier draft of this design re-derived those rows on jsdom and labeled the whole table UNVERIFIED — pessimistic, and worse, a second and weaker source of truth for behavior that already has a gate. Source column below: **pinned** = that spec; **new** = measured here on jsdom and being added to that spec.

| Input | After `sanitizeSlideHtml` | Cost | Handled by | Source |
|---|---|---|---|---|
| `<style>.cls-1{fill:#333}</style>` + `class="cls-1"` | `<style>` **deleted**, `class` kept | **the drawing changes color** — CSS-set fills revert to the SVG default, and `draw`/`highlight` lose their target | receipt line + the `strokeable` gate | pinned |
| `<use href="#sym">` | **deleted** | a symbol-built drawing renders **blank** | **expanded before the sanitizer** (§4.2b) | pinned |
| `<image href="https://…">` | **KEPT** | an off-origin fetch would live in the stored art and the deck line | **stripped at intake** (§4.3) | **new — add to the spec** |
| `<animateTransform>` | **KEPT** | a foreign SMIL loop in the stored art | **stripped at intake** | **new — add to the spec** |
| `<script>`, `on*`, `javascript:` href, `<foreignObject>`, `<animate>` | deleted | — | counted into the receipt's "and N unsafe nodes" | pinned |
| `id`, `class`, `data-name`, `<title>`, `aria-label`, `pathLength`, `vector-effect`, `dominant-baseline`, `stroke-dasharray`, inline `var(--token)` | **kept** | — | ids survive, which is what makes the whole plan addressable | pinned |
| `<defs>`, `linearGradient`, `clipPath`, `mask`, `filter`, `marker`, `symbol`, and `url(#…)` references to them | **kept** | none — gradients and clips survive intact | namespaced at intake (§4.3b) | pinned |
| `inkscape:label`, `serif:id` | **deleted** | naming hints lost | **harvested pre-sanitize** (§4.2) | new |
| a fragment with no `<svg>` root | **empty string** | nothing survives at all | the "not an SVG" state | new |
| a leading BOM | **kept as a text node** | a stray character in art, poster and the deck line | normalized at intake | new |
| DTD / internal entities | leak a stray `]&gt;` text node | cosmetic | normalized at intake | new |

**Cost, timed** (jsdom, not Chromium — an upper bound): 3 parts 13.0 ms (first call, config build) · 40 parts 8.6 ms · 400 parts 34.7 ms · 2000 parts 150 ms · 8000 parts 383 ms. Roughly linear; the 400-part worst case is one frame's worth of work, which is why intake gets a spinner and not an optimistic render.

---

## 11. Accessibility

- **Keyboard, end to end.** Tab reaches the intake `<textarea>` (a real field, so ⌘V and a screen reader both work). The parts list is a `role="listbox"` with roving tabindex: `↑/↓` selects, `Alt+↑/↓` moves a part between beats, `Space` toggles "arrives with the part above", `F2` renames inline, `Enter` opens the inline inspector below `lg`. The inspector is ordinary labeled form controls. The frame strip is a `role="radiogroup"` driven by `←/→`.
- **Focus management.** After intake, focus moves to the receipt heading and a `role="status"` region announces its headline. After `+ Beat`, focus moves to the new beat header. After expanding a band, focus moves to its first member row. After Save, focus stays on Save and `role="status"` announces the saved name. After `Replace the drawing`, focus returns to the textarea; after the reconciliation confirms, to the receipt heading.
- **The shipped asset is labeled too** — §7's skeleton emits `role="img"` plus `<title>`/`<desc>` from `label` and `description`, so the accessibility of this tab does not stop at its own chrome.
- **No color-only signalling.** Receipt severity is the words `REWRITTEN` / `REMOVED` / `KEPT AS-IS`. A part that cannot be drawn shows the words. Beats are numbered headers, not tints. The selected row carries a left accent bar **and** `aria-selected`.
- **`prefers-reduced-motion`** — §6.5. The settled stage, the replay control, and a frame strip that is a complete substitute for watching it play.
- **Palette-blind (#3).** Every color in the tab chrome is `var(--token)`. The plan sets no `SvgElement.color` (§5.0b), so the drawing keeps its own paint. When it carries literal hexes, the receipt says so as information, not as a refusal.
- **No typed shape glyphs (#29).** Icons and mask tokens only; see §8.

---

## 12. Honest weaknesses

1. **Fill-only drawings get a poor deal, and the receipt cannot fix it.** The commonest real export — `<style>`-styled, fill-only, no strokes — loses its color at the sanitizer, loses Emphasize to the `strokeable` gate, and cannot be themed by the token channel either, because `svg-paint.ts` sets only `stroke` (§5.0b). The message is honest, but honest here means "your drawing is worse in this tool than where it came from." The only real fix is a painted `fill` channel, landed together with a token picker. **This is the design's biggest genuine hole**, and §5.0b is its second face.
2. **Binning is still a guess, even at the better size.** Document order is a good proxy for drawing order, not for meaning; an exporter that emits all outlines and then all fills yields useless bands. Band expansion (§4.5) makes it survivable rather than fatal — you can always get to a single shape — but the automatic grouping will often be wrong. The receipt says the bins are automatic and names the re-export that produces better ones.
3. **Beats cannot express overlap.** A part cannot start halfway through another's window. That is the frame model working as intended, and it will still feel restrictive to anyone who has used a timeline — the "Custom timing" read-only fallback is the seam where that shows.
4. **`<use>` expansion can inflate a drawing.** A 20-node icon referenced 200 times becomes 4000 nodes and blows straight through the 24-row cap into binning, and possibly through the 256 KB ceiling. The caps in §4.2b keep it bounded and the refusal is named, but a sprite-heavy export is a worse experience than a flat one.
5. **`On a slide` is a second full preview.** Now the most expensive thing in the tab, since the frame strip stopped mounting nine renderers. **First thing I would cut.**
6. **The tab has no AI front door at all**, which makes it the only Fabricate faculty without one and may read as unfinished. That is deliberate (no dead controls), but it is a real inconsistency with the three siblings.
7. **What is verified, and what is not.** The sanitizer's damage table is pinned in real Chromium by `docs/e2e/svg-paste-guard.spec.ts` for every row marked *pinned* in §10; the two rows marked *new* are jsdom-measured and owe assertions in that spec before this ships. Everything about how the three widths feel, whether the sticky stage janks at 390px, whether the poster's dash residue matters, and the compose-view latency number the 256 KB ceiling rests on (§4.9) is **UNVERIFIED** and must be driven on the built docs site. The e2e this work owes is an arc in `docs/e2e/fabricate.spec.ts` — paste a fixture SVG, assert the receipt's counts, give two parts beats, assert the emitted fence and the `role="img"` poster, save, insert, assert the slide — with `docs/e2e/anima-motion-frames.spec.ts` as the nearest precedent. §8 listing only unit tests was an omission; #23 will be asked at the merge gate.

---

## 13. Twelve details worth carrying into the build

1. Expand `<use>` **before** the sanitizer; it is deleted after.
2. Namespace every id — `<defs>` included — and rewrite every `url(#…)`, or two assets on one deck corrupt each other.
3. `art` and `poster` are separate fields but must derive from **one** sanitized string, or the card and the deck can disagree with the stage.
4. Ids must be ASCII — `decodeSpec` uses `atob` with no UTF-8 decode; `data-scene-spec` must be base64.
5. Draw is gated on `SVGGeometryElement`, not on stroke presence — a `<g>` or `<text>` flashes instead of drawing, silently.
6. Cap the **poster**, not just the art; the poster is what lands on the slide.
7. The poster host is `visibility: hidden`, never `display: none` — `getBBox` needs layout.
8. One offscreen renderer serves both the poster and the whole frame strip; it must be separate from the live stage, because `poster()` scrubs what it is mounted on.
9. Emit explicit `at`/`span`, never `sequence`. `hero: 1`, always.
10. Pass `reducedMotion` and `startSettled` explicitly; the host's default tier is `legible`, which autoplays.
11. The `.scene-figure` must contain the poster `<svg>`, and that `<svg>` carries `role="img"` + `<title>`.
12. The faculty toggle exists twice in `Fabricate.tsx`; `save-guard` is `.ts` while `asset-store` beside it is `.js`; and the `VERSIONED_KINDS` comment becomes a false instruction the day this ships.



---

## 14. What was grafted in, and the two calls the judges left open

This note is the winning track as it was judged, with §14 recording everything folded in afterwards.
Both judges ranked it first (8.7 and 9.0) and both handed back a graft list; the fact-checker scored
it 68 confirmed / 0 refuted / 1 forward-proposal, the cleanest record in the field.

### 14.1 Grafts, in the order the build breaks without them

| # | From | What | Why it is not optional |
|---|---|---|---|
| 1 | Track 1 | **The id-clobbering rule.** DOMPurify strips the `id` ATTRIBUTE while keeping the element for a set of document/form property names. Re-measured here: `body, head, title, name, style, length, action, id, children, firstChild, ownerDocument` all lose their id; `form, type, href, src, all` keep theirs; the match is case-sensitive, so `Body` survives. | A Figma file with layers named `Body` and `Title` choreographs perfectly in the faculty and animates nothing in the deck. §4.3b's namespace prefix already dodges this — the point of writing it down is that the prefix is STRUCTURAL, not cosmetic, so nobody later "simplifies" it away. |
| 2 | Track 1 | **The root-`<svg>` trap.** `svg-paint.ts` builds `nodeById` from `svg.querySelectorAll('[id]')`, which cannot match the root element, and `mount()` still returns `true`. Verified. | An "as one drawing" or band-level address on the root pushes no `Part`, paints nothing, and reports success. Every band goes through a synthesized wrapper `<g>`, never the root. |
| 3 | Track 4 | **`seekMs`.** `compile()`'s `at()` takes MILLISECONDS and derives `progress = t / durationMs`. | Passing the frame model's own `k/N` fraction seeks to progress ~0 — a frame strip built on the notation in the doc would show frame 0 forever, and no unit test would catch it. Pinned in one exported helper so no second call site gets it wrong. |
| 4 | Track 3 | **`replayNonce`.** `createAnimaScenes` keeps a closure-scoped `played` set keyed on the content signature and mounts a RE-SEEN signature settled. | Undo, or toggling a role out and back, returns a signature already in that set — so the preview mounts on its final frame with no motion, on the most ordinary edit gesture there is, in a faculty whose entire subject is motion. One line: bump a React key. |
| 5 | Track 5 | **Rename persists as `<title>` in the art**, not as `data-name`. Both survive the sanitizer, but `<title>` is already rung 3 of the naming cascade AND it is the element that gives the shipped graphic its accessible name. | One mechanism doing two jobs beats two doing one each, and the label round-trips through save, reopen and Replace with no new persisted field. |
| 6 | Track 5 | **Draw stays refused on a group, with Split as the named fix** — do NOT fan a group out into one element per leaf. | Beats and roles are recovered from the spec BY `pathRef` on reopen, so a fanned-out group returns empty and silently loses the user's choreography. |
| 7 | Track 3 | **Duplicate-id de-duplication during the namespacing pass** (`nodeById` is first-wins, and `parseScene` rejects a duplicate `pathRef`), and **a token set only in the spec is LIVE-ONLY** — `svg-paint` writes `stroke` onto the parsed clone, never the slide's poster, so it is invisible in every PDF and every shared `.html`. | The second half is what decides §14.2 below. |
| 8 | Track 1 | **Insert at the full-deck index, not the viewed one.** `StudioShell`'s own comment says `addSlideAfter` splices the FULL deck; the Library's existing call passes the viewed index. | A pre-existing defect directly on this change's path (HARD RULE #18: on-path, so it is fixed here rather than logged). |
| 9 | Track 5 | **No #22 checker models untrusted markup mounted into a non-frame element of the docs-site document.** `checkPreviewHtmlSinks` asks whether a preview BUILDER sanitized; this stage is not a builder. | The live stage is exactly that shape. It says so out loud and carries a census test rather than resting on "no new sanctioned entry required". |
| 10 | Track 3 | **Gate the body grid at 1100px, not `lg`.** | The 1024-1099px band would render three columns beside a JS-gated inspector that has not appeared — a dead column. |
| 11 | Track 4 | **The documented cut path.** If the bounded `<use>` inliner proves hard to get right, fall back to detect-and-refuse with a named re-export instruction. | A half-safe rewrite is worse than an honest refusal. Written down so the fallback is a decision, not a scramble. |

Two corrections carried in so they do not propagate: `<animateTransform>` and `<animateMotion>`
SURVIVE DOMPurify (one runner-up asserted the opposite, and the fact-checker refuted it), and
`asset-bundle.ts` already ships `packScene` with a scenes-taking `packBundle` — so the motion card
carries Share and bulk selection like its three siblings.

### 14.2 The color call — "Match the theme" rewrites the ART, and there is no spec-level picker

The judges left this open and asked for it to be decided before the build, not during. It is decided
here, and neither track's answer is taken whole.

The craft ADR §4.1 asks for a token picker "never a color picker". The winning track declined to ship
one at all; a runner-up shipped a spec-level `SvgElement.color` picker. **Both are wrong, for the same
measured reason, and the second is worse.** `svg-paint.ts` does `node.setAttribute('stroke', …)` from
`el.color` — it sets **stroke only, never fill**, and it sets it **on the parsed clone the stage
mounts, never on the slide's poster**. So a spec-level token is inert on the fill-only art most people
paste, AND invisible in the PDF and in every shared `.html`, which is most of where a deck is read.
A control that works on one channel of one surface is the "control that does not move something" this
faculty bans.

**So v1 ships one mechanism: "Match the theme", which rewrites the drawing's own colors in the ART.**
It walks the sanitized art, maps each distinct literal color it finds (presentation attribute or inline
style, `fill` and `stroke` alike) onto a `var(--token)` from the categorical ramp, and writes it back as
a presentation attribute. That reaches fill and stroke, it lands in the poster, so it survives into the
PDF and the exported player, and it satisfies HARD RULE #3 on the shipped artifact rather than only in
the live stage. It is offered, never forced: the receipt already reports "N fixed colors — this drawing
will not recolor with the deck's theme", and Match the theme is the fix that line names.

`SvgElement.color` stays unset. A painted `fill` channel in the engine plus a spec-level picker is a
coherent v2; it is not this change.

### 14.3 The size ceiling is measured now, not borrowed

The winning track set 256 KB and said plainly that the number was borrowed from `hydrate.ts`'s
`MAX_SPEC_B64` rather than measured. The craft ADR §10.1 has since measured the corpus: across this
repo's 82 non-flag SVGs — the kind of asset someone would actually choreograph — the median is 1.3 KB,
p90 is 2.7 KB, and the largest is 28.7 KB.

So the ceilings are the ADR's: **warn above 24 KB, refuse above 64 KB** — past the p99 of genuine
design assets, and double the largest real one. The track's own insight is kept and is the more
important half: **the cap is enforced on the POSTER as well as the art**, because the poster is the
artifact that inlines into the slide and it carries `createDrawable`'s `pathLength` and dash residue on
top of the art.
