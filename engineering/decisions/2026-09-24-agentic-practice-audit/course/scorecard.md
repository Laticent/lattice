# Course scorecard

The human half of the teaching bar. `harness.mjs` checks what a machine can count; this
page scores what it can't.

**Scale:** 4 = excellent · 3 = good, meets the bar · 2 = a real gap · 1 = fails.
**The bar:** no score below 3 in any chapter.

**Who scored it, and how far to trust it:** the author (an agent) scored it on
2026-10-14, after a full read-through of the rewrite for working engineers. An author's
score of their own work runs high. Treat these numbers as a starting point for a human
reviewer. They are not a verdict. A cold read by an engineer from the target audience has
**not** been done (see the last section).

## The six criteria

1. **Respects the baseline.** It assumes what a working engineer knows (git, pull
   requests, CI, review, testing) and spends its time only on what's new with agents.
2. **Concrete before abstract.** Every idea arrives as a case from the booking app first,
   and as a rule second.
3. **One idea at a time.** A slide makes one point, and a chapter doesn't stack metaphors.
4. **Practice.** The Check question makes the reader apply the idea, not just recognize
   it, and the "Try it" exercise works on a real project this week.
5. **True and current.** Every claim holds up. Where the evidence is mixed or the point is
   a judgment, the slide or its notes say so.
6. **Stands alone.** A reader who took only the primer can follow the chapter.

## Scores

| Chapter | 1 Baseline | 2 Concrete | 3 One idea | 4 Practice | 5 True | 6 Alone |
| --- | --- | --- | --- | --- | --- | --- |
| Primer | 4 | 4 | 4 | 4 | 4 | — |
| 1 · Directing the agent | 4 | 4 | 3 | 4 | 4 | 4 |
| 2 · What the agent sees | 4 | 4 | 3 | 4 | 4 | 4 |
| 3 · What the agent may do alone | 4 | 4 | 4 | 3 | 4 | 4 |
| 4 · Proving it works | 3 | 4 | 4 | 3 | 4 | 4 |
| 5 · Learning from mistakes | 4 | 4 | 4 | 4 | 4 | 4 |
| 6 · Working with many agents | 4 | 3 | 3 | 3 | 3 | 4 |
| 7 · Hard problems | 4 | 4 | 4 | 4 | 4 | 4 |
| 8 · Making it last | 3 | 4 | 3 | 4 | 4 | 4 |

Every score is 3 or above, so every chapter meets the bar. These are the threes, and what
it would take to lift each one:

- **Chapter 1, criterion 3.** It uses three metaphors (floor and ceiling, film director,
  a manager). Cutting to one would be cleaner.
- **Chapter 2, criterion 3.** "A clean view" packs three habits onto one slide, and
  "subagent" arrives inside one of them. A slide of its own would lift it.
- **Chapter 3, criterion 4.** The Check answer (an invite to every employee) is obvious to
  any engineer. A closer call, such as a database migration on a shared staging server,
  would make the reader think.
- **Chapter 4, criteria 1 and 4.** The gates slide names the hook, CI and the merge
  queue, which a working engineer knows; it earns its place only through the "day one"
  slide after it. The Check answer is obvious.
- **Chapter 6, criteria 2, 3, 4 and 5.** The budget slide has no booking case. The
  strongest-model slide states a judgment others dispute; the notes say so, but the
  slide doesn't. The Check answer is obvious.
- **Chapter 8, criteria 1 and 3.** Retiring an API in steps is familiar to most
  engineers. The slide earns its place through the agent angle ("an agent asked to clean
  up the API will just delete it"), and that angle is only in the notes.
- **Practice, overall.** Every Check is multiple choice, which tests recognition more than
  use. An open question ("rewrite this request") would test more, at the cost of needing
  someone to mark it.

## Not yet done: the cold read

The only real test of teaching material is a reader from its audience. Give one chapter
to an engineer who hasn't used a coding agent and hasn't seen the course, then ask them to
explain its three takeaways back and note where they stall. Score that chapter again
afterward. Until that happens, criterion 1 in particular is the author's guess about a
reader they aren't.
