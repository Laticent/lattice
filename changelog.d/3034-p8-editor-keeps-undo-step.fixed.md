- **Fixed: on an iPad, Safari's own undo no longer loses a word typed just after the Studio opens.** The deck editor rebuilt
  itself when the component list finished loading, a moment after the Studio painted, and replaced the text you had just
  typed with a fresh copy. WebKit's undo step still pointed at the old copy, so Edit → Undo, the keyboard bar and shake did
  nothing for that word, although the Studio's own Undo button still worked. The editor now updates its lint in place and
  keeps its view.
- **Fixed: on an iPad or iPhone, Safari's own undo works after the live preview redraws.** iOS empties Safari's undo list
  every time the preview's frame reloads, so Edit → Undo, shake, the three-finger swipe and the keyboard bar's undo key
  stopped reaching the Studio for whatever you had just typed. The Studio now keeps that list armed while it has
  something to undo, without touching your text, the caret or redo.
