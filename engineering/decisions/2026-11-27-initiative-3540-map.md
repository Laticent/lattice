---
status: proposed
summary: Map of initiative #3540 (licensing, document runtime, Desktop) and its 7 epics, checked against main at 4bf25e86; the 1.0 gate clash with rc.1, issue corrections for the owner, and a before/after-release sequence.
---

# Initiative #3540: map, checks and a before/after-release sequence

**Date:** 2026-11-27 · **Asked by:** the owner, through the command center ("understand the initiative
and epics in full and run the trio and make any corrections. then … sequence it two buckets, before and
after release") · **Desk:** 🧭 Initiative desk (Kirk) · **Pinned to:** `main` at `4bf25e86` ·
**Status:** proposed. Nothing on GitHub has been edited. Every issue change in §4 waits for the owner.

## 1. The one thing to know first

The initiative gates its mandatory work on **"Engine 1.0"**: all 18 public libraries on Apache-2.0, a
proven runtime boundary, counsel-reviewed rights, artifact CI gates and an independent review. The
release desk ships **`@laticent/lattice@1.0.0-rc.1` on Sun Nov 29** (npm `next`) and the real **`1.0.0`
(`latest`) about Dec 1–2** (#3449, owner ruling in #3518). None of the initiative's 1.0 gates can be met
by then: most need counsel, an archive nobody has committed yet, and months of engineering.

So either the npm 1.0.0 is not the initiative's "Engine 1.0", or the npm 1.0.0 waits. That is the
owner's call (§4, C1). This map assumes the first reading, which keeps the release plan the owner already
ruled on: **G1 becomes a named later gate, not the npm `1.0.0`.** If the owner picks the other reading,
§5 changes, and the release desk needs to know before Sunday.

What does not clash: the 12 libraries publish at **`0.1.0`**, not 1.0, so E2's "no 1.0 of public
libraries ahead of clearance" holds. Their first publish is under AGPL-3.0-only, which the initiative
keeps valid ("prior MIT/AGPL rights remain valid … retain historical versions").

## 2. What the initiative is

#3540 sets the licensing and architecture for Lattice 1.0 and the future Desktop app: open libraries
(Apache), a protected core (AGPL Studio and Engine), documents that play without the protected core, and
a free-for-companies proprietary Desktop. It has 7 epics and no child issues (`sub_issues` is empty on all
8; the epics list "candidate slices" in their bodies by design).

| Epic | Issue | In one line | Can start now? |
|---|---|---|---|
| E1 Rights | #3541 | Who owns what; counsel-reviewed terms; alternate grants for Desktop | Inventory yes; terms need counsel |
| E2 Apache libraries | #3542 | Relicense the 18 public libraries; fix package-local LICENSE/NOTICE | Audit yes; relicensing needs E1 |
| E3 Runtime boundary | #3543 | Split semantic resolution (Engine) from generic playback (runtime) | Inventory yes |
| E4 Fidelity | #3544 | Venue, narration, Guide, motion and adaptive layout survive the split | Baseline matrix yes |
| E5 Portable exports | #3545 | Finished HTML/Fluid/Marp outputs carry no protected code | Byte inventory yes |
| E6 Desktop editions | #3546 | Community (free) and Commercial (paid) proprietary Desktop | Host ADR draft yes |
| E7 Corporate intake | #3547 | SBOM, Black Duck/Xray scans, IT intake pack | Evidence schema yes; scans need tools |

The gate chain is A0 inventory → A1 provisional contract → A2 stop/go slice → A3 migration and rights
cutover → G1 Engine 1.0, with Desktop gates G2–G4 after it and independent of it.

**The source documents are missing.** The initiative names an owner-held archive
(`Lattice_Pre_1_0_Architecture_Complete.zip`: three memoranda, rev 1.1/1.1/1.0) as its first deliverable.
No file in the repo names it or its parts (grep for the archive and each memorandum filename: 0 hits).
Every epic cites "rev 1.1 D1–D7", "DT-01–15", "R-ADR1–11" from it. Until the owner hands it over, those
references cannot be checked, and the A0 gate cannot close. This is the first blocker (§5, A-1).

## 3. Claims checked against `main` at `4bf25e86`

| Claim (epic) | Verdict | Evidence |
|---|---|---|
| 19 library workspaces: 18 public + private Cenno, all AGPL-3.0-only (E2) | ✅ confirmed | `package.json` workspaces; each manifest's `license`; `docs/src/lib/cenno` is `private: true` |
| Segno Languages lives at `docs/src/lib/segno-markdown` (E2) | ✅ | publishes `@laticent/segno-languages` |
| "18 public libraries" all ship (implied, E2) | ⚠️ needs a word | 12 publish at rc.1; `.changeset/config.json` ignores 6: filo, fuoco, suono, tavola, vetrina, veduta. "Public" here means "not private", not "on npm" |
| `tools/library-prepack.js` copies the root LICENSE (E2) | ✅ | line 34. Correct while everything is AGPL; wrong the day one library is Apache |
| No `LICENSING.md` yet (E2) | ✅ | file absent |
| Peers: Fuoco/Vetrina React; Tavola lib0/Trystero/y-protocols/Yjs (E2) | ✅ | manifests (Tavola's are `peerDependencies`) |
| MediaBunny version to review (E2) | ✅ present | `packages/lattice/package.json`: `mediabunny` 1.60.0; its license is not checked here |
| "13 catalog entries" of plugins (E2) | ❌ refuted as written | `docs/src/content/catalog/plugins/` has 11 files; `lib/plugins/meta` and `lib/plugins/legend` exist in tree |
| LTT spec is CC-BY-4.0 (E2) | ✅ | `spec/LTT-1.0.md` line 10 |
| Every E3/E4/E5 source file cited exists | ✅ 21 of 22 | `GuideStage` (E4) matches no file; the Guide stage lives under `docs/src/components/studio/` under another name |
| `player-core.mjs` imports semantic resolvers (E3) | ✅ | imports delivery, typography, motion, pace, font and image policy, chart finish, color mode |
| Venue scale 1/1.15/1.3/1.5, meta lift 1/1/1.15/1.3, compact lift 1/1/1.15/1.14 (E4) | ✅ for 16:9 | `lib/core/resolve-venue.js` lines 70, 144, 147 |
| "Four venues" (E4) | ⚠️ incomplete | `VENUE_SCALE` also has `phone` and `tablet` rungs, and square/tall aspects have their own scales (line 90). A parity matrix of four venues misses them |
| Tauri note §License says MIT (E1, E6) | ✅ stale | `2026-05-10-tauri-exploration.md` line 258; the repo is AGPL-3.0-only |
| Desktop "planned, not built" (E6) | ⚠️ out of date | **PR #2354** (open, last push Oct 16) adds `desktop/` with Tauri 2, Linux and a Windows preview, and declares `license = "AGPL-3.0-only"` in `desktop/src-tauri/Cargo.toml`. Its decision note `2026-09-24-lattice-studio-desktop.md` exists only on that branch. No epic links #2354 |
| Six-month symmetry pledge (E1) | ✅ | `CONTRIBUTING.md` lines 23–24 |
| Output exception is v1.1 and covers only assets Lattice itself embeds (E5) | ✅ | `LICENSE-EXCEPTIONS` line 1 and §Limits |
| #1354 closed; #2728 merged; #2731, #3531, #3527, #2449, #1956, #2843 open (all) | ✅ | REST reads, 2026-11-27 |
| Home page and site licensing claims | ⚠️ see §5 B-1 | `comparison.astro` line 71: the Output Exception "frees every deck you make", broader than its §Limits (marp-cli output is not "embedded by Lattice itself", E5's own finding). Line 221: "The engine is at v1", not true until Dec 1–2. The AGPL lines on `index.astro`, `features.astro` and README are accurate today |

Not checked in this pass (UNVERIFIED, HARD RULE #23): MediaBunny's license; the LPM signing
implementation (E2); anything on a real device (iOS and Windows suites are dispatch-only, #3580).

### Open PRs that already touch the initiative

| PR | Epic | What it means here |
|---|---|---|
| #2354 desktop app | E6 | The existing Desktop candidate. Its AGPL `Cargo.toml` contradicts "official Desktop is proprietary". It must not merge as-is once the owner ratifies E6, and it is not in the rc.1 merge plan |
| #3362 coda, "an honest Marp kit" | E5 | Touches the Marp kit; E5's Marp audit should read it first |
| #430 Marp agent kit | E5 | Old; same area as the live-authoring kit E5 classifies |
| #2007 lens export | E4, E5 | Exports a reader view in the player; a new player surface for the E5 byte audit |
| #3480 deps audit (katex, marp-core) | E5, E7 | Changes shipped third-party versions; the E7 ledger starts after it |

## 4. Proposed issue corrections (the owner's call: shared state)

Put to the owner in one round. Nothing here is applied until the owner says so.

- **C1. What "Engine 1.0" means** (#3540 and all 7 epics). Recommend: rename the gate to a named later
  milestone (for example "G1: licensing 1.0") and say plainly that the npm `1.0.0` of Dec 1–2 ships under
  AGPL-3.0-only with libraries at `0.1.0`. Alternative: hold npm `latest` at rc until G1 (months).
- **C2. Link PR #2354 to E6 (#3546)** and correct "planned, not built": a Tauri candidate exists, declares
  AGPL, and its decision note is unmerged.
- **C3. Correct E2 (#3542)**: "13 catalog entries" → 11 on main; "18 public" → 18 non-private, 12 on npm
  at rc.1 (6 ignored by Changesets).
- **C4. Correct E4 (#3544)**: the venue matrix covers six rungs (adds phone, tablet) and per-aspect scales;
  `GuideStage` names no file.
- **C5. Triage labels** on all 8 cards. The triage gate flagged each as `needs:triage` and
  `needs:definition`. `.github/labels.json` has no licensing area and no epic type, so the proposal uses
  what exists: #3540, E3, E4, E5 `area:engine`; E1 `area:docs`; E2, E6, E7 `area:infra`; all `type:spike`
  (discovery comes first); E1 `priority:high` (it gates every relicensing), the rest `priority:medium`;
  plus the two Definition-of-Ready headings, pointing at this note.
- **C6. The source archive** (#3540, A0). Record as a blocker owned by the owner: the archive is not in
  the repo.

## 5. Sequence

Marks: 🔒 needs the owner (exported bytes, CI, a canonical doc, or externally visible) · ⚖️ needs counsel.

### Before release (lands by the freeze, Sat Nov 28 23:59 UTC, low risk)

Only work that changes no exported byte, no CI job and no canonical doc, and that is true at rc.1.

| # | Item | Epic | Risk | Marks |
|---|---|---|---|---|
| B-1 | **Home page and site licensing copy.** Make `comparison.astro` say what the Output Exception covers (not "every deck"); make "the engine is at v1" true at rc.1; check the same claims on `index.astro`, `features.astro`, README §License. No announcement of Apache, freeware or Desktop licensing: none is approved | E2 acceptance "website licensing claims consistent" | Low: copy only, docs site; screenshots at 1440/820/390 | 🔒 wording is externally visible and legal-adjacent: owner approves the words |
| B-2 | **This map note** lands | all | None | none |
| B-3 | **Stale-claim pointer** in `2026-05-10-tauri-exploration.md` §License: "stale: the repo is AGPL-3.0-only; Desktop licensing is open in #3541/#3546". A pointer, not a rewrite (E1 asks for exactly this) | E1, E6 | None | none |
| B-4 | **Check the rc.1 tarballs' license files** (verification only): pack the 12 libraries and the engine, confirm each carries `LICENSE` and `license: AGPL-3.0-only`. Evidence for E2's baseline; changes nothing | E2, E7 | None | Hand to the release desk; runs on its dry run |

### After release, ordered by what each one unblocks

| # | Item | Unblocks | Marks |
|---|---|---|---|
| A-1 | Owner hands over the source archive; land the three memoranda as canonical records | Every "rev 1.1" reference; gate A0 | 🔒 canonical docs ⚖️ |
| A-2 | E1 provenance inventory: contributors and origin per library, Engine, Studio, plugins, vendored assets (from git history and manifests) | E2 cutover, E6 grants, E7 ledger | discovery only; conclusions ⚖️ |
| A-3 | E2 per-library audit: dependency closure, generic vs Lattice policy (Calco, Trama, Fluido, Lente, Squadra first); LTT first in cutover order | E2 relicensing, E3 reuse | none for the audit |
| A-4 | E3 runtime inventory (player-core's semantic imports, loaders, CSS closure) together with the E4 baseline matrix (six venue rungs, narration, Guide, motion, pagination) | A1 provisional contract | none |
| A-5 | E5 byte inventory of the actual player, Fluid and Marp outputs; read #3362 and #2007 first | Artifact gate design, E7 | none for the audit |
| A-6 | E6 host and edition ADR, reconciling #2354 (AGPL `Cargo.toml`, unmerged decision note) with the proprietary-Desktop decision | G1 Desktop architecture, E7 plan | 🔒 ⚖️ |
| A-7 | E7 evidence schema and SBOM format; record scanner access (Black Duck, Xray) as a blocker | E7 public-artifact gates | 🔒 paid tooling |
| A-8 | Prepack per-package LICENSE/NOTICE, `LICENSING.md`, artifact CI gate | E2/E5 cutover | 🔒 CI ⚖️ |
| A-9 | A2 stop/go slice → A3 migration and rights cutover → G1 | Licensing 1.0 | 🔒 ⚖️ |

## 6. Trio findings

Folded in after the review; see the PR.
