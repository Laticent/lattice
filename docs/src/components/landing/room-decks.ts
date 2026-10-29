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
export const HERO_SLIDE = `<!-- _class: waterfall -->

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

<!-- _class: kpi -->

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
	boardroom: `<!-- _class: verdict-grid -->

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
	pitch: `<!-- _class: funnel -->

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
	briefing: `<!-- _class: policy-recommendation adopt -->

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
	lecture: `<!-- _class: math -->

\`Week 6 · Linear regression\`

## Least squares has a closed-form answer.

$$ \\hat\\beta = (X^\\top X)^{-1} X^\\top y $$

- $\\hat\\beta$ — the fitted coefficients
- $X$ — the data, $n$ rows by $p$ columns
- $y$ — the outcomes, one per row
`,
	mission: `<!-- _class: stats -->

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
	review: `<!-- _class: gantt -->

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
