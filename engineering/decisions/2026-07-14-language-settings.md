---
status: in-progress
summary: Lattice had TWO disconnected "language" ideas — a Studio AI "Output language" (BCP-47, 16 Latin-script languages) buried in the Workspace AI tab that only steered AI prose, and a deck `lang:` front-matter directive that already flowed to `<html lang>` in preview/exports/read-aloud but which the AI ignored. This connects them through a workspace-wide DEFAULT language (moved to the General tab — it describes the deck, not the model, so both AI tiers inherit it rather than each carrying their own), overridable PER-DECK via `lang:` front matter set through a flagged shadcn dropdown in the Inspector (with `lang:`-value autocomplete). Crucially it does NOT fuse the two into one knob: the DOCUMENT language (`lang:` → `<html lang>` + read-aloud) and the AI-OUTPUT language (what the AI writes, an optional `ai-lang:` override) are two fields that DEFAULT to the same value but resolve independently (`deckOutputLang`), so the future translation lens gets its source-vs-target distinction for free — the presentation stays one control. The offered set is pulled back to English (US + UK) only for now; the list stays data-driven (a row + a flag SVG per language) so widening later — plus that lens — is data, not a refactor. The real gate on more languages is fonts + layout (RTL, CJK), not the catalog.
---

# Language settings — a workspace default, a per-deck override, two fields not one knob, English-only for now

## The problem — two "languages" that never met

Lattice carried two separate language notions that a user would reasonably
expect to be the same thing:

1. **Studio "Output language"** — a BCP-47 locale (`en-US`, `fr-FR`, … 16
   Latin-script entries) living in the Workspace drawer's **AI** tab
   (`2026-06-30-studio-output-language.md`). It steered *only* the AI's prose via
   `withStudioVoice` → `languageDirective`. It did not touch the rendered deck.
2. **Deck `lang:` front matter** — a real engine directive (`lib/engine/directives.js`,
   `GLOBAL_ONLY`) that already reached the document `<html lang>` in the preview
   (`deck-preview.js`), every export (`player-core`, `share-export`), and
   read-aloud (`resolve-captions.mjs`). The AI ignored it entirely.

So a deck marked `lang: en-GB` still got US-English AI edits, and the AI's
language lived under "AI" as if it were a model knob — when it actually describes
the *deck's* language, which is why cloud and on-device were already sharing one
value. The two ideas wanted to be one.

## The decision (with the user)

**A workspace default, a per-deck override — but two fields, not one knob.** A deck
resolves TWO languages that default to the same value and diverge only if asked:

```
workspace default (General tab, settings.language)
        │  seeds both
        ▼
  DOCUMENT language      deck `lang:`   ──▶  <html lang>  +  exports  +  read-aloud
  AI-OUTPUT language     deck `ai-lang:` ?? `lang:`  ──▶  the AI's prose  (deckOutputLang)
```

- **Workspace default → General tab.** Language moved out of the AI tab into
  **General**, framed as "the default language for this workspace." It is a
  *general* workspace preference, not an AI one: it seeds both a deck's document
  language and its AI-output language. Both AI tiers (cloud + on-device) share it —
  there is no separate AI-cloud / AI-on-device language, by design.
- **Per-deck DOCUMENT override → `lang:` front matter, set from the Inspector.** A
  flagged shadcn dropdown in the deck Inspector's "Look" group writes/clears the
  `lang:` directive. Its first row, **"Automatic — <workspace default>"**, clears the
  key so the deck inherits again. This mirrors the Theme control's "Automatic — match
  site" affordance. `lang:` alone is what the exports stamp as `<html lang>`.
- **Per-deck AI-OUTPUT override → `ai-lang:` front matter (data model, unified UI).**
  The AI writes a deck's prose in `deckOutputLang(source)` = `ai-lang:` ?? `lang:` ??
  workspace default. So the AI DEFAULTS to the deck's document language (an `en-GB`
  deck gets British edits on every path), but a deck can point the AI elsewhere with
  `ai-lang:` WITHOUT changing what the exports declare. Today the UI exposes only the
  one "Language" control (it sets `lang:`); `ai-lang:` is a data-model field reachable
  via the editor (autocompleted) — the presentation stays unified, the data does not.
- **Autocomplete.** The editor completes `lang:` AND `ai-lang:` VALUES (the supported
  codes) the same way it completes `theme:` / `finish:` / `class:`.
- **Every deck-content AI path threads it.** `withStudioVoice` takes an optional
  `deckLang`; the source-bearing paths (`runArchitect`, `chatComplete`,
  `requestFindingFix`) resolve `deckOutputLang` from their own `source`; the fragment
  paths (`refineSelection`, `generateDescription`, which carry only a selection or a
  single slide) receive it from their caller (`StudioShell` / `SlideContext`) — so a
  pinned deck stays consistent even on a mid-selection "shorten".

### Why two fields and not one (the adversarial-trio call)

