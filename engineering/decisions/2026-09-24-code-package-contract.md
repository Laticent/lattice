---
status: in-progress
summary: How a shared transform (a code package's `transform.js`) runs — the design phase 6 of portable packages started from, and its record. The owner chose self-contained packages bundled at export (§8) and a locked Chromium page for the CLI (§4); §9 is the CLI's door: consent pinned to the code's SHA-256, first-match routing, a sanitizer that drops every remote reference, and Chromium's OS sandbox as an unprivileged user where the machine allows it.
---

# Code packages: the transform contract and its toolkit

> **Started as a proposal; now partly built.** This was the design pass that
> `2026-09-23-portable-packages.md` §3.5 said must come before any code. The owner's
> decisions are in §6 and §8; the sandbox (step 1) and the export bundler (step 2) are
> in §4 and §8, and the CLI's door, the first surface that runs a stranger's package
> after consent, is §9. The Studio's door is still to come.

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
  the literal launch list, and a check that the page still lays out text for `measure`). The
  Studio's sandboxed iframe is built and measured too (§10).

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

**The slide a transform receives is `{ html, index, idPrefix, baseUrl }`** for v1 (§11 adds `facts`, the stable input): the rendered
`<section>`, the slide's 0-based position in the deck, the deck render's id prefix, and the
render's asset base. Position and prefix exist because a chart scopes the ids it mints in its
`<defs>` by the slide's position (lib/core/render-ids.js); without them a slide transformed alone
numbers itself 1, and 12 of the 22 chart packages differed from the deck render until they were
added. The position is required, since a wrong one is silent. `enterSlideIds` takes only a prefix
that module could have minted. `baseUrl` is the one context field a shipped adapter reads:
`team-profile` resolves portrait paths against it, and the Studio passes one where the CLI does
not (found by the inversion lens). §5's other fields (markdown, list items, directives, token
names) join when a transform needs them; no shipped one does.

**The runner** (as step 2 built it; §10 moved the package into a worker, and `packageScript` became `workerScript`) ran the package as the
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
(§5). No door ran a package at the end of step 2; the CLI's door is §9.

## 9. Step 3: consent and the CLI door (2026-09-27)

The CLI now runs a third-party code package, after the user approves its code. (The Studio's door
is §10, which also moved the package itself into a worker in both doors.) The adversarial trio
reviewed the first cut, and most of this section is what that review changed.

**Consent, pinned to the bytes and the layer** (`lib/packages/trust.js`). `lattice packages add`
installs a code package once the gate accepts its shape, prints what the code is (file, size,
SHA-256) and what contains it, including the OS layer this machine gives it and, when that layer is
off, why and how to put it on, and asks. The answer is recorded in `$LATTICE_HOME/trust.json`
against the SHA-256 of `transform.js` and the layer the text showed. One changed byte asks again,
and a render whose browser can give the package only a weaker layer than the one approved is
refused before any of the package's code runs. `--trust` answers yes without a prompt; with no
terminal and no `--trust` nothing is approved; `lattice packages trust` and `untrust` give and
withdraw it later. The file lives outside the store on purpose: a zip can't carry its own approval,
and `--packages <dir>` moves where packages are read from, never where consent is kept. A render a
code package claims a slide of without approval exits 1 with its name, digest and the `trust`
command (§3.5 point 1: never a silent render without the transform). Consent and render measure the
same browser: the resolver moved out of `lattice-emulator.js` into `lib/core/chrome-exec.js`, after
the inversion lens approved "on" on one browser and rendered "off" on another.

**The shape a door runs** (`lib/packages/gate.js` `refuseCode`). Only a component carries code;
its one script is `<name>.transform.js` (any other script refuses the package, so nothing rides
along that consent did not cover); the transform ends in `export { name as default }`, the one
form the runner takes; and it is at most 1,000,000 characters, since the locked page carries it in
a `data:` URL Chromium caps at 2 MB. A code package is never renamed to `<name>-custom`, because
its transform finds its slides by its own name; a reserved name is refused at `add`, and a folder
placed in the store by hand under one is not used by the render.

