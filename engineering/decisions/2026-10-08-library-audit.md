---
status: in-progress
summary: Audit of every library in the repo — which nine publish to npm, which are internal, what bar a published library owes and where each stands; the home page now links all nine.
---

# Library audit (2026-10-08)

**The answer.** Nine libraries are built to publish to npm on their own: LTT, Cadenza,
Vetrina, Segno, Trama, Calco, Lente, Suono and Tavola. The owner ruled on 2026-10-07 that all
nine ship with `@laticent/lattice` 1.0.0 (`2026-10-07-first-npm-release.md` §2). A tenth,
**Anima**, is fenced off like a library but has no package and no build, so it is internal
today. Everything else under `docs/src/lib/` is Studio or website code, not a library.

The nine all clear the **mechanical** bar since #2595: each builds, packs and typechecks as an
outside project would install it. Before they publish, three items are still open: independent
versioning (Changesets, slice C), the license call, and a public page for LTT and Tavola. Before
this audit, the home page linked none of the nine, and the header's Libraries menu missed LTT
and Tavola. This change fixes both and adds a test so a new library cannot go unlisted again.

## 1. The inventory

Measured on `main` at `40821be1`. A "library" here means a folder under `docs/src/lib/` that an
import-boundary gate in `tools/check-ownership.js` stops from importing anything outside its
folder. Ten folders meet that definition.

| Library | Package | What it does | Who uses it inside Lattice | Public page |
|---|---|---|---|---|
| LTT | `@laticent/ltt` | The word-timing track format: types, schema, validator, cursor | `lib/core`, HTML and video export, Cadenza, Vetrina | README only |
| Cadenza | `@laticent/cadenza` | Turns narration text into timed caption words | `lib/core`, Studio, Playground | `/cadenza` |
| Segno | `@laticent/segno` | Grammar engine that refuses non-linear grammars; the inline notation | `lib/core`, the linter, the QR card | `/segno` |
| Trama | `@laticent/trama` | Graph layout and elbow line routing | flowchart, state chart, hub-spoke | `/trama` |
| Calco | `@laticent/calco` | Rendered slides to editable `.odp` / `.pptx` | `lib/export`, CLI, Studio export | `/calco` |
| Vetrina | `@laticent/vetrina` | Self-driving product tour that never fakes a click | Studio tours and lessons | `/vetrina` |
| Lente | `@laticent/lente` | Reader lenses that only show human-approved views | Studio | `/lente` |
| Suono | `@laticent/suono` | Reliable audio playback and a sequence scheduler | Studio, narration | `/suono` |
| Tavola | `@laticent/tavola` | Peer-to-peer live editing over a shared link | Studio Live panel | README only |
| Anima | none | Motion scenes as data, compiled for anime.js | Studio motion, `lib/export`, the anima plugin | none |

**Two groups among the nine, and the order of publishing depends on them.** The first five
(LTT, Cadenza, Segno, Trama, Calco) are `dependencies` of `@laticent/lattice` and are inlined
into its CLI bundle (`tools/build-emulator.js` `INLINE_PACKAGES`). They must reach npm before or
with Lattice, or `./engine` fails to resolve them. The other four (Vetrina, Lente, Suono,
Tavola) only power the website and the Studio. Lattice's npm package does not need them, so they
can publish on their own schedule.

**Internal code that looks like a library and is not one.** These folders sit beside the
libraries but are app code. They import from the Studio or join two libraries together, and no
gate fences them. They never publish and owe none of the bar in §3.

| Folder | What it is |
|---|---|
| `vetrina-exemplars/` | The task-board host that stress-tests Vetrina on a real browser |
| `vetrina-narration/` | The join between Vetrina and Cadenza. Both libraries are fenced, so the join lives above them |
| `code-packages/` | The Studio's runner for code packages |
| `compose/` | The Studio editor's document model |

## 2. What "designed to publish" means, and the evidence for each

A library is designed to publish when it has all three of these:

1. **A fence.** A boundary gate in `tools/check-ownership.js` (`check<Name>Boundary`) fails the
   build when the folder imports anything outside itself. All ten folders above have one.
2. **A package.** A `package.json` in the folder with a scoped name, `exports`, and a builder in
   `tools/build-<name>-lib.js`, listed in the root `workspaces`. The nine have this. Anima does
   not.
3. **An owner ruling to publish.** The nine have one (2026-10-07). Anima has none.

So the nine are designed to publish and are cleared to. **Anima was designed to spin off**
(`2026-07-17-anima-animation-library.md` says so, and its gate enforces it). Then
`2026-09-02-frame-model-for-motion.md` replaced its design, and it never got a package. Its own
README opens with a "SUPERSEDED" banner. It is internal until the owner decides otherwise (§6).

## 3. The bar, and where each library stands

**Yes, the nine need the full bar.** npm lets an author unpublish a version freely only within
72 hours. After that, unpublishing needs no dependents, low downloads and a single owner, and a
version number can never be reused. Once outside projects build on a version, it is effectively
permanent. That makes publishing the "irreversible or externally visible"
row in CLAUDE.md's second filter. The internal folders in §1 ride on Lattice's own gates and owe
nothing more.

The bar collects what the existing contracts already ask of a published library. Each line
names the check that enforces it.

