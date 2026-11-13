- The Studio no longer keeps a copy of every phone-photo slide in memory for its class editor. That memory was capped by the
  number of slides, not their size, so a deck of three phone photos kept about 15 MB and a long editing session could keep
  far more; it now keeps none of a slide past a megabyte, and reads such a slide afresh, which costs the same.
- The Studio no longer freezes when a very large piece of text is typed into the deck source rather than pasted: an IME
  commit, dictation, or a drop the browser turns into text. The browser used to lay all of it out before the editor read
  it, about 12 s for a deck of three phone photos in Chrome; the editor now applies it in one step, as it does a paste.
