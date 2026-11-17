studio: +187
playground: +200
home: +187
getting-started: +187
The sheet's scrim now counts a tap from the sheet's first frame (components/ui/sheet.tsx, in the eager overlay-back
chunk on every route that can open a sheet): it marks a pointerdown on the scrim and, when Radix has not yet armed its
outside-tap listener, routes the click through the caller's own outside-tap handlers. That is the 187 bytes. The
Playground's other 13 are its pick being remembered when it is made (PlaygroundApp.tsx `rememberComponent` and the
in-flight branch of the URL sync). Both fix product defects that e2e tests met under load (back-gesture:172 and
playground-state:52).
