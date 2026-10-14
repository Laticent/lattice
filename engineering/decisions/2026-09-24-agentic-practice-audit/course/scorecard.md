# Course scorecard

The human half of the teaching bar. `harness.mjs` checks what a machine can count; this
page scores what it can't.

**Scale:** 4 = excellent · 3 = good, meets the bar · 2 = a real gap · 1 = fails.
**The bar:** no score below 3 in any chapter.

**Who scored it, and how far to trust it:** the author (an agent) scored it on
2026-10-14, after one full read-through. An author's score of their own work runs high.
Treat these numbers as a starting point for a human reviewer. They are not a verdict. A
cold read by a new graduate has **not** been done (see the last section).

## The six criteria

1. **Starts from what they know.** It builds on things a CS graduate already has (code,
   tests, bugs, group projects) and adds one layer at a time.
2. **Concrete before abstract.** Every idea arrives as a case from the shop story first,
   and as a rule second.
3. **One idea at a time.** A slide makes one point, and a chapter doesn't stack metaphors.
4. **Practice.** The Check question makes the learner apply the idea, not just recognize
   it, and the "Try it" exercise is something a graduate can actually do this week.
5. **True and current.** Every claim holds up. Where the evidence is mixed, the slide says
   so.
6. **Stands alone.** A learner who took only the primer can follow the chapter.

## Scores

| Chapter | 1 Prior | 2 Concrete | 3 One idea | 4 Practice | 5 True | 6 Alone |
| --- | --- | --- | --- | --- | --- | --- |
| Primer | 4 | 4 | 4 | 3 | 4 | — |
| 1 · Directing the agent | 3 | 3 | 3 | 3 | 4 | 4 |
| 2 · What the agent sees | 3 | 3 | 3 | 4 | 4 | 4 |
| 3 · What the agent may do alone | 4 | 4 | 4 | 4 | 4 | 4 |
| 4 · Proving it works | 4 | 4 | 3 | 4 | 4 | 3 |
| 5 · Learning from mistakes | 4 | 4 | 4 | 3 | 4 | 4 |
| 6 · Working with many agents | 3 | 3 | 3 | 3 | 3 | 4 |
| 7 · Hard problems | 4 | 4 | 4 | 4 | 4 | 4 |
| 8 · Making it last | 3 | 3 | 3 | 4 | 4 | 4 |

Every score is 3 or above, so every chapter meets the bar. These are the threes, and what
it would take to lift each one:

- **Chapter 1, criteria 1–3.** The chapter uses three metaphors (floor and ceiling, film
  director, a manager), and the floor-and-ceiling slide has no shop case. Cutting it to
  one metaphor and tying the floor-and-ceiling slide to Sam would lift all three.
- **Chapter 2, criteria 1–3.** "A clean view" packs three habits into one slide, and
  "subagent" arrives inside one of them. A slide of its own would lift it.
- **Chapter 4, criteria 3 and 6.** The claim slide points back to the primer's bug ("Remember
  the primer"). That's fine for a learner who took the primer, but it's the one chapter
  that leans on the primer's story rather than only its terms.
- **Chapter 6, criteria 1–3 and 5.** A new graduate has never managed anyone, so "a team
  of agents" has the least to build on. The strongest-model slide states a judgment the
  field still argues about, and the slide gives the reason without saying that others
  disagree.
- **Chapter 8, criteria 1–3.** The guardrail example (raw colors in page styles) is the
  only case in the chapter that isn't about money in the cart.
- **Practice, primer, Chapter 1, Chapter 5 and Chapter 6.** Each Check is multiple choice,
  which tests recognition more than use. An open question ("rewrite this request")
  would test more, at the cost of needing someone to mark it.

## Not yet done: the cold read

The only real test of teaching material is a learner. Give one chapter to a new graduate
who hasn't seen the course, ask them to explain its three takeaways back, and note where
they stall. Score that chapter again afterward. Until that happens, criterion 1 in
particular is the author's guess about a reader they aren't.
