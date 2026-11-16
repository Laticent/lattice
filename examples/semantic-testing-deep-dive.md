---
marp: true
size: 4k
theme: indaco
paginate: true
profile: teaching
header: "Semantic Testing · Deep dive"
acronyms:
  API: { expansion: application programming interface }
  CPU: { expansion: central processing unit }
  SAST: { expansion: static application security testing }
  DAST: { expansion: dynamic application security testing }
  E2E: { expansion: end to end }
  CI: { expansion: continuous integration }
  ISTQB: { expansion: International Software Testing Qualifications Board }
---

<!-- _class: title silent -->

# Semantic Testing, in Depth

`Technical training and a facilitator's reference`

Five missions, the evidence each one needs, and how to tell when a pass deserves trust.

<!-- Open with the same question as the short version: "Who has heard a test called a sanity test? What did it prove?" Take two answers; most will describe when it ran, not what it showed.

This is a proposed framework, not an industry taxonomy. Some words, System above all, are used more narrowly than the ISTQB glossary uses them.

Timing: 90 to 120 minutes with three exercises. It splits cleanly into two sittings: Parts 1 and 2, then Parts 3 and 4. The reference section is for preparation and hand-outs. -->

<!-- describe: Title slide. Semantic Testing, in Depth: technical training and a facilitator's reference. Subtitle: five missions, the evidence each one needs, and how to tell when a pass deserves trust. -->

<!-- say: Semantic Testing, in depth. Technical training and a facilitator's reference: five missions, the evidence each one needs, and how to tell when a passing test deserves trust. -->

---

<!-- _class: agenda -->

## The deep dive adds each claim's mechanics, then a reference.

<!-- Four teaching parts and a reference section. Each part has the same core as the short version, plus the slides that show how and why: descriptors, parity contracts, oracle modes, risk shape. -->

<!-- describe: Agenda listing five sections with page numbers: name the mission before you name the test; five missions reduce five different kinds of risk; evidence is worth only as much as its ability to fail; spend testing effort where the consequences are; and reference pages for study and preparation. -->

<!-- say: The deep dive has four teaching parts and a reference section. It keeps the same core as the short version, and adds the mechanics behind each claim: how to describe a test, how to write down parity, how oracles work, and how risk shapes the testing budget. -->

---

<!-- _class: divider -->

`Part 1`

## Name the mission before you name the test.

<!-- About twelve minutes. The goal of this part: by its end, everyone should be able to say what risk a test reduces and what a pass would prove. -->

<!-- describe: Section divider for part one: name the mission before you name the test. -->

<!-- say: Part one. Name the mission before you name the test. By the end of this part, you should be able to say what risk a test reduces, and what a pass would prove. -->

---

<!-- _class: table table-fill -->

## Common test labels answer six different questions.

| Dimension | Question it answers | Labels that live here |
| --- | --- | --- |
| Mission | What risk does it reduce? | safety, acceptance |
| Scope | How much is exercised? | unit, component, end-to-end |
| Tactic | How is it exercised? | fuzzing, property-based, snapshot |
| Timing | When, or why, does it run? | smoke, sanity, regression, nightly |
| Environment | Where does it run? | local, CI, staging, production |
| Oracle | What counts as correct? | expected value, invariant |

— The missions ahead reuse the names unit, integration and system, but each names a risk to reduce, whatever the scope.

<!-- Read one row aloud, then ask: "Which of these labels tells you what a pass means?" Only the mission row does.

Point out that a team can say "our E2E regression suite runs nightly in staging" and have named scope, timing and environment without naming a single risk.

Timing matters, but it is a scheduling decision. A unit test runs at commit; a canary runs in production. The stage a test runs at does not decide its mission. -->

<!-- describe: A table with three columns: dimension, the question it answers, and labels that belong to it. Mission: what risk does it reduce, for example safety or acceptance. Scope: how much is exercised, for example unit or end to end. Tactic: how it is exercised, for example fuzzing. Timing: when or why it runs, for example smoke or regression. Environment: where it runs, for example staging or production. Oracle: what counts as correct, for example an expected value or an invariant. A footnote says the missions ahead reuse the names unit, integration and system, but each names a risk to reduce. -->

<!-- say: The labels we use for tests answer six different questions. Mission asks what risk a test reduces. Scope asks how much it exercises. Tactic asks how. Timing asks when. Environment asks where. And the oracle asks what counts as correct. Only the mission says what a pass means. The five missions ahead reuse the names unit, integration and system, but each one names a risk to reduce, whatever scope the test runs at. -->

---

<!-- _class: compare-prose vertical chosen -->

`A better first question`

## Ask what risk a test reduces before naming it.

- Start from the label
  - "We need more E2E tests." Nobody can say what a pass would prove.
- Start from the mission
  - "Can a retry pay twice?" Risk comes first, so every pass has a meaning.

— Name the mission, then the evidence that would satisfy it.

<!-- This does not throw away the familiar words. Unit, smoke and fuzzing stay useful. They just stop being the first thing we say.

Ask the room for a test they wrote last week, and have them state its mission in one sentence. If they cannot, that is the finding. -->

<!-- describe: Two stacked cards, the second marked as chosen. Start from the label: we need more end to end tests, and nobody can say what a pass proves. Start from the mission: can a retry pay twice, and every pass has a meaning. A footnote reads: name the mission, then the evidence that would satisfy it. -->

<!-- say: So ask a better first question. Starting from the label sounds like: we need more end to end tests. The tool comes first, and nobody can say what a pass proves. Starting from the mission sounds like: can a retry pay twice? The risk comes first, then the evidence, then the tool, so every pass has a meaning. Name the mission, then the evidence that would satisfy it. -->

---

<!-- _class: flowchart -->

## Only a tool that names its evidence is a strategy.

- Mission: why -> Objective: what -> Strategy: how -> Tactic: with what -> Evidence: what happened -> Risk reduced: what changed

— "Use a fault-injection proxy" is a tactic. "A retried transfer settles exactly once" is an objective.

<!-- Walk the chain left to right with the transfer. Mission: no money is lost or duplicated. Objective: a retried transfer settles exactly once. Strategy: replay requests under injected timeouts. Tactic: a fault-injection proxy. Evidence: ledger totals before and after. Risk reduced: we now know retries are idempotent under the timeouts we tried.

The last box is the one teams skip. Evidence that is collected but never interpreted reduces no risk. -->

<!-- describe: A flowchart of six steps in two rows: mission, why; objective, what; strategy, how; tactic, with what; evidence, what happened; risk reduced, what changed. A footnote contrasts a tactic, use a fault-injection proxy, with an objective, a retried transfer settles exactly once. -->

<!-- say: Only a tool that names its evidence is a strategy. Take the transfer. The mission: no money is lost or duplicated. The objective: a retried transfer settles exactly once. The strategy: replay requests under injected timeouts. The tactic: a fault injection proxy, which is a relay that drops or delays traffic on purpose. The evidence: ledger totals before and after. The risk reduced: we now know retries are safe under those timeouts. Naming a tool, such as Playwright, names only the tactic. -->

---

<!-- _class: divider -->

`Part 2`

## Five missions reduce five different kinds of risk.

<!-- About thirty-five minutes, the longest part. Keep the $500 transfer in front of the room the whole way through. -->

<!-- describe: Section divider for part two: five missions reduce five different kinds of risk. -->

<!-- say: Part two. Five missions, each reducing a different kind of risk. We will follow one five hundred dollar transfer through all of them. -->

---
<!-- _class: premise -->

## Each mission answers a question the others cannot.

Each mission names a risk to reduce, whatever scope the test runs at.

1. Unit
   - Does the logic work? Risk: a wrong result.
2. Integration
   - Do the interactions work? Risk: parts disagree at boundaries.
3. System
   - Does it hold up in production? Risk: it fails in production.
4. Experience
   - Can users reach their goal? Risk: users get stuck.
5. Safety
   - Can it avoid unacceptable harm? Risk: an operation causes harm.

<!-- Stress two things. First, the missions overlap: one scenario can produce evidence for all five, and one test run can serve two. Second, Experience and Safety work starts at design time, long before a system exists to test. A threat model and a usability study of a paper prototype are both evidence.

The word System here means production parity. That is narrower than the ISTQB use, where system testing means testing the complete integrated system against its requirements. -->

<!-- describe: A claim beside a numbered ledger of the five missions, each with the question it answers and the risk it reduces. Unit: does the logic work? The risk is a wrong result. Integration: do the interactions work? The risk is that parts disagree at boundaries. System: does it hold up in production? The risk is that it fails in production. Experience: can users reach their goal? The risk is that users get stuck. Safety: can it avoid unacceptable harm? The risk is that an operation causes harm. The claim: each mission names a risk to reduce, whatever scope the test runs at. -->

<!-- say: Each mission answers a question the others cannot, and each names a risk, whatever scope the test runs at. Unit: the risk is logic that gives a wrong result. Does the logic work? Integration: parts disagree at their boundaries. Do the interactions work? System: the whole misbehaves in production. Does it hold up in production? Experience: people cannot reach their goal. Can they reach it? Safety: the operation causes unacceptable harm. Can it avoid that harm? -->

---

<!-- _class: flowchart -->

## Later missions feed what they find back to earlier ones.

- Unit -> Integration -> System -> Experience -> Safety
- Safety -> Unit `dashed`

`[{dashed, Findings improve earlier tests}]`

— The arrows show typical cost order; any mission can run first, and none becomes optional.

<!-- Testing works as a system with feedback. Earlier evidence usually finds defects faster and cheaper; later missions reveal risks the earlier ones cannot see.

