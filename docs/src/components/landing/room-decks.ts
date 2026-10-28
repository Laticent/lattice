// The one-slide sources the home page renders live: the "say more with less"
// before/after slide and one slide per audience room. Each is authored for its
// room rather than lifted from a manifest `sample`, because a manifest sample
// describes its own layout ("The grid scores options against shared criteria")
// and a room card has to read as that room's real work. The briefing borrows
// the policy-recommendation sample, which is already a real bill.
//
// Every slide follows its component's `.docs.md` contract (HARD RULE #6) and is
// keyed by the `data-live-card` name the host carries in sections.tsx.
// See engineering/decisions/2026-10-28-home-positioning-audit.md §5–§6.

// The "after" half of the before/after. The "before" memo in sections.tsx says
// the same thing in prose. A waterfall, not a verdict grid: the hero preview
// directly above already shows a verdict grid, and a walk from one number to
// another is the clearest case of a picture beating a paragraph. The steps
// reconcile: 12.0 + 3.1 + 0.8 - 1.2 - 0.1 = 14.6.
export const SAY_MORE_SLIDE = `<!-- _class: waterfall -->

## New customers drove the growth. Churn is the biggest drag.

- Last year \`$12.0M\`
- New customers \`+$3.1M\`
- Price \`+$0.8M\`
- Churn \`-$1.2M\`
- Currency \`-$0.1M\`
- This year \`$14.6M\`
`;

export const ROOM_SLIDES: Record<string, string | { manifest: string }> = {
	boardroom: `<!-- _class: decision -->

\`Board decision · Q3\`

## We build the platform in-house.

- Build
  - We keep the pricing logic, the roadmap, and the customer data. Ready in two quarters.
- Why not buy
  - Both vendors lock the pricing rules inside their product, and cost more by year three.
- Why not wait
  - Two competitors launch next spring. Waiting hands them the window.
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
	briefing: { manifest: 'policy-recommendation' },
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
