- **Changed: the "Stage disconnected" notice now fires only when nobody meant to lose the
  Stage.** Closing the projected window by hand no longer announces itself back to the
  presenter — they closed it. A Stage that stops carrying the deck without being asked still
  reverts the console to plain Present *and* says so, and it now says one of two things
  depending on what is actually observable: the window is still there but showing something
  else (a link click, a reload, a Back), or it is not there at all. A notice that fires for an
  act you just performed is the one people learn to dismiss unread, which costs exactly the case
  it exists for.