**The slot: in the engine, right after the charts** (`lib/transformers/code-packages.js`). The
first cut ran packages after the whole render. The inversion lens showed what that cost: a package
got our FINISHED markup (the masthead cells, the stage) as its input, which would make the engine's
final DOM a promise to every third party, while our own 29 are tested at their registry places;
and a package in a pane never ran, silently. So packages run in a registry slot right after
`chartFamily`, where every chart's transform runs, before the passes that rebuild or wrap a section,
and inside panes, which render through the same registry. The engine render is synchronous and a
package runs asynchronously, so the slot is a caller-supplied hook, a no-op without one (a render
that uses no code package is byte-identical), and the CLI renders twice
(`lib/packages/code-door.js` `renderWithCodePackages`): the first render captures the sections the
packages claim, the sandbox runs them, the second render puts the sanitized output in at the slot.
A deck no package claims renders once.

**First match** (`lib/packages/code-door-core.mjs` `claimedSlides`, shared with the Studio's door).
One ordered list, as the chart dispatch walks: the shipped components that have a transform, then
the installed code packages by name; the first the section's classes hold claims it. `bar tally` is
a bar chart, and the render names the slide so the author knows `tally` did not draw it; two
packages on one slide go to the first by name. Only TRANSFORM components claim: the engine stamps
`content` on ordinary sections and `content` is a shipped component, so the first run, which listed
every shipped name, lost every slide to it.

**Sanitized, keeping only what it was handed** (`lib/core/door-attr.mjs` `doorFilterAttr`, applied
by `createSlideSanitizer`'s new `filterAttr` in the same pass):
- An ADDRESS survives only if the section the package was handed held it, byte for byte, or it is
  `data:` or a `#fragment`. The author's own image, link and background pass through, and
  `--allow-remote` decides about those as about any. An address the package INVENTED is dropped,
  remote or local: remote is how it would send the slide to a server; local is how it would name a
  file for a later pass to read. The red team did exactly that: a logo mask naming a local file,
  which the CLI's logo-mark pass read into the export. The first rule (drop only remote addresses)
  also dropped the author's own backgrounds, which the CLI writes as `file://` URLs.
- An ENGINE CHANNEL marker survives only if it was handed: a `data-lattice-*` attribute and a
  `lattice-*` class. The inversion lens forged a speaker note (`aside.lattice-notes`) that
  `--strip-notes` then shipped.
- The section's own tag stays the engine's (its id, slide attributes, style); the package gives the
  class list, which keeps every class it was handed (the door puts back any it leaves off, §11), and
  the body.
- The sanitizer runs in a page of our own in the same sandbox browser (Node has no DOM here; jsdom
  is a development dependency), in a context no package code runs in, and it is timed like a slide.
- The author's comments (speaker notes) and the deck's `<style>` blocks, which ride in the first
  section, go back in from the engine's copy (the first end-to-end run lost the package's own CSS).

**Parity after the sanitizer** (`code-package-parity.test.js`). All 29 conformance packages, on
every slide of their galleries, give the same bytes through the door's sanitizer page as the
export's Node sanitizer makes of the in-repo render (316 slide runs, 177 changed by sanitizing).
Since the two sides get the same input, that proves the page matches Node, not that nothing is
lost, so a census pins what the door removes from our own 29: `journey`'s `data-lattice-desc` (an
engine-namespaced attribute it was not handed), and `video`'s poster link `href`, thumbnail `style`
(addresses its transform builds from the bullet's text) and `target` (stripped from every slide).

**Bounded, and cleaned up.** 2 s per slide and per sanitizer call. The packages get 30 s of the
render, across every pass (`--strip-notes` renders twice; a section already drawn is not run
again), checked before each package's page opens and before each slide. The host kills the worker
30 s past that; the worker writes one result per line, so a kill keeps every slide that finished,
and the host kills any browser it left behind (it runs as `nobody`, in its own process group) and
removes its profile.

**Never blank, never silent.** A slide whose package failed keeps the engine's section with a
visible note naming the package and the reason. Every line from a stranger reaches the terminal as
ONE printable line (`printableLine`: control characters, newlines, line separators and direction
overrides become `?`), so none can clear the screen or pose as a status line of ours.

**A bundler for an installed CLI: none ships.** An installed code package is already a
self-contained bundle, so `lattice packages export` zips it as it is, and its digest, and so a
receiver's approval, survive the round trip. A third-party author bundles with their own tools
into the one ES-module shape; esbuild stays a development dependency.

**The OS layer: (c) where possible, else (b)** (`lib/core/os-sandbox.js`). As root on Linux the
sandbox browser starts as `nobody`, WITHOUT `--no-sandbox`, driven over `--remote-debugging-pipe`
(no port another local process could attach to), with a fresh profile it owns and none of the
invoking user's environment. Where the OS sandbox still can't start, the same user with
`--no-sandbox`; where `nobody` can't run the browser at all, root with `--no-sandbox`. Anyone else
launches without `--no-sandbox` first. "On" is measured: every renderer under the browser must read
`Seccomp: 2` in `/proc`. Measured here (root, Chromium 141 at `/opt/pw-browsers`): on, as `nobody`,
renderers in their own user namespace, about 0.4 s to launch. Puppeteer's own download sits under
`/root/.cache` (mode 700), where `nobody` gets `EACCES`, so the layer reads OFF; the consent text and
the render say so with that reason and the remedy (a Chromium the unprivileged user can run), and
`--quiet` does not hide it. Code packages refuse a Chromium older than 131, the version the walls
were measured on.

**Measured as a non-root Linux user** (2026-09-28, `tools/verify-code-sandbox.mjs`, uid 1001,
Chromium 141): Lattice reports "on", and every renderer reads `Seccomp: 2` under that uid; the
approved package drew with 0 requests to the log server, whose control reached it. As root with a
Chromium `nobody` can run, the same tool measured "on" as uid 65534; with puppeteer's browser under
`/root`, "OFF" and `Seccomp: 0`, which is what Lattice said. macOS and Windows are not measured yet:
the same tool reads the renderer command lines there and asks the tester to read the system's own
sandbox column (Activity Monitor; Process Explorer's integrity level).

**Measured on the real CLI** (`test/integration/export/code-package-door.test.js`): a hostile
package that tries `fetch`, an image, a WebSocket and a beacon at load and on every slide, and
returns a section padded with newlines that holds an image, a `srcset`, a video poster, an SVG
image, a CSS `url()` and a link aimed at a local server, a logo mask naming a local file, a relative
image, and a forged speaker note. The CONTROL, the same markup authored in a deck and rendered to
PDF with `--allow-remote`, reaches the server. Unapproved: exit 1, the package named, no PDF, 0
requests. Approved, with `--allow-remote`: it draws, the author's note survives, 0 requests, no
reference to the server and none of the local file in the HTML, the forged note is not a note. One
byte changed after approval: refused again. Each new arm was mutated off and failed.

**Open for the owner: the input.** The inversion lens's strongest point stands after the slot
moved. A package is handed the engine's rendered `<section>` (`{ html, index, idPrefix, baseUrl }`,
§8), so the markup our charts receive at this slot becomes something every third-party package
depends on, frozen. §5 first proposed plain data instead (the markdown, the list items, the
directives, the token names), with the door owning the frame and every channel. Moving the slot
made the frozen surface smaller (no masthead cells, no stage), not zero. Changing the input is cheap
until the first stranger's package exists, and not after.

**Decided (owner, 2026-09-27): both, in two steps.** Real packages come in two kinds. One TWEAKS
our slide (a stamp, a list drawn as tally marks, a restyled table) and wants the finished HTML,
because it keeps everything the engine already did. The other DRAWS something new from the author's
content (a Gantt chart from dates, a map from place names) and wants plain facts, because digging
numbers out of our `<ul><li>` breaks the day that markup changes. So:
1. **Now:** the input stays `{ html, index, idPrefix, baseUrl }`, and it is **provisional**. A tweak
   package works today; the markup it receives may still change, and a package that depends on
   its exact shape does so at its own risk.
2. **Next** (the follow-up `2411-p1`, closed by §11): add the slide's plain facts
   (its text, list items, directives and token names) beside the HTML. The facts become the stable
   promise; the HTML stays for tweaks. Adding a field breaks no package, so step 1 closes nothing.
   Settle it before code packages are documented publicly. **Done, §11.**

## 10. Step 4: the Studio's door, and a worker in both doors (2026-09-27)

**A worker, in both doors.** Building the Studio's sandbox found a hole the CLI never had to face:
a sandboxed frame may always navigate ITSELF, and neither a `sandbox` flag nor a content-security
policy stops `location.href = 'https://…?slide=…'`. The CLI refused that request by interception;
the Studio has nothing to intercept with. So a package no longer runs in the frame's document at
all. The frame's one script, `FRAME_BOOTSTRAP` (`lib/packages/code-door-core.mjs`, the same bytes
in both doors), makes a Worker from a blob of the package's code (`workerScript`) and runs one slide
at a time with a deadline. Measured in a sandboxed frame under the policy (`worker-src blob:` added;
everything else `none`): fetch, WebSocket, `importScripts`, `import()`, EventSource and a nested
worker from the worker reached nothing, `eval` is refused, `document` and `location.assign` do not
exist, and `OffscreenCanvas` measures text for `kit.measure`. Also measured: WebRTC from a
sandboxed frame's own document sent 4 UDP packets under `default-src 'none'` (no policy governs it,
and Chromium ignores a `webrtc 'block'` directive); a worker has no WebRTC. The move also closed the
first runner's weakest point, where the bundle shared the page with the runner and could redefine
it (the red team on step 2): the runner's checks now live in a realm the package never runs in. All
29 conformance packages still match byte for byte in the worker (`code-package-parity.test.js`), so
none of ours needed a DOM. The contract says so now: a package gets the slide, `kit.measure`, and a
worker's globals, and no document.

