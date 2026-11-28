---
status: in-progress
summary: Map of initiative #3540 (licensing, document runtime, Desktop) and its 7 epics, checked against main at 4bf25e86 by the trio; the 1.0 gate clash with rc.1, owner decisions, and a before/after-release sequence.
---

# Initiative #3540: map, checks and a before/after-release sequence

**Date:** 2026-11-27 · **Asked by:** the owner, through the command center ("understand the initiative
and epics in full and run the trio and make any corrections. then … sequence it two buckets, before and
after release") · **Desk:** 🧭 Initiative desk (Kirk) · **Pinned to:** `main` at `4bf25e86` ·
**Status:** in progress. The owner decided C1 and the Sunday publish on 2026-11-27 (§0).

## 0a. The owner's decisions, 2026-11-28 (supersede §0's D1 and Sunday rows)

After the trio reviewed the initiative's *strategy* (red-team, inversion, checker; a second run, this
time on the direction rather than on this map), the owner decided in this desk's question tool at about
03:40 UTC. Earlier typed: "i would rather ship now than latter".

| Question | Answer |
|---|---|
| When does the release go out? | **As soon as the Apache library PR merges.** rc.1 targets Sun Nov 29 and may float a day or two. This reverses D1 C |
| Which libraries go Apache? | **16 of 18.** Calco (editable PPTX/ODP) and Trama (graph layout) stay AGPL-3.0-only as product features. Cenno stays private |
| Do E3–E7 still block 1.0? | **No.** The runtime split (E3–E5) waits for a real adopter or scanner rejecting an exported deck; Desktop and intake (E6–E7) wait for a Desktop candidate. #3540 now says so at the top |
| Counsel review? | **Not required** (typed: "I don't need a lawyer") |

