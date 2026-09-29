- **Fixed: paging through the Print deck preview no longer builds a new preview per page.** The
  preview cells now come from the Studio's shared preview pool, which reuses its frames, and
  printing the same deck again reuses the frame it already printed. On an iPad, where the browser
  never gives a discarded preview back, paging through a long deck used to hold one preview's
  memory per page viewed for the rest of the session.
