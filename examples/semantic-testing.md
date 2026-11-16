---
marp: true
size: 4k
theme: indaco
paginate: true
profile: teaching
header: "Semantic Testing"
acronyms:
  API: { expansion: application programming interface }
  E2E: { expansion: end to end }
  CI: { expansion: continuous integration }
  ISTQB: { expansion: International Software Testing Qualifications Board }
---

<!-- _class: title silent -->

# Semantic Testing

`A proposed framework for software testing`

Five missions, better evidence, and less consequential risk.

<!-- Open with a question before the first slide lands: "Who has heard a test called a sanity test? What did it prove?" Take two answers. Most will describe when it ran, not what it showed.

Say plainly that this is a proposed framework for thinking, not an industry taxonomy. Some words here, such as System, are used more narrowly than the ISTQB glossary uses them, and we will say so when it matters.

Timing: about 55 minutes, with two pauses for discussion. -->

<!-- describe: Title slide. Semantic Testing, a proposed framework for software testing, subtitled: five missions, better evidence, and less consequential risk. -->

<!-- say: Semantic Testing. A proposed framework for software testing. Five missions, better evidence, and less consequential risk. It starts from one question: what does a passing test prove? -->

---

<!-- _class: agenda -->

## The session moves from naming tests to trusting what they tell us.

<!-- Four parts. Part one fixes the vocabulary. Part two walks the five missions with one running example, a $500 transfer. Part three asks when a passing test deserves trust. Part four is about spending effort, and it ends with an exercise. -->

<!-- describe: Agenda listing five sections with page numbers: name the mission before you name the test; five missions reduce five different kinds of risk; evidence is worth only as much as its ability to fail; spend testing effort where the consequences are; and three reference pages. -->

<!-- say: The session has four parts, plus a short reference. First, we name a test by its mission. Second, we walk the five missions with one example, a five hundred dollar transfer. Third, we ask when a passing test deserves trust. Fourth, we decide where testing effort pays off. -->

---

<!-- _class: divider -->

`Part 1`

## Name the mission before you name the test.

<!-- About eight minutes. The goal of this part: by its end, everyone should be able to say what risk a test reduces and what a pass would prove. -->

<!-- describe: Section divider for part one: name the mission before you name the test. -->

<!-- say: Part one. Name the mission before you name the test. By the end of this part, you should be able to say what risk a test reduces, and what a pass would prove. -->

---

<!-- _class: table table-fill -->

## Common test labels answer five different questions.

| Dimension | Question it answers | Labels that live here |
| --- | --- | --- |
| Mission | What risk does it reduce? | safety, acceptance |
| Scope | How much is exercised? | unit, component, end-to-end |
| Tactic | How is it exercised? | fuzzing, property-based, snapshot |
| Timing | When, or why, does it run? | smoke, sanity, regression, nightly |
| Environment | Where does it run? | local, CI, staging, production |

— The missions ahead reuse the names unit, integration and system, but each names a risk to reduce, whatever the scope.

<!-- Read one row aloud, then ask: "Which of these labels tells you what a pass means?" Only the mission row does.

Point out that a team can say "our E2E regression suite runs nightly in staging" and have named scope, timing and environment without naming a single risk.

Timing matters, but it is a scheduling decision. A unit test runs at commit; a canary runs in production. The stage a test runs at does not decide its mission. -->

<!-- describe: A table with three columns: dimension, the question it answers, and labels that belong to it. Mission: what risk does it reduce, for example safety or acceptance. Scope: how much is exercised, for example unit or end to end. Tactic: how it is exercised, for example fuzzing. Timing: when or why it runs, for example smoke or regression. Environment: where it runs, for example staging or production. A footnote says the missions ahead reuse the names unit, integration and system, but each names a risk to reduce. -->

<!-- say: The labels we use for tests answer five different questions. Mission asks what risk a test reduces. Scope asks how much it exercises. Tactic asks how. Timing asks when. Environment asks where. Only the mission says what a pass means. The five missions ahead reuse the names unit, integration and system, but each one names a risk to reduce, whatever scope the test runs at. -->

---

<!-- _class: compare-prose vertical chosen -->

`A better first question`

## Ask what risk a test reduces before you ask what to call it.

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

## A tool becomes a strategy only once it names the evidence it produces.