**A second wall inside the worker, from Firefox.** The first nightly run of the Studio spec on
three engines found that on Gecko an `EventSource` opened from the worker reached the loopback
server, where fetch, WebSocket, `importScripts` and a nested worker did not, and where Chromium and
WebKit refused all of them: the worker's inherited policy did not hold for that one API. So before
any of a package's code runs, `workerScript` takes every network constructor off the worker's global
(`WORKER_NETWORK`: fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport, `importScripts`,
Worker, SharedWorker, BroadcastChannel, and the cache and storage handles), non-configurable, so the
bundle cannot put one back and has no other realm to take one from. The policy is still the first
wall; this one does not depend on each engine inheriting it. All 29 conformance packages still match.

**The Studio's door** (`docs/src/lib/code-packages/`). Every Studio render goes through
`renderMarkdown` (`docs/src/lib/render-engine.ts`), and it goes through `door.ts`:
- **Import** (`asset-bundle.ts`, `package-zip.ts`, `library/import-parsed.ts`): a code component
  imports only in the shape the CLI accepts (the shared `refuseCode`), and never renamed; its
  `transform.js` rides in the record's package carry, so it saves, lists and exports unchanged.
- **Consent**, pinned to the SHA-256 of the code, in THIS browser's storage only
  (`lattice-code-package-approvals`), never in a deck, a backup or a `.lattice` file, so no file can
  grant itself consent. Until then a claimed slide renders as the engine drew it, with a note, and
  a notice above the preview (`CodePackagesNotice.tsx`) says what the code is (size, SHA-256) and
  what contains it, and offers "Run it". The notice reads the deck's SOURCE (class directives, front
  matter and `pane:` markers, outside fenced code), so it names every package the deck needs, not
  only the one on screen. The browser's own OS sandbox is on for a user's browser, so the Studio pins
  no layer. One difference from the CLI, on purpose: the CLI refuses to render a deck with an
  unapproved package, and the Studio renders it with the note, because the preview is where the
  user decides. A Studio export made before approving carries that note.
