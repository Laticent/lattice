---
marp: true
size: 4K
theme: indaco
paginate: true
profile: teaching
glossary: auto
header: "System design · Chapter 1"
acronyms:
  VPN: { expansion: virtual private network }
---

<!-- _class: title silent spectrum -->

# Before Anything, a Tuesday

`Chapter 1 of 13 · Part zero`

One engineer, wake to sleep. Ten ideas run through her day, and not one of them gets a name until the next chapter.

---

<!-- _class: agenda progress-1 -->

## Thirteen chapters, gathered into six movements.

1. A Tuesday — one engineer, wake to sleep
2. The words — naming what you just watched
3. Protagonist and antagonist — where a design starts
4. Solution types — which answer is wanted
5. Six kits — data, compute, network, scale, reliability, security
6. Two designs, then the map back — Instagram, a parking app, and what you keep

---

<!-- _class: content -->

`Where this sits`

## Read this chapter without looking anything up.

Thirteen chapters carry one method: watch a system, name its parts, find who wants what and what blocks them, decide which kind of answer the job needs, pick your parts off six shelves, then design two products end to end. This first chapter spends no systems-design vocabulary on purpose. You meet each idea the way Maya meets it, against a timestamp, and chapter two hands you the word for it afterwards. Nothing here needs a chapter before it.

---

<!-- _class: divider -->

`Part zero`

## Before anything is a system, it is a Tuesday.

---

<!-- _class: content -->

`The rules of this part`

## Maya has been an engineer for seven months. Today she wants one thing.

She wants pull request 482 merged before the release window closes at four o'clock.

Watch her Tuesday. This part uses no systems-design words on purpose. Everything Part one names happens here first, so you see each idea before you have a word for it.

---

<!-- _class: timeline-list -->

`Morning`

## Five things happen to Maya before she reaches her desk.

1. `06:55` The shower
   - The water runs too hot. Maya turns it down and it runs too cold. She corrects it twice more.
2. `08:05` The plan
   - Maya reads her plan for the day. It has the build, the review and the four o'clock window in it.
3. `08:20` A signal failure
   - A signal fails and the train sits nine minutes. Nobody aboard can change it. Maya opens Instagram.
4. `08:50` At her desk
   - Maya uses the wifi, the VPN and the package registry. She thinks about none of them.
5. `09:05` The registry goes down
   - Three teams cannot build. Maya thinks about the registry now.

---

<!-- _class: content -->

`09:15 · standup`

## Four people met twice this week, and only one meeting worked.

On Monday each person reported to the manager in turn. That meeting ran twenty minutes and settled nothing. Today they talked to each other instead, and Maya learned in one sentence that Priya had already read the code she was about to start.

The four people did not change. Only who talked to whom changed.

---

<!-- _class: quote bare -->

> Get 482 merged before the window closes.

*Maya wrote this on a sticky note at 09:30. Nothing else is written on it.*

---

<!-- _class: cards-grid four -->

`09:45 · in the way`

## Four limits shape Maya's day, and she chose none of them.

- The build takes twelve minutes
  - Every push costs twelve minutes. Maya cannot shorten that or skip it.
- The team is three people
  - Nobody on the team is free to review her code this morning.
- The one reviewer is asleep
  - He is six time zones away and will not read anything before three o'clock.
- Production data stays in production
  - She may not copy it to her laptop, even to reproduce the bug.

---

<!-- _class: timeline-list -->

`Midday`

## By lunchtime, other people decide what Maya works on.

1. `10:15` A favor
   - Another team asks Maya to fix a flaky test in their repository. She says no.
2. `10:40` A page
   - The checkout service is failing. Maya does not own it, and she is second on call.
3. `11:00` The loop
   - Maya pushes, waits twelve minutes, finds her own mistake and pushes again. She does this twice.
4. `12:30` A branch left behind
   - Her second attempt sits half-finished on a branch, and she forgets it.
5. `13:30` The queue
   - Five pull requests are waiting for one reviewer, and he is asleep.

---

<!-- _class: timeline-list -->

`Afternoon`

## Maya spends the afternoon answering questions about the work she is not doing.

1. `15:30` The spiral
   - Nobody has reviewed 482. Someone asks for a status update, so Maya stops work to answer.
2. `15:50` She stops answering
   - Maya turns down the fourth request and saves every reply until four o'clock.
3. `16:00` The window closes
   - The reviewer wakes at three. One hour is not enough, and 482 does not merge.
4. `16:30` One thing held
   - The main branch stayed ready to deploy every minute of the day.
5. `17:00` A small realization
   - Maya checks the history. Nothing merges on Thursdays either, and nobody planned that.

---

<!-- _class: content -->

`22:40 · the reveal`

## You just watched a system run for sixteen hours.

Her day had a purpose it did not meet, and one hour that decided it. Two things ran in circles: the shower, and the questions about 482. Something she never thinks about held the day up until the registry stopped at nine. And main stayed deployable throughout — the one promise that held.

The reviewer woke at three and the window shut at four. Everything Maya did that day reached the outcome only through that hour. She spent twenty of its sixty minutes answering questions about 482, instead of waiting ready to act on whatever came back.

Ten ideas ran through that day. Part one gives you the words for them.

---

<!-- _class: closing silent spectrum -->

## Ten ideas ran through that day, unnamed.

`Chapter 1 of 13 · How to Think About Systems`

Chapter two names them — system, purpose, boundary, environment, process, model, constraint, invariant, infrastructure, emergence — each against the moment in her day that taught it.
