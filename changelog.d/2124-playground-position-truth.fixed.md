- **Fixed: the Playground's Explore mode no longer names a slide you cannot see.** The
  walk index was write-only — the `N / M` bar, the caption, the Step list and the `?s=`
  URL were set by a step and never corrected — so scrolling the deck left every one of
  them describing the slide you had left, and the next press of Next then scrolled you
  *backwards*. The position now follows the reader's own scroll, at every width.
- **Fixed: a shared `?s=` Playground link, a reload, and Explore → Edit → Explore all
  open on the slide they name.** All three landed the scroll while the in-iframe fit
  agent was still rescaling the deck, which threw it away — so they opened on the title
  slide while the chrome claimed otherwise. The position is now landed after the deck's
  geometry settles, and re-landed after a resize.
- **Fixed: the Playground's keyboard survives clicking the slide.** Clicking the deck
  moves focus into the preview iframe, after which the page's own listener never saw
  another keystroke and the arrow keys were dead for the rest of the session.
- **Added: `PageUp` / `PageDown` / `Home` / `End` and swipe-to-turn in the Playground.**
  The keymap now comes from the shared `present-transport` kernel rather than a
  hand-written two-key list, so the Playground turns a deck by the same rules as Present
  and the Studio — including the keys a presentation clicker actually emits. A horizontal
  swipe turns the slide; a vertical one still scrolls the filmstrip.
- **Fixed: the Playground's component picker opens on the component you are on.** It
  opened at the top of a 69-row list with the first row highlighted, so your own
  component was off screen and pressing Enter to dismiss the picker replaced your deck.
- **Fixed: the Playground's component picker fits the space a soft keyboard leaves.** On a
  phone the panel was a fixed 381px with a 300px list, and the keyboard covered the bottom
  ~336px of it — so the rows you were searching for sat under the keyboard, with iOS's own
  accessory bar floating over what was left. Reported from a real iPhone. The panel now
  sizes itself from the room the browser reports below the trigger — which already has the
  keyboard subtracted — the lens row hides while a search is active (it controls nothing in
  that state), and the search field is 40px rather than 44. Verified on real WebKit at
  iPhone, iPad and Pixel profiles.
- **Fixed: Return in the picker's search box reveals the list instead of replacing your
  deck.** On a phone the return key is how you dismiss the keyboard to see your results;
  it was bound to "select the highlighted row", so searching and pressing return silently
  swapped the deck for the top hit. It now dismisses the keyboard when one is covering the
  panel, and still commits when you can already see the list.
- **Fixed: a search shows its top hit.** Re-ranking left the list scrolled wherever the
  previous one was, so a search from far down a 69-row catalog showed the last three
  results with the best match 634px above the window. The picker also opens centered on the
  component you are already using, rather than at the top of the list.
- **Fixed: resizing the window no longer moves the reader off their slide.** A rescale moves
  every slide while the scroll offset stays put, so the next scroll event described the new
  layout at the old position — and the Playground read a slide index out of it, landing the
  reader one slide from where they asked to be. A rescale now re-lands them instead.
- **Fixed: pressing Next on a cold Playground load steps.** The walk bar mounts long before
  the deck does, and a press in that window reached the scroller while the frame still had no
  slides — so nothing scrolled, and the landing pass then read the deck's position back and
  put the index straight where it started. Measured 3 runs in 8 on a desktop: the bar went
  `1 / 13` → `2 / 13` → `1 / 13` in 11ms and Next did nothing.
- **Fixed: every Playground control now clears the 44px touch floor, on tablets as well as
  phones.** Nine of them were under it — the mode tabs, both pickers, Focus / Deck settings /
  Galleries, and Prev / Next, the surface's primary navigation, at 63x38. The way back out of
  focus mode was the smallest at 34x34. The rule keys on a touch pointer rather than a narrow
  window, so an iPad Pro in portrait — 834px wide, and previously above the cutoff — gets it
  too. It costs 18px of deck on a phone and 36 on a tablet.
- **Fixed: a scroll immediately after pressing Next on a cold load no longer takes the step
  back.** The position readers were willing to read a slide number out of a frame that had no
  slides in it yet, which meant "the reader is on slide 1" when the honest answer was "there
  is nothing here to be on". They now decline, and let the next render place the reader.
- **Fixed: the component picker's search field is a proper field again.** It was a bare input
  whose only focus affordance was the site-wide focus ring — which draws 4px outside the box,
  so the popover clipped it along the top edge. The field now wears the same bordered box the
  Library, Add-a-slide and the Studio's command palette use, and its height comes from the type
  rather than a fixed number: 16px text (the size below which iOS zooms the page on focus) in a
  ~44px box, instead of 16px text crammed into 40.
