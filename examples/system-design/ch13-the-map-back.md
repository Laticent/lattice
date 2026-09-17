---
marp: true
size: 4K
theme: indaco
paginate: true
profile: teaching
glossary: auto
header: "System design · Chapter 13"
acronyms:
  CDN: { expansion: content delivery network, definition: "Caches near readers, so bytes travel a short distance instead of an ocean." }
  MVP: { expansion: minimum viable product, definition: "The smallest build that puts a real answer in front of a real user." }
---

<!-- _class: title silent spectrum -->

# The Map Back

`Chapter 13 of 13 · Part seven`

Every entry landed somewhere specific in the feed design, and the most useful one is the entry we refused.

---

<!-- _class: agenda progress-6 -->

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

## Both designs, read back against the ten chapters before them.

It assumes chapter eleven’s feed design in detail and the six kits from chapters five to ten. Chapter four’s removal test runs on the finished design, six review questions run on the parking app from memory, and the deck closes on the two movements it did not teach — develop and deliver — which are the only real check on the two it did.

---

<!-- _class: divider numbered -->

`Part seven`

## Now map the feed design back to the kits, including the entry we refused.

---

<!-- _class: compare-table -->

`Instagram · store and run`

## Every store-and-run entry landed somewhere specific in the feed design.

| Kit entry | Where it landed | What it charges you |
| --- | --- | --- |
| Wide-column | The two edge tables | The primary key is the schema. A new question means rewriting the data |
| Object store | Photo bytes and variants | Listing is slow, so the index of what you stored lives somewhere else |
| Key-value | The feed cache | No second way in. Every new question is a new key you maintain |
| Durable log | Post events into fan-out | At-least-once. Every consumer here has to be idempotent |
| Stateless services | Feed and post service | Nothing may be remembered in the process, so state moves and costs a hop |
| Bounded queue | Fan-out and transcode | A bound means shedding. When it fills, something waits or is dropped |

---

<!-- _class: compare-table -->

`Instagram · scale and defense`

## The network, scale, reliability and security kits landed here too.

| Kit entry | Where it landed | What it charges you |
| --- | --- | --- |
| Reduce | One cached list per celebrity | A second copy whose wrongness is measured in seconds |
| Spread | Posts by author, edges by bucket | Any question that crosses a bucket, forever |
| Defer | Fan-out on write, below the threshold | The follower who is not in the page yet |
| CDN with versioned URLs | Every photo variant | Purging is eventual, so a signed link outlives the decision behind it |
| Bulkhead | Fan-out workers kept off the read path | Reserved capacity that sits idle on a normal day |
| Object-level authorization | Every hydration | A check on the read path, on every item of every page |

---

<!-- _class: split-panel capstone cat-2 -->
<!-- _header: "" -->

`The entry we refused`

## The most useful entry here is the one we refused.

Most juniors asked to design Instagram reach for a graph database, because the words "social graph" are right there. The data kit already answered it, nearly ninety slides before this design began.

- What the card said
  - Walk away when you have relationships but only ever join two hops.
- What the feed actually does
  - Walks one graph hop, me to the people I follow, then a keyed lookup that is not a traversal.
- Why the refusal matters most
  - A kit that only says yes is a catalog. One that says no is a tool.

---

<!-- _class: split-panel capstone cat-8 -->
<!-- _header: "" -->

`The removal test, run`

## Take one box out on paper, and follow what happens to the rest.

Part three set the test. Saying where each piece landed proves nothing about whether it is needed. Deleting pieces on paper is what tells you the design is finished.

- The celebrity list cache
  - Remove it and every reader of every celebrity post reads the store directly. It stays.
- The event log before fan-out
  - Remove it and the write waits for the whole fan-out before returning. It stays.
- The follower count cache
  - Remove it and every display of a profile counts rows. Keep it for display, and read `B` fresh.

---

<!-- _class: code -->

`The artifact`

