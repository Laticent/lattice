- **Fixed: Studio status messages no longer pile up.** Every transient
  confirmation minted its own toast and the Toaster showed three at once, so
  anything that spoke twice inside the 2600ms dwell stacked — measured at three
  pills on the real Studio for three confirmations in a row. Status messages now
  share one Sonner id and rewrite a single pill in place, and the stack is capped
  at two so the worst case on screen is that pill beside one toast carrying an
  action (Undo, Reload), which keeps its own slot rather than being replaced by
  unrelated text.
- **Fixed: a Library bundle import reports its outcome in one message.** Refusals
  went out in a loop, one toast each, so a bundle carrying four bad scenes raised
  five pills at once and buried its own success line. The import now raises a
  single message with the refusals named beneath it.
- **Fixed: a Library import that fails now says why.** The funnel named the real
  reason and then overwrote it with a generic line in the same tick, so a corrupt
  file reported as an empty one. The reason is the headline, with whatever did land
  underneath it.
- **Fixed: a settings Undo no longer leaves a dead button on screen.** Two settings
  writes inside 5s left two Undo toasts, and the older one's action was already
  guarded off — it did nothing when clicked. The previous Undo is retired when the
  next one is raised.