The dashed arrow is the important one. When a System test finds a logic bug, the right response is a new Unit test that would have caught it, not only a fix. That is how the cheap layers get better over time. -->

<!-- describe: A flowchart: Unit, Integration, System, Experience, Safety, with a dashed line from Safety back to Unit keyed as findings improve earlier tests. Footnote: the arrows show typical cost order; any mission can run first, and none becomes optional. -->

<!-- say: Later missions feed what they find back to earlier ones. The chart runs Unit, Integration, System, Experience and Safety in typical order of cost, and the dashed line returns from Safety to Unit: when a system test finds a logic bug, add the unit test that would have caught it. Any mission can run first, and none becomes optional because another passed. -->

---

<!-- _class: table table-fill -->

## One transfer serves five missions, each with its own limit.

| Evidence sought | Mission | What limits the claim |
| --- | --- | --- |
| Authorization and amount invariants | Unit | Dependencies are controlled |
| One stored row and one event | Integration | Local or virtual resources |
| Settlement under load and failover | System | Parity and data must be representative |
| Customer knows whether money moved | Experience | Needs representative users |
| No duplicate charge across retries | Safety | Judged on the whole operation |

<!-- This is the running example: a transfer started in a browser, saved to a database, published to a broker and reconciled.

Categories overlap by design. One test run can contribute evidence to several missions, but only if its assertions, analyzers, actors and conditions support each mission it claims. A run with a virtual broker cannot claim System evidence about the broker, however many other boxes it ticks. -->

<!-- describe: A table with three columns: evidence sought, mission, and what limits the claim. Authorization and amount invariants: Unit, dependencies are controlled. One stored row and one event: Integration, local or virtual resources. Settlement under load and failover: System, parity and data must be representative. Customer knows whether money moved: Experience, needs representative users. No duplicate charge across retries: Safety, judged on the whole operation. -->

<!-- say: One transfer gives evidence to all five missions, and each has its own limit. Authorization and amount rules are Unit evidence, with dependencies controlled. One stored row and one event are Integration evidence, with local or virtual resources. Settlement under load and failover is System evidence, if parity and data are representative. Whether the customer knows the money moved needs representative users. And no duplicate charge across retries is judged on the whole operation. -->

---
<!-- _class: inventory editorial compact -->

## Five kinds of test double do five different jobs.

- **Dummy.** Fills a parameter list and is never used.
- **Stub.** Returns canned answers to the calls the test makes.
- **Spy.** A stub that also records how it was called.
- **Mock.** Fails the test if expected calls do not happen.
- **Fake.** A working, simplified version, such as an in-memory database.

> With a stub, check the balance afterward. With a mock, check that the ledger was called.

<!-- These are Gerard Meszaros's terms from xUnit Test Patterns (2007), popularized by Martin Fowler's essay "Mocks Aren't Stubs". "Test double" is the umbrella word, by analogy with a stunt double.

Why it matters: a stub and a mock lead to different tests. A stub supports state verification, where you check the balance afterward. A mock does behavior verification, where you check that the ledger was called. Heavy mocking couples tests to implementation, so a harmless refactor turns them red. -->

<!-- describe: A pull quote on the left beside five test doubles, each a bold name with its job. The quote: with a stub, check the balance afterward; with a mock, check that the ledger was called. Dummy: fills a parameter list and is never used. Stub: returns canned answers to the calls the test makes. Spy: a stub that also records how it was called. Mock: fails the test if expected calls do not happen. Fake: a working, simplified version, such as an in-memory database. -->

<!-- say: Five kinds of test double do five different jobs. A dummy fills a parameter and is never used. A stub returns canned answers. A spy is a stub that also records how it was called. A mock fails the test if expected calls do not happen. A fake is a simplified working version, like an in memory database. With a stub, you check the balance afterward. With a mock, you check that the ledger was called. These are Gerard Meszaros's terms. -->

---
<!-- _class: columns no-spine -->

## Unit and integration tests catch different defects in the transfer.

<!-- _pane: list -->

### Unit

- Checks the approval rule at role boundaries
- Fast: a failure names one function
- Cannot show concurrent production writes

<!-- _pane: list -->

### Integration

- Checks one row and one event in a real database
- Catches schema drift and timeouts
- Cannot show production scale or topology

<!-- Each has a blind spot. A unit test says nothing about the database under concurrent writes; an integration test says nothing about production scale.

Unit tactics worth naming: parameterized cases, property-based tests, and mutation testing to check the tests themselves.

The objective decides the Integration label. A real database in a container, such as PostgreSQL, limits what the test can claim, because its size, topology and load are not production's. Consumer-driven contract tests, such as Pact, belong here too: they check that two services agree on a message shape without running both. -->

<!-- describe: Two columns. Unit: checks the approval rule at role boundaries; fast, a failure names one function; cannot show concurrent production writes. Integration: checks one row and one event in a real database; catches schema drift and timeouts; cannot show production scale or topology. -->

<!-- say: Unit and integration tests catch different defects in the transfer. A unit test checks the approval rule at role boundaries. It is fast, and a failure names one function, but it cannot show concurrent writes in production. An integration test checks one row and one event in a real database. It catches schema drift and timeouts, but it cannot show production scale or topology. -->

---

<!-- _class: cards-grid three -->

## Local, virtual and parity resources prove different things.

- Local
  - A resource the team runs and controls; it can be real software or hardware.
- Virtual
  - Reproduces the behavior that matters, and injects faults on demand.
- Production parity
  - Keeps every characteristic of production that could change the answer.

> A bench device can be parity-grade; a real database holding toy data is not.

<!-- The three words describe fidelity, not location. A physical device on a desk can be production-parity hardware for embedded testing, when its firmware, timing and physical behavior match what ships. Cloud hosting is not required.

The reverse trap is more common: "we use a real PostgreSQL" while the dataset is ten thousand uniform rows with no network latency. That is a real resource and still not parity for a System objective. -->

<!-- describe: Three cards: local, virtual and production parity, each with a one line definition, and a key insight bar: a bench device can be parity grade; a real database holding toy data is not. -->

<!-- say: Local, virtual and parity resources prove different things. A local resource is one the team runs itself, real software or hardware. A virtual resource reproduces the behavior that matters, and can inject faults on demand. A production parity resource keeps every characteristic that could change the answer. A bench device can be parity grade when its firmware and timing match what ships. A real database holding toy data is not. -->

---

<!-- _class: list-tabular compact -->

## Write production parity down as a contract for each objective.

1. Technology
   - Engine, driver, protocol and firmware versions
2. Configuration
   - Timeouts, pools, quotas, access rules, feature flags
3. Topology
   - Regions, zones, network hops, failover paths
4. Scale
   - Concurrency, data volume, cardinality, throughput
5. Runtime
   - CPU, memory, disk, queue depth, latency
6. Operations
   - Monitoring, recovery, deployment, runbooks

— Parity is a claim about one objective, with its gaps named.

<!-- For each critical System objective, go down this list and mark which rows could change the result. Those rows need parity; the others do not.

Example: two PostgreSQL clusters on the same minor version can still differ in indexes, connection limits, storage latency and replica lag. A failover objective needs the topology and failover rows; a reporting-query objective needs the scale rows. -->

<!-- describe: A numbered ledger of six parity dimensions and what could change the answer in each. Technology: engine, driver, protocol and firmware versions. Configuration: timeouts, pools, quotas, access rules, feature flags. Topology: regions, zones, network hops, failover paths. Scale: concurrency, data volume, cardinality, throughput. Runtime: CPU, memory, disk, queue depth, latency. Operations: monitoring, recovery, deployment, runbooks. Footnote: parity is a claim about one objective, with its gaps named. -->

<!-- say: Production parity means a test environment that matches production wherever it could change the result. Write it down as a contract for each objective. For each of six dimensions, ask what could change the answer. Technology, such as driver versions. Configuration, such as timeouts. Topology, such as failover paths. Scale, such as cardinality, which means how many distinct values a field holds. Runtime, such as latency. And operations, such as recovery. Parity is a claim about one objective, with its gaps named. -->

---

<!-- _class: table table-fill -->

## Schema-valid test data can still misrepresent production.

| Property | Production | Typical test dataset |
| --- | --- | --- |
| Volume | 800 million rows | 10 thousand rows |
| Distribution | A few hot accounts | Uniform |
| Relationships | Deep, many-to-many | Flat |
| Legacy anomalies | Present | Absent |
| Concurrency | Thousands of writers | One |

— Masking protects privacy but can flatten skew, so check privacy and skew separately.

<!-- Representative means it has the shape that matters: volume, distribution, cardinality, relationships, history, and the odd records that only fifteen years of production create.

Synthetic data is often the safer and more repeatable choice. Masked production data is more realistic, but masking can destroy exactly what made it useful, such as the join cardinality or the skew toward a few hot accounts. Treat privacy and fidelity as two separate checks, and record both. -->

<!-- describe: A table comparing production with a typical test dataset. Volume: eight hundred million rows against ten thousand. Distribution: a few hot accounts against uniform. Relationships: deep and many to many against flat. Legacy anomalies: present against absent. Concurrency: thousands of writers against one. Footnote: masking protects privacy but can flatten skew, so check privacy and skew separately. -->

<!-- say: Schema-valid test data can still misrepresent production. Production might hold eight hundred million rows, skewed toward a few hot accounts, with deep relationships, old anomalies and thousands of concurrent writers. A typical test dataset holds ten thousand flat, uniform, clean rows with one writer. Masking protects privacy, but it can flatten exactly that skew, so check privacy and skew separately. -->

---

<!-- _class: flowchart -->

## Declare a fidelity gap instead of throwing the evidence away.

