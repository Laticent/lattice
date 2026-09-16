---
marp: true
size: 4K
theme: indaco
paginate: true
profile: teaching
glossary: auto
header: "System design · Chapter 3"
acronyms:
  MVP: { expansion: minimum viable product, definition: "The smallest build that puts a real answer in front of a real user." }
---

<!-- _class: title silent spectrum -->

# Protagonist and Antagonist

`Chapter 3 of 13 · Part two`

Name the person and the force in two sentences, and everything downstream has an answer.

---

<!-- _class: agenda progress-3 -->

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

## Six words from chapter two arrive here undefined.

System, purpose, boundary, environment, constraint and invariant all appear in this chapter without being explained again; chapter two explains them against Maya’s Tuesday. What this chapter adds is the opening move. Who wants what, and what stands in the way, decides the shape of a design before a single box goes on a board — and the antagonist decides which kind of solution you are allowed to build at all.

---

<!-- _class: divider numbered -->

`Part two`

## Every design starts with someone who wants something, and something in the way.

---

<!-- _class: content -->

`The frame`

## Name the person and the force, and everything downstream has an answer.

Juniors skip both, almost every time. They write "users" instead of one person with one goal, and they write "scale" instead of a force with a number on it. Neither produces a single design decision.

The protagonist is who the system is for. The antagonist is what makes serving them hard. Everything downstream — the purpose, the boundary, the invariants, the first move — falls out of that pair.

---

<!-- _class: code -->

`The drill`

## Two sentences take ninety seconds and settle four things you were guessing at.

```text
Protagonist:  <name> wants to <do X> so that <Y>.
Antagonist:   But <W> — and W is <a number>.

  Purpose       one sentence: what counts as this working
  Boundary      what is mine when W happens, and what I only ask for
  Invariant     what must stay true or <name> stops trusting this
  First move    what W does to the cheapest design that could work
```

*Run it on a turnstile, then a cash machine, then the thing on your screen right now. It gets fast.*

---

<!-- _class: compare-prose -->

`The drill, on Tuesday`

## Maya is the protagonist of her own day, and the interruptions are the antagonist.

- Maya wants 482 merged before four o'clock
  - So that a bug affecting real users stops affecting them, and so she is not carrying it into next week.
- But she is interrupted six times
  - A page, a favor, four status requests. Not one of them unreasonable, and each costs the reload, not just the minute.

---

<!-- _class: content -->

`The trap`

## Most systems have several protagonists, and you must say which one loses.

Instagram has at least four: the reader opening the app, the ordinary poster, the celebrity with five hundred million followers, and the engineer carrying the pager. They want incompatible things.

Naming one as the protagonist decides who waits. Say who you are not designing for, out loud, and most of the arguments later in the design turn out to be about that.

---

<!-- _class: compare-table -->

`The join`

## The antagonist chooses which kind of solution you are allowed to build.

| The antagonist is… | You are building | Because |
| --- | --- | --- |
| Nobody knows if they exist | An MVP | The risk is demand, not load |
| Growth — the protagonist multiplies | A scaled system | The limit is real and namable |
| Cost on a path you have profiled | An optimized system | The measurement came first |
| Physics — you are near a real bound | An optimal system | Only here is a proof worth it |
| A person who wants in | Security work, at any rung | Required at every rung |

---

<!-- _class: split-panel proof cat-2 -->
<!-- _header: "" -->

`Instagram · the casting`

## Our protagonist reads on a phone and gives us about a second.

She opens the app a dozen times a day, on a cellular network, usually while doing something else. She wants photographs from the people she chose, recent, ranked, and hers. The poster is a supporting character: he tolerates a spinner, and every time the design has a choice, work goes onto his side.

- The reader's demand
  - A page on her phone in under a second, which is 200 ms of server time plus the network.
- The poster can wait
  - Uploading, transcoding and delivery may all take their time. Nobody is watching.
- Casting decides the design
  - It is why the feed is built when someone posts, not when someone reads.

---

<!-- _class: split-panel capstone cat-3 -->
<!-- _header: "" -->

`Instagram · the antagonist`

## The antagonist is not scale. It is the shape of the follow graph.

Scale is a quantity, and quantities have a price you can pay. The thing you cannot buy your way out of is a distribution. Follower counts are heavy-tailed: almost everyone has a few hundred, and a handful have hundreds of millions. No single account looks like the average, and the far end sits six orders of magnitude from the middle.

- The number that matters
  - The median account has about 150 followers. The largest has five hundred million.
- One algorithm cannot serve both
  - That gap is why the design ends up with two paths instead of one.
- Hold on to this
  - Every hard decision in Part five is this one fact again.

---

<!-- _class: content -->

`Your turn`

## Cast the last app you opened, in the same two sentences.

Pick something ordinary: a maps app, a chat client, the thing your team ships. Fill in both lines, exactly as the drill has them:

```text
Protagonist:  <name> wants to <do X> so that <Y>.
Antagonist:   But <W> — and W is <a number>.
```

The second line is the hard one. If you cannot put a number on W, you have just found the first thing worth going and measuring.

---

<!-- _class: compare-prose -->

`One answer`

## A maps app casts the same way, in two sentences.

- The protagonist
  - A driver already moving wants the next turn early enough to take it, so that the road and the screen never compete. Everyone else — the person searching, the person saving a place, the person reading reviews — is slower and can wait.
- The antagonist
  - The signal drops in the tunnel, and the tunnel is ninety seconds long. That number is the design: ninety seconds of route has to be on the phone before the phone goes quiet.

---

<!-- _class: closing silent spectrum -->

## The antagonist picks the rung.

`Chapter 3 of 13 · How to Think About Systems`

Chapter four prices it. “Design Instagram” is five different questions, and answering the wrong one costs a quarter — so the ladder comes next, with the test that says a design is finished.
