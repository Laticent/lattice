---
status: in-progress
summary: >
  #1562's blocker was supply-side: only four texture sets exist and each bakes a literal ramp for
  one palette, so a generated theme could only point at colors baked for a different one — gray
  chips contradicting its own --cat-N-fill. lib/core/texture-ramp.js closes the part that had no
  answer, deriving the fills and both overlay inks from a theme's OWN ramp. The ink numbers are
  MEASURED off the four shipped sets rather than invented: the three dark arms agree at +0.465 to
  +0.560 OKLCH lightness above the mean chip, and the two THEMED light arms whisper at −0.141 and
  −0.251 while a11y drives to −0.557 for a documented reason (a CVD palette has no color channel
  and wants the texture loud). So the light arm targets the whisper band and a11y stays hand
  authored. Result: all 32 shipped themes derive a usable set, both arms inside the band the
  hand-tuned sets occupy, and the derivation REPRODUCES onyx's and concrete's hand-picked inks
  in lightness AND chroma — which is the evidence that the constants are derived rather than
  fitted. Two defects the adversarial trio found are fixed rather than documented: an achromatic
  ramp was steering by 8-bit quantization noise (concrete came out MAUVE, 140 degrees from the
  warm gray the module claimed to reproduce, and one hex digit flipped it to green), and the arm
  was chosen by which light-dark() SLOT a ramp came from rather than by the chips, so carbone's
  single dark ramp got a near-black ink for deep chips. DELIBERATELY DOES NOT emit patterns: texturePatternDefs() is byte-locked against
  texture-defs.golden.svg, so wiring this in is a separate step that re-blesses the golden, checks
  whether export bytes move, and only then lets --cat-N-texture join REQUIRED_TOKENS.
---

# A texture set a theme can derive from its own fills

**#1562.** Split out of #1545, which asked whether `--cat-N-texture` should join
`REQUIRED_TOKENS`. Investigating turned that from a token question into a supply
question. This closes the supply question; it does not close the issue.

## 1. The blocker, restated

A theme adopts texture by pointing twelve tokens at a **pattern-set id**. Only
four sets exist, and each bakes its ramp as **literal hex** in
`lib/core/accessibility-textures.js` — a11y light grays, deeper chart grays,
onyx's grays, concrete's material tints. The literals are deliberate and
documented: they are the iOS all-black-pie guard.

So `deriveTheme` cannot derive a texture the way it derives a color. It could
only point a generated theme at a set whose colors were baked for a *different*
palette — a `brand-mono` theme on a blue-green cycle would get **gray chips
contradicting its own `--cat-N-fill`**. That is a visible mismatch shipped to
close a gate gap, which is worse than the gap.

The missing piece was never the wiring. It was: *what ramp, and what ink?*

## 2. The ink numbers are measured off the shipped sets

The temptation is to pick a plausible contrast target. Instead: measure what the
four hand-tuned sets actually do. Overlay-ink OKLCH lightness against the mean
fill lightness of the ramp it sits on:

| set | arm | ink | Δ lightness | contrast range |
|---|---|---|---|---|
| a11y cat | light chips | `#1a1a1a` | **−0.557** | 4.78–14.20 |
| onyx | light chips | `#8a8a8a` | **−0.141** | 1.05–2.82 |
| concrete | light chips | `#8f8f8c` | **−0.251** | 2.39–2.43 |
| a11y chart | dark chips | `#f5f5f5` | **+0.490** | 2.85–12.46 |
| onyx | dark chips | `#f5f5f5` | **+0.560** | 5.04–12.46 |
| concrete | dark chips | `#EDEBE8` | **+0.465** | 4.85–6.48 |

**The dark arm agrees across all three** — ink sits about half a lightness step
above the chips. `DARK_ARM_DELTA = +0.50` is the middle of a tight cluster, not a
guess.

**The light arm splits, and `engineering/textures.md` already explains the split.**
The two *themed* sets whisper (−0.141, −0.251) so the dark label text on the chip
stays the dominant mark; a11y drives to near-black because a CVD palette has no
color channel to carry the category and wants the texture loud. A derived theme
is in the themed case, so `LIGHT_ARM_DELTA = -0.20` targets the whisper band —
and the a11y family stays hand-authored, which it must anyway.

**The ink carries the theme's hue at low chroma** (`INK_CHROMA = 0.012`), taken
from the ramp's most chromatic chip rather than a circular mean — a mean over
hues spanning the wheel lands on an arbitrary angle, while the most saturated
chip is the one a viewer reads as "this theme's color". That is the whole point of
a per-theme set: concrete's hand-tuned `#8f8f8c` is a *warm* gray, not a neutral
one, and a derived set should be too.

## 3. It reproduces the hand tuning, which is the evidence that matters

Constants measured off four samples could be fitted rather than derived. The test
that distinguishes those is whether the derivation lands where a human landed:

