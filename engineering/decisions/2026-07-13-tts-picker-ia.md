---
status: shipped
summary: The Studio TTS voice dropdown was a flat <Select> — fine for a 5-voice engine, unusable for Kokoro's 54 or Gemini's 30, with no curation, search, or structure. This redesigns it as a searchable shadcn Command combobox grouped as ★ Featured + one group per language (only where the voice id actually encodes language — Kokoro's <lang><gender>_name, Voxtral's <lang>_name, Azure/MAI's xx-XX-Name) with a per-row ♀/♂ gender badge; bare-name engines (Gemini, Grok, Orpheus, CSM — no language OR gender in the id) collapse to a single "All voices" list, since a female/male-by-language tree can't be built honestly for them. All derivation is from id STRUCTURE, never a hand-typed per-voice table. Adds a featuredVoices catalog field (curated top) distinct from cachedVoices (has-a-sample). Separately, the model picker's curated lenses (Featured/Value/Free) now sort by price LOW→HIGH with a $/$$/$$$ value-tier badge, floating the two cheapest, highest-quality engines (Kokoro, Gemini) to the top. Gemini's full 30-voice roster is now sample-cached (it and Kokoro are the two standouts on price × quality).
---

# TTS picker IA — grouped, searchable voices; price-ranked models

## The problem

Two Studio TTS surfaces had outgrown their controls once the sample cache made
big rosters browsable:

1. **Voice dropdown** — a flat `<Select>` listing every voice in one scroll. Fine
   at 5 voices (Grok); unusable at Kokoro's 54 or Gemini's 30. No search, no
   curation, no structure — and no way to tell a US female voice from a Japanese
   male one without reading all 54.
2. **Model picker** — already had search + Featured/Value/Free/All lenses, but rows
   sat in **vendor** groups, so price was scattered and the cheapest, best-value
   models didn't surface. There was no at-a-glance cost cue.

## The metadata constraint (this shaped the whole design)

The obvious ask — "group female `<lang>` / male `<lang>`" — is **Kokoro-shaped**.
Voice ids carry very different amounts of structure per engine:

| Engine | id example | Language | Gender |
|---|---|---|---|
| Kokoro | `af_heart` | ✅ encoded | ✅ encoded (2nd char) |
| Voxtral | `en_paul_happy` | ✅ prefix | ✗ (name only) |
| MAI | `en-US-Ethan` | ✅ locale | ✗ (name only) |
| Gemini | `Kore`, `Puck` | ✗ (multilingual) | ✗ |
| Grok / Orpheus / CSM | `eve`, `tara` | ✗ | ✗ |

A uniform nested female/male-by-language tree **cannot be built honestly** — Gemini
(a priority engine) has 30 bare, multilingual names with neither axis. Forcing a
tree would mean either a hand-typed name→gender table (exactly the drift-prone
hand curation the live-roster design killed — see the 2026-07-09 config-split ADR's
"zoe" lesson) or empty/wrong groups.

## The decision (confirmed with the user, one round)

**Voice picker → an inline, expand-in-place search panel** (a collapsed summary →
search input + scrollable grouped list), single-level groups, no nesting. It mirrors
`TtsModelPicker`'s established pattern rather than a Popover+cmdk combobox — see
§ iOS fix below for why the first Popover implementation was replaced:

1. **★ Featured** — a small curated highlight, always first. Backed by a new
   `featuredVoices` catalog field, distinct from `cachedVoices` (which now often
   means "the whole roster has a sample"). Featured voices are NOT repeated in the
   groups below.
2. **Language groups** — one per language, **only where the id encodes it**
   (Kokoro, Voxtral, MAI). Bare-name engines collapse to a single **"All voices"**
   alphabetical list.
3. **Gender** — a per-row **♀/♂ badge** where derivable (Kokoro's 2nd char), never
   a nesting level. Absent — not a placeholder — where a model doesn't encode it,
   so the row degrades gracefully.
4. Search over the whole roster (cmdk), so 30–54 voices stay tractable.

All derivation lives in `voiceMeta()` / `groupVoices()` in `tts-voice-catalog.ts`
— pure, fs-free, unit-tested, browser-identical — and reads only id STRUCTURE.

### § iOS fix — inline panel, not Popover-in-Dialog

The picker first shipped as a shadcn `Command` combobox inside a Radix `Popover`.
A device report (2026-07-13, real iOS Safari) found the **search field un-typeable
on mobile**: the field focused and the keyboard appeared, but characters never
filtered the list. Root cause — the Workspace settings live in a Radix **Dialog**
(the Sheet), which in modal mode sets `pointer-events: none` on everything outside
it; the `Popover` content sits on that path, so it inherited a `pointer-events:none`
ancestor that iOS Safari enforces against **touch** input even when focus succeeds.
(It reproduced only on real iOS — a WebKit-on-Linux driver typed fine, the exact
HARD RULE #23 gap.) The fix drops the Popover entirely and renders the search +
list **inline in the settings flow**, identical to the model picker (which was never
reported broken on the same surface) — no portal, no `pointer-events:none` ancestor.
The DOM check confirms it: the old path had a `pointer-events:none` DIV ancestor on
the input; the inline path has none. Search is a plain `<input>` with manual
substring filtering (name + id + language). HARD RULE #15: reuse the proven widget,
don't fork one per surface.

**Model picker → price-ranked + value tier.** The curated lenses
(Featured/Value/Free) now render a single flat list sorted by price **LOW→HIGH**
(`ttsModelGroups`, `tts-catalog.js`), so Kokoro (~$0.62/M) then Gemini (~$1/M) land
on top; the browse-everything **All** lens keeps vendor grouping. Each row carries a
`$` / `$$` / `$$$` **value-tier badge** (`priceTier`): `$` ≤ $2/M, `$$` ≤ $10/M,
`$$$` above — bucketed off the live 2026-07-13 spread.

**Gemini fully cached.** Its 30-of-30 live roster now has committed samples (it and
Kokoro are the price × quality standouts, so both earn a complete cache). The
`featuredVoices`/`cachedVoices` split lets "all 30 cached" coexist with "6 featured".

## Why not

- **Nested female/male-by-language** — can't be built for Gemini/Grok/Orpheus/CSM
  (no gender or language). A picker that's rich for one engine and broken for the
  next is worse than a uniform, graceful one. Gender-as-badge conveys the same
  information without a nesting level and without a hand table.
- **Per-voice metadata table** — reintroduces exactly the hand-curated drift the
  live-roster design removed. Derivation from id shape is always well-formed or
  honestly absent.
- **Per-row voice ▶ preview** — deferred. The instant sample cache makes it a
  natural follow-up, but it's additive to this IA change; the existing "Play
  sample" button already auditions the selected voice, and the model picker keeps
  its inline play.

## Verified

- Pure logic: `voiceMeta`/`featuredVoiceIds`/`groupVoices` (37 tests, `tts-voice-catalog.test.ts`)
  and `priceTier`/`ttsModelGroups` (16 tests, `tts-catalog.test.ts`).
- Component: `WorkspaceSheet.test.tsx` (24) drives the combobox via its
  `role="combobox"` trigger.
- **Visual + interaction (real component):** the production `VoicePicker` +
  `TtsModelPicker` rendered with static rosters and screenshot at 1440 / 820 / 390.
  The iOS fix was driven on the **real WebKit engine** (Playwright) at iPhone
  viewport, INSIDE the real Sheet — search types + filters (17→1), and the DOM
  check shows the `pointer-events:none` ancestor is gone. The **connected live
  Playground on a physical iOS device** remains the owner's sign-off (WebKit-Linux
  ≠ real iOS — that's the gap that hid this bug; HARD RULE #23).
