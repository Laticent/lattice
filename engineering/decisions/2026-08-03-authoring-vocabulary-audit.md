---
status: proposed
summary: Lattice has THREE authoring vocabularies, not one, and only the smallest is enumerable. 22 Marpit directives have a registry; ~14 deck registers have 13 kernels among 17 resolve-* files but no registry of their own; 6 body-comment annotations have neither. Nothing gates any of them, so an unregistered key is indistinguishable from a typo in both directions — a misspelled directive silently does nothing, and a real feature silently works with no authority that says it exists. This audits every key against how it is produced, why, what consumes it, and in what context, and proposes one registry with a gate.
---

# The authoring vocabulary: three registers, one of them homeless

## Why this exists

The question that started it: *"we can't have people adding front matter for convenience or
shortcut in an unofficial way. Front matter should be official and load-bearing … as core engine
function."*

Agreed, and the standing rule from that conversation is: **anything the Studio produces is official
by definition** — but it must be validated: how it is produced, why, how it is used, in what
context. This is that validation.

The first cut of this audit got the framing wrong twice, and both corrections matter more than the
findings they qualify.

**First:** it called the non-`KNOWN_DIRECTIVES` keys stray additions. They are not — most are a
named, kernel-backed family with 13 dedicated resolvers and a bake-into-the-document mechanism.

**Second, and this one survived into the merged draft:** it said *"there is no single place that
enumerates the vocabulary."* **There are four, and this audit found only one of them.**

| enumeration | file | keys | gated |
|---|---|---|---|
| `KNOWN_DIRECTIVES` | `lib/engine/directives.js:31` | 22 | — |
| `DIRECTIVE_KEYS` | `docs/src/components/studio/slide-directives.ts:17` | 22, a TS mirror | **yes** — parity test |
| `FIELD_DEFAULTS` / `MANAGED` | `docs/src/playground/deck-config.js:40` | 16, **with per-key prose naming each resolver kernel** | no |
| `FRONT_MATTER_KEYS` | `docs/src/components/studio/editor-complete.ts:14` | 14, author-facing autocomplete | no |

`deck-config.js` is not a sketch: it documents `finish` → `resolve-finish.js`, `mode` →
`resolve-mode.js`, `color-mode` → `resolve-color-mode.js`, `split` → `resolve-split.js`, `lift` →
`resolve-lift.js`, `glossary` → `glossary-auto.mjs`. **That is substantially the registry this note
proposes building**, already written, already live, already unit-tested.

So the real defect is **duplication, not absence** — four lists that already disagree, one of them
(`FRONT_MATTER_KEYS`) shipped as author-facing autocomplete offering three keys this audit never
mentions and omitting `color-mode`, every `spectrum*`, `stamp`, `tone`, `rule`, `eyebrow`,
`headline`, `captions` and `motion*`. **The remedy for duplication is consolidation, not a fifth
declaration**, and #1339 has been rescoped accordingly. Nothing gates any of them, which is the part
of the original framing that holds.

### The corpus census

Every front-matter key across the 175 committed decks (`examples/`, `exemplars/`,
`test/integration/baseline-decks/`), counted with a **hyphen-tolerant** key regex at root indent:

```
OFFICIAL (10)    theme 174 · paginate 171 · marp 166 · header 128 · size 109 ·
                 footer 45 · logo 2 · class 2 · debug 1 · lang 1

UNOFFICIAL (20)  meta 6 · acronyms 6 · form 5 · color-mode 4 · spectrum 2 · finish 2 ·
                 logo-on 2 · logo-x 2 · logo-y 2 · logo-scale 2 · motion 1 · glossary 1 ·
                 player 1 · mode 1 · present 1 · captions 1 · lexicon 1 · stamp 1 ·
                 tone 1 · lift 1
```

The hyphen tolerance matters and is not a detail. An earlier count used the engine's own key charset
and reported 15 — omitting `color-mode` and the four `logo-*` keys, i.e. the **flagship register was
missing from its own census**. That omission has the same root cause as the finding below.

### How this was verified

Every claim below was checked by running it — rendering the deck, calling the parser, counting the
corpus — not by reading. It then went through an independent fact-check pass, which refuted eight
claims and flagged six as overstated; all of those are corrected here, and the corrections are
called out inline rather than quietly applied, because an audit that hides its own errata is not
worth more than the errata.

That pass was itself wrong once — it reported `spectrum-trim:` as having no resolver; it does,
`lib/core/resolve-spectrum.js:251`. Verified before rejecting.

## The finding: three vocabularies

