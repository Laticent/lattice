- **Fixed: the Studio's webpage export keeps pictures referenced by URL.** An `![bg](/images/x.jpg)`
  panel, an `![](…)` image and a video `poster` on the site's own origin came out blank in the
  exported player, because its policy loads only pictures carried inside the file. The export now
  fetches each one from the Studio's own origin and embeds it, so it shows in Present, Read · Slides
  and Read · Article. A picture it cannot fetch ships as the placeholder and is named in the
  completion toast with the reason.
- **Added: "Embed pictures from other sites" in the webpage export panel.** Off by default, and
  offered only when the deck shows such a picture. On, your browser downloads those pictures at
  export time and puts them inside the file; off, they ship as a placeholder and the toast names
  each site. The exported file loads nothing from the web when opened, either way.
