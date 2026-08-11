---
status: shipped
summary: >
  #1566 shipped the ledger — what a var() fallback lands on, recorded and mechanically enforced.
  This is the judgment it cannot make: whether the target carries the same CONTRACT. The issue's
  open question was where a contract could live as ONE source; the answer is that Lattice already
  has one — HARD RULE #11 makes role-based token names canonical and gates them, so `-ink` is text
  at 4.5:1, `-mark` a shape at 3:1, `-fill`/`-bg`/`-texture`/`-accent` an area with no floor. The
  floor is read off the name by a dozen PATTERNS, not a per-token list that goes stale the first
  time someone adds a token (the shape #1560's first cut shipped and had to undo). An unmatched
  name returns null and is counted, never defaulted to "no floor". Measured over the real tree:
  547 tokens scanned, 297 token-hop fallbacks, 79 distinct hop pairs, of which 25 DROP a floor and,
  after six explicitly-declared exceptions, ZERO fail to classify. Three arms: the ledger at
  budget 0 (satisfiable today, and role-STRICT because the rows claim "same role" and a floor
  comparison alone would accept re-pointing a texture at a mark), the repo-wide 25 as a PINNED
  SET rather than a count ratchet, and unclassified names at budget 0. The 25 are LOGGED, not
  blessed: 8 are the `--cat-N-ink → --cat-N-mark` the repo itself mandates, and #1527's concat
  flip would remove the reason those have to exist. The other 15 are an unaudited `→ --accent`
  family that nothing has measured — the second `--cat-N-ink`, and the reason this gate is worth
  having.
---

# A fallback's target, checked against a contract instead of a comment

**#1595.** The second half of #1545, deliberately not built there. #1566 shipped
the *ledger*; this is the *judgment* the ledger cannot make.

## 1. What the ledger cannot do

`SANCTIONED_FALLBACK_READS` makes the no-safe-default gate's cheap exit
traceable: a token rescued only by a `var()` fallback must carry a row naming
what the fallback lands on and why that value carries the same contract the read
needs. The `fallback` field is mechanically enforced — re-point a read and the
gate names it.

**What it cannot check is whether the justification is true.** Nothing verifies
that `--cat-N-fill` really does carry the same contract as `--cat-N-texture`. A
wrong `why` passes, exactly as a wrong `SANCTIONED_MARGINS` reason would.

That matters because the defect the whole line of work exists to prevent —
`--cat-N-ink` degrading onto `--cat-N-mark` — would have been caught by the
*paperwork*: writing "it lands on a value repaired to the 3:1 graphical floor,
and I am painting label text needing 4.5:1" is where a human notices. But that
depends on the human noticing.

## 2. Where the contract lives: the token's own name

The issue's open question was where to put a contract — `lib/theme/derive.js`,
the manifest schema, or a new table — with the constraint that it be **one
source, not a second hand-kept list**.

**Lattice already has one, and it is the naming vocabulary.** HARD RULE #11
makes universal role-based names canonical and gates them
(`checkRetiredTokenNames`); HARD RULE #4 says the same of typography, in as many
words: tokens are named for their ROLE. So the name is *already* the declaration
of role, and the floor can be read straight off it:

| suffix / shape | role | floor | why |
|---|---|---|---|
| `-ink` · `-fg` · `text-*` · `on-*` · `-heading`/`-body`/`-label`/`-muted`/`-secondary`/`-display` | ink | **4.5:1** | AA normal text |
| `-mark` · `-border` · `-stroke` · `-line` · `-rule` · `-edge` | graphical | **3:1** | WCAG 1.4.11 |
| `-bg` · `-fill` · `-surface` · `-soft` · `-alt` · `-texture` · `-tint` · `*accent*` · `spectrum-*` | area | **none** | the thing others are measured against |
| `font-*` · `fs-*` · `sp-*` · `-inset-*` · `-x`/`-y`/`-size` | metric | — | not a color |

`lib/tokens/contracts.js` is that table as about a dozen ordered patterns —
**not 383 token entries**. The difference is the whole reason for the shape: a
per-token list goes stale the instant someone adds a token and forgets the list,
which is precisely what #1560's first cut shipped and had to undo, and what the
background-shorthand guard was defeated four ways for. A pattern list cannot go
stale that way.

**What it can do is fail to match, and that is not a silent pass.**
`contractOf()` returns `null`, and the gate counts it. A classifier that quietly
defaulted an unmatched name to "no floor" would let the next `--cat-N-ink`
straight through — so the unmatched bucket is, in effect, a HARD RULE #11
conformance report. **Six** tokens are in it today, each declared explicitly with
its floor in `SANCTIONED_TOKEN_CONTRACTS`: the three `--marp-slide-*-color`, whose
names belong to Marp Core and are not ours to change, and `--state-color`,
`--lane-color`, `--lane-jur`, whose honest fix is a rename off this change's path.

**Three roles, not five.** Surface, hue and decorative paint are deliberately one
role. A finer taxonomy reads tidier and makes role equality useless: the ledger's
`--cat-N-texture → --cat-N-fill` row justifies itself as landing on "the same
role", and it is right — both are what paints the categorical chip's area — while
a split taxonomy would call that row a role change. Three tiers is also exactly
the model the issue describes.

**The floors are defined once, in that module.** `tools/check-ownership.js`
imports them instead of declaring its own 4.5 / 3.0, so "AA normal text is 4.5:1"
has a single home.

## 3. Measured over the real tree

Not a fixture — the live `lib/`, through `bareVarReads`, the same scanner the
ledger and the no-safe-default gate read from (HARD RULE #15), so the three
cannot disagree about what a fallback chain is:

| | |
|---|---|
| tokens scanned | **547** |
| token-hop `var(--a, var(--b))` reads | **297** (303 hops — a three-link chain is one read, two adjacent hops, plus one read→final pair) |
| distinct hop pairs | **79** |
| distinct hops that DROP a floor | **25** |
| tokens that fail to classify | **0**, after **six** declared exceptions |

*Two earlier drafts of this table were wrong, and both are recorded rather than swapped.* The first published **555 / 299 / 79**. Those are the pre-strip
figures: the first probe was written before the gate learned to strip `//` line
comments from `.js`, so it counted a JSDoc line in `lib/theme/derive.js`
documenting this very pattern (`var(--cat-N-ink, var(--cat-N-mark))`) as a real
read of a token named `--cat-N-ink`. Recorded rather than silently swapped:
`2026-08-10-fallback-exit-ledger.md` §2 makes exactly this point about exactly
this line of work — *"the numbers a record cannot reproduce are the numbers not
to print"* — and it would be a poor note that repeated the mistake it cites.
The second published **547 / 297 / 78 / 23**, correct at the time and stale within
the hour: the adversarial trio found two evasions (a floor drop laundered through a
non-color token mid-chain, and `-alt`/`-soft` un-flooring a whole ink family), and
closing them added the read→final hop, which surfaced two more real drops
(`--cat-4-ink` and `--cat-7-ink` landing on `--accent` two hops out). Twice in one
change is the argument for deriving a number at read time rather than printing it —
which is exactly what §4's pinned set does and this table does not.

The 25, in two families that are **not equally defensible**:

**(a) `--cat-N-ink → --cat-N-mark`, eight slots — the repo MANDATES this one.**
`checkCatInkFallback` requires exactly this fallback at every read. The tier has
no `:root` default on purpose: the export bundle concatenates the theme *before*
the base, so a default there would win on equal specificity and revert every
curated ink to its mark (measured: atelier's curated `#006D70` became the mark
`#008386`). The fallback therefore has to live at each consumer, and
`--cat-N-mark` is the only same-slot value that exists. In practice the drop is
off the path for shipped themes — `derive-cat-ink.js` emits the tier for all of
them — but a theme generated outside this repo lands on it, which is the
176-of-200 `brand-mono` measurement. **#1527's concat flip would remove the reason
this drop has to exist**, and is the cheapest way to drain eight of these rows.

**(b) `→ --accent`, seventeen chains — unaudited, and this is the finding.**
`--code-inline-fg`, `--ink`, `--jur-ink`, `--lane-ink`, `--on-dark-watermark`,
`--panel-label-ink`, `--phase-ink`, `--row-ink`, `--tier-ink` (4.5:1 → nothing);
`--cat-4-mark`, `--cat-7-mark`, `--lane-jur`, `--panel-mark`, `--pill-border`
(3:1 → nothing); `--mood-ink → --mood-bg`, the sharpest single row, a label
falling back to its own background; and two that only the read→final comparison
sees — `--cat-4-ink` and `--cat-7-ink` land on `--accent` two hops out via
`var(--cat-N-ink, var(--cat-N-mark, var(--accent)))` in `math.styles.css`, so the
pairwise view shows a 4.5→3 drop where the read actually resolves to no floor at
all.

`--accent` carries **no floor against anything.** It is the theme's brand hue —
near-black in onyx and concrete. A `*-ink` read that degrades onto it is a 4.5:1
text requirement resolving to a value nothing holds to any contrast at all. That
is the same construction as `--cat-N-ink`, in seventeen more places, and nothing
had looked at it.

**No claim is made here that any of the seventeen is AA-clean.** They are
pre-existing and off this change's path, so HARD RULE #18 says log them rather
than sweep them in.

## 4. What shipped

Three arms, because the three populations have different standing:

1. **The ledger, budget 0.** Every `SANCTIONED_FALLBACK_READS` row is checked for
   a floor drop *and* a role change. It is satisfiable **today** — all 13 live
   rows (twelve `--cat-N-texture` plus `--spectrum-solid`) are same-role area hops,
   so none can produce a floor verdict under the current population; the arm is live
   against a future re-point. This is the issue's literal ask, enforced at zero.
2. **The repo-wide backlog, a PINNED SET** (`KNOWN_CONTRACT_DROPS`), not a count
   ratchet. A count lets one drop be swapped for another silently; with 25
   entries the set costs nothing more and names exactly which chain is new. It
   fails both ways — an unlisted drop errors, and an entry that no longer occurs
   errors as stale, so **draining shows up as a diff**. Named `KNOWN_` rather
   than `SANCTIONED_` on purpose: these are logged, not blessed.
3. **Unclassified names, budget 0**, with `SANCTIONED_TOKEN_CONTRACTS` for the
   six whose names are not ours to change (the three `--marp-slide-*-color`) or
   whose rename is off-path (`--state-color`, `--lane-color`, `--lane-jur`).

Plus an empty-scan guard: if the walk finds no token-hop fallbacks at all, that
is a broken scan and not a clean tree.

## 5. Verification

45 unit tests. Each arm is driven by a CANARY that must fail:

| mutation | result |
|---|---|
| a new floor-dropping read (`var(--probe-ink, var(--bg))`) | **named**, "not in KNOWN_CONTRACT_DROPS: --probe-ink → --bg" |
| a fixed drop (`--ink → --accent` re-pointed at `--text-body`) | **named** as a stale pinned entry |
| a ledger row re-pointed at a weaker contract | **named**, "held to a WEAKER contract" |
| a ledger row re-pointed at a different role, floor UP | **named**, "ROLE CHANGE" |
| an unclassifiable token in a chain | **named**, "declare NO ROLE in their name" |

One test drives the classifier against the **live** tree rather than a fixture:
every token in every live fallback chain must classify. That is the design's
load-bearing claim ("the name already declares the role"), and a fixture cannot
go stale in the direction that matters.

`npm run lint`, `npm test`, `npm run build:check`, `npm run lint:deck:all` and the
integration tier pass.

## 6. What this does not fix

- **The seventeen `→ --accent` drops are logged, not measured.** Nothing here says
  they are AA-clean; the pinned set exists so they cannot multiply while someone
  audits them. That audit needs a real contrast pass across 32 themes and is its
  own card.
- **A contract belongs to a TOKEN, not to a use site.** `base.finish.css` reads
  `var(--ink, var(--accent))` inside a 7%-alpha `color-mix` for a vignette rim —
  an ink token used decoratively, where no text floor applies. The gate calls it
  a drop, correctly: the READ is of a 4.5 token, and any other consumer of the
  same pattern would be painting text. Sites like that belong in the recorded
  backlog with the reason written down, not in a smarter classifier.
- **The role table is still a table.** It is a dozen patterns rather than 383
  rows, and every unmatched name is a loud failure rather than a silent pass, but
  it is not derived from anything more fundamental than the naming convention.
  If HARD RULE #11's vocabulary grows, this grows with it — and the unclassified
  arm is what says so.
- **Nothing checks a `why` string.** It never could. What changed is that the
  *mechanical* half of the claim — same contract, same role — is no longer taken
  on trust.
- **A FALLBACK WRAPPED IN A FUNCTION IS OUTSIDE THE POPULATION, and that is
  inherited, not new.** `parseVarChain` builds a chain only when the fallback
  begins `var(`, so `var(--a, color-mix(… var(--b) …))` and
  `var(--a, light-dark(var(--b), var(--c)))` produce no hop at all. #1566 argued
  the case deliberately: the hop is what can silently drift, whereas an inline
  expression *is* the value, written at the read — and requiring a ledger row for
  the safe inline form taxed #1573 with eight rows for a pattern carrying none of
  the risk. That reasoning still holds, and this gate inherits the scope.
  **What it means concretely:** the eight `--chart-cat-N-ink` reads in
  `lib/components/chart/_chart-family/chart-family.css:168-175`, whose fallback
  mixes an unfloored `--chart-cat-N-hue` 65% with `--text-heading`, are invisible
  to this gate. Nothing here says whether they are AA-clean; measuring them across
  32 themes is its own card.
  **And the argument has a hole the red team found:** a DEGENERATE mix —
  `color-mix(in oklab, var(--cat-1-fill) 100%, transparent)` — is a re-point
  wearing a function, with all of the drift risk and none of the visibility.
  Closing it means teaching `parseVarChain` to look inside function arguments,
  which is #1566's shared scanner and is read by three gates, so it is a change to
  make deliberately rather than at the end of a batch.
