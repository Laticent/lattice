---
status: in-progress
summary: Read-aloud mispronounces symbols one at a time — "→" was read as the word "arrow" (#947 fixed it ad hoc), and the same class of bug awaits every math operator, currency mark, and emoji arrow an author types. This replaces the scattered, per-glyph handling (the arrow rule, the decorative-separator rule, the §/¶/& lexicon entries) with ONE canonical Speech Symbol Commons in the cadenza kernel: a curated built-in table that sorts each glyph into an ACTION — SPEAK a word ("×"→"times"), PAUSE (a comma, decorative separators), or DROP (silence, decorative emoji) — plus a front-matter `lexicon:` override that wins over the built-in (exact parity with the `acronyms:` registry), editable from a deck-drawer Lexicon UI. Only UNAMBIGUOUS glyphs ship built-in; ambiguous ones (`+ − = / # -`) stay with the number/range parsers or the author's own override. One glyph-substitution pass handles standalone, embedded, and mixed tokens alike.
companion:
  - ./2026-07-12-per-voice-pace-calibration.md
  - ./2026-07-11-manifest-speech-contract.md
---

# Speech Symbol Commons

**Status:** proposed (design → build)
**Thread:** read-aloud narration quality (follows `2026-07-12-per-voice-pace-calibration.md`)

## Problem

Symbol narration is whack-a-mole. `→` read as the literal word "arrow" (an on-device report,
fixed in #947); the same bug is latent in every `×` `÷` `±` `≈` `≥` `°` `©` `™`, every emoji arrow
`➡️⬆️`, and every decorative emoji `🚀🎯` a TTS will happily voice as "rocket." The handling we have
is scattered and per-glyph: a bespoke arrow rule and a decorative-separator rule in `normalize.ts`,
plus `§`/`¶`/`&` as one-off lexicon entries. Each new symbol is a new special case and a new
regression surface.

The reporter's ask: *get ahead of it* — a robust, comprehensive commons for symbol → spoken form,
with an author override (like `acronyms:`), founded on the unambiguous glyphs and extensible per deck.

## The model

One canonical resolver in the cadenza kernel (so CLI, export, and live narration share it —
HARD RULE #1), in three layers:

1. **Built-in commons** — a curated, always-on table. Every glyph maps to an **action**:
   - **SPEAK** — an unambiguous word: `→⇒⟶➜`→"to", `↔⇔`→"and", `×`→"times", `÷`→"divided by",
     `±`→"plus or minus", `≈`→"approximately", `≠`→"not equal to", `≤`/`≥`→"less/greater than or
     equal to", `√`→"square root of", `°`→"degrees", `§`→"section", `¶`→"paragraph", `©`→"copyright",
     `®`→"registered trademark", `™`→"trademark", `&`→"and", `@`→"at", `∞`→"infinity", `π`→"pi",
     `µ`→"micro", `∑`→"sum of".
   - **PAUSE** — a decorative separator read as a comma beat: `· • ∙ ‖ ¦ ⁃ ・ |` (today's rule).
   - **DROP** — decorative, silent: general emoji (`🚀🎯⭐✨…`) and dingbats, so the voice never
     says "rocket." Directional emoji (`➡️⬆️⬅️`) map like their text arrows, NOT dropped.
   - **CONTEXT / leave alone** — NOT in the commons: `+ − = / # ~ * ^ - – —` and quotes. These are
     genuinely ambiguous (minus vs hyphen vs range; per vs or vs date) and stay with the existing
     number/range parsers or the author's own override. A wrong reading is worse than none.

2. **Author override — the deck `lexicon:`** — a front-matter map (token → spoken, or `""` to force
   silence), author ALWAYS wins over the built-in. Exact parity with `acronyms:` (parsed in
   `resolve-captions.mjs`, threaded through `buildTrack` → `toSpoken`). A key is a glyph **or a whole
   word**: a deck can say `→` = "leads to", silence a brand emoji, or fix a word the TTS mangles
   (`Kubernetes` = "koober net eez"). The older `symbols:` key stays a silent deprecated alias.

3. **Deck-drawer UI** — a Studio "Lexicon" entry that reads/writes the `lexicon:` map (and sits
   beside the `acronyms:` editor), so a non-technical author fixes a word or glyph without touching YAML.

## Resolution — one glyph-substitution pass

Generalize the arrow handler #947 shipped: for a token containing any commons/override glyph, swap
each glyph for ` <spoken> ` (SPEAK), ` , ` (PAUSE), or `` (DROP), then re-normalize the operands so
`Q1`/`Q2` still expand. This handles standalone (`→`), embedded (`red↔green`), and mixed (`3×4`)
uniformly. Precedence per glyph: **author `lexicon:` → built-in commons**; author whole-token
`acronyms:` and whole-word `lexicon:` entries still run first for word-tokens.

## Scope decisions (confirmed 2026-07-13)

1. **Consolidate**, don't layer: migrate the arrow rule, the decorative-separator rule, and the
   `§`/`¶`/`&` symbol entries into `symbols.ts` — one source of truth (maker-checked for the
   behavior-preserving move).
2. **Emoji default DROP** (silent) with per-glyph override — never read "grinning face."
3. **Distinct `lexicon:` front-matter key** (words + glyphs) alongside `acronyms:`; both edited in
   one drawer UI. (Shipped first as `symbols:`; renamed to `lexicon:` on 2026-07-13 — see below —
   with `symbols:` kept as a silent alias.)
4. **Ambiguous glyphs stay out** of the built-in table — context parsers + user override own them.

### Naming: `symbols:` → `lexicon:` (revised 2026-07-13)

"Symbols" undersold the feature: the override map isn't glyph-only — a **whole word** entry
(`Kubernetes: koober net eez`) is the more common real-world need, and the built-in table already
owns the unambiguous glyphs. The author-facing surface is a per-deck **pronunciation lexicon**, so
the key and the drawer are named **`lexicon:`** / **"Lexicon"**. `symbols:` is retained as a silent
back-compat alias (`lexicon:` wins on a key collision). The built-in engine table keeps the name
**Speech Symbol Commons** — it genuinely resolves symbols. The internal cadenza option stays
`opts.symbols` for continuity (commented at the call site); only author-facing names changed.

## Files this touches

- `docs/src/lib/cadenza/symbols.ts` — NEW: the built-in tables (SPEAK/PAUSE/DROP) + `resolveSymbols`.
- `docs/src/lib/cadenza/normalize.ts` — `toSpoken` calls the resolver; the bespoke arrow +
  separator rules are removed (behavior preserved by the commons).
- `docs/src/lib/cadenza/lexicon.ts` — drop the symbol glyphs (`§ §§ ¶ &`) now owned by the commons.
- `docs/src/lib/cadenza/track.ts` — thread a `symbols` override map through `BuildOptions`.
- `lib/core/resolve-captions.mjs` — parse a `lexicon:` front-matter block (`symbols:` alias),
  mirrors `parseAcronyms`.
- `lib/core/read-along-build.js` + the live read-aloud path — thread `symbols` into `buildTrack`.
- Regenerate the cadenza + read-along-core bundles. Spoken-form only — caption glyphs and the
  exported `.vtt` are unchanged (same class as the #947 arrow fix).

## Slices

1. **Engine commons + override (this PR — built).** `symbols.ts` + resolver, the
   `normalize.ts`/`lexicon.ts` consolidation, the override option, the `lexicon:` (+ `symbols:` alias)
   front-matter parse (`resolve-captions.mjs`) threaded through every producer — the live Present
   reader + warm-ahead (`PresentOverlay`/`read-aloud.ts`), the Studio export (`share-export.ts`),
   and the CLI (`lattice-emulator.js`), all via `buildReadAlong`. Tests at every layer.
2. **Deck-drawer Lexicon UI (built).** A "Lexicon" group in the deck-scope Inspector
   (`LexiconEditor`) edits `lexicon:` — add/edit/remove a word-or-glyph → spoken row — and writes it
   back via a new nested-block front-matter serializer (`setFrontMatterBlock`, since `setFrontMatter`
   handles only flat scalars). The reader (`lexiconMap`) picks it up reactively; verified at
   desktop/tablet/mobile. Editing `acronyms:` from the same panel is a tidy follow-on (its values can
   be `{ expansion, definition }` block objects, so the writer needs to preserve definitions).

## Open questions (non-blocking, logged)

- The full SPEAK table is curated conservatively; new glyphs are additive (a one-line table entry).
- Directional emoji carry Unicode variation selectors (`➡️` = `➡` + U+FE0F) — the resolver strips
  the selector before lookup.
- **Non-English decks: SPEAK is gated (#919), DROP is not — asymmetric by design.** In a `lang: de`
  deck a `→` passes through un-voiced (no English "to" injected) while `←`/emoji still drop to
  silence and `©`/`™` now drop too (they used to pass through). This follows the #919 rule (never
  anglicize) but means the arrow fix doesn't reach non-English decks; those authors use the
  language-neutral `lexicon:` override. Revisit if a non-English narration bug is reported.
- **`lexicon:` keys are a glyph OR a whole word.** The built-in `resolveSymbols` still matches per
  code point (glyph swaps), but a `lexicon:` entry is *also* checked whole-token in `toSpoken`
  (after the `acronyms:` lookup), so a multi-character key (`Kubernetes`, `->`) fixes a whole word's
  pronunciation. The value is re-normalized with the lexicon removed, so a self-referential entry
  (`"→": "→"`) resolves via the acyclic built-in instead of infinite-recursing.

## Red-team pass (2026-07-13, untrusted-front-matter surface)

A focused adversary reviewed the `lexicon:` parser (`parseTokenMap`/`parseLexicon`) and the
`normalize.ts` lexicon path under the #22 threat model (a shared / AI-generated deck is hostile).
**No XSS and no recursion loop** — the spoken value reaches only word-timing + the TTS audio engine
(captions and the `.vtt` render the escaped `display` glyphs, never the spoken string), and the
`{ ...opts, symbols: undefined }` removal on both lexicon branches is airtight against a cyclic
override. Two real findings folded in / logged:

- **FIXED — token-length DoS.** Two *pre-existing* super-linear sinks in `toSpoken` — `spokenCore`'s
  one-sign-per-frame recursion (a ~20k `+`/`-` run overflows the stack) and the quadratic
  `/[.,!?;:…]+$/` trailing-peel (a long punctuation run before a non-punct char) — were newly
  reachable from a lexicon value. Bounded at the choke point with `MAX_SPOKEN_TOKEN` (512): a
  single token longer than any real word is spoken verbatim, keeping both paths linear. Covered by a
  test. (The sinks predate this change and are reachable from any deck prose token, but this PR
  touches those lines, so #18 = fix in place.)
- **Logged (follow-up, not this PR):** (a) a single-LETTER lexicon key (`"e": …`) falls to the
  per-glyph pass and rewrites every embedded `e` — a self-inflicted mis-narration the word-key
  feature newly makes easy to author; wants an authoring-time validation warning. (b) `blockLines`
  matches a `key:` header at any indent, so a nested `acronyms:` under `lexicon:` is double-parsed —
  a robustness wart, no privilege gain (the author could write a top-level key anyway).
