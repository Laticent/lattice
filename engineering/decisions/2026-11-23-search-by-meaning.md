---
status: in-progress
summary: >
  The Studio's slide gallery finds components by spelling, not by meaning: "grade" ranks compare-code first and
  "science" ranks scene, because a confident spelling match returns before the meaning pass runs, and because no
  manifest carries everyday words like data, grades, science or movie. Measured on the shipped ranker: the meaning
  pass returns nothing at all for 7 of 20 everyday one-word queries, and mining 444 real decks gives a signal too
  noisy to lead. Proposes a vocabulary the manifests own, a small shared thesaurus, stemming in the exact pass,
  and a committed query benchmark; on-device embeddings stay a later option.
---

# Search the slide gallery by meaning (2026-11-23)

The owner, 2026-11-23, after testing #3484 on an iPhone: "one area of polish in a separate area is our ability to
search semantically based on exemplar personas. search can't be dumb and maybe this is a gap in our component
manifest? this requires systems thinking. we need to support stemming, survive spelling errors."

Their four screenshots: "grade" puts compare-code first, "movie" puts line, "science" puts scene, "data" puts
policy-recommendation. #3484's "Best match" label is what makes each of those visible.

## How a query is ranked today

`searchHits` in `docs/src/lib/component-search.ts` runs passes in order and returns the first that finds anything:

1. **Short name** — a component name one letter short of the query.
2. **Substring** — the query inside the name, tags, looks, category or description. No stemming: "grades" and
   "pictures" find nothing here.
3. **Confident fuzzy** — a Fuse score at or under 0.5 returns at once. On short words this is a spelling neighbor
   somewhere in a component's fields: "science" matches the name "scene", and "grade" lands on compare-code by
   way of a field that merely spells close to it.
4. **Intent** (`intent-search.ts`) — stems the query and scores it against each manifest's purpose, whenToUse and
   tags. It is good when it runs on words the manifests use: "quarterly revenue" → line, "testimonial" → quote,
   "budget" → table.

## What was measured

Twenty everyday one-word queries, against the shipped catalog (80 components), comparing the current ranking with
the intent pass alone:

| Query | Today, first | Intent pass alone |
|---|---|---|
| grade, grades | compare-code, nothing | nothing, nothing |
| movie | line | nothing |
| science | scene | nothing |
| data | policy-recommendation | matrix-2x2, word-cloud |
| pictures | nothing | nothing |
| students, growth | nothing | nothing |
| photo | collage | image, collage |
| scores | verdict-grid | verdict-grid |
| trend | scatter | scatter, kpi |
| chart | flowchart | matrix-grid, flowchart |
| budget, testimonial, team, roadmap, kpi, quote | right | right |

Two findings follow:

- **The core gap is vocabulary, not the order of the passes.** The intent pass finds nothing for 7 of the 20,
  because no manifest uses those words or anything that stems to them. Running intent first would turn several
  wrong answers into empty ones, not right ones.
- **Mining real decks is a weak lead.** Counting the words on 444 decks' slides by their `_class`
  (exemplars/ and examples/) gives "grade" → content, "team" → quote, "data" → hub-spoke: slide prose is about
  its subject, and generic layouts soak up most words. It can support a ranking, not set one.

## The axes

1. **Where the vocabulary lives**: in each manifest, in one shared thesaurus, mined from decks, or learned by a model.
2. **How passes combine**: first-hit-wins (today), or every pass scores and the scores merge.
3. **Typo tolerance vs meaning**: when a spelling match and a meaning match disagree, which wins.
4. **Where it runs**: on-device and synchronous today; a model adds a download and a warm-up.

## Candidate moves

| | Move | Buys | Costs |
|---|---|---|---|
| A | **Stemming in the substring pass** + a **confidence floor on fuzzy** (a spelling match wins outright only when no meaning match exists, or when it is a near-exact name) | "grades", "pictures", "quotes" find their stems; spelling neighbors stop beating meaning | Small; no new data |
| B | **`searchTerms` in each manifest**: the everyday words an author would type for that component (grades/marks/scores on the scoring layouts; video/movie/clip on video; data/numbers/statistics on the chart family) | Fixes the vocabulary gap at the source; the component's owner keeps it current; the docs and lint can show it | 80 manifests to fill once; a lint rule keeps new components from shipping without terms |
| C | **A shared thesaurus** of general English (photo = picture = image; grade = score = rating; film = movie = video) applied before matching | Covers words no manifest should repeat; one file | Small; must stay generic, or it duplicates B |
| D | **Persona phrases from the exemplars**: each sector's decks (academic, corporate, government, nonprofit, team) contribute their domain words (hypothesis, cohort, grant) to the components they use, weighted against each component's base rate | Sector words ("experiment", "students") reach the right layouts; ties search to the personas the owner named | Measured noisy as raw counts; needs the weighting and a hand-checked cut-off |
| E | **On-device sentence embeddings**: embed each manifest's purpose at build time, embed the query in the browser | Generalizes to words nobody listed | A model download (tens of MB), warm-up latency, a route-budget raise, and results no test can explain |

## Recommendation

**A + B + C now, D as a weighted helper, E only if the benchmark plateaus.**

- A, B and C are deterministic, run in the same synchronous pass, and add no download.
- B puts the vocabulary where the catalog's truth already lives: manifests generate the docs, lint and search.
  It answers the owner's "maybe this is a gap in our component manifest?" directly: yes, it is.
