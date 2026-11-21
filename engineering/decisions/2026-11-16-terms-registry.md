---
status: shipped
summary: >
  One `terms:` front-matter map replaces the two that both rewrote speech (`acronyms:` and `lexicon:`). An entry
  says what a term means (`expansion`), how the voice says it (`pronounce`) and what it is (`definition`). One
  matcher in Cadenza reads it for every narration producer, and it now matches the forms a deck really writes:
  plurals, possessives, hyphen and slash compounds, sentence-start and all-caps case, and multi-word names. The
  old keys stay as aliases.
---

# One term registry for narration (2026-11-16)

The owner's report: "Our narration fails to pronounce words correctly … we tried to solve this by having an
acronym mapping in the front matter … this doesn't seem to work all that well and I suspect there is no shared
spine." And the ask: the deck and its `say:` text stay as written, while one term list drives every narration
and can feed the glossary and later features.

## 1. What the audit found (measured, not reasoned)

**The spine exists.** `lib/core/resolve-narration.mjs` parses the front matter once, and every deck-narration
producer passes the result to Cadenza: Present (`PresentOverlay.tsx`), the narration bake (`narration-bake.ts`),
Share/Export (`share-export.ts`), the CLI captions (`lattice.js` → `lib/core/read-along-build.js`), the Vetrina
tours (`cadenza-narrator.ts`) and the read-aloud warm cache (`read-aloud.ts`). Video export reads the timing
track that the narrated export carries, so it inherits the same words. Lessons speak pre-recorded clips and are
not decks.

**The matcher is what fails.** Cadenza's `toSpoken` matched a registry key only as the exact, case-sensitive
whole token. Measured with `toSpokenText` against a registry of `CRO`, `EBITDA`, `Derby`, `Twinkima.G`:

| Written | Spoken before |
|---|---|
| `The CRO said`, `(CRO)`, `**CRO**`, `CRO:` | expanded |
| `CROs`, `CRO's`, `CRO’s` | **as written** |
| `CRO-led`, `EBITDA-adjusted`, `CRO/CFO` | **as written** |
| `derby`, `Derby's`, `Derbys` | **as written** |
| `Twinkima G` (a two-word key) | **as written**: `lexicon:` accepted the key and the per-word lookup could never reach it; `acronyms:` dropped it while parsing |

That is the "four case and plural variants" #3208 records an author pasting by hand.

