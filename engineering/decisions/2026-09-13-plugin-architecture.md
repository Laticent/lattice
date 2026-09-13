---
status: in-progress
summary: "Lattice never formalized a plugin architecture, but built most of one across six registries that do not share a spine. The audit, and the model: a plugin is a CONTRIBUTION at one of four tiers (provider / leaf renderer / section transform / deck-scoped), delivered over one of three CHANNELS (in-tree / npm / shared zip), and TRUST FOLLOWS THE CHANNEL, not the plugin. Sequenced debt-first: the folder-drop is a half-truth today (six hand-maintained rosters, two failing silently), and that is the blocker, not the absence of a third-party API. Ships the first slice — the video provider registry — which also closed a QR-phishing affordance."
---

# The plugin architecture — what we actually have, and the model that fits it

**Date:** 2026-09-13
**Decision owner:** Sharmarke
**Supersedes nothing.** Continues [`2026-06-14-plugin-extension-system.md`](2026-06-14-plugin-extension-system.md)
(LPM), whose dispatch half shipped and whose third-party half was deferred.
Bounded by two shipped decisions it does **not** reopen:
[`2026-06-29-component-transformer-threat-model.md`](2026-06-29-component-transformer-threat-model.md)
and [`2026-07-02-contribution-model.md`](2026-07-02-contribution-model.md).

## The question

Have we formalized a plugin architecture — one that could take Chart.js, or
Vega-Lite, or a video provider, or our own charts, as installable units rather
than hand-wired ones? And can such a thing be dynamically loaded, packaged, and
enabled from settings?

## The answer

**No, and most of one exists anyway.** Six registries grew independently, each
solving the same problem in its own idiom, and none of them knows about the
others. The gap is not capability. It is that nothing names the contribution, so
every consumer has to be told about each new thing by hand — and several of those
consumers fail silently when nobody remembers.

### What is built (measured at HEAD)

| Piece | State |
|---|---|
| Manifest as descriptor | 69 component manifests, read by ~25 generators — CSS, docs, galleries, snippets, lint coverage, the LFM grammar, the agent kit |
| Manifest-driven **code** dispatch | **Charts only.** `KERNEL_BUCKETS = ['chart']` (`lib/components/index.js:730`), one key (`kernel.figureClass`), 21 kernels on one entrypoint `transformSection(html, ctx)`, frozen into `chart-registry.generated.js`. Folder-drop proven by `test/unit/components/chart-folder-drop.test.js` |
| Declarative transform DSL | **Built and adversarially reviewed** (`lib/core/transform-dsl/`). One interpreter serves both render paths (the string path parses with jsdom and runs the DOM interpreter), closed element and attribute allowlists, prototype-pollution defense, validated at manifest load. **Wired to nothing** |
| Capability registry | The headroom hinge, exactly the right shape — `lib/core/transform-dsl/capabilities.js`. **One entry** (`panel-eyebrow`) |
| Package format | `lattice-asset/1` zip **shipped** — envelope, three layouts, roundtrip-tested (`2026-06-29-lattice-asset-share.md`) |
| Import trust boundary | **Shipped** — `docs/src/components/studio/import-gate.ts` refuses an imported asset that reaches off the device, and its docblock reasons carefully about where a refusal belongs (the zip, where author and victim differ) and where it does not (your own data) |
| Installed-asset library | IndexedDB per kind — theme, component, finish, scene, reference doc — plus the `lattice-workspace/1` backup |
| Runtime theme registration | `ThemeStore.add()` (`lib/engine/themes.js:91`) takes a theme CSS string at run time |
| Dynamic loading, browser | **Mature.** 41% of the Studio island's code already deferred across 25 lazy chunks, under a blocking per-route byte ledger (`docs/route-budget.json`). Three "ensure" loaders side-load a classic script and poll for a global; `ensure-hljs-language.ts` stages **156** highlight.js grammars and fetches only the ones a deck's fences name |
| Dynamic loading, Node | `loadPuppeteer()` (`lattice-emulator.js:3117`) does a variable-path `require` that **survives into the built bundle** — the existing proof that the shipped CLI can load something absent at build time |

### What is missing: a spine

Six registries, no shared contract:

1. **Components** — manifest, auto-discovered by a filesystem walk.
2. **Charts** — the `kernel` block, generated into static `require`s.
3. **`lib/transformers`** — 18 hand-ordered `require`s, ordering carried in prose.
4. **Forms** (Frame / Cell / Tile) — manifests that are *validated, not executed*.
5. **`lib/integrations`** — four folders for six integrations, each bespoke.
6. **`LATTICE_PLUGINS`** (`lib/engine/index.js:112`) — a frozen in-source array,
   literally named "plugins", closed.

There is no `lattice.config.*`, no enablement, and no hook API.

