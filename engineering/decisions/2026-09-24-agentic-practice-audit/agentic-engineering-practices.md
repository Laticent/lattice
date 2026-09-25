---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Agentic engineering · Practices that hold up"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Agentic engineering

`Lunch and learn · Five practices · 60 minutes`

Coding agents are fast. These five practices make them reliable.

<!--
Thanks for coming. For the next hour we'll talk about working habits for coding agents: the tools that read your code, change it, and run it for you. The habits come from a project where agents wrote almost all of the code for five months. Each one is here because something went wrong without it. We'll cover five practices, about ten minutes each, then take questions.
-->

---

<!-- _class: list-steps insight-so-what -->

`The art of the possible`

## Agents can now take a ticket all the way to review.

1. Plan
   - Reads the ticket and plans the change.
2. Build
   - Writes code and tests, opens a pull request.
3. Fix
   - Fixes whatever breaks the build.
4. Report
   - Notes how sure it is, and why.
5. Hand off
   - Waits for approval, leaves notes.

> The bottleneck has moved from writing the code to trusting the result.

<!--
Let's start with what agents can do today. You give one a ticket. It plans the change, writes the code and the tests, and opens a pull request, which is a proposed change for someone to review. It watches the automated build, fixes whatever breaks, and writes a short note saying how confident it is and why. Then it waits. A person decides whether to merge. Afterward, the agent leaves notes so the next session can pick up where this one stopped. Getting an agent to do all of this is the easy part now. Knowing when to trust it is harder, and that's what the rest of the hour is about.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`The one rule · Use agents any way you like`

## Reality must match the claim

<!--
Before any practices, here's the one thing I'd ask you to hold on to. There's no right way to use these tools. Some of you will vibe code a prototype over lunch. Some of you will run five agents on a migration. Both are fine. But one rule doesn't bend: what you ship has to be what you said you shipped. If the pull request says it's tested, it's tested. If the dashboard says the number is right, it's right. Everything else today is a way to keep that promise, and to keep it next year as well as today.
-->

---

<!-- _class: compare-prose insight-so-what -->

`Your role · Floor and ceiling`

## AI raises your floor, but only you can raise your ceiling.

- The floor
  - Anyone can now produce working-looking code in minutes. That part got cheap, for everyone.
- The ceiling
  - Knowing what to build, spotting what is wrong, deciding when it is good enough. That part is still yours.

> Everyone has a camera and a crew now. Not everyone makes a film.

<!--
So where do you fit in? These tools raise everyone's floor. Anyone in this room can now produce code that runs and looks finished, fast. What they don't raise is the ceiling: knowing what to build, seeing what's wrong with it, and deciding when it's good. A lot of people slip into a familiar role with an agent. They treat it like a chat buddy, or a junior they have to babysit. I'd suggest a different role. Think of a film director. Everyone has a camera and a crew now. Not everyone makes a film.
-->

---

<!-- _class: list-steps -->

`Your role · The director`

## Direct the work: watch the take, name the problem, give one note.

1. Watch the take
   - Read the actual change and run it before you react.
2. Name the problem
   - Say exactly what is off: "the retry hides the real error."
3. Give one note
   - Say it once, clearly, then let the agent work.

<!--
A director doesn't run the camera. They watch the take and judge what's actually on the screen. For you, that means reading the actual change and running it. Then they name the problem precisely. "The pacing drags" is useful. "Make it better" isn't. Same with an agent: "the retry hides the real error" gets a fix, "this seems off" gets a guess. Then they give one clear note, say it once, and step back so the crew can work.
-->

---

<!-- _class: table table-fill -->

`Your role · The set`

## Everything on a film set has a counterpart in agentic work.

| On set | With agents | Practice |
| --- | --- | --- |
| Script and shot list | The plan and the instruction file | Context |
| One clear note per take | One precise request | Autonomy |
| The dailies | Proof from the real thing | Verification |
| Continuity | Checks that catch jank before it ships | Verification |
| Production notes | Decision log and follow-up files | Learning |
| Casting and the final cut | An agent roster; you approve the merge | Orchestration |

<!--
The set gives us a map for the rest of the hour. The script and shot list are your plan and your instruction file. One clear note per take is one precise request. The dailies are the footage itself. For us, that's proof from the real thing, which beats the agent's description every time. Continuity is the set of checks that catch jank before it ships. Production notes are the decision log. And casting and the final cut are your agent roster and the merge you approve. We'll take these in order.
-->

---

<!-- _class: diagram insight-takeaway -->

`How an agent works`

## A coding agent loops until it thinks it is done.

