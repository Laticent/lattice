---
status: proposed
summary: Decide the shape of Anima's AUTHORING surface (the 4th "Motion" Fabricate tab, beside Theme · Component · Finish) — NOT one design but a small set of author-persona MODES over one shared scene spec. The five design-competition surfaces are a floor→ceiling spectrum, one per archetype (Presenter→Director, Storyteller→Storyboard, Maker→Track, Analyst→Rig, Builder→Stage+Spec); because all are tune-BODIES over the same Anima Scene spec (Stage-1 core), a mode is just how you edit it, so switching is loss-free and cheap. Shared chrome (header · the "Describe a motion scene" front door as the universal low-floor on-ramp · a scrub/poster strip · Save/Export); only the tune body swaps per mode; the Studio shell does not change. v1 = Director Mode (Guided) + Rig Mode (floor + ceiling); Storyboard/Track/Stage+Spec are roadmap modes, no rework. Deliberately called MODE (the author's word) to stay distinct from reader LENSES (@slidewright/lente, the audience's). Stage 4 kind:'scene' asset record shape + poster-storage decision: the SPEC is canonical and the stored poster keeps var(--token) (theme-agnostic thumbnail); the export-frozen-vs-rerender choice stays Stage-5 export-sign-off-gated. Build sequencing is foundation-up (Stage 4 asset → Stage 5 host component → Stage 7 faculty); design landed ahead of its build slot. Design only; nothing built.
companion:
  - ./2026-07-17-anima-animation-library.md
  - ./2026-07-13-lente-reader-lenses.md
---

# Anima — the Motion faculty as author-persona MODES over one scene spec

**Date:** 2026-07-18
**Status:** Proposed (design model; build not yet started)
**Follows:** `2026-07-17-anima-animation-library.md` (the Anima ADR — Stages 1–3 shipped:
the pure core, the Zdog backend, the Vivus backend). This doc decides the shape of the
*authoring* surface (nominally Stage 7) and refines the Stage 4 asset — designed ahead of
their build order because the authoring model dictates what the asset must carry.
**Design aid:** a 5-design competition + persona frame — the published comparison
artifact (5 live mockups + a judge's read + the persona spectrum). Referenced here, not
committed (it is a throwaway judging surface, not a source artifact).

---

## 1. The question

Anima animations are a *fabricated asset* — created, tuned, saved, and shared like a theme
or a component (Anima ADR §1, §16). The open question was the **authoring surface**: what
does the "Motion" faculty (the 4th Fabricate tab, beside Theme · Component · Finish) look
like, and how do you tune a motion scene?

A 5-track design competition produced five distinct *tune surfaces* (Track/timeline,
Storyboard/beats, Rig/tree+verb-chips, Director/conversational, Stage+Spec/WYSIWYG+DSL).
Rig is the most powerful but has the highest floor; Director is the most approachable but
the thinnest control. **No single design serves every author.**

## 2. The decision — don't pick one design; ship a small set of MODES

The people who make decks are not one kind of person: some are technical, some are
business, some hybrid; some are creative, some are not; some are power users, some are
first-timers. The five designs are not rivals — they are a **floor→ceiling spectrum**, and
each is the natural authoring **mode** for a different archetype:

| Author archetype | Mode | Why it fits |
|---|---|---|
| **Presenter** — business, non-technical, wants the outcome | **Director** (guided) | Describe it, nudge with refine chips. Never meets a scene tree. |
| **Storyteller** — business/hybrid, narrative | **Storyboard** (beats) | Thinks in beats; the *order* is the message. |
| **Maker** — creative, visual, prosumer | **Track** (timeline) | Direct-manipulates *time*; pins the hero frame. |
| **Analyst** — technical, precise, power user | **Rig** (tree + verb chips) | Scene tree + verbs + a "reads as information?" audit. Max control. |
| **Builder** — developer, code-comfortable | **Stage + Spec** (WYSIWYG+DSL) | The honest Anima DSL beside the stage — version it, reuse it. |

### 2.1 What makes this cheap: one scene spec, many projections

The enabling fact is architectural: **all five designs are different tune surfaces over the
*same* Anima scene spec** (the `Scene` → `compile()` → `Timeline` core, already shipped in
Stage 1). The scene spec is the single source of truth; a mode is only *how you edit it*.
So:

- Switching modes is **loss-free** — describe a scene in Director, flip to Rig to fine-tune
  one element, flip to Stage+Spec to grab the DSL; the scene persists, only the editing
  projection changes.
- You build tune-**bodies**, not five apps. The Anima core, the schema/validation, the
  backends, and the poster are shared; a mode adds one editor surface, nothing more.

This is the same relationship the Theme tab already has between its token *tree* and its
*inspector*: two views of one derived palette. We are extending that pattern to motion.

### 2.2 "Mode" is the author's word; "lens" stays the reader's

Lattice already ships a **lens** concept (`@slidewright/lente`,
`2026-07-13-lente-reader-lenses.md`): it projects a *deck* for its **audience** (an exec
view vs. a technical-appendix view). The Motion faculty's projections are the same
philosophy — *a projection per person* — on the opposite end of the pipe: they are for who
is **writing** the motion, not who is **reading** the deck. So they get a **different word**:
an author picks a **mode**; a reader gets a **lens**. Two words for two axes keeps the UI
and the types unambiguous (there is no shared code — the rhyme is conceptual, and naming it
away is cheaper than explaining it forever).

## 3. The faculty shape — shared chrome, a swappable tune body

The Motion faculty stays a faithful sibling of Theme/Component/Finish (`Fabricate.tsx`): the
shell does **not** change; Motion is just another tab. Everything the other faculties share
stays shared; only the **tune body** swaps per mode.

**Shared chrome (every mode):**
- The 50px header — accent dot · a first-class `name` slug the author owns · description
  disclosure · the faculty toggle (now Theme · Component · Finish · **Motion**) · **Export**
  + **Save**.
- The AI **front door** — "Describe a motion scene …" + refine chips. This is the universal
  **low-floor on-ramp**: even a Presenter in Rig Mode can *start by talking*, so a
  high-floor mode never blocks a beginner from getting a first scene.
- A shared **scrub + poster strip** — Track's best idea, promoted to chrome: a timeline
  scrubber with a draggable **poster** marker (the hero still that bakes into the PDF).
  Every mode gets it, because *time* and *which frame is the poster* are universal to all
  motion, regardless of how you author the rest.
- **Save** → the user's Library as a `kind:'scene'` asset (§4); **Export** → files.

**The mode switch:** a small control (in or beside the header) selects the tune body. The
choice is remembered per user (a Presenter defaults to Director Mode next time; an Analyst to
Rig Mode). Output is always the same structured scene spec — no mode can produce something
another can't read.

### 3.1 v1 modes: Director Mode (Guided) + Rig Mode

Ship **two** first — the floor and the ceiling:

- **Director Mode** (Guided) — the low-floor front door. Describe → generate → tune with rich
  refine-chips + a few sliders; the spec stays under the hood. A Presenter never leaves it.
- **Rig Mode** — the high-ceiling power surface: the scene **tree** (left) · live stage
  (center) · a selected element's **motion-verb chips + params** and a "reads as
  information?" audit (right). An Analyst lives here.

**Roadmap modes (no rework — all projections of the one scene):** Storyboard, Track (its
strip already ships as chrome; the full mode adds per-track editing), Stage+Spec. Each is
added only when a real user segment asks for it.

### 3.2 The anti-gimmick bar travels with every mode

The serious-not-ornament bar (Anima ADR §2) is a *faculty* property, not a per-mode one: the
closed motion vocabulary, the "reads as information?" check (explicit in Rig Mode, implicit
in the others), and the poster-first framing hold across every mode. A mode changes *how* you
compose a serious scene, never *whether* the gimmick is reachable.

## 4. Stage 4 — the `kind:'scene'` asset (the immediate build target)

The asset store is the dependency root: the faculty saves into it, so it is built first. A
scene joins `theme` / `component` / `finish` on the existing rails
(`docs/src/components/studio/asset-bundle.ts`, `docs/src/playground/asset-store.js`).

**Record shape** (`SceneItem`):
- `kind: 'scene'`
- `name` (slug), `label`, `description`
- `spec` — the **canonical** artifact: the validated Anima `Scene` JSON (source `'built'` or
  `'svg'`). This is the source of truth; everything else is derivable.
- `art?` — for a `source:'svg'` (Vivus) scene, the authored line-art SVG markup. **Sanitized
  at the browser-context INGRESS** — the faculty save path and the Library-import path run
  `sanitizeSlideHtml` (HARD RULE #22) *before* calling `saveStudioScene`, so what lands in the
  store is already clean (the `snapshot-cache.js` precedent — sanitize at the boundary so a
  save-without-sanitize path can't exist). The store/bundle layer is deliberately DOM-free and
  cannot run DOMPurify itself; it only persists strings. The preview-frame builder re-sanitizes
  as defense-in-depth. **The ingress sanitize + its #22-gate registration land in Stage 5/7**
  (no save/import caller exists at Stage 4). `poster` is untrusted the same way.
- `poster` — a serialized still for the Library thumbnail (see §4.1).
- `engine` / `caps` — which backend the scene targets (Zdog `built` / Vivus `svg`), for
  negotiation + the Library badge.

**Plumbing (mirrors `packTheme`/`packFinish`):** add `SceneItem` to the `ManifestItem`
union; `packScene` → `<slug>.lattice-scene.zip` (`manifest.json` · `<slug>.scene.json` ·
`<slug>.poster.svg` · `<slug>.art.svg`? · `README.md`); `unpackBundle` re-hydrates it;
`sceneZipName`. `asset-store.js` is already kind-generic (keyed `(kind, name)`, a `kind`
index) — it needs only an `s`-prefixed id in `newId`'s map.

### 4.1 Poster storage — spec canonical, poster is a regenerable, token-preserving thumbnail

This resolves the Anima ADR §15 open question **from the storage side** (the export side
stays gated):

- The **spec is canonical**; the stored **poster is a thumbnail**, always regenerable by
  re-compiling the spec and sampling the hero time. We never treat the poster as the source.
- The stored poster **keeps `var(--token)` colors** (+ a separate opacity for `reveal`) — it
  is theme-agnostic, so a scene dropped on another theme still recolors (honoring the §10
  recolour promise). No theme-frozen `rgb()` literals are baked at save time.
- **No poster is wired into any export here.** Whether the PDF export re-renders the backend
  under the deck's theme or embeds a token-styled poster is the **Stage-5, export-sign-off-
  gated** decision (Anima ADR §15) — untouched by Stage 4. Stage 4 stores a live/preview
  poster only; it cannot change exported bytes.

## 5. Build sequencing — foundation-up

Design is done top-down (the faculty clarifies everything); **build is bottom-up**, each
slice its own branch/PR (HARD RULE #17, Anima ADR §14):

1. **Stage 4 — `kind:'scene'` asset store** (this doc's build target). The `scene` kind on the
   `asset-bundle.ts` / `asset-store.js` rails + `scene-library.ts`; **whole-workspace backup
   round-trips scenes** (durability, so a future scene can't be silently lost). Pure-ish,
   unit-tested, no export. **Deferred to Stage 5** (tracked, no caller yet at Stage 4): the
   `Library.tsx` import/export UI for scenes + the **ingress `sanitizeSlideHtml`** on the
   faculty-save / Library-import paths (§4) with its #22-gate registration.
2. **Stage 5 — host `scene` component** (imagery) + poster→PDF path + demo deck +
   **dark/light export sign-off** (the one hard human gate).
3. **Stage 7 — the Motion faculty**, shared chrome + the v1 modes (Director + Rig), saving
   into Stage 4 and previewing via Stage 5.

(The faculty's *design* — this doc — lands ahead of its build slot; the numbering is the
Anima ADR's, unchanged.)

## 6. Verification

- The design model is gated by **human review** (this doc → PR).
- The **implementation** of each stage gets the ladder (HARD RULE #25): Stage 4's
  asset-store transform is shared-kernel-adjacent → **maker-checker** minimum; the Stage 7
  faculty UI meets the QUALITY BAR visual sweep + real-surface verification (HARD RULE #23),
  and the novel mode-switch architecture warrants the **adversarial trio** on what ships.
- No export bytes change before Stage 5 sign-off.

## 7. Open questions (carried)

- The mode-switch **affordance + placement** (header segment vs. a corner control) — a Stage
  7 detail, settled against the real shell.
- Whether the **scrub/poster strip** is truly universal or a few modes hide it (e.g., pure
  Director Mode) — validated when the second mode is built.
- The Anima ADR §15 **export** poster model — still Stage-5-gated; §4.1 only fixes storage.
- Per-user **mode memory** scope (per-scene vs. global default) — a Stage 7 detail.

## 8. Non-functional requirements — performance, reuse, responsive, preferences

These bind every mode (they are faculty properties, like the anti-gimmick bar), and the
faculty must **carry forward the performance posture the rest of Lattice already earned** —
not regress it.

**Performance (HARD RULE #19 — evidence, not claims):**
- **Animate on `requestAnimationFrame`, never a timer.** One rAF loop drives `draw(state)`;
  it pauses when the tab/preview is hidden and stops entirely under reduced-motion (below).
- **Keep the load lean.** The pure Anima core is zero-dependency; an engine (Zdog/Vivus)
  loads **only with its backend** (code-split, not in the core barrel), so a deck that never
  animates pays nothing. Self-hosted JS/CSS, no CDN (the site's standing posture — a privacy
  + reliability + speed win we keep).
- **A scene has a frame-rate budget, and it is VISIBLE to the author.** Surface a live
  **FPS / frame-time readout** on the faculty's preview (near the scrub strip) so a heavy
  scene reads as heavy *before it ships* — the author-facing analog of the WCAG audit and
  the "reads as information?" check. A scene that can't hold a smooth rate on a mid-range
  device is a signal to simplify (fewer elements/verbs), and the readout makes that signal
  legible. Bench the faculty per HARD RULE #19 when its interactions land.

**Reuse (HARD RULE #15 — don't reinvent, for tooling AND UI):**
- Build the faculty from the **shadcn primitives in `docs/src/components/ui/`** and the shared
  Studio chrome — never a bespoke widget per surface. In particular, use the shadcn
  **resizable / splitter** for Rig Mode's columns and the Stage+Spec split, so panel sizing
  is draggable **and remembered**, consistent with the rest of the Studio.

**Responsive — mobile · tablet · desktop, all first-class (QUALITY BAR):**
- The faculty inherits `Fabricate.tsx`'s breakpoint behavior: the 3-column Rig Mode collapses
  gracefully below desktop (the inspector renders inline under the selected element, not a
  far-below scroll — the pattern the Theme tab already uses); controls go icon-first where
  space is tight; the preview + scrub strip stay usable.
- **Interaction is touch-first on touch devices** — scrub, drag the poster marker, select an
  element — and must be verified on the **real** surface, not emulation (HARD RULE #23).

**Preferences (honor what the user asked for):**
- **`prefers-reduced-motion`** → the faculty preview does **not** autoplay; it shows the
  **poster** with an explicit play affordance, and a placed scene renders as its poster
  (the Stage-6 wiring — Anima ADR §14.6). Motion is opt-in when the user has opted out.
- Persist the user's **panel sizes** (the splitter) and **chosen mode** (§3 mode memory), so
  the faculty reopens the way they left it.

## 9. Relationships

- **Refines** `2026-07-17-anima-animation-library.md` §14 (staging) + §15 (poster question,
  storage side) + §16 (fabricated-asset rail).
- **Rhymes with, and is deliberately kept distinct from,**
  `2026-07-13-lente-reader-lenses.md` (reader *lenses* — the audience axis; this doc's
  author *modes* are the writing axis).
- **Mirrors the faculty pattern of** `Fabricate.tsx` (Theme/Component) + `FinishStudio.tsx`
  (the self-contained faculty) — the shell it must not change.
