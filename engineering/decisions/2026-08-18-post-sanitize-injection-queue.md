---
status: shipped
summary: >
  Three carried-over items from the HARD RULE #22 work. (1) #1458's theme-zip → preview
  `<style>` path is genuinely closed: driven end to end through the real Studio Library with
  a hostile `.lattice-theme.zip`, the imported CSS reaches the frame carrying the ESCAPED
  terminator and no live one, and removing the guard turns the spec red. Closed. (2) The
  CSSOM twin §9.8 logged is now guarded: the Playground snapshot's `css` is produced by
  `rule.cssText`, which normalizes `<\/style` back into a live terminator, and it crosses
  localStorage into the TOP docs document — inert today only because the replay sinks it with
  `textContent =`. Guarded at both captures and the storage boundary, with mutants killed.
  (3) #1246 was RE-DERIVED rather than implemented, and the card is stale in three separate
  ways. Its `click`/`javascript:` vector is closed by `securityLevel: 'strict'` — proven by
  rebuilding the runtime with the key flipped to `loose` and watching the arm go red. Its
  zero-click `<img>` beacon is LIVE but is not a Mermaid escalation: a plain markdown image
  fires the identical request through fully-sanitized slide HTML, so it is the product's
  stated resource-load posture, not a hole in diagrams. Its proposed fix-direction (2),
  re-sanitizing the SVG, is refused with numbers: DOMPurify deletes `<foreignObject>` and
  `<style>`, i.e. every node label and all diagram styling. And the containment is TWO
  mechanisms, not the one everyone assumed — Mermaid sanitizes labels unconditionally, and
  `securityLevel` governs only URL handling and click callbacks. What ships is the durable
  half the card asked for and nobody built: `checkRuntimeMarkupSinks`, a provenance census of
  every markup sink in `lib/runtime`, plus 11 behavioral arms on the real Playground.
---

# The post-sanitize injection queue, and what measuring it refuted

Three items left over from #1718/#1731, worked as one branch because they are one class:
**untrusted content reaching a live preview frame at a point the existing guards do not
cover.** Two turned out to be already-closed and needed proof rather than code; the third
turned out to be materially different from what its card said.

The recurring lesson from #1718/#1731 was that this change class keeps **fixing one twin and
declaring the class closed.** That happened again here, twice, in the *investigation* rather
than the fix — both times caught by a measurement, both recorded below.

---

## 1. #1458 — verified on the real surface, then closed

`Library.tsx` → `unpackBundle` takes theme CSS **verbatim** out of an imported zip →
`saveStudioTheme` → StudioShell's `extraTheme` → `single-slide-render.ts` → the preview
document's `<style>`. That is the one path in #22's threat model whose input is an
**attacker-supplied file** rather than something the author typed.

The guard (`sanitizeStyleText` at the sink) landed in #1718. #1458 stayed open because that
is a claim about a running surface, and its acceptance is behavioral. So it was driven:
a `.lattice-theme.zip` whose CSS carries
`</style><link rel="stylesheet" href="https://attacker.invalid/x.css">`, imported through the
real Library UI, pinned through the real Inspector theme picker, inspected in the real
preview frame.

| | measured |
|---|---|
| imported CSS reaches the preview `<style>` | **yes** — its selectors and its `#c2410c` accent are in `style#lattice-theme` |
| live `</style` anywhere in the frame's stylesheets | **none** |
| escaped `<\/style` present | **yes** — so the payload traveled the whole path AND the guard ran on it |
| stray `<link>` / `<img>` in the frame | **0** |
| outbound requests to the attacker host | **0** |

Mutation-killed: deleting the `sanitizeStyleText` call in `single-slide-render.ts`, rebuilding
the docs site, and re-running turns the spec red (`no escaped terminator anywhere`).

**Channel 2** of the card — `lib/theme/serialize.js` interpolating `description`/`label` into
a `/* … */` header — is guarded by `commentSafe` and covered by 30 unit tests including the
per-field #1709 arms. That file's own docblock is already explicit that it does **not** make
the sheet safe for a `<style>` element, and points at the frame guard for that. Both channels
hold, so #1458 is closed.

### What the spec pins, and what it does not

Stated because the boundary is narrower than the spec's name suggests, and finding it was the
first "one twin" moment of this branch.

Pinning a theme on an **already-open** preview takes the RESTYLE fast path, which swaps the
resident sheet with `.textContent =` — a DOM write that **cannot be broken out of** whatever
the string contains. Only the **initial srcdoc build** parses the stylesheet as HTML. So the
committed spec asserts *that the guard ran* (the escaped form is present), not *that a
breakout was survived*: with the guard removed on that path, stray nodes are still **0**.

