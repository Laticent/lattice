---
date: 2026-07-18
status: in-progress
summary: >
  Final adversarial-trio pass (red team + Munger inversion + independent checker,
  12 agents) over all four shipping libraries — suono, lente, cadenza, vetrina —
  with every aspect on the table (engine, builder DSL, dist/publish, demo page,
  brand mark, security, a11y, docs honesty). On-branch demo fixes landed with the
  storyboard PR; this doc is the durable backlog for the OFF-PATH library-engine /
  packaging / docs findings (HARD RULE #18) and records two decisions.
tags: [libraries, security, packaging, adversarial-trio, backlog]
---

# Library adversarial-trio backlog (2026-07-18)

Ran the full trio (HARD RULE #25) as a 12-agent workflow: red team + Munger
inversion + independent checker × { suono, lente, cadenza, vetrina }. 0 agent
errors, ~1.35M tokens, 51 raw findings → deduped below. Anima excluded (WIP).

**Verdict spread:** suono SHIP (polish only); cadenza / vetrina SHIP (one real
engine bug each, off the demo path); **lente FIX-FIRST** — the only library with
a confirmed correctness/security defect in a load-bearing claim.

## Landed on the storyboard branch (on-surface, HARD RULE #18 "fix what you touch")

These are on the demo `.astro` pages this branch built/rebuilt, so they were
fixed in place (see `CHANGELOG` › Fixed):

1. **cadenza self-XSS** — the "spoken" readout used `innerHTML` with raw narration
   tokens on a page holding the BYOK key; now DOM/`textContent`.
2. **cadenza seek-bar a11y** — `role="slider"` was focusable-but-inoperable; added
   keyboard scrub + `aria-value*`.
3. **lente label sink** — parsed lens labels via `innerHTML` → `textContent`.
4. **lente deferred-timer leak** — beat `setTimeout`s now tracked + cancelled on
   Stop/Reset/beat-switch.
5. **lente demo copy** — dropped the false "a scoping lens can be a redaction" line.

## Decisions required

### D1 — lente `approvalHash` is non-injective → fail-OPEN (CONFIRMED at runtime)

`project.ts` serializes member pairs as `` `${index} ${slide}` `` joined by `\n`.
The pre-image is ambiguous: a slide body containing `\n1 <text>` forges a record
boundary, so two structurally different decks hash equal. Two agents confirmed
`approvalHash(['a','b']) === approvalHash(['a\n1 b'])` against `dist/index.cjs`.
A drifted deck can therefore read as **approved**, directly falsifying the
documented invariant (`project.ts:44-46`, `README.md:67`: "Any later edit … changes
the digest, so the lens de-approves itself"). This is the core promise of a
security-shaped primitive.

- **Fix** is small and mechanical: injective encoding — length-prefix each record,
  or hash each slide independently then hash the list of digests.
- **Caveat:** changing the hash **invalidates every already-stamped `approved:`
  value** (a breaking change to stored approvals) → needs a `**Breaking:**`
  CHANGELOG line + a note for any consumer with persisted approvals.
- Options: (a) fix now in a **separate** lente-library branch (keeps #17 one-feature-
  one-branch intact — the storyboard PR must not grow an engine fix); (b) fix folded
  into this PR only if we accept widening its scope; (c) track for a dedicated
  security pass. **Recommendation: (a)** — real, cheap, and worth doing, but as its
  own branch/PR.

### D2 — the ESM publish story is house-wide and honest-only-for-bundlers

Every package (`suono`/`lente`/`cadenza`/`vetrina`) maps `exports["."].import` →
raw `./index.ts`; only a CJS `dist/index.cjs` is built. A bare-Node ESM consumer
(`import … from '@slidewright/x'`) hits `ERR_UNKNOWN_FILE_EXTENSION ".ts"`; only
`require()` or a TS-aware bundler works. The `vetrina` README even shows a
`./vetrina/index.js` that is never emitted, and several READMEs pitch
"framework-free / buildless / no bundler required." This is a **deliberate,
already-merged, house-wide** pattern (matches the merged `@slidewright/suono`),
so per #18 it is off the storyboard path and NOT this PR's to fix.

- Options: (a) emit real ESM `dist/index.mjs` per package + point `import`/`module`
  at built artifacts (makes the "publishable" claim true for all consumers);
  (b) keep bundler-first but soften every README's "buildless" wording to match.
  **Recommendation: track as a packaging epic** (one branch touching all four
  `package.json` + build scripts + READMEs), decoupled from demos.

## Off-path backlog (track; do NOT pull into the storyboard PR)

Real defects in shared library engines / packaging / docs this branch never
touched. Grouped by library, most-severe first.

**cadenza**
- `normalize.ts:71` (**major**) — `integerToWords` emits the literal `"undefined"`
  for integers ≥ 10¹⁵ (`SCALES` indexed past its end). `toSpoken('1000000000000000')`
  → `"oneundefined"`, and that string reaches captions + exported VTT/SRT. Guard with
  a digit-by-digit fallback; add a ≥quadrillion test.
- `vtt.ts:61` (minor) — `toSrt` numbers blocks by array index, not emitted count, so a
  consumer-assembled track with an empty-word cue yields non-sequential SRT numbers.
- `normalize.ts:77` (nit) — public `numberToWords(1e-7)` returns `""`.
- `package.json:22` (minor) — AGPL declared, no LICENSE in the publish `files` (same
  house-wide omission as merged suono).
- `README.md:87` (nit) — API table lists only `pace`, omits real `acronyms/lang/
  rateScale/lexicon` BuildOptions.

**vetrina**
- `react.ts:58` (**major**) — `useWalkthrough.start()` guards only its own handle, not
  the module-level `activeRun`; a second live walkthrough makes `run()` throw uncaught
  and wedges the button (`active` stuck true). Wrap in try/catch + reset.
- `runner.ts:127` (major) — the global single-flight latch forbids two `scope:'root'`
  embedded tours on disjoint subtrees (the feature's stated use). Per-root latch, or
  document one-tour-per-page.
- `runner.ts:173` (major) — the 350ms post-`awaitUser` suppression window swallows
  genuine off-target input, weakening "first real input wins instantly." Scope the
  suppression to the resolving gesture's own trailing event.
- `README.md:62` (major, docs) — "the actions bag is inert after take-over" overclaims:
  `guardedActions` only neutralizes TOP-LEVEL functions; nested/closured setters still
  fire. Deep-guard or soften the claim.
- `scene.ts:132-133` (minor, dsl) — `scene().build()` aliases the live steps array
  instead of snapshotting (`toData()` copies); mutating the builder after `build()`
  corrupts the built Walkthrough. Return `storyboard(seed, this.toData())`.
- `stage.ts:449` (minor) — `tween()`/`circleGesture()` never settle if `destroyed`
  flips without a signal abort → an awaited `stage.point()` hangs after `destroy()`.
- Demo nit (`vetrina.astro:155`) — "hand off the instant you touch anything" but the
  guard ignores wheel/touchmove; narrow the copy or add wheel/touch to the classifier.

**suono** (exemplar — polish only, all SHIP)
- `sequence.ts:115-118` (minor) — `waitIfPaused` subscribes to one gate instance and
  doesn't re-arm across a synchronous resume→pause in a single task → a rare
  missed-wakeup stall (self-heals on `stop()`; not reachable from discrete clicks).
- `sequence.ts:235` (minor) — the decode-race abort listener is added `{once:true}` per
  item and not removed on the decode-wins path → N listeners accumulate on one signal
  over a long deck (MaxListenersExceeded risk). Remove in `.finally`.
- `stage.ts:541` (minor) — keep-alive defaults ON, injecting a continuous 70Hz
  oscillator into `ctx.destination` for ~30s after every clip; can hold audio focus /
  battery for a frequent short-clip consumer. Consider opt-in.
- `sequence.ts:58` (nit) — `concurrency: NaN` silently plays nothing (clamp isn't
  finite-guarded).
- `encode.ts:75` (nit) — `wrapPcm` doesn't pad an odd-length PCM payload → RIFF
  word-alignment violation for odd byte counts.
- `stage.ts:588` (nit) — `stopAll()` resolves `done` as `{ok:true}` not
  `{ok:true,aborted:true}`, unlike the signal path — a consumer can't tell a forced
  stop from a natural end.
- `README.md:6` (minor, docs) — headline sells the iOS/CarPlay/keep-alive path as
  "handled/reliable" while the code + §Files admit it's UNVERIFIED on real devices
  (HARD RULE #23). Soften to "lifted from voice-model.js; on-device re-verification
  pending."
- Demo a11y nit (`suono.astro:164`) — the showcased `#caption` is not an `aria-live`
  region, so its per-onset updates are silent to AT.

**lente** (beyond D1)
- `README.md:27` (**major**, docs) — the 60-second snippet labels approval-blind
  `lensSlides()` output as "What a reader sees," teaching consumers to render
  unapproved/redacted content. Drive `lensEligibility`/`project()` in the reader
  snippet; relabel `lensSlides` as author-preview.
- `project.ts:47` (major, positioning) — the "human-approved" guarantee is
  unenforceable against an actor that can write the deck source (unkeyed exported
  `approvalHash`); the AI-Reshape threat the design doc names is reintroduced. Either
  re-scope docs to "accidental-drift detection" or bind approval to a workspace secret
  (HMAC/signature).
- `project.ts:51` overclaim (major) — "a confidentiality breach dressed as a fallback"
  framing is false: client-side filtering of an array the client already holds is
  `display:none`, not redaction. Re-scope README/demo/design §6.3.
- `README.md:62` (major, docs #23) — claims the read/suggest split is "a boundary the
  build gate enforces," but `checkLenteBoundary` allows every `./` import, so
  `project.ts` could import `./suggest` and pass CI. Add a real gate or soften to
  "by convention."

**brand marks** (all libraries, nit) — the `<img>`-embedded SVG marks switch palette
via in-SVG `@media(prefers-color-scheme)`, so they follow the OS scheme, not the demo's
manual `data-theme` toggle (already noted as a known limitation in the storyboard PR).
`suono-mark.svg` also ships a dead `.wm` CSS rule and a paper-locked `.halo` fill.

## Next steps

- **D1**: on approval, a dedicated `lente` security branch (injective hash + breaking
  note + docs re-scope) — separate PR.
- **D2**: a packaging epic (ESM builds or README wording) — separate PR.
- Off-path items: fold into the above two branches where they overlap (lente docs, the
  packaging/README/LICENSE cluster), else file per-library follow-ups. None gate the
  storyboard PR.
