// The one-slide sources the home page renders live: the hero's before/after slide,
// the brand carousel's slide, and one slide per audience room. Each is authored for its
// room rather than lifted from a manifest `sample`, because a manifest sample
// describes its own layout ("The grid scores options against shared criteria")
// and a room card has to read as that room's real work. Every figure on these
// slides is illustrative and every source chip names the author's own records.
//
// Every slide follows its component's `.docs.md` contract (HARD RULE #6) and is
// keyed by the `data-live-card` name the host carries in sections.tsx.
// See engineering/decisions/2026-10-28-home-positioning-audit.md §5–§6.

// The hero's slide: the "after" half of the before/after the hero shows. The memo
// above it in index.astro says the same thing in prose. History: the verdict-grid
// manifest sample described itself; a three-card decision slide read as 6px text;
// a lone big-number was readable but empty. Both reviewers of the third scoring
// round asked for the page's strongest proof, this transformation, at the fold. A
// waterfall is the clearest case of a picture beating a paragraph, and its Source
// tab is six lines, so "write this, get this" holds at a glance. The steps
// reconcile: 12.0 + 3.1 + 0.8 - 1.2 - 0.1 = 14.6.
export const HERO_SLIDE = `<!-- @meta{layout=waterfall} -->

## New customers drove the growth. Churn is the biggest drag.

- Last year \`$12.0M\`
- New customers \`+$3.1M\`
- Price \`+$0.8M\`
- Churn \`-$1.2M\`
- Currency \`-$0.1M\`
- This year \`$14.6M\`
`;

// The "Your brand, one line" carousel's slide: one quarterly review re-rendered
// through every palette. It replaces the kpi manifest sample ("Four tiles the eye
// sweeps in one pass"), a slide about slides that both scoring reviews singled out.
// `logo: lattice` is the one built-in mark, so it paints on every surface and
// takes the palette with the rest of the slide — the brand-follows-one-line claim,
// shown. A deck's own logo is a path or URL (lib/base/base.docs.md § logo).
export const BRAND_SLIDE = `---
logo: lattice
---

<!-- @meta{layout=kpi} -->

\`Quarterly review · Q3\`

## Revenue ahead of plan; margin and cash both up.

1. $24M
   - Revenue
   - target $22M \`{On plan}\`
2. 42%
   - Gross margin
   - +2 pts on Q2 \`{On plan}\`
3. $11M
   - Cash
   - +$1.8M on Q2 \`{On plan}\`
`;

export const ROOM_SLIDES: Record<string, string> = {
	boardroom: `<!-- @meta{layout=verdict-grid} -->

## Partnering is the only route inside budget and on time.

- Build
  - [x] Control
  - [!] Cost
  - [!] Timeline
  - Over budget, two years out.
- Acquire
  - [x] Control
  - [!] Cost
  - [x] Timeline
  - Fast, and far too costly.
- Partner
  - [-] Control
  - [x] Cost
  - [x] Timeline
  - Inside budget, live next year.
`,
	pitch: `<!-- @meta{layout=funnel} -->

## The spring campaign filled the top. Too few leads reach a demo.

- Leads \`12,000\`
  - Two-thirds came from the spring campaign
- Qualified \`4,800\`
- Demos \`1,440\`
- Proposals \`860\`
- Closed \`310\`
`,
	// Every source chip names the deck author's own records, never a real agency:
	// a home page that attacks AI tools for invented citations cannot show one.
	briefing: `<!-- @meta{layout=policy-recommendation, class=adopt} -->

\`Ordinance 26-14 · Fare-free crosstown buses\`

## Make the crosstown buses fare-free for a one-year pilot.

- Fares barely cover collecting them
  - $1.1M in fares; $0.9M to collect \`{Transit audit}\`.
- The riders who need it most
  - 61% earn under the area median \`{Rider survey}\`.
- A clear exit
  - Council reviews after twelve months \`{Draft § 4}\`.

> Vote yes on Ordinance 26-14 on May 12.
`,
	lecture: `<!-- @meta{layout=math} -->

\`Week 6 · Linear regression\`

## Least squares has a closed-form answer.

$$ \\hat\\beta = (X^\\top X)^{-1} X^\\top y $$

- $\\hat\\beta$ — the fitted coefficients
- $X$ — the data, $n$ rows by $p$ columns
- $y$ — the outcomes, one per row
`,
	mission: `<!-- @meta{layout=stats} -->

\`Annual report · 2026\`

## What your support made possible this year.

1. 41,000
   - meals served
2. 1,200
   - families housed
3. 86%
   - still housed a year later
4. 92¢
   - of each dollar to programs
`,
	review: `<!-- @meta{layout=gantt} -->

\`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]\`

## The launch holds if the security review lands in Q3.

- Platform
  - Data model \`Q1..Q2\` \`done\`
  - API v2 \`Q2..Q3\` \`live\` \`after=Data model\`
  - Security review \`Q3..Q4\` \`at-risk\` \`after=API v2\`
- Launch
  - Pilot customers \`Q1..Q2\` \`done\`
  - General rollout \`Q3..Q4\` \`after=Security review\`
  - GA \`Q4\` \`milestone\` \`after=General rollout\`
`,
};

