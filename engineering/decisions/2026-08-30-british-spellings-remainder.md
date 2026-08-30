---
status: shipped
summary: >
  HARD RULE #21 says the tree is swept but not zero, and deliberately declines to restate a
  total — the tool that measured the original 71 was deleted with the ratchet. This is the
  fresh instrument and the fresh count: `britishFormRe()` over `listRepoTextFiles()`, TRACKED
  files only, the same matcher applied to both trees. In living surfaces — outside the map,
  its tests and the changelog fragments about them — it counted 84 before and 30 after. Of what
  remains, 75 sit in a changelog archive an earlier decision froze, and the 30 living ones are
  each named here with the reason they stay. Two findings came out of the pass rather than the
  count: `quote.docs.md` is GENERATED, so the edit was reverted by the next
  build and the real source was `tools/ascii-preview.py`; and `.py` is not in the walk's
  extension list, which is why a British spelling could sit in that source while being
  visible in two files built from it.
---

# The British spellings that stay, and why

## The question

HARD RULE #21 retired the `checkUsEnglish` ratchet when the backlog hit zero, and says in
terms that **swept is not zero**: spellings remain on purpose — data we must keep accepting,
a lockfile, dated filenames, mentions in tests and in the rule itself. It also refuses to
carry a running total, because the instrument that produced the original 71 was deleted with
the ratchet and a fresh number needs a fresh instrument.

So the remainder was invisible: nothing gated it, nothing counted it, and nobody could tell a
deliberate spelling from one nobody had noticed. This note is the count and the split.

## The instrument

`britishFormRe()` from `tools/us-english.js`, over `listRepoTextFiles()` from
`tools/check-ownership.js`, restricted to files `git ls-files` reports, plus tracked `.py`
(see § The walk cannot see Python). The CURRENT matcher is applied to BOTH trees, so a pair
this branch added to the map counts on each side and the columns differ only in content:

| | base (`94bb951`) | after |
|---|---:|---:|
| total | 482 | 465 |
| — the dialect map, and writing about it | 323 | 360 |
| — `changelog/pre-release-archive.md`, frozen | 75 | 75 |
| — **living surfaces** | **84** | **30** |

**Tracked files only, and that restriction is load-bearing.** A first version measured the base
in a `git worktree` and the head in the working tree — so the head column counted
`docs/public/playground/lattice-playground.js`, a gitignored build artifact the worktree never
had. Two columns, two file sets. Anyone re-deriving on a clean checkout or in CI would have got
different numbers and found one fewer row in the table below. `listRepoTextFiles` documents this
hazard at length for `playground/v` and `playground/hljs`; `docs/public/playground/*.js` is not
on its skip list.

**The gross total barely moves, and the machinery column goes UP.** Both are the same fact: a
British-to-American map is a list of British words, so `tools/us-english.js` alone is 246 hits,
its tests another 71, and this branch adds two pairs, a second test file, two decision records
about spelling and five changelog fragments. The living number is the only one that means
anything, and it is the only one stable under further writing: **84 → 30**.

