---
status: in-progress
summary: "CLA retired; model chosen: sole-authored core with an author-owned plugin/theme layer (Model B, stripped) — no marketplace platform until users demand one"
last-updated: 2026-07-02
companion:
  - ../../CONTRIBUTING.md
  - ../../LICENSE-EXCEPTIONS
  - ../../TRADEMARKS.md
  - ./2026-06-29-component-transformer-threat-model.md
---

# Contribution model after the CLA — who owns what, and where money comes from

**Trigger.** Hours after the MIT→AGPL relicense (#700) shipped with a CLA, the
owner rejected the CLA's premise: its core grant lets SlideWright relicense
contributions commercially while contributors are paid nothing — the standard
asymmetric open-core playbook, and not this project's values. Directive:
contributors own their work; if their work ships in something we sell, we pay
for it; explore a plugin/marketplace direction instead. The CLA was removed
before a single signature was collected (this PR).

Three independent adversarial reviews (business, legal/community, inversion)
were run against four candidate models. This doc records the findings and the
decision. **DECIDED 2026-07-02: Model B, stripped of its machinery** (owner's
pick, on the reviews' unanimous recommendation). Steps 1–2 of the
recommendation ship with this doc; steps 3–5 remain, hence `in-progress` —
flip to `shipped` when the theme spec + starter + exception land (step 3) or
are consciously deferred with the trivial-fixes-only merge rule still
standing in CONTRIBUTING.

## The candidates

- **A — Community core (DCO).** Contributions under Developer Certificate of
  Origin sign-off, inbound = outbound AGPL. The engine becomes
  multi-copyright-holder community property.
- **B — Sole-authored core + author-owned periphery.** Core accepts outside
  code only by arrangement (trivial DCO fixes, or paid/commissioned work with
  an explicit license grant). Community builds themes/plugins they own
  outright and may sell anywhere; a marketplace is a possible later community
  feature, not a revenue plan.
- **C — FLA (FSFE Fiduciary License Agreement).** Contributors grant rights;
  the project is legally bound to keep the work free software.
- **D — Keep the CLA** (possibly softened with a "stays open source forever"
  promise).

## Findings that constrain the choice (all verified in-repo)

1. **The proprietary SlideWright app does not depend on core copyright.**
   A closed app can fork/exec the unmodified CLI (`npx lattice deck.md
   out.pdf`) at arm's length — aggregation, not a combined work, per the
   FSF's own FAQ — and display exported HTML in its WebView under the
   Lattice Output Exception (`LICENSE-EXCEPTIONS`). This works under EVERY
   model including full community-AGPL. It demands one discipline: app code
   never `import`s engine modules. **The only asset that differs across
   models is the right to sell commercial engine licenses to third parties**
   (the iText/Ghostscript/Qt model — the README already solicits inquiries).

2. **A marketplace cut is not a revenue line at any reachable scale.**
   Developer-tool marketplaces are free-asset economies (VS Code: no payment
   rails at all; Obsidian: 2,000+ donation-ware plugins while the company
   earns from Sync/Publish). Paid-asset markets (WordPress themes, Envato)
   work because non-technical buyers purchase finished visual products on
   platforms with millions of users. Napkin: 10k users × 2% attach × $19
   theme × 30% cut ≈ $1.1k/yr — before merchant-of-record costs eat most of
   it. A marketplace is a community feature that might someday pay its own
   hosting; nothing more.

3. **The plugin layer is currently a fiction, and its two halves differ by
   10×.** Themes are one self-contained CSS token file against a contract
   README §Versioning already promises is stable — an external loading path
   (backlog #298) away from third-party viability. Components have no
   boundary at all: transforms are hand-wired into every render path
   (#287 is step 1 of an API), and third-party transform JS in previews is
   exactly the XSS→key-theft vector the component-transformer threat model
   and HARD RULE #22 exist to stop. Themes-first ≈ a quarter; a component
   marketplace ≈ a year plus a permanent semver + security liability.

4. **The official theme path is born-derivative.** `npm run new:theme`
   stamps the starter from `indaco.css`, so every community theme begins as
   a copy of AGPL code. For authors to genuinely own their themes, publish
   the token contract as a spec (CC-BY-4.0, like LFM) plus one MIT/CC0
   starter theme, and rewire `new:theme` to copy that starter.

5. **Legal drafting rules for any plugin/theme exception** (from the
   in-repo Output Exception, which got these right): draft as a *grant*
   ("you may…"), never a declaration that something "is not a derivative
   work" (a licensor can't decree that; a court decides — but a grant moots
   the question, which is how Classpath/LGPL work and why the WordPress
   precedent doesn't bite); cover AGPL §13 (network use), not just
   conveying; exclude bundled or copied engine code explicitly.

6. **Sequencing is one-way.** New or broadened §7 exceptions over the whole
   work require the consent of *every* copyright holder of the covered
   material. Land the final theme/plugin exception in `LICENSE-EXCEPTIONS`
   **before** the first outside patch merges; after that, broadening
   requires contributor consent or rewrites. Similarly, Model A's DCO door
   is one-way: the first substantive community patch permanently forecloses
   B, C, and D for that code. `git blame`-based unwinding is a myth at any
   scale (Dolphin/MAME relicensing took years of contacting contributors).

7. **DCO ≈ CLA for provenance.** Neither launders plagiarized code; both
   give only a claim against the submitter. The CLA's real payload was
   always the relicensing grant — meaning removing it costs nothing except
   the thing the owner rejected on principle.

8. **Closed-core optics are survivable if stated up front.** SQLite ("Open
   Source, not Open Contribution"), Litestream, and Ghostty are respected
   for saying it plainly with reasons; Elm burned because the policy was
   ambient and PRs rotted. The failure mode is discovery-after-rejection,
   not the policy. Corollary: the policy must be in CONTRIBUTING's first
   paragraph before anyone's PR is pending (done in this PR).

9. **None of this is the binding constraint.** The package is unpublished
   (npm 404), the app is unshipped, the waitlist is days old. The most
   probable 2027 post-mortem under every model is "the licensing was fine;
   nobody showed up." The only licensing moves with positive expected value
   at zero users are the ones that are cheap now and expensive later:
   deleting the CLA at zero signatures (done) and writing intent down
   before contributor #1 exists (this doc).

## Per-model verdicts (condensed)

| Model | Keeps | Costs | Dies by |
|---|---|---|---|
| **A** | Best contributor optics; simplest | Engine dual-licensing (the one differentiated revenue asset), forever, on the first patch; "paid builds" leak instantly (`npm run build`) | Burnout with no revenue counterweight; irreversibility regret |
| **B** | Dual-licensing option; authors own + monetize their layer; every element reversible | Standing discipline (no substantive drive-by core merges, ever); theme-spec + starter work; optics tax if stated lazily | Open-core-in-denial: empty plugin layer + closed app = the exact outcome the owner rejects — hedge with a written symmetry pledge |
| **C** | Enforceable openness promise | Fiduciary duties on the owner; entity formation; unknown in this ecosystem; dual-license latitude under FLA-2.0 §3 unverified | Machinery nobody signs, for a coordination problem that arrives at ~100 contributors, not 0 |
| **D** | Maximum legal power | The asymmetry the owner rejects; post-HashiCorp, CLA-plus-promise reads as a rug-pull prologue | Flamed at first exposure; dead letter (zero signatures ever) |

All three reviews independently ranked **B first** (business: high confidence;
legal: high on coherence, medium on reception; inversion: ~70%, on
least-bad-worst-case grounds — B is the only fully reversible option). A is
the honest fallback if commercial engine licensing is ever judged worthless —
and B→A remains walkable later, while A→B does not.

## Recommendation — Model B, stripped of its machinery

1. **Now (this PR):** CLA deleted at zero signatures; interim CONTRIBUTING
   states the policy in its first paragraph — issues welcome, PRs held for
   merge except trivial DCO-signed fixes, inbound = outbound AGPL *including
   the LICENSE-EXCEPTIONS permissions*, larger work discussed first
   (possibly paid).
2. **Before the first outside patch:** publish the one-page "ownership and
   money" policy — contributors keep copyright; themes/plugins are theirs to
   sell anywhere (the `lattice-theme-foo` carve-out already in
   TRADEMARKS.md); "by arrangement" means an explicit paid license grant for
   anything that ships in a commercially licensed artifact; plus a
   falsifiable symmetry pledge (e.g. engine capabilities the wrapper
   monetizes land in the AGPL engine within N months). Written at N=0 it's a
   promise; at N=50 it's a betrayal.
3. **Themes-first, when ready:** token-contract spec (CC-BY-4.0) + MIT/CC0
   starter theme + rewire `new:theme` + a theme/plugin exception in
   `LICENSE-EXCEPTIONS` drafted per finding 5 — landed before any DCO merge.
4. **No marketplace platform, no component-plugin API, no FLA** until real
   users demand them. A docs-site gallery listing community themes is the
   90% -cheaper substitute.
5. **Spend the recovered weeks on distribution** — npm publish, the app
   alpha, the waitlist — because finding 9 dominates everything above it.

## Rejected

- **Marketplace-as-revenue** — finding 2. Rejected as a plan, retained as an
  eventual community feature.
- **FLA** — dominated on every axis for a solo US developer (finding on C).
- **CLA + "forever open" promise** — the promise is unenforceable against a
  §7 assignee and cures the wrong objection; only a termination condition
  inside the grant would work, and the owner rejects the grant itself.
