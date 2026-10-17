- **Fixed: the Studio's Webpage export no longer shows a reader the authoring overflow marker.**
  Every player the Studio made carried the author level. A deck with a clipped slide reached its
  reader with the red ring, an "OVERFLOWS" tag and a "Fix Me" chip, where the CLI's player shows a
  calm "Content clipped" pill. The export now bakes at the workspace's overflow-marker setting
  (`reader` by default), and the CLI and the Studio run the same cleanup on the baked slides; moving
  that cleanup into a shared function left the CLI's output as it was.
