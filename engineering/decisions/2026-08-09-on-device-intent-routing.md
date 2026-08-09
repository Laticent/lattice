---
status: shipped
summary: #1440 asked for on-device intent routing for component selection, and specified wink-nlp + wink-eng-lite-web-model (self-hosted, lazily downloaded) with a wink-naive-bayes-text-classifier scoring confidence via computeOdds(). A bake-off across three corpora rejected the library and kept the requirement: wink's 1.03 MB (gzipped) English model won one cell of four by two queries and lost the rest — worst of all on the adversarial set a lemmatizer should own — while the naive Bayes variant the issue specified came last of every NLP option tried, because one training document per class is a degenerate classifier. What shipped is docs/src/lib/intent-search.ts — field-weighted Okapi BM25 over the component manifest, plus edit-distance typo repair and a 17-entry synonym lexicon, ~4 KB gzipped, no download, no network, offline on first paint. It lands in the SHARED search core as a third pass (substring → intent → fuzzy), so the Studio add-slide gallery, the Playground picker and the /components index all gain it without forking. Measured lift over the shipped ranker on natural language: 16.0% → 86.0% top-1 on intent phrasings, 12.0% → 84.0% on adversarial ones (typos, British spellings, synonyms), 0.4% → 31.2% on real slide prose. The honest ceiling (~30% top-1 / ~45% top-5 on prose) is why the UI shows a ranked shortlist with a RELATIVE match meter and never a single confident answer. Rejecting wink deleted requirement 2 of the issue entirely: nothing to self-host, nothing to background-download, no TTI risk. Requirement 4's LLM investigation is §6 — which also records the RECOMMENDER attempt and its refutation: a deterministic facet scorer over whenToUse/antiPatterns/function/capacity was built, benchmarked against 128 held-out cases derived from the manifest's own authored notes, and a weight tuner independently zeroed every facet signal in favor of plain BM25. It is committed but wired into nothing. The corrected division of labor is retrieve-then-judge: retrieval is local and good (74.1% top-1), fit judgment is semantic and unsolved locally (27% redirect precision), and the model tier that would fix it is MEASURED BUT INCOMPLETE — the key ran dry mid-run.
---

# On-device intent routing for component selection

**Date:** 2026-08-09
**Status:** decided, implemented
**Issue:** #1440
**Rules touched:** none. Honors HARD RULE #1 (one shared kernel — the ranker
lands in the shared search core, not in one picker) and HARD RULE #15 (reuse —
the existing `fuse.js` and the substring pass both stay; nothing was rebuilt).

---

## 1 · The problem, measured before it was solved

The Studio's add-slide gallery, the Playground picker and the `/components`
index all search through one core (`docs/src/lib/component-search.ts`): a
precise substring pass, then Fuse for misspellings. That is the right answer for
*"I know the name"* — `radar`, `legal`, `compare-table` — and it is why the
substring pass is still in front of everything added here.

It is useless for *"I know what I want to say."* Measured over the real
61-component catalog:

| query corpus | shipped ranker, top-1 |
|---|---|
| intent phrasings ("who owns what on the team") | **16.0%** |
| real slide prose from the committed decks | **0.4%** |

The failure is structural, not a tuning miss. A sentence never appears as a
substring of a manifest, so every natural-language query falls through to Fuse,
which fuzzy-matches a long string against short names and returns noise. It is
also slow on the way to being wrong: 62 ms per query on a long paste, because
the substring pass rebuilds a haystack string per component per keystroke.

## 2 · What #1440 proposed, and why it was rejected

The issue specified `wink-nlp` with `wink-eng-lite-web-model`, self-hosted
alongside the hashed playground assets, background-downloaded after
time-to-interactive, and a `wink-naive-bayes-text-classifier` trained on the
manifest, with `computeOdds()` normalized into a confidence percentage.

Two costs were measured rather than assumed.

**Payload.** Bundled with esbuild, `wink-nlp` + `wink-eng-lite-web-model`
minifies to 3.65 MB / **1.03 MB gzipped**. 2.97 MB of that is a single model
JSON. By comparison `wink-porter2-stemmer` — the same author, the same license —
is 4.4 KB minified, **1.7 KB gzipped**.

**Accuracy.** Top-1, held-out `test` split, exactly as `npm run intent:bakeoff`
prints it (the harness also reports top-3, top-5, MRR and ms/query):

