- **Studio: Escape always leaves Present.** When the Studio re-rendered Present while an Escape was still being
  delivered (another window key handler had changed state just ahead of it, most often on a busy machine), Present
  swapped its keyboard listener in the middle of that delivery. Chromium then ran neither copy, so the deck stayed open
  over the Studio and its toolbar took the next click. Present now keeps one keyboard listener for as long as it is
  open, and that listener always calls the newest key handler.
