---
status: in-progress
summary: >
  Why the docs perf nightly (issue #2085) is red most nights, and the one real step in it. The 11-07 +592 ms TBT reads as
  runner noise. The two red score rows come from the 0.5 floor, which /studio/ and /playground/ never clear. The real
  step is mobile /studio/ LCP going from about 5 s to 14 s on 10-29: after #2940 put Undo and Redo in the phone header, the
  deck title the pre-paint shell draws fell to 64x20 px, so Lighthouse took the app's own "16 : 9 · 7 slides" caption,
  painted after hydration, as the largest paint. The shell now draws that caption itself: median LCP 14.1 s to 5.6 s, 7
  interleaved runs per arm. The nightly also never uploaded its per-run reports; it does now. The floor trips only on a
  crossing past the noise band, and mobile takes 5 runs a night instead of 3.
---

# Docs perf nightly: what is noise, what is real (2026-11-08)

Issue #2085 is the perf nightly's rolling regression thread. It files something most nights. This note sorts the
reports into noise, a gate defect, and the one real regression, and records the fix for the regression.

Sections 1 and 2 come from an earlier session's handoff. That session's raw runs were not carried into this one, so the
figures are quoted, not re-measured. Sections 3 and 4 were measured here.

## 1. The 11-07 +592 ms TBT reads as noise

Run 42370106672 compared base `56253e005` with head `f26b429f1`. Rerun locally with the exact `lighthouserc.mobile`
settings, base and head alternated, 16 runs each (Chromium 141; CI used Chrome 157):

| | base | head |
|---|---|---|
| Median mobile /studio/ TBT | 1,243 ms | 1,433 ms |
| Main-thread work | 6,176 ms | 5,823 ms |
| Eager JS | 561.2 KB | 559.5 KB |

The difference is +190 ms with a 95% interval of −56 to +485 ms, so the nightly's +592 ms falls outside it. Head does
less main-thread work, not more. A simulation of the nightly's median-of-3 crosses its TBT threshold on about 11% of
nights with no code change at all.

## 2. Why the score rows are red most nights

`docs/scripts/perf-regression.mjs` checks the score's `floor: 0.5` before the noise band. Mobile /studio/ sits near 0.40
and /playground/ near 0.45–0.50, so on those pages any drop, even 0.01, files a regression. Those two pages account for
both red score rows on 11-07. `followups.d/3034-p5-perf-floor-trips-on-noise.md` already records this, and it is waiting
on the owner because it changes what the alarm means.

Three gate changes follow from this. None of them raises a budget:

1. **Floor on crossing only.** The floor now trips when base is at or above it and head falls below it by more than
   the noise band (`noiseAbs`, 0.02). A page already under it regresses only through the ordinary tolerance check
   (0.05). Taken in this PR. The owner left the call to the session.
   Two consequences, both deliberate. A drop of exactly a band is inside it: scores come
   rounded to two decimals and `0.5 - 0.48` is `0.020000000000000018` in JS, so the compare
   now takes float error out of every "more than" (an independent check found the floor
   still filing that 0.50 to 0.48 wobble, and the 0.05 tolerance deciding exact-0.05 drops
   by float luck, 41 of 96 one way). And a page under the floor can now slide downhill
   unalarmed at under 0.05 a night (0.40, 0.36, 0.32, ...), because each night compares
   against a base only a day old. Pages above the floor always had that exposure. The
   floor is now a crossing alarm, not a "the score is very low" alarm.
2. **More runs per arm, alternated.** Mobile runs go from 3 to 5 in `lighthouserc.mobile.cjs`, which adds 10 Lighthouse
   runs per arm per night. Desktop stays at 3, because its scores are not near any threshold. Section 1's simulation
   shows median-of-3 is the noise source. Alternating head and base needs both builds served at once and a new collect
   loop, so it is `followups.d/2085-p4-perf-nightly-alternate-arms.md`. The base arm measures with its own config, so
   the first night after merge compares a median of 5 against a median of 3.
3. **Upload the per-run reports.** `actions/upload-artifact@v4` skips hidden files and folders by default. The per-run
   `lhr-*.json` files live under `.perf-out/`, so every artifact so far has held `perf-report.md` alone. This one is a bug in
   an existing step, not a new gate, and this PR fixes it with `include-hidden-files: true`.

## 3. The real step: mobile /studio/ LCP, about 5 s to 14 s on 10-29

The nightly flagged it once (run 40867511090). After that, base and head both carried it, so it reads "unchanged" every
night. The handoff's bisect:

| Build | Mobile /studio/ LCP |
|---|---|
| `2e80facc5` (parent) | 4.7–5.3 s |
| `ed5ff01d6` (#2940, Filo undo) | 13.6–13.7 s |

**Mechanism, measured here at 390 px.** Lighthouse ignores the slide itself because it sits in an iframe. That leaves the
largest text in the main page. #2940 added Undo and Redo to the phone header, in the app and in the pre-paint shell, and the
deck switcher shrank from 182 px to 106 px. The shell's truncated deck title is now 64x20 px (1,280 px²). The
largest early text in view is therefore smaller than the status strip's "16 : 9 · 7 slides" (112x18 px, 2,016 px²). The
shell drew that caption as a neutral bar, so the only copy was the app's, painted after hydration: 97% of its LCP time is
render delay. Head, 3 runs: LCP 14.0–14.2 s, every time on `span.hidden` in `#studio-pane-preview`.

**Fix.** The pre-paint shell draws the caption itself, as #2913 did for the Playground's walk caption:

- `slide-size.ts` gains `deckCaption(ratio, slides)`, which the app and the shell both call, so the two copies cannot word
  it differently.
- `studio.astro` computes `DECK_CAPTIONS` at build time for each built-in deck. It counts slides with `buildDeckIndex`, the
  same index the app's focus hub builds, over the full deck, which is the lens the app boots with.
- The pre-paint seed resolves the boot deck by `loadBootDeck`'s rules (the active deck when the stored index lists it,
  else `index[0]`, else `DECKS[0]`). It states a caption only when that deck is a built-in one with no edited source, on
  a URL with no query and no hash. Every other case (an active id the index does not list, an unreadable record, an
  edited deck, a user deck, a lesson or share link) keeps the neutral bar. The first version of the seed trusted the
  active record without checking the index. The independent checker reproduced three states where the shell then
  painted a count the app corrected: a dangling active id, no active record with `q3-board` first in the index, and an
  edited welcome deck with no active record. All three now show the bar or the right count. 9 boot states were checked
  in a browser, shell against hydrated app.
- `deck-captions.ts` builds the table, and `deck-captions.test.ts` pins it to the count the app's focus hub produces for
  every built-in deck. A count painted and then corrected would be the second content surface
  `2026-07-21-studio-preview-one-skeleton.md` retired.
- The footer band becomes the caption's size container, as the app's preview pane is, so the caption's `@[20rem]` gate
  resolves the same way in both.

When the app hands off, its caption is the same size as the shell's, not larger, so Lighthouse records no new LCP entry.

## 4. Measured

Mobile /studio/ in Lighthouse 12 with the exact `docs/lighthouserc.mobile.cjs` profile (390x844, 4x CPU, 150 ms RTT,
1.6 Mbps). Both builds were served by `vite preview` with gzip, as `astro preview` does in CI. Head and the fix were
alternated each round, 7 rounds, on one machine:

| Mobile /studio/ | head `644f177b` | this change |
|---|---|---|
| LCP, median | 14,141 ms | **5,621 ms** |
| LCP, range | 13,967–14,515 ms | 4,684–5,917 ms |
| Score, median | 0.38 | 0.41 |
| FCP, median | 4,677 ms | 5,054 ms |
| TBT, median | 1,497 ms | 1,466 ms |

After the seed fix in §3, a second interleaved run (5 per arm) on a noisier machine
(head itself ranged 4.9–14.4 s and TBT reached 3.3 s) gave LCP medians of 14,122 ms on head and 6,055 ms with the fix,
score 0.35 and 0.38.

The two LCP ranges in the 7-run table do not overlap. The fix lands back in the 4.7–5.3 s range of the build before #2940. The score moves
only 0.03 because TBT and FCP set most of it. Those are what the 2868-p1 plan is about, and this change does not touch
them. FCP and TBT are within run-to-run spread.

**A first attempt measured wrong, recorded so nobody repeats it.** The first fix arm ran on `python -m http.server`,
which sends no gzip. Simulated FCP rose to about 10 s on both arms, which made the numbers useless for comparison. Compare
builds on a compressing server.

**Correctness checks.** All 3 built-in decks' build-time captions match the hydrated app's text exactly. Pre-paint at
390 px: a newcomer sees the welcome deck's caption, a returning visitor on a built-in deck sees that deck's, and an edited
deck, a user deck and a `?lesson=` URL show the bar. Screenshots of shell against app at 1440, 820 and 390 px show the
caption in the same place. `studio-shell-parity` and `studio-instant-shell` pass, apart from two slide-box-width cases
that fail the same way on `main` (`followups.d/2959-p4-instant-shell-slide-box-width.md`).

## 5. Compared with the 2026-09-22 build (from the handoff, 10 runs)

| | 09-22 build `37fa5a30` | head |
|---|---|---|
| Score | 0.48 | about 0.40 |
| LCP | 5.2 s | 14.2 s (5.6 s with this change) |
| TBT | 984 ms | about 1.4 s |
| Requests | 148 | 257 |
| "Unattributable" scripting | 129 ms | about 820 ms |

With LCP back, what is left of the gap to 09-22 is TBT and request count. The 2868-p1 plan already lists the levers:
load chart builders on demand, mount fewer React components before the slide, and find the extra unattributable work.
Their gains are inferred, not measured.

## Not measured

- `startup-bench` on head against the 09-22 build.
- Long tasks attributed to chunks from a real trace.
- A like-for-like CDN comparison. The PR's Cloudflare preview was measured against production (`lattice.style`, GitHub
  Pages, no fix), 3 runs each, alternated. The two hosts differ (Brotli, caching), so only the direction counts:
  LCP median 9.8 s on production against 5.2 s on the preview, score 0.44 against 0.49. Every production run took the
  app's late caption as its largest paint. The one preview run where Lighthouse could name the element named the shell's
  caption.