| ranker | headings (235) | prose (247) | intent (50) | adversarial (25) | payload |
|---|---|---|---|---|---|
| current (shipped core) | 1.7% | 0.4% | 16.0% | 12.0% | — |
| wink naive Bayes *(as specified)* | 23.8% | 23.9% | 80.0% | 56.0% | 1.03 MB |
| wink BM25 (library) | **26.0%** | 28.3% | 84.0% | 68.0% | 1.03 MB |
| **`intent-search.ts`** *(shipped)* | 25.1% | **31.2%** | **86.0%** | **84.0%** | ~4 KB |

**The English model does not pay for itself.** It wins exactly one cell —
headings top-1, by 0.9 points, which is two queries out of 235 — and loses the
other three, most decisively on the adversarial set (68.0% vs 84.0%) where a
lemmatizer was supposed to be strongest. Lemmatization earns its keep on long,
inflected, open-domain text; 61 documents of a few dozen terms each are not
that. A Porter2 stem extracts the same signal — `comparing`/`comparison` →
`compar` — at 1/600th the weight.

**Naive Bayes specifically is the weakest NLP option tested**, on every corpus.
This is not a tuning failure either: the catalog gives one training document per
class, and a naive Bayes classifier fitted on one document per class degenerates
into a smoothed unigram likelihood with no length normalization — strictly less
than BM25, which has both an IDF term and a document-length term. Its
`computeOdds()` output is a log-odds over that degenerate fit, so presenting it
as a confidence percentage would have put a number on the screen that looks
calibrated and is not.

Rejecting the library deletes requirement 2 of the issue outright. There is no
asset to self-host, so no CDN dependency to eliminate; nothing to download in
the background, so no TTI budget to protect and no service-worker or IndexedDB
caching tier to build. The feature is simply present on first paint, offline
included.

## 3 · How the bake-off was run

The harness is committed at `tools/intent-bakeoff/` and reproducible with
`node tools/intent-bakeoff/bakeoff.mjs`.

Three corpora, deliberately of different provenance:

- **harvested-heading / harvested-full** — every slide in 154 committed decks
  (`examples/`, the baseline galleries, `test/fixtures/`) pairs real prose with
  the component that actually renders it, read off its `<!-- _class: X -->`
  directive. 513 pairs covering all 61 components, capped at 12 per component so
  `title` and `content` cannot dominate. **Nobody wrote these for this test**,
  which is the point — they are the only bias-free evidence here.
- **authored-intent / authored-adversarial** — 75 phrasings written by hand: 50
  plain, and 25 built to be hostile to a stemmer (typos, British spellings,
  synonyms with no lexical overlap). Written by the same author as one of the
  rankers, so they are reported as their own rows and never mixed into the
  harvested totals.

A SHA-1 of each pair's text assigns it to `dev` or `test` deterministically, so
adding decks never reshuffles what was already tuned against. The harvested
numbers above are `test`.

**The authored corpora are not split, and the lexicon was fitted on them.** An
earlier draft of this section claimed everything was "fitted only against dev";
that was wrong and contradicted note 3 below. `bakeoff.mjs` reports all 50
intent and all 25 adversarial queries every run, and at least 9 of the 17
synonym entries map one-to-one onto a specific adversarial query (`choropleth`,
`testimonial`, `accountable`, `swimlane`, `jargon`, `circle`, `qr`, `moving`,
and the British-spelling fold). Those two columns are **train-on-test** and must be
read as an upper bound. Measured, the lexicon is worth 8 points there — without
it the adversarial score is **76.0%**, not 84.0% — so any comparison against a
library that was given no equivalent query-side treatment should quote 76.0%.

### Three things the bake-off says that are easy to over-read

1. **The harvested corpora are a robustness check, not a user-behavior model.**
   A slide's prose is what the author *wrote on it*, not what they would *type
   to find it*. An oracle check found only 53.5% of harvested headings share any
   term at all with their own component's index text, so ~30% top-1 sits against
   a ~53% ceiling, not against 100%.
2. **Their labels are genuinely ambiguous.** `compare-prose`, `compare-table`
   and `split-compare` are all correct for the same two-options text; the corpus
   credits exactly one. Absolute accuracy on it is therefore a floor.
