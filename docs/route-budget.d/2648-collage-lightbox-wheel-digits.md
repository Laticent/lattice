studio: +100
playground: +90
home: +30
The collage lightbox now steps on a wheel flick and jumps on the keys 1 to 6, so `present-transport.mjs` gains `digitAction` (about 160 B source) and the opener in `collage-lightbox.mjs` gains the wheel-gate and digit branches. CI measured +78 B gz on studio, +76 B on playground and +22 B on home against main at head 195b3d0; the declared figures add headroom for gzip spread. `createWheelGate` already shipped, and the opener is the shared lightbox the routes already carry, so nothing new is imported.
Given back: the 1 to 6 range lives in the kernel only (a unit test pins that the opener holds no copy), and the wheel handler reuses the zoom path's line-to-pixel scaling in one `unit` variable rather than a second branch.