- Transfer workflow -> Parity database & Parity message broker & Virtual payment network
- Parity database -> System evidence
- Parity message broker -> System evidence
- Virtual payment network -> Fidelity gap: network behavior unproven
- Fidelity gap: network behavior unproven `warn`

`[{warn, Unproven claim}]`

— A fidelity gap is any difference from production that could change the answer.

<!-- One virtual dependency does not void the whole system test. It limits one claim: we have not shown how the real payment network behaves, for example under its own timeouts or rate limits.

Write the gap down with three parts: what was substituted, what claim it weakens, and how we will get that evidence later, perhaps a sandbox run with the network provider or a canary in production. A gap nobody records turns into a false claim of coverage. -->

<!-- describe: A flowchart. The transfer workflow connects to a parity database, a parity message broker and a virtual payment network. The database and broker lead to system evidence. The virtual payment network leads to a box flagged as an unproven claim: fidelity gap, network behavior unproven. A footnote defines a fidelity gap as any difference from production that could change the answer. -->

<!-- say: Declare a fidelity gap instead of throwing the evidence away. Here the transfer workflow runs against a parity database and a parity message broker, and both produce real system evidence. The payment network is virtual, meaning a stand-in that imitates the real one, so its behavior stays unproven. The chart flags that gap. A fidelity gap is any difference from production that could change the answer. Write it down, with the claim it weakens and how you will close it. -->

---

<!-- _class: list-steps -->

## Scope a fidelity gap to the one claim it weakens.

1. Keep the evidence
   - Database and broker results still stand.
2. Limit the claim
   - Payment network behavior stays unproven.
3. Record the gap
   - Write down what was substituted, and who owns the risk.

> Neither discard the test nor overclaim it.

<!-- Both mistakes are common. Teams either declare the whole System test worthless because one dependency is virtual, or they report "end-to-end verified" when the virtual part was the risky part.

Record the three steps on the slide: keep the evidence, limit the claim, and write down what was substituted and who owns the remaining risk. -->

<!-- describe: Three numbered steps. Keep the evidence: database and broker results still stand. Limit the claim: payment network behavior stays unproven. Record the gap: write down what was substituted, and who owns the risk. A callout says: neither discard the test nor overclaim it. -->

<!-- say: Scope a fidelity gap to the one claim it weakens. Do not discard the test: a virtual payment network limits claims about that interaction, and the other system evidence still stands. Do not overclaim it either: if the network's latency or failures shape the outcome, the end to end claim stays incomplete. Write down what was substituted, which claims still stand, and who owns the remaining risk. -->

---

<!-- _class: flowchart -->

## Parity and test data decay unless someone checks them.

- Production changes -> Drift -> Check -> Still representative?
- Still representative? `diamond`
  - -yes-> Keep the evidence
  - -no-> Refresh or declare the gap -> Check

— Someone has to recheck parity and data on a schedule.

<!-- Production keeps moving: versions, configuration, topology, traffic shape, access rules, data volume and skew. A staging environment that matched last year may not match today.

Put a recurring check on the parity contract from earlier in this section. Representative data drifts too: new products, new customer segments, seasonal patterns. When a check fails, either refresh the environment or data, or write down the new gap. -->

<!-- describe: A flowchart: production changes lead to drift, then a check, then a diamond, still representative? Yes leads to keep the evidence. No leads to refresh or declare the gap, which loops back to the check. A footnote says someone has to recheck parity and data on a schedule. -->

<!-- say: Parity and test data decay unless someone checks them. Production changes, so parity and data drift. Check what matters. If the environment is still representative, keep the evidence. If not, refresh it or declare the gap, and check again. Someone has to recheck parity on a schedule. -->

---

<!-- _class: checklist -->

`Experience mission`

## Every system check can pass while the customer still fails.

- [x] The API answered 200 OK.
- [x] The ledger committed the entry.
- [x] The confirmation event was published.
- [!] The customer knew the money moved.

— Experience covers accessibility, error recovery and confidence, for customers, operators and API users alike.

<!-- The story behind this slide: the transfer succeeded, but the screen showed a spinner until the session timed out. The customer tried again. Now Safety is involved too.

Experience evidence comes from watching representative people do real tasks: moderated sessions, task-success rates, accessibility audits with assistive technology, and support-ticket analysis. Developers calling your API are users too, and their experience is an error message that explains what went wrong. -->

<!-- describe: A checklist under the label Experience mission. Three items pass: the API answered 200 OK, the ledger committed the entry, and the confirmation event was published. One item fails: the customer knew the money moved. Footnote: Experience covers accessibility, error recovery and confidence, for customers, operators and API users alike. -->

<!-- say: Every system check can pass while the customer still fails. The A P I returned status two hundred, which means success. The ledger entry committed. The confirmation event was published. And the customer still did not know whether the money moved, because the screen showed a spinner until the session timed out, so they tried again. Now Safety is involved too. Experience covers accessibility, error recovery and confidence, for customers, operators and developers using an A P I. -->

---
<!-- _class: columns no-spine -->

## Safety testing looks for harm from any cause, attackers included.

<!-- _pane: list -->

### Security asks

- Can an attacker break it?
- Uses threat models, penetration tests, scans
- Stolen credentials move money

<!-- _pane: list -->

### Safety asks

- Can the operation cause harm?
- Uses hazard analysis, fault injection, drills
- A $500 transfer sent twice, no attacker

<!-- Analogy: a locked, alarmed car is secure. Parked in a flood zone, it is still not safe.

Nancy Leveson's work on system safety, in Engineering a Safer World, makes the key point: safety is an emergent property. You cannot certify it part by part. It comes from how components, people and the environment interact.

Harm can be financial, physical, legal, or a privacy loss. Security is one input to safety, and it cannot stand in for the rest. -->

<!-- describe: Two columns. Security asks: can an attacker break it; uses threat models, penetration tests and scans; example, stolen credentials move money. Safety asks: can the operation cause harm; uses hazard analysis, fault injection and drills; example, a five hundred dollar transfer sent twice, no attacker. -->

<!-- say: Safety testing looks for harm from any cause, attackers included. Security asks whether an attacker can break it, using threat models, penetration tests and scans; its classic harm is stolen credentials moving money. Safety asks whether the operation can cause harm at all, using hazard analysis, fault injection and drills. A five hundred dollar transfer sent twice needs no attacker. -->

---
<!-- _class: table table-fill -->

## Safety judges the whole operation, people and processes included.

| Area | A transfer harm it can cause |
| --- | --- |
| Software and data | A rounding rule moves the wrong amount |
| Infrastructure | Failover replays queued transfers |
| People and operators | A manual fix sends a payment twice |
| Processes and controls | One person approves their own transfer |
| Attackers and misuse | Stolen credentials drain an account |
| Failure and recovery | A restore loses a day of settlements |

— Penetration tests and chaos runs are tactics that serve the safety question.

<!-- Safety does not mean "we ran a pen test and a chaos day". It means asking whether the whole operation can cause unacceptable harm: financial, physical, psychological, legal or a privacy loss.

Harm often comes from parts that each behave correctly, which is the next slide. -->

<!-- describe: A table of six areas and a transfer harm each can cause. Software and data: a rounding rule moves the wrong amount. Infrastructure: failover replays queued transfers. People and operators: a manual fix sends a payment twice. Processes and controls: one person approves their own transfer. Attackers and misuse: stolen credentials drain an account. Failure and recovery: a restore loses a day of settlements. Footnote: penetration tests and chaos runs are tactics that serve the safety question. -->

<!-- say: Safety judges the whole operation, people and processes included. Each area can harm a transfer. In software and data, a rounding rule moves the wrong amount. In infrastructure, failover replays queued transfers. An operator's manual fix sends a payment twice. A weak control lets one person approve their own transfer. An attacker with stolen credentials drains an account. And a restore loses a day of settlements. Harm often comes from parts that each work correctly, as the next slide shows. -->

---

<!-- _class: flowchart -->

## Every service keeps its contract, yet the money moves twice.

- Client sends -> Processor executes -> Response lost -> Client retries -> Processor executes again -> $500 sent twice
- Response lost `warn`
- $500 sent twice `fail`

`[{warn, Timeout}, {fail, Unsafe outcome}]`

— No single service owns the rule "one transfer, one debit". An idempotency key carried end to end enforces it.

<!-- Walk the chart. The client sends the transfer and the processor executes it. The response is lost, so the client times out and, correctly, retries. The processor sees a valid request and executes it again. Every component kept its contract.

The global invariant has to be tested across the assembled operation: one intended transfer produces at most one debit, across retries, replays, partitions and recovery. The usual fixes are an idempotency key carried end to end, plus reconciliation as a second line. -->

<!-- describe: A flowchart: client sends, processor executes, response lost, flagged as a timeout, client retries, processor executes again, and five hundred dollars sent twice, flagged as an unsafe outcome. Footnote: no single service owns the rule one transfer, one debit; an idempotency key carried end to end enforces it. -->

<!-- say: Every service keeps its contract, yet the money moves twice. The client sends a transfer, and the processor executes it. The response is lost to a timeout. The client correctly retries, and the processor, seeing a valid request, executes it again. Five hundred dollars goes out twice. No single service owns the rule that one transfer means one debit. An idempotency key enforces it: a unique id the client sends once per transfer, which the processor uses to recognize a retry. -->

---

<!-- _class: divider -->

`Part 3`

## Evidence counts only if it could have failed.

<!-- About twenty-five minutes. Part two asked what each mission is for. Part three asks when a passing test deserves our trust. -->

<!-- describe: Section divider for part three: evidence is worth only as much as its ability to fail. -->

<!-- say: Part three. Evidence counts only if it could have failed. Now we ask when a passing test deserves our trust. -->

