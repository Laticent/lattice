/**
 * PROTECTED-machinery regression — the stage-clip SHEAR class, swept.
 *
 * `.cell-stage` (lib/forms/cell/stage/stage.css) is a bounded clipping cell:
 * `flex: 1 1 auto; min-height: 0; overflow: clip`. A component body that is a flex
 * ITEM of that cell keeps the flexbox default `min-height: auto` — a CONTENT-height
 * floor — unless it says otherwise, so it refuses to shrink into the cell that clips
 * it and the stage shears the component's chrome: a card's bottom border, its radii,
 * the bottom edge of a filled panel. In the case that opened this class (#2046,
 * `list-steps`) not one word of text was lost; the damage was pure chrome, on a slide
 * the export then warned had been clipped.
 *
 * This file is the sweep that followed. Nine declarations across eight components were
 * measured shearing at `size: hd` and fixed; each one is pinned here by the two arms
 * that made the fix defensible in the first place:
 *
 *   1. DENSE — content thick enough that the box would have overrun. Nothing may hang
 *      past the stage's clip edge, and nothing may sit ABOVE the stage's top edge
 *      either (see the head-loss arms below). On six of the nine the loss was chrome
 *      only, with every word still inside; on `citation-card.pull-quote`,
 *      `citation-card.split` and `cycle` the fixture also loses text, so the fix
 *      recovers words as well as chrome and the residual spill stays visible with
 *      `over: true`. Do not read the dense arm as "this slide fits".
 *   2. OVERSTUFFED — content that genuinely cannot fit. The real overflow probe must
 *      still read `over: true`. Releasing a floor buys a closed frame; it must not buy
 *      it by swallowing an overflow the export's "Content clipped" tag exists to
 *      report. That trap is not hypothetical — `kpi.styles.css` records the same fix
 *      being tried, shipped and reverted for exactly this reason (#1277).
 *
 * THE HEAD-LOSS ARMS are the other half, and they are why this file measures the TOP
 * edge as well. A box that centers and then overflows splits the excess evenly, so half
 * of it goes off the BLOCK-START edge — and block-start overflow does not grow
 * `scrollHeight`, so nothing else in this system can see it. A cut tail announces
 * itself; a cut head does not (stage.css § safe alignment, #1299). `cycle` was losing
 * 16.75px of real text off the top of a slide that looked fine, and
 * `citation-card.split` 21.02px.
 *
 * Needs Chromium + the emulator (renders each deck, measures the laid-out DOM).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, probeSectionOverflow } = require('../../../lib/core/overflow-probe');

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// `size:` is omitted on purpose. `hd` (1280x720) is the default and the shortest
// landscape stage, which is where the shear bites first — it is aspect ratio, not
// resolution, so 4k shears the same proportion and `standard` (4:3) often does not
// reproduce at all.
function deck(sample) {
  return `---\nmarp: true\ntheme: indaco\n---\n\n${sample.trim()}\n`;
}


// Each case is one slide, measured as authored. `dense` is the fixture that shears
// without the fix; `overstuffed` is the control that must keep its overflow ring. The
// px figures in the comments are what this harness measured BEFORE the corresponding
// declaration landed — remove that declaration and the dense arm reports them back.
const CASES = [
  {
    key: 'compare-prose',
    what: 'compare-prose · the card row',
    note: '445.06px row in a 438.22px stage, 6.84px of both card borders, radii and shadows shorn, ink 14.34px inside',
    mode: 'full',
    dense: `<!-- DENSE A — one-line heading, four extra body lines a side. -->

<!-- _class: compare-prose -->

## Rebuild the ingest, or wrap the vendor feed.

- Rebuild the ingest
  - We own the parser end to end, so a malformed batch fails at our boundary, with our error text, and the on-call engineer reads a trace written in our own vocabulary rather than a vendor code.
  - The cost is a full quarter of platform time and a migration window we have to schedule around the audit, which lands in the same six weeks.
  - The second connector then costs a week.
  - Eleven downstream teams re-point once.
  - Our keys, our rotation, our region.
  - Schema changes ship the same day.
- Wrap the vendor feed
  - The vendor keeps the parser and we keep a thin adapter, so the work lands in three weeks instead of thirteen and the roadmap behind it does not slip.
  - The cost is that every malformed batch becomes a support ticket we cannot close ourselves, and the audit sees a control we do not operate.
  - The second connector costs a quarter again.
  - Nobody re-points, and nobody owns it.
  - Vendor keys, vendor region, vendor queue.
  - Schema changes wait a fortnight.`,
    overstuffed: `<!-- OVERSTUFFED CONTROL -->

<!-- _class: compare-prose -->

## Overstuffed control — the same choice, at four times the length.

- Rebuild the ingest
  - We own the parser end to end, so a malformed batch fails at our boundary, with our error text, and the on-call engineer reads a trace written in our own vocabulary rather than a vendor status code nobody on the team can decode at two in the morning.
  - The cost is a full quarter of platform time and a migration window we have to schedule around the audit, which lands in the same six weeks and cannot move because the regulator set the date.
  - Every downstream consumer re-points at our endpoint, which means eleven teams take a coordination cost they did not budget for this half, and two of them are already carrying a freeze.
  - The upside compounds: the second connector costs a week instead of a quarter, and the third costs a day, because the boundary is ours and the shape is already proven in production.
- Wrap the vendor feed
  - The vendor keeps the parser and we keep a thin adapter, so the work lands in three weeks instead of thirteen and the roadmap behind it does not slip a single sprint.
  - The cost is that every malformed batch becomes a support ticket we cannot close ourselves, and the audit sees a control we do not operate and cannot evidence on our own timetable.
  - The adapter is disposable by construction, so nothing here forecloses the rebuild — it buys the quarter back and defers the decision to a point where we know the real volume.
  - The risk is that a temporary adapter becomes permanent, as the last two did, and the team inherits a boundary nobody owns and a vendor contract nobody can renegotiate.`,
  },
  {
    key: 'decision',
    what: 'decision · the option row',
    note: '412.88px row in a 393.44px stage, 19.44px shorn including the 3px --decision-accent bottom border, ink 11.75px inside',
    mode: 'full',
    dense: `<!-- DENSE — two-line heading (393px stage), ten-line justification on the tallest card. -->

<!-- _class: decision -->

## We are rebuilding the ingest ourselves rather than wrapping the vendor feed.

- Rebuild
  - The parser boundary is ours, so a malformed batch fails in our vocabulary and the on-call engineer reads a trace instead of a vendor status code at two in the morning. The second connector then costs a week rather than a quarter, because the shape is proven in production and the tests come with it.
- Why not wrap
  - A thin adapter buys a quarter back, but the audit sees a control we do not operate and cannot evidence on our own timetable. The last two temporary adapters are still in production three years on, owned by nobody, and the contract cannot be renegotiated until renewal.
- Why not buy
  - The managed offer clears the audit and costs one engineer to integrate, but the exit price is data egress plus a rewrite, and the contract runs three years with automatic renewal. Throughput is contractual, so a peak we could absorb becomes a purchase order.`,
    overstuffed: `<!-- OVERSTUFFED CONTROL -->

<!-- _class: decision -->

## Overstuffed control — four options, each at paragraph length.

- Rebuild
  - The parser boundary is ours, so a malformed batch fails in our vocabulary and the on-call engineer reads a trace instead of a vendor status code at two in the morning. The second connector then costs a week rather than a quarter, because the shape is proven in production and the tests come with it.
- Why not wrap
  - A thin adapter buys a quarter back, but the audit sees a control we do not operate and cannot evidence on our own timetable. The last two temporary adapters are still in production three years on, owned by nobody, and the vendor contract that governs them cannot be renegotiated until renewal.
- Why not buy
  - The managed offer clears the audit and costs one engineer to integrate, but the exit price is data egress plus a rewrite, and the contract runs three years with automatic renewal. Throughput is contractual rather than physical, so a peak we can absorb today becomes a purchase order next quarter.
- Why not defer
  - Deferring keeps the current script running, which nobody has read since the author left, and it fails silently on any batch above four megabytes. Every week of deferral adds another consumer to the eleven already reading from it, and each one raises the eventual coordination cost.`,
  },
  {
    key: 'redline',
    what: 'redline · the plain clause',
    note: '429.28px clause against a 406.28px share, 23px of bottom border, radius and left rail shorn, ink 6.33px inside',
    mode: 'full',
    dense: `<!-- DENSE — base shape, one blockquote, no trailing list. -->

<!-- _class: redline -->

## The opt-out clause gains a homepage link mandate.

\`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)\`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins> designated method for submitting requests to opt-out, <ins>including, at minimum, a clear and conspicuous link on the business's internet homepage, titled "Your Privacy Choices" or "Your California Privacy Choices," and an opt-out icon approved by the Attorney General,</ins> for use by consumers.
>
> A business that <del>complies with subdivision (a)</del> <ins>processes an opt-out request received through the method described above</ins> shall <ins>treat that request as applying to every service provider and contractor to which it has disclosed the consumer's personal information, and</ins> shall not require the consumer to <del>create an account</del> <ins>verify their identity, create an account, or provide any information beyond that necessary to process the request</ins>, <ins>nor charge any fee, nor impose any additional step not required of a consumer who has not opted out, nor degrade the quality of the service provided</ins>.`,
    overstuffed: `<!-- OVERSTUFFED CONTROL — base shape, four subdivisions. -->

<!-- _class: redline -->

## Overstuffed control — the same clause with three further subdivisions.

\`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)\`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins> designated method for submitting requests to opt-out, <ins>including, at minimum, a clear and conspicuous link on the business's internet homepage, titled "Your Privacy Choices" or "Your California Privacy Choices," and an opt-out icon approved by the Attorney General,</ins> for use by consumers.
>
> A business that <del>complies with subdivision (a)</del> <ins>processes an opt-out request received through the method described above</ins> shall <ins>treat that request as applying to every service provider and contractor to which it has disclosed the consumer's personal information, and</ins> shall not require the consumer to <del>create an account</del> <ins>verify their identity, create an account, or provide any information beyond that necessary to process the request</ins>.
>
> A business shall <ins>honor an opt-out preference signal sent with the consumer's consent by a platform, technology, or mechanism, and shall not require the consumer to provide additional information beyond that strictly necessary,</ins> and shall <del>respond within forty-five days</del> <ins>respond no later than fifteen business days from the date of receipt</ins>.
>
> A business that <ins>knowingly</ins> violates this section <del>may</del> <ins>shall</ins> be liable for a civil penalty of <del>two thousand five hundred dollars</del> <ins>seven thousand five hundred dollars</ins> per violation, <ins>assessed per consumer per day the violation continues,</ins> in an action brought by the Attorney General.`,
  },
  {
    key: 'matrix-2x2',
    what: 'matrix-2x2 · the quadrant list',
    note: '448.78px list in a 438.22px stage, both bottom quadrants 10.56px out, ink 18.11px inside',
    mode: 'full',
    dense: `<!-- _class: matrix-2x2 -->

## Dense: three items a cell.

- **High impact on the renewal · Low effort for the platform team.**
  - Ship the residency flag
  - Export the audit log
  - Publish the runbook
- **High impact on the renewal · High effort for the platform team.**
  - Re-platform the ledger
  - Renegotiate all three
  - Land the second region
- **Low impact on the renewal · Low effort for the platform team.**
  - Tidy the dashboards
  - Delete dead flags
  - Rename the cluster
- **Low impact on the renewal · High effort for the platform team.**
  - Rewrite the console
  - Custom reporting
  - Migrate the wiki`,
    overstuffed: `<!-- _class: matrix-2x2 -->

## Overstuffed: four quadrants at three times the ceiling.

- **High impact · Low effort.**
  - Ship the residency flag this sprint, behind the existing gate
  - Turn on the audit log export and retain it for the term plus one year
  - Publish the recovery runbook to the wiki and link it from the on-call page
  - Name an owner for the twice-yearly cutover drill and put it on the calendar
  - Cap the renewal at index plus two points before the notice window closes
  - Write the exit format into the schema doc so the ninety days actually work
- **High impact · High effort.**
  - Re-platform the ledger service onto the new storage tier
  - Renegotiate the renewal cap across all three contracts at once
  - Land the second region with real failover, not a warm standby
  - Retire the legacy connector and everything downstream that reads from it
  - Rebuild the reporting pipeline so the regulator query runs in minutes
  - Move the identity provider before the current one is end of life
- **Low impact · Low effort.**
  - Tidy the dashboards nobody has opened since the last incident
  - Delete the dead feature flags that still branch in three services
  - Rename the staging cluster so it stops reading as production
  - Archive the old runbooks that contradict the published one
  - Fix the broken links in the onboarding doc for the fourth time
  - Consolidate the four alerting channels back down to one
- **Low impact · High effort.**
  - Rewrite the admin console because the framework is out of fashion
  - Build custom reporting for one team that asked politely
  - Migrate the wiki again, to the platform we will leave next year
  - Chase the vanity certification no customer has ever asked about
  - Localize the internal tooling for a region with two employees
  - Rebuild the design system a third time before adopting the second`,
  },
  {
    key: 'statute-stack',
    what: 'statute-stack · the three rails',
    note: '446.63px row in a 438.22px stage, ALL THREE rails 8.41px out, ink 21.66px inside',
    mode: 'full',
    dense: `<!-- _class: statute-stack -->

## Dense rail: three jurisdictions.

- Federal \`15 U.S.C. §6501\`
  - Verifiable parental consent before any personal data of a child under thirteen is collected, used, or disclosed to a third party, with the method of verification recorded and kept for the whole retention window the rule sets out for an operator of a general audience service that knows a child is on it.
  - \`In effect since 2000\`
- State \`Cal. Civ. §1798.120\`
  - Opt-in consent for selling or sharing data of a consumer under sixteen, and a standing opt-out right for everyone above that line.
  - \`Enforced since 2023\`
- Local \`NYC §22-1201\`
  - Annual bias audit of any automated employment decision tool, published before the tool is used on a candidate in the city.
  - \`Effective 2023\``,
    overstuffed: `<!-- _class: statute-stack -->

## Overstuffed rail: three jurisdictions at four times the ceiling.

- Federal \`15 U.S.C. §6501\`
  - Verifiable parental consent before any personal data of a child under thirteen is collected, used, or disclosed to a third party, with the method of verification recorded and retained.
  - The operator must publish a notice describing what is collected, how it is used, and whether it is shared, in language a parent can read without a lawyer beside them.
  - A parent may review the record, demand deletion, and refuse further collection at any time, and the operator must honor the refusal without conditioning the service on it.
  - \`In effect since 2000\`
- State \`Cal. Civ. §1798.120\`
  - Opt-in consent for selling or sharing the data of a consumer under sixteen, and a standing opt-out right for every consumer above that line, honored within fifteen business days.
  - The opt-out signal must be honored globally rather than per device, and a browser-level preference counts as a valid request under the regulations issued in 2023.
  - Contracts with every downstream recipient must carry the same restrictions, and a recipient who ignores them makes the disclosing business liable for the breach.
  - \`Enforced since 2023\`
- Local \`NYC §22-1201\`
  - Annual bias audit of any automated employment decision tool, published before the tool is used on a candidate for a position located in the city.
  - Candidates get ten business days notice that the tool will be used, the qualifications it assesses, and the data sources behind that assessment.
  - The published summary must show selection rates and impact ratios by race, ethnicity, and sex, computed by an auditor with no stake in the outcome.
  - \`Effective 2023\``,
  },
  {
    key: 'policy-recommendation',
    what: 'policy-recommendation · the rationale list',
    note: 'the list held 282.56px against a 276.12px share and pushed the ask bar 6.44px out, ink 14.56px inside',
    mode: 'full',
    dense: `<!-- _class: policy-recommendation adopt -->

## Three reasons, one-line impact — the brief fits.

Fifty state regimes bind the same scoring model.

- The audit trail already exists
  - Every score is logged and signed \`SB 24-205\`.
- Compliance is a moat, not a cost
  - Disputes fell 31% in the sampled cohort \`HAI 2025\`.
- One federal floor beats fifty ceilings
  - The state duties retire without lowering the bar \`Title III\`.

> Co-sponsor the deployer-duties title in § 4.`,
    overstuffed: `<!-- _class: policy-recommendation oppose -->

## Ten reasons — genuinely cannot fit.

Fifty state regimes now bind the same scoring model, and the cheapest of them sets the ceiling on what we can promise a regulator in any of the other forty-nine states.

- The audit trail already exists
  - Every score is logged, signed, and DSAR-exportable on the day it is written \`Colorado SB 24-205\`.
- Compliance is a moat, not a cost
  - Logged decisions saw 31% fewer disputes reach litigation across the sampled cohort \`Stanford HAI 2025\`.
- One federal floor beats fifty ceilings
  - Retires the conflicting state duties without lowering the bar any single state set \`EU AI Act Title III\`.
- The record is already portable
  - The decision log exports in the schema the conformity assessment asks for \`Annex IV\`.
- Enforcement is cheaper than adjudication
  - A published floor moves the argument from discovery to a filing \`GAO-25-106\`.
- The market has priced it already
  - Three of the five largest deployers ship the duties voluntarily \`10-K 2025\`.
- The definitions are settled
  - "Consequential decision" carries the same meaning in four enacted statutes \`NCSL 2026\`.
- The reporting burden is marginal
  - Deployers already file the same fields under the breach rules \`FTC 16 CFR 314\`.
- Interoperability is the real prize
  - A single schema lets an auditor read every deployer's log without translation \`NIST AI 600-1\`.
- The alternative is a patchwork
  - Nine bills in committee define the same duty nine different ways \`Congress.gov\`.

> Co-sponsor the deployer-duties title in § 4, or move it as a floor amendment before markup closes.`,
  },
  {
    key: 'citation-card-pull-quote',
    what: 'citation-card pull-quote · the hero quote',
    note: '294px quote against a 249.50px share pushed the gloss 8.17px out, ink 21.16px inside',
    mode: 'full',
    dense: `<!-- _class: citation-card pull-quote -->

## pull-quote, long clause, long action.

\`Cal. Civ. Code §1798.140(o) · CCPA/CPRA\`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household, including but not limited to a device identifier, an internet protocol address, and any inference drawn from any of that information to create a profile reflecting preferences or predispositions.

- **What we must do.**
  - Audit pixel inventory; treat household identifiers as personal information in every DSAR workflow we run, and treat every derived score as an inference inside the same store.`,
    overstuffed: `<!-- _class: citation-card pull-quote -->

## pull-quote, overstuffed — genuinely cannot fit.

\`Cal. Civ. Code §1798.140(o) · CCPA/CPRA\`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household, including but not limited to a real name, alias, postal address, unique personal identifier, online identifier, internet protocol address, email address, account name, social security number, driver's license number, passport number, commercial information including records of personal property and products purchased, biometric information, internet activity including browsing history and search history, geolocation data, audio and visual information, professional or employment-related information, education records, and any inference drawn from any of that information to create a profile reflecting preferences, characteristics, predispositions, behavior, attitudes, intelligence, abilities, and aptitudes.

- **What we must do.**
  - Audit the pixel inventory end to end; treat household identifiers as personal information in every DSAR workflow, and treat every derived score as an inference held inside the same store under the same retention clock.`,
  },
  {
    key: 'citation-card-split',
    what: 'citation-card split · the centered gloss',
    note: 'head loss: the gloss sat 25.02px above the stage top with 21.02px of text gone',
    mode: 'head',
    dense: `<!-- _class: citation-card split -->

## split, two glosses plus two lines.

\`Cal. Civ. Code §1798.140(ad) · CCPA/CPRA\`

> "Sale" means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating orally, in writing, or by electronic or other means, a consumer's personal information by the business to a third party for monetary or other valuable consideration.

- The catch is "other valuable consideration."
  - Data-for-service swaps and ad-tech cookie syncs can qualify as sales even when no money changes hands at all.
- The verb list is deliberately exhaustive.
  - "Making available" reaches a read-only API key and a shared bucket, so an integration that never sends a byte can still be a sale.`,
    overstuffed: `<!-- _class: citation-card split -->

## split, gloss-heavy — genuinely cannot fit.

\`Cal. Civ. Code §1798.140(ad) · CCPA/CPRA\`

> "Sale" means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating orally, in writing, or by electronic or other means, a consumer's personal information by the business to a third party for monetary or other valuable consideration.

- The catch is "other valuable consideration."
  - Data-for-service swaps and ad-tech cookie syncs can qualify as sales even when no money changes hands, which is how a measurement pixel becomes a disclosure event.
- The verb list is deliberately exhaustive.
  - "Making available" reaches a read-only API key and a shared bucket, so an integration that never sends a byte can still be a sale on these words.
- "Third party" is narrower than it reads.
  - A service provider under a conforming contract is carved out, and the contract — not the data flow — is what does the carving.
- **What we must do.**
  - Inventory every outbound pixel, tag, and integration key; classify each against the carve-out, and treat the unclassified remainder as a sale until the contract says otherwise.`,
  },
  {
    key: 'cycle',
    what: 'cycle · the ring',
    note: 'head loss: a 471.94px ring in a 400.44px stage centered, 35.75px off EACH edge, 16.75px of text gone off the top',
    mode: 'head',
    dense: `<!-- _class: cycle -->

\`Framework · Rung D\`

## Five stages, clauses run long enough to wrap several times.

- Sense
  - Log the signal on the day it arrives, as observed and never as concluded, with the source named as a system or a person.
- Score
  - Calibrate it against the recorded outcomes of the trailing four cycles until it carries a defensible number.
- Decide
  - Attach a deadline and exactly one named owner; without both it stays an opinion with a tracking number.
- Record
  - Write the rationale in one sentence that survives being read aloud, and capture the dissent by name.
- Calibrate
  - Feed the observed outcome back as the next weight, log the delta, then sense again next cycle.`,
    overstuffed: `<!-- _class: cycle -->

\`Framework · Overstuffed control\`

## Six stages, each carrying far more clause than a stage node can hold.

- Sense
  - Log the signal on the day it arrives, as observed and never as concluded, with the source named as a system or as a person, and with the intake desk owner recorded beside it.
- Score
  - Calibrate it against the recorded outcomes of the trailing four cycles until it carries a number that a named reviewer is willing to defend out loud in the portfolio review.
- Decide
  - Attach a deadline and exactly one named owner; without both of those it stays an opinion with a tracking number, and the escalation clock starts at four weeks regardless.
- Record
  - Write the rationale in one sentence that survives being read aloud, capture the dissent by name, and freeze both at the moment the decision closes rather than afterwards.
- Observe
  - Wait out the window, then log what actually happened against what was predicted, including the cases where nothing happened at all and the prediction was silent.
- Calibrate
  - Feed the observed outcome back as the next weight, log the delta so the drift itself is readable evidence, and then sense again on the following weekly cycle.`,
  },
];

// The HEAD-LOSS arms, and they are a separate table because they pin a separate
// declaration. Four `safe` keywords in this sweep guard the block-start edge, and three
// of them are invisible to the dense arms above: those fixtures are not dense enough for
// the CLAMPED box to overflow its own share, so the bare `center` they replaced never
// gets the chance to split the excess. Each fixture below is one density further on, and
// each was measured reporting the px in its comment with its keyword reverted to a bare
// `center`. (The fourth — `cycle`'s stage — is genuinely inert once the ring's own
// `min-height: 0` landed, measured identical either way, so it is belt-and-braces and is
// deliberately NOT claimed here.)
const HEAD_CASES = [
  {
    key: 'policy-recommendation-head',
    what: 'policy-recommendation · six reasons',
    note: 'reverted to bare `center`, 103.50px of real text sits above the stage top',
    sample: `<!-- _class: policy-recommendation adopt -->

## Six reasons, one-line impact.

Fifty state regimes bind the same scoring model.

- The audit trail already exists
  - Every score is logged and signed \`SB 24-205\`.
- Compliance is a moat, not a cost
  - Disputes fell 31% in the sampled cohort \`HAI 2025\`.
- One federal floor beats fifty ceilings
  - The state duties retire without lowering the bar \`Title III\`.
- The record is already portable
  - It exports in the schema the assessment asks for \`Annex IV\`.
- The deployer duty is where the harm lands
  - Ninety-one percent of complaints name the deployer \`FTC 2025\`.
- The markup window closes on the eighteenth
  - No later vehicle carries the same floor this session \`Cal. AB 331\`.

> Co-sponsor the deployer-duties title in § 4.`,
  },
  {
    key: 'citation-card-pull-quote-head',
    what: 'citation-card pull-quote · a quote at the ceiling',
    note: 'reverted to bare `center`, 30.14px of real text sits above the stage top',
    sample: `<!-- _class: citation-card pull-quote -->

## pull-quote at the ceiling.

\`Cal. Civ. Code §1798.140(o) · CCPA/CPRA\`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household, including but not limited to a real name, an alias, a postal address, a unique personal identifier, an online identifier, an internet protocol address, an email address, an account name, commercial information including records of personal property and products purchased, biometric information, internet activity including browsing and search history, geolocation data, and any inference drawn from any of that information to create a profile reflecting preferences or predispositions.

- **What we must do.**
  - Audit pixel inventory; treat household identifiers as personal information in every DSAR workflow we run.`,
  },
  {
    key: 'statute-stack-preemption-head',
    what: 'statute-stack preemption · four cards',
    note: 'reverted to bare `center`, 53.53px of real text sits above the stage top; '
      + 'the same deck unclamped put all 125.97px of its loss out the BOTTOM, where it is visible',
    sample: `<!-- _class: statute-stack preemption -->

## preemption marks which law yields, at density.

- Federal \`15 U.S.C. §6501\` \`Preempts state rules\`
  - Sets the floor for under-13 personal data collection, and the floor is a floor rather than a ceiling: a state may go further, and several have.
- State \`Cal. Civ. §1798.120\` \`Survives preemption\`
  - Stricter opt-in regime on top of COPPA's baseline, with a private right of action the federal statute withholds and a cure period the regulator may waive.
- Local \`NYC §22-1201\` \`Independent of preemption\`
  - Bias-audit obligation distinct from privacy preemption scope, so it binds whatever the federal analysis concludes about the two statutes above.
- Sector \`16 C.F.R. 312\` \`Rulemaking authority\`
  - The implementing rule carries the operative definitions, and it is the one that moves: three revisions in five years, each narrowing what counts as actual knowledge.`,
  },
];

describe('the stage clip does not shear a component whose body fills it', () => {
  const chrome = resolveChrome();
  let browser;

  if (!chrome) {
    test('SKIPPED — no Chromium available', { skip: true }, () => {});
    return;
  }
  process.env.CHROME_PATH = chrome;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  async function measure(sample, key) {
    const html = renderHtml(deck(sample), { key, timeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    // probeSectionOverflow is self-contained (its helpers nest inside its body, per
    // overflow-probe.js's injection contract), so puppeteer can serialize it and run
    // the REAL probe in-page. No eval.
    const over = (await page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1, IGNORED_CLIP_SELECTOR)).over;
    const geom = await page.$eval('section', (sec, ignoreSel) => {
      const stage = sec.querySelector(':scope > .cell-stage');
      if (!stage) return null;
      const box = stage.getBoundingClientRect();
      const name = (n) => n.tagName.toLowerCase()
        + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : '');
      let worstHang = { el: null, px: 0 };
      let worstAbove = { el: null, px: 0 };
      for (const n of stage.querySelectorAll('*')) {
        if (ignoreSel && n.matches(ignoreSel)) continue;
        const r = n.getBoundingClientRect();
        if (r.height === 0 && r.width === 0) continue;
        const hang = +(r.bottom - box.bottom).toFixed(2);
        const above = +(box.top - r.top).toFixed(2);
        if (hang > worstHang.px) worstHang = { el: name(n), px: hang };
        if (above > worstAbove.px) worstAbove = { el: name(n), px: above };
      }
      // The component's own body box — the flex item whose floor this sweep released.
      const child = stage.firstElementChild;
      const cr = child ? child.getBoundingClientRect() : null;
      return {
        stageH: +box.height.toFixed(2),
        worstHang,
        worstAbove,
        childHang: cr ? +(cr.bottom - box.bottom).toFixed(2) : null,
        childAbove: cr ? +(box.top - cr.top).toFixed(2) : null,
      };
    }, IGNORED_CLIP_SELECTOR);
    await page.close();
    return { over, ...geom };
  }

  for (const c of CASES) {
    // A dense-but-fitting slide keeps every box inside the cell that clips it. `mode:
    // head` narrows the claim to the component's OWN body box plus the top edge: those
    // two fixtures are centered layouts whose residual tail spill is honest overflow the
    // probe reports, and it is the silent HEAD loss they were fixed for.
    test(`${c.what}: a dense body stays inside the stage clip`, async () => {
      const m = await measure(c.dense, `stage-shear-dense-${c.key}`);
      assert.ok(m, `${c.key}: the fixture should render a .cell-stage`);
      if (c.mode === 'full') {
        assert.ok(
          m.worstHang.px <= 0.5,
          `REGRESSION: ${c.what} — ${m.worstHang.el} hangs ${m.worstHang.px}px past the .cell-stage clip edge, `
            + 'so its bottom border, radius and any filled panel are sheared off. '
            + `The \`min-height: 0\` releasing this body's flex content-height floor is missing or ineffective. Was measured at: ${c.note}.`,
        );
      } else {
        assert.ok(
          m.childHang <= 0.5,
          `REGRESSION: ${c.what} — the body box hangs ${m.childHang}px past the .cell-stage clip edge. `
            + `Was measured at: ${c.note}.`,
        );
      }
      assert.ok(
        m.worstAbove.px <= 0.5,
        `REGRESSION: ${c.what} — ${m.worstAbove.el} sits ${m.worstAbove.px}px ABOVE the .cell-stage top edge, `
          + 'so it is cut off the head of the slide where nothing can see it: block-start overflow does not grow '
          + '`scrollHeight`, so the probe, the export tag and every scroll-dims measure read clean. An alignment '
          + `that can push content off the start edge must be \`safe\` (stage.css, #1299). Was measured at: ${c.note}.`,
      );
    });

    // The other half. A fix that closes the frame by swallowing a real overflow is the
    // #1277 failure mode, and it is silent — so every released floor is pinned against a
    // control that genuinely cannot fit.
    test(`${c.what}: an overstuffed body still reports overflow`, async () => {
      const m = await measure(c.overstuffed, `stage-shear-over-${c.key}`);
      assert.equal(
        m.over,
        true,
        `REGRESSION: ${c.what} — a body far past what the stage holds was silently absorbed instead of `
          + 'reporting overflow. Releasing a content-height floor must let an over-long body spill where the '
          + 'probe still sees it; clamping it into a centered box moves the loss inside the frame, where the '
          + 'stage clip can no longer catch it (kpi.styles.css records that exact regression, #1277).',
      );
    });
  }

  // These fixtures OVERFLOW by construction — that is the point. The claim is not that
  // they fit, it is that the whole loss goes out the visible tail, where the probe
  // reports it, instead of half of it going off the head where nothing can.
  for (const c of HEAD_CASES) {
    test(`${c.what}: an overfull centered body loses nothing off the TOP`, async () => {
      const m = await measure(c.sample, `stage-shear-head-${c.key}`);
      assert.ok(m, `${c.key}: the fixture should render a .cell-stage`);
      assert.ok(
        m.worstAbove.px <= 0.5,
        `REGRESSION: ${c.what} — ${m.worstAbove.el} sits ${m.worstAbove.px}px ABOVE the .cell-stage top `
          + 'edge. A box that centers and then overflows splits the excess both ways, and block-start '
          + 'overflow does not grow `scrollHeight`, so the half that goes off the top is invisible to the '
          + 'probe, to the export tag and to every scroll-dims measure here. The `safe` keyword on this '
          + `alignment is missing or ineffective (stage.css, #1299). Was measured at: ${c.note}.`,
      );
      assert.equal(
        m.over,
        true,
        `${c.what}: this fixture is meant to overflow — if it no longer does, it has stopped `
          + 'exercising the alignment and the arm above is vacuous.',
      );
    });
  }
});