**Getting those two columns comparable took three tries, and the first two were wrong.** The
first handed the live `listRepoTextFiles` a foreign directory — and that function derives every
skip from `path.relative(ROOT, p)` against its OWN module root, not the `dir` it was passed, so
it walked `engineering/decisions/**`, which it exists to skip, and reported 869 living hits
instead of 84. Nothing in the repo calls it that way today, so it is a latent footgun rather
than a live defect (#18: found, not caused, off-path) — but a cross-tree measurement must
require each tree's own copy. The second try fixed that and still compared a worktree against a
working tree, which is the untracked-artifact problem above. Three attempts at one number, in a
note whose subject is claims nobody re-derives.

## The three-way split

**The living count fell by 54, from 59 edits.** The edit list is 59 British forms on removed
lines across 38 files: 55 across 35 tracked non-Python files, 3 in the two Python files the walk
cannot see, and 1 in `quote.docs.md` — a GENERATED file whose change the next build reverted
before fixing its source in `tools/ascii-preview.py` produced it again. Five of the 59 are in
changelog fragments, which this measurement counts as writing about the map rather than house
prose, which is why 59 edits move the living column by 54. One cluster carries most of it: `modelled` and
`modelling` across the contrast oracles (`tools/composed-contrast.js`,
`check-player-contrast.js`, `check-slide-contrast.js`), their tests, two changelog fragments
and four exemplar decks. The rest are `catalogued`/`cataloguing` in `design/concepts.md`,
`design/forms.md`, `spec/LFM-1.0.md` and three tools; `signalled` in `lib/core/relationship.js`
and `docs/src/pages/suono.astro`; `minimisation` in the state-chart tests; `behaviourally` in
a docs script; and `organisations` in two decks. The exemplar decks are US-set — a wildfire
policy briefing already writes "30-meter" — so nothing there was in-voice British.

**75 sit in `changelog/pre-release-archive.md`, which an earlier decision froze.** That file's
own header says it: *"Entries keep their wording and their order… A correction belongs in a new
entry, never here."* It is the pre-1.0.0 development log, moved out of `CHANGELOG.md`
verbatim (#1735). Sweeping it would edit a record whose value is that it was not edited.

**30 are in living surfaces, across 16 files, and every one is deliberate.** They are listed below rather than
summarized, because a future sweep needs to be able to check its own work against a list, and
because the last sweep that rewrote three of these shipped a dead CI allowlist, an unresolvable
map region and a tautological test — all three caught by review, none by a gate.

| Where | × | Why it stays |
|---|---:|---|
| `.github/workflows/ci.yml` | 5 | GitHub's own `cancelled` conclusion enum. The file already carries "NOTE THE SPELLING" above it; renaming it makes the allowlist dead and inverts its branches |
| `docs/package-lock.json` | 4 | The `@img/colour` package name and its registry URL |
| `BACKLOG.md` | 3 | Generated mirror of GitHub issues (`sync-backlog.yml`). Two are #578's title, which is *about* renaming `progress-centre`; one is #1375's `neighbours`. Hand-editing a generated view changes nothing |
| `tools/check-ownership.js` | 3 | Quotes third-party language keywords by name — Mercury's `initialise`/`finalise`, pgsql's `analyse` — in the comment explaining why the hljs grammars are skipped |
| `tools/intent-bakeoff/queries-adversarial.json` | 3 | A pre-registered benchmark fixture. `organisation chart`, `prioritising`, `summarise` are the British inputs the adversarial set exists to probe |
| `docs/src/lib/intent-search.ts` | 2 | `organisation: 'organization'` is a synonym KEY an author might type. The second hit is the comment recording that an earlier sweep rewrote this key and made it unreachable |
| `lib/components/chart/map/map.basemap.world*.json` | 2 | Generated basemaps carrying the OECD alias |
| `tools/build-basemap.world.js` | 1 | The OECD's real legal name, `organisation for economic co-operation and development` |
| `design/theming.md`, `lib/base/base.docs.md`, `lib/theme/cvd.js` | 3 | All cite the dated filename `engineering/decisions/2026-06-16-colour-blindness-accessibility.md` |
| `docs/src/lib/intent-search.test.ts` | 1 | Asserts that `prioritising` and `prioritizing` rank the same components |
| `test/unit/parsing/resolve-headline.test.js` | 1 | A deliberate mention: "This used to be the British `centre`" |
| `test/unit/export/html-player.test.js` | 1 | A deliberate mention: a one-word prose fix, `analogue` → its US form, moves the built artifact |
| `tools/intent-bakeoff/pick-surface-briefs.json` | 1 | `favour` in the fixture's own `_design` note. Editing it cannot change a score, but the file's whole claim is that it is unchanged since pre-registration, so it is left alone |

That is the whole 30. Nothing in it is a backlog.

**Two more are real and are not counted**, because the instrument cannot see them the same way
on both sides. `changelog.d/578-progress-center-rename.changed.md` carries `progress-centre`
twice — it records the rename *from* that name, so the old spelling is the entry's subject —
and it falls in the changelog-fragment bucket this measurement treats as writing about spelling.
`docs/public/playground/lattice-playground.js` carries `organisation` twice as the built bundle
of the synonym key below it, and is gitignored. Named here so nobody re-finds them and files
them as a miss.

## The identifiers, which the word count could not see

HARD RULE #21 says a British spelling buried in a `camelCase` identifier "rides on review,
so name those US too", and nothing had ever looked. A word-boundary scan cannot: `offences`
inside `sectionBoxOffences` is not a word to a `\b`-anchored matcher.

Splitting every token on case and underscore boundaries and testing each segment found
**six** identifiers across the tree. Five are `Offences` in `tools/check-ownership.js` and
its test — `sectionBoxOffences`, `sectionCqOffences`, `rootOnlyAnchorOffences`,
`classAttrOffences`, `offencesFor`, 65 sites — and they are renamed here.

The sixth stays: `_emphasised_` at `test/benchmark/engine-bench.mjs:218`. It is not an
identifier at all — it is markdown emphasis inside `CALIBRATION_DOC`, the pre-registered
document whose bytes the benchmark baseline is measured against (HARD RULE #19), and #21
names a benchmark fixture as an external string a pass must not touch. Rewriting it would
re-scale a calibration index for a spelling nobody reads.

`test/unit/tools/us-english-stem-audit.test.js` now asserts this directly, so the ride is
over. It is a separate arm from the stemming audit and has to be: `offences` is IN the map,
so the audit — which reports only what the map CANNOT see — skips it by construction. That
was worth learning the hard way; a first version of this work claimed the tokenizer change
closed the hole, and reintroducing `sectionBoxOffences` left the suite green.

It scans **code extensions only**. Prose has no identifiers of its own — a `.md` naming
`sectionBoxOffences` is quoting one, and the file that declares it is already in scope. The
unscoped version failed on the changelog fragment describing the rename it had just made,
which is the shape of every self-reference defect on this branch: an instrument that reads
the whole tree eventually reads the writing about itself.

## `quote.docs.md` is generated, and the build said so

`lib/components/statement/quote/quote.docs.md` held `the centre of the slide."` inside an
ASCII anatomy box. Editing it worked, and the next `npm run build` put `centre` back — because
every `<name>.docs.md` is generated from its manifest by `tools/build-component-docs.js`, and
the anatomy block comes from `tools/ascii-preview.py` through `tools/anatomy-catalog.js` so
that the reference page, `dist/docs/components.md` and the docs site all render one source
(#1, #2). The fix is one line in the Python catalog; the three generated copies follow.

This is worth recording because the *symptom* pointed at the wrong file. A sweep that greps
for a word finds the copy, not the source, and a build that silently reverts the edit is the
only thing that tells you which one you touched.

## The walk cannot see Python

`listRepoTextFiles` carries `US_TEXT_EXTS`, an extension list built for a different gate, and
`.py` is not on it. Two Python files are tracked, and both held house prose in British:
`tools/ascii-preview.py` (the caption above) and `design/logo/generate.py` (`colour` twice in
its docblock). The first is the sharper case — its text was visible in two generated files
while its source was invisible to the instrument that would have flagged it.

The fix is scoped to the audit rather than to the walk.
`test/unit/tools/us-english-stem-audit.test.js` now reads tracked `.py` on top of
`listRepoTextFiles()`. Widening `US_TEXT_EXTS` itself would also point HARD RULE #29's typed-glyph
gate at `ascii-preview.py`, which is 600 lines of box drawing — a gate aimed at an ASCII-art
file, for no gain on the question either rule is asking.

**What is still uncovered is every extension on neither list.** That is stated rather than
fixed: the honest scope of this count is `US_TEXT_EXTS` plus `.py`, and a spelling in a `.sh`,
a `.toml` or a `.txt` is outside it.

## The rebuilt PDFs, and what the golden diff actually reported

Six deck sources changed by a word, so the pre-commit hook rebuilt seven committed PDFs and
CI's golden diff reported **9 changed slides across 7 decks**. Seven of those nine are this
change. The other two — `budget-proposal` pages 5 and 9 — are **pre-existing drift on `main`**,
and the number is worth the check it took to establish.

Rendering the base tree's own source with the base tree's own `dist` gives a PDF that differs
from the *committed* base PDF on exactly those two pages, by exactly the pixel counts the head
render differs by (22,594 and 20,229). So the committed PDF was already stale before this
branch existed; rebuilding it for a word change surfaced someone else's drift. The pixels are
three `ON PLAN` status pills and a decorative sparkle — not text.

The cause is structural and documented in `lefthook.yml`: `pdf-rebuild` is markdown-scoped,
because "component CSS / shared CSS / engine changes affect many decks at once". Those go to
`build:galleries:check`, which covers galleries — the exemplars are not galleries. Rendering is
deterministic (two renders of one source are pixel-identical, verified), so this is staleness,
not noise.

Logged, not fixed: it is not caused by this branch and lives outside its diff (#18,
found-not-caused, off-path). What a fix would look like is a freshness check for
`exemplars/**` and `examples/**` on the model of `build:galleries:check` — which is a CI-contract
change, so it is somebody's decision rather than a thing to slip in here.

## Removable when

The table is removable when its rows are, one at a time. A row goes when the reason goes —
GitHub renames its enum, the OECD changes its legal name, a fixture is re-registered, a
generated file stops being generated. The note itself stays: its job is to let the next sweep
tell a deliberate spelling from an unnoticed one without re-deriving fifteen judgment calls,
which is the work that produced three regressions the last time nobody had the list.
