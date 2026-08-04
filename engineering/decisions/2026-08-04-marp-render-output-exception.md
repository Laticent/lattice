---
status: blocked
summary: ESCALATION, not a decision — the licensing call is the owner's. Verified by rendering (marp-cli 4.5.0, which is what the `^4.3.1` range resolves to): `marp --html` inlines ~852 KB of engine CSS into the output file, while `marp --pdf` carries no engine source at all. So the output exception's reach matters on exactly one route. The gap is NOT where the on-deck note placed it — §Limits (a) excludes assets "distributed other than inside a rendered deck", and a `marp --html` file IS a rendered deck, so (a) does not bite; the exclusion comes from the Grant's "as embedded by Lattice itself", §Limits' opening "Lattice's own export pipeline", and §Limits (c), since Marpit REWRITES every selector on the way in. marp-cli did the embedding, so the literal text does not reach the very workflow the kit ships to enable. Scope is wider than the kit — the Export-to-Marp bundle's documented `npm run html` has the identical gap. Two options (extend the grant / narrow the reassurance), recommendation is to extend, and NOTICE.md is narrowed to what is factually true today WITHOUT touching the grant. Also logs a separate and more clear-cut finding, tracked as #1354 and deliberately not fixed here: the Export-to-Marp bundle ships mermaid (MIT), the KaTeX faces (MIT) and five OFL font families with no LICENSE, no NOTICE and no license texts at all — the exact defect the kit was fixed for in #1325.
---

# The output exception does not reach a Marp render — escalation

**This is an escalation, not a decision.** The question is what Lattice's license
should grant. That is the copyright holder's call, not an engineering one, and
nothing here changes the grant. What this note does is establish the facts by
measurement, put the gap in the right clause, size who it affects, and lay out
the options with a recommendation.

## Where it came from

The adversarial trio on #1325 (`dist/marp-kit`) raised one point no lens
resolved:

> `LICENSE-EXCEPTIONS` §Limits withholds the output exception from engine assets
> "distributed other than inside a rendered deck". A `marp --html` render inlines
> the whole AGPL `lattice.min.css` into the output file. On a literal reading, a
> user who renders and posts that HTML has conveyed AGPL object code — via a
> route the exception does not cover, since marp-cli is not "Lattice's own export
> pipeline".

The conclusion is right. **The citation is wrong**, and the correction matters
because it changes which sentence has to be edited if the answer is "fix it."

## The facts, measured rather than assumed

Rendered `dist/marp-kit/Sample-Deck.md` through real marp-cli — **4.5.0**, which
is what `MARP_CLI_RANGE`'s `^4.3.1` resolves to today — and read the bytes of
each output:

| Route | Engine CSS in the output | Engine JS in the output |
|---|---|---|
| `marp --pdf` | **none** — no CSS rule, no `@theme` directive survives, confirmed by decompressing every stream in the file | none |
| `marp --pptx` | **none** — the deck ships as 13 slide PNGs at 2560×1440. All 81 zip entries searched for `@theme`, `panel-left`, `var(--`, `@font-face`, `font-family` and `lattice`: zero hits, and no embedded fonts | none |
| `marp --html` | **851,652 characters in one `<style>` element** — the full engine bundle, Marpit-scoped (larger than `lattice.min.css` on disk at 571,643 bytes / 571,517 characters, because scoping expands every selector) | **none** — the runtime stays an external `<script src="lattice-runtime.min.js">` |

