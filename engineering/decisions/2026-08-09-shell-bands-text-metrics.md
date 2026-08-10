---
status: shipped
summary: The Studio's pre-paint shell drew its structural bands from constants measured once at the default font size, so a reader who raised the browser's MINIMUM font size (Chrome's low-vision setting) got a visible seam at hand-off — measured against the real app at 24px, the preview sub-bar was 18px short, the footer 38px, the status strip 20px, and the footer's top sat 39px high. Root cause was NOT stale numbers but skeletons with no text to measure - ContentBar was a fixed 10px block, and text classes on the ROWS do nothing because those rows are display:flex and a flex container has no strut, so only a child genuinely containing text can track font size. FIX: the placeholder carries a zero-width space so it occupies the line box its text would, three elements were corrected against the app's own markup (the lens trigger's px-3 py-1.5, the slide counter's px-2 py-0.5, and a duplicated footer hairline), and the bands are FLOORED by PREVIEW_CHROME rather than pinned to it (min-height, not height). At the default size content lands exactly ON the constant, so the common case is unchanged - 0px on every band, full 38-case matrix green - while above it each band tracks the app to <=1px at 18px and 24px. A new `minfont` Playwright project launches Chromium with --blink-settings=minimumFontSize=24 (the same Blink knob the real setting drives) and PROVES it - the new cases fail 2/2 on the unfixed code and pass 2/2 on the fixed. Two placements still derive from constants and are pinned by bound rather than left invisible: the phone sub-bar's top (<=24px, since mobileBarH places everything below the action bar) and the slide box's top on a wide viewport (<=11px; its SIZE is unaffected). A post-paint measure-and-republish fixes both numbers and was BACKED OUT - it raced the rotation re-seed, republishing the previous orientation's geometry without re-running the box placement, and coincided with two orientation specs failing intermittently (2 of 38 on one run, 0 on the next) and was reverted on the reading that it raced the re-seed — an attribution later found NOT to be established, since clean main fails the same two specs at a similar rate (#1514). The revert stands on the narrower claim that the correction was not shown to be safe and the residual it fixes is bounded and pinned. The general rule: a skeleton standing in for text must occupy the line box that text would, or it is a measurement frozen at whatever font the author happened to be using.
---

# The shell's bands had no text to measure (#1496)

**Date:** 2026-08-09 · **Status:** SHIPPED

## The report, and what was actually wrong

The Studio's pre-paint shell draws its structural bands from fixed constants in
`preview-rect.ts` — `headerWrite: 47`, `footerWrite: 81.6`, `statusH: 30.6`. Every one is a
**content-sized** band frozen as a number measured once at a default browser font size.

Raise the browser's **minimum font size** — a low-vision setting at Chrome's *Settings →
Appearance → Customize fonts* — and the app's rows grow, because they are sized by their text.
The shell kept drawing them at the frozen height. Measured on the real built site in the pinned
Chromium, shell against app:

| Band | 18px | 24px |
|---|---|---|
| preview sub-bar height | +9 | **+18** |
| preview footer height | +20 | **+38** |
| preview footer top | −20 | **−39** |
| status strip height | +11 | **+20** |
| phone sub-bar top | +15 | +24 |
| slide box top (wide) | −6 | −11 |

At the default size every band was 0px apart, which is why nothing had ever noticed.

The issue proposed re-measuring, or letting the bands "size themselves from the same real
text". The second is right in spirit and was not, on its own, possible: **there was no real
text.**

## The root cause: a flex row has no strut

`ContentBar` — the neutral placeholder that stands in for per-deck content the shell must not
draw — was a fixed block:

```tsx
<span className="inline-block h-2.5 rounded-full bg-current opacity-25" />
```

10px at every font size. So a row built out of these cannot track anything.

The obvious repair — put the app's text classes on the *row* — was tried first and **did
nothing**, and the reason is worth recording because it is easy to get wrong twice: those rows
are `display:flex`. A flex container establishes no line box and therefore has no **strut**, so
its font-size cannot set its height. Only a child that genuinely contains text can. That is
exactly why the app's rows grow: theirs contain real slide labels and real status text.

Measured proof of the mechanism, before and after, natural (content) height of the skeleton:

| | default | 18px | 24px |
|---|---|---|---|
| status strip, before | 23 | 23 | 23 |
| status strip, after | 30.6 | 41.8 | 51.4 |
| *the app's* | 30.6 | 42 | 51 |

## Decision

1. **The placeholder occupies the line box its text would.** `ContentBar` now carries a
   zero-width space at the inherited font size, with the visible bar keeping its own 10px
   height and centering inside whatever line box results. It contributes height and nothing
   else — no per-deck value is asserted, so the rule from
   `2026-07-21-studio-preview-one-skeleton.md` is intact.
2. **Three elements were corrected against the app's own markup**, because faithfulness is what
   makes self-sizing land on the right number rather than merely a growing one:
   - the lens trigger was `px-2.5 py-1` against the app's `px-3 py-1.5 text-[12.5px]` — it is
     the tallest thing in that row, so under-sizing it held the whole band ~8px short;
   - the slide counter was `px-2.5 py-1.5` against the app's `px-2 py-0.5`, which is where the
     sub-bar's natural 52.6px against the app's 47 came from;
   - the navigator row carried a `border-t` that `.ssr-paneftr` already draws — one hairline
     too many, worth exactly the 1px the footer was out by once it stopped being pinned.
   The skeleton also mirrors the app's `@[21rem]` container query on the lens label, which is
   what makes the app's bar 41px on a narrow pane; without it the narrow case drew 47 against 41.
3. **The constants become a FLOOR, not a pin** — `min-height`, not `height`. This is the whole
   of why the change is safe: at the default font size the faithful content lands *exactly* on
   the constant (47.0 against 47, 30.6 against 30.6), so the floor decides and the common case
   is byte-identical.
4. **A `minfont` Playwright project** launches Chromium with
   `--blink-settings=minimumFontSize=24` — the same Blink knob the real setting drives, so this
   is the axis itself and not an emulation of it.

## What was tried and backed out

The phone's sub-bar is still *placed* from `mobileBarH`, so it sits up to 24px high for these
readers even though its own height is now correct. The obvious fix is to measure the shell's
action bar after paint — it is already fluid and already correct — and re-publish the offset.

It was implemented, and **reverted**. Two defects, one fatal:

- A bare `requestAnimationFrame` fires *mid-parse*: this seed is inline ~400 lines above the
  shell markup, so the callback found no `.ssr-actionbar` and silently did nothing. Waiting for
  `DOMContentLoaded` fixed that, and the correction then worked — the phone went to 0px on
  every axis at every font size.
- With it applied, `rotation into cinema` and `a rect from another orientation` failed
  intermittently — 2 of 38 on one full run, 0 on the next — and the correction was reverted on
  the reading that it raced the re-seed: a pending callback can fire after a resize has already
  re-seeded, republishing the previous orientation's geometry, and it does not re-run the box
  placement. That mechanism is real and the code did have it.

  **That attribution was not established, and the record should say so.** The baseline was
  measured afterwards: **clean `main` fails the same two specs at a similar rate** — one
  failure in each of two consecutive full matrix runs, with nothing applied. So the observed
  failures are equally consistent with a pre-existing flake in that family, and this data
  cannot separate the two. Logged as #1514.

The revert still stands, on a narrower claim than the one first written: the correction was not
shown to be safe, the residual it fixes is bounded and now pinned, and the honest way to
re-attempt it is against a known baseline rate rather than against a suite that fails ~1 spec
per run on its own.
Doing it properly means folding the correction into the re-seed path itself, so that one code
path owns bands and box together; that is a change to the shell's most delicate code — the one
three adversarial rounds have already found nine defects in — and it belongs in its own pass,
not bolted onto this one.

## The residuals, pinned rather than hidden

Both surviving drifts are asserted **by bound** in the `@minfont` cases, so neither can grow
without failing:

- phone sub-bar `top` ≤ 26px (measured 24 at 24px minimum font);
- slide box `top` ≤ 13px on a wide viewport (measured 11). Its **size** is unaffected — the
  stage reserves bottom padding from `--sh-ftr`, which is still the constant.

## Verification

- **The guard was proved able to see the defect**, which is the only thing that separates an
  oracle from decoration: with the spec and project kept but the fix stashed, both `@minfont`
  cases **fail** (`preview sub-bar height`); with the fix, both pass.
- **The default case is unchanged**: the full shell matrix — `studio-instant-shell.spec.ts` (16
  cases) plus `studio-shell-parity.spec.ts` — is **38/38 green, twice**, on desktop and mobile.
  That is the no-regression guarantee, and it is a test run rather than a judgment.
- All of it on the real built site in the pinned Chromium (build 1194), not a harness.

## The rule

**A skeleton that stands in for text must occupy the line box that text would.** Otherwise it
is not a placeholder for the content — it is a measurement frozen at whatever font the author
happened to be using, and it will disagree with the real row for every reader who does not
share that setting.

And its corollary, which is what actually made this invisible: **a guard that runs only at
default settings cannot see a settings-dependent defect.** Every band oracle in this repo ran
at one font size, so the axis did not exist as far as CI was concerned.
