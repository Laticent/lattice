---
status: shipped
summary: >
  validateTrack() and voiceLanguageMismatch() shipped in #2243 with no callers. Both have one
  now, and finding the right place for the first corrected the audit's own account of what it
  protects against: a non-finite time does NOT serialize as NaN:NaN:NaN.NaN any more, because
  formatTimestamp was hardened in that same PR. The real failure is quieter and worse —
  readAlongToVtt accumulates offset += track.durationMs, so ONE bad duration poisons the
  running sum and every LATER slide serializes as 00:00:00.000 --> 00:00:00.000 in a perfectly
  valid file. Measured. Validation now lives at the serializer, so no .vtt this pipeline writes
  can carry a poisoned timeline, and the CLI names the slide it dropped. The language warning
  went to the webpage-export panel, not the Workspace TTS panel, because it is a per-deck fact
  and that sheet is workspace-scoped setup.
companion:
  - ./2026-09-20-narration-audit.md
  - ./2026-07-07-cadenza-caption-timeline.md
---

# Two shipped functions get callers, and one of them corrects the record (2026-09-21)

**Shipped code with no callers rots.** `validateTrack()` (`cadenza/track.ts`) and
`voiceLanguageMismatch()` (`studio/tts-voice-catalog.ts`) both landed in #2243 as the durable
answer to a measured defect, both fully tested, and neither was called by anything. This wires
both.

## `validateTrack` — and what it actually protects against

The audit describes the worst case as a **structurally invalid caption file**:
`00:00:00.000 --> NaN:NaN:NaN.NaN`. **That is no longer true, measured.** `formatTimestamp` was
hardened in the same PR and clamps a non-finite input to zero; its own docblock says so.

What happens instead is quieter and worse. `readAlongToVtt` lays slides end to end with
`offset += track.durationMs`, so one non-finite duration makes the running sum `NaN` and every
LATER slide clamps to zero. Measured on an unguarded three-slide deck:

```
00:00:00.000 --> 00:00:01.000     slide 1, correct
00:00:00.000 --> 00:00:00.000     slide 2
00:00:00.000 --> 00:00:00.000     slide 3
```

The file is valid WebVTT. Every caption after the bad one fires at time zero with zero
duration, and nothing anywhere says so. An out-of-order track has the same shape: it serializes
into perfectly good text that `makeCursor`'s binary search then returns `null` for at every
probe, so the highlight goes permanently dark rather than failing loudly.

It is reachable: `suono/stage.ts:291` computes `(buffer.duration || 0) * 1000`, so a failed
decode yields 0, and `cursor.align()` is public.

**It belongs at the serializer, not at each caller.** Both producers pass through
`lib/core/read-along-vtt.js`, so validating there makes "no `.vtt` this pipeline writes carries
a poisoned timeline" a property of the code rather than a rule every future caller has to
remember. `narratedSlides` drops an invalid track; the new `readAlongProblems` is how the CLI
says which slide went and why.

**The tradeoff, stated so the next person can change it deliberately:** an invalid slide is
DROPPED, not repaired. A non-finite `durationMs` with sound cues could be repaired from the
cues' own maximum end, which would keep that slide's captions — but a track arriving in this
state means something upstream is broken, and silently repairing it is how this survived in the
first place. Dropping loses one slide and keeps every later slide correct.

Verified invisible on a sound deck: all 18 sidecars of `examples/reflow-legal.md` are
byte-identical to the pre-guard render.

## `voiceLanguageMismatch` — the export panel, not the Workspace

Neither speech engine takes a language parameter (OpenRouter's is the OpenAI-compatible
`/audio/speech` shape; kokoro-js derives its language from the voice id's first letter), so for
both model rungs **the voice IS the language** and a `lang: es` deck read by an English voice
was silent about it.

It went to `NarrationExportOptions`, and the choice had two reasons:

- **It is a per-deck fact.** `WorkspaceSheet`'s own header frames that sheet as workspace-scoped
  setup *that a deck overrides from its Inspector* — so a deck-specific warning does not belong
  in it. The export panel already has the deck's `source` as a prop, so `frontMatterLang(source)`
  needs nothing threaded; the Workspace path would need the value carried through two
  components.
- **It matters more there.** A rehearsal voice is one listen the author can correct. This voice
  is baked into every copy the recipient opens.

It reads `value.voice`, not the picker's own state, because `value.voice` is what actually gets
baked — including in the two branches that render no picker at all (an unreachable catalog, and
the on-device tier, which hides the picker while still naming a voice). The warning therefore
sits OUTSIDE the block the on-device tier hides, and is paired with an `<Announce>` mirror: a
warning a sighted author sees and a screen-reader user does not would be a poor fix for an
accessibility-shaped defect.

One small change to the kernel: the message carried markdown backticks, which render as literal
backticks in JSX. It is plain prose now.

## What is NOT verified

**The warning has not been seen rendered on the real Studio — UNVERIFIED, and here is exactly
where the path stops.** It is asserted on the real component under jsdom, which HARD RULE #23
explicitly does not count. So the real Studio WAS built, served and driven in real Chromium
(puppeteer, with `--proxy-server=$HTTPS_PROXY` and a loopback bypass — the gotcha that a browser
here does not use the egress proxy by default): a `lang: es` deck seeded into the store,
Share → Webpage → the narration switch, screenshot at 1440px.

The panel renders, the Spanish deck is loaded, and **"Narration audio" refuses to turn on**:
its own copy says *"Connect a cloud voice in the Workspace, or summon the on-device voice."*
There is no cloud voice (our `OPEN_ROUTER_KEY` must never reach `docs/**` — HARD RULE #24) and
no on-device model (Kokoro needs ~80 MB and WebGPU, which headless Chromium here does not
offer). The voice block — picker, bill, and this warning with it — is gated on
`value.audio && measure?.total`, so with narration blocked there is no voice to warn about and
nothing mounts. That gating is correct; it also means this surface cannot be photographed from
this sandbox without a paid key.

What that leaves: the computation is verified on the real component with real front matter, and
the RENDERED warning is unverified. Somebody with a key, or a machine that can hold the
on-device model, should open Share → Webpage on a `lang: es` deck and look.

**The CLI's warning line is covered by the code path, not by a corrupted real export**, because
no shipped deck produces a broken track — which is itself the point. The drop and the message
are proved through the real `buildReadAlong` + `readAlongToVtt` on real deck prose with one
duration corrupted, and by unit tests; the `console.warn` call itself is one line over.
