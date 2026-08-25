- **Changed: the "Stage disconnected" notice now fires only when nobody meant to lose the
  Stage.** Closing the projected window by hand no longer announces itself back to the
  presenter — they closed it. A window that is navigated away, or that vanishes without a
  goodbye (a killed renderer, a discarded tab, a projector that lost power), still reverts the
  console to plain Present *and* says so, and the two now say different things: a navigated
  Stage is still on the projector showing the room the wrong page, while a vanished one left it
  blank. A notice that fires for an act you just performed is the one people learn to dismiss
  unread, which costs exactly the case it exists for.
