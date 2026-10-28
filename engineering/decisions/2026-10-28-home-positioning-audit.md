---
status: proposed
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

*2026-10-28 · proposal, not yet applied · supersedes nothing until the owner picks*

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

## 11. Next step

The owner picks the hero, the audience framing and the scope (§7). The implementation then
lands as one PR: copy, the two new sections, the developer-section move, three-width
screenshots, a `changelog.d/` fragment, and a prose-checker plus red-team pass on the
copy before the merge ask.
