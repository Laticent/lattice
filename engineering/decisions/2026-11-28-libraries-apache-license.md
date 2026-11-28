---
status: in-progress
summary: 14 of the 18 public libraries move from AGPL-3.0-only to Apache-2.0 before any first publish, on the owner's word; the rights and policy-leakage evidence behind it; Calco and Trama stay AGPL as product features, and Lente and Fluido as Lattice design policy.
---

# The public libraries move to Apache-2.0

**Date:** 2026-11-28 · **Epic:** E2 [#3542](https://github.com/Laticent/lattice/issues/3542) of
initiative [#3540](https://github.com/Laticent/lattice/issues/3540) · **Actor:** Kirk ·
**Pinned to:** `main` at `af35eb30` · **Map:** `2026-11-27-initiative-3540-map.md` §5 A-5, A-9.

## 1. The authority

The owner, who holds the copyright, typed in the 🧭 Initiative desk session on Sat Nov 28, about
01:30 UTC: "I don't need a lawyer. the change to apache is sound? reasonable?", then "we should
start a desk or session to switch the libraries to apache". That approves the relicensing without
counsel review, and it replaces the initiative's "counsel/owner approval" for this step. Nothing
is on npm yet (D1 in the map's §0 holds npm 1.0.0), so each library this note moves has Apache-2.0
as its first public version.

**The owner narrowed it** in the same desk session's question tool at 03:24 UTC: "16 Apache; Calco,
Trama stay AGPL". The question called Calco (editable PowerPoint) and Trama (diagram layout) "real
product features" and the other 16 "generic building blocks". So Calco and Trama stay
AGPL-3.0-only. That question did not raise Lente's policy finding (§3), so it went to the owner
on its own at 03:47 UTC, in the same tool: "Keep Lente AGPL". At about 06:30 UTC, in this session's question tool, the owner
also chose "Keep Fluido AGPL" (D2) and "Reword now, in this PR" for the inbound-license wording (D3).
So 14 libraries move.

This note is evidence, not legal advice.

## 2. Rights check: who wrote each library

Method: for every file tracked in each library folder, `git log --follow` (renames included, on a
full-history fetch of `main`), collecting the author, the committer and every `Co-authored-by`
trailer.

| Result | Libraries |
|---|---|
| Authors: Sharmarke Aden only. Committer: GitHub (squash merges). Co-author: Claude | all 19 library folders |
| Also authored and committed directly by the `Claude` account | `markup` |
| Any other human | **none** |

Every file's first commit is in 2026, so each `NOTICE` reads "Copyright 2026".

**Third-party code** (a grep for copyright, SPDX, "ported from", "adapted from" and "based on" lines,
and for license files, across all 19 folders):

| Library | Third-party code | Its license | Its notice ships as |
|---|---|---|---|
| `segno-languages` | Block and inline parsing rules ported from markdown-it (`block.ts`, `inline.ts`) | MIT | `LICENSE.markdown-it.md` |
| `lastra` | JPEG decoder (`decode/`) and encoder (`jpeg.ts`) based in part on libjpeg-turbo and the IJG's work | IJG License + Modified 3-clause BSD (zlib terms subsumed) | `decode/LICENSE.libjpeg-turbo.md`, `decode/README.ijg.txt`, and the IJG acknowledgment in `NOTICE` |
| the other 17 | none | — | — |

**Dependencies, as manifests declare them and as installed:**

| Library | Kind | Package | License |
|---|---|---|---|
| `cadenza`, `vetrina` | runtime | `@laticent/ltt` | Apache-2.0 (this change) |
| `fuoco`, `vetrina` | optional peer | `react` 19.3.1 | MIT |
| `tavola` | optional peer | `yjs` 13.6.33, `y-protocols` 1.0.7, `lib0` 0.2.119, `trystero` 0.26.0 (and its `@trystero-p2p/nostr` 0.26.0) | MIT |

No library imports the engine, the Studio or Lente: every bare import in their non-test sources is
one of the packages above, `node:` built-ins in a test helper, or the library itself. No library
bundles third-party code into its `dist/` (Cadenza and Vetrina inline parts of `@laticent/ltt`, itself
Apache-2.0), and no builder writes a license banner. MediaBunny (MPL-2.0)
is an engine dependency only.

## 3. Policy-leakage check

E2 asks that no library carry Lattice product policy (design rules, component selection, theme or
venue policy), which belongs in the AGPL engine. Calco, Trama, Fluido, Lente and Squadra were read
first; the other 13 were swept for component names, catalog taxonomy and venue terms.

| Library | Verdict | Evidence |
|---|---|---|
| **Lente** | **Carries policy: stays AGPL-3.0-only** | `docs/src/lib/lente/suggest.ts` lines 32–97: the `SUGGESTERS` table names Lattice components (`kpi`, `stats`, `big-number`, `closing`, `decision`) and Lattice's catalog taxonomy (`anchor`/`bookend`, `statement`/`connect`, `progression`, `imagery`, `divider`) and decides which lens each belongs in. That is component selection |
| Calco | Mechanism; **stays AGPL** by the owner's product call (§1) | Office export of rendered slides. The host passes its palette (`capture.ts` 487–491) and its picture policy (`picture.ts` line 3 names Lattice's `choosePicture` in `lib/core/image-policy.js` as the host's). `reader.ts` line 56 reads Lattice's `data-frame` attribute when a page has one, a host convention, not a rule |
| Trama | Mechanism; **stays AGPL** by the owner's product call (§1) | Graph layout and routing. `pipeline.ts` uses host hook names (`__latticeGraphFlush`, `data-lattice-live-layout`, `__latticeDagre`): plumbing, not policy |
| Squadra | Mechanism | A lint engine that proves its rules; Lattice's rules live in `lib/authoring/`. `markdown.ts` takes the deck model from the host |
| Fluido | Mechanism, one judgment call | Pagination decisions over facts the host reads (`types.ts` line 6: Lattice's connector is `lib/core/auto-split.js`). `plan.ts` carries defaults that came from Lattice decisions: a `wide` box never paginates (line 28), one member per page, a 64-page cap. They are generic pagination rules with no Lattice component, theme or venue in them, so this check read Fluido as mechanism. **The owner keeps it AGPL** (D2, §1): those defaults are Lattice layout policy |
| the other 13 | Mechanism | No component, catalog, theme or venue rule. Cadenza's lexicon targets business vocabulary ("the house domain"), a speech default, not design policy |

Cenno is private and stays AGPL-3.0-only, as E2 says.

## 4. What changed

- 14 libraries: `license: "Apache-2.0"`, a tracked `LICENSE` (the Apache text, byte for byte as
  `https://www.apache.org/licenses/LICENSE-2.0.txt`, sha256 `cfc7749b…3d30`) and `NOTICE` in each
  folder, and `NOTICE` in each `files` list.
- `tools/library-prepack.js` no longer copies the root `LICENSE` into every library. An Apache-2.0
  library must hold the exact Apache text, a `NOTICE` and both in `files`, or the pack fails; an
  AGPL-3.0-only library still gets the root copy; any other value fails.
  `test/unit/tools/library-prepack.test.js` pins the set (Calco, Cenno, Fluido, Lente and Trama AGPL, 14 Apache) and each
  refusal.
- `LICENSING.md` at the root says which part is Apache, AGPL or CC-BY.
- `spec/` keeps CC-BY-4.0. `spec/LTT-1.0.md` line 11 now says its reference implementation is
  Apache-2.0, a fact about the package, not a change to the spec.

## 5. Open

- **Lente** stays AGPL (owner, 03:47 UTC). Opening it later means moving `SUGGESTERS` into the
  engine first (the host already injects the catalog and the class reader).
- **`ltt.schema.json`.** It is generated from `@laticent/ltt`'s types, so it ships under the
  package's Apache-2.0. The map (§3) asked whether the schema counts as spec (CC-BY-4.0); this
  change treats it as code.
- **Six libraries cannot take a changeset** (filo, fuoco, suono, tavola, veduta, vetrina): they are
  in `.changeset/config.json` `ignore` and the gate rejects them. Their manifests and files changed
  all the same; their first publish will be Apache-2.0.
- **Fluido** stays AGPL (owner, D2). Opening it later is a relicense of `docs/src/lib/fluido/` alone.
- **The inbound license** (D3) is settled in this change: `CONTRIBUTING.md` says a contribution comes
  in under the license of the part it changes, and `TRADEMARKS.md` names both licenses.
- **An artifact license gate in CI** (map A-4) is still unbuilt. Prepack now refuses a wrong
  license at pack time; a CI job that packs every library is a separate, owner-approved change.