- Mission: why -> Objective: what -> Strategy: how -> Tactic: with what -> Evidence: what happened -> Risk reduced: what changed

— "Use a fault-injection proxy" is a tactic. "A retried transfer settles exactly once" is an objective.

<!-- Walk the chain left to right with the transfer. Mission: no money is lost or duplicated. Objective: a retried transfer settles exactly once. Strategy: replay requests under injected timeouts. Tactic: a fault-injection proxy. Evidence: ledger totals before and after. Risk reduced: we now know retries are idempotent under the timeouts we tried.

The last box is the one teams skip. Evidence that is collected but never interpreted reduces no risk. -->

<!-- describe: A flowchart of six steps in two rows: mission, why; objective, what; strategy, how; tactic, with what; evidence, what happened; risk reduced, what changed. A footnote contrasts a tactic, use a fault-injection proxy, with an objective, a retried transfer settles exactly once. -->

<!-- say: A tool becomes a strategy only once it names the evidence it produces. Take the transfer. The mission: no money is lost or duplicated. The objective: a retried transfer settles exactly once. The strategy: replay requests under injected timeouts. The tactic: a fault injection proxy, which is a relay that drops or delays traffic on purpose. The evidence: ledger totals before and after. The risk reduced: we now know retries are safe under those timeouts. Naming a tool, such as Playwright, names only the tactic. -->

---

<!-- _class: divider -->

`Part 2`

## Five missions reduce five different kinds of risk.

<!-- About twenty minutes, the longest part. Keep the $500 transfer in front of the room the whole way through. -->

<!-- describe: Section divider for part two: five missions reduce five different kinds of risk. -->

<!-- say: Part two. Five missions, each reducing a different kind of risk. We will follow one five hundred dollar transfer through all of them. -->

---
<!-- _class: premise -->

## Each mission answers a question the others cannot.

Each mission names a risk to reduce, whatever scope the test runs at.

1. Unit
   - Logic gives a wrong result.
   - Does the logic work?
2. Integration
   - Parts disagree at their boundaries.
   - Do the interactions work?
3. System
   - The whole misbehaves in production.
   - Does it hold up in production?
4. Experience
   - People cannot reach their goal.
   - Can users reach it?
5. Safety
   - The operation causes unacceptable harm.
   - Can it avoid unacceptable harm?

<!-- Stress two things. First, the missions overlap: one scenario can produce evidence for all five, and one test run can serve two. Second, Experience and Safety work starts at design time, long before a system exists to test. A threat model and a usability study of a paper prototype are both evidence.

The word System here means production parity. That is narrower than the ISTQB use, where system testing means testing the complete integrated system against its requirements. -->

<!-- describe: A claim beside a numbered ledger of the five missions, each with the risk it reduces and the question it answers. Unit: logic gives a wrong result; does the logic work? Integration: parts disagree at their boundaries; do the interactions work? System: the whole misbehaves in production; does it hold up in production? Experience: people cannot reach their goal; can users reach it? Safety: the operation causes unacceptable harm; can it avoid unacceptable harm? The claim: each mission names a risk to reduce, whatever scope the test runs at. -->

<!-- say: Each mission answers a question the others cannot, and each names a risk, whatever scope the test runs at. Unit: the risk is logic that gives a wrong result. Does the logic work? Integration: parts disagree at their boundaries. Do the interactions work? System: the whole misbehaves in production. Does it hold up in production? Experience: people cannot reach their goal. Can they reach it? Safety: the operation causes unacceptable harm. Can it avoid that harm? -->

---

<!-- _class: table table-fill -->

## One $500 transfer raises a different question for each mission.

| Mission | Question about the transfer | Evidence that answers it |
| --- | --- | --- |
| Unit | Is an unauthorized approver rejected? | Approval rule at each role boundary |
| Integration | One row stored, one event sent? | Containerized database and broker |
| System | Settles under peak load and failover? | Latency, errors, balances at parity |
| Experience | Customer knows the money moved? | Task success in moderated sessions |
| Safety | Can a retry or operator pay twice? | Injected duplicates; ledger reconciles |

<!-- This is the running example. Same scenario, five missions, five kinds of evidence.

Ask: "Which of these rows does your current suite answer?" Most teams answer the first two well and the last two by accident.

Do not claim the missions are independent. The Safety row needs System-level conditions to be convincing. Overlap is expected; the evidence differs. -->

