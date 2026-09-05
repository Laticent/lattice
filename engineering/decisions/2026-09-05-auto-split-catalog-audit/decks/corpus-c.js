// The 30 components that do NOT enroll in auto-split. Same authored world;
// the question here is what the un-split terminal looks like at portrait/square.
module.exports = {

title: { variants: ['spectrum'], body: `<!-- _paginate: false -->

# Meridian Health — Q2 board review

\`Board · 14 August 2026\`

The quarter the pipeline work finished and pricing became the question.` },

divider: { variants: ['numbered','light','qr'], body: `<!-- _paginate: false -->

\`Section 02\`

## The Northlake escalation

- https://meridian.example/northlake-review
- Escalation review \`caption\`` },

closing: { variants: ['qr','index','spectrum'], body: `<!-- _paginate: false -->

## Approve the outcome-linked pilot for two accounts.

\`Decision requested today\`

- https://meridian.example/q2-board-pack
- Read the full board pack \`caption\`` },

'big-number': { body: `\`Duplicate pairs\`

- 68%
  - fewer duplicate pairs after per-tenant thresholds shipped.` },

quote: { variants: ['bare'], body: `> We were not counting the same patients you were, and it took us two quarters to be sure.

— Dana Whitfield, CMIO, Northlake Health` },

'citation-card': { variants: ['pull-quote','split','margin','triptych'], body: `## What de-identification actually obliges us to prove.

\`45 C.F.R. § 164.514(b) · safe harbor\`

> ...the covered entity does not have actual knowledge that the information could be used alone or in combination with other information to identify an individual.

- Removing the eighteen identifiers is not the end of the test; actual knowledge is.
- **What we must do.**
  - Record why we believe re-identification is not possible, per tenant, per release.` },

math: { variants: ['feature','derivation','theorem','compare','canvas','matrix','stats','decompose'],
  variantBodies: { stats: `\`Record matching\`

## Why one threshold could not serve every tenant.

$$ P(\\text{match}) = \\sigma(w^\\top \\phi(a,b) + b_t) $$

- $\\phi(a,b)$
  - field-level similarity between two records
- $w$
  - weights, shared across tenants
- $b_t$
  - the per-tenant offset we added this quarter` },
  body: `\`Record matching\`

## Why one threshold could not serve every tenant.

$$ P(\\text{match}) = \\sigma(w^\\top \\phi(a,b) + b_t) $$

- $\\phi(a,b)$ — field-level similarity between two records
- $w$ — weights, shared across tenants
- $b_t$ — the per-tenant offset we added this quarter` },

code: { body: `## The threshold became a per-tenant lookup.

\`\`\`js
const match = (a, b, tenant) =>
  score(a, b) > threshold(tenant, DEFAULT_THRESHOLD);
\`\`\`` },

contact: { body: `## Follow up with me.

- Priya Raman \`name\`
- VP Platform \`title\`
- Meridian Health \`org\`
- priya.raman@example.com \`email\`
- Scan to add me \`caption\`` },

wifi: { body: `\`Board room Wi-Fi\`

## Join the room.

- Meridian-Guest \`ssid\`
- quarterly-review-26 \`password\`
- WPA2 \`security\`
- Scan to connect \`caption\`` },

image: { variants: ['clean','split','spotlight','gallery','statement','mirror'], body: `## The reviewer queue, on the day it cleared.

For two years the queue was the thing everyone apologized for. It is now a dashboard nobody opens.

![bg](assets/sample-photo-wide.svg)` },

video: { variants: ['companion','gallery','qr'], body: `## Watch the ninety-second pipeline walkthrough.

One extract, end to end — the fastest way to see what changed.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Pipeline walkthrough \`caption\`` },

scene: { variants: ['clean','split','spotlight','gallery','statement','mirror'], body: `## How a record pair reaches a reviewer.

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="80" rx="82" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,42 152,96 88,96" fill="var(--accent)"/><circle cx="202" cy="80" r="11" fill="var(--cat-4-mark)"/><rect x="76" y="112" width="88" height="11" rx="3" fill="var(--text-muted)"/></svg>

Two records enter scoring; only the pairs the threshold cannot resolve reach a person.` },

diagram: { body: `## How signals move from extract to decision.

\`\`\`mermaid
flowchart LR
  A[Extract] --> B[Score]
  B --> C{Above threshold?}
  C -->|yes| D[Merge]
  C -->|no| E[Reviewer queue]
\`\`\`` },

'state-chart': { variants: ['lr','inline','curved'], body: `\`Flagged record lifecycle\`

## How a flagged pair resolves.

1. Flagged \`start\`
   - \`review => 2\`
   - \`expire => 5\`
2. In review \`on-track\`
   - \`merge => 3\`
   - \`reject => 4\`
3. Merged \`done\`
4. Kept apart \`done\`
5. Expired \`end\`

*An expired pair returns to the queue at the next extract.*` },

funnel: { body: `## Where the renewal pipeline drops off.

- Qualified \`120\`
- Security review \`74\`
- Pricing agreed \`41\`
- Signed \`18\`` },

piechart: { variants: ['donut'], body: `\`Revenue mix · Q2 2026\`

## Where the quarter's revenue came from.

- Health systems \`52%\`
- Payers \`26%\`
- Research \`14%\`
- Other \`8%\`` },

progress: { body: `\`Delivery · week 24\`

## Where the three workstreams stand.

- Matching \`92%\` \`on-track\`
- Consent \`68%\` \`at-risk\`
- Review queue \`31%\` \`blocked\`` },

quadrant: { variants: ['bubble','trail','cohort','threshold','magic','minimal'], body: `\`Effort 0–10 → Reach 0–100\`

## Where to put the next engineer.

Effort in story points; reach as percent of tenants affected.

- Strategic Bets
  - Cross-tenant model \`3, 70\`
  - Retention automation \`5, 85\`
- Quick Wins
  - Reviewer routing \`8, 80\`
  - SLA alerts \`9, 55\`
- Defer
  - Vendor scoping \`2, 30\`
  - Manual recalibration \`1, 22\`
- Time Sinks
  - Custom audit UI \`7, 18\`
  - Bespoke board export \`9, 28\`` },

radar: { variants: ['target','delta','benchmark','quadrant','small-multiples','minimal'], body: `\`Scale · 0–10\`

## How we score against the two vendors we meet most.

- Meridian
  - Match quality \`9\`
  - Time to connect \`7\`
  - Clinical support \`8\`
  - Compliance \`9\`
  - Price \`6\`
- Ledgerline
  - Match quality \`7\`
  - Time to connect \`9\`
  - Clinical support \`5\`
  - Compliance \`8\`
  - Price \`8\`` },

map: { variants: ['us','world','highlight','robinson','grouped'],
  variantBodies: { us: `## Where our health systems are.

- California \`14\`
- Texas \`9\`
- New York \`7\`
- Illinois \`5\`` },
  body: `## Where the program runs today.

- United States \`35\`
- Canada \`6\`
- United Kingdom \`4\`
- Ireland \`2\`` },

'word-cloud': { variants: ['constellation','dense','spectrum','focal'], body: `## What customers named in this quarter's reviews.

- duplicates \`14\`
- onboarding \`9\`
- reviewers \`7\`
- pricing \`5\`` },

'logo-wall': { variants: ['color','dense'], body: `\`Trusted by\`

## Fourteen health systems run their intake on Meridian.

- ![Northlake](assets/sample-photo-square.svg)
  - Northlake Health
  - \`Since 2023\`
- ![Cascade](assets/sample-photo-square.svg)
  - Cascade Regional
- ![Harbor](assets/sample-photo-square.svg)
- ![Vale](assets/sample-photo-square.svg)
- ![Anders](assets/sample-photo-square.svg)
- ![Pinebrook](assets/sample-photo-square.svg)` },

gantt: { body: `\`2026 Q3 .. 2027 Q2\` \`today 2026 Q4\`

## What ships in each phase, by workstream.

- Matching
  - Per-tenant thresholds \`2026 Q3..2026 Q3\` \`done\`
  - Feedback retraining \`2026 Q4..2027 Q1\` \`live\` \`after: Per-tenant thresholds\`
  - Cross-tenant model \`2027 Q2..2027 Q2\` \`milestone\` \`after: Feedback retraining\`
- Consent
  - Capture at source \`2026 Q3..2026 Q4\` \`done\`
  - Retention windows \`2026 Q4..2027 Q1\`` },

'timeline-list': { body: `\`Northlake · escalation\`

## How the escalation unfolded.

1. \`2026 Mar\` First duplicate report
   - Raised in a support ticket, closed as configuration.
2. \`2026 May\` Escalated to the sponsor \`decision\`
   - Their CMIO put the renewal in question.
3. \`2026 Jun\` Per-tenant thresholds shipped \`live\`
   - Duplicate rate fell by two thirds within a fortnight.` },

'matrix-2x2': { body: `## Where each renewal structure lands.

- **High revenue · Low risk.**
  - Flat platform
- **High revenue · High risk.**
  - Per record
- **Low revenue · Low risk.**
  - Usage tiers
- **Low revenue · High risk.**
  - Outcome-linked` },

'matrix-grid': { body: `## How far each team has taken the new thresholds.

Your position is the diagonal — depth and reach meet at one cell.

\`Wider reach\`  \`Deeper tuning\`

| Depth | One tenant | A cohort | All tenants |
| ---------- | :--: | :--: | :-: |
| Automatic | [ ]  | [-]  | [x] Target |
| Assisted | [-]  | [x] Today | [-] |
| Manual | [x] Q1 | [-]  | [ ]  |

**Where we are** · *reachable*` },

'obligation-matrix': { variants: ['heat','asymmetric','pills','lanes'], body: `## Which regimes oblige which part of the export.

| Regime | Format | Fifteen days | Audit record |
| ---------- | :----------: | :----------: | :----------: |
| Federal   | [ ]          | [ ]          | [-]          |
| State (2027)   | [x]          | [x]          | [x]          |
| Contract   | [x]          | [-]          | [ ]          |

Filled = applies, half = partial, empty = exempt.` },

pricing: { variants: ['two','four'], body: `## The three renewal structures, as a customer sees them.

- Per record \`$0.14 / record\`
  - [x] Volume discounts
  - [/] Savings guarantee
  - For pilots and low-volume sites.
- Flat platform \`$240K / yr\` *Most chosen*
  - [x] Volume discounts
  - [x] Named reviewer
  - For steady, forecastable programs.
- Outcome-linked \`Custom\`
  - [x] Named reviewer
  - [x] Savings guarantee
  - For systems that will share the measured savings.` },

'split-compare': { body: `\`Decision Required\`

## Build the audit log, or buy it.

SB 1104 obliges us to produce an audit record from July 2027, and we have one quarter of engineering to spend.

- Build it ourselves
  - Two engineers for a quarter
  - Retention rules stay in our model
- Buy Ledgerline
  - Live in six weeks, already certified
  - A fourth processor touching patient-adjacent records

> Buy it, and spend the quarter on matching.` },

};