## The finding that sets the sequence

**The folder-drop is a half-truth, and the other half fails silently.** Adding a
chart touches zero lines of `chart-family.js` — real, and pinned by a test that
asserts the shipped file names no chart layout. It still needs about six hand
edits to unrelated rosters: `CHART_TOKEN_COMPONENTS` and `MEDIA_COMPONENTS`
(`lib/transformers/prose-projection.mjs`), `KEYED_CHART_LAYOUTS`
(`lib/export/image-set.js`), `CLEAN_SVG_LAYOUTS`
(`docs/src/components/studio/export/deck-export.js`), `DATA_LAYOUTS`
(`lib/authoring/scorecard.js`), and `docs/src/lib/families.mjs`.

**Not one of them goes red.** Omit the first and `--chart-cat-N-*` resolves to
nothing, so fills render black. Omit `CLEAN_SVG_LAYOUTS` and vector export
silently downgrades to PNG.

That is the blocker. A third party cannot hand-edit `deck-export.js`, so every
one of those rosters is a wall between us and any plugin — and they are already
a tax on us. **Kill the rosters and the plugin system is most of the way built;
build the third-party door first and it opens onto a frame full of holes.**

The same defect one level over is what this note's first slice fixes: the video
component's provider table existed **twice**, in two unrelated trees, with
independent regexes.

## The model

Two axes. Crossing them produces the whole policy.

### Axis 1 — what a plugin contributes (blast radius)

| Tier | Contributes | Ordering | Examples |
|---|---|---|---|
| **T0 Provider** | a pure descriptor table | none | video providers, citation styles, unit formats |
| **T1 Leaf renderer** | a trigger → a figure | none | chart kernels, fences: Mermaid, function-plot, Vega-Lite, Chart.js |
| **T2 Section transform** | rewrites a rendered section | **semantic** | everything in `lib/transformers` |
| **T3 Deck-scoped** | reads or mutates the whole deck | global | progress rail, auto-split, pagination |

T0 and T1 are *leaves*: pure functions with no ordering relationship to anything
else. That is what makes them safe to admit from outside.

T2 is not, and the reason is worth stating because a declarative `after: [...]`
field would paper over it. The ordering in `lib/transformers/registry.js` is
**semantic, not positional**: `coda` runs first so trailing editorial beats are
lifted before any rebuilder can swallow them; `contact` and `wifi` run before
`mastheadLift` because they are `conformance: "strict"` and would wipe the frame
cell that wraps them; `teamProfile` must precede `focus` and `pillTag` because it
is the pass that changes the `<li>` shape they read. "After `teamProfile`" is not
the constraint — "after whatever last changed the list shape" is, and no
dependency list expresses it. T2 stays first-party, or is reached declaratively
through the DSL.

T3 is permanently first-party: `match → do` is single-section by definition, and
these change the deck's slide count.

### Axis 2 — the delivery channel, which is what sets trust

**Trust follows the channel, not the plugin.**

| Channel | May carry | Why |
|---|---|---|
| **In-tree** (first-party) | everything, T0–T3 | reviewed by us |
| **npm** (`lattice-plugin-*`, a project dependency) | **code**, T0–T1, Node-side, resolved at build time | you ran `npm i`. You already execute the engine and 15 transitive dependencies in that process; a plugin there is no more privileged than any dependency you chose |
| **Shared zip / Studio / AI-generated** | **declarative only** — manifest, CSS, skeleton, DSL rules, provider tables | the recipient never consented, and the preview is a same-origin frame next to the user's OpenRouter key |

The third row is the shipped threat model, unchanged. The second row is the one
this note adds, and it is a **channel distinction, not a reopening**: the threat
model's six conditions (§7.1) govern code that crosses an *untrusted* boundary. An
npm dependency does not cross one — installing it **is** the trust decision. A
plugin that wants both channels must be expressible declaratively, which is the
forcing function that finally makes the DSL and the capability registry earn their
keep.

### What this says about dynamic loading

It splits, and the split is not a limitation to route around.

- **Studio and docs site** — already dynamic, already budgeted, with a working
  pattern to copy (`ensure-hljs-language.ts` loads code keyed off deck content).
- **Engine, runtime and every export** — deliberately static, and should stay
  that way. `splitting: true` appears in no build script; the chart registry is
  generated into static `require`s precisely because a bundler cannot follow
  `require(templateLiteral)`. Above that sits the reason: **the export is the
  product.** The `.html` player ships under
  `default-src 'none'; script-src 'sha256-…'`, so a plugin can only run there if
  its bytes were part of the hashed assembly. A plugin that needs the network to
  work would break the one artifact that has to keep working offline, forever,
  on someone else's machine.

