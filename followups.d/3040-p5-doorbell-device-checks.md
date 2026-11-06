---
origin: 3040
priority: P5
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §3
deferred: blocked — needs a real iPad or iPhone (or a simulator with the software keyboard and VoiceOver driven by hand), which no runner here reaches
---

# Check the undo doorbell where the simulators cannot: keyboard, dictation, VoiceOver, and repeated gestures

PR #3040's undo doorbell (`docs/src/components/studio/undo-doorbell.ts`) passed every `ios-safari-undo` run on the iPad and
iPhone simulators, but those runs drive WebKit's undo command and `insertText`, with no on-screen keyboard, no dictation and
no VoiceOver. (A second gesture undo after a wipe is no longer on this list: each ring now arms ten separate undo
steps, and the probe shows three undos and three redos in a row reaching Filo.) Its adversarial review (red team and inversion) left these unverified:

- **The on-screen keyboard during a ring.** The bell now carries the editor's `autocorrect`, `autocapitalize`, `spellcheck`
  and `writingsuggestions` settings and a 16px size, so the keyboard should not switch modes or the page zoom. Unseen.
  `ios-safari-undo` now taps the editor for real and records the visible height through a ring (the "keyboard ·" row);
  if the simulator raises no on-screen keyboard there (it reads `keyboard height 0 px`), a device has to show it.
- **Dictation.** It sends no composition events, so the bell's composition guard does not cover it; a ring mid-dictation may
  end the session.
- **VoiceOver.** Focus visits an `aria-hidden` field for one edit; VoiceOver may re-announce the editor on each ring.
- **iOS's caret callout** (Paste, Select) closes on a ring.

done when — each is seen on a device or a hand-driven simulator, and either fixed or recorded as accepted with the reason.
