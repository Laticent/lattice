- **Fixed: the Studio's webpage export keeps pictures referenced by URL.** An `![bg](/images/x.jpg)`
  panel, an `![](…)` image and a video `poster` on the site's own origin came out blank in the
  exported player, because its policy loads only pictures carried inside the file. The export now
  fetches each one from the Studio's own origin and embeds it, so it shows in Present, Read · Slides
  and Read · Article. A picture it cannot fetch ships as the placeholder and is named in the
  completion toast with the reason, and so is every site whose pictures ship as the placeholder:
  the export does not fetch from other sites.