```mermaid
flowchart LR
  A["Read what's<br/>in front of it"] --> B["Plan"]
  B --> C["Change code<br/>or run a tool"]
  C --> D["Check the result"]
  D -->|thinks it's not done| A
  D -->|thinks it's done| E["Report back"]
```

> Every practice today makes "thinks it is done" match "is done."

<!--
Here's what's happening inside. The agent reads what's in front of it, makes a plan, changes some code or runs a tool, and checks the result. If it decides it isn't finished, it goes around again. When it decides it's finished, it reports back. Listen for the word "thinks." The loop stops when the agent believes the work is done. Whether the work is actually done depends on what it could see, what it was allowed to do, and how good its checks were. Those are the practices we'll cover.
-->

---

<!-- _class: agenda -->

## Five practices, one for each question you will face.

1. Context: control what the agent sees
2. Autonomy: decide what it may do alone
3. Verification: make every claim prove itself
4. Learning: turn mistakes into rules
5. Orchestration: use many agents without losing control

<!--
Each practice answers a question you'll hit in your first week with an agent. What does it know? What may it do on its own? How do I know it worked? How do we stop repeating mistakes? And how do I use several agents without the cost getting away from me?
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Practice 01 · The script and the shot list`

## Context engineering

---

<!-- _class: diagram insight-implication -->

`Context · The core idea`

## An agent sees only its context window, the text in front of it.

```mermaid
flowchart LR
  subgraph IN["In the window"]
    A["Standing instructions"]
    B["Files it opened"]
    C["Tool output"]
    D["Your request"]
  end
  subgraph OUT["Outside the window"]
    E["Team knowledge"]
    F["Past decisions"]
    G["Known traps"]
  end
  IN --> H["Its next action"]
```

> What you put in this window decides most of the agent's quality.

<!--
The context window is everything the model can see at one moment. That's its standing instructions, the files it has opened, whatever its tools printed, and your request. Everything else might as well not exist: what your team knows, why past decisions were made, the traps everyone has learned to avoid. So a lot of agent quality comes down to one design question. What goes into that window, and what stays out? That's context engineering.
-->

---

<!-- _class: compare-prose chosen -->

`Context · Standing instructions`

## Write the always-loaded file as an index, and keep the manual elsewhere.

- A manual
  - Every rule with its full explanation. It grows with each incident, and every session pays to read all of it.
- An index
  - One line per rule and a link to the document that explains it. The agent opens the detail only when the task needs it.

<!--
Most agent tools load a file of standing instructions at the start of every session. The instinct is to write a manual. An index works better: one line per rule, with a link to the longer explanation. The agent reads less by default, and when it does need the detail, it reads the real document instead of a summary. We learned this the expensive way. Our instruction file grew twelvefold in four months before we changed its shape.
-->

---

<!-- _class: code -->

`Context · A routing table`

## Route the agent to the right document before it starts work.

```markdown
## Read these before working in an area

| Working on…                  | Read first                   |
| ---------------------------- | ---------------------------- |
| Branching, merging, releases | engineering/workflow.md      |
| Tests, hooks, CI             | engineering/development.md   |
| Something behaving strangely | engineering/gotchas.md       |
| Building a new script        | engineering/capabilities.md  |
| A past decision              | engineering/decisions/       |
```

<!--
This table comes straight from our instruction file. Each row maps a kind of work to the document the agent has to read before starting. Two rows pull a lot of weight. The capabilities file lists every script and tool we already have, so the agent reuses them instead of writing new ones. The gotchas file lists symptoms with their known causes, so when something acts strangely, the agent checks there first. The table stays short, and the documents behind it can go as deep as you need.
-->

---

<!-- _class: list takeaway -->

`Context · Habits`

## Four habits keep the window full of what matters.

- Read sections, not files: list the headings, then open only what you need.
- Delegate big reads: a helper agent reads the log and returns a summary.
- Quiet the tools: print failures in full and successes as a dot.
- Measure first: check what real sessions load before you optimize.

<!--
Four habits. First, read sections instead of whole files. A big design document can be thirty times longer than the part you actually need. Second, hand big reads to a helper agent. It reads the two-megabyte log and gives back a paragraph, and only the paragraph lands in your session. Third, make your tools quieter. And fourth, measure before you optimize, because our guesses about where the cost was were usually wrong.
-->

---

<!-- _class: big-number -->

`Context · A quieter test report`

- 99.8%
  - less for the agent to read per test run: 657,806 tokens down to 1,182.

<!--
This is the biggest single saving we found. Models read and bill in tokens, and a token is roughly three quarters of a word. Our test runner printed a line for every passing test, and the agent read about six hundred and fifty-eight thousand tokens of it on every run. We switched to a report that shows a dot for each pass and full detail only for failures. That brought it down to about twelve hundred. Same tests, same information. When people want to cut agent costs, they usually look at the model first. Look at what your tools print before you do.
-->

---

<!-- _class: table table-fill -->

`Context · In Claude Code`

## Claude Code gives you a setting for each of these habits.

| Practice | In Claude Code |
| --- | --- |
| Standing instructions as an index | `CLAUDE.md`, linking detail docs with `@docs/file.md` |
| Guidance that loads only when relevant | A skill in `.claude/skills/<name>/SKILL.md` |
| Big reads outside the main session | A helper agent (subagent) in `.claude/agents/` |
| See what fills the window | `/context`, and `/usage` for the bill |

<!--
If you use Claude Code, each habit maps to a setting. CLAUDE.md is the standing instruction file. Keep it short, and link to detail documents with an at sign followed by the file path. Skills hold longer guidance that only loads when a task needs it. Subagents are helper agents that do big reads in their own window. And slash context shows what's filling the window, while slash usage shows where the tokens went.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Practice 02 · What the crew decides alone`