The srcdoc build path was measured by hand instead — with a hostile theme active at frame
build, `style#lattice-theme` carries the escaped terminator and no live one; with the guard
removed, the escape is gone and a live `</style>` appears in the element. Driving that state
from a cold reload was not reliable in the harness (the pinned theme is not re-applied
deterministically), and a flaky nightly spec costs more than it pays (#1526), so it is
recorded here rather than committed half-working.

---

## 2. The CSSOM twin — §9.8's logged item, now guarded

`docs/src/playground/snapshot-cache.js` serializes the live CSSOM (`rule.cssText`) into a
snapshot that crosses `localStorage` and is replayed into the **TOP** docs document — the
origin HARD RULE #24 puts the visitor's OpenRouter key in.

A CSS **serializer** normalizes the escape away. That is not a css-tree quirk; the browser's
own CSSOM does the same thing:

```
input           .x::after{content:"<\/style><img src=x>"}
rule.cssText →  .x::after { content: "</style><img src=x>"; }
```

So an escape applied wherever the preview document was assembled **does not survive** this
round trip, and the guard is owed at the re-serialization. It is inert today for exactly one
reason: the replay sinks the css with `textContent =` while the html beside it goes in with
`innerHTML =`. Safety by the choice of one line.

`sanitizeStyleText` now runs at **both captures and the storage boundary**, mirroring the
html channel's own three call sites in the same file. `sanitizeStyleText` returns its input by
identity for every real stylesheet, so no snapshot's bytes move.

Both mutants killed independently, in a `git worktree` rather than the live tree: removing the
capture calls fails only the capture arm (which asserts the RETURNED value, so the storage
boundary cannot stand in for it); removing the storage call fails only the storage arm.

The census grew `docs/src/playground` as a root, which also pulled in **`deck-preview.js`** —
a genuine preview builder with **two** style sinks, i.e. the exact shape the file-scoped gate
cannot pin, since either call could go and it would still certify. `*.generated.js` is
excluded: bundler output tracks a build step, not a decision.

---

## 3. #1246 — re-derived, and stale in three separate ways

The card asserts a live one-click key-theft path. Two triage passes had already corrected it
once each, and each inherited the previous one's framing. It was re-derived from scratch
against the real Playground with the real Mermaid 11.14 from its real CDN.

### 3.1 What is actually true

**Vector 1 (`click … href "javascript:…"`) is CLOSED**, by `securityLevel: 'strict'` since
#1314. Proven the only way that means anything: the runtime was rebuilt with the key flipped
to `loose`, the docs site rebuilt on top of it, and the suite re-run — the click arm goes red,
and green again on `strict`.

**Vector 2 (the zero-click `<img>` beacon) FIRES.** Three requests left the frame from an
`<img>` in a node label. The handoff's premise that `strict` implies `htmlLabels: false` is
wrong — `htmlLabels: true` is set explicitly in `engineInitConfig` and `PREVIEW_ONLY_CONFIG`
does not override it.

**But it is not a Mermaid escalation, and this is the finding that reframes the card.**
Measured on the same surface, through fully-sanitized slide HTML:

| deck content, no mermaid anywhere | outbound requests |
|---|---|
| `![pic](https://attacker.invalid/plain.png)` | **2** |
| `<div style="background-image:url('https://attacker.invalid/bg.png')">` | **1** |
| `<img src="https://attacker.invalid/raw.png">` | **2** |

Remote subresource loading is the product's **deliberate posture** —
`lib/core/sanitize-slide-html.mjs` keeps inline `style` for exactly this reason, "a resource
load, not script". Asserting that a diagram must not do what every other element on the
surface does would be a rule about diagrams, not a security boundary. Recorded on the card
rather than half-fixed; whether preview frames should load remote subresources at all is a
product question, not a Mermaid one.

### 3.2 The containment is TWO mechanisms, and everyone had it as one

This is the second "one twin" moment, and it invalidated an assumption the runtime's own
comment carried. Read Mermaid 11's `sanitizeText` / `sanitizeMore`:

- **Node labels are sanitized UNCONDITIONALLY.** `sanitizeText` always runs
  `DOMPurify.sanitize(…, { FORBID_TAGS: ['style'] })`; `securityLevel` only decides whether an
  extra `removeScript` pass runs on top.
- **`securityLevel` gates a WHOLE-SVG DOMPurify pass** in `render()` —
  `else if (!isLooseSecurityLevel) svgCode = purify.sanitize(svgCode, …)` — a second, broader
  net over everything the diagram emits, not just labels.
- **`securityLevel` also governs URL handling**: `formatUrl` runs `sanitizeUrl` unless the
  level is `loose`, and `setClickFun` refuses to bind a click callback unless it is.

Measured consequence: the nine label-payload arms stay **green with the runtime flipped to
`loose`**, because labels have belt AND braces and the per-label net does not depend on the
key. Only the click arm moves. A suite that had assumed one mechanism would have reported "we
verified `strict`" while nine of its eleven arms were pinning a third-party sanitizer nobody
had named.

**A correction to this section's own first cut**, kept rather than quietly edited because it is
the same failure this note is about: it originally said `securityLevel` governs *only* URL
handling and click callbacks. A red-team pass found the whole-SVG pass, which the source read
confirms. The measured behavior did not change; the explanation of *why* did.

**And a version correction.** The e2e suite loads the CDN URL `deck-preview.js` names,
`mermaid@11`, which resolves to the latest 11.x — **11.16.1**, not the **11.14.0** pinned in
`node_modules`. Earlier drafts of this note and the spec said "11.14" for both. The source
citations here are from the installed 11.14.0; the behavior was measured on 11.16.1. That the
two can differ at all is the argument for pinning behavior instead of a version number.

### 3.3 Fix-direction (2) is refused, with numbers

The card proposes re-running `sanitizeSlideHtml` on the post-`mermaid.render()` SVG. Measured
through the real `createSlideSanitizer`:

```
<svg><g class="node"><foreignObject><div><p>first line<br>second</p></div></foreignObject></g>
     <style>.node{fill:url(#g)}</style>…</svg>

→ <svg><g class="node"></g><image …></image><path …></path></svg>
```

`<foreignObject>` is deleted — **every htmlLabels node label, text and all** — and so is the
diagram's generated `<style>`. It closes the beacon by deleting the diagram. Across the 31
rendered SVGs of the real diagram gallery that is 27 style blocks and every label in the
catalog.

So no sanitizer is added to the runtime bundle and its size does not move. The cheaper
alternative — a targeted URL scrub — was priced too and also declined: the legitimate corpus
uses **zero** external URLs (every `url()` is a local `#fragment`; the one absolute reference
is a `data:image/png`), so a scrub would be cheap to write, but it would buy nothing the
posture in §3.1 does not already concede, and it cannot stop the one shape that fetches
**during** Mermaid's own layout (`A@{ img: "https://…" }`, measured firing before our
injection point exists).

