studio: +480

Lessons speak (the lesson-voice work in this PR). The narrator, Suono's stage and every clip load
with the first lesson and cost Studio startup nothing. What stays eager is the wiring that makes the
voice playable on iOS: a lazy loader for the voice module, the code that builds the page's one
narrator inside the click that picks a lesson, the `pagehide` disposal, and the effect that starts
fetching the module when search opens. Measured +382 B against `main` at 78eaf0d; declared with
headroom for the P2 and P3 commits in this same PR, which add lesson rows to search (one file per PR).