## Autonomy with limits

---

<!-- _class: diagram -->

`Autonomy · Two questions`

## Two questions decide whether the agent acts or asks.

```mermaid
flowchart LR
  A["Next step"] --> B{"Already decided<br/>by a written rule?"}
  B -->|no| F["Ask: options, costs,<br/>a recommendation"]
  B -->|yes| C{"Easy to undo, and<br/>affects only its own work?"}
  C -->|yes| D["Act, then report"]
  C -->|no| F
```

<!--
We set our agents up to act by default. If a written rule already says what the next step is, the agent takes it without asking: open the pull request, fix the failing build, update the docs. Asking permission for something that's already decided just uses up your attention. Then a second question: is this step easy to undo, and does it affect only the agent's own work? If either answer is no, the agent stops and brings you options, even when a rule pointed it that way.
-->

---

<!-- _class: matrix-2x2 insight-why -->

`Autonomy · The reach test`

## Risk comes from what you can't undo and who it touches.

- **Easy to undo · Only its own work.**
  - Code, tests, docs
  - The agent acts
- **Easy to undo · Reaches others.**
  - Shared labels, team settings
  - The agent proposes
- **Hard to undo · Only its own work.**
  - Deleted work, exported files
  - The agent shows the result first
- **Hard to undo · Reaches others.**
  - Merges, releases, publishing
  - A person decides

> Others act on shared state before you can undo a mistake there.

<!--
Two things decide the risk: how hard the change is to undo, and who else it touches. How difficult the work is doesn't matter. A tricky refactor on the agent's own branch is fine, because if it goes wrong you throw the branch away. A one-line change to labels the whole team relies on is different. Other people, and other agents, act on it before you notice. We saw this firsthand. We asked an agent to mark about twelve issues as ready, and it marked sixty.
-->

---

<!-- _class: list takeaway -->

`Autonomy · The stop list`

## Five kinds of change always come back to a person.

- Shared state: labels, boards and settings other people read.
- The build pipeline: every future change pays for a new step.
- A number a person set: we asked for twelve and got sixty.
- A core document's meaning: rewriting rules differs from following them.
- Anything irreversible or public: merges, releases, comments on others' work.

<!--
We turned the grid into a short list. These five kinds of change always come back to a person, even when a rule points at them. Shared state. The build pipeline, because one bad step slows down every future change. Any number a person set: when we said about twelve, twelve was the decision. The meaning of a core document. And anything you can't take back or that the public sees. When the agent does ask, it puts every question into one message, so you only have to decide once.
-->

---

<!-- _class: compare-prose chosen -->

`Autonomy · How to ask`

## When the agent asks, it brings measured options and a recommendation.

- A weak question
  - "Should I add this check to the build?" Now you have to do the analysis.
- A strong question
  - "This check adds half a second to each build and catches the bug we hit last week. I recommend adding it." You just decide.

<!--
How the agent asks matters as much as when. A weak question hands the analysis back to you. A strong one comes with the options, what each one costs, and a recommendation. And the costs should be measured. In one of our sessions, the agent guessed an option would cost about five seconds. Measured, it was half a second, and the guess had pointed toward the wrong choice. If a number takes a minute to measure, measure it.
-->

---

<!-- _class: table table-fill -->

`Autonomy · In Claude Code`

## Permissions and plan mode turn the reach test into settings.