- D adds the personas' words without hand-writing them, but only as a tie-breaker until its weighting is shown to help.
- E is the strongest generalizer and the most expensive. Hold it until A–D are measured against a benchmark.

**Every step ships against a committed benchmark**: about 100 queries (one-word, plural, misspelled, everyday,
sector words, multi-word intents), each with an accepted top-3 set. Record hit@1 and hit@3 before and after, so each
move proves its own gain and no move silently costs another query.

## What it does not change

The UI from #3484: labels, pills, count, the phone typing layout. Labels may get one new reason, "related word", for
a hit that came through the thesaurus or `searchTerms`.

## Decision and result (2026-11-23)

The owner picked **A + B + C** with a **committed benchmark**. Built on branch `studio/search-by-meaning-design`:

- **Benchmark first.** `tools/intent-bakeoff/queries-everyday.json` (75 queries, the tuning set) and
  `queries-everyday-heldout.json` (32 different words, never tuned on), wired into `npm run intent:bakeoff`.
- **B — `searchTerms`** on all 80 manifests, defined in `lib/components/manifest.schema.json` (optional there, so the Studio's make-a-component gate does not
  reject an author's component; a unit test requires them on every in-tree manifest), emitted into
  `components.json`, and indexed by the meaning pass at tag weight (2.2, set before measuring, not tuned).
- **A — the pass order.** Three changes in `component-search.ts`, each measured on its own:
  - A confident spelling match wins outright only when it is a misspelled component **name**. That means
    within one slip for a short query and two for a longer one, a swapped pair counts as one slip, and the
    length differs by at most one letter.
  - Exact text found only outside a name ranks after meaning.
  - The last step tries meaning before spelling for every query. `looksLikeIntent` is deleted.
- **C — the thesaurus.** Ten general short forms (pic, vid, vs, bio, kpis…) are added to `SYNONYMS`. They are
  neutral on every set, and are kept for real use rather than for the benchmark.
- **The gate.** `docs/src/lib/search-everyday.test.ts` holds the floors and the owner's four queries.

| Query set | Before (top-1 / top-3) | After |
|---|---|---|
| everyday, tuning (75) | 44.0% / 52.0% | 89.3% / 97.3% |
| everyday, held-out (32) | 21.9% / 31.3% | 68.8% / 71.9% ² |
| authored intent (50) | 82.0% / 92.0% | 88.0% / 98.0% |
| adversarial (25) | 84.0% / 88.0% | 84.0% / 96.0% |
| misspelled names (643) | 99.4% / 99.7% | 99.4% / 99.7% |
| slide headings, test split (416) | 19.7% / 31.0% ¹ | 20.0% / 31.3% |
| slide prose, test split (436) | 30.5% / 41.5% | 28.7% / 43.6% |

² 65.6% before one label was corrected in review: `proof` accepted only the math-proof sense (`math`, `citation-card`),
and `split-panel`'s `proof` look is the slide for a claim that must be demonstrated, so it now counts too. No ranker change
was tuned on the held-out set.

¹ Measured with `searchTerms` weighted 0, after the pass-order change, which moved no other set; the first baseline
run's output did not keep this row.

What it cost: top-1 on harvested slide prose fell 1.8 points while top-3 rose 2.1. One authored-intent query of 50
lost its top-1 spot, and its top-3 still holds it.

**What the independent checker found, and what changed.** One checker reviewed the diff and found four defects, all
fixed in this PR:

- Meaning-first took first place from the one component that owns a tag or look: `at-top` put `image` third, `lanes`
  put `obligation-matrix` behind `statute-stack`. Of the 171 tags and looks that one component owns, 140 found it first
  on `main` and 127 did after the reorder. Now such a token keeps the substring pass, and a whole tag or look outranks
  one that only contains the query (`share` is `stacked-bar`'s tag; a tag merely containing "share" no longer wins the
  tie). Result: 158 of 171, and none that found its owner on `main` lost it.
- `validate()` checked that `searchTerms` existed but not its shape; it now enforces the schema's count, uniqueness and
  pattern, read from the schema.
- `q&a` was unsearchable: the tokenizer dropped both letters. A letter-&-letter abbreviation is now one word (`qa`,
  `rd`), and the schema pattern no longer admits `&` or `'`.
- Comments in `component-search.ts` still described the deleted routing.

**A defect found while verifying it, fixed in this PR.** Typing `movie` then `science` showed the video slide's
preview on the `math` tile for a moment. The gallery's previews come from a pool of frames that move between tiles
(`docs/src/components/studio/preview-pool.tsx`). A tile that left the results kept its frame, picture and all, until the
pool's next throttled pass, and the tile that moved into its spot wore it. A frame moved to a different slide also kept
its old picture until the patch painted. Now `unregister` frees a departed tile's frame at once, and a frame handed a
different slide stays hidden until its `onPaint`, with a 1.5 s backstop so a frame that never reports cannot leave a
tile blank. `docs/e2e/add-slide-gallery.spec.ts` checks every animation frame from the second query until the tiles
settle; it fails on `main`'s pool on desktop Chromium, WebKit (phone) and Gecko, and passes with the fix.

With the "literal only" search setting (`intent: false`), `searchTerms` has no effect: that setting turns the meaning
pass off, and `searchTerms` feed only the meaning pass.

D (persona phrases from the exemplars) is not built: raw counts were too noisy to lead. E (embeddings) waits until
the held-out score plateaus; at 66% top-1 it has not. The two tuning-set misses left are "class" and "grant".
