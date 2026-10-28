---
status: in-progress
summary: >
  Audit of the home page's positioning. The page sells the mechanism (Markdown, layout names, one command, tokens,
  libraries, specs) to people who make decks for a living, and never says what the deck is for: getting a room to
  understand and decide. In the visible copy, "decision", "understand", "communicate" and "audience" appear zero times;
  sales, marketing, government, academia and nonprofits appear zero times. The July positioning note ranked plain-text
  natives first because they were "the only persona who can install the product this quarter" — the browser Studio
  removed that premise, so the ranking is stale. Proposes leading with the outcome (be understood; say more with less;
  show, don't tell), organizing the audience by the ROOM the deck is for rather than the author's job title, and moving
  the developer-ecosystem sections (libraries, specs) off the main scroll. Keeps the deterministic-design claim and every
  protected line.
---

# Home page positioning audit — from "how it's made" to "why it lands"

*2026-10-28 · applied in this PR · supersedes the persona ranking in `2026-07-02-website-copy-positioning.md` §2*

## 1. The answer first

The home page is well crafted and aimed at the wrong question. It answers *"how do I
make slides?"* (write Markdown, name a layout, run one command). The visitor's real
question is *"will this help me get my point across to the people who decide?"*. The page
never answers that one.

The engine already answers it. A **named layout is a communication form**: `big-number`
says "one fact matters", `verdict-grid` says "here is the call on each option",
`decision` lays out a choice, `waterfall` explains a change, `gantt` shows a plan. The
discipline of *one idea per slide in a known form* is exactly "say more with less". The
page describes that capability as a catalog feature ("Layouts you ask for by name")
instead of as the reason decks built this way get understood.

## 2. What the page says today — measured

The page runs eleven sections: Hero → How it works → Studio → Bring your own model →
Speaks your field → Why decks drift → Proof → Restyle → Libraries (12) → Specs (3) →
Next steps.

Word counts over the landing copy (`index.astro`, `HeroCopy.tsx`, `sections.tsx`,
comments stripped; re-derive with the grep in §9):

| Theme | Hits | Read |
|---|---:|---|
| decision / decide / understand / communicate / audience / persuade | **0** | The outcome is absent |
| sales, marketing, pitch | **0** | Two of the biggest deck-making teams are unnamed |
| government, academia, university, nonprofit, donor, student | **0** | No sector is named |
| executive / boardroom / board pack | 3 | All as the artifact's *destination*, never as the reader's goal |
| Markdown, command, git, token, spec, library | 64 | The mechanism dominates |

(The mechanism row includes some code identifiers, so read it as directional. The zero
rows are exact: none of those words appear in any visible string.)

**The personas the page does name** ("Speaks your field") are all *makers by
profession*: project leads, analysts and consultants, engineers and architects, lawyers
and compliance, mathematicians and quants. Every one is defined by the notation they use.
Nobody is defined by the audience they face.

## 3. Why the page ended up here — the premise expired

`2026-07-02-website-copy-positioning.md` §2 ranked the audience for pre-GA:

- **P1, plain-text natives**, first, *because "they are the only persona who can install
  the product this quarter."*
- **P3, deck-burdened experts** (consultants, analysts, lawyers, finance — "the people
  who make the most decks on earth"), third, because "the desktop app isn't shipped".
- **Executives and boards: "explicitly not an audience."** They receive the PDFs; they
  don't visit tooling sites.

The first two rankings rested on an install barrier. The Studio removed it on 2026-07-30
(`2026-07-30-landing-studio-promotion.md`): the full engine runs in a browser tab, with
nothing to install and no account. The hero's primary button now opens it. So the page
leads with a door any professional can walk through, then describes the room in
developer terms. The ordering is a leftover from a constraint that no longer holds.

The executive exclusion is half right and worth keeping in a sharper form. Executives
rarely visit a tool's site, so they are not the *visitor*. They are the **visitor's goal**.
Every presenter is trying to land something with them. A page that never names that goal
cannot make the presenter say "this is for me".

## 4. The positioning model — three axes

| Axis | Today | Proposed |
|---|---|---|
| **What we sell** | The mechanism: text in, PDF out, no drift | The outcome: the room understands and decides. The mechanism is how we deliver it |
| **Who it's for** | Makers by profession (job titles, notations) | Anyone who has to make a room understand. The audience is organized by the **room**, and professions become examples inside it |
| **Where** | Unnamed | Named sectors, each backed by a fact we already ship |

**Positioning statement (internal, not copy):** *For anyone who has to make a room
understand and decide, Lattice turns what you know into slides that show it: one idea
per slide, in a form built for that idea, in a design that is finished before you start.
Unlike AI deck generators, it never invents a number or reshuffles a layout. Unlike a
blank canvas, it never drifts.*

The deterministic-design claim (July §3, §7.1) stays the spine. The change is what it
serves: "the same every time" matters *because* a decision-maker should spend attention
on the argument, not on the formatting.

## 5. The communication thesis — the section the page is missing

Three claims, each backed by what the engine does rather than by assertion:

1. **Communication is the work.** A deck exists to move understanding from one head to a
   room. Formatting time is time not spent on the argument. *Engine fact:* there is no
   formatting time, because the design is finished.
2. **Say more with less.** One idea per slide, in a form that names its job. *Engine
   fact:* each layout is a form with a purpose (`big-number`, `verdict-grid`,
   `decision`, `quote`). The deck linter coaches toward short slides.
3. **Show, don't tell.** A visual carries what a paragraph cannot. *Engine fact:* a list
   becomes a gantt, a funnel, a radar, a map, or a waterfall, with no drawing tool.

**The proof belongs in the page, not in an adjective.** The strongest single move is a
*before → after*: a dense paragraph of the kind executives skim past, then the same
content as one Lattice slide (a `verdict-grid` or a `big-number`). This is the "visuals
say more than words" claim demonstrated in one glance, rendered live by the same island
machinery the hero already uses.

## 6. The audience — organized by the room

Each room lists layouts that exist today (checked against `lib/components/**`) and a
reason the sector is a real fit, drawn from facts the site already proves. No new claims.

| Room | Who presents there | Layouts that exist today | Why it fits, from shipped facts |
|---|---|---|---|
| **The boardroom** | Executives, chiefs of staff, finance, founders | `decision`, `verdict-grid`, `big-number`, `kpi`, `waterfall`, `risk-matrix` | A board pack where every page matches. Deterministic: no invented numbers |
| **The pitch** | Sales and marketing teams | `pricing`, `funnel`, `logo-wall`, `quote`, `kpi`, `team-profile`, `contact` | One brand in one file, so every rep's deck matches. Export to PowerPoint for the client |
| **The briefing** | Government and the public sector | `policy-recommendation`, `regulatory-update`, `decision`, `risk-matrix`, `map` | Offline, no account, no telemetry. WCAG AA contrast in every layout |
| **The lecture hall** | Academia: faculty, researchers, students | `math` (KaTeX), `scatter`, `histogram`, `diagram`, `glossary`, `q-and-a` | Free and open source. Real math notation. Plain text works with version control |
| **The mission** | Nonprofits | `stats`, `kpi`, `map`, `journey`, `quote`, `team-profile` | Free. Donor and board reports look professionally designed with no design budget |
| **The review** | Engineers, lawyers, analysts (today's personas) | `gantt`, `compare-code`, `statute-stack`, `obligation-matrix`, `radar` | The current field cards, kept as one room among six |

The existing field cards don't disappear. They become the specialist room plus the
examples inside the other rooms, so the depth that sells engineers and lawyers survives.

## 7. Proposed page order — fewer sections, the outcome first

| # | Section | Change |
|---|---|---|
| 1 | **Hero** | New H1 and lead about being understood (§8). Keeps the protected eyebrow, both doors, and the live preview |
| 2 | **Say more with less** (new) | The communication thesis and the before → after demo (§5) |
| 3 | **Every room** (new) | The six rooms (§6), replacing "Speaks your field". Live cards stay |
| 4 | How it works | Unchanged three-step band, moved below the "why" |
| 5 | The Studio | Unchanged |
| 6 | Why decks drift + Proof | Merged into one band. Both protected lines kept verbatim |
| 7 | Restyle | Unchanged; it now reads as brand consistency for teams |
| 8 | Bring your own model | Unchanged |
| 9 | Next steps | Gains a "For developers" card: libraries, specs, CLI |
| — | Libraries, Specs | **Off the home scroll**, to `/libraries/` and `/spec/` behind the new card. They are real assets for developers, and they spend a general visitor's attention |

That is nine sections instead of eleven, and the visitor reaches "this is for me" in the
first two.

## 8. Hero candidates

All three keep the protected eyebrow (`A text file in, a polished PDF out`), both doors,
and standing decision July §7.1 (no auto-generation language).

**A — lead with the outcome (recommended)**
> **Say more with less. Be understood the first time.**
> Decisions get made in rooms where nobody reads paragraphs. Lattice turns what you know
> into slides that show it: one idea per slide, in a design that's finished before you
> start, and the same every time.

**B — keep the current H1 and change the lead**
> **Write the *words*. The deck is already designed.**
> For the boardroom, the pitch, the briefing and the lecture hall: say what you mean, and
> Lattice sets it in slides your audience understands at a glance, with no dragging and
> no drift.

**C — lead with the audience**
> **Slides for the people who decide.**
> …

A is the strongest because the H1 states the benefit and the preview proves it. Its risk
is that "be understood" sounds generic. The before → after demo is the mitigation:
generic words next to specific proof read as a promise kept. B is the lowest-risk edit
and keeps a line the July review chose on purpose. C narrows the audience back to
executives and drops academia and nonprofits, so it is listed for completeness.

## 9. What stays, and how to re-derive the numbers

**Protected (July §10), all kept verbatim:** the hero eyebrow; "Every deck looks like it
came from the same team — because it did."; "You choose meaning; the engine owns the
pixels."; "The artsy deck wins the demo. The deterministic deck wins the boardroom.";
the comparison concessions; the footer line.

**Re-derive §2:**
```sh
cat docs/src/pages/index.astro docs/src/components/landing/HeroCopy.tsx \
    docs/src/components/landing/sections.tsx | grep -vE '^\s*(//|\*|\{/\*)' \
  | grep -oiE 'decision|decide|understand|communicat|audience|persuad|sales|marketing|pitch|government|academi|nonprofit'
```
(empty on `main` at this note's date)

## 10. Risks and what is unverified

- **Breadth dilutes.** Six rooms can read as "for everyone, so for no one". Mitigation:
  each room names real layouts and one shipped fact, so every card is specific.
- **Generic-benefit drift.** "Communicate better" is every presentation tool's line.
  Mitigation: the before → after demo carries the claim, and the deterministic contrast
  with AI generators stays in the hero lead.
- **PowerPoint expectation.** Sales and marketing teams live in PowerPoint and Google
  Slides. The PPTX export exists. Whether it holds up for a sales team's edit-after-export
  workflow is **UNVERIFIED** (HARD RULE #23) and must be checked before the pitch room
  promises it.
- **No visitor data.** This audit reads the copy, not analytics. The ranking change is a
  judgment from the expired premise in §3, not a measured conversion result.
- **Visuals not reviewed.** No screenshots were taken for this note. The implementation
  owes `tools/screenshot.js` at 1440, 820 and 390 px (QUALITY BAR).

## 11. Owner's picks (2026-10-28) and what shipped

| Fork | Pick |
|---|---|
| Hero | **B**: keep the H1 and rewrite the lead to name the rooms and the outcome |
| Audience | **Six rooms**, replacing "Speaks your field" |
| Developer sections | **Move** libraries and specs off the home scroll |
| Scope | **One PR** for all of it |

**Where the build differs from §7:**

- **The before/after slide is a waterfall, not a verdict grid.** The hero preview directly
  above renders the verdict-grid sample, so a second verdict grid one scroll down
  repeated the same picture. A walk from one revenue figure to another is also the
  clearest case of a chart beating a paragraph. The memo and the slide carry the same
  numbers, and they reconcile.
- **"Bring your own model" stays directly after the Studio.** Its placement note in
  `index.astro` records why it must sit next to the Studio, and nothing in this audit
  overturns that.
- **"Why decks drift" and the proof strip stay two bands.** They were already adjacent.
  Merging them would have rewritten a section the July note protects.
- **The order that shipped:** Hero → Say more with less → Every room → How it works →
  Studio → Bring your own model → Why decks drift → Proof → Restyle → Next steps. That is
  ten sections instead of eleven.
- **The developer door is the first Next-steps card** ("For developers"), replacing the
  plain "Get started" card, whose job the hero's Get started button already does. It links
  the libraries index and the LFM spec, and the footer's Libraries link now goes to
  `/libraries/` instead of the removed `#libraries` anchor. The library count in that card
  comes from `librariesNav`, so it updates itself (July §7.3 counts policy).
- **The room slides are authored for their rooms** (`docs/src/components/landing/room-decks.ts`),
  not lifted from manifest samples. A manifest sample describes its own layout, and a room
  card has to read as that room's real work. Only the briefing borrows a sample (the
  policy-recommendation sample is already a real bill). All seven slides pass
  `lint:deck`.

Screenshots at 1440, 820 and 390 px are in the PR.

## 12. Independent before/after assessment, and what it changed

The owner asked for two independent assessments of the page before and after this
change. Each agent got only stitched screenshots of both versions (desktop and phone,
captured from the same local server with every live slide rendered) and the copy
sources. Neither saw this note or the reasoning behind it.

- **Visitor lens.** It walked the page as a CFO, a sales lead, a public-sector analyst, a
  lecturer, a nonprofit director, and an engineer already on Marp or Slidev. Its verdict:
  after is better. Four of the five non-technical visitors went from "no" or "partly" to
  "yes", and the sales lead from "no" to "partly". The engineer went from "yes" to
  "partly".
- **Positioning and craft lens.** Its verdict: after is better, with gaps. Narrative order
  scored 5 → 8, proof 6 → 8 and differentiation 7 → 8. The developer visitor scored
  8 → 5.

Both independently named the same defects. The owner picked the fix for each:

| Finding (both agents) | Fix in this PR |
|---|---|
| The hero preview was the weakest slide: the verdict-grid manifest sample ("Option one", "Criterion") | The hero renders a board decision authored for the page (`room-decks.ts` `HERO_SLIDE`). The Source tab still shows its exact text. The boardroom card now shows a real verdict grid. `showcase.hero` stays on verdict-grid for the showcase rasterizer, and its schema description now says the hero no longer reads it |
| Two cards promised what their slides did not show (pitch: logos and quotes; mission: map and people) | The bodies now name the slide shown ("like this one") and list the rest as other layouts |
| The developer visitor lost the most | "Markdown in one text file" is back in the hero lead. A slim "Building on Lattice?" line under Next steps links the libraries and specs, and says in plain words that the AGPL exception leaves decks license-free |
| Developer jargon in the drift cards (`var(--token)`, `git diff`) | Rewritten in plain words. The protected section heading is unchanged |
| The AI section came before the line that sets Lattice apart from AI generators | The proof strip ("The artsy deck wins the demo…") moved to directly after the rooms |

Single-agent findings acted on:

- The room list appeared three times in two screens. The rooms H2 is now "Your room
  already has its layouts."
- The sample figures were unlabeled next to "never invents a number". The rooms lead now
  says they are made up for illustration.

Checked and left as is:

- **The "20%" statistic.** It looked unsourced from the home page, but `comparison.astro`
  cites and links the study, and the proof strip links there.
- **Slide label size inside cards.** This is a tile-scale limit of every live card on the
  site, not new here.
- **Two in-browser products.** Explaining the Studio versus the Playground is the July
  router line's job. It was out of this change's scope.

## 13. The push toward 9.5 (owner: "do it here")

Two fresh reviewers scored the page with a shared rubric. Overall, before → after:
4.8 → 6.7 (visitor lens) and 6.4 → 7.6 (craft lens). The owner asked what a 9.5 across
the board would take, then asked for the work in this PR rather than a second one. The
changes, each mapped to the finding that asked for it:

| Finding (scoring round) | Change |
|---|---|
| On a phone the hero slide fell below the first screen, under the buttons and three paragraphs of small print | The hero is three grid children (copy, slide, actions), like the Studio section. On a phone the slide sits right after the copy. The small print is one paragraph |
| Nothing near the fold contrasts Lattice with AI generators | A line under the lead: "Not an AI that guesses your slides: Lattice renders what you wrote, the same way every time." |
| "Markdown" splits the audiences | Kept, and glossed in the same breath ("as simple as a bulleted email") |
| "Get started" sends a business visitor to a toolchain install | The secondary button now reads "Use the command line" |
| "How it works" arrived late | It sits directly after "Say more with less" |
| The drift argument (vs blank canvases) sat far from the proof strip (vs AI generators) | The two are adjacent, right after the rooms |
| The palette demo was a slide about slides, and "the brand lives in one file" was never shown | Retitled "Your brand, one line". It cycles a quarterly-review kpi slide carrying `logo: lattice` (the one built-in mark) through every palette |
| Developer depth was cut, not moved | A "For builders" panel beside "Point your copilot at Lattice": open specs, standalone libraries and CI rendering, each linked, plus the AGPL exception in plain words. It replaces the one-line strip |
| Six stacked room cards were about six phone screens of scroll | Below `sm` they form a scroll-snap swipe row, each card 84% wide so the next peeks in. The row cancels the `.wrap` gutter and scrolls itself; the page stays 390 px wide |
| The 20% statistic read as uncited | The proof strip links the study inline (the same source and date the comparison page cites). The protected headline is unchanged |
| "No account / no telemetry" appeared four times | The hero and briefing card no longer repeat it. The drift card is its home |
| "Every number on it is one you wrote" sat beside sample figures | It now reads "Lattice never adds a number you didn't write" |

Left out, with the reason:

- **Downloadable sample decks per room.** A pull request never commits PDFs
  (HARD RULE #9), so this needs its own deck-plus-render path.
- **Real customer quotes or logos.** None exist yet, and inventing them would contradict
  the page.
- **The PREVIEW badge.** A product decision, not a copy change.

Verification:

- No horizontal overflow at 390, 820 or 1440 px. The only elements past the right edge at
  390 px are the off-screen cards inside the swipe row.
- Swiping renders the next card's slide.
- studio-smoke `reader-alarms`: 8/8 locally with `--retries=0`.
- Every slide on the page lints clean.

## 14. Second scoring round, and the readability-and-repeats pass

Fresh reviewers rescored the §13 page against `main`. Visitor lens: 5.0 → 7.5. Craft lens:
6.2 → 7.7. Both landed below the 8.5–9 this note had predicted. They agreed on three gaps.

1. **The slides carrying the thesis could not be read.** At hero size the three-card
   decision slide's text was about 6 px.
2. **The back half repeated itself.** The brand-colors card sat directly above "Your brand,
   one line". Accessible contrast appeared twice. The "never invents a number" claim
   appeared three times.
3. **There was no proof from real people.**

Both also caught a typo: Astro drops the space when an inline element starts a new
source line ("Change thetheme:"). The owner chose to fix gaps 1 and 2, use our own decks
for gap 3, and merge.

| Gap | Change |
|---|---|
| Hero unreadable | The hero is a `big-number` board decision ("$4M saved by year three: $6M to build in-house vs $10M to buy"). It is readable at 390 px, and its Source tab is five lines |
| Repeats | The "why" grid drops the brand-colors and contrast cards and becomes two by two. The boardroom card drops its number line, so the proof strip is the claim's one home |
| "Not an AI that guesses" beside "Point your copilot at Lattice" | The AI section opens with the bridge: Lattice itself never guesses, a model can still draft the words, and the engine renders only what is in the file |
| Five rooms hidden in the phone swipe row | A phone-only line above the row names all six rooms |
| Business visitors meet "For developers" first in Next steps | "Make your first deck in your browser" leads; the developer card is second |
| No real proof | Each room card links a full worked deck from `exemplars/`, committed with its PDF and opened via GitHub's preview of `main`, since the site does not serve those PDFs. A "We make our own decks with it" line links the Studio's welcome deck and the layout gallery. No user or quote is invented |
| Typo | Every inline element that starts a source line carries an explicit `{' '}`. A scan of the rendered page finds no glued word |

Still open:

- Real users or quotes, which no change to the page can supply.
- Room-card thumbnails are small at tile scale.
- The PREVIEW badge.

**Final rescore** (fresh reviewers, same rubric, current page vs `main`): visitor lens
6.4 → **7.9**, craft lens 6.2 → **8.0**. Both caught one last copy defect each: the hero
caption broke "in-house" across lines, and a beat started with a fragment. Both are fixed.
The next round's gaps are in `followups.d/2956-p2-home-page-next-round.md`.

