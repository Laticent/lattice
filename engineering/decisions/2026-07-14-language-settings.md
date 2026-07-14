---
status: in-progress
summary: Lattice had TWO disconnected "language" ideas — a Studio AI "Output language" (BCP-47, 16 Latin-script languages) buried in the Workspace AI tab that only steered AI prose, and a deck `lang:` front-matter directive that already flowed to `<html lang>` in preview/exports/read-aloud but which the AI ignored. This unifies them into ONE inheritance chain: a workspace-wide DEFAULT language (moved to the General tab — it describes the deck, not the model, so both AI tiers inherit it rather than each carrying their own), overridable PER-DECK via `lang:` front matter set through a flagged shadcn dropdown in the Inspector (with `lang:`-value autocomplete in the editor). The AI now writes THIS deck's effective language (deck `lang` ?? workspace default), not a separate AI setting. The offered set is pulled back to English (US + UK) only for now; the list stays data-driven (a row + a flag SVG per language) so widening later — plus a future translation lens — is data, not a refactor. The real gate on more languages is fonts + layout (RTL, CJK), not the catalog.
---

# Language settings — one workspace default, a per-deck override, English-only for now

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

**One language, inherited.** A single effective language per deck:

```
workspace default (General tab)  ──inherited by──▶  deck `lang:` (Inspector override)
        │                                                    │
        └──────────── both feed ──────────────┬─────────────┘
                                              ▼
        the AI's prose  +  <html lang>  +  read-aloud voice
```

- **Workspace default → General tab.** Language moved out of the AI tab into
  **General**, framed as "the default language for this workspace." It is a
  *general* workspace preference, not an AI one: it describes the deck's own
  language, which the AI merely inherits. Both tiers (cloud + on-device) share it
  — there is no separate AI-cloud / AI-on-device language, by design.
- **Per-deck override → `lang:` front matter, set from the Inspector.** A flagged
  shadcn dropdown in the deck Inspector's "Look" group writes/clears the `lang:`
  directive. Its first row, **"Automatic — <workspace default>"**, clears the key
  so the deck inherits again; picking a language pins the override. This mirrors
  the existing Theme control's "Automatic — match site" affordance exactly.
- **Autocomplete.** The editor now completes `lang:` VALUES (the supported codes)
  the same way it already completes `theme:` / `finish:` / `class:`.
- **The AI writes the deck's effective language.** `withStudioVoice` takes an
  optional `deckLang`; the source-bearing paths (`runArchitect`, `chatComplete`,
  `requestFindingFix`) thread the deck's `lang:` in, so an `en-GB` deck gets
  British-English edits. The fragment paths (`refineSelection`,
  `generateDescription`) have no deck front matter and fall back to the workspace
  default — an acceptable, documented degradation.

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
  Studio UX + the AI inheritance that sits on top of it. The exported bytes are
  unchanged (no export sign-off needed).
- **The translation lens is future.** This lays the inheritance + override
  plumbing it will ride on; it does not build translation itself.

## The shape of the fix

- **`studio-language.ts`** — `STUDIO_LANGUAGES` trimmed to `en-US` + `en-GB`; each
  entry gains a `flag` (ISO 3166 alpha-2) for the vendored flag SVG. Helpers
  (`languageFor`, `languageDirective`, `detectLanguage`) unchanged in shape.
- **`LanguageSelect.tsx`** (new) — the ONE flagged dropdown (HARD RULE #15),
  shared by the Workspace General tab (no Automatic row) and the deck Inspector
  (`includeAuto`). Renders a vendored flag `<img>` (never an emoji — Windows) +
  the English label; reuses `flagSrc` from the TTS catalog.
- **`WorkspaceSheet.tsx`** — a "Language" section atop the **General** tab; the
  old "Output language" section removed from the AI tab.
- **`StudioShell.tsx`** — a "Language" field in the Inspector "Look" group, wired
  to `lang:` front matter with an "Automatic — <workspace default>" row.
- **`architect.ts`** — `withStudioVoice(messages, generation, deckLang?)` +
  `voicedModel(…, deckLang?)`; the three source-bearing paths pass the deck's
  `lang:`.
- **`editor-complete.ts`** — `lang:`-value completion from `STUDIO_LANGUAGES`.

## Future

Widening beyond English means revisiting fonts + layout (RTL, CJK line
breaking) and read-aloud voice coverage — not just adding rows. The catalog is
data-driven so the *list* grows cheaply; the *rendering + narration* are the real
gate, and the translation lens (translate → native TTS voice, which also owns
non-English number reading — see `2026-07-12-narration-pace-model.md`) is the
destination this plumbing was built for.
