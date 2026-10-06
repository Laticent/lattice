- **Fixed: the Studio chat agent no longer reports a slide as fitting when its diagram had
  not drawn yet.** On a slow link, a session's first diagram could miss the fit check's wait
  while Mermaid was still downloading. The slide was then measured with the diagram's source
  text in its place, and the checker told the agent it fit. The checker now says that slide's
  fit was not measured, and still reports every other slide.