---

<!-- _class: cards-stack -->

## Confirm the known, and search for what you never imagined.

- Knowns
  - We know the condition and the expected result. Example-based tests and contract tests confirm it.
- Known unknowns
  - We know the class of risk, not the case. Property tests, fuzzing and fault injection generate cases.
- Unknown unknowns
  - We know nothing yet. Exploratory testing, chaos experiments and incident review make a surprise more likely.

— Discovery raises the odds of a useful surprise. No technique guarantees completeness.

<!-- Knowns: we can write the input and the expected output.

Known unknowns: we know concurrency, malformed input and partial failure can hurt us, but not which case will. So we generate cases instead of listing them.

Unknown unknowns: we cannot write a test for a condition we have not conceived. The best we can do is put people and systems in situations that make surprises likely, then learn from them.

The cards describe the dominant intent. Fuzzing can confirm robustness against a known class and also find something new. -->

<!-- describe: Three stacked cards. Knowns: we know the condition and the expected result; example-based tests and contract tests confirm it. Known unknowns: we know the class of risk, not the case; property tests, fuzzing and fault injection generate cases. Unknown unknowns: we know nothing yet; exploratory testing, chaos experiments and incident review make a surprise more likely. Footnote: discovery raises the odds of a useful surprise, and no technique guarantees completeness. -->

<!-- say: Confirm the known, and search for what you never imagined. For knowns, we know the condition and the expected result, so we write example based and contract tests. For known unknowns, we know the class of risk but not the case, so we generate inputs with property tests, fuzzing and fault injection. For unknown unknowns, we know nothing yet, so we explore, run chaos experiments, and learn from incidents. -->

---
<!-- _class: table table-fill -->

## Five techniques reach past examples; mutation testing tests the tests.

| Technique | What it does |
| --- | --- |
| Chaos experiment | Injects real failures to test a stated hypothesis. |
| Fuzzing | Feeds generated, often malformed input to find crashes and hangs. |
| Metamorphic testing | Checks a relation between runs when no exact answer exists. |
| Mutation testing | Plants small faults and checks that a test fails. |
| Property-based testing | Checks an invariant over many generated inputs. |

<!-- Give one transfer example per row.

Property-based (QuickCheck, Hypothesis, fast-check): for any amounts and accounts, the total money in the system is unchanged by a transfer.

Metamorphic: we may not know the exact result for a complex transfer, but two transfers of two hundred fifty dollars should move the same total as one of five hundred. Two runs, one relation, no exact oracle needed.

Mutation: flip a > to >= in the overdraft check; if no test fails, the suite never checked that boundary.

Chaos: the hypothesis comes first, for example "losing one broker node does not delay settlement past 2 seconds". -->

<!-- describe: A table of five techniques and what each does. Chaos experiment: injects real failures to test a stated hypothesis. Fuzzing: feeds generated, often malformed input to find crashes and hangs. Metamorphic testing: checks a relation between runs when no exact answer exists. Mutation testing: plants small faults and checks that a test fails. Property-based testing: checks an invariant over many generated inputs. -->

<!-- say: Five techniques probe beyond example tests, including one that tests the tests themselves. A chaos experiment injects real failures to test a stated hypothesis. Fuzzing feeds generated, often malformed input. Metamorphic testing checks a relation between two runs when no exact answer exists. Mutation testing plants small faults and checks that a test fails, which measures the tests rather than the product. Property based testing checks an invariant, a rule that must always hold, over many generated inputs. -->

---

<!-- _class: premise -->

## Each technique needs a different kind of oracle.

Confirmatory tests protect what we expect. Discovery raises the odds of finding what we did not.

1. Example-based
   - One expected value: did the transfer move exactly $500?
2. Property-based
   - An invariant: can money appear without a ledger entry?
3. Metamorphic
   - A relation between runs: do two $250 transfers total one $500?
4. Exploratory
   - Judgment and heuristics: is this surprising or harmful?
5. Fuzzing
   - Crashes, hangs, broken invariants: what does unexpected input do?

<!-- The first mode is what most people picture as a test. The other four do not need the exact answer for each input, which is what makes them able to explore.

Metamorphic testing is the least known. It is useful wherever the right answer is expensive to compute, such as pricing, search ranking or machine-learning output: you check a relation between two runs instead of either result alone. -->

<!-- describe: A claim beside a numbered ledger of five testing modes, each with its oracle and an example question. Example-based: one expected value; did the transfer move exactly 500 dollars? Property-based: an invariant; can money appear without a ledger entry? Metamorphic: a relation between runs; do two 250 dollar transfers total one 500? Exploratory: judgment and heuristics; is this surprising or harmful? Fuzzing: crashes, hangs, broken invariants; what does unexpected input do? The claim: confirmatory tests protect what we expect, and discovery raises the odds of finding what we did not. -->

<!-- say: Each technique needs a different kind of oracle. Example based tests need one expected value: did the transfer move exactly five hundred dollars? Property based tests need a rule: can money appear without a ledger entry? Metamorphic tests need a relation between runs: do two transfers of two hundred fifty dollars move the same total as one of five hundred? Exploratory testing uses judgment. Fuzzing watches for crashes and broken rules. -->

---

<!-- _class: flowchart -->

## Tests sharing one wrong assumption are one piece of evidence.

`A test oracle decides what the right answer is.`

- Wrong business assumption -> Unit: pass & Integration: pass & System: pass
- Wrong business assumption `warn`
- Independent oracle -> Wrong outcome found
- Wrong outcome found -> Wrong business assumption `dashed`

`[{warn, Shared wrong oracle}, {dashed, Exposes the assumption}]`

<!-- This is the oracle problem. Oracles come from requirements, contracts, regulations, invariants, domain experts and customers, and every one of them can be wrong.

Running three tests is execution independence. It is not assumption independence: if all three expect the value from the same misread requirement, they agree with each other and with the bug.

The remedy is an oracle from a different source. -->

<!-- describe: A flowchart. A wrong business assumption, flagged as a shared wrong oracle, leads to unit, integration and system tests that all pass. Separately, an independent oracle finds the wrong outcome, and a dashed line from that finding back to the assumption is keyed as exposing it. -->

<!-- say: Tests sharing one wrong assumption are one piece of evidence. A test oracle decides what the right answer is. If one wrong business assumption feeds the unit, integration and system tests, all three pass. An independent oracle, from a customer, a regulator or an adversary, finds the wrong outcome and exposes the assumption. -->

---

<!-- _class: compare-code -->

## Two tests, same coverage: only one can catch the defect.

`100% line coverage`

```js
test('transfer', () => {
  const a = account(1000);
  const b = account(1000);
  transfer(a, b, 500);
});
```

`Detects a wrong amount`

```js
test('transfer moves $500', () => {
  const a = account(1000);
  const b = account(1000);
  transfer(a, b, 500);
  expect(a.balance).toBe(500);
  expect(b.balance).toBe(1500);
});
```

— Both tests earn the same coverage report. Only the right one fails when the amount is wrong.

<!-- Both tests produce the same coverage report. Only the right one can fail.

Mutation testing makes the difference visible. Change the transfer to move 499, or to skip the debit. Every mutant survives the left test and dies against the right one.

The question to ask of any test: "What defect would this detect?" If the answer is unclear, the test may only be executing code. A test that cannot plausibly fail tells us little when it passes.

Coverage is still useful in one direction: an uncovered line is certainly untested. A covered line is not certainly tested. -->

<!-- describe: Two code snippets side by side. Left, labeled 100 percent line coverage: a test that creates two accounts of 1000 and calls transfer of 500, with no assertions. Right, labeled detects a wrong amount: the same test, plus assertions that the balances become 500 and 1500. -->

<!-- say: Two tests can earn the same coverage, and only one can catch a defect. Both tests create two accounts with a thousand dollars each and transfer five hundred. The first stops there. The second checks that one balance is now five hundred and the other fifteen hundred. Both produce the same coverage report. Only the second fails when the amount is wrong. -->

---

<!-- _class: flowchart -->

## A green assertion can hide a failing system.

- Test run -> Assertion: HTTP 200 & Telemetry
- Assertion: HTTP 200 -> Pass -> Read both together
- Telemetry -> Retries up 900% -> Read both together
- Retries up 900% `warn`

`[{warn, Hidden failure}]`

— Investigate what surprises you, whether it looks harmful or useful.

<!-- An assertion checks one expectation. An analyzer can reveal a failure nobody anticipated. A user watching the run can expose a wrong oracle: "why would it ever do that?"

Negative astonishment is behavior that looks harmful: investigate it even when the suite is green. Positive astonishment, an unexpectedly useful behavior, deserves a look too; it is often an undocumented assumption. -->

<!-- describe: A flowchart. A test run leads to an assertion, HTTP 200, which passes, and to telemetry, which shows retries up 900 percent, flagged as a hidden failure. Both lead to reading both together. Footnote: investigate what surprises you, whether it looks harmful or useful. -->

<!-- say: A green assertion can hide a failing system. A test run checks that the response is status two hundred, success, and passes. Meanwhile its analyzers, the logs, metrics and traces, show retries up nine hundred percent and a growing queue. Read all the evidence together, and investigate anything that surprises you. -->

---

<!-- _class: split-panel -->

`Flakiness`

## Treat each flaky test as a defect; find its cause.

A flaky test passes and fails on the same code. Automatic retries hide all three of its common causes.

- Async waits
  - Wait for a signal the code emits instead of a fixed sleep.
- Concurrency and test order
  - Give each test its own data, port and folder.
- Clock, randomness, network
  - Pin the clock, seed the generator, stub the network.