<!-- describe: A table with three columns: mission, a question about the transfer, and the evidence that answers it. Unit: is an unauthorized approver rejected, answered by the approval rule at each role boundary. Integration: one row stored, one event sent, against a containerized database and broker. System: settles under peak load and failover, measured by latency, errors and balances at parity. Experience: customer knows the money moved, from task success in moderated sessions. Safety: can a retry or operator pay twice, from injected duplicates and a reconciled ledger. -->

<!-- say: One five hundred dollar transfer raises a different question for each mission. Unit asks whether an unauthorized approver is rejected. Integration asks whether exactly one row is stored and one event sent. System asks whether the transfer settles under peak load and failover. Experience asks whether the customer knows the money moved. And Safety asks whether a retry or an operator could pay twice. -->

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

<!-- describe: A numbered ledger of five test doubles. Dummy: fills a parameter list and is never used. Stub: returns canned answers to the calls the test makes. Spy: a stub that also records how it was called. Mock: fails the test if expected calls do not happen. Fake: a working, simplified version, such as an in-memory database. A closing band says: with a stub, check the balance afterward; with a mock, check that the ledger was called. -->

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

<!-- _class: split-panel -->

`System mission`

## Parity means matching what could change the answer.

Two servers on the same version can still behave differently.

- Technology
  - Versions, configuration, feature flags and extensions.
- Infrastructure
  - Network, storage, topology and region layout.
- Runtime
  - Load, concurrency, latency, data volume and skew.
- Operations
  - Access control, failover, quotas and resource limits.

<!-- Match every characteristic that could change the answer. Parity is scoped to the objective. A test about failover needs parity in topology and failover configuration. It may not need production's data volume.

Example to give: two PostgreSQL clusters on the same minor version can still differ in indexes, connection limits, storage latency and replica lag. Any one of those can change whether a transfer settles under load.

Parity does not mean testing in production, and it does not mean using customer data. -->

<!-- describe: A split slide. The left panel states that production parity means matching every condition that could change the answer, and that two servers on the same version can still behave differently. The right side lists four areas: technology, infrastructure, runtime and operations, each with examples. -->

<!-- say: Production parity means a test environment that matches production wherever it could change the result. Two servers on the same version can still behave differently. Check four areas: technology, such as versions and configuration; infrastructure, such as network and storage; runtime, such as load, concurrency and data skew; and operations, such as access control, failover and limits. -->

---

<!-- _class: table table-fill -->

## A dataset can pass every schema check and still be unrepresentative.

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

<!-- say: A dataset can pass every schema check and still be unrepresentative. Production might hold eight hundred million rows, skewed toward a few hot accounts, with deep relationships, old anomalies and thousands of concurrent writers. A typical test dataset holds ten thousand flat, uniform, clean rows with one writer. Masking protects privacy, but it can flatten exactly that skew, so check privacy and skew separately. -->

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

<!-- _class: flowchart -->

## Three correct services can still send the same transfer twice.

- Client sends -> Processor executes -> Response lost -> Client retries -> Processor executes again -> $500 sent twice
- Response lost `warn`
- $500 sent twice `fail`

`[{warn, Timeout}, {fail, Unsafe outcome}]`

— An idempotency key fixes it: the processor recognizes a retry as the same request.

<!-- Every unit and integration test here can be green. The client is right to retry after a timeout. The gateway is right to accept a well-formed request. The processor is right to execute it.

The fix lives in the composition: an idempotency key that the client sends and the processor enforces, so a retry is recognized as the same request.

Ask: "Which of our five missions would have caught this?" Safety, run at System fidelity, with timeouts injected on purpose. -->

<!-- describe: A flowchart: client sends, processor executes, response lost, flagged as a timeout, client retries, processor executes again, and five hundred dollars sent twice, flagged as an unsafe outcome. A footnote names the fix: an idempotency key that lets the processor recognize a retry. -->

<!-- say: Three correct services can still send the same transfer twice. The client sends a transfer, and the processor executes it. The response is lost to a timeout. The client correctly retries, and the processor, seeing a valid request, executes it again. Five hundred dollars goes out twice. The fix is an idempotency key: a unique id the client sends once per transfer, so the processor recognizes a retry as the same request. -->

---

<!-- _class: divider -->

`Part 3`

## Evidence is worth only as much as its ability to fail.

