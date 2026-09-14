---
status: shipped
summary: >
  `esm.run` is not a neighboring CDN the no-CDN gate forgot — it is a 301 to
  `cdn.jsdelivr.net`, the FIRST host that gate bars. So the 2026-09-03 sweep barred jsdelivr
  by one hostname while three runtime imports kept reaching the same origin through its
  alias, and the plugin-architecture note was right to flag it as unresolved. It is a GAP,
  not a carve-out: nothing in the sweep names the Studio AI tier at all. Settled the honest
  way rather than the tidy one — the host is now barred and the three loads carry a PER-URL
  sanction with its reasoning, so a fourth package goes red even inside an already-sanctioned
  file, and a sanction that outlives its call site goes red too. Self-hosting is NOT taken
  here and the reasons are measured: it reverses a recorded decision, it cannot be verified
  from a headless sandbox (HARD RULE #23), and it would leave the hundreds of megabytes of
  model WEIGHTS on a third-party CDN regardless. What is accepted is written down: all three
  can execute in the top-level document holding the user's OpenRouter key, all three are
  unpinned, none carries `integrity`.
last-updated: 2026-09-13
companion:
  - ../../test/unit/docs/no-cdn-runtime.test.js
  - ./2026-09-03-self-hosted-runtime-deps.md
  - ./2026-06-08-drawing-board-phase-2-build.md
  - ./2026-09-13-plugin-architecture.md
---

# `esm.run` and the Studio AI tier — a gap, named and bounded

**Date:** 2026-09-13
**Answers** the open question left by
[`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) § Open questions:
*"`esm.run` is a live precedent for loading foreign code at run time … whether that is a
sanctioned carve-out or a gap the 2026-09-03 sweep missed should be settled before any
plugin proposal is measured against it."*

## The question

`test/unit/docs/no-cdn-runtime.test.js` bars seven CDN hosts from `docs/src`. Three runtime
dynamic imports reach `https://esm.run/…`, and `esm.run` was not on the list. Deliberate, or
missed?

## The finding that settles it

**`esm.run` is `cdn.jsdelivr.net`.** Measured 2026-09-13:

```
$ curl -sSI https://esm.run/kokoro-js
HTTP/2 301
location: https://cdn.jsdelivr.net/npm/kokoro-js/+esm
access-control-allow-origin: *
```

`cdn.jsdelivr.net` is the **first** entry in `BARRED_HOSTS`. So this is not a question of
whether some other CDN deserves the same treatment — the gate already bars this operator,
and the AI tier reaches it through a second hostname the gate never learned.

**It is a gap, not a carve-out.** `2026-09-03-self-hosted-runtime-deps.md` mentions neither
`esm.run` nor web-llm, transformers or kokoro; its own § "What the built site still contains,
and why each is fine" audits three residual classes and the AI tier is not among them. Nothing
granted these an exception, because nothing looked at them.

**The loads themselves are a recorded decision, though**, and that is the part that keeps this
from being a one-line fix. `2026-06-08-drawing-board-phase-2-build.md` § "no new npm deps —
heavy backends load from CDN on demand" chose lazy CDN import over bundling on stated grounds,
and left an escape hatch: *"If a future maintainer wants the weights self-hosted or bundled …
swap the CDN URL constants in `architect-model.js` for a bundled `import()` and add the deps
then."*

So two shipped decisions disagree, and neither is wrong on its own terms. What was missing is
anywhere that says so.

## What is accepted, said plainly

Writing this down is the point of the change, because the next reader should not have to
re-derive it:

| | |
|---|---|
| **What executes** | `@mlc-ai/web-llm`, `@huggingface/transformers` (both `architect-model.js`), `kokoro-js` (`voice-model.js`) |
| **Where** | All three can run in the **top-level document** that holds the user's OpenRouter key in `localStorage` |
| **Pinning** | None. `esm.run/<pkg>` with no version resolves to whatever jsdelivr serves that day |
| **Integrity** | None. A dynamic ESM `import()` cannot carry an `integrity` attribute |

The Kokoro rung deserves its own line because the tree looks safer than it is. It **prefers** a
same-origin module worker (`kokoro-worker.js`), which cannot read `localStorage` — and the
worker's origin is load-bearing for a different reason, since iOS Safari refuses a cross-origin
import from the opaque origin of a `blob:` worker. But `loadMain()`
(`docs/src/playground/voice-model.js:555`) imports kokoro-js **on the main thread** when the
Worker cannot be constructed, or when its load fails on a non-coarse pointer. What the worker
path spares is mobile memory, not the key. An earlier draft of this note and of the gate's
comment said the opposite; the fallback is thirty lines below the constant and reading only the
constant is how you miss it.

**This is the same shape as the defect 2026-09-03 deleted** — a floating major, no `integrity`,
executing on the key-bearing origin. The difference is consent and reach, not kind: `mermaid@11`
ran on the landing page for every visitor, while these run only after a user opts into the AI
tier. That is a real reduction and not a clean bill.

## Why self-hosting is not taken here

Three reasons, in the order that decided it:

1. **It cannot be verified from here.** WebGPU and WASM inference need a real device. That is
   HARD RULE #23, and it is the *same* reason the 2026-06-08 note gave for not bundling them in
   the first place: *"these are precisely the parts that cannot run in CI/sandbox."* Swapping a
   loader for a runtime tier this sandbox cannot exercise would ship an unverified change to the
   one surface nobody can check.
2. **It buys less than it looks like.** Self-hosting the three *libraries* leaves the *weights*
   — Qwen2.5-0.5B (~350 MB), Kokoro-82M (~80 MB), bge-small — fetched from HuggingFace's CDN at
   run time regardless. The origin count goes from two third parties to one, not to zero.
3. **It reverses a recorded decision**, so it belongs in a change that re-argues 2026-06-08 on
   its own merits with the npm-dependency and route-budget cost measured — not as a side effect
   of tightening a test.

None of the three is an argument that the current state is *good*. They are why the honest move
is to make the gate see the host and write the residue down.

## What shipped

In `test/unit/docs/no-cdn-runtime.test.js`:

- **`esm.run` joins `BARRED_HOSTS`**, so the gate can see it at all.
- **`SANCTIONED_CDN_IMPORTS`** admits exactly three URLs, each with its justification. The
  sanction is keyed **per URL, not per file** — a file-scoped exemption would let a fourth
  package appear inside an already-exempt file and ship green, which is the failure mode
  HARD RULE #22's per-sink census exists to prevent one level over.
- **A bare hostname with no path is prose** for a host that carries a sanction (the comments
  explaining this carve-out are exactly that, and a hostname alone loads nothing). For a host
  with nothing sanctioned it stays a hit, which is the original strict reading and is what
  catches a URL assembled from pieces.
- **A staleness arm** fails when a sanctioned URL is no longer loaded by `docs/src`. It is what
  turns the allowlist back into a bar on the day the AI tier is self-hosted, rather than leaving
  a dead exception reading as permission.

**Mutation-proved** — a green gate that cannot fail certifies rather than checks. Four
mutations, each red for its own reason, baseline green after each is reverted:

| Mutation | Result |
|---|---|
| A fourth `esm.run/evil-pkg` added to the already-sanctioned `voice-model.js` | 1 fail |
| `cdn.jsdelivr.net/npm/mermaid@11/+esm` reintroduced (the original bar still bites) | 1 fail |
| A bare `unpkg.com` mention — prose must not be a loophole for an unsanctioned host | 1 fail |
| A barred host reintroduced WITH a path (`fonts.googleapis.com/css2?family=X`) | 1 fail |
| One sanctioned key renamed so it matches nothing (stale entry) | 2 fail |

**There is no regex in the gate, and CodeQL is why.** Two bugs, in order.

The first was mine and visible: the extractor was written inside a template literal, so its `\s`
collapsed to the letter `s`, the character class excluded `s`, and `@huggingface/transformers`
truncated to `@huggingface/tran`. It matched no sanction and the gate went red for the wrong
reason — which is the only thing that made it a five-minute bug instead of a shipped one.

The second CodeQL found, and it condemned the whole approach rather than the bug on top of it.
Six high-severity alerts on this one file: five `js/incomplete-hostname-regexp` on the
`BARRED_HOSTS` literals flowing into a constructed `RegExp`, and one `js/incomplete-sanitization`
on `host.replace(/\./g, '\\.')` — which escapes the dot and not the backslash. That is the
**exact** partial-escape defect CodeQL caught in this repo three weeks earlier, in the test file
of the change this note continues. Twice in one month is not a coincidence; it says that
interpolating a hostname into a regex is the thing to delete, not the escaping bug on top of it.

So the gate scans strings. It finds `host + '/'` with `indexOf` and reads forward to a delimiter:
no escaping, nothing a metacharacter in a host can defeat, and it says what it means. Proven
behavior-preserving rather than assumed — run over the real `docs/src`, **198,226 lines, 4 URL
hits, zero disagreements** with the regex it replaces. All five mutation arms still go red.

Worth recording HOW the alerts were read, because the previous round got this wrong: off the
**annotations**, naming file and line — not guessed from the query list. A guess would have fixed
the escape and left five alerts standing.

## Follow-up, in the order it should be taken

1. **Pin the three versions.** The cheapest real reduction: `esm.run/kokoro-js@1.2.3` removes
   "whatever they served today" without touching the architecture. Not done here because a
   pinned version is an API claim about a library this sandbox cannot exercise — picking one
   blind risks breaking the tier, which is worse than the risk it closes.
2. **Then self-host**, if 2026-06-08 is re-argued and won. It needs the npm dependencies, a
   route-budget measurement, and an on-device confirmation this environment cannot give.
3. Neither is a plugin-architecture blocker. What the plugin note needed was an answer to
   "is this a precedent?", and the answer is **no** — it is an unreconciled gap, now bounded.
   A plugin proposal that cites `esm.run` as prior art for run-time foreign code should cite
   this note instead.

## References

- [`2026-09-03-self-hosted-runtime-deps.md`](2026-09-03-self-hosted-runtime-deps.md) — the sweep, and the `mermaid@11` default it deleted.
- [`2026-06-08-drawing-board-phase-2-build.md`](2026-06-08-drawing-board-phase-2-build.md) § "no new npm deps" — why the AI tier loads from a CDN, and the escape hatch.
- [`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) § Open questions — where this was flagged.
- [`2026-06-14-read-aloud-kokoro.md`](2026-06-14-read-aloud-kokoro.md) — the voice ladder the Kokoro rung sits in.