### 3.3b The `themeCSS` channel — contained, but worth naming

A diagram *can* inject a real `<style>` element into the preview frame:
`%%{init:{'themeCSS':'…'}}%%` is honored, because `themeCSS` is not on Mermaid's `secure`
key list. That is a capability ordinary slide content does **not** have —
`sanitizeSlideHtml` forbids `<style>` and `<link>` in content outright — so it is the one
place a diagram outranks the rest of the surface.

Measured on the real Playground, it is contained by two Mermaid behaviors:

- `sanitizeCss` rejects any payload whose `}` count exceeds its `{` count, so scope-breakout
  attempts (`} h1{…} #z{`) are replaced with an error comment — confirmed absent from the
  frame's stylesheets;
- stylis wraps the CSS as `#<svgId>{ … }`, scoping every selector to the diagram's own
  dynamically-named subtree. A scoped `background:url(attacker)` did **not** fire, and
  `@import url(attacker)` did **not** fire.

So: no document-wide rule, nothing outside the diagram in scope, no read primitive. Not an
escalation today — but it rests entirely on a third-party brace-balance check, and if a future
Mermaid relaxes `sanitizeCss` or the scoping it becomes document-wide CSS injection into the
key-bearing origin. Recorded here so it is a known channel rather than a rediscovery.

### 3.3c The census was WRONG about two of its own entries — a live XSS

The most valuable thing this branch produced, and it came from an independent checker
reading the census rather than the code: `li.innerHTML` and `td.innerHTML` were declared
**"OURS — a regex capture of the slide's OWN already-sanitized text"**. That reasoning is
false, and the `td` one was a **live XSS on the real Playground**.

Both transforms read their label with `element.textContent`, which **DECODES** entities.
Markup that `sanitizeSlideHtml` had deliberately left inert as escaped TEXT — `&lt;img
src=x onerror=…&gt;` — comes back as `<img src=x onerror=…>`, and assigning that to
`innerHTML` re-parses it as live markup. The sanitizer is not at fault and cannot help: the
decode happens entirely downstream of it. That is this issue's own class, in our own code.

Reproduced end to end on the real Playground, in a deck that only has to defeat the
SERVER-side plugin so the runtime path is the one that handles the cell (a leading inline
element does it):