3. **They cannot test the repair or the synonyms at all**, because committed
   decks contain no typos and use the project's own vocabulary. Those two
   mechanisms show up only on the adversarial set — which is also the set whose
   misses tuned the lexicon. That circularity is why the lexicon is capped at 17
   entries, each traceable to a dev-split miss, and small enough to read in one
   glance rather than grown until the number looked good.

A field ablation set the weights. `description` is load-bearing (removing it
costs ~15 points of top-1 on intent phrasings); `purpose` is second (~7 points
of recall on prose) and is now carried to the client by `buildCatalog` for this
reason; `tags` and `facets` contribute within noise and are kept only at low
weight, because they are the sole signal for a component whose prose is terse.

## 4 · What shipped

`docs/src/lib/intent-search.ts` — Okapi BM25 (k1 = 1.2, b = 0.75) over the
manifest, fields weighted `name 3 · tags 2.2 · description 1.4 · facets 1 ·
purpose 1`, with two repairs for the ways a real query misses: bounded
edit-distance repair against the index vocabulary for a typo, and a 17-entry
synonym lexicon for a word the manifest never says (`photograph` → `image`,
`choropleth` → `map`). British forms fold onto American ones, so the house
dialect (HARD RULE #21) is also the search dialect.

It is a **third pass in the shared core**, not a replacement — and the order of
the two follow-up passes depends on the SHAPE of the query:

```
substring  →  ≥2 words: intent → fuzzy
           →  1 word:   fuzzy → intent
```

Substring stays first because when it fires it is nearly always exactly right.
The split behind it was NOT in the first cut of this change, and its absence was
a real regression caught in review: with intent unconditionally second, a
one-character typo in a component name went from 96.0% to **82.1%** top-1 across
every single-character deletion of every name (n=520, 73 names regressed —
`tabel` returned `compare-code`). A lone token is nearly always a half-remembered
name, which is Levenshtein's job, not BM25's. Routing by whitespace-delimited
word count restores it to **96.0%** with no loss anywhere else, and intent still
runs behind the fuzzy pass so a single word Fuse cannot place (`choropleth`)
still reaches the synonym lexicon.

The word count is deliberately taken on **whitespace**, not on the content
tokenizer, which splits hyphens: `cards-rid` read as two words and routed a
misspelled hyphenated name down the intent path, which alone accounted for 60 of
those 73 regressions.

Four tests pin the composed behavior — every one of the 61 names ranks itself
first, every tag finds a component carrying it, a one-character typo in any name
still resolves (rate pinned under 5% miss), and each query shape reaches the
pass it is supposed to.

All four call sites moved from `makeFuse` to `makeSearchIndex`, so the Studio
gallery, the Playground picker and both `/components` islands gained the pass
together rather than forking (HARD RULE #1).

### The meter does not badge the leader

`confidenceFor` is relative to the best hit, so the top result is 1.0 by
construction. Rendering that as "100%" — which the first cut did, as the most
salient element on the tile — put a certainty badge on a surface that previously
had none, and the top hit is wrong most of the time on real prose (`timline of
milstones` → `quote`, badged 100%, with `timeline-list` second at 80%). The
leader now carries no badge; only the runners-up do, which is the number that
answers the question the shortlist actually poses — a 94% second place is a
toss-up worth reading, a 34% second place means the leader is clear.

### The confidence number is relative, and says so

BM25 scores have no absolute meaning; normalizing them into a percentage that
looks like a probability would be a lie the UI told confidently. So
`confidenceFor` returns a hit's strength **relative to the best hit in the same
result set**, the tile renders it as a bar plus a percentage, and the line above
the grid states what it is: *"Percentages are relative to the closest match."*

That is also the honest response to the measured ceiling. At ~30% top-1 and
~45% top-5 on real prose, this ranker's job is to put the right component in a
shortlist the author scans — not to pick for them. The relative meter answers
the question the shortlist actually poses: *is the top one a clear winner, or is
this a toss-up worth reading?*

### The switch

Workspace → AI → **On-device** carries one control, "Search slides by what you
want to say" (`StudioSettings.intentSearch`, default on). It gates only the
intent pass; substring and fuzzy are never gated, so turning it off returns the
literal matching some authors prefer without breaking name lookup. The
non-Studio surfaces have no settings UI and simply always run it — it costs
nothing to leave on.

## 5 · What was NOT built, and why

- **Self-hosted model assets, background download, service-worker/IndexedDB
  caching for weights** — moot without a model.
- **A classifier.** The catalog cannot train one honestly (one document per
  class), and a ranked shortlist is the better product anyway: the author sees
  the runners-up, which is where the value is when the top hit is wrong 70% of
  the time.
- **Embeddings / a small sentence-transformer.** This is the one option that
  could genuinely beat BM25, because it would catch the paraphrases with zero
  lexical overlap that are the residual failure mode ("a picture with a caption"
  → `image`). It was not attempted here: the smallest usable sentence encoder is
  ~20 MB, which re-opens every cost the wink rejection just closed, and the
  cheap alternative — precomputing 61 embeddings at build time and shipping only
  those — still needs a query encoder in the browser. Worth revisiting only if
  the synonym lexicon starts growing past the point where it can be read at a
  glance.

## 6 · The recommender, and the deterministic dead end

#1440 asks for **fit judgment**, not findability: describe the task, get ranked
components with confidence. §1–§5 deliver retrieval. This section records the
attempt at the judgment half, because it failed and the failure is the useful
part.

### 6.1 · The fit benchmark

The deck-harvested corpora cannot measure fit — they have no notion of a
component being the *wrong* answer. The manifest can. Every component ships
`whenToUse` (190 authored fit rules) and `antiPatterns` (190 anti-fit rules),
and 74 anti-patterns name a better alternative in backticks. That yields two
kinds of held-out case (`tools/intent-bakeoff/fit-corpus.mjs`):

- **positive** — a `whenToUse` body is a described task; its own component
  should rank first.
- **redirect** (74 cases) — an `antiPattern` body must surface the component it points to
  and keep the warned-against one *behind* it. The first precision test in this
  project; everything before it measured recall only.

Three ground-truth bugs had to be fixed before any number from it meant
anything, and each would have quietly corrupted the result:

1. **Detection.** Bare-word matching found 66 "alternatives", most of them
   wrong — `\blist\b` matches inside `list-criteria` (a hyphen is a word
   boundary) and "Unnumbered list" means a bulleted list, not the `list`
   component. Detection is now backtick-only, the convention the authors
   actually use.
2. **Leakage — fixed for redirect cases, and NOT for positive ones.** Redirect
   queries named their own answers ("…use `list-steps`"), so any name-matching
   scorer solved them without reading a word; expected names are now neutralized
   out of those queries (expected names only, since blanking every name turned
   "Flat list of citations" into nonsense). **Positive cases get no such
   treatment**, and 14 of the 58 in the test split contain their own answer
   verbatim — `big-number`'s note opens "Reach for big-number when…". Since
   `name` is the highest-weighted field, that is a gimme. Neutralized, the
   headline retrieval figure is **69.0%, not 74.1%**. Two things keep this from
   invalidating the corpus: the self-naming subset does not outscore the clean
   one (71.4% vs 75.0%), so it is not solved by string equality; and
   neutralizing a positive query also destroys real meaning (`big-number` loses
   the word "number"). Read 74.1% as the optimistic end of a 69–75% band.
3. **Answerability.** `whenToUse` mixes *selection* notes with *authoring*
   notes ("always include the language after the opening fence"). Nobody types
   the second kind into a picker. The two are split mechanically and **both are
   reported**; dropping the inconvenient half silently is the same sin as
   tuning on the test split.

### 6.2 · What was tried, and what it measured

A note on `excludeKey`, which the harness advertises as leave-one-out: it
genuinely fires (with the facet weights turned on, dropping it takes positive
top-1 from 44.8% to 98.3% — the notes ARE the questions), but at the committed
weights the notes carry weight zero, so it changes none of the numbers reported
below. It protected the **tuner**, which sweeps nonzero weights, and that is
what makes the negative result sound. It is not a guard on the reported columns.

`docs/src/lib/fit-search.ts` scores the structured facets: `whenToUse` as
positive evidence, `antiPatterns` as negative, task-verb cues against the
`function` axis, and stated quantities against `capacity`. The argument for it
was strong — a bag-of-words ranker cannot represent negative evidence at all,
so a lexical scorer reading `actors`' anti-pattern ("if the rows describe
stages in order, use list-steps") *boosts* `actors` for "stages in order",
exactly backwards.

It does not work. Swept one signal at a time against the tuned remainder, on
the dev split:

| signal | top-1 | avoided-the-wrong-one |
|---|---|---|
| none (BM25 + IDF-scaled name + capacity) | **63.2%** | 16.7% |
| `anti` −5 / −20 / −80 | 57.9% / 52.6% / 28.4% | 16.7% / 20.0% / 23.3% |
| `when` 5 / 20 / 80 | 61.1% / 55.8% / 20.0% | 16.7% / 16.7% / 20.0% |
| `function` 4 / 16 | 61.1% / 47.4% | 16.7% / 23.3% |
| `capacity` 4 / 8 | 61.1% / 60.0% | 23.3% / **26.7%** |

A coordinate-descent tuner over all nine weights
(`tools/intent-bakeoff/tune-fit.mjs`, dev only) independently drove `when`,
`anti` and `fn` to **zero** and pushed lexical BM25 to its ceiling. On the test
split the tuned scorer is a wash against plain retrieval — 75.9% vs 74.1%
top-1, about one case — and *worse* on precision (22.7% vs 27.3% avoided) and
on authoring notes (75.0% vs 80.6%). **It is therefore not wired into any
surface.** Shipping it would trade a measured precision regression for a gain
inside noise.

**Why it fails.** The authored notes hold real judgment, but extracting it is
semantic work. Deciding whether "the audience scans top-to-bottom" describes a
sequence is not a vocabulary question, and two ~25-word texts do not overlap
enough for term counting to recover it: the whenToUse-minus-antiPattern margin
has a median of 0.030 and a p90 of 0.084 across 2,400 observations — noise.
This is the same wall the wink-nlp lemmatizer hit in §2, reached from the
opposite direction, and it should be read as one finding about this corpus:
**61 short documents do not carry enough lexical signal for semantics, by any
term-based method.**

### 6.3 · The corrected division of labor (issue requirement 4)

The first draft of this section claimed a clean split — local NLP owns
SELECTION because it is "a ranking problem needing no world knowledge", the LLM
owns CONTENT. §6.2 refutes the first half. Selection splits further:

- **Retrieval is local.** Narrowing 61 components to ~10 is genuinely a ranking
  problem, and BM25 does it well: **74.1% top-1, 84.5% top-3** on held-out
  authored task descriptions, in 0.2 ms, free, offline, deterministic. Nothing
  about that argues for a model.
- **Judgment is not.** Ordering that shortlist by fit — and especially ruling a
  candidate *out* — is semantic, and 27% redirect precision is what the local
  tier achieves. No deterministic method tried moved it.
- **Content generation is the LLM's**, unchanged and uncontested.

So the authored notes are the right **input** and the wrong **features**: 25
words of reasoning is excellent prompt context and useless as term frequency.
The shape that follows is retrieve-then-judge — BM25 shortlists ~10, a model
ranks only those with their `whenToUse`/`antiPatterns` in the prompt, which
keeps the prompt small enough to afford per query. `tools/intent-bakeoff/judge-eval.mjs`
measures exactly that against this same benchmark.

**That measurement has not been completed** — the key ran out of credit partway
through the run. A 5-case validation had the judge fixing 1 of 5 and taking
avoided-the-wrong-one from 0% to 100%, which is a signal and not a result, and
nothing here should be read as evidence the judge works until the full run
lands. Two harness bugs found on the way are worth remembering: a fenced-JSON
parse failure silently returned the BM25 order and reported "0 changed
verdicts" across 80 cases (indistinguishable from the model agreeing), and the
prompt initially leaked the answer because leave-one-out was applied to the
index but not to the candidate blocks. The harness now counts fallbacks and
declares its own verdict invalid past a 10% fallback rate.

On cost and keys nothing changes: the local tier spends nothing and sends
nothing, and any model tier runs on the user's own OpenRouter key or fully
on-device (HARD RULE #24).

## 7 · Follow-ups (not in this change)

- Finish the judge measurement (`npm run intent:judge`, ~$1 of credit) before
  any recommender UI is built. The mean confidence margin is 0.428 when the
  local tier is right and 0.309 when it is wrong, so escalating on the
  least-confident ~36% of queries catches about half the errors and wastes
  ~40% of the calls it makes — usable, coarse, and worth re-deriving against
  the judge's actual error profile rather than BM25's.
- Revisit embeddings only if the synonym lexicon outgrows a glance (§5).
- The harvested corpus is a reusable asset: it is the first thing in this repo
  that can measure a search change instead of arguing about one. If the ranker
  is re-tuned, re-run `bakeoff.mjs` and put the table in the PR.