| Practice | In Claude Code |
| --- | --- |
| Run safe commands freely, never risky ones | The allow, ask and deny lists in `.claude/settings.json` |
| Show the plan before touching anything | Plan mode: `Shift+Tab` |
| The same limits for every developer | Managed settings, rolled out org-wide |

<!--
In Claude Code, the reach test becomes settings. The allow list is what the agent may run freely, the ask list needs your yes, and the deny list it can never run. Plan mode makes the agent propose before it acts, which is what you want for anything in the riskier corners of the grid. Managed settings apply the same limits to everyone in the organization, so nobody's safety depends on their personal setup.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Practice 03 · Watch the dailies`

## Verification you can trust

---

<!-- _class: compare-prose insight-bottom-line -->

`Verification · The gap`

## Agents report what they believe, and that can differ from what is true.

- What the agent reported
  - "Verified with a real browser," in the pull request, the commit message and the design note.
- What was true
  - The test still passed with the fix deleted. It could never fail, so it proved nothing.

> Rules an agent checks on itself are weak. A second, independent check catches what they miss.

<!--
Every team runs into this. One of our agents reported a fix as verified, in three places. We asked a second agent to try to break the test. It deleted the fix, ran the test again, and the test still passed. The first agent wasn't lying. It believed the fix worked. That's the core problem: the report and the reality can drift apart, and the agent can't see the gap from where it sits. We even had a written rule against unverified claims at the time. The rule didn't catch it. The second agent did.
-->

---

<!-- _class: list takeaway -->

`Verification · The claim rule`

## Every "verified" says where it ran and shows proof from there.

- Say where: the real browser, the real export, the real device.
- Show proof: a screenshot, a log or a number from that place.
- Say "unverified" out loud when the real thing is out of reach.
- Treat a passing build as partial: it proves only what the build runs.

<!--
So we gave the word "verified" rules. It has to say where the check ran: the real browser or the real export, and not a simulator standing in for them. It has to come with proof from that place. When the agent can't reach the real thing, it writes "unverified," and we count that as a good answer. And a passing build is never the whole story, because the build only checks what it runs.
-->

---

<!-- _class: diagram -->

`Verification · The ladder`

## Match the amount of checking to the damage a mistake could do.

```mermaid
flowchart LR
  A["Routine change<br/>tests and linters"] --> B["Wide impact<br/>a second agent<br/>redoes the work"]
  B --> C["Critical or new<br/>three reviewers,<br/>three jobs"]
  C --> D["Can't be undone<br/>a person decides"]
```

<!--
Not every change needs the same scrutiny. Routine work gets the automated tests and linters. Anything with wide impact gets a second agent that redoes the work from scratch. Reading the first agent's summary doesn't count, because a summary carries the same blind spots. Critical or brand-new work gets three reviewers, each with a different job. And anything that can't be undone goes to a person. The expensive checks go where they matter.
-->

---

<!-- _class: cards-grid three insight-our-view -->

`Verification · Three reviewers`

## Three reviewers with different jobs catch different failures.

- Red team
  - Tries to break it: edge cases, misuse, the input nobody tried.
- Skeptic
  - Asks whether we are solving the right problem at all.
- Fact checker
  - Re-derives every fact and number from the source.

> Reviewers who check correctness miss a wrong goal. Give that job to one reviewer.

<!--
At the top of the ladder, three reviewers each get a different job. The red team tries to break the change. The skeptic asks whether we're solving the right problem at all. And the fact checker re-derives every fact and number from the source. The jobs are different because the failures are different. In one review, two checkers confirmed a change was correct. They were right: it was correct. Only the skeptic noticed it solved the wrong problem.
-->

---

<!-- _class: cards-grid four insight-why -->

`Verification · Checks that can fail`

## A check earns trust by proving it can fail.

- Reasons for exceptions
  - Every exception to a rule has a written reason.
- Unused exceptions fail
  - An exception that no longer applies breaks the build.
- Plant a known bug
  - Each run plants a bug and fails if the check misses it.
- Warn, then block
  - A new check blocks merges only after a clean record.

> A check that always passes looks exactly like a check that works.

<!--
Automated checks need the same skepticism. One of our main checks could never fail, for any component, and nobody noticed for months. A check that always passes looks just like one that works. Four habits fixed that. Every exception to a rule gets a written reason. An exception that no longer applies breaks the build, so the list can't quietly grow stale. Each run plants a known bug, and the check has to catch it. And a new check starts by warning. It only starts blocking merges once it has a clean track record.
-->

---

<!-- _class: table table-fill -->