```
| Duty | Status |
|---|---|
| Runtime path | <span></span>[x] &lt;img src=x onerror=top.__pwned=1&gt; |
```

    observed:  <td><span class="state pass state-full"><img src="x" onerror="top.__pwned=1"></span></td>
               top.__pwned === 1
    control (no leading span, plugin transforms server-side): top.__pwned === undefined

So script ran in the origin HARD RULE #24 puts the visitor's OpenRouter key in.

**Fixed at the source, not relabelled.** `badgeSpan()` builds the element with
`createElement` + `textContent`, so there is no parse step to exploit — and it is also more
faithful, since the label had already been flattened to text by the read. Both sinks are
therefore GONE from `lib/runtime`, and their census entries are replaced by a note saying
why they must not come back. `docs/e2e/badge-transform-escape.spec.ts` pins it on the real
surface, with an anti-vacuity assertion that the transform actually ran.

**Why this is the finding that matters most.** A provenance census is only worth what its
provenance claims are worth, and this PR's own census asserted "contained" about a line that
was not. Pre-existing rather than introduced — but squarely on this change's path (HARD RULE
#18): a PR whose deliverable is "declare where every runtime injection's markup comes from"
cannot ship having declared two of them wrongly.

### 3.4 What ships: the durable half nobody built

The card's fourth acceptance criterion — "a gate, or an extension of `checkPreviewHtmlSinks`,
that notices if a future render path injects post-sanitize DOM the same way" — had nothing
corresponding in the tree. That is what lands.

`checkRuntimeMarkupSinks` is a **provenance census** of every markup sink in `lib/runtime`
(`innerHTML` / `outerHTML` / `srcdoc` assignment, `insertAdjacentHTML`, `document.write`,
`createContextualFragment`). Each is declared with where its markup comes from; the gate fires
on an undeclared sink, a moved count, and a stale entry.

It is a census rather than a guard requirement **because the dangerous sink cannot be
guarded** (§3.3) — what is enforceable is that a new injection point cannot land without
someone writing down its provenance.

The count is the pin, and that is the part the other three #22 arms lack: they are file-scoped,
so a **second** sink hiding behind an already-legitimate one passes. That matters immediately
here, because the issue named **one** injection site and there are **two** — the fresh render
and the `mermaidSvgCache` replay of the same third-party SVG.

Test written first: 13 arms, all 13 failing before the implementation, over a temp tree with an
injected root. Both real-tree mutants killed — a new sink shape, and a fourth
`target.innerHTML`. Its evasion envelope is in the docblock, as the other three arms carry
theirs.

**Widened after a red-team pass**, which drove the real gate over a temp tree and watched
`target.setHTMLUnsafe(svg)` pass **silently**. It is a Baseline-2024 API present in the
Chromium the preview runs on, it parses its argument as HTML exactly like `innerHTML` with no
sanitization, and it was in neither the sink list nor the declared envelope — i.e. exactly the
"future render path" the gate exists to catch, landing green. `setHTMLUnsafe`, `setHTML` and
`writeln` are now matched (test arms first, as before), and bracket-indexed receivers
(`nodes[i].innerHTML`) are now named in the envelope rather than left implied. Nothing in
`lib/runtime` uses any of them today, so this changed no census entry — it closed a hole in the
claim, not in the tree.

### 3.5 The suite, and the vacuity it caught in itself

`docs/e2e/mermaid-post-sanitize.spec.ts` — 11 behavioral arms on the real Playground: nine
script shapes that must not execute, the click vector, and the `<br/>` label support `strict`
was once wrongly believed to cost.

Each script arm asserts the diagram **rendered** and its benign label text is on screen before
concluding anything. That assertion was added on suspicion and immediately earned itself:
**six of the first seven arms were vacuous.** A double quote inside a mermaid node label makes
Mermaid throw, so the payload never reached the DOM, nothing ran, and the arms reported green
while testing nothing. The payloads are now quote-free and the oracle is `top.__pwned` —
script execution reaching the top docs origin, which is the actual harm — rather than a
network side effect.

---

## What this branch deliberately did not do

- **The `assembleDocument()` chokepoint.** The recurring defect across #1718/#1731 was
  declaring a class closed after fixing one member; the structural answer is one guarded place
  that assembles a document with caller CSS, rather than a fourth text-matching gate. That is a
  design fork and wants its own round.
- **The remote-subresource posture** (§3.1). A product question about every preview frame, not
  a diagram bug.
- **The export path.** The CLI renders Mermaid through **mmdc**, a separate process, and bakes
  SVG at build time. `lib/runtime` is the in-page preview surface only. Exports were checked
  for byte movement and did not move: the PDF is byte-identical and the player/HTML sidecar
  differs only in its embedded `generatedAt` timestamp.