<!-- About fifteen minutes. Part two asked what each mission is for. Part three asks when a passing test deserves our trust. -->

<!-- describe: Section divider for part three: evidence is worth only as much as its ability to fail. -->

<!-- say: Part three. Evidence is worth only as much as its ability to fail. Now we ask when a passing test deserves our trust. -->

---

<!-- _class: cards-stack -->

## Confirm what you know, and search for what you have not imagined.

- Knowns
  - We know the condition and the expected result. Example-based tests and contract tests confirm it.
- Known unknowns
  - We know the class of risk, not the case. Property tests, fuzzing and fault injection generate cases.
- Unknown unknowns
  - We know nothing yet. Exploratory testing, chaos experiments and incident review make a surprise more likely.

<!-- Knowns: we can write the input and the expected output.

Known unknowns: we know concurrency, malformed input and partial failure can hurt us, but not which case will. So we generate cases instead of listing them.

Unknown unknowns: we cannot write a test for a condition we have not conceived. The best we can do is put people and systems in situations that make surprises likely, then learn from them.

The columns describe the dominant intent. Fuzzing can confirm robustness against a known class and also find something new. -->

<!-- describe: Three stacked cards. Knowns: we know the condition and the expected result; example-based tests and contract tests confirm it. Known unknowns: we know the class of risk, not the case; property tests, fuzzing and fault injection generate cases. Unknown unknowns: we know nothing yet; exploratory testing, chaos experiments and incident review make a surprise more likely. -->

<!-- say: Confirm what you know, and search for what you have not imagined. For knowns, we know the condition and the expected result, so we write example based and contract tests. For known unknowns, we know the class of risk but not the case, so we generate inputs with property tests, fuzzing and fault injection. For unknown unknowns, we know nothing yet, so we explore, run chaos experiments, and learn from incidents. -->

---
<!-- _class: table table-fill -->

## Five techniques probe beyond examples, including one that tests the tests.

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

<!-- _class: flowchart -->

## A test passes when it shares the code's wrong assumption.

`A test oracle decides what the right answer is.`

- Wrong rule -> Wrong expected value & Wrong code
- Wrong expected value -> Tests pass
- Wrong code -> Tests pass
- Tests pass -> Wrong outcome for the customer
- Wrong outcome for the customer `fail`

`[{fail, Harm reaches the customer}]`

— The remedy is an expected value from an independent source, such as a regulator's worked example.

<!-- This is the oracle problem, a long-studied topic in testing research. Oracles come from requirements, contracts, regulations, invariants, domain experts and the customer. Every one of them can be wrong or incomplete.

When the same person, or the same misread requirement, writes both the code and the expected value, the test checks consistency, not correctness.

The remedy is independent evidence: an oracle from a different source. A regulator's worked example, a reconciliation against an external ledger, or a user who tries the feature. -->

<!-- describe: A flowchart. A wrong rule leads both to a wrong expected value and to wrong code. Both lead to tests passing, which leads to a box flagged as harm reaching the customer: the wrong outcome for the customer. Subtitle: a test oracle decides what the right answer is. Footnote: the remedy is an expected value from an independent source. -->

<!-- say: A test passes when it shares the code's wrong assumption. A test oracle is how a test decides what the right answer is. If a wrong business rule shapes both the expected value and the code, the tests pass, and the customer still gets the wrong outcome. The remedy is an expected value from an independent source, such as a regulator's worked example. -->

---

<!-- _class: compare-code -->

## Two tests can earn the same coverage while only one can catch a defect.

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

<!-- _class: split-panel -->

`Flakiness`

## Treat every flaky test as a defect and find its cause.

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

<!-- _class: cards-grid three -->

## Testability is an architecture decision, made long before the first test.

- Controllability
  - The test can create the condition it needs: injected time, seeds and failure points.
- Observability
  - The test can see what happened: logs, metrics, traces and analyzers.
- Isolation
  - The test can run alone, with no hidden side effects or shared global state.

> Telemetry can show failures no assertion checks.

<!-- A system that is hard to test usually has a design problem: time read straight from the wall clock, state hidden inside a singleton, side effects with no trace.

Analyzers matter here. A system test can assert "HTTP 200" and pass, while the traces show the retry rate up tenfold and the queue growing. Combine the assertion with what the telemetry says before you call the run green. -->

