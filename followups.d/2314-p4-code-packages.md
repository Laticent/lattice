---
origin: 2314
priority: P4
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Code packages behind a trust prompt (phase 6)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — the owner chose to let packages carry JavaScript; this is the riskiest phase and comes last.
where     — the CLI's locked page (step 1, done 2026-09-26); the export step that bundles each package self-contained (step 2, done 2026-09-26); then consent pinned to a SHA-256, the Studio's sandboxed iframe, and the doors (step 3). Contract: engineering/decisions/2026-09-24-code-package-contract.md §8.
done when — a user transform renders in the Studio and the CLI after consent, and is refused without it.
evidence  — the adversarial trio's findings folded in; the Studio sandbox proven on the real surface.
verify    — full adversarial trio (#25).
```

## Why PR #2314 stopped short of this (2026-09-24)

Not started, on purpose. §8 orders it last so no earlier phase waits on it. It needs the full
adversarial trio on what actually ships, and it starts with the helper toolkit that no
transform can run without. Until then, a package carrying `transform.js` is refused by name
at every door: the Library import, a `.lattice` project, `lattice packages add` and
`lattice packages export`. `packages-cli.test.js` and `lattice-file.test.ts` pin each refusal.

## The design pass (2026-09-24)

`engineering/decisions/2026-09-24-code-package-contract.md` is the design this phase starts
from. It recommends shipping the helpers INTO the sandbox as a frozen, versioned toolkit, and
running the CLI's sandbox in a Chromium page under a no-network content-security policy
instead of a Node child process. It leaves three decisions to the owner (§6 of that note).

**Owner decided (2026-09-25):** (1) toolkit shape A, a frozen copy inside the sandbox;
(2) the CLI runs code packages in a locked Chromium page, not a Node process. (3) Toolkit v1's
membership: the owner first picked the small v1, then reopened it (below), then DECIDED
(2026-09-25): **self-contained packages** — no shared toolkit; the export bundles, minifies and
freezes exactly the helpers each package uses, automatically, and the sandbox provides only
`measure`. The contract note's §8 records it and supersedes (1) and (3).

## Rethink: what the sandbox offers must cover what we let people export (owner, 2026-09-25)

**The owner's point.** If someone exports one of OUR components as a package (say the map chart)
and the sandbox lacks a helper it uses, our own chart fails as a package. So what the sandbox
provides has to be driven by what can be exported, not by a count of popular helpers. Minifying
cuts the bytes shipped, but not the other cost of a shared toolkit: every helper in it is a
permanent API promise and a security-review surface.

**Measured (2026-09-25, esbuild bundle + minify of each shipped `*.transform.js` with its own
require closure; `.scratch` script, re-derive with esbuild's metafile):**

| What | Source | Minified | Minified + gzip |
|---|---:|---:|---:|
| A typical chart (bar, line, funnel, pie, waterfall) | 220–260 KB | 37–47 KB | 15–18 KB |
| The heaviest ordinary charts (quadrant, gantt) | ~330 KB | 55–60 KB | 22–23 KB |
| `map` (carries its basemap data) | 401 KB | 207 KB | 74 KB |
| Simple components (kanban, progress, timeline-list) | 21–26 KB | ~5 KB | ~2 KB |
| Every helper any transform uses (42 files, one bundle) | 638 KB | 246 KB | 88 KB |

`contact`, `wifi` and `video` did not bundle for a neutral platform: they reach the shared QR-card
module, which pulls Node built-ins. Any design must say what happens to them.

**The three shapes to decide between** (put to the owner with pros, cons and a recommendation):

1. **Self-contained packages.** Export bundles, minifies and freezes exactly the helpers that
   package uses into the package itself. Export of any shipped component always works; no shared
   API is promised; the sandbox gets nothing from the host. Cost: 15–23 KB gzip per chart
   package (74 KB for a map), duplicated across packages, and a helper fix never reaches an
   already-exported package (true of a frozen toolkit too). A stranger's package would bundle its
   own helpers the same way, so the authoring story is "import from lattice, we bundle at export".
2. **Everything toolkit.** All helpers, minified once (~88 KB gzip), versioned. Export always
   works; packages stay small; every helper becomes a permanent promise and review surface.
3. **Small toolkit plus carried extras.** The core eight are shared and versioned; anything else
   a package uses is bundled into it as in (1). Mixed promise, mixed size.

**Decided (owner, 2026-09-25): shape 1, self-contained, decided automatically at export.** No
exporter-facing choice. See the contract note's §8.

## Step 1 done (2026-09-26): the CLI's locked page, proven

`lib/core/code-sandbox.js` (`launchSandboxBrowser`, `openSandboxPage`) makes 0 requests for 34
hostile vectors, and each of its two walls (its own always-offline browser, and the locked page)
does so alone; the control fires 33, and every vector is proven to have run. The contract note's
§4 says what the measurement and the adversarial trio changed (script by hash, not nonce; a
`data:` navigation; the transform in a sandboxed frame). Nothing runs a transform in it yet.

**Open for the owner: the OS sandbox.** The CLI launches Chromium with `--no-sandbox` (it runs as
root in containers, where Chromium's own sandbox cannot start), so the two walls are browser policy
over a renderer a Chromium exploit could escape, reading files or opening sockets directly. Options:
(a) code packages refuse to run unless Chromium's OS sandbox is on (safest; no code packages in a
root container or most CI); (b) run them anyway and say so in the consent text; (c) a separate
unprivileged user for the sandbox browser where the CLI can arrange one.

**Decided (owner, 2026-09-26): (c) where the CLI can arrange it, else (b).** Launch the sandbox
browser as a separate unprivileged user so Chromium's own OS sandbox can stay on; where that is not
possible, run anyway and say plainly in the consent text that this layer is missing. A minimum Chromium version
for code packages belongs with it: `CHROME_EXEC` accepts any system Chrome.

## Step 2 done (2026-09-26): the export step, proven on every shipped transform

`lib/packages/code-bundle.js` bundles, minifies and freezes each shipped transform as a
self-contained package; test/integration/export/code-package-parity.test.js runs all 29 in the
locked page with only `measure` and matches the in-repo render byte for byte on all 288 slides of
their gallery decks (206 transformed, 82 left alone). The QR components bundle through `qrcode`'s
browser entry, so none is excluded. The contract note's §8 has the measurement, what
"byte-identical" does and does not cover, and the slide shape (`{ html, index, idPrefix, baseUrl }`).

Carried into step 2 from the inversion lens on step 1: `measure` stays inside the page (no
`exposeFunction`); the page checks the output's type and length before it crosses the DevTools
protocol; a run past its time closes the sandbox (closing the context ends the renderer, so no
`Runtime.terminateExecution` is needed).

**Open for the owner (the inversion lens on step 2): does exporting a SHIPPED component as a
code package make sense?** §8 chose self-contained packages so that "export of any component we
ship always works". Two rules in the portable-packages note cut against it: an export carries
only the user's packages ("shipped packages ride with the engine", §4), and a user package may
not take a shipped name, so an import renames it `<name>-custom` (§3.7). The frozen chart knows
its layout name in minified code, so after that rename it matches nothing: the inversion lens
bundled `piechart`, renamed the slide's class to `piechart-custom`, and got the slide back
unchanged. The markup a frozen transform writes (classes, `data-*` attributes) is also read by
the receiver's current CSS and runtime, which are not frozen; `state-chart`'s edges are drawn by
the receiver's runtime. So the step proves the bundler and runner on real code, but a shipped
component exported this way would not draw on import. Options: (a) keep bundling shipped
components only as test data for the runner, and serve third-party authors, who bring a
self-contained module; (b) let an exported shipped component keep its name when the receiver's
engine has the same component (then it is not needed at all); (c) define a versioned markup
contract and a rename path a frozen transform can follow. Recommended: (a), with the parity test
kept as the runner's conformance test.

**Decided (owner, 2026-09-26): (a).** Shipped components are not exported as code packages. The 29
stay as the runner's conformance test (code-package-parity.test.js); code packages are for
components other people write, who bring one self-contained module. So `bundleCodePackage` is test
tooling, and the "bundler for an installed CLI" item below applies to a third-party author's bundle,
not to ours.

**The doors (step 3) must carry:**
- The transform's HTML is hostile after the sandbox too: it may contain NO remote reference at all,
  whatever `--allow-remote` says, dropped (not a placeholder) before it is spliced into the deck;
  a placeholder keeps the address, and a reader's "load" would send the slide data in it.
- It goes through `sanitizeSlideHtml` before it reaches the slide (contract §5), with the sanitizer
  itself timed and capped; a per-render time budget on top of the 2 s per slide.
- Strip terminal escapes from any console text the CLI prints, and escape a thrown message before
  it becomes the slide's note.
- Route a slide to a package by the same first-match rule the chart dispatch uses: a
  `radar quadrant` slide is radar's in the deck render, but the `quadrant` package, which knows
  only its own layout, would draw it as a quadrant (found by the checker; the journey gallery's
  `journey heatmap` slide is the same shape).
- Name the pipeline slot packages run in. Each shipped adapter has a place in
  `lib/transformers/registry.js`'s order (`contact` and `wifi` before `mastheadLift`, charts
  first), and the parity test captures each at its own place, so it would not notice a door that
  ran packages somewhere else.
- Run the parity comparison again after the door's `sanitizeSlideHtml`: the sanitizer changes the
  bytes of all 29 packages' output, and strips `target="_blank"` from the video poster link.
- **A bundler for an installed CLI.** esbuild is a development dependency; `bundleCodePackage`
  loads it only when it runs, and nothing calls it outside the test. When `lattice packages export`
  opens to code, either the shipped components ship prebuilt (a build step writes the 29 bundles)
  or esbuild becomes a runtime dependency. Prebuilt covers our own components at no install cost;
  a stranger's package needs the bundler. Decide with the door.

**Step 2 was done when (met 2026-09-26, above):** the export step bundles, minifies and freezes each code package's helpers; a test
exports every shipped transform as a package and runs it in the sandbox with only `measure`
provided, and it matches the in-repo render; the QR components (`contact`, `wifi`, `video`) are
bundled through a browser-safe path or excluded from code-package export with the reason stated.