| set | hand-picked | derived | lightness gap |
|---|---|---|---|
| onyx light | `#8a8a8a` | `#7b7971` | within 0.10 |
| onyx dark | `#f5f5f5` | `#e4e1d9` | within 0.10 |
| concrete light | `#8f8f8c` | `#a39ca3` | within 0.12 |
| concrete dark | `#EDEBE8` | `#faf2f9` | within 0.10 |

And a fifth assertion in the other direction: the derived light ink must stay
**well above** a11y's near-black. If that ever started matching, the whisper band
would have been silently lost.

## 4. Every shipped theme derives a usable set

The feasibility claim #1562 is actually asking about. Reading each theme's own
12-slot ramp **the way the palette loads** — a `-dark` wrapper and `a11y-base`
inherit their parent's ramp through `@import`, and measuring the file standalone
is the mistake that produced two wrong published counts in #1527:

- **32 of 32 themes** expose a full twelve-slot `--cat-N-fill` ramp;
- **32 of 32** derive a set whose every arm lands inside the band the hand-tuned
  sets occupy — whisper arm 1.20–3.55 at the widest (onyx), read arm 4.20–10.38;
- the six palettes that declare ONE ramp (the a11y family, carbone) come out
  `static`, the rest `schemeAware` — which is exactly the builder split
  `texturePatternDefs()` already has.

**`carbone` is not "mode-invariant", and calling it that hid a real defect.** An
earlier draft grouped it with the a11y family under that word. It is wrong:
`themes/carbone.css` carries **39** `light-dark()` declarations. What it lacks is a
`light-dark()` pair on `--cat-N-fill` specifically — a different thing, and the
reason its set is `static` is that, not mode-invariance.

The defect underneath: carbone's single ramp is **dark** (mean L 0.367), and the
first cut chose the arm by which SLOT the ramp came from rather than by the chips.
So carbone got the light — whisper — arm and derived `#121116`, a near-black ink
for deep chips, inverted from every hand-tuned set and held off pure black only by
`INK_L_MIN` firing. The arm now follows the chips (`armFor`, split at L 0.5, which
is unambiguous: every light ramp in the corpus sits at 0.77–0.90 and every dark one
at 0.37–0.48), and carbone derives `#d4d2db` at 5.98–8.03 — squarely in the band
the shipped dark arms occupy. Found by the independent checker (HARD RULE #25).

Pinned as a test over the real corpus, not a fixture, with a guard that the walk
is non-empty.

## 5. What this deliberately does NOT do

**It emits no patterns and changes no bytes.** `texturePatternDefs()` output is
byte-locked against `test/unit/core/texture-defs.golden.svg`, and
`engineering/textures.md`'s invariant is explicit that the lock is what keeps
exported PDF/PPTX bytes stable across supply-side work. Emitting 28 more sets
changes that output, so it is a separate step and it carries real questions this
change should not answer in passing:

1. **Re-bless the golden, with justification.** Required by the invariant.
2. **Does the export actually move?** The defs are a `0×0` hidden SVG, so a
   pattern nothing references should paint nothing — but "should" is reasoning,
   and #1596 exists because reasoning was accepted once already. Measure the PDF
   and PPTX bytes before claiming it is inert; if they move, it is a QUALITY BAR
   sign-off.
3. **Page weight.** Four sets today; 32 would be roughly eight times the defs
   markup on every rendered page, inlined into the HTML player as well.
   Emitting only the referenced theme's set is the obvious answer and is a change
   to how the defs are injected, not to this module.
4. **The polarity pins.** A scheme-aware set needs its `…-tex-light-N` /
   `…-tex-dark-N` literal twins or a `_class: dark` slide gets the wrong ink
   (#1323). That doubles the emission and is mechanical, but it must not be
   forgotten.
5. **Only then** can `--cat-N-texture` join `REQUIRED_TOKENS` honestly.

**It does not touch the a11y sets.** They stay literal and hand-authored — the
iOS guard, and §2's documented reason for their louder ink.

**It does not decide that every theme SHOULD have texture.** Texture is redundant
encoding for palettes where hue cannot carry the category alone. Whether a
full-color theme wants it is a design question this module makes *possible* to
answer, not one it answers.

## 6. Not verified

- **Nothing rendered.** The band is a contrast measurement, not a look. The four
  shipped sets were tuned by eye and this reproduces their numbers; whether a
  derived set on, say, `magnolia` reads well at slide scale is unmeasured, and a
  render sweep belongs with the emission step.
- **The 0.40 / 0.45 opacity is not modelled.** The builders paint ink at those
  alphas, so the *effective* contrast on the chip is lower than the raw ratio
  reported here. That is equally true of the shipped sets the band is drawn from,
  so the comparison holds — but the absolute numbers are not what a viewer sees.
- **The band is a range, not a floor.** The test admits whisper-arm ratios down to
  1.0, wider than the 1.05 the shipped sets bottom out at, and a ratio near 1.0 is
  an ink invisible on its chip. Nothing currently derives one — the observed
  minimum is 1.20 — but the band would not catch it if something did.