- **Editing** a code component in a faculty keeps its transform under the same name
  (`saveStudioComponent`); the first cut dropped it on the first edit, silently (the inversion lens).
- **The same slot, routing, splicing and attribute rule** as the CLI: two renders around the
  registry's code-packages slot, the kernel's `captureHook` / `substituteHook`, and the page's slide
  sanitizer with `doorFinish` (`lib/core/door-attr.mjs`, the function the CLI's sanitizer page runs).
- **Loaded only when needed.** The Studio's first load carries the front step alone
  (`code-packages/entry.ts`): `door.ts` loads on the Library's first code package, and the part that
  runs packages (`door-run.ts`, with the kernel, the sanitizer, `door-attr.mjs` and the runner) on
  the first render that meets one. The Library's import check reads `lib/packages/code-shape.mjs`,
  not the whole kernel. Loaded eagerly, the door cost the Studio 9.1 KB gz and the Playground
  10.6 KB (the route budget, `docs/route-budget.json`); what is left is the engine's slot.
- **The sandbox** (`runner.ts`): a hidden `<iframe sandbox="allow-scripts">` (opaque origin: no
  storage, nothing of the Studio page or the user's OpenRouter key) with the CLI's policy and
  bootstrap, the package in its worker, spoken to over `postMessage` with the frame's source checked,
  one run at a time. A package's frame lives for ONE render and closes when it ends: a frame kept for
  the session let a package carry one deck's heading into another deck's slide through its own module
  state (the red team). A run past its time ends the worker, and the next slide gets a new frame.
- **Bounded:** 2 s per slide; 30 s and 4 million characters of package output per render, since the
  sanitizer runs on the Studio's main thread and twelve 3.9-million-character slides froze it for
  10 s (the red team). A failure of time (a deadline, the budget) is tried again on the next render;
  a throw or a bad return, which the same input repeats, is remembered with its note.
- **Caches.** A result is remembered by what the package was handed, so typing re-runs only the
  slides whose input changed. The package-and-approval state rides in the preview's extra CSS as an
  inert comment (`codePackagesStamp`), because every preview and export cache keys on that CSS, so
  a new package or approval re-renders everything that showed the old state.

**Classes: the package's own name, or what the slide carried** (`doorFilterAttr`, both doors). A
later registry pass and the viewer's runtime act on classes they know: a package that added `video`
to its section had the `video` pass, after the door, build a poster address from a bullet the
package wrote, and it reached the red team's server as `GET /leak?d=…` from the CLI's PDF and HTML
with `--allow-remote`. A `mermaid` block the package invents would fetch its image nodes the same
way. So every class in a package's output, on the section and inside it, must be one the slide it
was handed carried, or the package's own `<name>` / `<name>-…`; any other is dropped. This is a rule
for authors: style with `section.<name> .<name>-…`. Our 29 were not written to it, and the
parity test logs how many class tokens the door strips from each (from 5 for `video` to 431 for
`team-profile`), which is the measure of that, not a defect in them.

**What the final checker changed** (one more independent pass, on the fixes above):
- The runtime finds a Mermaid block by SUBSTRING (`[class*="language-mermaid"]`), so an own-name
  class like `acme-language-mermaid` still handed it a diagram. An own-name class containing
  `mermaid`, `language-` or `functionplot` is dropped, and a Mermaid block in the output may name only
  the addresses a handed block named (`doorFinish`), else the output is refused.
- A code package may not take a name that starts a class Lattice uses (`chart` would add
  `chart-frame`, `logo` would add `logo-wall`), nor a runtime stem (`lat`, `lattice`, `mermaid`…):
  `codeNameRefusal`, at `add`, at the Studio's import and at render.
- An `id` lives in the package's name or is one it was handed (a deck's `url(#id)` takes the first
  element with it), and the runtime's markers (`data-mermaid-*`, `data-fp-*`, `data-img-*`,
  `data-pane*`) survive only as handed.
