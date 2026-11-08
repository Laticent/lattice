studio: +37
deckCaption and ratioText moved into slide-size.ts so the app and the pre-paint shell word the
"16 : 9 · 7 slides" caption with one function (issue #2085); slide-size.ts ships in the eager
venue chunk, so the move costs 37 gzip bytes. The shell's caption is what brings mobile LCP back
from about 14 s to about 5.6 s.