<!-- describe: Three cards: controllability, the test can create the condition it needs; observability, the test can see what happened through logs, metrics, traces and analyzers; isolation, the test can run alone. A key insight bar reads: telemetry can show failures no assertion checks. -->

<!-- say: Testability is an architecture decision, made long before the first test. Controllability means the test can create the condition it needs, such as an injected clock or failure point. Observability means it can see what happened, through logs, metrics, traces and analyzers, which are tools that scan that output for trouble. Isolation means it can run alone. Telemetry can show failures no assertion checks. -->

---

<!-- _class: divider -->

`Part 4`

## Spend testing effort where the consequences are.

<!-- About twelve minutes, including the exercise. -->

<!-- describe: Section divider for part four: spend testing effort where the consequences are. -->

<!-- say: Part four. Spend testing effort where the consequences are. -->

---

<!-- _class: math -->

`A rough guide for judgment`

## Write the next test only if it buys more risk reduction than it costs.

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

<!-- say: Write the next test only if it buys more risk reduction than it costs. As a rough guide, the value of a test is the chance the defect exists, times the cost if it escapes, times how much the test improves our chance of catching it, minus the cost of writing, running and maintaining the test. Nobody computes this exactly. It names the four things to argue about. -->

---
<!-- _class: list-tabular -->

## Test the edges around a critical path, where costly defects hide.

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

<!-- say: Test the edges around a critical path, where costly defects hide. Together, these edges are the path's test surface. A decline by the bank: the customer sees why, and no money moves. A duplicate request: exactly one transfer settles. A network timeout: a retry is safe and the status is honest. A partial write: the ledger never shows half a transfer. A session that expires: work in progress is kept or clearly lost. Consequence decides whether a path is critical. -->

---

<!-- _class: list-steps -->

## Each stage trades feedback speed for fidelity.

1. Local and pre-commit
   - Unit tests, focused integration tests and static analysis.
2. Continuous integration
   - Broad unit and integration suites, contracts and short fuzzing runs.
3. Staging or pre-release
   - System parity, load, failover and dynamic security scans.
4. Production
   - Canary releases, synthetic probes and mirrored traffic.

> Production testing needs blast-radius limits, privacy controls, rollback and a kill switch.

<!-- Each stage is a trade between feedback speed and fidelity. Commit-time checks are fast and narrow; production is slow to set up and as faithful as it gets.

Experience and Safety work happens at several stages, including design: a threat model or a paper-prototype usability session needs no running code.

Testing in production is legitimate only with guardrails: limit the blast radius, protect personal data, keep a rollback ready, and have someone watching. -->

<!-- describe: Four numbered steps from fast feedback to high fidelity. Local and pre-commit: unit tests, focused integration tests and static analysis. Continuous integration: broad unit and integration suites, contracts and short fuzzing runs. Staging or pre-release: system parity, load, failover and dynamic security scans. Production: canary releases, synthetic probes and mirrored traffic. A callout says production testing needs blast-radius limits, privacy controls, rollback and a kill switch. -->

<!-- say: Each stage trades feedback speed for fidelity. Locally and before commit, run unit and focused integration tests. In continuous integration, run broad unit, integration and contract tests. In staging, run system tests at parity, load and failover. In production, use canary releases to a few users, synthetic probes, which are scripted fake users, and mirrored traffic, a copy of real requests sent to the new version. Always limit the blast radius, meaning how many users or systems a failure can reach, and keep a way to roll back. -->

---

<!-- _class: flowchart -->

## An escaped defect is evidence about two systems: the product and its tests.

- Incident -> Fix the product & Find the surviving assumption
- Find the surviving assumption -> Name the missing evidence -> Add the cheapest test
- Add the cheapest test -> Next defect caught earlier `dashed`

`[{dashed, The payoff}]`


<!-- Fixing the bug repairs the product. Asking why the tests missed it repairs the testing system.

The reflex after an incident is to add a slow end-to-end test. Resist it. Ask which mission should have caught the defect, then add the cheapest test that would, often a unit or integration test. Strengthen higher-fidelity tests only when the cheap one cannot see the failure.

This is a blameless review question. The goal is a better system; nobody is hunting for a culprit. -->

<!-- describe: A flowchart. An incident leads to fixing the product, and to finding the surviving assumption, then naming the missing evidence, then adding the cheapest test. A dashed line, keyed as the payoff, runs from that test to a final box: next defect caught earlier. -->

