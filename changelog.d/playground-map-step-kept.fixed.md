- **Fixed: a jump on the Playground's slide map is no longer lost on a busy page.** With the map open in Explore,
  "Map, last slide" followed quickly by "Map, previous slide" could leave the walk bar on the last slide: the first
  jump's smooth scroll was still traveling when the second asked for a slide the walk already named, so the second
  never scrolled and the first carried the reader past it. A jump (first, last, a map tile, the Step list) now
  always aims the preview at its slide, even when the walk already names it.