`Verification · In Claude Code`

## Hooks and helper agents run the checks without being asked.

| Practice | In Claude Code |
| --- | --- |
| Run checks after every edit | A hook that runs after each edit (`PostToolUse`) |
| Refuse "done" until the tests pass | A hook that runs when it tries to finish (`Stop`, exit code 2) |
| An independent reviewer | A read-only helper agent, or `/code-review` |

<!--
A hook is a small script Claude Code runs at a fixed moment, whether or not the agent remembers to. One kind runs after every edit, so your linter always runs. Another runs when the agent tries to finish. If that script exits with code two, the agent has to keep working, for example until the tests pass. For a second opinion, set up a reviewer agent that can read but not edit, or run slash code-review on the change.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Practice 04 · Keep continuity`

## A system that learns

---

<!-- _class: cycle insight-key -->

`Learning · The loop`

## Every rule should travel one loop, from mistake to retirement.

- Something breaks
  - A bug ships, or an agent oversteps.
- Write it down
  - A dated note: what happened, why, what we decided.
- Make a rule
  - One line, marked with what enforces it.
- Add a check
  - A script enforces the rule where it can.
- Retest
  - Retire the rule once its reason no longer holds.

> Copy the loop, and let your own mistakes write your rules.

<!--
This loop is how the whole system improves. Something breaks. Someone writes a short, dated note: what happened, why, and what we decided. The decision becomes a one-line rule that says what enforces it, either a script or just the agent's own discipline. Where we can, a script does the enforcing. Then, every so often, we retest the rules. We retired one rule after two months when a retest showed it had never been true. Don't copy our rules. Copy the loop, and your own mistakes will write rules that fit your team.
-->

---

<!-- _class: code -->

`Learning · The decision note`

## A decision note records why, so nobody has to guess later.

```markdown
---
status: shipped
summary: Allow real database calls in tests; the ban had no evidence
---

# Retire the rule against database calls in tests

Symptom   The rule forced slow, fragile mocks for two months
Claim     Real database calls make tests flaky
Evidence  500 runs against a test database: 0 flaky
Decision  Retire the rule; keep its number unused
```

<!--
Here's what a decision note looks like. This example mirrors a real one: a rule that sat in place for two months on a claim nobody had tested. It has a status the tools can read and a one-line summary, then the symptom, the claim behind the rule, the evidence, and the decision. It takes ten minutes to write. It pays off months later, when someone asks why things are the way they are and finds an answer instead of guessing. Agents read these notes too, so the team's reasoning follows every session.
-->

---

<!-- _class: table table-fill -->

`Learning · Three kinds of document`

## Proposals, decision records and specs answer different questions.

| Document | Answers | When it expires |
| --- | --- | --- |
| Proposal | Which option should we pick? | Once someone decides |
| Decision record | Why is it this way? | Never; a newer record replaces it |
| Spec | What must every implementation do? | Never; you edit it to stay true |

<!--
It helps to know which kind of document you're writing, because each one ages differently. A proposal lays out options before a decision, and it expires once someone decides. A decision record explains why things are the way they are. You don't edit it later to match what happened; you write a new record that replaces it. A spec is the contract other people build against, and you keep editing it so it stays true. Mark each document with its type as well as its status. We didn't, and dozens of our notes still say "proposed" long after they were decided.
-->

---

<!-- _class: code insight-recommendation -->

`Learning · The evidence card`

## Before every merge, the agent grades its confidence by its weakest point.

```text
Pre-merge: add retry to failed exports
WHAT        One automatic retry on a failed export
EVIDENCE    Real export run 20 times: 0 failures
RISK        Export path only · revert: one commit
UNVERIFIED  Safari's download dialog
CONFIDENCE  high, limited by the evidence
            raise it by: run the export in Safari
```

> Grade by the weakest area, and always name the one thing that would raise it.

<!--
Here's an example of what we call an evidence card. The agent posts one before it asks a person to merge. Confidence is set by the weakest of five areas: evidence, reach, how easy it is to undo, unknowns, and whether an independent review ran. It is never an average. The last line names the one thing that would raise the grade. So instead of asking "are you sure?", you can choose: merge now, or spend ten minutes running the export in Safari. Agents act on that line, and the card is what people actually read before they merge.
-->

---

<!-- _class: compare-prose chosen -->

`Learning · Pending work`

## Keep pending work in the repository, one file per item.

- In chat
  - Gone when the session ends. When we finally checked, nearly half of our chat-only to-dos were already done or duplicated.
- In the repository
  - One small file per item, with a priority and a "done when." Any session can pick it up cold.

<!--
When an agent session ends, anything that lived only in the chat goes with it. So every piece of unfinished work gets its own small file in the repository, with a priority and a clear "done when." We use one file per item instead of one shared list, and the reason is practical. Two changes in progress never edit the same lines, so they never collide when they merge. We fixed our changelog the same way. Every change adds its own small entry file instead of editing one shared file.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Practice 05 · Cast the crew`

