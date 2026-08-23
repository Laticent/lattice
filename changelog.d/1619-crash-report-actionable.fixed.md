- **Fixed: errors in a crash report read as findings instead of noise.** Six
  copies of the same error now appear once with a count and a time span, and the
  report separates errors the browser actually described from ones it refused to
  — `"Script error."` with no file, no line and no stack is what a browser shows
  for a script it will not let the page read, so the report says that plainly
  instead of listing six blanks as if they were six Studio bugs. A file that fails
  to **load** is recorded too, by name; that class of failure was invisible
  before, because it never reaches the page's error handler at all.
- **Added: a "What you can try" section on every crash report.** Facts with no
  next step leave the reader to guess. Every line is drawn from that specific
  report — reload after a file failed to load, open the deck once in Chrome when
  the browser reports no memory at all, check a content blocker when every error
  was one the browser hid — and when nothing can be narrowed, it says that rather
  than inventing a chore. The report also leads with what happened and what to try;
  what gets shared moved below them, where consent material belongs.
- **Fixed: a toast with a description is a card, not a stretched pill.** The
  capsule shape is right for "Deck saved"; wrapped around a title, a description
  and a button it grew into a 110px lozenge whose own curve clipped the last line
  of its text. Toasts now round to a card as soon as they carry a description, so
  every multi-line toast is right by default.