So **"install" means your build resolves it and inlines it** — not "the runtime
fetches it." That is the idiosyncratic answer, and it falls straight out of what
Lattice is for.

### What this says about Chart.js

Chart.js draws to `<canvas>`. Lattice PDFs are vector via Chromium print, and
`CLEAN_SVG_LAYOUTS` is exactly the list deciding vector versus PNG per layout. A
canvas chart rasterizes — a real hit against the boardroom bar. Chart.js is a
legitimate T1 plugin, but it has to **declare itself raster** and degrade
honestly, which is an argument for an SVG renderer (Vega-Lite, D3) as the first
third-party chart proof.

### What this says about payload

Every renderer library is a hard `dependency`, so `npm i @laticent/lattice` drags
`@mermaid-js/mermaid-cli` (and its own Chromium), KaTeX, function-plot and
highlight.js whether a deck uses them or not. The *bundle* is already disciplined
— Mermaid, KaTeX, function-plot, highlight.js and dagre contribute **zero bytes**
to `dist/lattice-runtime.js`, each kept out deliberately and three with a decision
record saying so. The conditional-payload win is therefore about **install** cost
and about **our own kernels**: `lib/components` is 53% of the runtime bundle.

## Rollout — debt first

**Phase 1 — kill the rosters.** Move the six hand-maintained lists into manifest
fields projected into generated catalogs, the pattern five other catalogs already
use. No new concepts, no external surface. Makes the existing folder-drop claim
true and removes two silent-failure modes. **This is the prerequisite for
everything below**, because a plugin cannot hand-edit `deck-export.js`.

**Phase 2 — providers as the first contribution kind (T0).** Shipped with this
note; see below.

**Phase 3 — generalize `kernel` into a contribution block.** Lift
`KERNEL_BUCKETS = ['chart']`, and retro-fit the integrations onto it so their
divergences (`exec`, render-path coverage, theming strategy, degradation) are
declared rather than commented. This finally gives function-plot a home — its
contract is now spread across **seven** files with its browser inflater written
**twice**, and it is a silent no-op on the docs site. This is LPM's Phase 1
items 3–5 and Phase 2, with the dispatch half already proven.

**Phase 4 — conditional payload.** Declared contributions carry declared
payloads; renderer libraries move to `optionalDependencies`.

**Phase 5 — the third-party door**, and it is two doors. The npm channel
(`lattice.config.js` + `lattice-plugin-*`, build-time resolved, inlined) and the
Studio channel (`lattice-asset/2` carrying DSL rules and provider tables through
the existing import gate). **The legal door must land first**: per the
contribution model's finding 6, a plugin grant in `LICENSE-EXCEPTIONS` has to
exist **before** the first outside patch, and no such exception exists today.
Nothing in Phases 1–4 opens it, which is why they are sequenced first.

## What this note ships — Phase 2, the video provider registry

Chosen as the first slice because it is the cheapest possible proof of the
model's T0 tier and it pays for itself immediately.

**Before.** One pure, ordered, six-field provider table in
`lib/engine/video-providers.js` answered "who hosts this, and where does the
poster link and QR go". A **second** table in
`docs/src/playground/video-overlay.js`, with its own id regexes, answered "what
iframe src plays it". Same four providers, two trees, no shared kernel. Adding
one meant two edits, and missing the second degraded playback to "opens a tab"
with nothing going red.

**After.** One registry — `lib/core/video-providers.mjs` — carrying the whole
descriptor per provider: `key`, `label`, `hosts`, `id`, `watch`, `oembed`,
`embed`, `shape`, `asyncResolve`. The component stays dumb; every consumer reads
the row. Adding a provider is one row. Node reaches it from CJS through
`require(esm)`; the docs site imports it directly, as it already does for
`present-transport.mjs` and `sanitize-style-text.mjs`.

**Merging the two tables forced five disagreements to become decisions.** Four
were resolved toward the stricter or better-informed side and are recorded in the
kernel's header. The fifth was a defect in both:

> **Both tables matched a SUBSTRING of the whole URL**, so a provider name
> anywhere in it counted — one matched a **fragment**, the other a **query**.
> Because `tiktok` and `instagram` use the author's URL verbatim as their watch
> target, `https://evil.example/#instagram.com/reel/X` rendered a slide with a
> **"Watch on Instagram" badge and a QR code encoding the attacker's origin**. A
> player `src` was never affected — those have always been rebuilt from the
> parsed id.

Rows now declare their `hosts` as data and the **parsed host** is matched against
them. A shared or AI-generated deck can no longer dress a foreign origin in a
provider's badge.

Three further hard-codings fell out of the same pass: the async TikTok short-link
resolver rebuilt TikTok's oEmbed endpoint and player src by hand beside a row
that declares both, and the Instagram `postMessage` origin check named the host
inline. All three now read the registry.