| # | vocabulary | surface | count | registry | mechanism | gated |
|---|---|---|---|---|---|---|
| 1 | **Marpit directives** | front matter + `<!-- key: -->` | 22 | `lib/engine/directives.js` `KNOWN_DIRECTIVES` | applied to `<section>` as `data-<kebab>` + `--<kebab>` | key **no** |
| 2 | **Deck registers** | front matter only | ~14 | **none** — 13 register kernels among the 17 `lib/core/resolve-*` files, discoverable only by `ls` | mostly class tokens (`split:` divides the body, `captions:` yields narration data); baked into the document by `lib/core/deck-front-matter.js` for the runtime | value-linted, key **no** |
| 3 | **Body annotations** | `<!-- key: -->` only | 5 | **none** | consumed post-render by `lib/authoring/notes-core.js` / `lib/exemplars/tier-filter.js` | **no** |

Vocabulary 2 is invisible to vocabulary 1's parser, and **more invisible than it first looks.**
`parseFrontMatter` accepts any NON-HYPHENATED `key: value` line into its directive map
(`lib/engine/directives.js:113`, `/^([A-Za-z_][\w]*)\s*:/` — `\w` excludes `-`), and
`KNOWN_DIRECTIVES` filters only what gets applied as a section attribute. Reproduced:

```js
parseFrontMatter('---\ntheme: indaco\ncolor-mode: dark\nspectrum-edge: left\nfoo: bar\n---')
→ { theme: 'indaco', foo: 'bar' }        // color-mode and spectrum-edge are GONE
```

So the flagship register — `color-mode:`, which `resolve-color-mode.js:4` calls "the FIRST-CLASS way
to author" light/dark — never enters the engine's directive map at all, and neither do
`spectrum-edge:`, `spectrum-card:`, `spectrum-card-edge:`, `spectrum-trim:`, `motion-style:`,
`motion-speed:` or `logo-*:`. They work **only** because each kernel re-reads the raw front-matter
text with its own regex. Any future gate that enumerates keys via `parseFrontMatter` would therefore
certify a deck full of unregistered hyphenated keys as clean.

`spectrum:` is not a "directive" by the engine's own definition, yet:

```
render('---\ntheme: indaco\nspectrum: off\nstamp: dot\n---\n\n# T')
  base       →  <section id="1" class="content form">
  with keys  →  <section id="1" class="stamp-dot spectrum-off content form">
```

It is unambiguously load-bearing. It just has no registry entry anywhere.

## Vocabulary 1 — Marpit directives (22, registered)

`theme` `paginate` `header` `footer` `class` `color` `backgroundColor` `backgroundImage`
`backgroundPosition` `backgroundRepeat` `backgroundSize` `size` `style` `lang` `marp` `logo`
`focus` `focusStyle` `focusSteps` `build` `debug` `lens`

Sub-sets: `GLOBAL_ONLY` (4) — front-matter-only by nature. `APPLIED_DIRECTIVES` (16) — reach the
section. `FLAG_DIRECTIVES` (3) — may be written bare with no colon.

**This tier is healthy.** It has an explicit closed set, an enumerated rationale per entry, and the
parser leaves an unrecognized `<!-- foo: bar -->` as an inert comment rather than guessing. The one
gap is that nothing *lints* a misspelling: `<!-- pagniate: true -->` silently does nothing.

## Vocabulary 2 — Deck registers (kernel-backed, unregistered)

Named as a family in `lib/core/deck-front-matter.js:7`: *"the deck-wide registers: `color-mode:`,
`class:`, `logo:`, `meta:`, and the finish / mode / claim / stamp / tone / spectrum / rule /
eyebrow / headline / lift family."* Each has a resolver in `lib/core/`:

| register | what it controls | resolver |
|---|---|---|
| `color-mode:` | light/dark authoring — "the FIRST-CLASS way" | `resolve-color-mode.js` |
| `finish:` | the deck's backdrop | `resolve-finish.js` |
| `mode:` | the deck's rendering mode | `resolve-mode.js` |
| `spectrum:` (+ `-edge`, `-card`, `-card-edge`) | the accent gradient ribbon | `resolve-spectrum.js` |
| `stamp:` | deck-wide stamp style | `resolve-stamp.js` |
| `tone:` | deck-wide tone style (the marker SHAPE) | `resolve-tone-style.js` |
| `claim:` | how much of the frame the claim takes | `resolve-claim.js` |
| `rule:` | the heading underline | `resolve-rule.js` |
| `eyebrow:` | the eyebrow decoration | `resolve-eyebrow.js` |
| `headline:` | headline alignment | `resolve-headline.js` |
| `lift:` | "Struck" card elevation | `resolve-lift.js` |
| `split:` | how the body divides into slides | `resolve-split.js` |
| `captions:` | narration reference data | `resolve-captions.mjs` |
| `palette` / `component` / `token-expr` / `overflow-marker` | (not front-matter registers — resolvers for other precedence chains) | — |

