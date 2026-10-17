studio: +64
home: +7
The home page and the Studio nav list a tenth library, Mosaico (one nav entry and "Ten
libraries"). The Studio's runtime also reads the canvas scale from one shared function,
`canvasScaleFor` in `lib/adaptive/families.js`, instead of carrying its own copy of the formula,
and its logo-wall planner gained two guards: it refuses mark shapes mosaico would read as 1:1, and
it holds every mark to the old row's height. CI measured +8 bytes on the Studio before the last
planner change; the declaration leaves room for it rather than chasing single bytes.
