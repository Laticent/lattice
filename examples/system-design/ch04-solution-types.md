---
marp: true
size: 4K
theme: indaco
paginate: true
profile: teaching
glossary: auto
header: "System design · Chapter 4"
acronyms:
  MVP: { expansion: minimum viable product, definition: "The smallest build that puts a real answer in front of a real user." }
---

<!-- _class: title silent spectrum -->

# Which Answer Is Wanted

`Chapter 4 of 13 · Part three`

Five rungs run from an MVP to a specialized system, and each one costs more and commits harder than the rung below it.

---

<!-- _class: agenda progress-4 -->

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

## Chapter three named the force. This chapter prices the answer.

The antagonist you cast in chapter three picks the rung; the size of the company picks nothing. You climb one rung at a time and only on evidence. The chapter closes on the removal test — a design is finished when taking one more thing out would break it — and that test comes back in every chapter after this one, including the two that design a product from nothing.

---

<!-- _class: divider numbered -->

`Part three`

## "Design Instagram" is five different questions.

---

<!-- _class: content -->

`Before the boxes`

## Before you design anything, say which kind of answer is wanted.

The same words — design a photo sharing app — have five legitimate answers that share almost no architecture. A build that takes a week and a build that takes two years are both correct, for different questions.

Ask for Maya's twelve-minute build to be made faster and you have said three things at three different rungs: rent a bigger runner, profile the slow step, or write a build system that knows this repository. Until somebody says which, nobody does any of them.

Gall's law says it plainly: a complex system that works is invariably found to have evolved from a simple system that worked. You climb this ladder. You do not parachute onto it.

---

<!-- _class: premise -->

## Each rung costs more and commits harder than the one below it.

You move up when the rung you are standing on stops paying, and you move up one rung at a time.

1. MVP
   - Buys information fast.
   - Does anyone want this?
2. Scaled
   - Holds up as load grows.
   - Will it survive success?
3. Optimized
   - Cuts cost on a known path.
   - Where is the money going?
4. Optimal
   - Provably best, for one model.
   - What is the real limit?
5. Specialized
   - An advantage nobody can copy.
   - What can only we do?

---

<!-- _class: split-panel proof cat-4 -->
<!-- _header: "" -->

`Rung one · MVP`

## An MVP is an experiment wearing a product's clothes.

Its job is to produce a decision, not to last. Every hour spent making it durable is an hour spent on a system you may correctly delete next month.

- The tell
  - The riskiest thing is whether anyone wants it, and being wrong is cheap.
- Buy simplicity, not capacity
  - One database, one service, one region, boring technology, nothing clever anywhere.
- Name the exit in advance
  - Write down the number that means "stop, this now has to be built properly."

---

<!-- _class: split-panel proof cat-5 -->
<!-- _header: "" -->

`Rung two · scaled`

## A scaled system survives ten times the load without a rewrite.

You have stopped buying information and started buying headroom. The question moves from "does it work" to "what breaks first, and how do I move that limit." Maya's day had two candidates for that limit — the twelve-minute build and one reviewer — and only one stopped 482.

- The tell
  - Growth is real, and the current design has a ceiling you can point at.
- A bigger box first, then the four moves
  - Vertical scaling is not one of the four; it is what buys time before you need them, and it is reversible. Then reduce, duplicate, defer — and spread last, because partitioning is the one you cannot undo cheaply.
- Cost per unit starts counting
  - Cost per request stops being noise and becomes the second constraint on every choice.

---

<!-- _class: split-panel proof cat-6 -->
<!-- _header: "" -->

`Rung three · optimized`

## Optimizing means moving one measured number on one hot path.

Optimization without a profile is decoration. You need the measurement first, the target second, and a willingness to accept the complexity you are about to add.

- The tell
  - A profile shows which tenth of the work is most of the cost.
- Premature is half the quote
  - Knuth also wrote that we should not pass up the critical three percent. Both halves.