<!-- Industry data backs this up. Luo and colleagues' 2014 study of flaky tests in open-source projects found asynchronous waits were the largest single cause, ahead of concurrency and test-order dependence. Google has reported that about one in six of its tests (16%) showed some flakiness.

The real cost is that the team learns to ignore red, and the next real failure gets re-run instead of read.

The practice: keep the trace from the failure, reproduce it under load, fix the cause, and only then call it fixed. -->

<!-- describe: A split slide headed: treat every flaky test as a defect and find its cause. The left panel defines a flaky test as one that passes and fails on the same code, and says automatic retries hide all three of its common causes. The right side lists the causes with fixes: async waits, wait for a signal instead of a fixed sleep; concurrency and test order, give each test its own data, port and folder; clock, randomness and network, pin, seed and stub them. -->

<!-- say: Treat every flaky test as a defect, and find its cause. A flaky test passes and fails on the same code. The three common causes are these. Async waits: wait for a signal the code emits instead of a fixed sleep. Concurrency and test order: give each test its own data, port and folder. The clock, randomness and the network: pin, seed and stub them. Automatic retries hide all three, so turn retries off and fix the first red run. -->

---

<!-- _class: list -->

## Test suites take on debt like any other code.

- Flaky tests teach the team to ignore red.
- Obsolete tests check rules nobody holds anymore.
- Redundant tests add runtime and no new evidence.
- Slow tests delay every other signal.
- Misleading tests pass while their named risk goes untested.

— Fix or delete a test that passes without checking its risk.

<!-- Tests are code, and code can be defective. Treat the suite like a product: review it, refactor it, and delete what no longer earns its place.

More tests are not automatically better. More useful, trustworthy evidence is better. Mutation testing is one way to find tests that cannot fail; a regular review of what each slow test uniquely shows is another. -->

<!-- describe: A list of five kinds of test debt: flaky, obsolete, redundant, slow and misleading tests, with a footnote: fix or delete a test that passes without checking its risk. -->

<!-- say: Test suites take on debt like any other code. Flaky tests teach the team to ignore red. Obsolete tests check rules nobody holds anymore. Redundant tests add runtime and no new evidence. Slow tests delay every other signal. And misleading tests pass while the risk they name goes untested. A test that passes without checking its risk makes the team trust the suite more than it should, so deleting it makes the suite more honest. -->

---

<!-- _class: cards-grid three -->

## Testability is an architecture decision, made before the first test.

- Controllability
  - The test can create the condition it needs: injected time, seeds and failure points.
- Observability
  - The test can see what happened: logs, metrics, traces and analyzers.
- Isolation
  - The test can run alone, with no hidden side effects or shared global state.

> Telemetry can show failures no assertion checks.

<!-- A system that is hard to test usually has a design problem: time read straight from the wall clock, state hidden inside a singleton, side effects with no trace.

The analyzers slide earlier showed why this matters: a green assertion can sit on top of a failing system. -->

<!-- describe: Three cards: controllability, the test can create the condition it needs; observability, the test can see what happened through logs, metrics, traces and analyzers; isolation, the test can run alone. A key insight bar reads: telemetry can show failures no assertion checks. -->

<!-- say: Testability is an architecture decision, made before the first test. Controllability means the test can create the condition it needs, such as an injected clock or failure point. Observability means it can see what happened, through logs, metrics, traces and analyzers, which are tools that scan that output for trouble. Isolation means it can run alone. Telemetry can show failures no assertion checks. -->

---

<!-- _class: divider -->

`Part 4`

## Spend testing effort where the consequences are.

<!-- About thirty minutes, including three exercises. -->

<!-- describe: Section divider for part four: spend testing effort where the consequences are. -->

<!-- say: Part four. Spend testing effort where the consequences are. -->

---

<!-- _class: math -->

`A rough guide for judgment`

## The next test must reduce more risk than it costs.

$$ V \approx p \cdot C \cdot \Delta d - K $$

- $V$ — the value of adding this test
- $p$ — the chance the defect exists
- $C$ — the cost if it escapes: severity, exposure, reversibility
- $\Delta d$ — how much the test raises the chance of catching it
- $K$ — the cost to write, run, maintain and diagnose it

<!-- Nobody computes this to two decimal places. It names the four things to argue about.

A rare defect is not a cheap one. If C is catastrophic and irreversible, as with money sent to the wrong account, a small p still justifies real effort.

The Delta-d term explains why a fifth test of the same path is worth little: the first four already caught most of what it would.

K includes the hidden costs: run time on every commit, and the hours spent diagnosing a flaky failure. A deferred defect is still a defect; accepting residual risk should be a recorded decision with a named owner. -->

<!-- describe: A math slide with the eyebrow, a rough guide for judgment. The heuristic reads: V is approximately p times C times delta d, minus K. The legend: V is the value of adding the test; p is the chance the defect exists; C is the cost if it escapes, covering severity, exposure and reversibility; delta d is how much the test raises the chance of catching it; K is the cost to write, run, maintain and diagnose it. -->

<!-- say: The next test must reduce more risk than it costs. As a rough guide, the value of a test is the chance the defect exists, times the cost if it escapes, times how much the test improves our chance of catching it, minus the cost of writing, running and maintaining the test. Nobody computes this exactly. It names the four things to argue about. -->

---

<!-- _class: table table-fill -->

## Blast radius, reversibility and diagnosis cost set the evidence budget.

| Risk characteristic | Effect on testing investment |
| --- | --- |
| Large blast radius | More evidence, and containment before release |
| Hard to reverse | Stronger assurance before release |
| Catastrophic outcome | Deep testing, even for rare failures |
| Fast, safe rollback | Can justify less pre-release testing |
| Expensive diagnosis | Earlier, more localized detection |

<!-- This turns the previous slide's C term into questions a team can answer. A feature flag with instant rollback moves a risk down this table; a payment that leaves the bank moves it up.

It is a decision aid, not a license to ignore rare catastrophic risks. Whoever accepts the residual risk should be named and accountable. -->

<!-- describe: A table of risk characteristics and their effect on testing investment. Large blast radius: more evidence, and containment before release. Hard to reverse: stronger assurance before release. Catastrophic outcome: deep testing, even for rare failures. Fast, safe rollback: can justify less pre-release testing. Expensive diagnosis: earlier, more localized detection. -->

<!-- say: Blast radius, reversibility and diagnosis cost set how much evidence to buy. Blast radius means how many users or systems a failure can reach. A large blast radius needs more evidence and containment. A change that is hard to reverse needs stronger assurance before release. A catastrophic outcome justifies deep testing even for rare failures. A fast, safe rollback can justify less. And expensive diagnosis favors earlier, more localized detection. -->

---
<!-- _class: list-steps -->

## An early failure is cheaper: it points at fewer causes.

1. Unit test
   - Points at one function. Diagnosis takes minutes.
2. Integration test
   - Points at one boundary. Diagnosis takes about an hour.
3. System test
   - Many candidate causes. Diagnosis can take days.
4. Production
   - Customer harm first, then the same search.

— Illustrative orders of cost. A test's cost includes understanding why it failed.

<!-- Execution time is the smallest part of a test's cost. Add environment setup, maintenance, triage, reproduction and repair.

A System test that catches a logic bug has done its job, but leaves an expensive diagnosis. After the fix, add the cheapest test that would have caught it, and keep the System test for the evidence only it supplies. -->

<!-- describe: Four numbered steps. Unit test: points at one function, diagnosis takes minutes. Integration test: points at one boundary, about an hour. System test: many candidate causes, diagnosis can take days. Production: customer harm first, then the same search. Footnote: illustrative orders of cost; a test's cost includes understanding why it failed. -->

<!-- say: An early failure is cheaper: it points at fewer causes. These are illustrative orders of cost. A unit test failure points at one function, and diagnosis takes minutes. An integration failure points at one boundary, about an hour. A system failure has many candidate causes and can take days. In production, customer harm comes first, then the same search. A test's cost includes understanding why it failed. -->

---
<!-- _class: list-tabular -->

## Costly defects hide at the edges of a critical path.

1. Declined by the bank
   - The customer sees why, and no money moves.
2. Duplicate request
   - Exactly one transfer settles.
3. Network timeout
   - A retry is safe and the status is honest.
4. Partial write
   - The ledger never shows half a transfer.
5. Session expires
   - Work in progress is kept or clearly lost.

— These edges are the path's test surface. Consequence decides whether a path is critical.

<!-- A path earns the word critical through consequence, frequency, irreversibility, regulatory duty, how many things depend on it, or blast radius. A refund flow used ten times a day can be more critical than a search box used ten million times.

Most suites walk down the middle of the road: the success case. The consequential defects tend to sit on the shoulders. Ask the room to add one more edge for the transfer. Good answers: the currency changes mid-flow, the account is frozen, the clock crosses midnight. -->

<!-- describe: A numbered ledger of five edges of sending a transfer and what a test should prove. Declined by the bank: the customer sees why, and no money moves. Duplicate request: exactly one transfer settles. Network timeout: a retry is safe and the status is honest. Partial write: the ledger never shows half a transfer. Session expires: work in progress is kept or clearly lost. Footnote: these edges are the path's test surface, and consequence decides whether a path is critical. -->

<!-- say: Costly defects hide at the edges of a critical path. Together, these edges are the path's test surface. A decline by the bank: the customer sees why, and no money moves. A duplicate request: exactly one transfer settles. A network timeout: a retry is safe and the status is honest. A partial write: the ledger never shows half a transfer. A session that expires: work in progress is kept or clearly lost. Consequence decides whether a path is critical. -->

---

<!-- _class: table table-fill -->

## Each stage trades feedback speed for fidelity.

