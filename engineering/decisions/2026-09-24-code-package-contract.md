---
status: proposed
summary: How a shared transform (a code package's `transform.js`) runs — the proposal phase 6 of portable packages starts from. Recommends shipping the chart helpers INTO the sandbox as a versioned, frozen toolkit rather than calling back to the host, and running the CLI's sandbox in a Chromium page under a no-network content-security policy instead of a Node child process, because Node's `--permission` cannot block the network and a page's CSP can. Three decisions for the owner.
---

# Code packages: the transform contract and its toolkit

> **Proposed — nothing here is built.** This is the design pass that
> `2026-09-23-portable-packages.md` §3.5 says must come before any code, because the
> toolkit it describes is a published API. Three decisions in §6 are the owner's.
> Until they are made, every door keeps refusing a package that carries a
> script file, and the refusal names the package.

## 1. The question

The owner chose to let portable packages carry JavaScript behind a trust prompt
(portable packages §9 Q4), so that a chart someone else built can be shared. §3.5 of
that note designed the trust half — consent pinned to the code's SHA-256, output
through `sanitizeSlideHtml`, and a sandbox per surface — and then measured the
contract it proposed ("the slide's data in, an HTML string out") against the 28
shipped transforms. **It fits none of them.** Every shipped transform imports engine
helpers, and three need a live page.

So the question this note answers is: **what does a sandboxed transform get to call,
and where does it run?**

## 2. What the shipped transforms need (measured 2026-09-24)

Re-derived with a `require` scan of `lib/components/*/*/*.transform.js`, `_`-prefixed
folders excluded: 28 transforms, requiring 31 distinct modules between them (about 27
engine helpers; the rest are map basemap data and the shared QR-card module). The top of
the list, by how many transforms import each:

| Helper | Transforms | Source size | Its own requires |
|---|---|---|---|
| `transform-utils` | 21 | 9.3 KB | 2 |
| `cartesian` | 15 | 60.6 KB | 6 |
| `mark-detail` | 15 | 4.2 KB | 1 |
| `svg-label` | 13 | 65.0 KB | 1 |
| `html-lists` | 11 | 4.3 KB | 0 |
| `svg-legend` | 10 | 26.5 KB | 1 |
| `coda` | 6 | 24.6 KB | 3 |
| `section-walk` | 6 | 8.6 KB | 1 |

The long tail (`render-ids`, `label-set`, `bracket-list`, the generated axis catalog…)
is imported by four transforms or fewer. Three transforms need a page, not a string:
`state-chart` measures its own layout (`getBoundingClientRect`, `measureText`), and `scene`
and `team-profile` walk the rendered slide at run time (§3.5 of the packages note has the
lines). Only `state-chart` needs it to produce its markup; the other two need it in a
runtime half, which §5 leaves out of v1.

Two facts follow. The helpers are **pure** — strings and numbers in, strings out — and
text measurement is the one thing a transform needs that they don't provide. And they are
**large and still changing**: `cartesian`
and `svg-label` together are 126 KB of source that ships in every release.

## 3. Where the helpers live: three shapes

**A. The toolkit ships INTO the sandbox.** The pure helpers are bundled once, as a
frozen, versioned file (`lattice-toolkit-v1.js`), and loaded inside the sandbox next to
the user's transform. The transform calls them as ordinary functions. The host exposes
nothing callable; the only channel is one message in (the slide's data) and one message
out (an HTML string).
- **Buys:** the smallest attack surface there is — the sandbox can't ask the host for
  anything — and no round-trips, so a chart with 400 labels costs what it costs today.
- **Costs:** the toolkit is a second build artifact per major version, and a bug fixed in
  `cartesian` reaches user transforms only when they move to the next toolkit version.
  That is also its virtue: a user transform written against v1 keeps rendering the same
  after we refactor the helpers.

**B. The helpers stay on the host, called over RPC.** The sandbox gets a proxy object,
and each call is a `postMessage` round-trip.
- **Buys:** one copy of the helpers; fixes reach everyone.
- **Costs:** every helper argument becomes attacker-controlled input to host code, so the
  whole helper surface becomes a security boundary to audit; and the calls go async, so
  every shipped helper would need an async twin. `svg-label` alone places labels in
  loops that would become hundreds of round-trips per chart.

**C. No toolkit: data in, HTML out.** What §3.5 first wrote down.
- **Buys:** nothing to version.
- **Costs:** measured above, it fits 0 of the 28 transforms. A user could still write a
  transform from scratch, but not one like ours.

**Recommendation: A.** It is the only shape whose security surface doesn't grow with the
toolkit, and freezing a version is what a published API needs anyway.

> **Superseded (owner, 2026-09-25): per-package bundling, §8.** A, B and C all assumed one
> shared set of helpers. The owner's test was what we let people export: a sandbox that lacks
> a helper one of our own components uses breaks that component the moment it is exported.

## 4. Where the sandbox runs

§3.5 designed a sandboxed iframe for the Studio and a Node child process under
`--permission` for the CLI, and measured that **Node 22's permission model does not block
the network**: `fetch` succeeded under it. So in the CLI, a trusted transform could read
the deck and send it anywhere, and the consent prompt was the only boundary.

There is a better option the CLI already carries: **Chromium.** The PDF export already
launches it through puppeteer. A transform run in its own page — an
isolated browser context, loaded from a `data:` or `about:blank` document under
`Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'` — would have no
network, no filesystem and no access to the deck beyond the data it is handed. That is
the containment designed for the Studio's sandboxed iframe (itself not yet verified), on
the same engine, so the two surfaces would stop differing in what a consent risks. It also answers text
measurement: a page lays out text, so `state-chart`'s `getBoundingClientRect` works in
both places, where a Node process has nothing to measure with.

- **Costs:** a page per render adds start-up time, bounded by reusing one page for every
  slide of every code package in a render. Every output format already launches the
  browser (`renderExport` in `lattice-emulator.js` runs for all of them, `.html`
  included), so no output gains a browser it didn't have.
- **Unverified:** that a CSP delivered this way blocks every fetch a hostile transform can
  make (image, `fetch`, WebSocket, prefetch, a `<meta>` refresh) in the headless build we
  ship. This is the first thing phase 6 proves, with a network log, before anything else
  is built on it (HARD RULE #23).

**Recommendation: a Chromium page in the CLI, the sandboxed iframe in the Studio.**

## 5. The contract, v1

A code package's manifest declares `"toolkit": 1`. Its `transform.js` is an ES module
that exports one function (shipped transforms are CommonJS; a sandboxed one loads as a
module script, so the new contract takes the standard form):

```js
export default function transform(slide, kit) → string
```

- `slide` is plain data, structured-clone safe: the slide's rendered HTML and markdown,
  its top-level list items as HTML strings (what `html-lists` produces today), its class
  tokens, its directives, and the
  palette's token NAMES (never values — the transform emits `var(--token)`, HARD RULE #3).
- `kit` is the frozen toolkit of that major version, plus `kit.measure(text, font)` in
  both surfaces.
- The return is an HTML string. It goes through `sanitizeSlideHtml` on the host before it
  reaches the slide, so a transform can't produce anything an author couldn't type
  (§3.5 point 3). A throw, a non-string, or a run past the time limit (proposed: 2 s per
  slide) renders the slide's plain markdown with a visible note, never a blank.
- The runtime halves (`scene`, `team-profile`'s live walk) are **out of v1**: they run on
  the viewer's page, after export, where a sandbox boundary is a different design.

## 6. Decisions for the owner

1. **Toolkit shape: A (ship it into the sandbox), B (RPC) or C (none).** Recommended: A.
2. **CLI containment: a Chromium page under a no-network CSP, or §3.5's Node child
   process with consent as the only network boundary.** Recommended: the Chromium page,
   because it is the only CLI option that contains the network at all.
3. **Toolkit v1's membership.** Recommended: the eight modules in §2's table plus their
   own requires, and `measure`. The long tail joins in v2 when a real package needs it,
   so v1 publishes only what 28 shipped transforms prove is needed.

**Decided (owner, 2026-09-25).** (2) the Chromium page, as recommended. (1) and (3) are
replaced by one answer: no shared toolkit; every package is self-contained (§8).

## 7. What happens next

The three are decided (§6, §8). Phase 6 starts with the unverified claim in §4 (a network log
from a hostile transform in the CLI's page and in the Studio's iframe, on the real
surfaces), then the toolkit build, then consent and the doors. It gets the full
adversarial trio on what ships (HARD RULE #25). The follow-up that tracks it is
`followups.d/2314-p4-code-packages.md`.

## 8. Decided: self-contained packages, bundled at export (owner, 2026-09-25)

**What.** Exporting a code package bundles, minifies and freezes exactly the helpers its
transform imports into the package itself. There is no shared toolkit and no version of one.
The person exporting is not asked: the export always does this. The sandbox provides one
thing, `measure(text, font)`, because text measurement needs a page and the sandbox is one.

**Why.** Three properties no shared toolkit gives together: export of any component we ship
always works (the package brings what it needs); the receiver needs nothing but a Lattice
that runs code packages; and we promise nothing about our internal helpers, which stay free
to change. A shared toolkit would make every helper in it a permanent API and a review
surface, and an exporter cannot know which toolkit version the receiver runs.

**What it costs, measured** (esbuild bundle + minify of each shipped `*.transform.js` with
its own require closure, 2026-09-25): 15–18 KB gzip for a typical chart, 22–23 KB for the
heaviest ordinary charts, 74 KB for `map` (its basemap data), ~2 KB for simple components.
Copies are duplicated across packages, and a later fix to a helper never reaches a package
already exported (a frozen toolkit has the same property). Removing duplicate helpers when
several packages are exported together is a possible later optimization, still automatic.

**The contract changes from §5.** `transform(slide, kit)` stays, but `kit` is only
`{ measure }`; helpers are ordinary imports the export bundles. A stranger writes a package
the same way: import from Lattice's helpers, and the export freezes them in.

**Open inside this decision.** `contact`, `wifi` and `video` do not bundle for a neutral
platform today: their shared QR-card module pulls Node built-ins. The build step has to
bundle a browser-safe path for them or exclude them from code-package export with the reason
stated. Tracked in `followups.d/2314-p4-code-packages.md`.
