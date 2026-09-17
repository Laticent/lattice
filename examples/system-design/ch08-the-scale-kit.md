---
marp: true
size: 4K
theme: indaco
paginate: true
profile: teaching
glossary: auto
header: "System design · Chapter 8"
---

<!-- _class: title silent spectrum -->

# The Scale Kit

`Chapter 8 of 13 · Part four`

Every scaling change is one of four moves. Little’s law sizes the pool before anyone has to guess.

---

<!-- _class: agenda progress-5 -->

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

## The cache and the replica return here as moves, not stores.

Chapter five introduced the cache and the replica as places data lives. Here they are things you do when load grows. Four moves cover every scaling change: reduce, duplicate, defer, spread. This chapter assumes the data kit’s copies and the network kit’s latency budget, and it ends on the arithmetic that sizes a pool.

---

<!-- _class: divider -->

`Scale`

## Every scaling change is one of four moves: reduce, duplicate, defer, spread.

---

<!-- _class: diagram compact -->

`Scale kit · adding a copy`

## Reduce and duplicate both add a copy of something you already had.

```mermaid
flowchart TB
  subgraph b["Duplicate · costs you a stale reader"]
    direction LR
    B1(["Writes"]) --> B2[("Leader")] --> B3[("Replica, US")]
    B2 --> B4[("Replica, EU")]
  end
  subgraph a["Reduce · costs you a copy to invalidate"]
    direction LR
    A1(["Request"]) --> A2[("Cache hit")] --> A3(["No work done"])
  end
```

> Both bills arrive in the same currency: something you are reading is now out of date.

*You met both of these as stores — the cache was a data choice, the replica a consistency choice. Here they are again as moves. Distance is why: the only way to spend less of it is to keep a copy nearer.*

---

<!-- _class: diagram compact -->

`Scale kit · moving the work`

## Defer and spread move the work instead — to later, or somewhere else.

```mermaid
flowchart TB
  subgraph d["Spread · costs you the queries that cross"]
    direction LR
    D1(["Request"]) --> D2(["Router, by key"]) --> D3[("Shard A")]
    D2 --> D4[("Shard B")]
  end
  subgraph c["Defer · costs you an answer that is not ready"]
    direction LR
    C1(["Accept"]) --> C2[["Bounded queue"]] --> C3(["Worker"])
  end
```

> Both bills arrive as an answer you cannot have right now: not yet, or not from here.

---

<!-- _class: math -->

`Scale kit · the one formula`

## Little's law ties concurrency, throughput and latency together.

$$ L = \lambda W $$

- $L$ — requests in flight at once
- $\lambda$ — arrivals per second
- $W$ — seconds each one spends inside

---

<!-- _class: content -->

`Using it`

## Multiply arrivals by seconds inside to get requests in flight.

Your service takes 2,000 requests a second, and each one spends 50 milliseconds inside. Convert first — 50 milliseconds is 0.05 seconds — then multiply: 2,000 × 0.05 = 100.

A hundred requests sit inside your service at every instant. If your server hands each request a thread while it runs, that is 100 threads. It is a floor, not a preference: while those two numbers hold, no setting makes it 80.

---

<!-- _class: content -->

`Using it · the other reading`

## An idle machine can still be the thing everyone waits for.

Maya's build fleet ran two builds a day at twelve minutes each, so it sat idle almost all day. That tells you it has spare capacity. It tells you nothing else.

Her reviewer was the bottleneck: one person, five pull requests taken in order, awake for one of the hours that mattered. The critical path is the chain of steps that decides when the work finishes. Idle time never tells you whether something sits on it.

---

<!-- _class: content -->

`When it goes wrong`

## Tripled latency breaks a bounded pool and an unbounded one in opposite directions.

Latency triples to 150 milliseconds. Leave the pool unbounded and the arithmetic runs forward: 2,000 × 0.15 is 300 in flight where you sized for 100. Each one holds a thread, a buffer and a connection, so the machine runs out of memory.