| Stage | Typical evidence |
| --- | --- |
| Local and pre-commit | Unit, focused integration, static analysis |
| Continuous integration | Broad unit and integration, contracts, short fuzzing |
| Staging or pre-release | System parity, load, failover, dynamic security scans |
| Production | Canary releases, synthetic probes, mirrored traffic |

— Production testing needs blast-radius limits, privacy controls, rollback and a kill switch.

<!-- Each stage is a trade between feedback speed and fidelity. Commit-time checks are fast and narrow; production is slow to set up and as faithful as it gets.

Experience and Safety work happens at several stages, including design: a threat model or a paper-prototype usability session needs no running code.

Testing in production is legitimate only with guardrails: limit the blast radius, protect personal data, keep a rollback ready, and have someone watching. -->

<!-- describe: A table of four stages and their typical evidence. Local and pre-commit: unit, focused integration and static analysis. Continuous integration: broad unit and integration, contracts and short fuzzing. Staging: system parity, load, failover and dynamic security scans. Production: canary releases, synthetic probes and mirrored traffic. -->

<!-- say: Each stage trades feedback speed for fidelity. Locally and before commit, run unit and focused integration tests. In continuous integration, run broad unit, integration and contract tests. In staging, run system tests at parity, load and failover. In production, use canary releases to a few users, synthetic probes, which are scripted fake users, and mirrored traffic, a copy of real requests sent to the new version. Always limit the blast radius, meaning how many users or systems a failure can reach, and keep a way to roll back. -->

---

<!-- _class: cycle -->

## Judgment decides which checks are worth automating.

- Judgment
  - Pick the mission and the risk.
- Oracle
  - Decide what counts as correct.
- Automate
  - Script the checks that repeat.
- Results
  - Collect what the checks observed.
- Interpret
  - Revise the assumptions, then judge again.

> Exploratory testing and red teaming earn their value by changing direction mid-run.

<!-- Automation executes checks. Testing is the reasoning around them: choosing the conditions, challenging assumptions, interpreting results and deciding what to do next.

Do not automate merely because you can. A usability observation or an adaptive red-team exercise loses most of its value as a fixed script. -->

<!-- describe: A loop of five stages that returns to its start. Judgment: pick the mission and the risk. Oracle: decide what counts as correct. Automate: script the checks that repeat. Results: collect what the checks observed. Interpret: revise the assumptions, then judge again. A callout says exploratory testing and red teaming earn their value by changing direction mid-run. -->

<!-- say: Judgment decides which checks are worth automating. Judgment picks the mission and risk, then the oracle and evidence. Automate the repeatable checks, collect the results, interpret them, and revise the assumptions, which feeds back into judgment. Exploratory testing and red teaming, where a team plays the attacker, earn their value by changing direction mid run. -->

---

<!-- _class: flowchart -->

## An escaped defect reveals gaps in product and tests alike.

- Incident -> Fix the product & Find the surviving assumption
- Find the surviving assumption -> Name the missing evidence -> Add the cheapest test
- Add the cheapest test -> Next defect caught earlier `dashed`

`[{dashed, The payoff}]`


<!-- Fixing the bug repairs the product. Asking why the tests missed it repairs the testing system.

The reflex after an incident is to add a slow end-to-end test. Resist it. Ask which mission should have caught the defect, then add the cheapest test that would, often a unit or integration test. Strengthen higher-fidelity tests only when the cheap one cannot see the failure.

This is a blameless review question. The goal is a better system; nobody is hunting for a culprit. -->

<!-- describe: A flowchart. An incident leads to fixing the product, and to finding the surviving assumption, then naming the missing evidence, then adding the cheapest test. A dashed line, keyed as the payoff, runs from that test to a final box: next defect caught earlier. -->

<!-- say: An escaped defect reveals gaps in product and tests alike. After an incident, fix the product. Then find the assumption that survived, name the evidence that was missing, and add the cheapest test that would have caught it. That feeds back into earlier detection next time. -->

---

<!-- _class: table table-fill -->

## A complete plan gives every mission an objective and evidence.

| Mission | Objective | Evidence |
| --- | --- | --- |
| Unit | Reject unauthorized or over-limit transfers | Invariants hold for generated inputs |
| Integration | Store once, publish the right event | Correct state after injected faults |
| System | Settle at parity under load | No lost or duplicate settlements |
| Experience | Customer completes and understands it | Completion and correct reading |
| Safety | No harm from retries or misuse | Idempotency and reconciliation hold |

— Exercise: for each mission, name a defect the other four would miss.

<!-- This is the transfer again, written as a plan. The strategy column is left off the slide: controlled dependencies and boundary tests for Unit, a local database and broker with fault injection for Integration, a parity stack with representative skew for System, representative users and recovery scenarios for Experience, adversarial and operational scenarios for Safety.

Run the exercise in pairs for five minutes, then take one answer per mission. -->

<!-- describe: A table of the five missions with an objective and the evidence for each. Unit: reject unauthorized or over limit transfers; invariants hold for generated inputs. Integration: store once, publish the right event; correct state after injected faults. System: settle at parity under load; no lost or duplicate settlements. Experience: customer completes and understands it; completion and correct reading. Safety: no harm from retries or misuse; idempotency and reconciliation hold. Footnote: for each mission, name a defect the other four would miss. -->

<!-- say: A complete plan gives every mission an objective and evidence. For the transfer: unit tests show the code rejects unauthorized or over limit transfers, with rules holding across generated inputs. Integration tests show it stores once and publishes the right event, even under injected faults. System tests show it settles at parity under load, with no lost or duplicate settlements. Experience tests show the customer completes and understands it. Safety tests show retries and misuse cause no harm. Now name a defect the other four missions would miss. -->

---

<!-- _class: quote -->

> We run Playwright against staging to check transfers.

— A team describing its transfer tests

<!-- The exercise. Read the line aloud and ask: "Which of the five missions is this?"

Give the room a full minute. Take three answers before the reveal. Expect System, Experience and E2E. All are reasonable guesses, and all of them guess. -->

<!-- describe: A quotation: we run Playwright against staging to check transfers. Attributed to a team describing its transfer tests. -->

<!-- say: Here is an exercise. A team says: we run Playwright, a browser automation tool, against staging to check transfers. Which of the five missions is that? Take a minute before the answer. -->

---

<!-- _class: cards-grid four -->

`Reveal`

## No mission: just a tool, a place and a scenario.

- Playwright
  - The tactic: how the test is exercised.
- Staging
  - The environment: where the test runs.
- Transfer flow
  - The scenario: what the test walks through.
- Mission: missing
  - The risk to reduce. Nothing in the sentence names it.

— A transfer at parity under load is System. Users understanding it is Experience. A double send is Safety.

<!-- The honest answer is: we do not know yet.

If the goal is that the assembled transfer works at production parity, it is System, and we should ask how close staging is to production. If the goal is that people can finish a transfer, it is Experience, and a script cannot show that alone. If the goal is that a double-click never charges twice, it is Safety.

Mission decides the classification. Fidelity decides whether the evidence is good enough. -->

<!-- describe: Four cards under the label Reveal. Playwright: the tactic, how the test is exercised. Staging: the environment, where the test runs. Transfer flow: the scenario, what the test walks through. Mission, missing: the risk to reduce, and nothing in the sentence names it. Footnote: a transfer at parity under load is System, users understanding it is Experience, and a double send is Safety. -->

<!-- say: The answer: the sentence names a tool, a place and a scenario, and no mission. Playwright is a tactic. Staging is an environment. The transfer flow is a scenario. If the goal is a transfer at parity under load, it is System. If it is whether users understand it, it is Experience. If it is whether a double click sends twice, it is Safety. -->

---

<!-- _class: quote -->

> We fuzz a transfer endpoint against staging.

— A team describing its security test

<!-- Second exercise, harder than the first because "security" sounds like a mission. Ask: "What would we be justified in concluding if this passes?" Give a minute before the reveal. -->

<!-- describe: A quotation: we fuzz a transfer endpoint against staging. Attributed to a team describing its security test. -->

<!-- say: A second exercise. A team says: we fuzz a transfer endpoint against staging. They call it a security test. What would we be justified in concluding if it passes? -->

---

<!-- _class: cards-stack -->

`Reveal`

## The mission decides what a passing fuzz run would justify.

- Integration
  - A pass shows parsing and contracts hold against a virtual dependency.
- System
  - A pass shows the parity path survives malformed traffic.
- Safety
  - A pass shows no input bypasses a control or moves money.

— Ask of any test: what would we be justified in concluding if it passed?

<!-- The sentence names a tactic (fuzzing), an environment (staging) and a scenario (the transfer endpoint). The primary mission is unknown until the objective is stated.

"Security test" is not one of the five missions; it is usually Safety. But a fuzz run that only checks for crashes supports a much narrower claim than "no input can move money". -->

<!-- describe: Three stacked cards under the label Reveal. Integration: a pass shows parsing and contracts hold against a virtual dependency. System: a pass shows the parity path survives malformed traffic. Safety: a pass shows no input bypasses a control or moves money. Footnote: ask of any test what we would be justified in concluding if it passed. -->

<!-- say: The mission decides what a passing fuzz run would justify. If the mission is Integration, a pass shows parsing and contracts hold against a virtual dependency. If it is System, the parity path survives malformed traffic. If it is Safety, no input bypasses a control or moves money. So ask of any test: what would we be justified in concluding if it passed? Security is not one of the five missions. Usually it means Safety, and a fuzz run that only checks for crashes cannot show that no input moves money. -->

---

<!-- _class: columns no-spine -->

## Ten axioms hold the framework together.

<!-- _pane: list -->

### Evidence

