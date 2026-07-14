---
status: superseded
superseded-by: 2026-07-14-language-settings.md
summary: Studio AI produced British-leaning prose with no way for a user to choose otherwise — there was no language/locale setting anywhere, and the prompts said nothing about dialect, so the model defaulted to its own "boardroom" lean. The fix adds an OUTPUT LANGUAGE setting (a BCP-47 locale) to the Workspace drawer's Instructions tab, seeded from the browser on first run (navigator.language → supported code, else en-US) and explicitly overridable. It is threaded into a single helper, `withStudioVoice`, applied ONLY to the four deck-CONTENT prose paths (runArchitect, refineSelection, chatComplete, requestFindingFix). Theme/component generation is DELIBERATELY excluded — its output is a structural contract (slugs, CSS, manifest keys, `_class` invokes) that must stay canonical English to pass the gates and resolve at render time. The same helper also revives the previously-dead "Standing instructions" field (written to localStorage but never read into any Studio prompt). Latin-script languages only for now; the list is data-driven so widening it is one row.
---

> **Superseded by [2026-07-14-language-settings.md](2026-07-14-language-settings.md).**
> The mechanism below (the `withStudioVoice` directive, the `studio-language`
> catalog, the "leave the engine's contract English" scope) still stands. What
> changed: language is no longer an *AI* setting on its own tab — it is the ONE
> workspace-wide default (General tab) that both AI tiers **and** the deck's own
> `lang` inherit, overridable per-deck via `lang:` front matter; and the catalog
> is pulled back to **English only** for now (the 16-language list was more than
> we actually support). Read the successor for the current model.

# Studio AI output language — let the user choose the locale; keep the engine's contract English

## The problem

Studio's AI wrote British English ("colour", "organise", "whilst") and the user
had no lever to change it. Investigation found the root cause: **there was no
locale handling anywhere** in the Studio — no `navigator.language`, no `Intl`, no
language setting — and none of the AI system prompts said a word about dialect.
With no directive, the model fell back to its own lean, which reads British for
"boardroom" prose.

A second, related defect surfaced: the Workspace drawer's **"Standing
instructions" textarea was a dead setting** in Studio — it wrote to
`localStorage` (`lattice-studio-instructions`) but **nothing ever read it back
into a prompt**. (The Drawing Board has a working twin, `readStandingInstructions`
→ `buildChatMessages`.) So even a free-text "write in American English" would not
have taken effect.

## The design axes (decided with the user)

1. **The lever — a structured locale, not free text.** A dropdown holding a real
   BCP-47 value (`en-US`, `fr-FR`, …) beats a free-text plea: it is *detectable*
   (seedable from the browser), *reliably injected* as a strong directive, and
   *future-proof*. It lives in `StudioSettings` (`studio-store.ts`).
2. **Default — detect, then fall back to `en-US`.** `detectLanguage()` resolves
   `navigator.language(s)` to a supported code (exact tag → base-language house
   default → `en-US`). It only *seeds* the default; an explicit pick wins forever
   after. Never silent — the picker is visible and overridable.
3. **Scope — DECK CONTENT only.** The directive governs the prose a presenter
   reads. The theme and component generators are excluded on purpose.

## Why theme/component generation is excluded

Their output is not prose — it is a structural contract:

- a component `name` is an identifier gated by `NAME_RE` and used in
  `<!-- _class: name -->`; a German name fails the gate AND the invoke;
- component **CSS** is code (selectors, properties) — never translated;
- a theme `name` is a lowercase slug (a key); hex/ramp are not language at all.

Localizing any of those is a bug, not a feature. The only debatable bits were the
human-facing one-sentence `description` blurbs; for v1 we keep those English too,
to avoid perturbing the AA-/gate-critical JSON prompts. The mental model is one
line: **your deck speaks your language; the engine's building blocks are described
in English.** Localizing descriptions later is a clean, isolated follow-up.

## The shape of the fix

- **`docs/src/components/studio/studio-language.ts`** (new) — the data-driven
  catalog (`STUDIO_LANGUAGES`, Latin-script), `DEFAULT_LANGUAGE = 'en-US'`,
  `detectLanguage()`, `languageFor`/`languageLabel`, and `languageDirective(code)`
  (the system clause; explicitly tells the model to leave code / component names /
  `_class` directives untranslated).
- **`studio-store.ts`** — `StudioSettings.language` (seeded via `detectLanguage`
  on first load only), plus `loadInstructions`/`saveInstructions` centralizing the
  raw-string `lattice-studio-instructions` key (the format the drawer already
  wrote, so existing values keep working).
- **`architect.ts`** — `withStudioVoice(messages)` merges the language directive
  (+ standing instructions, when set) into the system turn. Applied at the four
  prose paths only; `voicedModel()` wraps the model handed to `requestSlideFix` so
  the findings-fix bridge (which builds its own messages) inherits it. The
  `generateTheme`/`generateComponent` calls are left untouched.
- **`WorkspaceSheet.tsx`** — an "Output language" `Select` atop the Instructions
  tab, and the standing-instructions textarea rewired to the store with a
  `placeholder` (so an untouched field injects nothing — the displayed text is now
  an honest hint, not a fake default).

## Future

Widening beyond Latin-script means revisiting fonts + layout (RTL, CJK line
breaking), not just adding rows. The catalog is data-driven so the *list* grows
cheaply; the *rendering* is the real gate, tracked separately.
