---
status: shipped
summary: >
  checkNoSafeDefaultTokens offers two exits when it fires — derive the token (an hour of
  color work) or give the read a var() fallback (ten seconds). The second is legal, often
  correct, and permanently removes the token from the gate's view, which is the exact
  construction that produced the defect the gate exists to prevent: --cat-N-ink carried a
  fallback at every read and was still missing from the generator for a year, degrading onto
  a value repaired to the 3:1 GRAPHICAL floor and then painted as 4.5:1 label text.
  SANCTIONED_FALLBACK_READS makes that exit a recorded decision instead of a silent one —
  same fails-both-ways idiom as SANCTIONED_MARGINS/HEX, so an unlisted token errors AND a
  sanction that no longer applies errors. The issue's own predicate ("read only with fallbacks")
  gives exactly 17 and the ledger's gives 13; BOTH are right, and the extra term is that no
  engine default rescues the read, which drops four tokens whose fallback is incidental. An
  earlier draft of this note claimed 17 "does not reproduce" — that correction was itself the
  error, and §2 records it rather than deleting it. Deliberately does NOT weaken the no-allowlist stance on the DERIVE exit, and
  deliberately does NOT add --cat-N-texture to REQUIRED_TOKENS: that is a supply-side
  feature, not a token addition, and is split to its own issue.
---

# A ledger for the gate's cheap exit

**#1545.** Follow-on from #1457 / #1535, raised by that work's Munger-inversion pass. Not a
defect in the gate — a limit of what a computed gate can see, and the mechanism by which it
will erode.

## 1. The shape

`checkNoSafeDefaultTokens` fires when a token shipped palettes declare has no engine default
the read can reach and no fallback that resolves. It offers two exits:

1. **Derive it** — add it to `REQUIRED_TOKENS` and write a derivation in `lib/theme/derive.js`.
   Costs an hour of color-algorithm work.
2. **Give the read a fallback** — `var(--x, var(--something-safe))`. Costs ten seconds, is
   HARD-RULE-#3-legal, and **permanently removes the token from the gate's view**, because a
   read with a resolving fallback is not reported by design.

Exit 2 is often the *right* answer. It is also the exact construction that produced the
defect the gate exists to prevent. `--cat-N-ink` had a fallback at every read, was gated by
`checkCatInkFallback`, and was *still* missing from the generator for a year — degrading onto
`--cat-N-mark`, a value repaired to the 3:1 **graphical** floor and then painted as label text
needing 4.5:1. Measured in `2026-08-10-no-safe-default-token-contract.md`: 176 of 200 sampled
`brand-mono` themes carried a sub-AA label that way.

The problem is not the exit. It is that taking it leaves **no trace**.

## 2. The population — 17 is right, and the ledger deliberately lists 13

An earlier draft of this note claimed the issue's figure of 17 "does not come out under any
reading I could find", and put that correction in the CHANGELOG too. **That was wrong, and an
independent checker showed it by reading the issue's own sentence:** *"declared by shipped
palettes, absent from `REQUIRED_TOKENS`, and read only with fallbacks."* That predicate is
precise and it computes to exactly **17**. Recording the error rather than quietly deleting
it, because publicly correcting a colleague's number with a number that is itself wrong is a
worse defect than the miscount would have been.

What the ledger lists is a **narrower** population, by one extra term:

| population | term added | count |
|---|---|---|
| the issue's — every read carries a fallback | — | **17** |
| the ledger's — *and* no engine default rescues the read | `!defaulted(token, read)` | **13** |

The four-token difference is `--code-inline-fg` and the three `--marp-slide-*-color`. Each is
read only with a fallback *and* carries an engine default, so its reads resolve whether or not
anyone wrote that fallback. Those tokens are not taking the cheap exit at all, and a ledger row
for one would carry no decision — the value of an allowlist is that every row means something.

The 13 are the twelve `--cat-N-texture` and `--spectrum-solid`.

*(Two other counts appeared in that earlier draft and are struck: a "loose reading" of 25,
which only computes if you silently drop the Mermaid-map reads the gate itself includes — the
stated predicate gives 32 — and a "fallback somewhere" gloss in the code comment, which gives
18. Neither was load-bearing; both were noise, and the numbers a record cannot reproduce are
exactly the numbers not to print.)*

## 3. What shipped

`SANCTIONED_FALLBACK_READS` in `tools/check-ownership.js`, following the existing idiom
(`SANCTIONED_MARGINS`, `SANCTIONED_HEX`, `SANCTIONED_PREVIEW_BUILDERS`) exactly:

