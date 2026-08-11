- **Fixed: "Delete everything" now stays deleted, even if a Studio tab slept
  through it.** A tab you had navigated away from — parked by the browser, or
  suspended in the background on a phone — is frozen: it is not running, so it
  never heard the "we've been wiped" message the other tabs act on. It woke up
  believing nothing had happened and, five seconds later, wrote its session
  straight back. You deleted your data and a crash record reappeared. Every way a
  tab can wake now re-checks whether a wipe happened while it was asleep, and the
  heartbeat itself checks too, so a wake-up nobody anticipated cannot bring the
  data back either. A wipe leaves behind one timestamp and nothing else — no deck
  content, no identifiers, nothing about what was deleted — because a wipe that
  erased its own evidence could not defend against the next sleeping tab.
