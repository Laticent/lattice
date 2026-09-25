- **Fixed: Read · Article keeps every chart's color in the HTML player.** Status pills on
  progress and timeline-list charts kept their color only on a slide; in the article they
  printed as plain words. The roadmap and matrix-grid header rules drew nothing, because
  they read a token that only a slide defined. And matrix-grid showed as a plain table
  that lost its filled and outlined cells. All three now match the slide, in light and
  dark, on both the CLI and Studio players. Demo: `examples/read-article-chart-paints.md`.
- **Fixed: a flow chart's own caption now appears under it in Read · Article.** The article
  used to repeat the slide heading there and drop the author's caption line.