<!-- say: An escaped defect is evidence about two systems: the product and its tests. After an incident, fix the product. Then find the assumption that survived, name the evidence that was missing, and add the cheapest test that would have caught it. That feeds back into earlier detection next time. -->

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

## The sentence names a tool, a place and a scenario, but no mission.

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

## Start with the mission your project has the least evidence for.

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

## Good testing buys evidence where being wrong would cost the most.

`Which mission has the least evidence in your project?`

<!-- Testing is not a contest to produce the most tests.

Closing ask: each person names one mission that is weakly evidenced in their current project, and one concrete test or review they will add this week. Collect them; revisit them at the next session. -->

<!-- describe: Closing slide: good testing buys evidence where being wrong would cost the most, with the question, which mission has the least evidence in your project? -->

<!-- say: Good testing buys evidence where being wrong would cost the most. Which mission has the least evidence in your project? -->

---

<!-- _class: divider -->

`Reference`

## Three pages to keep after the session.

<!-- The reference pages are for afterward: terms, common misconceptions, and questions to discuss with a team. Skip them in a timed session. -->

<!-- describe: Section divider for the reference section. -->

<!-- say: Three reference pages follow, for after the session: key terms, common misconceptions, and questions for a team discussion. -->

---
<!-- _class: glossary -->

## Eight terms carry most of the framework's precision.

- Evidence
  - Observations that change how much confidence is justified.
- Fidelity
  - How closely a test's conditions match production.
- Fidelity gap
  - A difference from production that limits a claim.
- Invariant
  - A property that must hold under every defined condition.
- Mission
  - The risk a test exists to reduce.
- Residual risk
  - Risk left after testing, accepted by a named owner.
- Test oracle
  - The source that decides what correct behavior is.
- Test surface
  - The states, boundaries and dependencies around a critical path.

<!-- Residual risk needs an owner. If nobody accepted a risk, nobody noticed it. -->

<!-- describe: A glossary of 8 terms. Evidence: observations that change how much confidence is justified. Fidelity: how closely a test's conditions match production. Fidelity gap: a difference from production that limits a claim. Invariant: a property that must hold under every defined condition. Mission: the risk a test exists to reduce. Residual risk: risk left after testing, accepted by a named owner. Test oracle: the source that decides what correct behavior is. Test surface: the states, boundaries and dependencies around a critical path. -->

<!-- say: Eight terms carry most of the framework's precision. Evidence: observations that change how much confidence is justified. Fidelity: how closely a test's conditions match production. Fidelity gap: a difference from production that limits a claim. Invariant: a property that must always hold. Mission: the risk a test exists to reduce. Residual risk: risk left after testing, accepted by a named owner. Test oracle: the source that decides what correct behavior is. Test surface: the states, boundaries and dependencies around a critical path. -->

---

<!-- _class: list-tabular -->

## Six common claims about testing need a better reading.

1. "95% coverage means well tested."
   - Coverage finds only code that never ran.
2. "It passed, so it is correct."
   - The oracle itself may be wrong.
3. "A real database means system testing."
   - Its mission decides, whatever the database.
4. "Same version means production parity."
   - Topology, config, data and load matter too.
5. "Security means safety."
   - A secure operation can still cause harm.
6. "More tests are always better."
   - More trustworthy evidence is better.

<!-- Each claim is half true, which is why it survives. Use this list when one comes up in a review: name the half that is true, then the half that is not. Other claims worth correcting: "automation is testing" (automation runs checks; people design and interpret them), and "tests must never be deleted" (a misleading or redundant test lowers trust in the suite). -->

<!-- describe: A numbered ledger of six common claims, each beside a better reading. 95 percent coverage means well tested: coverage finds only code that never ran. It passed, so it is correct: the oracle itself may be wrong. A real database means system testing: its mission decides, whatever the database. Same version means production parity: topology, config, data and load matter too. Security means safety: a secure operation can still cause harm. More tests are always better: more trustworthy evidence is better. -->

<!-- say: Six common claims need a better reading. Ninety five percent coverage finds code that never ran, and cannot see whether anything was checked. A passing test can rest on a wrong oracle. A real database does not make a test a system test; its mission decides. The same version does not mean parity, because topology, configuration, data and load matter too. A secure operation can still cause harm. And more trustworthy evidence beats more tests. -->

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