Bound it at 100 and concurrency cannot rise, so throughput falls instead: 100 ÷ 0.15 is about 667 a second against the 2,000 still arriving. The queue in front grows until something sheds it.

Neither is a tuning problem.

---

<!-- _class: content -->

`Scale kit · tail latency`

## Your average request is a fiction. Your users live in the tail.

The tail is the slow end of your response times: the few requests that take far longer than the middle.

A page that makes 100 parallel calls waits for the slowest one. Give each call a one-percent chance of being slow, and 63 percent of pages hit at least one. That is `1 - 0.99^100`.

More parallel calls turn a rare slow response into a common slow page.

---

<!-- _class: split-panel proof cat-3 -->
<!-- _header: "" -->

`Scale kit · working the tail`

## Measure the tail per dependency, and buy it back on a budget.

- Read the number right
  - Your p99 is the time 99 percent of requests come in under. A person makes dozens a day, so far more than one percent of people meet it.
- Hedging buys it back
  - Waited longer than 95 percent normally take? Send a duplicate, take the first answer.
- Budget the hedge
  - Cap it at a few percent of traffic, or it floods you when you are already slow.

---

<!-- _class: cards-grid four -->

`Scale kit · caching`

## Each caching pattern owns a different failure.

- Cache-aside
  - The app fills the cache on a miss. A cold key means every reader misses and rebuilds at once.
- Read-through
  - The cache fetches for you. Cleaner code, and now the cache sits on the critical path.
- Write-through
  - Write both together. Always fresh, and every write pays the cache's latency.
- Write-behind
  - Write the cache, flush later. Fastest writes, and a crash loses them.

> Choose by which failure you can survive, not by which pattern reads best in code.

---

<!-- _class: split-panel proof cat-4 -->
<!-- _header: "" -->

`Scale kit · idempotency`

## Idempotency is what makes a retry safe, and retries are not optional.

An idempotent call runs twice and leaves the same result as running once. Networks duplicate, clients retry, queues redeliver. The only question is whether the second delivery is harmless or charges somebody twice.

- The rule
  - Every mutating endpoint takes a client-supplied key and deduplicates on it.
- The key comes from the caller
  - Generated before the first attempt, reused on every retry of that same intent.
- Store the result, not the fact
  - A repeat returns the original answer, not an error saying it already happened.

---

<!-- _class: list-criteria -->

`Scale kit · the invariants`

## All four must be true before you call any of this scalable.

1. The bottleneck is named and measured
   - Not suspected. A number, a graph, and the resource it belongs to.
2. Every queue is bounded
   - An unbounded queue turns a throughput problem into a memory outage.
3. Admission control sheds load on purpose
   - Refuse some at the door so the rest succeed — Maya's move at 15:50.
4. Adding a machine is routine
   - No manual steps, no rebalancing outage, no cold-cache stampede.

---

<!-- _class: content -->

`Your turn`

## Your service takes 1,200 requests a second at 40 milliseconds each. Size it.

First: how many requests are in flight at once? Then a dependency slows and each request now spends 160 milliseconds inside, while the same 1,200 keep arriving.

Second: say what happens with an unbounded pool, and what happens with the pool your first answer sized. Do the arithmetic before you turn the page.

---

<!-- _class: list-tabular -->

`One answer`

## One number, then two failures that look nothing alike.

1. In flight at once
   - `1,200 × 0.04` is 48 — a floor on a good day, not your setting.
2. Unbounded
   - `1,200 × 0.16` is 192 in flight. The machine you sized for 48 runs out of memory, and nothing warned you on the way.
3. Bounded at 48
   - Throughput falls to `48 / 0.16`, about 300 a second against 1,200 arriving. Nine hundred a second pile up.

---

<!-- _class: closing silent spectrum -->

## Scale asks what happens when there is more.

`Chapter 8 of 13 · How to Think About Systems`

Chapter nine asks what happens when one part of it stops. That is the whole difference between the two kits, and it is why admission control shows up in both of them.