- The Studio's 4-million-character cap counts remembered output too, and a slide refused by the cap
  is not remembered as failed; a load that ran out of time is not retried within the same render;
  a quoted `class: "acme"` names the package for the notice, which also lists any package the
  preview's render found unapproved.

**Measured on the real Studio** (`docs/e2e/code-packages.spec.ts`, desktop Chromium): a hostile
package imported through the Library tries fetch, WebSocket, `importScripts`, `import()`,
EventSource, a nested worker, WebRTC to a UDP port and a navigation, and returns a section naming a
local server seven ways and forging a speaker note. Unapproved: the slide shows the author's content
and the note, the notice offers the code with its SHA-256, and nothing reaches the HTTP server or
the UDP socket. Approved: it draws, still nothing reaches either, the preview holds no reference to
the server and no forged note, every sandbox frame the render opened carried `sandbox="allow-scripts"`,
and none outlived its render. The
CONTROLS: the same page reaches the UDP socket (WebRTC) and the HTTP server (an authored image after
"Load them"). With the door's sanitizer switched off the spec fails. Gecko and WebKit are
tagged too (`@gecko`, `@webkit-tablet`); their result is the nightly's, below the PR.

**Not run by the door: a Marp export.** It renders with marp-core, with no sandbox and no approval,
so a code package's slides show as its CSS draws the authored content (`lib/core/marp-fidelity.js`
records the gap). The HTML player export is assembled from the already-rendered document
(`lib/export/player-core.mjs` takes `docHtml`), so a package's drawing is baked into it.

