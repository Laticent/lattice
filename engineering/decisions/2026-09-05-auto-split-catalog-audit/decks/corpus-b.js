module.exports = {

'list-tabular': { variants: ['def','metric','spec','register','rule','solid','stacked','outline','fit-name','fit-body','fit-meta','flex-name','flex-meta','fixed'],
  body: `## The four contracts up for renewal this half.

1. Northlake Health
   - $1.4M · renews September · duplicate-rate escalation open
2. Cascade Regional
   - $980K · renews November · security review closed
3. Harbor Physicians
   - $620K · renews October · moving to outcome pricing
4. Vale Medical Group
   - $410K · renews December · no open issues` },

'policy-recommendation': { variants: ['adopt','amend','oppose','defer'],
  body: `\`SB 1104 · Health Data Portability\`

## We should support SB 1104, with one amendment to the audit clause.

The bill standardizes export formats we already meet, and adds an audit obligation written for insurers rather than processors.

- Standardizes the export format
  - Three of our four largest customers already require it. \`§ 4(a)\`
- Shortens the response window to fifteen days
  - We clear exports in six on median. \`Ops data, Q2 2026\`
- Audit clause is drafted for insurers
  - As written it obliges us to retain records the privacy rule tells us to delete. \`§ 9(c)\`

> Support, and ask the sponsor to scope § 9(c) to covered entities.` },

premise: { body: `## Duplicate records, not data volume, are what the pipeline costs us.

Every downstream problem this quarter traced back to two records for one patient. The ledger below walks what that costs and where.

1. Reviewer time
   - Ninety minutes a day clearing pairs a threshold should have resolved.
   - What would the queue look like at the right threshold?
2. Customer trust
   - Northlake's escalation named duplicates, not latency or uptime.
   - Which of our accounts are quietly counting the same thing?
3. Clinical risk
   - A split record is a split medication history.
   - How would we know if one had reached a care decision?
4. Revenue
   - Outcome-linked pricing pays on savings a duplicate erases.
   - What is the ceiling on the new pricing until this is fixed?` },

'q-and-a': { variants: ['spine','rail','tab','grid','solo'],
  body: `## What the board is likely to ask.

- Is the Northlake escalation closed?
  - The technical cause is fixed and their duplicate rate is down two thirds. The relationship is not closed; we owe them a named reviewer and a re-baselined SLA in September.
- Why is hiring behind?
  - Two offers are out against a plan of four. Both are clinical reviewers, and the market for them tightened after the state rules landed.
- Does outcome pricing put revenue at risk?
  - Yes, roughly $500K in year one. It is the structure three of four customers asked for.
- What happens if SB 1104 passes unamended?
  - We would hold records the privacy rule tells us to delete. Counsel thinks the conflict is fixable in committee.` },

redline: { variants: ['annotated','three-col','split','stacked'],
  body: `## The audit clause, as we would amend it.

\`SB 1104 § 9(c) · committee draft\`

> Each <del>entity</del> <ins>covered entity</ins> shall retain audit records for <del>seven years</del> <ins>the shorter of seven years or the applicable retention period</ins>.

- **Why this matters.** As drafted the clause obliges a processor to keep records the privacy rule requires it to delete.` },

'regulatory-update': { variants: ['timeline','priority','cards','diff-bands'],
  body: `## What changed for us this quarter.

\`Health data · state tier\`

1. Re-identification prohibition
   - \`Cal. Civ. Code § 1798.145\`
   - Contractual bans are now statutory, with a private right of action.
   - \`Effective Jan 2027\`
2. Export format standard
   - \`SB 1104 § 4(a)\`
   - Codifies the format three of our four largest customers already demand.
   - \`Effective Jul 2027\`
3. Audit retention
   - \`SB 1104 § 9(c)\`
   - Seven-year retention drafted for insurers, applied to processors.
   - \`Effective Jul 2027\`
4. Breach notice window
   - \`Rev. Health Code § 22.4\`
   - Shortens notice to thirty days and names the processor directly.
   - \`Effective Mar 2027\`` },

roadmap: { variants: ['horizons','status','swimlane','milestones'],
  body: `## What ships in each phase, by workstream.

| Workstream | Foundation \`Q3 2026\` | Hardening \`Q4 2026\` | Scale \`Q1 2027\` |
| --- | --- | --- | --- |
| Matching | [x] Per-tenant thresholds | [-] Feedback retraining | [ ] Cross-tenant model |
| Consent | [x] Capture at source | [-] Retention windows | [ ] Automated deletion |
| Review queue | [x] SLA dashboard | [/] Reviewer routing | [ ] Auto-clear low risk |

Markers are universal: shipped, in flight, planned, out of scope.` },

'split-panel': { variantBodies: {
  pullquote: `\`Northlake · escalation review\`

## What the customer actually told us.

> We were not counting the same patients you were, and it took us two quarters to be sure.

- Duplicate rate
  - Four times ours, on the same extract.
- Time to reach us
  - Two months, through three handoffs.
- What fixed it
  - One threshold, set per tenant.`,
  qr: `\`Platform · Q2 2026\`

## The pipeline work is finished.

Three changes closed the gap between what we promised on ingest and what we delivered.

- https://meridian.example/q2-platform-review
- Read the full review \`caption\`
- Connector v2
  - Ingest failures fell from nine a week to under one.
- Per-tenant thresholds
  - Northlake's duplicate rate dropped by two thirds.`,
 }, variants: ['metric','pullquote','steps','watermark','proof','capstone','mirror','qr','cat-1','cat-2','cat-3','cat-4','cat-5','cat-6','cat-7','cat-8'],
  body: `\`Platform · Q2 2026\`

## The pipeline work is finished.

Three changes closed the gap between what we promised on ingest and what we delivered.

- Connector v2
  - Ingest failures fell from nine a week to under one.
- Per-tenant thresholds
  - Northlake's duplicate rate dropped by two thirds.
- Consent at source
  - Captured on the record, no longer inferred downstream.` },

stats: { body: `\`Pilot results · six months\`

## What the threshold change bought, across four health systems.

\`Measured against the pre-change baseline, same tenants, same volume.\`

1. 68%
   - fewer duplicate pairs
2. 4.1x
   - reviewer throughput
3. −3d
   - median clearing time
4. $410K
   - review hours saved` },

'statute-stack': { variants: ['hierarchy','bands','preemption','lane'],
  body: `## What three regimes require of the same export.

- Federal \`45 C.F.R. § 164.524\`
  - Thirty days to produce a designated record set on request.
  - \`In force\`
- State \`SB 1104 § 4(a)\`
  - Fifteen days, in a standardized format, with an audit record.
  - \`Effective Jul 2027\`
- Contract \`Master Data Agreement § 5\`
  - Ten business days, and we indemnify the customer for a miss.
  - \`In force\`` },

'verdict-grid': { body: `## Which renewal structure meets the criteria.

- **Per record.**
  - [x] Finance can forecast it
  - [-] Customer asked for it
  - [ ] Priced against savings
  - Predictable for us, and the structure every customer is trying to leave.
- **Flat platform.**
  - [x] Finance can forecast it
  - [x] Customer asked for it
  - [ ] Priced against savings
  - Safest revenue, but it does not answer the question customers keep asking.
- **Outcome-linked.**
  - [-] Finance can forecast it
  - [x] Customer asked for it
  - [x] Priced against savings
  - Roughly $500K at risk in year one, and the only structure that survives the next cycle. Recommended.` },

};
