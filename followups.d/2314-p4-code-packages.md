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
where     — FIRST the helper toolkit a sandboxed transform receives (note §3.5: all 28 shipped transforms import engine helpers, and state-chart measures layout); then transform contract v1; consent pinned to a SHA-256; Studio sandboxed iframe; CLI child process under --permission.
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
membership: the owner first picked the small v1 (the eight most-used helpers plus `measure`), then
REOPENED it with a better test (below). Phase 6's first step, the CSP network-log proof, needs only
(2) and can start now; nothing that depends on (1) or (3) should be built until the rethink lands.

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

**Done when:** the owner has picked a shape; the contract note
(`engineering/decisions/2026-09-24-code-package-contract.md` §3 and §6) is updated to it; a test
proves every shipped transform can be exported as a package and run in the sandbox shape chosen
(QR components included, or explicitly excluded with the reason).

