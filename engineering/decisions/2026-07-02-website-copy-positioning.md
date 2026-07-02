---
status: shipped
summary: Pre-GA website copy & positioning review — personas, Munger inversion, per-surface from→to copy changes, landing IA restructure, and the broken getting-started funnel (P0). Implemented in the follow-up PR; §12 records the deviations.
last-updated: 2026-07-02
---

# Website copy & positioning review — pre-GA traction pass

**Date:** 2026-07-02
**Status:** Shipped — implemented in the follow-up PR on this branch; §12
records where the implementation deviates from the recommendation and why.
**Surfaces reviewed:** landing (`docs/src/pages/index.astro`, `HeroCopy.tsx`,
`sections.tsx`), `features.astro`, `comparison.astro`, `introduction.md`,
`overview.mdx`, `getting-started.md`, `story.md`, root `README.md`, site nav +
footer. Rendered landing screenshotted at 1440 / 820 / 390 via
`tools/screenshot.js` against the local Astro dev server.
**Method:** persona-first read, then a Munger inversion pass ("how would we
guarantee this site gets no traction?"), then per-surface from→to edits —
then two rounds of independent checking (§9): round 1, a prose checker and
an adversarial fact reviewer on the first draft; round 2, a red team of four
agents against the revised doc (fact re-verifier, internal-consistency
auditor, inversion-driven red-team strategist, fresh prose re-check). All
accepted findings are folded in; §9 records what each round changed and
what was rejected.
**Grounding docs consulted:** `design/concepts.md` (vocabulary — bears on
§7.2), `design/editorial.md` (house prose rules; the proposed copy conforms),
`engineering/decisions/2026-06-14-competitive-analysis.md` (the comparison
page's source of truth — its split-layers thesis and honesty guardrail are
exactly what §5.5 promotes to the landing, and its "don't claim users demand
git-diffable decks" rule is respected), `engineering/marp-independence.md`
(grounds the §5.10 "Marp-based" finding), `engineering/workflow.md`
(§Merging), and the decisions index (no prior copy/positioning decision this
review could contradict; `2026-06-09-shadcn-migration.md` and
`2026-06-18-unified-site-header.md` govern implementation, not copy).

---

## 1. Verdict in one paragraph

The writing is far better than the median dev-tool site — concrete, specific,
willing to concede weaknesses. The problem is aim, not craft. The
hero promises the same thing Gamma and Tome promise ("the deck builds
itself"), so the one visitor segment that would love Lattice — people burned
by AI deck roulette — reads the headline and files it with the tools that
burned them. Meanwhile the site's strongest material (the comparison page's
receipts, the determinism argument, the agent-era split of "the AI writes, the
engine renders") sits two clicks deep. And a product whose entire pitch is
*consistency* publishes three different component counts across five surfaces —
none of them the engine's actual 55.
Fix the aim, surface the receipts, make the numbers agree, and give the
non-terminal majority something to do besides leave.

## 2. Who this is for (personas, in priority order for pre-GA)

- **P1 — The plain-text native.** Engineers, quants, technical PMs already in
  Marp / Slidev / Beamer / Quarto or fleeing them. Can use Lattice *today*.
  They convert on: determinism, git-diffable decks, no design work, MIT.
  Current copy serves them well. Keep them first until GA — they are the only
  persona who can install the product this quarter.
- **P2 — The agent-workflow builder.** People who draft decks with Claude,
  Cursor, or a pipeline, and need a render target that cannot hallucinate a
  layout. Judgment call, not a sourced claim: this looks like the wedge with
  the most momentum in 2026, and Lattice has real substance here (machine
  catalog, published spec, deterministic render) — but the landing page never
  says it. Biggest upside per word changed. One tension to manage: an
  agent-authoring section on a page whose hero positions *against* AI deck
  tools only works if it keeps the split-layers framing (the model drafts,
  the engine owns the pixels) — see §5.5.
- **P3 — The deck-burdened expert.** Consultants, analysts, lawyers, finance —
  the people who make the most decks on earth and own the "boardroom" framing.
  Today they can only touch the playground; the desktop app isn't shipped.
  Serve them with the playground plus an explicit "follow along" capture, not
  with silence.
- **P4 — The brand / design gatekeeper.** Buys consistency at scale, WCAG,
  no-telemetry. The "Why" section and comparison receipts speak to them;
  they arrive later via P1–P3, so no landing changes needed beyond what P1–P3
  get.
- **Explicitly not an audience:** executives and boards. They *receive* the
  PDFs; they don't visit tooling sites. "Boardroom" is the destination of the
  artifact, not the reader of the page — the copy mostly gets this right.

The mass-appeal product is SlideWright, and it hasn't shipped. Pre-GA, "mass
appeal" therefore means: convert P1 now, recruit P2 as evangelists, and
*collect* P3 (stars, release-watch, playground shares) so launch day has an
audience.

## 3. The positioning collision (the one strategic fix)

"Write the *words*. The deck builds itself." is the promise of every AI deck
generator on the comparison page. Two failure modes follow:

1. A visitor who wants that promise expects a prompt box, meets Markdown plus
   layout names, and bounces.
2. A visitor who *distrusts* that promise — Lattice's best prospect — bounces
   at the headline without scrolling.

Lattice's ownable claim is the one the comparison page already makes
brilliantly: **deterministic design**. The words are yours; the design is
finished before you arrive, and it renders the same way every time. The hero
should carry that claim, not the auto-magic one.

## 4. Munger inversion — how to guarantee no traction

Invert the goal: what would a site do to make sure Lattice never catches on?
Each item below is followed by where the current site stands.

1. **Sound exactly like the incumbents you beat.** ← Current hero does this
   (§3). *Worst offender; fix first.*
2. **Contradict your own core promise in the copy.** A consistency product
   with inconsistent numbers: landing says "Fifty-two layouts" (twice), the
   introduction and features page say 53, and the README manages all three
   published counts by itself — "20+ more" (line 13), "Fifty-two components"
   (line 26), and "53 components." (line 109). The engine actually ships
   **55** (`loadAll()` count; `contact` and `wifi` are in no marketing
   count), across **13** buckets — the features page still says 12 in three
   places. It even prints "Counts are live against the engine" over
   hardcoded numbers. ← Present on five surfaces.
3. **Mix dialects mid-card.** One Why card is titled "Brand colors live in
   one file" and its body says "never name a colour." British spellings on
   the landing also violate HARD RULE #21. ← Present (landing, features).
4. **Speak internal jargon to first-time visitors.** "Function · Form ·
   Substance · Finish," "the authoring contract," "the owned engine" — team
   vocabulary leaking into first-touch surfaces. ← Present (landing card 5,
   next-steps card, getting-started).
5. **Make the very first documented command fail.** Getting-started's two
   flagship commands — `node lattice-emulator.js examples/gallery.md …` and
   `… examples/gallery-mermaid.md …` — both exit with
   `error: source markdown not found`. Neither file exists: the gallery lives
   at `test/integration/baseline-decks/gallery.md`, and no
   `gallery-mermaid.md` exists anywhere in the repo. The introduction's "See
   it first" link (`github.com/…/examples/gallery.pdf`) 404s for the same
   reason, and README line 232 repeats the broken command. The single most
   important proof artifact is unreachable from every path the site offers.
   ← **Present, verified by running the command. This is the P0 of the whole
   review** — everything else is optimization; this is a newcomer's session
   ending in an error message.
6. **Make the first command feel like a prototype.** Even once the paths are
   fixed, the first thing a newcomer types is `node lattice-emulator.js` —
   "emulator" reads as stand-in, not product — after a front-matter block
   whose first line is a competitor's name (`marp: true`). ← Present: the
   emulator filename in both getting-started and README; the `marp: true`
   front-matter in getting-started only (the README's examples show only
   `theme:`). Product-level, not copy-level; flagged in §8.
7. **Keep your best evidence off the page that gets the traffic.** The
   fact-check receipts (best AI tool: 20% of claims verified), the Tome
   shutdown, the Copilot brand-violation story — the strongest conversion
   material on the site — appear only on /comparison. The top nav does link
   it (one click), but the landing body gives it zero salience; a visitor has
   to already want a comparison to find the receipts. ← Present.
8. **Show single slides, never a deck.** The buyer question is "what does a
   *whole* deck look like?" The landing shows one hero slide and six card
   slides; `examples/gallery.pdf` is linked only from a docs page. ← Present.
9. **Give the majority persona nothing to do.** A consultant who can't
   install Node gets no waitlist, no "star to follow," no email capture —
   and the landing never mentions the desktop app that will eventually serve
   them at all (SlideWright appears only on README/intro/story). ← Present.
10. **Ship three brand names before shipping one product.** Lattice, Lattice
    Style, SlideWright — tripled surface area for a first-timer's confusion.
    ← Present (README hero, story; the intro carries two of the three).
11. **Have an anonymous founder voice.** "I built Lattice because…" with no
    name attached anywhere. First-person conviction with no person. ← Present
    (story.md, README).

Everything in §5–§7 exists to un-do one or more of these.

## 5. Specific copy changes — from → to

House style is preserved: short declaratives, em-dashes, no marketing
superlatives. Counts follow the policy in §7.3.

### 5.1 Landing hero (`docs/src/components/landing/HeroCopy.tsx`)

**H1**
- From: `Write the *words*. The deck builds itself.`
- To: `Write the *words*. The deck is already designed.`
- Why: keeps the cadence, kills the Gamma echo, and keeps the visitor's own
  noun — the *deck* — instead of an abstraction. It states the claim as a
  small paradox (my deck doesn't exist yet; how is it designed?), which is
  the curiosity hook the page then resolves. The two checker rounds retired
  three candidates in turn: "The design is already done" (misreads as a
  release note — "we finished designing the product"), "Nothing drifts."
  ("drift" is jargon at headline altitude, before the page defines it), and
  "The design is settled." ("settled" is low-energy, drags the
  settle-for-less idiom along, and "the design" has no antecedent — the
  same defect the checkers killed in "Point your copilot at it").

**Hero paragraph**
- From: `You write the deck as a Markdown file and pick a named layout for
  each slide. Lattice assembles every page against one shared palette — no
  dragging, no nudging, no formatting drift.`
- To: `Your deck is one plain text file — a few lines of Markdown for each
  slide, plus that slide's layout name. Lattice sets every page in the same
  palette and type scale: no dragging, no nudging, no drift.`
- Why: "one plain text file" is the concrete image; "named layout" was doing
  quiet work that "the name of a layout" does plainly; "palette and type
  scale" names both things the engine actually locks.

**Trust line** — keep as is (`No install to try it. Runs on your laptop or
in CI. Fully offline. MIT-licensed.`). An earlier draft appended an
early-access clause here; the checkers flagged that saying pre-GA twice on
one page reads contradictory next to "v1" and dampens P1, the persona who
can adopt today. The early-access message lives once, in the §5.5 strip.

**CTAs** — keep `Try it in your browser` and `Get started`; add a tertiary
text link under the trust line:
- New: `Or skim a finished deck first — the full gallery, as a PDF. →`
- Why: answers "show me a real deck" without leaving the fold (inversion #8).
- **Prerequisite:** there is currently no committed `examples/gallery.pdf` to
  link (inversion #5) — the gallery lives at
  `test/integration/baseline-decks/gallery.pdf`. Restore an
  `examples/gallery.pdf`, or publish the built PDF at a stable site URL
  (`docs/public/gallery.pdf`). Do **not** link the baseline-decks path from
  the hero — a marketing CTA into a test directory is the same prototype
  smell §8.1 diagnoses (red-team veto). Longer-term the better target is a
  lightweight gallery page that embeds the PDF (a raw multi-megabyte
  download is a first-touch dead end — it leaves the site with no way back);
  the direct PDF link is the acceptable v1. Do not ship the link before the
  artifact exists at a stable URL.

### 5.2 Landing "speaks your field" section (`index.astro`, `sections.tsx`)

**Section title**
- From: `Plain Markdown — in the native language of your work.`
- To: `Your field already has a notation. Lattice speaks it.`
- Why: the current line reads as if Markdown *is* the native language; the
  point is the output notation. Two earlier drafts were cut by the prose
  checks: "Markdown in / notation out" echoed the garbage-in-garbage-out
  template, and "Write plain Markdown. Get the notation…" opened with the
  same imperative "Write" as the H1 two sections up — two headline-weight
  lines sharing an opener reads as a template.

**Card order** — from: math → project leads → engineers → lawyers → analysts
→ basics; to: **project leads → analysts & consultants → engineers → lawyers
→ math → basics.** Leading with KaTeX theorem cards signals "for academics"
to everyone else. Project timelines and evidence layouts are the broadest
on-ramp; math still gets its card.

**Analysts card**
- From: title `Analysts`, body `Radar, quadrant, KPI, stats, progress, pie,
  and word-cloud — the evidence layouts that turn numbers into an argument.`
- To: title `Analysts & consultants`, body `Radar, quadrant, KPI, stats,
  pie, and verdict grids — the evidence layouts that turn numbers into an
  argument. They carry the quarterly review, the board pack, the client
  readout.`
- Why: consultants are the deck-heaviest profession alive and currently
  unnamed; the named artifacts are the search terms in their heads.
  `verdict-grid` really exists and earns its spot; `word-cloud` was the
  weakest name-drop. Keep `pie` — the one chart name every reader knows
  (checker catch). Round-2 prose fixes: "QBR" spelled out (jargon outside
  consulting), the closing fragment given a verb, and the list trimmed to
  six terms so it doesn't bury the point.

**Basics card**
- From: `A bullet list becomes a card grid; a table becomes a comparison
  matrix. Fifty-two layouts, one Markdown syntax.`
- To: `A bullet list turns into a card grid. Tables become comparison
  matrices. 55 layouts, one Markdown syntax.` — with the count injected from
  `manifests.length` at build time (the landing already calls `loadAll()`),
  so the number is exact today and self-updating forever.
- Why: §7.3 counts policy — the hardcoded 52 is already wrong twice over,
  and the red-team round sharpened the policy: where a surface *can*
  generate the exact number for free, vagueness ("more than fifty") reads
  coy next to competitors who state numbers — be vague only where exact is
  impossible. The prose round also broke the sentence's balanced-couplet
  shape ("X becomes A; Y becomes B"), a third unprotected instance of the
  page's signature device.

### 5.3 Landing "Why" cards (`sections.tsx`)

**Card 1 body**
- From: `Change a palette once; every deck picks it up on the next build.
  Layouts never name a colour — they read var(--token).`
- To: `Change a palette once; every deck picks it up on the next build.
  Layouts never name a color — they read var(--token).`

**Card 3 (Mermaid) body**
- From: `…No per-diagram styling, no recolouring by hand.`
- To: `…No per-diagram styling, no recoloring by hand.`
- Why (both): HARD RULE #21, and the title/body dialect clash inside card 1
  is exactly the drift the section says Lattice prevents.

**Card 5**
- From: title `Fifty-two layouts, one vocabulary.`, body `Function · Form ·
  Substance · Finish organizes the catalog, so "which layout do I want?" has
  an answer that isn't *scroll the gallery*.`
- To: title `Layouts you ask for by name.`, body `You ask for a verdict grid,
  a derivation, a statute stack — the name says what the slide does. "Which
  layout do I want?" has an answer that isn't *scroll the gallery*.`
- Why: Function·Form·Substance·Finish is team vocabulary; it earns its place
  on the story page and in docs, not in a first-touch card. The three named
  layouts do the same job in words a visitor already owns.

### 5.4 Landing restyle section (`index.astro`)

- From (lead): `Watch a single slide move through every palette — in light or
  dark. Brand colours live in one file and the components never name a
  colour, so a whole deck restyles by editing one theme: line.`
- To: `Watch a single slide move through every palette — in light or dark.
  Brand colors live in one file and the layouts never name a color, so a
  whole deck restyles by editing one` `` `theme:` `` `line.` (The `theme:`
  stays code-formatted, as it already is on the site — without the code
  styling the mid-sentence colon doesn't parse.)
- Why: #21 again, plus "components"→"layouts" per the terminology decision
  (§7.2).

### 5.5 Landing — two new sections (see §6 for placement)

**"How it works" strip** (after the hero; three steps, one line each — a
slim band, not a full section: the hero preview already demonstrates the
transform live; this strip's payload is the layout names and the output
formats, which are missing from the current fold):
1. `Write — a slide is a few lines of Markdown.`
2. `Name a layout — call it` `` `big-number` ``, `` `gantt` ``, `or`
   `` `verdict-grid` ``.
3. `Build — one command renders the PDF, PPTX, PNG, or HTML.`
(Line 2's earlier bare noun-dump broke the strip's parallelism — lines 1 and
3 pair the verb with a clause; now line 2 does too. The names stay
code-styled because this line shows what you *type*; see §7.2.)

**Proof strip** (after "Why"; one stat + one link):
- Headline (reused from /comparison, its best line): `The artsy deck wins the
  demo. The deterministic deck wins the boardroom.`
- Body: `When one team fact-checked six AI deck generators, the best got 20%
  of its claims right. Models predict plausible text instead of looking
  facts up. Lattice never invents a number or reshuffles a layout — it
  renders what you wrote, the same way every time.`
- Link: `Read the comparison — including where Lattice loses. →`
- Why: the receipts are the site's highest-converting material (inversion
  #7), and "including where Lattice loses" is the credibility hook. The two
  rounds pulled this copy in opposite directions and the red team settled
  it: round 1 added the source's "one-shot test" hedge inline; round 2 cut
  it — the attribution ("when one team fact-checked…") already *is* the
  hedge, the comparison link carries the full caveat, and a landing that
  cross-examines its own evidence mid-sentence reads like a deposition.
  /comparison keeps its italic "read it as directional" footnote — the
  landing just stops repeating it. "Honest" was also cut from the link —
  material that calls itself honest undercuts the clause that proves it.

**Agent-era section** (after the proof strip; serves P2):
- Eyebrow: `Bring your own model`
- Title: `Point your copilot at Lattice.`
- Body: `Lattice ships a machine-readable layout catalog and a published
  authoring spec, so Claude, Cursor, or any agent can draft a valid deck.
  The engine renders that draft deterministically — the design was finished
  long before the model arrived.`
- Link: `How AI authoring works →` (features page § AI authoring, or the spec)
- Why: the argument already exists on /comparison ("So split the layers");
  P2 should not have to find it there. Checker corrections across both
  rounds: the original eyebrow and closing sentence were the third and
  fourth "X verbs. Y verbs." couplets on one page — the device stays
  reserved for the two protected lines (§10); "it" in the title had no
  antecedent; the 42-word body was split and "on brand" (buzzword filler)
  cut. The eyebrow matters most: an `AI authoring` eyebrow one section after
  a strip attacking AI deck tools makes the skeptic — the page's best
  prospect — bounce at skim altitude. `Bring your own model` is the framing
  /comparison already proved, and it puts the split-layers disclaimer where
  skimmers actually read. The closing line also re-lands the H1's claim.

**Early-access → folded into "Pick a starting point", not a standalone
strip.** An earlier draft made this its own section 8; the red-team round
killed that twice over — a standalone strip at that scroll depth parks the
majority persona's only usable CTA where the least-scrolling persona never
arrives, and labeling a stable v1 engine "early access" invites "I'll wait
for GA" from the one audience that can adopt today. Instead:
- One preface line on the next-steps section: `The engine ships today; the
  SlideWright desktop app is on the way.`
- A fourth next-steps card: title `Can't install anything?`, body `Open the
  playground — the full engine runs in your browser. Leave your email and
  we'll tell you when the desktop app lands.`, CTA `Open the playground`.
- A `Star on GitHub` link rides along as secondary, but it is not the
  follow mechanism: **GitHub never notifies stargazers of anything** — a
  star is a vanity counter you cannot recontact. The email field is the
  actual capture, which makes §8.3 load-bearing (a prerequisite of shipping
  this card), not a later upgrade.

### 5.6 Page metadata (`index.astro`)

- From (title): `Lattice — boardroom-quality slide decks from Markdown`
- To: `Lattice — Markdown to boardroom-ready slide decks (PDF, PPTX)`
- From (description): `Lattice turns a plain Markdown file into a
  boardroom-quality slide deck. Pick a named component per slide; the engine
  assembles every deck against one palette.`
- To: `Write plain Markdown, pick a layout per slide, and Lattice renders a
  polished PDF, PPTX, or HTML deck with one palette and zero design work.
  Free, offline, MIT-licensed.`
  (Round-2 prose fix: the earlier draft stacked two rule-of-three lists in
  one 30-word description; the first is now a plain sentence, leaving one.)
- Why: nobody searches "boardroom-quality"; they search "markdown to
  slides/pptx/pdf." Put the searched phrase in the title, keep the positioning
  word ("boardroom-ready") as the modifier.

### 5.7 Next-steps cards (`index.astro`)

- From (Author decks body): `Learn the layout catalog and the authoring
  contract slide by slide.`
- To: `Every layout, what it's for, and the Markdown that feeds it.`
- Why: "the authoring contract" is internal vocabulary (inversion #4).

### 5.8 Getting started (`docs/src/content/docs/getting-started.md`)

**P0 — fix the broken first-run commands (inversion #5).**
- From:
  `node lattice-emulator.js examples/gallery.md examples/gallery.pdf`
  `node lattice-emulator.js examples/gallery-mermaid.md examples/gallery-mermaid.pdf`
- To (until the galleries are restored under `examples/`):
  `node lattice-emulator.js test/integration/baseline-decks/gallery.md gallery.pdf`
  — and drop the `gallery-mermaid` line entirely (no such deck exists; the
  Mermaid story is told by the diagram components in the main gallery).
- Also fix the follow-up sentence `Open examples/gallery.pdf — that is the
  fastest answer…` to match, the same command at README line 232, and the
  introduction's GitHub link to `examples/gallery.pdf` (currently a 404).
- Better (product-level, §8): restore `examples/gallery.md` + committed
  `examples/gallery.pdf` so the friendly path is real — the current path
  makes a newcomer's first artifact live under `test/integration/`.

**Opening**
- From: `Lattice runs on Node.js. npm install pulls in the Mermaid CLI and
  Puppeteer (which downloads a matching Chromium); it does **not** pull Marp —
  the owned engine renders every first-party path. Requires **Node 22+**.`
- To: `The quickest first look is the [playground](/playground/) — the full
  engine, in your browser, nothing to install. To render locally you need
  **Node 22 or newer**; npm install pulls in everything else, including a
  headless Chromium for rendering. You won't need an account or any
  configuration.`
- Why: the Marp disclaimer answers a question no newcomer asked and plants a
  doubt they didn't have ("wait, what's Marp, and why are we defensive about
  it?"). "The owned engine" is team speak. And the page should open with the
  zero-install path.

**CLI sentence**
- From: `Build it with the bundled lattice CLI (the owned engine) — the
  output extension picks the format:`
- To: `Build it with the bundled CLI — the output extension picks the
  format:`
- Why: same jargon removal; also the sentence currently promises a `lattice`
  CLI and then shows `node lattice-emulator.js` (see §8.1).

### 5.9 README

- From: `…every slide is a deliberate component — title, diagram,
  compare-prose, split-panel, verdict-grid, and 20+ more —`
- To: `…every slide is a deliberate component — title, diagram,
  verdict-grid, and dozens more —` (also trims the five-item em-dash pile
  the prose round flagged as too much for one breath)
- From: `Fifty-two components, one syntax you already know`
- To: `More than fifty components, one syntax you already know`
- Also fix line 109's `**53 components.**` to the same "more than fifty"
  form — the README alone currently carries three different counts ("20+
  more", "Fifty-two", "53"), the doc's single best exhibit for §4 item 2.
- Why: "20+ more" undersells by 30; every fixed number rots (§7.3 — and note
  "fifty more" would just be 55 in disguise, which is why it's "dozens").
- README repeats the broken-path claims (§4 item 5) in two places: the
  Testing section (lines ~344–346) calls `examples/gallery.md` and
  `examples/gallery-mermaid.md` "the authoritative test fixtures," and line
  236 (in the render-the-galleries section) says "The two galleries are
  committed to examples/" — neither is true; the fixture is
  `test/integration/baseline-decks/gallery.md`. Fix together with §5.8's P0.

### 5.10 Introduction (`introduction.md`) and comparison (`comparison.astro`)

- From (intro): `Fifty-three components in all — and you reach every one of
  them with the same Markdown…`
- To: `More than fifty components in all — and you reach every one of them
  with the same Markdown…`
- From (comparison, weaknesses card): `Markdown, a CLI, 53 components, and an
  authoring contract with rules.`
- To: `Markdown, a CLI, more than fifty layouts, and an authoring contract
  with rules.` (the "authoring contract" phrase is fine *here* — this card is
  deliberately listing the learning curve.)
- **Introduction meta description contradicts the site's flagship claim
  (checker catch).** From: `description: Lattice is a Marp-based slide-deck
  engine that turns plain Markdown into polished, repeatable,
  version-controlled PDFs.` To: `description: Lattice turns plain Markdown
  into polished, repeatable, version-controlled slide decks.` Why: the
  "What is Lattice?" page's search-visible description calls it "Marp-based"
  while getting-started and /comparison stress that Marp was dropped at
  v1.0.0 — a first-touch contradiction on the exact point the brand leans
  on. `engineering/marp-independence.md` is unambiguous ("We never use Marp
  for anything"; the render path is retired). The same stale phrase also
  opens CLAUDE.md ("Lattice is a Marp-based slide-deck engine…") — internal,
  off this review's path, logged here for the docs-auditor per HARD RULE #18.
- Everything else on /comparison: **keep the substance.** It is the best
  page on the site. The #21 spelling fixes still apply there too
  ("colour-blind-safe," "never name a colour" around line 483) — "keep"
  covers the arguments, not the British spellings.

### 5.11 Features (`features.astro`)

- The bucket counts (Anchor (3) … Imagery (1)) sum to 53 while the engine
  loads 55 manifests (`contact`, `wifi` are missing from the catalog table),
  and the footer claims "Counts are live against the engine." The bucket
  count is stale the same way: "12 buckets" appears in the catalog row, the
  meta description, and the footer, while the ownership gate itself reports
  **13** (the new `connect` bucket). Generate the table (or at least the
  counts) from `loadAll()` the way the landing already loads manifests —
  this page's honesty bar is its whole personality.
- From: `Every palette ships a dark variant. Switch the whole deck in one
  line.` To: `Nearly every palette pairs a dark variant — carbone is
  dark-native. Switch the whole deck in one line.` Why: `themes/` has no
  `carbone-dark.css`; the README already hedges this correctly ("most with a
  paired dark-canvas variant") and the features page shouldn't overclaim
  what the README doesn't (checker catch).
- From: `4 colour-blind-safe palettes` / `Components never name a colour` /
  other British spellings → US forms per #21.
- The generated-counts fix covers palette counts too: "14 palettes" and the
  color-blind-safe "4" are hand-fixed numbers under the same §7.3 policy —
  a hand-fixed "4" rots exactly the way the "52" did (checker catch: an
  earlier draft fixed only the spelling and would have shipped the hardcoded
  count).

### 5.12 Story (`story.md`) and branding

- Add a byline. `I built Lattice because…` with no name reads as copy
  pretending to be conviction. One line fixes it: a name, optionally a link.
- **Dedupe the brand story, don't just demote it.** README §"Why Lattice
  Style exists" + §"The name" reproduce story.md nearly verbatim — the same
  drift-on-a-no-drift-product problem as overview/introduction, on a
  higher-traffic surface. The README keeps two sentences and links the
  story page; story.md stays the canonical telling.
- On demoting **Lattice Style**: the checker pushed back that the site lives
  at lattice.style, so the name sits in the visitor's address bar and every
  footer — explaining it is load-bearing, not clutter. Refined position:
  first-touch surfaces (landing, intro, README hero) lead with **one** brand
  (Lattice) plus at most one forward pointer (SlideWright, "the desktop app,
  on the way"); the *explanation* of Lattice Style lives on the story page,
  one link away, rather than being repeated inline. The README hero
  currently makes a newcomer parse three names in two paragraphs
  (inversion #10).

### 5.13 Retire "builds/assembles itself" everywhere (consistency sweep)

If the H1 changes on positioning grounds (§3), the same auto-generation
language has to leave its other first-touch homes, or the collision just
moves:
- `introduction.md` ("Authors… write the words, pick a component, and the
  deck assembles itself.") → `…write the words, pick a component, and the
  engine does the rest.`
- `docs/src/playground/theme-studio.js` sample slide headline
  (`# The deck builds itself.`) → `# The deck is already designed.` — the
  sample a visitor actually edits should model the same claim the hero
  makes.

## 6. Landing information architecture (proposed order)

1. Hero (revised, §5.1) — with the gallery-PDF text link
2. **How it works** — new, a slim three-step band (§5.5)
3. Speaks your field — reordered cards (§5.2)
4. Why decks drift — revised cards (§5.3); keep the section head verbatim,
   it's the best line on the site
5. **Proof strip** — new, a slim band (§5.5)
6. **Point your copilot at Lattice** — new (§5.5)
7. Change one line, restyle the deck (§5.4)
8. Pick a starting point — with the early-access preface line and the
   fourth "Can't install anything?" card folded in (§5.5, §5.7)

An earlier draft ran nine sections with a standalone early-access strip at
position 8; the red-team round cut it — scroll-depth decay put the majority
persona's only CTA below where that persona ever reaches, and two of the
additions (how-it-works, proof) work as slim bands rather than full
sections, keeping the page's read length close to today's.

Docs IA: `overview.mdx` and `introduction.md` open with the same "you have
been on the receiving end…" narrative nearly verbatim. Keep the narrative in
*one* place (introduction), and make Overview a pure hub (cards only), or
redirect it. Two near-identical entry pages split SEO and make the docs feel
copy-pasted — again, drift on a no-drift product. The same dedupe applies to
README ↔ story.md (§5.12).

Chrome nit while in there: the landing footer omits Features and Comparison
while the features-page footer includes both — one footer nav, shared.

## 7. Standing decisions this review proposes

1. **Position against the dice-roll, not alongside it.** The hero and every
   first-touch surface leads with deterministic design, never with
   auto-generation language ("builds itself," "instantly," "magic").
2. **One word for the thing: "layout" on marketing surfaces, "component" in
   reference docs**, glossed on first use in docs ("components — the named
   slide layouts"). Today the hero says layout, the intro and features page
   say component, and the landing itself carries both (checker correction:
   an earlier draft claimed the features page "says both" — it doesn't; grep
   finds only "component" there). Pick per-surface and hold it — including
   within the landing: the next-steps card titled "Component reference"
   becomes "Browse the layouts" (the `/components/` URL can stay). The
   README sits on the *reference* side and keeps "component" — it's the
   front door for people about to read code. Two execution caveats:
   - From `design/concepts.md`: internally, **component** is the canonical
     term of art, and "layout" already names something else — the Form/Frame
     axis (how a slide is composed). "Layout" is strictly a visitor-facing
     simplification; reference docs, manifests, and anything the concept map
     touches keep "component," and nothing in `design/` adopts the marketing
     word. Because it's a false friend, the gloss must appear at **every**
     marketing→docs seam (the "Browse the layouts" card, the getting-started
     opener), not just once (red-team flag).
   - Name styling: hyphenated code-style (`verdict-grid`) only where the
     copy shows what you *type* (the how-it-works strip); plain English
     ("a verdict grid") where prose names the idea (cards). The prose round
     caught the same names flipping register within one scroll — its own
     little drift on a no-drift page.
3. **Counts policy:** an exact component/palette count may appear only where
   it is generated from the manifests at build time — and where a surface
   *can* generate it, prefer the exact live number over prose vagueness (the
   landing already calls `loadAll()`; print `manifests.length` — 55 today,
   self-updating). Hand-written prose with no build step (README, intro)
   says "more than fifty" / "dozens." Exact where generated, vague only
   where exact is impossible. This turns inversion #2 off permanently
   instead of patching today's numbers.
4. **Every first-touch surface gets a "what to do if you can't install this
   yet" action** (playground, gallery PDF, star/watch) until SlideWright
   ships.

## 8. Blocking traction but not copy-fixable (product-level flags)

1. **`lattice-emulator.js` is the newcomer's first command.** The name says
   "stand-in." The `bin` alias already exists — `package.json` maps
   `lattice` → `dist/lattice-emulator.js`, and the README's "Use as a
   package" section documents `npx lattice …` (checker correction to an
   earlier draft of this flag). The actual gaps are that getting-started
   teaches the raw filename instead of the alias, and the package isn't on
   npm yet (verified: the registry returns 404 for `@slidewright/lattice`),
   so `npx lattice` only works inside a clone. Fix the docs today; publish
   when ready.
2. **`marp: true` is the first line of front-matter a newcomer writes.**
   Whatever the engine needs for compatibility, the *authored* example
   should not open with a competitor's brand. If the engine can accept
   `lattice: true` (or nothing), the examples and docs should switch.
3. **No email capture for SlideWright — and this is load-bearing, not a
   nice-to-have.** The "Can't install anything?" card (§5.5) is the doc's
   answer to inversion #9, and it cannot ship star-only: GitHub never
   notifies stargazers, so a star is a vanity counter with zero recontact
   ability — on launch day you cannot email a star. A one-field email
   capture is the minimum viable follow mechanism and a prerequisite for
   claiming P3 is being "collected" at all (red-team correction to an
   earlier draft that deferred this as a later upgrade).
4. **Restyle carousel rendered as an empty gray panel** in the full-page
   1440px screenshot (client:visible island; IntersectionObserver may simply
   not fire in a full-page headless capture). **RESOLVED — capture artifact,
   not a bug**: during implementation, an interactive session that scrolled
   the section into view and waited for hydration showed the carousel fully
   rendering (live slide, palette cycling). Full-page captures simply never
   trigger `client:visible`.
5. **Off-path tooling finding, logged per HARD RULE #18:** the US-English
   scan in `tools/check-ownership.js` counts gitignored generated artifacts
   when they exist on disk (`docs/public/components.md`,
   `docs/public/playground/v/<hash>/…` — written by the docs dev/build).
   A clean checkout passes; a tree that has run the docs site fails
   `build:check` and the pre-push hook at 1529 > 1364 through no change of
   its own. Reproduced both ways during this review (clean worktree of the
   same main commit: green; this tree with the artifacts present: red;
   deleting the artifacts: green). The 1529 is the observed value from this
   session with the artifacts present — not re-reproducible after their
   deletion — while the mechanism is code-verified: `listRepoTextFiles` is a
   raw `readdirSync` walk with a hard-coded skip list and no gitignore
   consultation, and `docs/.gitignore` ignores both paths. Fix direction:
   skip gitignored paths (or add these two generated paths to the scan's
   skip list). **Fixed in the implementation PR**: the footgun blocked this
   very PR's commit (running the docs dev server for the screenshot pass
   regenerated the artifacts, 1351 → 1517), which put it on the path per
   HARD RULE #18 — the scan now skips `docs/public/playground/v/` and
   exempts the staged `docs/public/components.md`, verified green with the
   artifacts present on disk.

## 9. Independent checks run on this review

Two rounds, six independent agents total. Everything recorded as accepted
is folded into the sections above.

### Round 1 — prose check + adversarial review of the first draft

**Prose check** (AI-tell / read-aloud audit of every proposed "To:" string).
Accepted: the agent-era section had re-created the doc's own protected
"owns the pixels" couplet twice more (eyebrow + closing sentence) — with
the two protected lines, four "X verbs. Y verbs." constructions on one
page; both recreations rewritten (§5.5). "Point your copilot at it" had no
antecedent for "it" → "at Lattice." The field-section title echoed the
garbage-in-garbage-out template → rewritten (§5.2; round 2 revised it
again). Card 5's "not a template to redecorate" X-not-Y clause → cut
(§5.3; the pre-existing "an answer that isn't *scroll the gallery*" stays —
it's the live site's own line). The analysts card stacked two
list-recitations in one sentence → split (§5.2). The how-it-works strip
ended a middle line on an ellipsis → period (§5.5). "Read the *honest*
comparison" self-applied the compliment → cut (§5.5). The early-access
strip recited a false-parallel rule-of-three → split (§5.5; the strip
itself was later cut by round 2). The doc's own verdict paragraph used the
"not X; it is Y" reversal template this review polices → rewritten (§1).
Rejected: rewriting §1's closing four-part sentence (internal analysis
prose, not shipping copy).

**Adversarial review** (refute-first, claims re-verified against the tree).
Confirmed: every quoted "From:" string verbatim at its cited path; the
55-manifest count; `contact`/`wifi` absent from all marketing counts; the
features bucket sum (53) and the stale "12 buckets"; the `marp: true` +
emulator-filename first-run; the dialect clashes; the
overview/introduction duplication; the missing byline. Accepted
corrections: an earlier draft *claimed* verification that
`examples/gallery.pdf` was committed — it is not, exactly the
unverified-"verified" HARD RULE #23 bars; §5.1 now carries the prerequisite
and §4 item 5 the P0 (this reviewer and my own re-check found the broken
funnel independently). The §8.1 bin-alias flag misstated the gap. "Fifty
more" was an exact count in disguise → "dozens more" (§5.9). README line
109's third count, the stale fixture claims, the README↔story duplication,
the "Marp-based" introduction meta description, the comparison-page
spellings, the carbone dark-variant overclaim, the landing-footer drift,
the theme-studio sample headline, and the landing-internal
layout/component mix were all missed by the first draft → added. Judgment
challenges accepted: "The design is already done" misreads as a release
note; early-access appeared twice on one page → once; keep "pie"; "hide
your best evidence" overstated a one-click nav link → reworded; the
"fastest-growing wedge" claim → stated as judgment (§2). Rejected:
dropping "boardroom" entirely (it stays as the category modifier, §5.6);
treating the agent-section-after-anti-AI-hero tension as disqualifying
(the split-layers framing carries it, §2).

### Round 2 — red team: four agents against the revised doc

**Fact re-verifier** (re-ran every check; trusted nothing from round 1).
Outcome: the factual core held — every "From:" quote, every line number
(13, 26, 109, 232, 344–346, intro:30, comparison:483), the 55/13/53
counts, the broken funnel (re-reproduced), carbone, the grounding-doc
quotes. One claim **refuted**: "the features page says both
layout/component" — it says only "component"; corrected in §7.2. Four
imprecisions corrected: "four different counts" → three published counts
none matching the engine's 55 (§1, §4.2); `marp: true` attributed to
README, which doesn't contain it (§4.6); "Lattice Style" attributed to the
intro, which never names it (§4.10); README line 236 misattributed to the
Testing section (§5.9). Upgraded: the npm-unpublished claim is now
registry-verified (§8.1); the §8.5 1529 figure marked as a historical
session observation with the mechanism code-verified.

**Internal-consistency auditor** (hunting edit damage). Accepted: §6
re-shipped the agent-section title round 1 had fixed → corrected; §9's own
couplet arithmetic was wrong (said three, is four) → fixed above; §9
recorded verifying `pricing`, a name the copy no longer uses (the current
name-drops — `big-number`, `gantt`, `verdict-grid`, `statute-stack` — are
all real manifests; "a derivation" in card 5 is deliberate shorthand for
the math component's derivation chains); the "cut" X-not-Y record clarified
(above); §7.3's palette-count coverage was missing from §5.11 → added;
§7.2 didn't assign the README a side → assigned (reference side);
list-indentation normalized. Clean: all §N / inversion-#N
cross-references, the protect list, front matter, markdown mechanics.

**Red-team strategist** (Munger inversion on the recommendations
themselves — assume they ship, make them fail). The core strategy
**held**: the Gamma-echo diagnosis, surfacing the receipts, the persona
order (P3 can't be retained pre-capture), the P0-first sequencing, the
metadata swap, the jargon purge, and the protect list all survived
inversion. Four executions **failed and were amended**: "The design is
settled." (low-energy, settle-for-less idiom, antecedent-free "the
design") → "The deck is already designed." (§5.1, cascaded to §5.13); the
standalone early-access strip (labels a stable v1 "early access," parks
the P3 CTA below their scroll depth, star-as-follow is non-functional —
GitHub never notifies stargazers) → folded into next steps with email
capture made load-bearing (§5.5, §7 IA, §8.3); the `AI authoring` eyebrow
(bounces the AI-burned skeptic at skim altitude one section after the
proof strip) → `Bring your own model` (§5.5); the inline one-shot-test
hedge on the proof strip (a landing cross-examining its own evidence) →
cut, attribution + link carry the caveat (§5.5). One recommendation
**vetoed**: linking `test/integration/baseline-decks/` from the hero
(§5.1). One sharpened: exact generated counts beat "more than fifty"
wherever a surface can compute them (§5.2, §7.3).

**Prose re-check** (fresh audit of the revised "To:" strings). Verdict on
round 1's fixes: the reversal template was genuinely gone, but the two
flagged tics were *thinned, not cleared* — the negation construction
survived in five strings and a third unprotected balanced-couplet lived in
the basics card. Accepted: basics-card couplet broken (§5.2); hero-
paragraph antecedent fixed ("that slide's layout name," §5.1); how-it-works
line 2 made grammatically parallel and code-styled (§5.5); proof-strip
four-pivot sentence split (§5.5); agent body split, "on brand" cut (§5.5);
analysts card de-jargoned and given a verb (§5.2); meta-description double
rule-of-three trimmed (§5.6); README em-dash pile trimmed (§5.9);
early-access double-"and" resolved by the strip's removal; `theme:`
code-styling made explicit (§5.4); the H1/section-title shared "Write"
opener broken (§5.2); getting-started negation-doublet rewritten (§5.8).
Consciously retained, not missed: the hero's "no dragging, no nudging, no
drift" triplet (the page's one flagship negation run), "No install to try
it." in the kept trust line, and the pre-existing "polished, repeatable,
version-controlled" in the intro description (inherited, not introduced).

## 10. What NOT to change (protect list)

- `Every deck looks like it came from the same team — because it did.`
- `You choose meaning; the engine owns the pixels.`
- `The artsy deck wins the demo. The deterministic deck wins the boardroom.`
  (promote it to the landing; don't rewrite it)
- The whole "What it isn't" section of the introduction, and the /comparison
  weaknesses cards — the concessions are the credibility engine.
- `A text file in, a polished PDF out` (hero eyebrow)
- The footer line `Designed by humans. Refined with Claude.`

## 11. Verification note

- Copy quotes were read from source files at the paths cited, and two
  independent passes (rounds 1 and 2) re-verified each quoted "From:"
  string verbatim.
- The rendered landing was screenshotted at 1440 / 820 / 390 from the local
  dev server. The screenshots live in the session scratchpad and the PR
  conversation, not the repo — a reader of this doc alone is trusting that
  claim, not checking it.
- The 55-component / 13-bucket counts came from executing `loadAll()` and
  `tools/check-ownership.js` in this repo; the broken getting-started
  commands were reproduced by running them (`error: source markdown not
  found`) in both rounds; the npm-unpublished claim was verified against
  the registry (404).
- The introduction's gallery.pdf link is verified to the limit checkable
  from here: the file is absent from the local tree and from origin/main's
  tracked tree, so the GitHub blob URL must 404 — the live URL itself was
  not fetched.
- No claim in this doc about live production behavior (lattice.style) was
  tested against production; all rendering evidence is from the local dev
  server build of this commit.

## 12. Implementation record — deviations from the recommendation

Shipped in the follow-up PR on this branch. Where the implementation
deviates from the doc, the deviation and its reason:

1. **The "Can't install anything?" card email field — now shipped.**
   §5.5/§8.3 made a one-field email capture the card's prerequisite.
   Closed by the follow-up `feat/buttondown-capture` PR: the maintainer
   created a Buttondown list (`latticestyle`), and the card now carries a
   zero-JS form that POSTs to it. Buttondown is the vendor decision (static
   site, no backend, exportable list). The live subscription round-trip is
   verifiable only by subscribing on the deployed preview — not exercised
   from the sandbox (no test data POSTed to a third-party API).
2. **`/gallery.pdf` is a build-time staged copy, not a committed
   `examples/gallery.pdf`.** The gallery's source of truth stays the
   baseline fixture (HARD RULE #8); `docs/scripts/sync-portal.mjs` stages
   the committed PDF into `docs/public/` at build (gitignored, like
   `components.md`). The hero and introduction link the served URL — the
   §5.1 veto (never link the test path from the hero) is honored.
3. **`marp: true` stays in the getting-started example.** §8.2's flag is a
   product/engine change (front-matter contract), out of scope for a copy
   PR. **Closed by the follow-up `feat/retire-marp-frontmatter` PR**: the
   engine was verified to need no marp key (rendered the taught example
   without it), so the four teaching surfaces drop it and getting-started
   notes the one real use — the VS Code Marp extension activates on it.
   Fixture decks and the playground's Marp-export interop keep the key.
4. **The story page keeps its structure; the byline is one line** (*—
   Sharmarke Aden, who builds Lattice*, the name on the repo's commits).
   README's duplicated brand-story sections collapsed to one short
   paragraph linking lattice.style/story per §5.12.
5. **Getting-started teaches `npx lattice …`** (the existing bin alias)
   instead of `node lattice-emulator.js …` — verified by running it against
   the real gallery fixture (87 slides rendered). The emulator filename
   itself (§8.1) is unchanged; npm publish stays pending.
6. **Comparison's "53 components across 12 buckets" summary** became "more
   than fifty components across thirteen buckets" (hand-written prose on a
   page with no manifest load; §7.3's vague-where-not-generated rule). The
   features page, which already pays the build cost, generates its counts
   and per-bucket name lists from the manifests and theme tokens.

### §12b — inversion round on the implementation (third check round)

A final red-team pass ran against the *shipped* implementation (real dev
server, the real `npx lattice` render, the committed PDF rasterized and
inspected). Its two HIGH findings were fixed before the PR opened:

1. **The promoted gallery PDF clipped text on two slides** (pages 48 and
   71 — density-modifier demos whose body copy overflowed the frame). The
   funnel fix had promoted a flawed artifact without page-level inspection.
   Both slides were trimmed, the PDF rebuilt (still 87 slides, so the
   page-count integration fixtures hold), and the repaired pages
   rasterized and verified clean.
2. **"Every layout" was false.** Getting-started said the gallery
   "exercises every layout" and the introduction said it "shows every
   component the engine knows" — 24 of 55 components (the whole legal
   bucket among them) are not in the deck. The copy was corrected to "an
   87-slide tour of the system," and "every component" pointed only at
   `/components/`. **Closed by the follow-up `feat/gallery-full-coverage`
   PR**: the gallery now exercises all 55 components (115 slides), every
   new page was visually reviewed by two independent agents, the two
   legal slides ship as `dark` variants (their tier labels ghost on the
   mustard light canvas — a theme-pairing defect the dark canvas
   sidesteps), and the pre-existing component render defects the new
   coverage exposed (quadrant sizing + five polish items) are tracked in
   issue #680. The "every layout" claims are restored, now true.

Also fixed from the same pass: the stale `examples/gallery*` paths in the
canonical internal docs (`engineering/workflow.md` regression table,
`design/theming.md` palette-check commands, `design/design-system.md`);
the features page's "29 treatments" row (canon is 12 tints + 11 marks +
a reset — `engineering/treatments.md`); the missing layout/component
gloss on the "Browse the layouts" card; the BYOM link now lands on the
features page's `#ai-authoring` band; the duplicated "desktop app is on
the way" sentence in next steps; and the hero gallery link opens in a
new tab. Logged, not fixed (code, off this PR's path):
`tools/preview.js` `CANONICAL_DECKS` still lists `gallery-mermaid`, a
deck that no longer exists. Accepted as-is: the README's split origins
(lattice.style for the story, github.io for the raw PDF — both resolve).
