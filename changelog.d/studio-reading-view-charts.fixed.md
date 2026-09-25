- **Fixed: the Studio's Reading view draws every chart in color.** Radar, bar, heatmap and
  quadrant charts used to paint solid black there, and kanban, progress and roadmap charts
  printed as plain text, because the view shipped no deck stylesheet. It now ships the deck's
  styles, cut down to the rules its charts use and kept off the app around the article, in
  light and dark.
  Theme fonts, animations and remote images do not carry into the view, so a shared deck
  cannot restyle the app or fetch from it.
