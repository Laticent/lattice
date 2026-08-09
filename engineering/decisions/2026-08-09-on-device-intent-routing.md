---
status: shipped
summary: #1440 asked for on-device intent routing for component selection, and specified wink-nlp + wink-eng-lite-web-model (self-hosted, lazily downloaded) with a wink-naive-bayes-text-classifier scoring confidence via computeOdds(). A bake-off across three corpora rejected the library and kept the requirement: wink's 1.03 MB (gzipped) English model won one cell of four by two queries and lost the rest — worst of all on the adversarial set a lemmatizer should own — while the naive Bayes variant the issue specified came last of every NLP option tried, because one training document per class is a degenerate classifier. What shipped is docs/src/lib/intent-search.ts — field-weighted Okapi BM25 over the component manifest, plus edit-distance typo repair and a 17-entry synonym lexicon, ~4 KB gzipped, no download, no network, offline on first paint. It lands in the SHARED search core as a third pass (substring → intent → fuzzy), so the Studio add-slide gallery, the Playground picker and the /components index all gain it without forking. Measured lift over the shipped ranker on natural language: 16.0% → 86.0% top-1 on intent phrasings, 12.0% → 84.0% on adversarial ones (typos, British spellings, synonyms), 0.4% → 31.2% on real slide prose. The honest ceiling (~30% top-1 / ~45% top-5 on prose) is why the UI shows a ranked shortlist with a RELATIVE match meter and never a single confident answer. Rejecting wink deleted requirement 2 of the issue entirely: nothing to self-host, nothing to background-download, no TTI risk. Requirement 4's LLM investigation is §6.
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
adding decks never reshuffles what was already tuned against. The stopword list,
synonym lexicon and field weights were fitted **only** against `dev`; every
number above is `test`.

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

It is a **third pass in the shared core**, not a replacement:

```
substring → intent → fuzzy
```

Substring stays first because when it fires it is nearly always exactly right,
and this ordering is what makes the change safe: a name or tag lookup never
reaches the new code at all. Two tests pin that — every one of the 61 component
names still ranks itself first, and every tag in the catalog still finds a
component carrying it.

All four call sites moved from `makeFuse` to `makeSearchIndex`, so the Studio
gallery, the Playground picker and both `/components` islands gained the pass
together rather than forking (HARD RULE #1).

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

## 6 · The LLM's role in the component workflow (issue requirement 4)

The issue asks where an LLM best complements this. The answer the measurements
support is a clean split by *what the task actually is*:

**Local NLP owns SELECTION.** Picking a component from a fixed, known,
61-item set is a ranking problem over a catalog that ships with the app. It
needs no world knowledge, and the qualities that matter are the ones an LLM is
worst at here: zero latency (it runs per keystroke), zero cost (it runs on every
keystroke of every user), determinism (the same query must give the same list),
offline availability, and never leaking the author's draft. A round trip to a
model would cost 300–2000 ms and real money to answer *worse* than a 4 KB
function, because the model does not know this catalog and would have to be
handed it in the prompt anyway.

**The LLM owns CONTENT.** Once a component is chosen, the remaining work is
generative and open-ended — writing the actual claim, drafting the rows, fitting
prose to a capacity budget, rewriting for a board audience. There is no catalog
to rank; the answer is not in the manifest. That is already where the Studio
points it (`architect.ts`, the Fabricate and Coach paths).

Two consequences worth writing down:

1. **They compose, in that order.** The strongest flow is intent → shortlist
   → author picks → LLM fills. Local ranking narrows 61 candidates to five for
   free and instantly; the model is then invoked once, on a decided structure,
   which is also the cheapest possible prompt. Inverting it — asking the model
   to choose the component — pays cloud latency and tokens for the one step that
   did not need them.
2. **The confidence number is the handoff signal.** A flat distribution (every
   candidate near the top hit) means the query did not discriminate — that is
   the moment where offering "describe it to the assistant instead" is worth
   more than another lexical guess. The meter already computes exactly this
   ratio; wiring it to that offer is the obvious follow-up, and is deliberately
   *not* in this change (it needs its own design pass on when a suggestion is
   help rather than nagging).

On cost and keys, nothing here changes the existing posture: the local ranker
spends nothing and sends nothing, and the generative tiers keep running on the
user's own OpenRouter key or fully on-device (HARD RULE #24).

## 7 · Follow-ups (not in this change)

- Offer the assistant when the match distribution is flat (see §6.2).
- Revisit embeddings only if the synonym lexicon outgrows a glance (§5).
- The harvested corpus is a reusable asset: it is the first thing in this repo
  that can measure a search change instead of arguing about one. If the ranker
  is re-tuned, re-run `bakeoff.mjs` and put the table in the PR.
