- **Changed: notifications are one subsystem with a vocabulary, not a bare string.**
  `docs/src/lib/notify.ts` gives every floating message a kind — `status` (disposable,
  one pill, rewritten in place), `action` (text plus one affordance, its own slot) and
  `sticky` (never expires, never evicted) — and the kind carries the policy. At most
  one of each is on screen, which makes the toast cap structural rather than a number:
  three kinds, not three arbitrary messages.
- **Changed: `notify` is no longer a prop.** It reached 175 call sites through 15
  modules, which was a transport problem wearing an API's clothes. It is now a module
  import, matching the repo's existing cross-island store pattern. Every call site's
  text is unchanged; the test seam moves from a prop to `vi.mock`.
- **Changed: the Playground's two hand-rolled toasts become kinds**, and three of its
  messages leave the render-status line — a pane collapsing or a draft being restored
  is an event, not the render's state.
- **Changed: the Undo dwell is unified at 6s** across the Studio and the Playground,
  which previously used 5s and 6s with no recorded reason for the difference.
- **Added: a live region for panel messages that reached nobody.**
  `docs/src/lib/announce.tsx` gives a refusal or a terminal failure an announcement
  without moving where it renders, on five surfaces that had visible text and nothing
  in the accessibility tree. Not applied to progress that ticks, where a region would
  talk over the work it describes.
- **Fixed: a toast behind another is readable again.** The stack is expanded rather
  than collapsed, so a pill behind a newer one is no longer a 4px edge with an
  invisible but still clickable button in it. Safe now that at most one pill per kind
  can be on screen.
- **Fixed: opening a handed-off deck says so once, not twice.** The backup
  confirmation already reports the load, so the second message is suppressed.