1. Mission determines classification.
2. Testing produces evidence, not certainty.
3. Each mission reduces a different class of risk.
4. Fidelity must match the evidence required.
5. Unexpected behavior deserves investigation.

<!-- _pane: list -->

### Practice

6. Effort is justified by marginal risk reduction.
7. A test must be able to fail meaningfully.
8. Testability requires control and observation.
9. Local correctness does not guarantee global safety.
10. Incidents expose gaps in the product and the tests.

<!-- These summarize the framework. They are a proposal, not an industry consensus.

Invite challenge: "Pick one axiom and give me a counterexample." A good discussion here is worth more than finishing on time.

This is the slide to leave up during questions. -->

<!-- describe: Two columns of numbered axioms. Evidence: 1, mission determines classification; 2, testing produces evidence, not certainty; 3, each mission reduces a different class of risk; 4, fidelity must match the evidence required; 5, unexpected behavior deserves investigation. Practice: 6, effort is justified by marginal risk reduction; 7, a test must be able to fail meaningfully; 8, testability requires control and observation; 9, local correctness does not guarantee global safety; 10, incidents expose gaps in the product and the tests. -->

<!-- say: Ten axioms hold the framework together. Mission determines classification. Testing produces evidence, not certainty. Each mission reduces a different class of risk. Fidelity must match the evidence required. Unexpected behavior deserves investigation. Effort is justified by marginal risk reduction. A test must be able to fail meaningfully. Testability requires control and observation. Local correctness does not guarantee global safety. And incidents expose gaps in the product and the tests. -->

---

<!-- _class: decision -->

## Start with the mission you have the least evidence for.

`The ask`

- Strengthen the weakest mission
  - Add one test or review this week, with its mission and evidence named.
- Why not more end-to-end tests
  - More of the same scope adds runtime and no new kind of evidence.
- Why not a coverage target
  - Coverage measures lines run; it cannot see which risks a suite detects.

<!-- This is the one thing to do after the session. Give everyone two minutes to write down their weakest mission and one concrete test or review that would strengthen it. Take three examples aloud.

The two rejected options are the usual reflexes. Both make a dashboard move without changing what the suite can find. -->

<!-- describe: A decision slide, subtitled the ask, with three cards. Strengthen the weakest mission: add one test or review this week, with its mission and evidence named. Why not more end to end tests: more of the same scope adds runtime and no new kind of evidence. Why not a coverage target: coverage measures lines run, and cannot see which risks a suite detects. -->

<!-- say: Here is the ask. Start with the mission your project has the least evidence for, and add one test or review for it this week, with its mission and evidence named. More end to end tests would add runtime and no new kind of evidence. A coverage target would measure lines run, and miss which risks the suite detects. -->

---

<!-- _class: closing silent -->

## Good testing buys evidence where being wrong costs the most.

`Which mission has the least evidence in your project?`

<!-- Testing is not a contest to produce the most tests.

Closing ask: each person names one mission that is weakly evidenced in their current project, and one concrete test or review they will add this week. Collect them; revisit them at the next session. -->

<!-- describe: Closing slide: good testing buys evidence where being wrong costs the most, with the question, which mission has the least evidence in your project? -->

<!-- say: Good testing buys evidence where being wrong costs the most. Which mission has the least evidence in your project? -->

---

<!-- _class: divider -->

`Reference`

## Reference pages for study and preparation.

<!-- Everything after this divider is reference: definitions, resource levels, mission specifications, tactics, a good-test checklist, misconceptions, discussion prompts and a facilitator checklist. Use it to prepare, or hand it out after the session. -->

<!-- describe: Section divider for the reference section. -->

<!-- say: The reference section follows, with definitions, mission specifications, tactics and more. -->

---
<!-- _class: table table-fill -->

## Analyzer through invariant describe what a test checks.

| Term | Definition |
| --- | --- |
| Analyzer | Inspects code, runtime or test output for undesirable behavior. |
| Assertion | Compares one observation with one expected condition. |
| Critical path | Behavior whose failure has material consequences. |
| Evidence | Observations that change how much confidence is justified. |
| Fidelity gap | A difference from production that limits a claim. |
| Invariant | A property that must hold under every defined condition. |

<!-- Definitions A to I. These are the framework's working definitions, not an industry standard. -->

<!-- describe: A table of six terms and their definitions. Analyzer: inspects code, runtime or test output for undesirable behavior. Assertion: compares one observation with one expected condition. Critical path: behavior whose failure has material consequences. Evidence: observations that change how much confidence is justified. Fidelity gap: a difference from production that limits a claim. Invariant: a property that must hold under every defined condition. -->

<!-- say: Analyzer through invariant: these six terms describe what a test checks. An analyzer inspects code, runtime or output for undesirable behavior. An assertion compares one observation with one expected condition. A critical path is behavior whose failure has material consequences. Evidence is observations that change how much confidence is justified. A fidelity gap limits what a result can claim. An invariant must hold under every defined condition. -->

---
<!-- _class: list-tabular -->

## These terms cover intent and fault, from mission to system.

1. Mission
   - The risk a test exists to reduce.
2. Objective
   - A specific outcome that shows progress on the mission.
3. Residual risk
   - Risk left after testing, accepted by a named owner.
4. Software defect
   - A code or configuration flaw that can cause failure.
5. Strategy
   - The approach chosen to reach an objective.
6. System under test
   - The software whose behavior the test examines.

<!-- Definitions M to S. Mission, objective, strategy and tactic form one chain of intent; the evidence-chain slide in Part 1 walks it. -->

<!-- describe: A numbered ledger of six terms and their definitions. Mission: the risk a test exists to reduce. Objective: a specific outcome that shows progress on the mission. Residual risk: risk left after testing, accepted by a named owner. Software defect: a code or configuration flaw that can cause failure. Strategy: the approach chosen to reach an objective. System under test: the software whose behavior the test examines. -->

<!-- say: These terms cover intent and fault, from mission to system. The mission is the risk a test exists to reduce. An objective is a specific outcome that shows progress on it. Residual risk is risk left after testing, accepted by a named owner. A software defect is a flaw in code or configuration that can cause a failure. A strategy is the approach chosen to reach an objective. And the system under test is the software the test examines. -->

---
<!-- _class: table table-fill -->

## Tactic through test surface name the parts of a suite.

| Term | Definition |
| --- | --- |
| Tactic | The technique or tool that carries out a strategy. |
| Test case | Conditions, actions, inputs and the expected outcome. |
| Test group | Related test cases kept together. |
| Test oracle | The source that decides what correct behavior is. |
| Test suite | Cases and groups run together for one purpose. |
| Test surface | States, boundaries and dependencies around a critical path. |

<!-- Definitions T. A test surface is what the critical-path slide calls the edges of the road. -->

<!-- describe: A table of six terms and their definitions. Tactic: the technique or tool that carries out a strategy. Test case: conditions, actions, inputs and the expected outcome. Test group: related test cases kept together. Test oracle: the source that decides what correct behavior is. Test suite: cases and groups run together for one purpose. Test surface: states, boundaries and dependencies around a critical path. -->

<!-- say: Tactic through test surface name the parts of a suite. A tactic is the technique or tool that carries out a strategy. A test case is conditions, actions, inputs and the expected outcome. A test group keeps related cases together. A test oracle decides what correct behavior is. A test suite runs cases and groups for one purpose. And a test surface is the states, boundaries and dependencies around a critical path. -->

---

<!-- _class: premise -->

## Each mission has its own tactics and blind spot.

Every mission's tactics leave something it cannot show, which is why no single mission is enough.

1. Unit
   - Doubles, property-based and mutation tests. Blind spot: real dependencies or users.
2. Integration
   - Containers, emulators, contracts, fault injection. Blind spot: production parity.
3. System
   - Parity stack, load, faults, telemetry. Blind spot: anything behind a declared gap.
4. Experience
   - Usability sessions, accessibility audits, exploration. Blind spot: technical correctness.
5. Safety
   - Threat models, red teams, chaos, recovery drills. Blind spot: absolute safety.

<!-- The full mission specifications, for preparation.

Unit: a bounded unit of logic meets its behavior and invariants with external behavior controlled. Cover success, rejection, boundaries and meaningful failure; keep cases independent; formal methods where justified.

Integration: software interacts correctly with local or virtual collaborators. Cover initialization, contracts, persistence, messaging, timeouts, retries and degradation.

System: the assembled system meets its behavior with production-parity resources and representative data. Cover critical workflows and their surfaces, production-like volume, concurrency, latency and recovery, and disclose every fidelity gap.

Experience: intended users reach expected outcomes through realistic use. Measure completion, confusion, abandonment and recovery; include accessibility.

Safety: the complete operation avoids unacceptable harm under foreseeable failure, misuse, attack and uncertainty. No finite suite proves absolute safety. -->

<!-- describe: A claim beside a numbered ledger of the five missions, each with its core tactics and what it cannot show. Unit: doubles, property-based and mutation tests; cannot show real dependencies or users. Integration: containers, emulators, contracts, fault injection; cannot show production parity. System: parity stack, load, faults, telemetry; cannot show anything behind a declared gap. Experience: usability sessions, accessibility audits, exploration; cannot show technical correctness. Safety: threat models, red teams, chaos, recovery drills; cannot show absolute safety. The claim: every mission's tactics leave something it cannot show, which is why no single mission is enough. -->

<!-- say: Each mission has its own tactics and blind spot. Every mission's tactics leave something it cannot show, so no single mission is enough. Unit uses test doubles, property based and mutation tests, and cannot show real dependencies or users. Integration uses containers, emulators, contracts and fault injection, and cannot show production parity. System uses a parity stack, load, faults and telemetry, and cannot show anything behind a declared gap. Experience uses usability sessions and accessibility audits, and cannot show technical correctness. Safety uses threat models, red teams and recovery drills, and can never show absolute safety. -->