**Two maps did one job.** `acronyms:` (#905) and `lexicon:` (#949, born as `symbols:` for glyphs) both rewrite
a word's spoken form. For a word they behaved identically except for precedence and whether the value was
re-read. Authors could not tell which to use, and a name like `Derby` landed in `acronyms:`.

**Meaning and pronunciation shared one field.** `acronyms:` spoke `expansion`, so the example registry wrote
`EBITDA: { expansion: ee bit dah }`: the "expansion" was a pronunciation, and the glossary had no real meaning
to show.

## 2. Decisions (owner, 2026-11-16)

| Fork | Picked |
|---|---|
| A term with no `pronounce` | the voice says its `expansion` (no deck changes how it sounds) |
| How widely a key matches | the forms below, and multi-word keys; **no stemming** (it folds names into words) |
| Two maps or one | **merge into `terms:`**; `acronyms:` and `lexicon:` stay as aliases with a lint fix |
| First PR also carries | the Studio editor, the #1257 lossless writer, the chat assistant's map tool (#3208 P1), the house term list |

## 3. The `terms:` shape

```yaml
terms:
  Derby: Darby                     # a plain value is what the voice says
  "→": leads to                    # a glyph
  "🎯": ""                         # an empty value silences it
  "Twinkima G": Twinkee mah Gee    # a phrase (quote any key with a space)
  CRO: { expansion: chief revenue officer }
  EBITDA:
    expansion: earnings before interest, taxes, depreciation and amortization
    pronounce: ee bit dah
    definition: "A measure of operating profit."
```

- **Voice:** `pronounce`, else `expansion`, else the plain value. `pronounce: ""` silences.
- **Glossary:** an entry with a `definition` (unchanged rule, #920).
- **Aliases:** `acronyms:` reads as `terms:` with its plain value as `expansion`; `lexicon:` reads with its plain
  value as the spoken form. On a clash `terms:` wins, then `acronyms:`, then `lexicon:` (the old precedence).
- **Parsed once** in `lib/core/resolve-narration.mjs` (`termEntries`, `termsSpokenMap`), which every producer
  calls (HARD RULE #1).

## 4. The matcher (Cadenza `terms.ts`, used by `toSpoken` and `spokenAt`)

A key matches a written token when one of these holds, tried in order:

1. **Exact.** As before.
2. **Case.** A Capitalized key (`Derby`) also matches its ALL-CAPS title form (`DERBY`). A lower-case key
   (`kubectl`) also matches its sentence-start form (`Kubectl`), never ALL CAPS, because `us` and `US` are
   different words. A key with any other capital (`CRO`, `SaaS`, `MoM`) matches only as written, so `IT`
   never fires on "it" (§14 of `2026-07-11-manifest-speech-contract.md`).
3. **Endings.** A trailing `'s`, `’s`, `s'` or `s` off a key: the voice says the term's spoken form with the
   same ending (`CROs` → "chief revenue officers", `Derby's` → "Darby's"). A fixed list, not a stemmer, and
   never after a lower-case key, where it makes ordinary words (`it` → `its`, `bu` → `bus`).
4. **Compounds.** A token joined by `-` or `/` whose parts include a key: each part is spoken on its own, and a
   hyphen becomes a space (`CRO-led` → "chief revenue officer led"). A slash stays a slash: it means "or", "per"
   or "to" depending on the deck (`2026-09-21-token-passthrough-coaching.md`). A hyphen between two parts
   that both hold a digit is a range or a date (`FY24-FY26`, `2026-11-16`) and is never split.
5. **Phrases.** A multi-word key matches consecutive words with the same case rule per word, including a
   key word that carries its own dot (`St. Louis`) and a possessive on the last word (`Twinkima G's`). The
   first word speaks the phrase and the rest speak nothing, so captions still show every word. A comma or
   full stop the key lacks ends the run; a silenced phrase drops its punctuation with it.

Only a SYMBOL key (no letter or digit) is substituted inside a token (`"↔"` in `red↔green`); a word key
matches whole tokens only.

A key's spoken value is itself normalized (so `$5` in a value still reads "five dollars"), without the
registry, so a self-referencing entry cannot loop.

## 5. What stays out

- **Stemming** and irregular plurals. An entry that needs one declares the variant as its own key.
- **Inline code** (`` `CRO` ``) is not narration text: the prose projection removes code before Cadenza sees it.
- **Domain packs** (`finance`, `legal`) stay opt-in in code (§15); the house list is the always-on set.

## 6. What shipped, and where

| Piece | Where |
|---|---|
| The matcher (rules 1–5) | `docs/src/lib/cadenza/terms.ts`, called from `toSpoken` / `spokenAt` in `normalize.ts` |
| One registry, three keys | `lib/core/resolve-narration.mjs` `termEntries` / `termsSpokenMap` |
| Every producer passes the one map | Present, the narration bake, Share/Export, `--captions` (`lattice.js` → `read-along-build.js`), the tour narrator |
| Glossary reads `terms:` definitions | `lib/core/glossary-auto.mjs` |
| `terms-key-renamed` (suggestion + fix) | `lib/authoring/lint-core.js` `findLegacyTermKeys`; `spec/diagnostics.md` §3.5 |
| Lossless nested writers (#1257) | `docs/src/lib/front-matter.ts` `frontMatterBlockSpan` / `writeFrontMatterBlock`; `emitFm` deleted |
| One Studio editor with ▶ | `TermsEditor.tsx` replaces `AcronymEditor` + `LexiconEditor` (Deck setup → Speech → Terms) |
| The chat assistant edits terms (#3208 item 1) | `set_terms` (draft) and `preview_speech` (read) in `architect-agent.ts`; a block review row |
| The house list in the `terms:` shape | `lexicon.ts` `houseTerms()`, exported from `@laticent/cadenza` |

### Two behavior changes a reader might trip on

- **A registry value is normalized like the text around it.** `lexicon:` values always were; `acronyms:` values
  reached the voice raw. Now both go through Cadenza without the registry (so a value cannot loop): `M 2` reads
  "M two". What a TTS voice says is the same; the caption track's spoken field is what changed.
- **A letter or digit key never applies inside another word.** Only a symbol key does (`"↔"` in
  `red↔green`). This removed the old `lexicon:` trap where `e: EEK` read "revenue" as "r EEK v EEK nu EEK", so
  `lexicon-single-letter-key` is deprecated and no longer emitted.

### Precedence on a clash

`acronyms:` replaces a `lexicon:` entry whole (it always beat it). A `terms:` entry overrides only the fields it
sets, so `terms: CRO: { definition: … }` beside `acronyms: CRO: …` adds the definition and keeps the expansion.

### Format note

LTT 1.0 declares `inputs.lexicon` and `inputs.acronyms` as hashes that say whether an input changed. Both
producers now write the merged registry's hash under `acronyms` and no longer write `lexicon`. A reader that
compares hashes sees one change per deck, once; nothing reads the hashes back as data.

### 2026-11-19: the reader, the built-in list and the period

What an owner hit after shipping (`2026-11-19-segment-acronyms.md` has the census):

| Defect | Fix | Where |
|---|---|---|
| `Oct. Tenth: October Tenth` (unquoted key with a space), `pronunciation:` / `say:`, `- Term: x`, `terms: { … }` read as no term, and lint said clean | The reader takes a plain key up to its colon and reads a one-line flow map; whatever it still skips it returns with the reason, and `terms-entry-ignored` reports that list | `resolve-narration.mjs` `parseTerms` / `termsIssues`; `lint-core.js` `findIgnoredTerms` |
| `Yearn: yurn # note` spoke the comment, in all three keys | A ` #` outside quotes starts a comment | `resolve-narration.mjs` `withoutComment` |
| A declared `"Oct. Tenth"` never matched: the sentence split ran first and cut it into two cues | The splitter never breaks inside a dotted multi-word key | `segment.ts` `insideJoin`; `track.ts` `dottedPhraseKeys` |
| `Oct. 10` read "October. ten" (the voice stops at a spoken period) | An abbreviation's period, by the splitter's own predicate, is not spoken for a word we replaced | `normalize.ts` `abbreviationDot` |
| Built-in terms matched only as typed (`APIs`, `CEO’s`, `KPI-driven` read raw) | The built-in list is a terms.ts index too, so rules 3 and 4 apply to it | `lexicon.ts` `houseSpokenMap`; `normalize.ts` |
| `OKRs` read "objectives and key resultss" | A plural ending never doubles one the spoken form has | `normalize.ts` `withEnding` |
| A key ending in its own period (`"U.S."`) missed before a comma | The peel's period is tried back on the key | `normalize.ts` `toSpoken` |
| No field completion inside `terms:` | The editor offers `pronounce`, `expansion`, `definition` | `editor-complete.ts` `termFieldCompletion` |

### Left as is

The 29 shipped decks that use `acronyms:` or `lexicon:` keep them: both are read, and rewriting the decks would
bury this change in their diffs. `npm run lint:deck -- --fix` moves any one of them.