## 11. Step 2 of the input: the slide's plain facts (2026-09-27)

§9's second step, done. A package's `slide` is now `{ html, facts, index, idPrefix, baseUrl }`.
**`facts` is the stable promise; `html` is the tweak surface**, whose markup may still change.

**What `facts` is** (`lib/packages/slide-facts.mjs`; its module note is the full reference):

| Field | What it holds |
|---|---|
| `version` | `1`; moves only when a field changes meaning or goes away, never for a new field |
| `classes` | the slide's `class` directive, split (its own, or the deck's where it sets none); never a class the engine adds |
| `directives` | every per-slide directive the engine applied (`APPLIED_DIRECTIVES`), camelCase, the value as written |
| `title` | the first h1 or h2's text, or `''` |
| `blocks` | reading order: `heading`, `paragraph`, `list`, `table` (`caption`, `head`, `rows`), `code` (exact), `quote`, `image` |
| `text` | every block's text, one block per line |
| `tokens` | the palette token names every theme defines (`derive.js` `requiredTokenList()`, 118 today), with `--` |

Headings, paragraphs and list items carry `text` and `runs`: the text cut where its marks change,
each run `{ text, code?, pill?, strong?, em?, del?, mark?, math?, href? }`. A list item also carries
`paragraphs` (each paragraph of a loose item) and its nested `items`. Text is plain: inline markup
gone, entities decoded, white space collapsed, math as its TeX. Runs keep what that loses, which is
what Lattice's own grammar uses to carry meaning: `` `12` `` is a value (our charts read a code span
as a number, `lib/core/chart-values.js`), `` `{DONE}` `` a state (the engine's pill), `**Owner:**` a
label, and a link keeps its address. The running `<header>` and `<footer>` the engine writes into
every section are chrome, not content: their text is in `directives`, not in `blocks`.

**Where it is read: on the host, from the section the package is handed.** `code-door-core.mjs`
`slideInput` builds what both doors send: the CLI on the host before the job goes to the worker
process, the Studio on the main thread before the frame gets the slide. Neither is a realm a package
runs in. The worker freezes the facts all the way down, with `Object.freeze` and `Object.keys` taken
before the bundle runs. The facts are read from `html`, so they carry nothing the package was not
already handed, the address rule (`doorFilterAttr`) needs no change, and neither does a claim's cache
key (`claimKey`). In the CLI the slide crosses into the locked page as JSON text, because the
DevTools protocol's object transfer hung on facts nested 150 deep.

**Why read them from the rendered section, not from the markdown.** The door's slot sits in the
engine's HTML registry (§9), where the markdown is long gone, and a pane renders there as a
one-slide deck of its own. The HTML at the slot still holds every distinction a package needs (the
`<code>`, the pill's `span.lat-pill`, the `href`); only flattening would lose them, and `runs` keeps
them. The promise holds because the DOOR owns the mapping: when our markup changes,
`slide-facts.mjs` changes with it. The first test in `test/unit/cli/slide-facts.test.js` renders one
slide of every kind through the real engine and pins the whole facts object, so an engine change
that moves the facts fails there and becomes a decision, not a side effect.

**Why a string scanner, not a DOM.** The CLI reads facts in Node, where the engine renders and jsdom
is only a development dependency, and the Studio reads them in the browser. One pure module serves
both (HARD RULE #1). The same test file pins its text against jsdom's on every slide of three
galleries (`gallery.md`, `data-viz-gallery.md`, `gallery-jargon.md`), and checks that every node's
runs join to its text. That sweep found the table caption the first cut dropped. The checker ran it
over every `examples/*.md` as well: 2,149 slides, no difference.

**It reads an author's HTML on the host, so it is bounded.** The red team crashed the CLI render
with 22 KB of nested `<div>` (the reader recursed), and stretched a 3 s render to 24 s and 51 s with
120 KB of stray `<` and of raw-text elements (three scans re-read what they had read). Now nesting
past 128 flattens into its parent, a `<` that cannot open a tag is text at once, a raw element's end
is found from where it starts, and adjacent text joins; each of those inputs reads in under 130 ms,
pinned under a second in the test. A slide whose facts still fail to read gets its note in the CLI,
never ends the render. A character whose lowercase is longer (`İ`) no longer shifts what a raw
element hides.

**The token list is a promise, and it is tested as one.** The same test reads every shipped theme,
following a dark or a11y variant's `@import` to its base, and checks each defines all 118 names.

**What the conformance package changed.** A package written against `facts` alone (`dateline`,
in `code-package-door.test.js` and `docs/e2e/code-packages.spec.ts`) builds its section fresh, so it
cannot repeat the classes the engine added: they are markup, not facts. The door refused every such
slide ("dropped the slide's own classes content form"). `doorFinish` now puts the handed classes
back, which yields exactly the section a package that kept them yields, so no new state is reachable
(the red team checked; `code-door.test.js` pins it).

**Measured.** The CLI (real `lattice-emulator.js`, HTML with `--allow-remote`): `dateline` draws its
rows from the facts' list, plain (`**Kickoff**` arrives as `Kickoff`, a link as its words), paints
with a token it found in `facts.tokens`, finds the facts frozen, and its attempt to send `facts.text`
to the log server reaches nothing (0 requests). With the CLI door's `facts` forced to `null` the test
fails. The Studio (desktop Chromium, `code-packages.spec.ts`): the same package draws the same rows,
and reaches nothing. Gecko and WebKit run in the nightly. The 29-package parity run is unchanged:
42 of 42, 316 slides, 214 changed by the sanitizer, as on `main`.

**Open, for the owner, before code packages are documented publicly.** The inversion lens pressed
three points this section does not settle:
1. `tokens` is the theme contract (`REQUIRED_TOKENS`), not a list chosen for package authors: it
   holds `scheme-dark-*` and `hljs-*`, two categorical families (`chart-cat1..8`, `cat-N-*`), and it
   moves whenever the theme contract does. A curated, frozen subset is the alternative.
   **Decided (owner, 2026-09-28): packages keep the whole theme contract**, all of
   `requiredTokenList()`. It is easier to manage than a second list, at the cost the point names: a
   token leaving the theme contract leaves `facts.tokens` too, so removing one is a change to what
   packages are promised, and the test that every theme defines every name handed over stays.
2. A manifest could declare the facts version it reads (`"facts": 1`), and a door refuse a package
   written for another. Its only use is the first breaking change to `facts` (a field renamed, or
   `text` meaning something else): with the declaration, a door could keep handing a v1 package v1,
   or refuse it plainly, where without it an old package gets the new shape and throws or, worse,
   draws the wrong thing. **Decided (owner, 2026-09-28): declare it now, no deferred version debt.**
   A code package's manifest must carry `"facts": <version>`. `factsRefusal`
   (`lib/packages/code-shape.mjs`, beside `FACTS_VERSION` and `FACTS_VERSIONS`, today `[1]`) refuses
   a missing, malformed or unknown one, and `refuseCode` calls it, so `lattice packages add`, every
   CLI render (the gate re-runs there) and the Studio's Library import refuse the same packages in
   the same words. Each door then hands the package facts in the version its manifest declared
   (`slideInput(claim, tokens, version)`), which throws for an undeclared one: a Studio package saved
   before this change keeps its slide with a note until it is imported again, and the Studio does
   not remember that note, since its memo keys on the code and the fix is in the manifest. The day
   `facts` changes shape, `FACTS_VERSIONS` grows and `slideFacts` learns to write each version it
   lists; nothing about packages already in the wild has to be guessed.
3. Additive, when a package needs them: table cells as runs, a pane's box, an eyebrow's role (a
   code-only paragraph and an `h6` are two spellings of one role).
Documenting code packages publicly is now unblocked, and it is a separate step.
