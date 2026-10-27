- **Changed: the Playground's component picker builds its search index on the first search, not on page load.** The
  index served only searches of two or more characters, but every visitor paid for building it during the page's largest
  startup task, about 160 ms on a mid-range phone.
