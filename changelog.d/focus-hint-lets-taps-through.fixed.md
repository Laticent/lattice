- **Fixed: a hint that keyboard focus opened no longer swallows the next tap.** Pressing Escape to close a
  sheet hands focus back to the button that opened it, and that button's hint opens. On a phone the Chat
  button's hint sat over Workspace settings in the header, so the next tap hit the hint and did nothing.
  The `Tip` component now lets the pointer pass through a hint that focus opened. A hint opened by
  hovering still keeps its own hit area, so the pointer can rest on it without closing it.