## Orchestration

---

<!-- _class: table table-fill -->

`Orchestration · A roster`

## Give each agent one job and a name, and pick it by its job.

| Agent | Its one job |
| --- | --- |
| Scout | Find where things live and how they work |
| Fact checker | Confirm or refute each claim against the source |
| Build fixer | Find why a check failed, and fix the cause |
| Red team | Break the change before users do |
| Skeptic | Ask whether we are solving the right problem |
| Prose checker | Catch unclear or machine-sounding writing |

<!--
Orchestration just means coordinating several agents. Instead of one general assistant, keep a small roster of named agents. Each one has a short definition: one job, and only the tools that job needs. A reviewer, for example, can read but can't edit. You pick an agent by the job you need done, and its instructions are written for that job. In Claude Code these definitions live in the agents folder of your repository, so the whole team shares one roster.
-->

---

<!-- _class: list-steps insight-verdict -->

`Orchestration · Competing designs`

## Compare several drafts, then review only the winner.

1. Draft
   - Three to five agents each draft a design.
2. Critique
   - One critic reviews each design once.
3. Fact-check
   - One checker verifies every draft's claims.
4. Pick
   - Judges compare; a person picks.
5. Review
   - Only the winner gets three reviewers.

> Spend the expensive review on the design you will actually ship.

<!--
For a big, open design question, like an architecture or a data model, several independent drafts beat one draft revised many times. Each agent works on its design in one continuous session, so it doesn't pay to reload everything each round. A separate critic reviews each design once. One fact checker covers them all. Then judges compare the designs side by side, and a person picks. Only the chosen design gets the full three-reviewer check. The first time we tried this, we reviewed every candidate and used fifty-three agents. This way takes about seventeen.
-->

---

<!-- _class: list takeaway numbered -->

`Orchestration · Budget`

## Treat agent count like money: estimate it, cap it, and stop early.

- Estimate how many agents and roughly what it will cost before you start.
- Count across the whole session; small runs add up.
- Past about ten agents, a person approves.
- Stop when a round changes nothing, usually by round three.
- Record what it cost, so you learn what it was worth.

<!--
Each extra agent costs money, and it doesn't always make the result better. So we budget agents like money. Estimate before you start. Count across the whole session, because a lot of small runs add up. Past about ten agents, a person signs off. Stop refining once a round changes nothing, which usually happens by the third round. And write down what it cost. That last one is where we're weakest ourselves. Almost none of our big runs recorded their cost, so we can't tell which ones were worth it.
-->

---

<!-- _class: roadmap -->

`Getting started · A quarter`

## Start with one habit per practice, then add a layer each month.

`[{[ ], Next step}]`

| Practice | Week 1 | Month 1 | Quarter 1 |
| --- | --- | --- | --- |
| Context | [ ] A one-page index file | [ ] Linked detail docs | [ ] Measure what sessions load |
| Autonomy | [ ] Allow and deny lists | [ ] A written stop list | [ ] Human approval in the platform |
| Verification | [ ] Tests on every change | [ ] A check that plants a bug | [ ] A second agent on risky work |
| Learning | [ ] A decision log | [ ] Pending work as files | [ ] Retest your oldest rules |

<!--
You don't need all of this at once. In week one: a short index file, basic allow and deny lists, tests on every change, and a decision log. By the end of the first month: linked detail documents, a written stop list, one check that proves it can fail, and pending work kept as files. By the end of the quarter: measure what your sessions load, make merge approval a setting in your platform, add a second reviewing agent for risky work, and retest your oldest rules. Leave orchestration until these four are solid.
-->

---

<!-- _class: table table-fill -->

`Getting started · Your kind of work`

## The practices carry over, but what counts as "the real thing" changes.

| Work | The real thing to check | A check that proves it can fail |
| --- | --- | --- |
| Data science | A fixed, versioned evaluation set | Plant an input that leaks the answer |
| Data engineering | The target warehouse | Insert a known-bad row |
| Analytics and BI | The published dashboard | Plant a mismatch with the source |
| Services | Staging, or a slice of live traffic | Break a contract on purpose |
| Tools and CLIs | The built program's output | A saved expected output that must change |

