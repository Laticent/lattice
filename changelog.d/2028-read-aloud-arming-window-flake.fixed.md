- **Fixed: the read-aloud arming-window test no longer reports a phantom regression under
  load.** It held the voice model behind a private `vi.doMock`, which intermittently lost
  to the file's hoisted `vi.mock` for the dynamic import `getVoice()` makes — so the voice
  resolved synchronously, the loop armed, and the test blamed the product. The file's own
  stub now carries the gate, so no second registration has to win: 0 failures in 30
  contended whole-file runs, against 5 in 30 before.
