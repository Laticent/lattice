- **Fixed: an abbreviation's period no longer ends a caption cue.** `Dr. Chen approved
  it.` was segmented as two cues, so the voice said "Doctor." — full stop, real silence —
  and then "Chen approved it." A cue is one caption line, one re-anchor unit and one
  synthesized TTS clip, so each spurious break cost a line, a round-trip and an inserted
  pause, and mispriced the words either side of it. `splitSentences` now folds a break
  back when the word before it is an abbreviation or the fragment after it starts with
  punctuation that cannot open a sentence. Measured on `examples/reflow-legal.md`: 72 cues
  → 61, with `Cal. Civ. Code §1798.140(o)`, `15 U.S.C. §6501` and `16 C.F.R. Part 312`
  each now one cue instead of three.
- **Fixed: a sentence ending inside a closing quote now ends its cue.** `Setup was "3–4
  weeks." It took 11.` was one run-on clip, because the terminator sat behind the quote.
- **Removed: `voice-model.js`'s local `splitSentences`.** It was a byte-identical copy of
  Cadenza's kept for a caller that no longer exists — read-aloud segments from
  `track.cues` — and its only importers were its own two tests. Segmentation now has one
  implementation rather than two pinned together.
- **Fixed: a two-period range separator no longer ends a cue.** `gantt` spells a span
  `2026 Q1 .. 2026 Q4`, which broke into two cues on nine shipped decks. Three periods
  are unchanged — an authored ellipsis can genuinely end a sentence.
