---
status: shipped
summary: >
  The agent kit was cut by KIND OF DOCUMENT (authoring / components / skills / review /
  reference) — the writer's model of the material. A reader arrives knowing one thing about
  themselves, which product they are putting this into, and there was no row for it. This
  recuts the top level by DESTINATION and adds the four things the old tree had no place
  for: instruction text to paste, knowledge files sized to a real uploader, drop-ins for a
  coding agent, and the render step. Three measurements drove the shape and each contradicted
  an assumption: the binding platform limit is FILE COUNT, not bytes (nothing in the kit is
  near a size cap; everything is over a count cap); the kit's cheapest honest entry is ~9.5k
  tokens against a 4,096-token default local context that truncates silently, so the current
  kit cannot physically be used by a default Ollama install; and 20 layouts cover 91% of real
  SLIDES but only 26% of real DECKS, which turns the small-model design from "a shortlist"
  into "a shortlist plus a named fallback". Also fixes a live cross-kit defect found by
  rendering a generated example and looking at it — the kit told every model to write
  `theme: indaco`, which the Marp kit published beside it cannot resolve, so the deck
  rendered unstyled with no error.
companion:
  - ./2026-08-30-agent-kit-and-dist-kits.md
---

# The agent kit, cut by destination

Date: 2026-09-05. Follows `2026-08-30-agent-kit-and-dist-kits.md`.

## 1. The problem

The 2026-08-30 note built the kit and organized it into four task folders, after a
first cut that was "a flat pile of ten entries" the owner judged had been "shoved
in there and not thoughtfully". The second cut was better and still wrong in the
same direction, and the owner's verdict on it was the same in kind: *"we shoved
everything there and added a root level readme that isn't actionable… users will
be lost in terms of what to do and what they need."*

The diagnosis is that `authoring/ components/ skills/ review/ reference/` is a
taxonomy of **what each page is**. That is the writer's model. The reader's model
is **where am I putting this** — a Gem, a Custom GPT, a Claude Project, a coding
agent, a laptop model — and the kit had no row for that question, no text to paste
into an instructions box, and no bundle sized to an uploader.

Three gaps were measurable rather than aesthetic:

- **No render step.** A search of all 92 files for `npx`, `marp-cli`, `--pdf` or an
  install command on the authoring path returned nothing. An agent followed the kit
  correctly and handed back a file its author could not look at.
- **No complete deck.** The largest number of `<!-- _class: -->` directives inside
  any single fenced block, across all 92 files, was **one**, and no two slides were
  ever separated by a `---`.
- **No outbound URL.** The root README contained no link at all, and the single
  navigational URL anywhere in 2.2 MB pointed at `slidewright.github.io`, which is
  not where the site lives.

## 2. What the measurements changed

**File count binds; bytes do not.** Knowledge uploaders cap the number of files —
a reported 20 for a Custom GPT, a reported 10 for a Gem, 5 on a free ChatGPT
Project — and flatten folders. Per-file size caps are 512 MB, 100 MB, 200 MB. Our
largest file is 452 KiB. **Nothing we ship is close to a size cap and everything we
ship is over a count cap**, which makes a bundling step mandatory rather than tidy.
Ten is the tightest common denominator, so `upload/` is ten files. The kit also
carried **six files named `README.md`**, which collide the moment anyone drags the
folder into any of those products.

**The default local install cannot run the kit.** Ollama defaults to 4,096 tokens
below 24 GiB of VRAM; llama.cpp and LM Studio default to 4,096 too; overflow is
dropped with no error. The kit's cheapest honest entry — canon + rules + picker +
one component file — is ~9.5k tokens. More than half is deleted silently, and by
the measured primacy effect the deleted half is the half a model follows best.
`paste/lattice-instructions-solo.md` is sized against that number, not against a
model card.