<!--
These practices came from a web application, but they travel. What changes is what counts as the real thing. In data science, it's a fixed, versioned evaluation set. In data engineering, it's the target warehouse. In analytics, it's the dashboard people actually open. For services, it's staging or a small slice of live traffic. In every case, you can plant a known problem to prove your check catches it. Two cautions for data work: give agents a safe copy instead of production data, and expect results to vary from run to run, so compare against a range.
-->

---

<!-- _class: compare-prose chosen insight-why -->

`The one rule · Why it compounds`

## Agents copy what they find, so quality and jank both compound.

- Fix it in post
  - The next agent reads the shortcut as the house style and copies it. A month later, it is in ten files.
- Get it right on set
  - The next agent copies the clean version instead. Every change starts from firmer ground.

> Every shortcut you ship becomes context for the next agent.

<!--
Every film crew knows the phrase "we'll fix it in post." It's how shortcuts get made, and with agents it's more expensive than it used to be. An agent learns how your project works by reading it. If it finds a hack, it assumes that's how things are done here, and it copies it, quickly, everywhere. One shortcut becomes ten in a month. It works the other way too. A clean foundation gets copied just as fast, and every change starts from better ground than the one before. With agents, quality compounds, and so does jank. You choose which one.
-->

---

<!-- _class: list takeaway numbered insight-the-ask -->

`Your next step`

## Three moves this week put all five practices in motion.

- Rewrite your instruction file as an index, one line per rule.
- Add one check, then break your code on purpose and watch it catch the bug.
- Start a decision log: one dated note each time something goes wrong.

> Pick one move and try it before next Friday.

<!--
If you try three things this week, try these. Rewrite your agent's instruction file as an index. Add one automated check, then break your code on purpose and watch the check catch it. And start a decision log, with one short dated note every time something goes wrong. In a few months, that log will hold the first draft of your team's rules, and you'll know where each rule came from.
-->

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Make reality match the claim

`Questions`

Quality compounds. So does jank.

<!--
So here's the one thing to take with you. You're the director. Use agents however you like. Just make sure that what you ship is what you said you shipped, because with agents, quality compounds, and so does jank. The starter kit is at the end of the deck when you want it. Thanks. Let's take questions.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`The starter kit`

## Copy these, then make them yours

---

<!-- _class: glossary -->

`Starter kit · Six terms`

## Six terms from this talk, in plain words.

- CI, the build
  - Automated checks that run on every proposed change.
- Context window
  - Everything the model can see at one moment.
- Hook
  - A script the agent tool runs at a fixed moment.
- Pull request
  - A proposed change, waiting for review before it merges.
- Session
  - One conversation with an agent, from start to finish.
- Token
  - A chunk of text, about three quarters of a word.

<!--
For anyone reading this later, here are the six terms we leaned on most, in plain words.
-->

---

<!-- _class: table table-fill -->

`Starter kit · What is in it`

## Seven files put all five practices into a repository in five minutes.

| File | Where it goes | Practice |
| --- | --- | --- |
| Instruction file | `CLAUDE.md` | Context, autonomy |
| Settings | `.claude/settings.json` | Autonomy, verification |
| Stop hook | `.claude/hooks/` | Verification |
| Reviewer agent | `.claude/agents/checker.md` | Verification, orchestration |
| Evidence card | PR template | Learning |
| Decision note, follow-up file | `docs/decisions/`, `followups/` | Learning |

<!--
Everything in this last section is in a kit folder next to this deck, ready to copy. There are seven files, and together they set up all five practices in about five minutes. I'll show each one quickly so you know what's there. You don't need to read them now.
-->

---

<!-- _class: code -->

`Starter kit · 1 of 7`

## The instruction file states the rules once and links to the detail.

```markdown
## Always
- Run the tests before you say anything is done.
- Failing test first, then the fix, then the same test passing.
- "Verified" says where it ran and shows proof from there.
  Otherwise, write UNVERIFIED.

## Ask first, even when a rule points at it
- Shared state: labels, boards, settings others read.
- The CI pipeline or git hooks.
- A number a person set: "about 12" is a decision.
- The meaning of a core doc, including this file.
- Anything irreversible or public.
```

<!--
This is the heart of the instruction file. The "Always" section covers verification. The "Ask first" section is the stop list from earlier, word for word. The full file also has a short routing table, so the agent reads the right document before it starts. Keep the whole thing to one page.
-->

---

<!-- _class: code -->

`Starter kit · 2 of 7`

## The settings file turns the reach test into allow, ask and deny lists.