// "What does this slide need to do?" — the visual vocabulary grouped by the JOB a slide
// does, inside "Say more with less" (owner's next-round brief, item 5). One live slide
// per job, each a layout NOT already on the page above or below (the hero's waterfall,
// the rooms' verdict grid, funnel, policy recommendation, math, stats and Gantt), so
// the picker widens the vocabulary instead of repeating it. `look` is the one line read
// BEFORE the slide: what to look at, and what it proves (introduce, then look).
export type SlideJob = { job: string; layout: string; look: string; sample: string };

export const SLIDE_JOBS: SlideJob[] = [
	{
		job: 'Compare',
		layout: 'slope',
		look: 'Two regions swapped places, and the crossing lines show it before anyone reads a number.',
		sample: `<!-- @meta{layout=slope} -->

## The West overtook the North this year.

- West
  - Last year \`12\`
  - This year \`19\`
- North
  - Last year \`18\`
  - This year \`14\`
- South
  - Last year \`9\`
  - This year \`11\`
`,
	},
	{
		job: 'Explain',
		layout: 'hub-spoke',
		look: 'One team at the center, and the four groups that depend on it. The one at risk is marked.',
		sample: `<!-- @meta{layout=hub-spoke} -->

\`Operating model · 2027\`

## Every region now buys through one shared desk.

- Shared buying desk
  - North
  - South
  - West \`at-risk\`
  - Central
`,
	},
	{
		job: 'Quantify',
		layout: 'big-number',
		look: 'One number, and one line on what it means. Nothing else competes for the eye.',
		sample: `<!-- @meta{layout=big-number} -->

\`Customer retention · 2026\`

- 94%
  - of customers renewed this year, our best year on record.
`,
	},
	{
		job: 'Sequence',
		layout: 'list-steps',
		look: 'Four steps, left to right, each with one sentence. The order is the message.',
		sample: `<!-- @meta{layout=list-steps} -->

## How the rollout reaches every office by June.

1. Pilot
   - Two offices run the new process for a month.
2. Fix
   - We change what the pilot teams flagged.
3. Train
   - Every manager gets a one-hour session.
4. Launch
   - All offices switch over on June 1.
`,
	},
	{
		job: 'Teach',
		layout: 'glossary',
		look: 'Terms on the left, plain definitions on the right, so a new hire can follow the meeting.',
		sample: `<!-- @meta{layout=glossary} -->

## Three terms you will hear in every review.

- Churn
  - The share of customers who leave in a year.
- Margin
  - What is left of each sale after its direct costs.
- Pipeline
  - The deals a team expects to close, and when.
`,
	},
	{
		job: 'Decide',
		layout: 'decision',
		look: 'The call, named at the top, and why each other option lost.',
		sample: `<!-- @meta{layout=decision} -->

## We will partner, not build.

- Partner
  - Inside budget and live next year.
- Why not build
  - Two years and twice the budget.
- Why not wait
  - A rival launches in the spring.
`,
	},
];

// The venue demo (owner's next-round brief, item 3). ONE five-tile slide, shown in the four
// rooms a 16:9 deck is presented in (lib/core/resolve-venue.js `venue:`). A bigger room sets
// bigger type and the engine never shrinks it back, so the same slide that fits a laptop
// is too full for a conference screen: `lint:deck` warns (`capacity-scale`) and whatever does
// not fit is cut off. The fix is the author's: the same five numbers as two slides.
// engine-facts.ts lints both decks at every venue at BUILD time and the page prints the engine's
// own words; engine-facts.test.ts pins which venues warn, so a change to the
// `stats` budgets fails a test instead of quietly changing what the page claims.
const VENUE_TILES: [string, string][] = [
	['$14.6M', 'revenue, up 22% on last year'],
	['31%', 'gross margin, up four points'],
	['118%', 'net revenue retention'],
	['9 days', 'median time to close a deal'],
	['4.2%', 'annual churn, down from 6%'],
];
const statsSlide = (title: string, tiles: [string, string][]) =>
	`<!-- @meta{layout=stats} -->

## ${title}

${tiles.map(([n, c], i) => `${i + 1}. ${n}\n   - ${c}`).join('\n')}
`;

/** The four rooms, in the engine's order, named as viewing conditions (never as audiences). */
export const VENUES: { venue: string; label: string; who: string }[] = [
	{ venue: 'laptop', label: 'A laptop screen', who: 'one or two people at a desk' },
	{ venue: 'huddle', label: 'A meeting-room TV', who: 'four to six people at a table' },
	{ venue: 'conference', label: 'A conference screen', who: '10 to 30 people in rows' },
	{ venue: 'hall', label: 'An auditorium', who: '50 people or more' },
];

/** The slide body (no front matter): one slide, and the author's fix as two. */
export const VENUE_ONE = statsSlide('The year in five numbers.', VENUE_TILES);
export const VENUE_SPLIT_SLIDES = [
	statsSlide('The year in five numbers: growth.', VENUE_TILES.slice(0, 3)),
	statsSlide('The year in five numbers: efficiency.', VENUE_TILES.slice(3)),
];
export const VENUE_SPLIT = VENUE_SPLIT_SLIDES.join('\n---\n\n');

/** A whole deck at one venue: the `venue:` front matter is the only line that changes. */
export const venueDeck = (venue: string, body: string) => `---\nvenue: ${venue}\n---\n\n${body}`;
