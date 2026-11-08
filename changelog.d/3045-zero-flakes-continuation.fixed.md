- **Fixed: the Studio preview no longer keeps a photo's zoom cursor after the slide under a still mouse changes.**
  Turning from a collage slide to a text slide with the wheel, without moving the mouse, could leave the `zoom-in`
  cursor and the hover marker on a slide with no photo. The Studio hit-tested the pointer when the slide index
  changed, but the preview frame showed the new slide one render later, so the hit-test read the slide just left and
  nothing tested again. It now waits until the frame shows the slide the reader is on, and every render the live
  preview commits asks for one more hit-test.
- **Fixed: the slide map no longer starts a poster capture while you scroll it.** A capture checked that the rail was
  still, then loaded its code, and a scroll that landed in between got a capture mid-scroll. It now checks again once
  the code has loaded and waits for the rail to settle if a scroll landed.