**Coverage of slides and coverage of decks are not the same question.** Over
`exemplars/` — 46 realistic decks, 553 component slides — a top-20 layout list
covers **91% of slides but only 26% of decks end to end** (12 of 46), because nearly every
real deck reaches for one specialist. So the small-model path cannot be a
shortlist. It is a shortlist **plus a named fallback** ("if nothing fits, use
`content` or `list`"), which takes deck coverage to 100% at a bounded quality cost
on ~9% of slides. That one line is the most load-bearing sentence in the file.

`examples/` was deliberately NOT used to derive the shortlist: HARD RULE #9 makes
it one deck per component by construction, so it over-weights niche layouts.

**Essential and taste are separable, and the taste half is separable IN CODE.** All 18
entries of the reviewer's `RUBRIC` are `suggestion` severity, so every one of them can
be deferred to `check.mjs` and costs no prompt budget. The structural half is messier
than a first draft of this note claimed: of the nine essentials the paste texts carry,
four map to `error` rules in `lint-core.js`, one to a `warning`, and **four have no lint
rule at all** — separator spacing, the three-space nested indent under `1.`, bookend slot
order, and never writing a hex code. Those four are exactly why prose has to carry them:
they break a render and no gate will tell you. The old `rules.md` and the canon present
all three classes in one undifferentiated voice, which a frontier model can weight and a
small one cannot.

## 3. The cross-kit defect, and why only rendering found it

The kit's generated front matter said `theme: indaco` — the engine's own default.
The Marp kit published beside it on the same branch registers `lattice`, `cuoio`
and `cuoio-dark` and nothing else, and Marp resolves a palette **by name** through
its theme set. So the kit told every model to write a theme that the only
no-install render route cannot resolve, Marp fell back to its default styling, and
the deck rendered **unstyled with no error**.

Both kits had shipped on one branch since 2026-08-30 and had never been rendered
together. The generated example passed `check.mjs` clean, passed `lint:deck` clean,
and produced the right number of PDF pages. Every gate was green and the output was
wrong. It was found by rasterizing page 5 and looking at it.

A second failure of the same kind sat behind it: a Marp-rendered deck needs the two
runtime `<script>` tags at the end of the file, or layouts that compose in the DOM
render as plain lists — again with no error. The `kpi` slide rendered as an ordered
list until they were added.

Generated front matter is now `cuoio`, the intersection of all three documented
routes, and both traps are named on the front page.

## 4. What was deliberately left out

**The embed / "build Lattice into my own application" kit.** `@workwel/lattice`
returns 404 on the npm registry — it is not published — so every `npm install
@workwel/lattice` line in our own docs is aspirational, and a developer kit whose
first command fails is worse than none. Held until the package is published. The
research for it is not wasted and is recorded in §5.

**`llms.txt`.** The standard requires a domain root to work, and the decision on
this change was to publish to the orphan branch only, without touching the docs
deploy. A file called `llms.txt` on a branch is decorative. If the kit is ever
served from `lattice.style`, ship it then — as a router of ~2 KB, not an index:
Stripe's is 90 KB, Cloudflare's `llms-full.txt` is 57 MB and unusable, and Astro
deleted its whole llms.txt family in 2026 for lack of traffic.

## 5. Findings recorded but not fixed here (off-path, per HARD RULE #18)

- `README.md:171` and `engineering/pipeline.md:253` document `CHROME_PATH`. The
  emulator never reads it — 0 occurrences — it reads `PUPPETEER_EXECUTABLE_PATH`.
- `require('@workwel/lattice')` **exits the host process**: `main` points at the
  CLI, which parses `process.argv` at top level with no `require.main` guard. The
  real API is `@workwel/lattice/engine` → `createEngine`, `render`, `geometry`,
  `addThemes`, `hasTheme`, `languages`.
- The Marp kit ships only `cuoio`. Adding `indaco` would make the engine's own
  default work on the copy-and-go route; that is `build-marp-kit.js` scope.
- `dist/README.md` carries 60+ "TODO: describe this artifact" placeholders.
- **Two British spellings ship in the kit's worked examples** — `modernisation`
  (`exemplars/government-public/budget-proposal.md`) and `photosynthesise`
  (`exemplars/academic/lecture.md`), against HARD RULE #21. The repo's own
  `tools/us-english.js` map carries neither, so no gate sees them.
  **This change tried to fix them and reverted.** Editing those two decks made the
  pre-commit hook rebuild their committed golden PDFs on this machine, and
  `golden-diff` then reported **5 slides of pixel churn across 2 goldens** — labels
  re-wrapping from two lines to one on slides the edit never touched. That is the
  cross-host Skia drift `engineering/pipeline.md` §131-163 documents, not a
  consequence of the words. HARD RULE #8 (isolate feature content from the
  long-running galleries) and #18 (log an off-path defect, do not pull it into the
  diff) both point the same way, and the golden churn is what they exist to
  prevent. Fix them in a change whose subject is the exemplars, where the golden
  rebuild is the expected diff rather than noise.
- `reference/components.md` is a mechanical concatenation of the 61 component
  files: 105,200 of its 106,194 tokens are a second copy, and the same prose ships
  a third time inside `components.json`. About 46% of the kit is that triplication.
  Worth a decision on its own; not this change.
