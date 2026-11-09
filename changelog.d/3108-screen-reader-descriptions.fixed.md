- **Fixed: a screen reader hears the same, useful description on a Studio control however it got
  there.** A tooltip hint described its button only while the tooltip was open, which a keyboard
  Tab did and a VoiceOver swipe did not; every icon-bar button lost its hint entirely; nine hints
  only repeated the button's name ("Share… Share"); Coach rows were described by their raw rule id
  (`metric-no-referent`); and the Reshape picker had no name. `Tip` now describes its trigger by
  what the hint adds to the name, from mount, and `e2e/studio-descriptions.spec.ts` fails on a
  description that repeats a name or is a raw id, and on an unnamed dialog.