- Complexity is the invoice
  - Each optimization narrows the assumptions the system is allowed to break.

---

<!-- _class: split-panel proof cat-7 -->
<!-- _header: "" -->

`Rung four · optimal`

## Optimal means provably best against an objective you wrote down.

Rarer than it sounds. It needs a stated objective, a stated model, and a proof or a bound — and it is optimal only for the assumptions you fixed in place.

- The tell
  - The objective is a function and the constraints are inequalities, on paper.
- The proof is against a model
  - Change the assumptions and the optimal answer changes underneath you.
- It ages badly
  - An optimal design pinned to last year's hardware is a legacy system with a certificate.

---

<!-- _class: split-panel capstone cat-8 -->
<!-- _header: "" -->

`Rung five · specialized`

## A specialized system trades generality for something nobody can copy.

Custom silicon, a purpose-built storage engine, a scheduler that knows your physics. You give up flexibility, portability and hiring pool for a capability the market cannot sell you.

- The signal
  - The advantage is durable, measurable, and central to why customers choose you.
- The cost never ends
  - You now maintain what everyone else gets free from a vendor, forever.
- Almost nobody is here
  - Most teams reaching for this rung needed the optimized one and got excited.

---

<!-- _class: decision -->

`The rule`

## Climb one rung at a time, and only on evidence.

- Move up when the current rung fails on a measurement
  - A number, a profile, a named risk. Not a feeling that things are getting big.
- Move up exactly one rung
  - Jumping from MVP to optimal buys rigor for assumptions nobody has tested yet.
- Move back down when the evidence changes
  - A rewrite that simplifies is a legitimate move.

---

<!-- _class: split-panel capstone cat-2 -->
<!-- _header: "" -->

`The removal test`

## A design is finished when taking one more thing out would break it.

Antoine de Saint-Exupéry wrote that perfection arrives not when there is nothing left to add, but when there is nothing left to take away. Dieter Rams said it in three words: less, but better. Both are tests you can run on a whiteboard at four in the afternoon.

- Run it on every box
  - Delete it on paper and follow what happens. If nothing downstream changes, it was never holding anything up.
- Run it on every number
  - A figure nobody can act on is decoration. Turn it into a threshold or take it out.
- Less, but better, is not less
  - Rams designed for decades of use. Removing something the system needs is not restraint, it is a defect.

---

<!-- _class: content -->

`Your turn`

## Three requests arrive this week. Name the rung each one is asking for.

One: a founder wants to know whether anybody will pay for something that does not exist yet. Two: a service that works fine is about to take ten times the traffic, and nobody knows what gives first. Three: the bill for a single endpoint is now larger than the team that owns it.

Write a rung for each and one sentence on what it costs. Then turn the page.

---

<!-- _class: list-tabular -->

`One answer`

## The question sets the rung. The size of the company does not.

1. Will anybody pay?
   - MVP. You are buying information and paying for it with everything you will throw away.
2. Ten times the traffic
   - Scaled. You are buying headroom and paying in machines and the coordination they need.
3. The bill is too large
   - Optimized. You are buying back cost and paying in flexibility. Profile first, or you are decorating.

---

<!-- _class: list-steps -->

`The arc`

## Four movements carry a system from nothing to running, and this deck teaches the first two.

1. Discover
   - Who wants what, what is in the way, how big it is. Parts one to three.
2. Design
   - Which rung, which parts, what you can take out. Part four hands you the parts.
3. Develop
   - Build it, and find out whether the design held.
4. Deliver
   - Ship it and watch it. The running system names the field you guessed.

> Every exercise from here works discover, design, or both. Maya's Tuesday sat inside somebody else's design.

---

<!-- _class: closing silent spectrum -->

## The rung is chosen. Now you need parts.

`Chapter 4 of 13 · How to Think About Systems`

Chapters five to ten are the six kits: data, compute, network, scale, reliability, security. Sixteen entries, and the invariants behind all of them. Chapter five opens the shelf and starts with storage.