- an **unlisted** fallback-only token is an error;
- a **stale** sanction — one whose token no longer reaches the gate that way, because it was
  derived, its reads changed, or the palettes stopped declaring it — is *also* an error, so
  the ledger cannot rot;
- each entry names the token, **what the fallback lands on**, and why that value carries the
  same contract the read needs.

That last field is the whole point, and it is what `--cat-N-ink` would have failed. Its
fallback landed on a value with a *different* contract — a 3:1 graphical floor standing in for
4.5:1 label text — and writing the justification down is where someone notices.

The two entries today:

- **the twelve `--cat-N-texture`** → `var(--cat-N-fill)`. Texture is redundant encoding
  layered over a categorical fill, so falling back to that slot's own fill *is* the
  un-textured rendering — which is exactly what a non-texture theme should look like. Same
  role, contract token, no floor mismatch.
- **`--spectrum-solid`** → `var(--accent)`. A per-theme override, not a required slot: it
  exists only so a theme whose accent is too near-black to read as a bar (onyx, concrete) can
  name a different hue. Every other theme wants `--accent`, so the fallback is the intended
  value rather than a degradation.

**A literal-terminated chain is in view too, after the trio showed it was not.** `bareVarReads`
used to *skip* any chain bottoming out in a literal, which is exactly the form
`checkNoSafeDefaultTokens`'s own remediation text recommends — so
`var(--cat-1-texture, var(--cat-1-mark, transparent))` re-pointed a sanctioned read at a
different-contract token and every arm stayed green, while the committed justification (which
says in as many words that it lands on the same-role fill and *not* on a mark) went false. The
`--cat-N-ink` construction, inside the change built to surface it. Such reads are now recorded
and flagged rather than dropped: the main gate still treats `endsLiteral` as rescued, so its
population is unchanged at zero, while the ledger compares their chain like any other. 255
previously-invisible reads came into view; the ledger stayed at 13 rows.

**The no-allowlist stance on the DERIVE exit is unchanged.** That stance is deliberate and
this does not touch it: a token with an unrescued read still fails with no way to list it away.
This ledger only covers tokens that are already, legitimately, out of the gate's sight.

## 4. What this deliberately does not do

**`--cat-N-texture` is not added to `REQUIRED_TOKENS`,** and the reason is worth recording
because the issue reasonably suggests it. Texture cannot be *derived* the way a color token
can. A theme adopts it by pointing at a **pattern-set id** — `url(#latt-onyx-tex-1)` — and
only four sets exist (`engineering/textures.md`), each baking a **literal hex ramp** in
`lib/core/accessibility-textures.js`: `CAT_FILLS` and `CAT_FILLS_DARK` are grays,
`CHART_FILLS` deeper grays, `CONCRETE_FILLS_*` concrete's own material tints.

So a generated theme could only point at a set whose colors were baked for a different
palette. A `brand-mono` theme in, say, a blue-green cycle would get gray chips contradicting
its own `--cat-N-fill` values. Making textures work for generated themes means **generating a
set per theme** — new geometry wiring, a ramp derived from that theme's fills, an ink solved
for contrast against them, and a re-blessed `texture-defs.golden.svg`. That is a supply-side
feature, not a token addition, and it is a second feature in a PR that already has one
(HARD RULE #17). Split to **#1562**.

The case *for* doing it eventually is real and stated in the issue: a `brand-mono` Studio
theme is near-monochrome with twelve slots separated mostly by lightness — precisely the
population `engineering/textures.md` exists to serve — and today it has no texture channel at
all.

## 5. What this does not fix

- **One fallback per token, across all its reads.** A token that legitimately falls back
  differently at different sites cannot be expressed; the gate would report the divergence as
  an error. No such token exists today.
- **The ledger records; it does not judge.** Nothing checks that a `why` is *true*. A wrong
  justification passes, exactly as a wrong `SANCTIONED_MARGINS` reason would. What it buys is
  that a human wrote one and a reviewer can read it.
- **The second half of the issue's suggestion is not built.** It also proposed a *semantic*
  gate per family — the way `checkCatInkFallback` covers the ink tier — for any family whose
  fallback lands on a value with a different contract. That is the check that would have
  caught `--cat-N-ink` on its merits rather than on its paperwork, and it is not here.
- **A generated theme still has no texture channel** (§4) — tracked in #1562.