## This is the whole method, and it fits on one page.

```text
Protagonist   ______________________  wants to ______________  so that ________
Antagonist    But ________________  —  and it is this big: ____________________

Purpose       ______________________________________________________________
Boundary      In: _________________________  Out: _________________________
Environment   ______________________________________________________________
Constraints   physical ______  economic ______  human ______  legal ______
Invariants    1 ____________________  2 ____________________  3 ____________
Bottleneck    ______________________________  measured at ____________________
Solution type MVP  ·  scaled  ·  optimized  ·  optimal  ·  specialized
```

---

<!-- _class: checklist -->

`The review`

## Run these six on any design, starting with your own.

- [ ] Who is the protagonist, and who are we not designing for? `casting`
- [ ] What is the antagonist, and what number describes it? `evidence`
- [ ] Which rung of the ladder is this, and does everyone agree? `frame`
- [ ] What breaks first at ten times the load? `scale`
- [ ] What happens when each dependency is slow rather than down? `failure`
- [ ] What can one stolen credential reach? `security`

---

<!-- _class: content -->

`Your turn`

## Run the six review questions on the parking app, from memory.

You have both designs and the six questions. Take the smaller one: a driver, a sticker, one table, a card form.

Answer four of the six without turning back. Then turn the page.

---

<!-- _class: list-tabular -->

`One answer`

## Four of the six, on a system you could build this month.

1. The protagonist
   - A driver in the rain, one hand, thirty seconds. Not the lot owner, and not the warden.
2. The antagonist
   - A weak signal underground, and a second tap on Pay. The number is one park charged twice.
3. Ten times the load
   - Nothing. Traffic was never the constraint; the manual warden was, and rung two fixed him.
4. One stolen credential
   - The webhook signing secret. With it a stranger marks any bay paid, which is why that endpoint checks a signature.

---

<!-- _class: content -->

`Develop and deliver`

## The two movements this deck skipped are the only real check on the two it taught.

Design is where the thinking lives, which is why the deck stops here. Building is where you find out whether the thinking held: the boundary you drew turns out to cut through another team, the invariant you wrote needs a lock nobody planned for, the number you estimated is wrong by ten.

So take one design you made in these pages and build the smallest version of it that actually runs. Not to ship it. To find out which of your nine fields was a guess.

---

<!-- _class: list-tabular -->

`Back to Tuesday`

## 482 was not blocked by the build. It was blocked by a queue.

1. The queue had one server
   - Five pull requests, one reviewer, one waking hour: a bounded pool of one. Throughput is capped, so the queue in front grows, and nothing Maya did after lunch could move any of the three.
2. Nothing inherited a deadline
   - The window shut at four, and nothing downstream of it carried a shorter one. The network kit's first invariant says a call inherits its deadline from the caller, and inherits a shorter one. The review never got one, so nothing said it was late until it was.
3. The one move she had, she made late
   - At 15:50 she stopped answering and batched the replies — admission control, from the scale kit. The spiral had run since 15:30, and those twenty minutes came out of the one hour that decided the day.

---

<!-- _class: list-steps -->

`What to do on Monday`

## The last of these four is the one that teaches you.

1. Pick the unglamorous system
   - Not a famous one. The service you were debugging on Thursday, or the pipeline nobody wants to own.
2. Cast it before you draw it
   - Protagonist and antagonist first, one sentence each. If you cannot name them, you do not understand it yet.
3. Fill the other seven fields
   - Let them argue with you. A field you cannot answer is the design question you have been avoiding.
4. Bring the page to your one-on-one
   - Ask the person across from you which field you got wrong. That conversation is the whole point of learning this.

---

<!-- _class: closing silent spectrum -->

## Learn the concepts and how they connect. The technology will change under you.

`How to Think About Systems`

Name the person, name the force, and the design follows. Maya never designed anything on Tuesday, and she met every word in Part one before she went to bed.