**`marp --pptx --pptx-editable` is UNMEASURED.** That variant converts through
LibreOffice, which fails on this deck in the sandbox ("source file could not be
loaded"), so nothing is claimed about it either way. It is a different
representation — real shapes and text rather than one PNG per slide — so it is
the one route where the answer could plausibly differ, and it is the obvious
next measurement for anyone who can run it.

> **Three corrections from the adversarial pass, all in this table.** It first
> said "4.3.1" — but `MARP_CLI_RANGE` is a *range*, and the measurement was made
> with whatever it resolved to, which is 4.5.0. (The figures differ by version:
> pinned 4.3.1 inlines 877,550 characters.) It said "571,517-**byte**
> `lattice.min.css`" — that is the character count; the file is 571,643 bytes.
> And it said "876,200 bytes across 4 `<style>` blocks", which counted with a
> regex: the rendered document has **two** `<style>` elements, and the other two
> matches were template-literal fragments inside marp-core's `<script>`. Of the
> two real ones, 24,338 characters are **marp-core's own** scaffold CSS, not
> Lattice's. A note whose entire authority is "measured rather than reasoned
> about" has to survive re-measurement, so: re-measure before re-citing.

Three consequences, and they are narrower than the original framing:

1. **PDF and PPTX carry no engine object code at all** (the default PPTX route;
   `--pptx-editable` is unmeasured, above). A user who renders either and mails
   it around is outside this question entirely — no exception needed, because
   nothing of ours is being conveyed. The PDF does embed font *subsets* of the
   third-party faces, which the OFL and MIT both permit in a document; the PPTX
   embeds no fonts at all. Those are handled separately by `NOTICE.md`.
2. **Only `marp --html` inlines the engine**, and only the **CSS**. The runtime
   JavaScript is referenced, not embedded, so the AGPL-object-code question is
   about the stylesheet alone.
3. A `--html` file kept on your own disk conveys nothing to anyone. The question
   arises only on **publication or transfer**.

## Which clause actually creates the gap

`LICENSE-EXCEPTIONS` §Limits (a) withholds the exception from the engine "or any
of its source or object form distributed **other than inside a rendered deck**."
A `marp --html` output *is* a rendered deck with the assets inside it. **So (a)
does not exclude it, and neither does (b)** — the assets were not "extracted or
separated from a rendered deck for reuse"; they were embedded into one.

The exclusion comes from two other places, both about **who did the embedding**:

- **Grant:** "you may convey the engine assets that Lattice's export pipeline
  embeds into a rendered deck … **as embedded by Lattice itself** …"
- **§Limits, opening sentence:** "This exception applies only to engine assets
  that **Lattice's own export pipeline** embeds into a rendered deck."

marp-cli did the embedding. The assets are inside a rendered deck; they just
arrived there by a tool that is not us. On a literal reading the exception does
not reach them.

**And a third clause bites, which the first draft of this note missed.** §Limits
(c) also withholds the exception from "any **modified** version of the engine or
of the embedded assets beyond the mechanical embedding the export pipeline
performs." Marpit does not copy the stylesheet in — it **rewrites every
selector** to scope it to the slide, which is why the inlined CSS (851,652
chars) is half again the size of the file on disk (571,517). That is a
modification, and it is not one "the export pipeline performs." Found by the red
team while trying to refute the reading; it strengthens the conclusion, but it
means "which clause" has three answers, not two.

**That is a gap between the license and the product's own instructions**, which
is what makes it worth escalating rather than shrugging at. `dist/marp-kit`
exists for no purpose other than to be rendered by a Marp-family tool — its
README tells the recipient to run exactly this command. Shipping assets *for* a
purpose while the exception's text withholds coverage *from* that purpose is
incoherent, whichever way it gets resolved.

## The scope is wider than the kit

This is not a `dist/marp-kit` question. The **Export-to-Marp bundle** has the
identical gap and a stronger claim to coverage: it is produced by Lattice's own
export pipeline, ships a `package.json` whose `npm run html` script is the
documented workflow, and the final embedding is still done by marp-cli on the
recipient's machine. Any wording change has to cover both, and should be written
in terms of *what the assets were shipped for*, not *which of our tools emitted
the folder*.

## Options

**A. Extend the exception to Marp-family renders of assets Lattice shipped for
that purpose.** — *Recommended.*

Roughly: extend the Grant so it also covers engine assets Lattice distributes
*for the purpose of* rendering a deck with a Marp-family tool, as embedded into a
rendered deck by that tool. §Limits (a)/(b) keep doing the real work: the loose
folder is still not covered, extracting the CSS back out for reuse is still not
covered, modified engines are still not covered. Only the mechanical
"marp-cli inlined the stylesheet we shipped it to inline" case moves.

- **For:** it matches what the product tells people to do; it is the reading
  every user will assume without reading anything; it removes a footgun from the
  exact workflow the kit sells; it costs nothing we were actually trying to
  protect, because §Limits (b) already blocks extract-and-reuse.
- **Against:** it broadens the grant, and **a grant is one-way** — copies already
  distributed under it cannot be walked back. It also needs drafting care so
  "Marp-family tool" does not accidentally read as "any third-party tool that
  inlines our CSS."
- **Touches:** `LICENSE-EXCEPTIONS` (a version bump — it is versioned "1.0"), and
  the `NOTICE.md` wording below gets shorter.

**B. Keep the grant; make the reassurance accurate.** — *The floor, and it ships
either way.*

Say plainly what is and is not covered, so nobody is surprised. This is done in
this change (see below), because an over-broad reassurance in shipped legal text
is a defect regardless of which option wins.

- **For:** reversible, no legal exposure, no drafting risk.
- **Against:** leaves the incoherence in place and leaves a real trap in the
  headline workflow.

**C. Do nothing.** — *Rejected.* `NOTICE.md` currently says "If you only want to
make decks, nothing about this constrains you," which is not true of a published
`marp --html` file on any reading of the current text.

## What this change does, and deliberately does not

**Does:** narrows `NOTICE.md` (via `tools/build-marp-kit.js` `notice()`) to what
is factually true today — PDF/PPTX carry no engine code and are outside this
entirely; `marp --html` inlines the stylesheet, so publishing that file is the
case to read `LICENSE` about. This states the current position accurately; it
grants nothing and withholds nothing.

**Does not:** touch `LICENSE-EXCEPTIONS`. Option A is a change to what Lattice
*grants*, it is one-way, and it is the copyright holder's decision. Awaiting it
is why this note's status is `blocked` rather than `proposed`.

## Logged, not fixed here (HARD RULE #18, off-path)

**The Export-to-Marp bundle ships third-party components with none of their
license texts.** This is separate from everything above, more clear-cut, and was
found while checking the scope of the question.

`lib/core/marp-bundle.js`'s README manifest lists the bundle's contents:
`lattice.css`, `themes/`, `fonts/`, `lattice-runtime.min.js`,
`mermaid-v11.min.js`, config, `package.json`. **There is no `LICENSE`, no
`NOTICE.md`, and no `THIRD-PARTY-LICENSES.txt`** — grep `tools/export-marp.js`
and `lib/core/marp-bundle.js` for "LICENSE" and there are zero hits.

That is the same asset set `dist/marp-kit` ships: Mermaid (MIT), the KaTeX faces
(MIT), and five OFL 1.1 families. **MIT requires its permission notice in all
copies; OFL 1.1 requires the license to accompany the fonts.** Neither travels.

This is precisely the defect the red team found in the kit's first cut — "1 MB of
minified engine and 37 third-party font files with no LICENSE, no copyright
notice, and no font attribution" — fixed for the kit in #1325 and **left live in
the bundle**, which has been shipping longer.

**Why it is not fixed in this change**, rather than being punted: it is off the
path of the marp-kit render gate (HARD RULE #17, one feature one branch), and
adding files to the export bundle alters the bytes of an exported artifact, which
CLAUDE.md's QUALITY BAR makes a **hard stop for owner sign-off**. It should
outrank the exception question on urgency: an unresolved drafting gap in our own
grant is a question, a missing MIT notice is a compliance failure with a known fix
(`thirdPartyLicenses()` in `tools/build-marp-kit.js` already generates exactly
the file needed, from `assets/licenses/`).

> **Tracked as #1354, and deliberately not left in this note.** A Munger
> inversion caught the filing itself as the defect: this note's front matter is
> `status: blocked` and it opens "the licensing call is the owner's," so a reader
> correctly defers the *whole* note — which makes an uncontroversial compliance
> fix hostage to a controversial, one-way grant decision. "Logged in a decision
> doc" and "ignored" are indistinguishable exactly when the doc is blocked and
> there is no issue. **#1354 is independent of everything else in this note** and
> is not waiting on the A-or-B call below.

## For whoever picks this up

1. Owner decides A or B-only. If A, `LICENSE-EXCEPTIONS` goes to 1.1 and both the
   kit `NOTICE.md` and a new bundle `NOTICE.md` cite the new version.
2. Either way, authorize the bundle license fix above — it is independent of the
   outcome and is the same generator the kit already uses.
3. Neither is legal advice and neither was written by a lawyer. The facts in
   §Facts are measured and re-checkable; the reading of the clauses is a careful
   layperson's and is offered as such.
