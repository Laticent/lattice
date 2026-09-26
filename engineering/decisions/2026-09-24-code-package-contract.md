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
- **Verified (2026-09-26), with a network log; and a CSP alone is NOT enough.** The page is
  `lib/core/code-sandbox.js`. A real local HTTP + WebSocket server and two UDP sockets counted
  what 34 hostile vectors reached on Chromium 131: image, `fetch`, XHR, WebSocket, beacon,
  EventSource, prefetch, preload, stylesheet, CSS background, iframe, meta refresh, top-level
  navigation, `window.open` (direct and through an `about:blank` iframe), a `target=_blank`
  link (plain, in a closed shadow root, with `closest` patched, and in SVG) and form, form post,
  worker (URL and blob), dynamic `import()`, `<script src>`, SVG image, video poster, audio,
  `<a ping>`, speculation rules (plain, and stamped with a nonce read from the running script),
  `FontFace`, and WebRTC (direct and through an iframe). With no walls the control fires 33 (a
  URL `Worker` is refused by the opaque origin even there); every vector logs that it RAN, so a
  zero is never a script that did not start. Two walls each stop all 34 ALONE: the BROWSER (the
  offline arguments, always, `--allow-remote` or not) and the PAGE (a fresh context, a script-free
  `data:` outer document, the transform in `<iframe sandbox="allow-scripts">`, `default-src 'none'`
  with script allowed only by the SHA-256 hash of the transform, request interception, and an init
  script that removes `window.open` and WebRTC). The sandbox browser also turns speculative
  prefetch and prerender off and keeps the popup blocker on; the checker removed each and nothing
  changed, so they are defense in depth, not part of the measured wall.
  What the measurement and the adversarial trio changed: `'unsafe-inline'` let a transform
  inject speculation rules the prefetch service fetched past interception; a NONCE did no better,
  because the transform runs inside the nonced script and can read and reuse it (the red team's
  hypothesis, measured by the inversion lens), so script is allowed by hash; `setContent` wrote
  into the existing `about:blank`, where the init script never runs, so the page loads as a
  `data:` navigation; a `target=_blank` link opened a popup whose first request left before it
  closed, a JavaScript click guard fell to three bypasses the checker found, so the transform runs
  in a sandboxed frame that cannot grant itself a popup; a transform holding `<!--` then
  `<script` silently failed its hash, so those `<` are written `\x3C`.
  **One page per package per render**, not one shared page as the Costs line above proposed: a
  package that patches a global in a shared page could read or rewrite another's slide data.
  **Not claimed:** an OS sandbox under the renderer. The CLI launches Chromium with
  `--no-sandbox`, so both walls are browser policy over a renderer that a Chromium exploit could
  escape; whether code packages refuse to run without the OS sandbox is open for the owner
  (`followups.d/2314-p4-code-packages.md`). Pinned by
  `test/integration/export/code-sandbox-network.test.js` (the control, each wall alone, both,
  the literal launch list, and a check that the page still lays out text for `measure`). Still
  UNVERIFIED: the Studio's sandboxed iframe, which phase 6 has not built.

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

**Open inside this decision, now settled.** `contact`, `wifi` and `video` did not bundle for a
neutral platform: their shared QR-card module reaches `qrcode`, whose Node entry pulls `fs`.
Bundling for the BROWSER platform takes `qrcode`'s own `browser` field (`./lib/browser.js`,
`fs: false`), whose SVG renderer is the same pure encoder, so they bundle and nothing is excluded
(step 2, below).

### Step 2 done (2026-09-26): the export step, proven on every shipped transform

`lib/packages/code-bundle.js` `bundleCodePackage(name)` builds a package's `transform.js` from a
shipped component: esbuild bundles the component's registry adapter with every helper it reaches,
minifies it for the browser platform, refuses the result if anything is left external, and pins
it by the SHA-256 of its text. A chart's adapter reaches all 22 chart kernels through the
generated dispatch table, so the export swaps that table for one naming only the chart being
exported; the test checks each chart package carries its own kernel and no other.