**Why this tier exists at all** (`deck-front-matter.js` header, and it is a good reason): Marp
strips front matter cleanly, so a previewer rendering the deck without Lattice's plugins cannot see
these. The runtime used to recover them by `fetch`ing the source `.md` beside the rendered document
— which **never works on `file://`** (measured: 0 sections carried the deck's color mode when
double-clicking the exported HTML, the exact surface the export's README tells recipients to use).
The fix bakes the raw front matter into the document as an inert data block. So the registers are
not a shortcut; they are a deliberate, cross-path contract.

**What is missing** is only the registry. `ls lib/core/resolve-*` is the current enumeration.

## Vocabulary 3 — Body annotations (no home at all)

| annotation | corpus | what it is | consumer | status |
|---|---|---|---|---|
| `<!-- describe: … -->` | 5 | accessible description — what the slide SHOWS | `notes-core.js` `DESCRIBE_MATCHER` → PPTX alt text | structured, unregistered |
| `<!-- caption: … -->` | 4 | the slide's read-as line | `notes-core.js` `CAPTION_MATCHER` → read-along / WebVTT | structured, unregistered |
| `<!-- tier: … -->` | 553 | minimum tier at which the slide appears | `lib/exemplars/tier-filter.js` |
| `<!-- galleryAuthored: … -->` | 2 | "do not overwrite this hand-curated gallery" | `tools/build-bucket-galleries.js:73` | structured, unregistered, **and leaks** (below) |
| `<!-- note: … -->` | 11 | presenter talk track | — **no handler** | pure convention |
| `<!-- Speaker: … -->` | 3 | same | — **no handler** | pure convention |

`note:` and `Speaker:` are **not keys**. Any comment that is not a tooling pragma becomes a speaker
note, prefix and all:

```
notesFromHtml → "note: say this out loud\n\ntier: full\n\nSpeaker: hello"
```

## Validation table — how produced, why, how used, in what context

**The first cut of this table was wrong in five of thirteen rows** — it named a *consumer or reader*
as the *producer* (`PrintOptionsPanel` for `mode:`, `slide-size.ts` for `size:`, `share-export.ts`
for `captions:`, `rehearsal.js` for `tone:`, `ShareSheet`/`WebpageOptionsPanel` for `meta:`/`logo:`)
— and it claimed to be exhaustive while omitting ~14 keys. Corrected below, and the header no longer
overclaims. Producers verified by enumerating `writeFrontMatterLine` call sites.

### Front matter the Studio writes

All 23 come from `StudioShell.tsx` via `writeFrontMatterLine`, plus three others noted inline. Per
the standing rule every one is official:

```
color-mode  debug  eyebrow  finish  footer  header  headline  lang  lift  mode  motion
motion-speed  motion-style  paginate  rule  size  spectrum  spectrum-card
spectrum-card-edge  spectrum-edge  spectrum-trim  theme  title
```

plus `acronyms` / `lexicon` (`setFrontMatterAcronyms` / `setFrontMatterLexicon`) and `class`
(`front-matter.ts:304`).

| written | produced by | affordance | why | consumed by | context |
|---|---|---|---|---|---|
| `theme:` `size:` `paginate:` `header:` `footer:` `lang:` `debug:` `title:` | `StudioShell.tsx` (`size:` at `:1226`) | Deck Setup | the official Marpit directives | engine `directives.js` | every path |
| `color-mode:` | `StudioShell.tsx:1035` | light/dark toggle | "the FIRST-CLASS way to author" light/dark | `resolve-color-mode.js` | render + runtime |
| `finish:` | `StudioShell.tsx:1068` (deck) · `SlideContext.tsx:312` (per-slide token) | finish picker | deck backdrop | `resolve-finish.js` | render + runtime |
| `mode:` | `StudioShell.tsx:1073` | Deck Setup | rendering mode | `resolve-mode.js` | render + export |
| `motion:` `motion-style:` `motion-speed:` | `StudioShell.tsx:1079` + siblings | motion controls | animation policy | **`docs/src` only** — `parseDeckMotion` (`anima-host-sel.ts:68`), read by `DeckPreview.tsx` / `PlaygroundApp.tsx`. **Zero readers in `lib/`**, so an anti-rot check scanning `lib/` would prune three live keys | Present + export |
| `spectrum:` + `-edge` `-card` `-card-edge` `-trim` | `StudioShell.tsx:1087`–`:1113` (deck) · `SlideContext.tsx:314` (per-slide token) | Brand bar picker | the accent gradient ribbon | `resolve-spectrum.js` | render + runtime |
| `rule:` `eyebrow:` `headline:` `lift:` | `StudioShell.tsx` | typography / card controls | heading rule, eyebrow finish, headline alignment, card elevation | the matching `resolve-*.js` | render + runtime |
| `acronyms:` | `AcronymEditor.tsx:45` → `StudioShell.tsx:1252` | acronym editor | glossary expansion source | `glossary-auto.mjs`, `resolve-captions.mjs` | render + narration |
| `lexicon:` | `StudioShell.tsx:1248` | narration settings | pronunciation overrides | `resolve-captions.mjs:236 parseLexicon` | narration |
| `class:` | `front-matter.ts:304` | deck-wide class | deck-level component/modifier | `deckClassPropagate` | every path |
| `<!-- _class: … -->` | `slide-directives.ts:203 setClassTokens` | component picker / library | names the slide's layout | `directives.js` `parseCommentDirectives` → `applyDirectives`; `resolve-component.js` supplies the `content` default when none is named | every path |
| `<!-- caption: … -->` | `slide-caption.ts:39 setCaption` (emits at `:51`) | Slide Context → caption field | the slide's read-as line, top of the narration chain | `notes-core` → `share-export.ts` read-along, WebVTT | export + Present |
| `<!-- describe: … -->` | `slide-descriptions.ts:33 setDescription` (emits at `:43`) | Slide Context → description field | accessibility: what the slide shows | `notes-core` → PPTX alt text | export |

### A second producer this audit missed twice

`docs/src/playground/deck-config.js:301` is a **second live front-matter writer** (`writeFrontMatter`,
wired through `createConfigPanel` into the Playground's Deck Setup), and
`docs/src/lib/lente/registry.ts` is a **third** (`upsertLensRegistry`, emitting `lenses:`,
`lens-default:`, `lens-defaults:`). Between them they write at least `split:`, `glossary:`, `form:`,
`validate:`, `math:`, `lenses:`, `lens-default:` — **none of which appear in the list above.**

That is the same error twice: the first table enumerated producers from *consumers*, the correction
enumerated them from `writeFrontMatterLine`, and both times the method improved while the
exhaustiveness claim did not become true. Treat the list above as *"what `StudioShell` writes"* —
which is what it actually is — not as the product's producer set.

### Front matter the Studio does NOT write

`stamp:`, `tone:`, `captions:`, `meta:`, `logo:` are **author-authored**. The Studio only reads them
(`slide-provenance.ts:149,169` for `stamp:`/`tone:`; `share-export.ts:663` for `captions:`). The
per-slide `stamp-*` / `tone-*` class tokens ARE written by `SlideContext.tsx:444`, which is a
different thing from the deck register.

### What the Architect generates

**Not "none of it", which the first cut claimed.** `architect.ts` ships `generateDescription`
(system prompt `DESCRIBE_SYSTEM` at `:330`), wired at `SlideContext.tsx:249`, committing through
`setDescription` — so `<!-- describe: … -->` **is** AI-generated today, cloud tier, author-confirmed,
never auto-applied. The real gap is narrower: `architect-knowledge.js`, the whole-deck generation
dossier, teaches only `<!-- _class: NAME -->` and base modifiers, so generated decks carry no
`caption:` and no register.

## Defects this audit found

1. **`tier:` leaks into presenter notes.** `notes-core`'s tooling-comment allowlist covers prettier,
   markdownlint and remark-lint only, so every `tier:` marker falls through to the note channel.
   Verified on `exemplars/academic/research-findings.md`: the presenter-notes field is
   `"tier: short\n\ntier: short\n\ntier: standard\n…"`. 553 markers across the corpus, and
   `lib/export/pptx-export.js` defers to `notes-core` for the boundary, so this ships.
   **Not a one-line fix, as an earlier draft claimed:** `galleryAuthored:` leaks the same way
   (`lib/components/diagram/diagram.gallery.md:1` and `legal.gallery.md:10` both export their
   "do not overwrite" note as a presenter note), and so does the comment form of any hyphenated
   register — `<!-- color-mode: dark -->` silently does nothing AND lands in the notes field. The
   allowlist needs the structured pragmas as a set, and `galleryAuthored` is camelCase, which breaks
   any registry assuming the lowercase/kebab convention `directives.js` states for `lens`.
2. **Two shipping Studio files misdescribe their own contract.** `slide-caption.ts:8` and
   `slide-descriptions.ts:7` both say *"the engine consumes"* — `lib/engine/` has **zero**
   references to either. `notes-core`, a post-render layer, consumes them.
3. **The preview's route probe has no vocabulary to consult**, so it treats any `<!-- word: -->` as
   a running global and sends 53 of 175 decks through a whole-deck re-parse on every keystroke
   (#1333). This is a direct, measured cost of the missing registry.
4. **`note:` / `Speaker:` are undocumented convention** that produces a visibly wrong artifact — the
   prefix ends up inside the exported note text.
5. **Lint checks register VALUES but never KEYS.** `lib/authoring/lint-core.js` already ships 16
   value rules (`unknown-finish:1581`, `-mode:1606`, `-color-mode:1632`, `-claim:1692`,
   `-stamp:1718`, `-tone:1743`, the five `-spectrum*`, `-rule:1893`, `-eyebrow:1918`,
   `-headline:1943`, `-lift:1968`, `-split:2075`). Live check on a deck with `finish: atriumm` +
   `pagniate: true` + `sprectrum: off` → **one warning, `unknown-finish`**, silent on both bad keys.
   So the gap is the KEY, in both vocabularies — a misspelled directive silently does nothing and an
   unregistered register silently works. The first cut of this note said there was no lint at all,
   which understated what ships and overstated the work.

## Proposal

**One registry, three tiers, one gate.** The point is not to move everything into
`KNOWN_DIRECTIVES` — the three vocabularies apply by genuinely different mechanisms and merging them
would break the section-attribute contract. The point is that all three become **enumerable from one
place**, and every entry names its consumer.

1. **Declare the vocabulary** in `lib/engine/directives.js` (or a sibling it re-exports), adding two
   sets beside the existing three: `DECK_REGISTERS` (vocabulary 2, each naming its `resolve-*`
   kernel) and `ANNOTATIONS` (vocabulary 3, each naming its post-render consumer and its scope).
   Scope is the field the route probe needs, so #1333 becomes a lookup rather than a regex.
2. **Register the body annotations properly**: `describe`, `caption`, `tier` get entries; `note` and
   `Speaker` collapse into one real key with the prefix stripped from the note body.
3. **Gate it** — `checkAuthoringVocabulary` in `tools/check-ownership.js`, via `build:check`, in the
   shape of the existing `SANCTIONED_*` gates: every `key:` in front matter or a `<!-- key: -->`
   across `examples/`, `exemplars/`, `lib/components/**` must be registered, **and** every
   registered key must have a live consumer — so the registry cannot rot in either direction.
4. **Lint it** in `lib/authoring/lint-core.js` (HARD RULE #7 — one place), so an author writing
   `pagniate:` is told rather than ignored.
5. **Teach the Architect** the registered annotations, so generated decks can carry alt text and
   captions.

### Open questions for the human

- **Migration of `note:` / `Speaker:`** — collapsing them into one key changes what 14 existing
  slides export. Rewrite the decks, or accept both spellings permanently?
- **`player:` and `present:`** appear in front matter with no traced consumer. (`meta:`, `form:` and
  `glossary:` were on this list and should NOT have been: `meta:` →
  `lib/forms/tile/meta/meta.transform.js:39`, `form:` → `plugins.js:619 readFormMode` plus a
  `retired-form-minimal` lint rule, `glossary:` → `glossary-auto.mjs:37` — which this note's own
  validation table already named as a consumer. The error's root cause is worth more than the error:
  the enumeration surface was `ls lib/core/resolve-*`, which structurally cannot see
  `lib/forms/**`, `plugins.js`, or `glossary-auto.mjs`. "~14 deck registers" is an artifact of where
  this note looked.) Each needs tracing individually before it is
  registered or pruned — deleting one silently breaks a deck, so this is not a bulk decision.
  (`mode:` and `lexicon:` were on this list in the first cut and should NOT be: `resolve-mode.js`
  exists, and `lexicon:` is parsed by `resolve-captions.mjs:236 parseLexicon`.)
- **Should `parseFrontMatter` learn `-`?** Hyphenated register keys are dropped by the parser today
  and read by each kernel instead. Making the parser hyphen-aware would unify the two vocabularies'
  entry point; leaving it would mean the registry is two lists with two readers. This decides the
  shape of the gate.
- **Scope**: registry + gate + lint is one PR; the Architect work is a second. Confirm the split.
