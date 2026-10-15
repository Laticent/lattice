# Course scorecard

The human half of the teaching bar. `harness.mjs` checks what a machine can count; this
page scores what it can't.

**Scale:** 4 = excellent · 3 = good, meets the bar · 2 = a real gap · 1 = fails.
**The bar:** no score below 3 in any chapter.

**Who scored it, and how far to trust it:** the author (an agent) scored it on
2026-10-15, after the pass that added plan-first work and code review, rewrote every Check
question as a close call, and tightened the harness. An author's score of their own work
runs high. Treat these numbers as a starting point for a human reviewer, not a verdict. A
cold read by an engineer from the target audience has **not** been done (see the last
section).

## The six criteria

1. **Respects the baseline.** It assumes what a working engineer knows (git, pull
   requests, CI, review, testing) and spends its time only on what's new with agents.
2. **Concrete before abstract.** Every idea arrives as a case from the booking app first,
   and as a rule second.
3. **One idea at a time.** A slide makes one point, and a chapter doesn't stack metaphors.
4. **Practice.** The Check question is a close call that makes the reader apply the idea,
   and the "Try it" exercise works on a real project this week.
5. **True and current.** Every claim holds up. Where the evidence is mixed or the point is
   a judgment, the slide itself says so.
6. **Stands alone.** A reader who took only the primer can follow the chapter.

## Scores

| Chapter | 1 Baseline | 2 Concrete | 3 One idea | 4 Practice | 5 True | 6 Alone |
| --- | --- | --- | --- | --- | --- | --- |
| Primer | 4 | 4 | 4 | 4 | 4 | — |
| 1 · Directing the agent | 4 | 4 | 4 | 4 | 4 | 4 |
| 2 · What the agent sees | 4 | 4 | 3 | 4 | 4 | 4 |
| 3 · What the agent may do alone | 4 | 4 | 4 | 4 | 4 | 4 |
| 4 · Proving it works | 4 | 4 | 4 | 4 | 4 | 4 |
| 5 · Learning from mistakes | 4 | 4 | 4 | 4 | 4 | 4 |
| 6 · Working with many agents | 4 | 4 | 3 | 4 | 4 | 4 |
| 7 · Hard problems | 4 | 4 | 4 | 4 | 4 | 4 |
| 8 · Making it last | 4 | 4 | 4 | 4 | 4 | 4 |

**What changed since the last scoring:**

- **Chapter 1** replaced its third metaphor with the plan-first workflow (explore, plan,
  you review, build, verify), the biggest gap for someone new to agents.
- **Chapter 4** gained a slide on how to review an agent's change: the plan, the tests,
  the diff, and size. Its gates slide is now about agents trying to get past a gate,
  which is new to engineers; before, it explained gates they already knew.
- **Every Check is now a close call.** Each wrong option is a mistake a competent engineer
  makes: "it's only staging", a test that is new but never seen to fail, freezing the
  clock so a flaky test goes green, thirty quiet days that miss a monthly job. The
  answers are spread A×3, B×3, C×3, and the harness now enforces that spread.
- **Chapter 6** says on the slide that "use the strongest model" is a judgment that teams
  disagree on, and its budget slide uses the booking app.
- **Chapter 8** puts the agent angle in the API slide's heading.
- **The glossary** now defines every term the course teaches, including "token".

## The two remaining threes

- **Chapter 2, criterion 3.** "Three habits" puts three habits on one slide, and
  "subagent" is introduced inside one of them. Giving the subagent its own slide would
  push the chapter past its 16-slide limit, so it stays a 3.
- **Chapter 6, criterion 3.** The chapter covers roles, how many reviewers, model choice,
  budget and parallel layout: five ideas in fifteen slides. Each slide makes one point,
  but the chapter is the busiest in the course.

## Not yet done: the cold read

The only real test of teaching material is a reader from its audience. Give one chapter
to an engineer who hasn't used a coding agent and hasn't seen the course, then ask them to
explain its three takeaways back and note where they stall. Score that chapter again
afterward. Until that happens, criterion 1 especially is the author's guess about a
reader they aren't.