**The slide a transform receives is `{ html, index, idPrefix, baseUrl }`** for v1: the rendered
`<section>`, the slide's 0-based position in the deck, the deck render's id prefix, and the
render's asset base. Position and prefix exist because a chart scopes the ids it mints in its
`<defs>` by the slide's position (lib/core/render-ids.js); without them a slide transformed alone
numbers itself 1, and 12 of the 22 chart packages differed from the deck render until they were
added. The position is required, since a wrong one is silent. `enterSlideIds` takes only a prefix
that module could have minted. `baseUrl` is the one context field a shipped adapter reads:
`team-profile` resolves portrait paths against it, and the Studio passes one where the CLI does
not (found by the inversion lens). §5's other fields (markdown, list items, directives, token
names) join when a transform needs them; no shipped one does.

**The runner** (`packageScript`, `runPackage` in lib/core/code-sandbox.js) runs the package as the
locked page's one script. The package is an ES module, and the page runs a classic script allowed
by its hash, so the runner takes off the bundle's final `export { name as default }` (the only
shape the export writes; any other is refused) and gives the bundle a function scope of its own.
The transform is called with a frozen slide and a frozen `kit` holding `measure` and nothing else;
`measure` is the page's own canvas text measurement, so no host function is exposed. The page
checks the return is a string of at most 4,000,000 characters, but that check is a courtesy: the
bundle's top level runs first and can claim the runner's name or patch `Object.defineProperty`
(the red team did both, and got an object, a number and a 40-million-character string across).
So the host reads the result's type and length through a handle while it is still in the page,
and takes it only if it is a string within the limit. A run past its time (2 s per slide by
default) closes the sandbox, which ends the transform however it loops; a loop at the bundle's
top level is bounded by the load's own 5 s limit; the tail is matched in the bundle's last 256
characters, because on the whole text the pattern backtracked for 30 s on 160,000 spaces. The page's size limit is checked against the encoded `data:` URL, which is what
Chromium limits and runs about 1.9 times the script (`map`: 234 KB, about 443 KB encoded).

**Measured** (test/integration/export/code-package-parity.test.js): all 29 packages (22 charts,
`compare-code`, `contact`, `wifi`, `video`, `scene`, `team-profile` and the `qr` variant) bundle
self-contained. Run in the locked page on every slide of their own gallery deck (the `qr` example
for `qr`), 288 slides in all, each output is byte-identical to the in-repo render: the 206 slides
a package transforms, and the 82 it must leave alone (title, closing and card slides that no chart
claims). The page asks for nothing. The in-repo side is pinned to the deck render, not to the
adapter alone: each slide transformed by itself in Node gives the section the whole-deck render
gave. Separate cases carry an id prefix and an asset base, which no gallery deck exercises, and
hand a chart the wrong position, which must fail.

What "byte-identical" covers: the CLI's render context, and the adapter's own output. §5 puts
every transform's output through `sanitizeSlideHtml` before it reaches a slide, and that changes
the bytes of all 29 (it re-serializes empty SVG elements, and strips `target="_blank"` from the
`video` poster link), so the same comparison run after the door's sanitizer is the door's test.

Size, minified and gzipped: `compare-code` 6.5 KB, `bar` 24.6 KB, `quadrant` 31.2 KB, `map`
83.6 KB (234 KB minified). That is a third to a half above §8's first figures, which bundled each
transform file alone; a package carries its registry adapter too, and a chart the chart-family
wrap.

No shipped transform calls `measure`: `state-chart` measures in its runtime half, not while it
writes its markup (§2 said otherwise; its own header says the build step only emits the nodes). So
only a probe exercises `measure`, and "runs with only `measure`" holds trivially for our 29.

`scene` and `team-profile` ship only their string half; their runtime halves stay out of v1
(§5). No door runs a package yet: every door still refuses one that carries code.