Why, from the trio: the Output Exception already frees ordinary exported decks, and v1.2 (#3598) adds
Marp renders. The split covers only edge cases (an edited or patched deck, a scanner fingerprint).
Nothing in the release plan requires it. Holding npm for months costs all adoption.

## 0. The owner's decisions (2026-11-27)

Typed in this desk's session; the owner's verbatim words are recorded on [PR #3587](https://github.com/Laticent/lattice/pull/3587#issuecomment-7230353813). The options were put in plain English, with pros and cons.

| # | Question | Answer |
|---|---|---|
| D1 | What happens to 1.0? | **C: hold npm 1.0.0 until the Apache work is done.** The initiative's "before 1.0" gates stand as written. The Dec 1–2 date is off |
| — | Does Sunday's rc.1 publish still happen? | **No: publish nothing yet.** No rc.1, no library publish and no tag moves on Sun Nov 29. Each library's first public version can be Apache (question tool, about 23:25 UTC) |
| D2 | Fix the over-claiming license wording? | **A: one session drafts accurate README §License and `/comparison` wording; the owner approves it.** No freeze deadline, since nothing publishes |
| D3 | What starts next? | **A: after Sunday, start A-1, A-4 and A-5 in parallel** (rights inventory, the license-file CI gate, the runtime, library and byte inventories) |
| C2–C6 | Issue corrections | "fix everything that is inaccurate": applied to #3542 (plugin count, 12 of 18 on npm), #3544 (six venue rungs) and #3546 (link to #2354). No labels or holds added |

The release desk (#3449) has both release answers. With 1.0 held, "before release" in §5 now means before the
held 1.0, not before Sunday. §1 below is the analysis as written before these decisions.

## 1. The one thing to know first

The initiative gates its mandatory work on **"Engine 1.0"**: all 18 public libraries cleared, on
Apache-2.0 and "released/verified"; a proven runtime boundary; counsel-reviewed rights; artifact CI gates;
an independent review. E2 links "Engine package" to `packages/lattice/package.json`, so the text means the
npm `@laticent/lattice`.

The release desk ships `@laticent/lattice@1.0.0-rc.1` on **Sun Nov 29** and the real `1.0.0` about
**Dec 1–2** (#3449; the owner's ruling in #3518, dated Nov 25). None of the initiative's 1.0 gates can be
met by then. Six of the 18 libraries are not even published (`.changeset/config.json` ignores them).

The initiative is the **newer** word (founder decisions of Nov 26, filed Nov 27), and it names its own way
out: "unresolved mandatory gates block 1.0 absent an explicit new owner ADR and appropriate legal review",
and "no release by assumption". So this note does not pick a reading. The choice is C1 in §4, and it is
due **at the freeze, Sat Nov 28 23:59 UTC**, not on Dec 1–2, because Sunday is the irreversible moment:

- The 12 libraries first-publish on Sunday at `0.1.0` under AGPL-3.0-only. A published version can never
  be replaced (`2026-10-07-first-npm-release.md` line 377). Corporate scanners record the first license
  they see, and corporate intake is E7's whole goal. Whether npm also points `latest` at a first publish
  made under `next` is UNVERIFIED.
- The README's §License ships inside the engine tarball (`tools/stage-engine-package.js` copies it), so
  its wording is frozen into rc.1 and 1.0.0 (§5, B-1).
- 1.0.0 puts the engine's `./runtime` and `./engine` exports under semver. E3 moves semantic resolution
  out of `player-core`, which will likely need an engine 2.0. "Runtime" will also name two things: the
  AGPL `@laticent/lattice/runtime` and the planned Apache document runtime.

What holds after Sunday: no library reaches 1.0 ahead of clearance, because a guard already rejects a
`major` changeset on a 0.x library (`2026-10-07-first-npm-release.md` lines 363–365).

What is cheaper than it looks: the GitHub contributor list is saden1 (2,727 commits), the `claude`
account (475), and bots. There are no outside humans, and `CONTRIBUTING.md` adopts SQLite's
"Open-Source, not Open-Contribution". The rights inventory is days of work. Counsel's time is the unknown, and so is the status
of AI-written code (⚖️).

## 2. What the initiative is

#3540 sets the licensing and architecture for Lattice 1.0 and the future Desktop app: Apache libraries,
an AGPL protected core (Studio and Engine), documents that play without the protected core, and a
free-for-companies proprietary Desktop. It has 7 epics and no child issues (`sub_issues` is empty on all
8; the epics keep "candidate slices" in their bodies by design).

| Epic | Issue | In one line | Can start now? |
|---|---|---|---|
| E1 Rights | #3541 | Who owns what; counsel-reviewed terms; alternate grants for Desktop | Inventory yes; terms need counsel |
| E2 Apache libraries | #3542 | Relicense the 18 public libraries; package-local LICENSE/NOTICE | Audit yes; relicensing needs E1 |
| E3 Runtime boundary | #3543 | Split semantic resolution (Engine) from generic playback (runtime) | Inventory yes |
| E4 Fidelity | #3544 | Venue, narration, Guide, motion and adaptive layout survive the split | Baseline matrix yes |
| E5 Portable exports | #3545 | Finished HTML, Fluid and Marp outputs carry no protected code | Byte inventory yes |
| E6 Desktop editions | #3546 | Community (free) and Commercial (paid) proprietary Desktop | Host ADR draft yes |
| E7 Corporate intake | #3547 | SBOM, Black Duck and Xray scans, IT intake pack | Evidence schema yes; scans need tools |

The gate chain is A0 inventory → A1 provisional contract → A2 stop/go slice → A3 migration and rights
cutover → G1 Engine 1.0. Desktop gates G2–G4 come after G1 and do not block it.

**The source documents are missing.** The initiative names an owner-held archive
(`Lattice_Pre_1_0_Architecture_Complete.zip`: three memoranda) as its first deliverable. No file in the
repo names it or its parts (0 grep hits). Every epic cites "rev 1.1 D1–D7", "DT-01–15" or "R-ADR1–11"
from it; until the owner hands it over, none of those references can be checked.

## 3. Claims checked against `main` at `4bf25e86`

Verdict column: was the epic's claim right, not whether the thing it describes is fine.

| Claim (epic) | Verdict | Evidence |
|---|---|---|
| 19 library workspaces: 18 public + private Cenno, all AGPL-3.0-only (E2) | ✅ right | root `package.json` workspaces; each manifest's `license`; Cenno `private: true` |
| Segno Languages lives at `docs/src/lib/segno-markdown` (E2) | ✅ right | publishes `@laticent/segno-languages` |
| "All 18 public libraries … released/verified" before 1.0 (#3540) | ⚠️ unmet | 12 libraries publish at `0.1.0` next to engine rc.1; 6 are ignored (filo, fuoco, suono, tavola, vetrina, veduta); `tools/release-packages.js` `PUBLISH_SET` lines 34–48 |
| `tools/library-prepack.js` copies the root LICENSE (E2) | ✅ right | line 34. Correct while all is AGPL; wrong the day one library is Apache |
| No `LICENSING.md` (E2) | ✅ right | absent |
| Peers: Fuoco and Vetrina React; Tavola lib0, Trystero, y-protocols, Yjs (E2) | ✅ right | manifests |
| MediaBunny to review (E2) | ✅ right | 1.60.0, **MPL-2.0**, an engine dependency only (`lib/export/video*.mjs`); no library depends on it |
| "Reconcile 13 catalog entries and in-tree Meta/Legend" (E2) | ⚠️ recount | `docs/src/content/catalog/plugins/` has 11 files (also at the epic's pin `e0598ab`); 11 + meta + legend = 13; `lib/plugins/` has 16 plugin folders |
| LTT spec is CC-BY-4.0 (E2) | ✅ right | `spec/LTT-1.0.md` line 10. The packed `@laticent/ltt` carries `ltt.schema.json` and no CC-BY notice; whether the schema counts as spec is open |
| Every source path cited in E3, E4, E5 exists | ✅ right | all resolve; `GuideStage` is a type in `docs/src/components/studio/guide-conductor.ts` line 70 |
| `player-core.mjs` imports semantic resolvers (E3) | ✅ right | lines 27–39: delivery, typography, motion, pace, font and image policy, chart finish, color mode |
| Venue scale 1/1.15/1.3/1.5, meta lift 1/1/1.15/1.3, compact lift 1/1/1.15/1.14 (E4) | ✅ right for 16:9 | `lib/core/resolve-venue.js` lines 70, 144, 147 |
| "All four venues" (E4) | ⚠️ incomplete | `VENUE_SCALE` also has `phone` and `tablet`; square, tall and strip have their own scales (lines 88–92) |
| Tauri note claims MIT (E1, E6) | ✅ right, still stale | `2026-05-10-tauri-exploration.md` lines 258, 318, 2487; the repo is AGPL-3.0-only |
| Desktop "not assumed built … verify current state" (E6) | ✅ right | `main` has no `desktop/`. **PR #2354** (open, last push Oct 16, unmergeable as is) adds one with Tauri 2 and declares `license = "AGPL-3.0-only"` (`desktop/src-tauri/Cargo.toml` line 6). Its decision note `2026-09-24-lattice-studio-desktop.md` is only on that branch. No epic links #2354 |
| Six-month symmetry pledge (E1) | ✅ right | `CONTRIBUTING.md` lines 23–24 |
| Output exception v1.1 covers only assets Lattice itself embeds (E5) | ✅ right | `LICENSE-EXCEPTIONS` line 1, §Limits from line 23; `2026-08-04-marp-render-output-exception.md` is blocked on the owner for exactly this |
| #1354 closed; #2728 merged; #2731, #3531, #3527, #2449, #1956, #2843 open | ✅ right | REST reads, 2026-11-27 |

**Licensing copy that over-claims today** (not an epic claim, but E2 asks for consistent site claims):
`README.md` lines 469–475 ("every deck you render is yours outright … publishing a deck on a web server
imposes nothing on you") and `/comparison` (`docs/src/pages/comparison.astro` line 71, the exception
"frees every deck you make") both say more than §Limits grants: a modified engine is excluded, and
`marp --html` output is not "embedded by Lattice itself". `comparison.astro` line 221 ("The engine is at
v1") is false until 1.0.0. The AGPL lines on the home page (`index.astro` lines 208, 439) and
`features.astro` are accurate. No page claims Apache, freeware or a Desktop license.

Not checked (UNVERIFIED, HARD RULE #23): the LPM signing implementation (E2); npm's `latest` behavior on a
first `next` publish; anything on a real device (iOS and Windows suites are dispatch-only, #3580).

### Open PRs that already touch the initiative

| PR | Epic | What it means here |
|---|---|---|
| #2354 desktop app | E6 | The existing Desktop candidate, AGPL-declared. It also edits the top of the Tauri note (B-3 conflicts with it). Not in the rc.1 merge plan (no mention in #3449) |
| #3362 coda, "an honest Marp kit" | E5 | Touches the Marp kit; E5's Marp audit reads it first |
| #430 Marp agent kit | E5 | Same area as the live-authoring kit E5 classifies |
| #2007 lens export | E4, E5 | A new player surface for the E5 byte audit |
| #3480 deps audit (katex, marp-core) | E5, E7 | Changes shipped third-party versions; the E7 ledger starts after it |

## 4. Owner decisions and proposed issue corrections

All shared state; nothing is applied until the owner says so.

- **C1. What "Engine 1.0" means, and what publishes Sunday.** Due at the freeze.
  - (a) **Re-scope by owner ADR** (the initiative's own route; counsel reviews it). npm `1.0.0` ships as
    the AGPL baseline, and the 1.0.0 notes say so in one owner-approved line. G1 moves to a named future
    engine version: the major that ships the Apache runtime. This also covers E1 D6/D7's "baseline tag and
    license-change policy before 1.0" as a short owner statement, not licensing text. *Recommended:* it
    keeps the release, and the runtime work truly takes months.
  - (b) **Hold npm `latest` at rc** until G1. Months, set by E3–E5 and counsel, not by rights history.
  - (c) Either (a) or (b), plus **narrow Sunday's library publish**: Lente is the one published library
    the engine does not need (`2026-10-07-first-npm-release.md` line 190), and it is on E2's
    policy-leakage list. The other 11 are engine dependencies and must ship with it.
- **C2. Link PR #2354 to E6 (#3546)** as the unmerged, AGPL-declared candidate E6 asks to verify, and hold
  it (do-not-merge) until the E6 host ADR. No wording change to E6.
- **C3. E2 (#3542) wording:** the plugin count is 11 catalog files + meta + legend; "18 public" means "not
  private", and 12 of them are on npm at rc.1.
- **C4. E4 (#3544) wording:** the venue matrix covers six rungs (adds phone, tablet) and per-family scales.
- **C5. Triage** the 8 cards, which the gate flagged `needs:triage` and `needs:definition`: `type:spike`
  on all; area `area:engine` (#3540, E3–E5), `area:docs` (E1), `area:infra` (E2, E6, E7); the two
  Definition-of-Ready headings, pointing at this note. Priority is left to the owner. There is no
  licensing area and no epic type in `.github/labels.json`; adding them is a separate owner call.
- **C6. Record the missing archive** on #3540 as a blocker the owner owns.

## 5. Sequence

Marks: 🔒 needs the owner (exported or published bytes, CI, a canonical doc, licensing text, or
externally visible) · ⚖️ needs counsel.

### Before release (by the freeze, Sat Nov 28 23:59 UTC)

| # | Item | Epic | Marks |
|---|---|---|---|
| B-0 | **C1 answered**; under (a), the owner's ADR lands before 1.0.0 | all | 🔒 ⚖️ |
| B-1 | **Licensing copy that ships Sunday.** README §License (in the tarball) and `/comparison` say only what the Output Exception grants; "the engine is at v1" becomes true under either C1 answer. Wording follows the owner's choice in `2026-08-04-marp-render-output-exception.md` (extend the grant, or narrow the claim). The home page's AGPL lines stay; no Apache, freeware or Desktop claim. Screenshots at 1440, 820, 390 | E2, E5 | 🔒 (npm README, legal wording) ⚖️ |
| B-2 | **This note** lands, with C1 left as a choice | all | none |
| B-3 | **Stale MIT pointer** in the Tauri note (lines 258, 318, 2487): "Superseded: the repo is AGPL-3.0-only; Desktop licensing is under #3541/#3546." Coordinate with #2354, which edits the same file | E1, E6 | 🔒 licensing text |
| B-4 | ✅ **Done 2026-11-27** by the release desk (`npm pack --dry-run` of all 13 packages from the rc.1 release commit): every library carries `LICENSE` and `license: AGPL-3.0-only`; segno-languages ships `LICENSE.markdown-it.md`; lastra ships `decode/LICENSE.libjpeg-turbo.md` (with the IJG terms); the engine ships `LICENSE`, `LICENSE-EXCEPTIONS`, `dist/THIRD-PARTY-LICENSES.txt` and the vendor notices. The packed README carries the B-1 line | E2, E7 | none |

### After release, ordered by what each one unblocks

A-1 to A-5 run in parallel. The epics call their links "completion dependencies, not start-to-start
blockers", and A-1 waits on the owner, not on work.

| # | Item | Unblocks | Marks |
|---|---|---|---|
| A-1 | E1 provenance inventory: contributors and origin per library, Engine, Studio, plugins, vendored assets (git history and manifests). Records the AI-authorship question | E2 cutover, E6 grants, E7 ledger | conclusions ⚖️ |
| A-2 | Owner hands over the archive; land the three memoranda as canonical records | every "rev 1.1" reference | 🔒 ⚖️ |
| A-3 | Engage counsel on the E1 rights model and terms: the longest lead time in the initiative | A-9, A-10, E6 grants | 🔒 ⚖️ |
| A-4 | **Artifact license gate** in CI: every packed tarball carries its LICENSE and notices. Needs no counsel; protects the weekly releases from Tue Dec 1 | E2, E5, E7 public-artifact gates | 🔒 CI |
| A-5 | E3 runtime inventory (player-core's semantic imports, loaders, CSS closure, the `./runtime` / `./engine` / `./css` exports with a "breaks semver?" column), with the E4 baseline matrix (six venue rungs, narration, Guide, motion, pagination). E2 per-library audit (Calco, Trama, Fluido, Lente, Squadra first; LTT first in cutover). E5 byte inventory (read #3362, #2007 first) | A1 provisional contract | none |
| A-6 | E6 host and edition ADR, reconciling #2354 | G1 Desktop architecture, E7 plan | 🔒 ⚖️ |
| A-7 | E7 evidence schema and SBOM format; scanner access (Black Duck, Xray) recorded as a blocker | E7 gates | 🔒 paid tooling |
| A-8 | A1 provisional contract and budgets (E3 + E4) | A2 slice | budgets 🔒 |
| A-9 | Per-package LICENSE/NOTICE in prepack, `LICENSING.md`: a **precondition of the first Apache publish** of any library | E2 cutover | 🔒 ⚖️ |
| A-10 | A2 stop/go slice → A3 migration and rights cutover → independent review → G1 | Engine G1 | 🔒 ⚖️ |

## 6. Trio findings and what changed

Run on the draft at `9ca64128` (red-team, inversion, checker; HARD RULE #25).

- **The draft picked C1's answer and called the older ruling binding** (red-team, inversion). C1 is now a
  three-way choice through the initiative's own ADR route, due at the freeze, with Sunday named as the
  irreversible moment (§1).
- **README §License ships in the tarball and over-claims** (red-team). Moved into B-1, marked 🔒 ⚖️; the
  draft had called it accurate.
- **`GuideStage` exists** as a type (red-team, checker); E6 was right as written (red-team, checker).
  Both false corrections dropped.
- **Invented label values** (checker, red-team). C5 names only real labels and leaves priority to the
  owner.
- **B-3 is licensing text** that conflicts with #2354 and missed two MIT lines (red-team). Marked 🔒.
- **The after-release order read as a queue**, missed counsel, A1 and the independent review, and bundled
  a CI gate with relicensing (red-team, inversion). Reordered, split, marked parallel.
- **Added facts:** the major-on-0.x guard, the contributor list, Lente, the `./runtime` semver cost
  (inversion); MediaBunny MPL-2.0 and the tarball notices (red-team).
- Not adopted: a pause on outside contributions to library folders (inversion). `CONTRIBUTING.md` already
  closes contribution, so it adds nothing today.
