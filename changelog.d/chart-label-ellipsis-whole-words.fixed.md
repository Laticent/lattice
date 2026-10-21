- **Fixed: a chart label that runs out of lines ends on a whole word.** "peaked afte…" now reads
  "peaked…". A label that is one word too long for its line still cuts by characters.
  (`lib/components/chart/_chart-family/svg-label.js` `measureLabel`.)