```json
{
  "permissions": {
    "allow": ["Bash(npm test*)", "Bash(git diff*)"],
    "ask":   ["Bash(git push*)"],
    "deny":  ["Bash(git push --force*)", "Read(./.env)"]
  },
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/tests-must-pass.sh"
    }] }]
  }
}
```

<!--
The settings file does two things. The permission lists say what the agent may run freely, what needs your yes, and what it can never do, like force-pushing over shared history or reading your secrets file. The hooks section connects the stop hook on the next slide. Swap in your own test command.
-->

---

<!-- _class: code -->

`Starter kit · 3 of 7`

## The stop hook keeps the agent working until the tests pass.

```bash
#!/usr/bin/env bash
# Exit code 2 sends stderr back to Claude and keeps it working.
input=$(cat)
# Already sent back once by this hook? Let it stop.
echo "$input" | grep -q '"stop_hook_active": *true' && exit 0

log=$(mktemp)
if ! npm test --silent >"$log" 2>&1; then
  echo "Tests are failing. Fix them before you finish:" >&2
  tail -20 "$log" >&2
  exit 2
fi
```

<!--
This short script runs whenever the agent tries to finish. If the tests fail, it exits with code two. That sends the failure back to the agent and keeps it working. The check near the top prevents an endless loop: if the hook has already sent the agent back once, it lets it stop and report. We ran it against failing and passing test suites before putting it in the kit.
-->

---

<!-- _class: code -->

`Starter kit · 4 of 7`

## The reviewer agent re-derives every claim and never edits.

```markdown
---
name: checker
description: Independent reviewer with fresh eyes. Re-derives
  every claim and "verified" in a change. Never edits.
tools: Read, Grep, Glob, Bash
---
You are a skeptical reviewer who did not write this change.
For each claim: find the evidence yourself, run what can be
run, and check that a test fails when the fix is removed.
Mark each CONFIRMED, REFUTED or UNVERIFIABLE, with proof.
Treat "I believe it works" and "CI is green" as unverified.
```

<!--
This is the second-opinion reviewer as a file. It can read and search, but it has no tool for editing, so all it can do is report. Its instructions tell it to find the evidence itself instead of trusting the author's summary, and to confirm each test fails when the fix is removed. That one check would have caught the test that proved nothing.
-->

---

<!-- _class: code -->

`Starter kit · 5 of 7`

## The evidence card puts the facts in front of every merge decision.

```text
Pre-merge: <PR title>
WHAT        <one line: what actually lands>
WHY         <one line: the problem it solves>
EVIDENCE    <what was run or measured, and where>
RISK        <what breaks if wrong> · revert: <how>
UNVERIFIED  <caveats that bear on this decision, or none>
CONFIDENCE  <low | medium | high | very high>: <weakest area>
            raise it by: <the one thing that would raise it>

Areas: evidence · reach · undo · unknowns · review
```

<!--
Here's the evidence card as a blank template. The rule that matters is on the last line: confidence comes from the weakest of the five areas, never an average. The full template in the kit spells out what each level means, so every agent grades the same way.
-->

---

<!-- _class: code -->

`Starter kit · 6 of 7`

## The decision note records why, and when to check it again.

```markdown
---
status: proposed      # proposed | shipped | superseded
type: decision        # proposal | decision | spec | scoping
summary: One line a reader can scan in the index
---
# <The decision, as a sentence>

Symptom.     What prompted this, with a link or number.
Cause.       Why. Measured, observed or argued?
Decision.    What we will do, and what we rejected.
Enforced by. The check that holds it, or "discipline only".
Retest when. When we check that this still holds.
```

<!--
The decision note template bakes in two lessons we learned the hard way. It records the type as well as the status, so a proposal can't sit around looking like a decision. And it asks how we know the cause, whether measured, observed, or just argued, and when to retest, so a guess doesn't quietly become a permanent rule.
-->

---

<!-- _class: code -->

`Starter kit · 7 of 7`

## The follow-up file keeps pending work where the next session will find it.

```markdown
---
origin: 1234
priority: P1
recorded: 2026-09-25
---
# Export drops the last row when the file ends without a newline

why now   — every weekly report is one row short
where     — src/export/csv.ts
done when — a file with no trailing newline exports every row
verify    — the new unit test, then one real export
```

<!--
Last one. Each pending item gets its own small file: why it matters now, where to look, what "done" means, and how to check it. Any session, whether it's a person or an agent, can pick it up cold. And because each item has its own file, two changes never collide over the same list. That's the kit. Take it, adapt it, and let your own mistakes grow it.
-->