| # | A published library owes | Enforced by | LTT | Cad | Seg | Tra | Cal | Vet | Len | Suo | Tav | Anima |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Imports nothing outside its folder | boundary gate, `build:check` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Builds ESM + CJS + `.d.ts` from the packed source | `prepack` → `tools/library-prepack.js` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| 3 | `npm publish --dry-run` is clean | measured in #2595 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| 4 | Typechecks in an outside `nodenext` project | `package-nodenext-types.test.js` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| 5 | A README fit for npmjs.com (install, license, absolute links) | #2595 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ superseded |
| 6 | Its own tests (files) | unit suite | 5 | 10 | 11 | 4 | 6 | 17 | 8 | 6 | 2 | 10 |
| 7 | A full trio over the library's code on record | HARD RULE #25 | design only | 07-18 | partial | per change | 10-06 | 07-18 | 07-18 | 07-18 | 10-06 | ✗ |
| 8 | A public page the site links to | `nav.test.ts` (this change) | README | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | README | ✗ |
| 9 | Versions on its own line | Changesets, slice C | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 10 | A license the owner chose for outside use | owner, release plan §4 | open | open | open | open | open | open | open | open | open | — |

How to read the gaps:

- **Row 9 blocks every library.** Without Changesets, `tools/release.js` versions one package,
  so none of the nine can release on its own line. That is slice C of the release plan and
  followup `2595-p1-changesets-release-pipeline.md`.
- **Row 10 is the owner's call and the cheapest to change now.** All ten are
  `AGPL-3.0-only`, which keeps them out of closed-source apps
  (`followups.d/2556-p3-calco-license-and-types-for-outside-users.md`). Changing a license
  before the first publish costs an edit. After it, the old versions stay AGPL forever.
- **Row 7 asks whether the full adversarial trio (red team, inversion, independent checker) has
  reviewed the library's code as a whole.** Calco and Tavola got it on the first cut, which was
  the whole library (`2026-10-06-calco-office-export-library.md`,
  `2026-10-06-studio-live-collaboration.md`). The four July libraries got it together
  (`2026-07-18-library-adversarial-trio-backlog.md`). The other three have reviews of a part:
  - **LTT** — a trio on the design note's draft, not on the code
    (`2026-09-24-lattice-timing-track.md`).
  - **Segno** — a red team and four checkers on the engine, with no inversion
    (`2026-09-28-segno-unified-inline-notation.md`).
  - **Trama** — a trio on each of two changes: the radial layout
    (`2026-10-05-trama-radial-layout.md`) and the crossing-aware wrap
    (`2026-10-06-trama-crossing-aware-wrap.md`). The trio its own note planned for its second PR
    (`2026-09-27-trama-graph-chart-library.md` §review tier) has no record of running.

  A library published for strangers to build on is "high blast radius" under HARD RULE #25, so
  the publish slice gives LTT, Segno and Trama a whole-library trio before their first version.
  (An earlier draft of this row said "not found" for all three. The fact-checker on #2609 found
  the partial reviews above.)
- **Row 8 for LTT and Tavola** is a README link, not a demo page. That is honest: LTT is a data
  format, and Tavola needs two browsers to show anything. None of the nine has a section in the
  Starlight docs. Vetrina's is followup `2371-p2-vetrina-demo-and-docs-section.md`.
- **Types point at source on purpose.** Each package's `exports` names `./index.ts` first, so
  a consumer typechecks the source. `package-nodenext-types.test.js` proves the packed source
  typechecks under nodenext. No test asserts the ordering, so it is a convention, not a gate. It
  works, but a consumer with stricter settings than ours can hit errors in our files.
  Followup 2556 asks for `.d.ts` first. It belongs in slice C, not here.

## 4. What this change fixes

- **`docs/src/lib/nav.mjs` lists all nine.** LTT and Tavola join the Libraries menu, the mobile
  menu, the command palette and the Starlight sidebar. Both link to their README on GitHub and
  carry an empty `match`, so no route of ours lights them up. Each entry now carries its `pkg`
  name.
- **The home page has a Libraries section** (`#libraries`, after the palette showcase): one card
  per library, rendered from the same `librariesNav` list, so the page and the menu cannot
  disagree. The footer links to it.
- **`nav.test.ts` fails when the nav and the root `workspaces` disagree**, by package name. That
  drift is how LTT and Tavola, both workspaces with packages, went unlisted.

Screenshots at 1440, 820 and 390 px, plus 820 px in dark mode, are on the PR.

## 5. Stale records this audit found

These notes say something the code no longer does. They are recorded here rather than edited,
so this PR stays one change.

- `2026-07-18-library-adversarial-trio-backlog.md` is `in-progress` and lists D1 (Lente's
  `approvalHash` could be forged) and D2 (no real ESM build) as open. Both are fixed:
  `lente/project.ts` hashes a `JSON.stringify` pre-image, and every library's `dist/` ships
  `index.mjs`.
- `2026-07-08-library-shape-cadenza-vetrina.md` is still `proposed`. #2595 shipped the shape it
  proposes, for all nine libraries.
- `docs/src/lib/anima/README.md` opens with a SUPERSEDED banner over its whole design.

## 6. Owner rulings (2026-10-08)

1. **Anima stays internal for 1.0.** It does not publish. Its boundary gate stays, so it can
   still be split out later.
2. **Tavola gets a demo page** before it publishes
   (`followups.d/2609-p2-tavola-demo-page.md`). **LTT is still open:** the owner asked for a
   plain explanation first. Until then, LTT's card links to its README.
3. **LTT, Segno and Trama get the adversarial trio before their first npm version**
   (`followups.d/2609-p1-library-trio-before-publish.md`). That is three libraries, three agents
   each: nine agents.
4. **License** stays open as the release plan's §4 default. The call applies to all nine at once.