The first cut fused document and AI-output language into one `lang:` knob. An
adversarial-trio review (red team + Munger inversion + independent checker) flagged
the fusion: `<html lang>` is a document/accessibility FACT (what the deck IS), while
the AI-output language is a generation PREFERENCE (what to WRITE) — and the stated
end goal, a **translation lens**, intrinsically needs BOTH a source (the document)
and a target (the output). Fusing them would force the lens to un-fuse every caller
that had assumed one value. So we split the *data model* now (two front-matter fields,
`deckOutputLang` resolving them) while keeping the *presentation* unified (one picker).
They coincide under English-only — but the seam the lens needs already exists, at
almost no cost today. (The same review also hardened the picker: it normalizes valid
non-canonical English tags via `resolveSupported` instead of branding `lang: en`
"unsupported", and the AI-output paths all inherit the deck's dialect.)

**English only for now.** The 16-language `STUDIO_LANGUAGES` list was more than we
actually support end-to-end. We pull it back to **English (United States)** and
**English (United Kingdom)** — two real variants, each with a natural flag
(`us` / `gb`) and the existing spelling directive. This reverses the breadth of
the `2026-06-30` doc, on purpose: the picker should promise only what ships.

## Why English-only, and why a flag anyway

A dropdown offering fifteen languages the pipeline hasn't been proven on
(fonts, layout, hyphenation, read-aloud voices) over-promises. The honest set
today is English. Keeping the picker (and the flag) is forward-looking, not
decorative: the control, the front-matter override, the autocomplete, and the
inheritance chain are the *architecture* for the end goal — **any language plus a
translation lens**. Widening then is data: one row in `STUDIO_LANGUAGES` + one
flag SVG under `docs/public/flags/`, nothing structural. A flag maps to a
*region* (hence US + UK rather than a bare "English"), which is why the two-variant
set fits a flag-bearing dropdown better than a single entry would.

## What stays out of scope (deliberately)

- **Theme / component generation stays canonical English** — unchanged from the
  `2026-06-30` doc. That output is a structural contract (slugs, CSS, manifest
  keys, `_class` invokes) gated on ASCII/English. Localizing it is a bug.
- **No new engine work.** `lang:` already renders end-to-end; this change is the
  Studio UX + the AI resolution that sits on top of it. `ai-lang:` is inert to the
  engine (not an applied directive), so the exported bytes are unchanged (no export
  sign-off needed).
- **No second UI control.** The split is in the *data model*; the Inspector keeps one
  "Language" picker (sets `lang:`). `ai-lang:` is deliberately editor-only for now —
  surfacing it as a control waits until there's a language other than English to
  point it at (or the lens that needs it).
- **The translation lens is future.** This lays the source/target seam it will ride
  on; it does not build translation itself.

## The shape of the fix

- **`studio-language.ts`** — `STUDIO_LANGUAGES` trimmed to `en-US` + `en-GB`; each
  entry gains a `flag` (ISO 3166 alpha-2) for the vendored flag SVG. Adds
  `resolveSupported` (the honest "is this a supported tag?" test the picker needs) and
  `deckOutputLang(source)` = `ai-lang:` ?? `lang:` ?? '' (the AI-output resolver, the
  seam of the split). Other helpers (`languageFor`, `languageDirective`,
  `detectLanguage`) unchanged in shape.
- **`LanguageSelect.tsx`** (new) — the ONE flagged dropdown (HARD RULE #15),
  shared by the Workspace General tab (no Automatic row) and the deck Inspector
  (`includeAuto`). Renders a vendored flag `<img>` (never an emoji — Windows) +
  the English label; reuses `flagSrc` from the TTS catalog. It NORMALIZES its value
  through `resolveSupported` (studio-language) so a valid non-canonical English tag
  (`en`, `en-us`, `EN-GB` — the ubiquitous document-lang forms) resolves to its item
  instead of being branded "unsupported"; a genuinely-dropped locale (`fr-FR`) keeps
  its raw form in a labelled "(unsupported)" row so the control never blanks and
  never lies.
- **`WorkspaceSheet.tsx`** — a "Language" section atop the **General** tab; the
  old "Output language" section removed from the AI tab.
- **`StudioShell.tsx`** — a "Language" field in the Inspector "Look" group, wired
  to `lang:` front matter with an "Automatic — <workspace default>" row.
- **`architect.ts`** — `withStudioVoice(messages, generation, deckLang?)` +
  `voicedModel(…, deckLang?)`; every deck-content path passes `deckOutputLang(source)`
  (source-bearing paths internally; `StudioShell`/`SlideContext` for the fragment paths).
- **`editor-complete.ts`** — `lang:` AND `ai-lang:` key + value completion from
  `STUDIO_LANGUAGES`.

## Future

Widening beyond English means revisiting fonts + layout (RTL, CJK line
breaking) and read-aloud voice coverage — not just adding rows. The catalog is
data-driven so the *list* grows cheaply; the *rendering + narration* are the real
gate, and the translation lens (translate → native TTS voice, which also owns
non-English number reading — see `2026-07-12-narration-pace-model.md`) is the
destination this plumbing was built for.
