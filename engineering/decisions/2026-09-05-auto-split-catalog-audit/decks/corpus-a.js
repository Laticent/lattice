// Representative authored content — Meridian Health, a clinical-data company.
// Every slide is written at the component's `sweet` capacity: a normal author's
// slide, not a stress fixture.
module.exports = {

actors: { body: `## Who owns each part of the intake pipeline.

- Owns connector health and vendor escalation \`Platform\`
  - Pages on ingest failure; owns the vendor SLA review each Friday.
- Owns record matching and duplicate policy \`Data Science\`
  - Sets the match threshold; signs off on any change above 0.02.
- Owns consent capture and retention windows \`Privacy\`
  - Final word on what we may store, and for how long.
- Owns the clinical review queue \`Medical Affairs\`
  - Clears flagged records within two business days.` },

agenda: { variants: ['progress-1','progress-2','progress-3','progress-4','progress-5','progress-6','circles','rail','cards','checks'],
  body: `## What the board is deciding today.

1. Where the quarter landed against plan
2. The Northlake integration, and what it cost
3. Renewing the Cascade contract
4. Hiring plan for the second half` },

'authority-chain': { variants: ['branching','trail','pyramid','bracket'],
  body: `## De-identification — what governs the standard we apply.

1. HIPAA Privacy Rule
   - \`45 C.F.R. § 164.514\`
   - Sets the two paths to de-identification: expert determination or safe harbor.
2. HHS Guidance
   - \`OCR De-identification Guidance (2012)\`
   - Explains what an expert determination has to document.
3. State law
   - \`Cal. Civ. Code § 1798.145\`
   - Adds a re-identification prohibition federal law leaves to contract.
4. Our contracts
   - \`Master Data Agreement § 7\`
   - Binds every customer to the stricter of the two.` },

'cards-grid': { variants: ['four','three','numbered'],
  body: `## Three things changed in the market this quarter.

- Payers consolidated
  - Two of our four largest customers merged, and procurement moved to one desk.
- Pricing moved to outcomes
  - Per-record pricing is losing to contracts tied to measured savings.
- Compliance got expensive
  - The new state rules add an audit obligation nobody has staffed for.` },

'cards-stack': { variants: ['horizontal','numbered'],
  body: `## How we plan to answer the Northlake escalation.

- Fix the matching threshold first
  - Their duplicate rate is four times ours. One parameter explains most of it.
- Give them a named clinical reviewer
  - Their queue is being cleared by a rotation, and the rotation is the complaint.
- Re-baseline the SLA in writing
  - The current one predates their volume, and neither side reads it the same way.` },

checklist: { body: `## Before the Cascade renewal goes to signature.

- [x] Security review closed with no open findings
- [x] Data-processing addendum countersigned
- [x] Volume forecast reconciled with Finance
- [-] Clinical review staffing confirmed through Q1
- [ ] Pricing approved by the deal desk
- [ ] Legal sign-off on the re-identification clause` },

'compare-code': { body: `## The matching threshold, before and after.

\`Before\`

\`\`\`js
const match = (a, b) => score(a, b) > 0.86;
\`\`\`

\`After\`

\`\`\`js
const match = (a, b, tenant) =>
  score(a, b) > threshold(tenant, 0.86);
\`\`\`` },

'compare-prose': { variants: ['transition','mirror','chosen','decision','vertical','banner-tag','rejected','axis'],
  body: `## Build the audit log, or buy it.

- Build it ourselves
  - Two engineers for a quarter, and it fits the record model we already have. We would own the retention rules outright.
- Buy Ledgerline
  - Live in six weeks and already certified. We would be exporting patient-adjacent records to a fourth processor.` },

'compare-table': { body: `## How the three renewal structures compare.

| Criterion | Per record | Flat platform | Outcome-linked |
| --- | --- | --- | --- |
| Year-one revenue | $2.1M | $2.4M | $1.6M |
| Revenue at risk | Low | None | High |
| Customer preference | Third | Second | First |
| Finance can forecast it | Yes | Yes | No |` },

content: { body: `## Where the quarter landed.

Revenue came in ahead of plan on the strength of two renewals that closed early. The constraint is no longer demand.

- **Revenue** closed at $4.2M, eleven percent ahead of plan
- **Churn** fell to 1.8% after the onboarding rebuild
- **Pipeline** coverage sits at 3.1x going into Q3
- **Hiring** is two engineers behind, with both offers out

> Growth is holding; capacity is the constraint.` },

cycle: { body: `## How a flagged record moves through review.

- Flagged
  - The matcher scores the pair below threshold and holds it.
- Reviewed
  - A clinical reviewer accepts, rejects, or asks the vendor.
- Resolved
  - The decision is written back and the pair is retired.
- Learned
  - The week's decisions retrain the threshold for that tenant.` },

decision: { variants: ['banner-tag'],
  body: `## We are buying the audit log, not building it.

- Buy Ledgerline
  - Certified, live in six weeks, and it frees the two engineers the matching work needs.
- Build it ourselves
  - Cleaner data model, but a quarter of engineering we would be spending against a deadline we do not control.` },

glossary: { body: `## The terms this deck uses.

- Match threshold
  - The similarity score above which two records are treated as the same patient.
- Flagged record
  - A pair the matcher could not resolve, held for a clinical reviewer.
- Safe harbor
  - The HIPAA path that removes eighteen identifiers instead of proving low risk.
- Tenant
  - One customer's data, kept in its own partition with its own thresholds.` },

inventory: { variants: ['cards','timeline','editorial'],
  body: `\`Q2 2026\`

## What we shipped against the plan.

- **Connector v2.** Cut ingest failures from nine a week to under one.
- **Per-tenant thresholds.** Northlake's duplicate rate fell by two thirds.
- **Consent capture.** Now recorded at the source rather than inferred.
- **Reviewer queue.** Median clearing time went from four days to one.

> The pipeline work is done. Nothing left this quarter is a platform problem.` },

journey: { variants: ['heatmap','curve','swimlane','weighted'],
  body: `## What onboarding a new health system feels like.

- Contracting
  - Security review \`@customer\` \`:2\`
  - Data agreement \`@legal\` \`:3\`
- Connection
  - Credentials issued \`@customer\` \`:2\`
  - First extract lands \`@platform\` \`:4\`
- Validation
  - Match rate reviewed \`@clinical\` \`:3\`
  - Thresholds tuned \`@data\` \`:5\`` },

kanban: { variants: ['keyline','tinted'],
  body: `\`Platform · week 24\`

## Where the integration work stands.

- Committed
  - Northlake threshold rollout \`M\`
    - platform
  - Consent backfill \`L\`
    - privacy \`at-risk\`
- In progress
  - Reviewer queue SLA dashboard \`S\`
    - clinical
- Shipped
  - Connector v2 \`M\`
    - platform` },

kpi: { variants: ['attention','ops','compliance','trajectory','spotlight'],
  body: `## Revenue ahead of plan; churn and coverage both improved.

1. $4.2M
   - Quarterly revenue
   - plan $3.8M · +11% \`Ahead\` \`Board\`
2. 1.8%
   - Net churn
   - −0.9pp QoQ \`Ahead\` \`Customer\`
3. 3.1x
   - Pipeline coverage
   - target 3.0x \`On plan\` \`Sales\`` },

list: { variants: ['takeaway','principles','numbered','lettered','roman','bullet'],
  body: `## What we learned from the Northlake escalation.

- One parameter explained most of the duplicate rate.
- Nobody owned the reviewer queue between rotations.
- The SLA predated their volume by two years.
- The customer told us in March; it reached us in May.` },

'list-criteria': { body: `## What a renewal has to satisfy before we sign it.

1. Priced against measured savings
   - The customer can point at the number the contract is tied to.
2. Staffed for clinical review
   - Named reviewers through the term, not a rotation.
3. Retention written down
   - Windows in the addendum, not in a support ticket.
4. One escalation path
   - A named owner on both sides who answers within a day.` },

'list-steps': { variants: ['vertical','chevron','converge','ghost','timeline','phase','milestone','lettered','stage','rank','tier','roman','capsule'],
  body: `## How we roll the new thresholds out.

1. Shadow — run the new threshold beside the old and compare, no writes.
2. Pilot — cut Northlake over, with the old value one flag away.
3. Widen — move the remaining tenants a cohort a week.
4. Retire — delete the global constant and the flag with it.` },

};
