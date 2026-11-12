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
no VoiceOver. Its adversarial review (red team and inversion) left these unverified:

- **The on-screen keyboard during a ring.** The bell now carries the editor's `autocorrect`, `autocapitalize`, `spellcheck`
  and `writingsuggestions` settings and a 16px size, so the keyboard should not switch modes or the page zoom. Unseen.
  Measured on the CI simulators: a real WebDriver tap on the editor raises no on-screen keyboard there (visible height
  unchanged, `keyboard height 0 px`), so this needs a device or a hand-driven simulator. Simulator: I/O → Keyboard → uncheck "Connect Hardware Keyboard", type, let the preview remount, watch the predictions
  bar and Compose's typing chrome (`use-visual-viewport.ts`).
- **Dictation.** It sends no composition events, so the bell's composition guard does not cover it; a ring mid-dictation may
  end the session.
- **VoiceOver.** Focus visits an `aria-hidden` field for one edit; VoiceOver may re-announce the editor on each ring.
- **A second gesture undo after a wipe.** After the wipe the bell arms ONE step; a gesture undo moves it onto WebKit's redo
  list, and the bell will not re-ring while redo holds a step (ringing would empty redo). So a second shake does nothing
  until the next typed word or ring. Strictly better than before the bell, which armed none. **Tried and reverted:** ten
  edits with the caret moved between them give ten undo steps in Playwright's Linux WebKit (6 of 6 gestures in a row),
  but on the iOS simulators they still make one (2 of 6, dispatches 42151613459 and 42151609955), so the change bought
  nothing there and its probe rows pushed `ios-safari-undo` past its 30-minute limit.
- **iOS's caret callout** (Paste, Select) closes on a ring.

done when — each is seen on a device or a hand-driven simulator, and either fixed or recorded as accepted with the reason.