**Evidence.** Before any consumer was rewired, a one-off harness compared the new
kernel against both old tables — restored from git — across 28 URLs × 4 facets. It
is not committed, because it depends on two deleted files; it is reproducible from
this note's parent commit, and its outcome is the table in the PR body. What is
durable is `test/unit/core/video-providers.test.js`, which pins what neither
consumer suite can see alone: every row complete, keys unique, hostnames bare data,
hostile URLs resolving to nothing on all five facets, the watch target
re-serialized, and — the arm that stops a third table appearing — **a census
asserting no provider hostname is written in executable code anywhere outside the
kernel**. That census is what found three further hard-codings in the overlay. Its
pattern is derived from the registry rather than written beside it, and a second
arm proves that pattern covers every declared host: the hand-written first draft
silently could not match `youtu.be` or `youtube-nocookie`, so a re-introduced
YouTube table would have shipped through its own guard.

**Maker-checker (HARD RULE #25).** An independent checker read the diff and
confirmed six defects, four of them real losses this change would otherwise have
shipped: a mixed-case hostname that matched the row and then yielded no id (a dead
poster link and a dead QR); a trailing-dot FQDN that resolved to no provider at
all; the census blind spots above; and the sharpest one — **the security claim did
not hold for the QR channel.** A backslash ends the authority in WHATWG (every
browser, and `new URL` here) but is userinfo under RFC 3986, so
`https://instagram.com\@evil.example/p/X/` passed the host check and was then
handed through verbatim as the watch target, which is also the payload of a QR code
somebody scans with a phone. The watch target is now re-serialized through the
parser that validated it. All six are fixed in this branch; two of them were
pre-existing rather than introduced here.

Unit suite 9437 pass / 0 fail; `lint` and `build:check` clean; the docs site builds
with all five routes within budget; `examples/video.md` renders with poster, badge
and QR intact.

**Not done here, deliberately:** no new provider is added. Adding Loom or a bare
`.mp4` is now a one-row change, and it is a visible change that owes a demo-deck
update under HARD RULE #9; holding this slice to the four shipped providers is what
let a parity comparison be the evidence.

## Non-goals

- **No third-party API in this note.** Phases 1–4 are engine refactors with no
  external surface; the contribution model's "not until users demand it" is not
  engaged, and no legal door opens.
- **No new render path or execution model.** We declare the ones that exist.
- **No marketplace.** Rejected as a revenue plan in the contribution model and
  not revived here.

## Open questions

- **Where the contribution block lives.** `kernel` is chart-scoped and one key;
  `render` is taken by the render-nature enum and `transform` by the DSL array.
  The name matters because `additionalProperties: false` makes a wrong guess a
  hard load failure.
- **Whether `lib/transformers` ordering can be declared at all**, or whether T2
  stays a hand-ordered array forever with the DSL as the only outside path.
- **`esm.run` is a live precedent for loading foreign code at run time** — the
  Studio's AI tier dynamically imports web-llm, transformers and kokoro from it,
  in the top-level document that holds the user's OpenRouter key, and
  `test/unit/docs/no-cdn-runtime.test.js` does not list that host. Whether that
  is a sanctioned carve-out or a gap the 2026-09-03 sweep missed should be
  settled before any plugin proposal is measured against it.

## References

- [`2026-06-14-plugin-extension-system.md`](2026-06-14-plugin-extension-system.md) — LPM, the design this continues.
- [`2026-09-01-manifest-driven-chart-dispatch.md`](2026-09-01-manifest-driven-chart-dispatch.md) — the dispatch half, and the six-roster census.
- [`2026-06-29-component-transformer-threat-model.md`](2026-06-29-component-transformer-threat-model.md) — declarative-only, and the six conditions.
- [`2026-06-29-component-transform-dsl.md`](2026-06-29-component-transform-dsl.md) — the DSL and the capability registry.
- [`2026-06-29-lattice-asset-share.md`](2026-06-29-lattice-asset-share.md) — the shipped package format.
- [`2026-07-02-contribution-model.md`](2026-07-02-contribution-model.md) — governance, and the one-way legal door.
- [`2026-08-17-studio-dynamic-loading-audit.md`](2026-08-17-studio-dynamic-loading-audit.md) — what is already lazy, and the byte ledger.
- [`2026-09-13-bundle-era-skew.md`](2026-09-13-bundle-era-skew.md) — why a build-time-frozen registry and a run-time-discovered set collide.
- [`2026-07-02-video-component.md`](2026-07-02-video-component.md) · [`2026-07-02-video-overlay-playback.md`](2026-07-02-video-overlay-playback.md) — the component this slice touches.
- `spec/LFM-1.0.md` §10–11 — out-of-tree vocabulary registration, deferred by the standard.