---

<!-- _class: list-tabular -->

## Six tactics serve several missions, and none picks the mission.

1. Parameterized testing
   - Systematic input matrices
2. Property-based testing
   - Invariants over generated inputs
3. Fuzz testing
   - Unexpected and malformed input
4. Metamorphic testing
   - Relations when exact answers are hard
5. Mutation testing
   - Whether tests detect planted defects
6. Contract testing
   - Compatibility between two parties

<!-- A tactic never determines the category. Fuzzing can serve Integration, System or Safety; property-based testing can serve Unit or Integration. -->

<!-- describe: A numbered ledger of six tactics and what each contributes. Parameterized testing: systematic input matrices. Property-based testing: invariants over generated inputs. Fuzz testing: unexpected and malformed input. Metamorphic testing: relations when exact answers are hard. Mutation testing: whether tests detect planted defects. Contract testing: compatibility between two parties. -->

<!-- say: Six tactics serve several missions, and none picks the mission. Parameterized testing covers input matrices. Property based testing checks rules over generated inputs. Fuzz testing feeds unexpected input. Metamorphic testing checks relations when exact answers are hard. Mutation testing checks whether tests detect planted defects. Contract testing checks compatibility between two parties. -->

---

<!-- _class: table table-fill -->

## Seven more tactics suit deeper or more specialized questions.

| Tactic | Main contribution |
| --- | --- |
| Model checking | Exhaustive exploration of states |
| Formal verification | Proof under stated assumptions |
| Fault injection | Reproducible dependency failures |
| Chaos engineering | Resilience under controlled disruption |
| Exploratory testing | Adaptive human discovery |
| Security analysis | Static and dynamic security findings |
| Visual regression | Unintended visual change |

<!-- Formal verification proves a property under explicit assumptions; it complements dynamic testing and never replaces checking that the assumptions hold. Security analysis covers static (SAST) and dynamic (DAST) application testing. -->

<!-- describe: A table of seven more tactics: model checking, exhaustive exploration of states; formal verification, proof under stated assumptions; fault injection, reproducible dependency failures; chaos engineering, resilience under controlled disruption; exploratory testing, adaptive human discovery; security analysis, static and dynamic security findings; visual regression, unintended visual change. -->

<!-- say: Seven more tactics suit deeper or more specialized questions. Model checking explores every state of a bounded model. Formal verification proves a property under stated assumptions. Fault injection reproduces dependency failures. Chaos engineering tests resilience under controlled disruption. Exploratory testing is adaptive human discovery. Security analysis finds static and dynamic security issues. Visual regression catches unintended visual change. -->

---

<!-- _class: columns no-spine -->

## Judge a test by what it shows and takes.

<!-- _pane: list -->

### What it shows

- Purposeful: a stated mission and objective
- Trustworthy: results are credible
- Observable: outcomes can be inspected
- Interpretable: a failure helps diagnosis
- Sensitive: a real defect can fail it

<!-- _pane: list -->

### What it takes

- Controllable: needed conditions can be created
- Reproducible: known conditions can be recreated
- Maintainable: upkeep stays proportionate
- Risk-oriented: reduces consequential uncertainty
- Justified: its value exceeds its cost

<!-- Use this as a review checklist for a new test. Sensitive is the one most often missed: if no plausible defect can make the test fail, its pass carries no evidence.

Flakiness is a defect in the testing system, and re-running until green does not establish confidence. -->

<!-- describe: Two columns of five qualities each. What it shows: purposeful, a stated mission and objective; trustworthy, results are credible; observable, outcomes can be inspected; interpretable, a failure helps diagnosis; sensitive, a real defect can fail it. What it takes: controllable, needed conditions can be created; reproducible, known conditions can be recreated; maintainable, upkeep stays proportionate; risk oriented, reduces consequential uncertainty; justified, its value exceeds its cost. -->

<!-- say: Judge a test by what it shows and takes. What it shows: a stated mission, credible results, outcomes you can inspect, failures that help diagnosis, and sensitivity, meaning a real defect can make it fail. What it takes: conditions you can create and recreate, upkeep that stays proportionate, a focus on consequential risk, and value that exceeds its cost. -->

---

<!-- _class: table table-fill -->

## Six common claims about testing need a better reading.

| Claim | Better reading |
| --- | --- |
| "95% coverage means well tested." | Coverage finds only code that never ran. |
| "It passed, so it is correct." | The oracle itself may be wrong. |
| "A real database means system testing." | Its mission decides, whatever the database. |
| "Same version means production parity." | Topology, config, data and load matter too. |
| "Security means safety." | A secure operation can still cause harm. |
| "More tests are always better." | More trustworthy evidence is better. |

<!-- Each claim is half true, which is why it survives. Use this list when one comes up in a review: name the half that is true, then the half that is not. Other claims worth correcting: "automation is testing" (automation runs checks; people design and interpret them), and "tests must never be deleted" (a misleading or redundant test lowers trust in the suite). -->

<!-- describe: A table of six claims and better readings. 95 percent coverage means well tested: coverage finds only code that never ran. It passed, so it is correct: the oracle itself may be wrong. A real database means system testing: its mission decides, whatever the database. Same version means production parity: topology, config, data and load matter too. Security means safety: a secure operation can still cause harm. More tests are always better: more trustworthy evidence is better. -->

<!-- say: Six common claims need a better reading. Ninety five percent coverage finds code that never ran, and cannot see whether anything was checked. A passing test can rest on a wrong oracle. A real database does not make a test a system test; its mission decides. The same version does not mean parity, because topology, configuration, data and load matter too. A secure operation can still cause harm. And more trustworthy evidence beats more tests. -->

---

<!-- _class: list-tabular -->

## Scope, mission and fidelity get confused in six more claims.

1. "Unit tests cover this."
   - Logic evidence cannot show how real integrations behave.
2. "Our E2E suite tests everything."
   - End-to-end is a scope any mission uses.
3. "System tests are superior."
   - They answer different questions, at higher cost.
4. "Automation is testing."
   - Automation runs checks; people design and judge them.
5. "Higher fidelity is always better."
   - Fidelity matters where the mission needs it.
6. "Tests must never be deleted."
   - Low-value tests erode trust and slow feedback.

<!-- The companion to the previous table. "Higher fidelity is always better" is the subtlest: a parity environment is slow and expensive, and spending it on a question that a Unit test answers wastes the budget that the System questions need. -->

<!-- describe: A numbered ledger of six more claims, each beside a better reading. Unit tests cover this: logic evidence cannot show how real integrations behave. Our end-to-end suite tests everything: end-to-end is a scope any mission uses. System tests are superior: they answer different questions, at higher cost. Automation is testing: automation runs checks, and people design and judge them. Higher fidelity is always better: fidelity matters where the mission needs it. Tests must never be deleted: low-value tests erode trust and slow feedback. -->

<!-- say: Six more claims confuse scope, mission and fidelity. Unit tests cannot show how real integrations behave. End to end names a scope, which can serve any mission. System tests answer different questions, at higher cost. Automation runs checks, and people design and judge them. Fidelity matters where the mission needs it. And low value tests erode trust and slow feedback. -->

---

<!-- _class: list -->

## These six questions turn the framework into a team discussion.

- Can a test use a real database and still be integration?
- What evidence would show staging has enough production parity?
- When can five passing tests share one wrong oracle?
- How could a fully authorized workflow still cause financial harm?
- What would your most expensive test catch that a cheap one cannot?
- What would a customer or regulator say your tests miss?

<!-- Good for a team retrospective or a follow-up session. Each question has an answer in the deck; the interesting part is the answer for your own system. -->

<!-- describe: A list of six discussion questions: can a test use a real database and still be integration; what evidence would show staging has enough production parity; when can five passing tests share one wrong oracle; how could a fully authorized workflow still cause financial harm; what would your most expensive test catch that a cheap one cannot; what would a customer or regulator say your tests miss. -->

<!-- say: Six questions turn the framework into a team discussion. Can a test use a real database and still be integration? What evidence would show staging has enough parity? When can five passing tests share one wrong oracle? How could a fully authorized workflow still cause harm? What would your most expensive test catch that a cheap one cannot? And what would a customer or regulator say your tests miss? -->

---

<!-- _class: checklist -->

## Before teaching, check the session covers each core distinction.

- [ ] Five missions, classified mission first, overlapping.
- [ ] Testing works as a feedback system.
- [ ] System means parity and representative data.
- [ ] Substitutions create scoped, declared gaps.
- [ ] Oracles can be wrong; tests must be able to fail.
- [ ] Effort follows risk; coverage is one input.
- [ ] Safety is broader than security, including emergent harm.
- [ ] Incidents improve the product and the testing system.

<!-- A facilitator's pre-flight check. If a run of the session had to skip a part, tick what was covered and send the reference pages for the rest. -->

<!-- describe: A checklist of eight distinctions, all unchecked: five missions, classified mission first, overlapping; testing works as a feedback system; System means parity and representative data; substitutions create scoped, declared gaps; oracles can be wrong, tests must be able to fail; effort follows risk, coverage is one input; safety is broader than security, including emergent harm; incidents improve the product and the testing system. -->

<!-- say: Before teaching, check the session covers eight distinctions. Five missions, classified mission first. Testing working as a feedback system. System meaning parity and representative data. Scoped fidelity gaps. Oracles that can be wrong, and tests that can fail. Effort that follows risk, with coverage as one input. Safety broader than security. And incidents that improve the product and the testing system. -->
