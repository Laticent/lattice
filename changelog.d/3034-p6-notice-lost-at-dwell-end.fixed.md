- **Fixed: a Studio notice raised just as the previous one closed no longer vanishes, and neither does the next one.**
  Sonner shows a toast one macrotask after it is raised, so a message raised a moment before the current pill's
  2.6 s dwell ended reused that pill's id and merged into it after it had started closing. The message vanished, and
  the notice slot still pointed at the dying pill, so the next message vanished too. That is how "Saved .pricing-trio"
  never showed after a component generate in studio-smoke. `notify.ts` now judges a close by the pill's id and raises
  the swallowed message again on a fresh pill.
