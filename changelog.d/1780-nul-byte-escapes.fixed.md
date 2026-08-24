- **Fixed: five tracked source files no longer diff as binary.** Each used a raw
  NUL byte as a composite-key separator inside a string or template literal.
  `AcronymEditor.tsx` and `tools/change-coupling.js` carried theirs inside the
  first 8000 bytes git inspects, so git classified both as binary and `git diff`
  on either printed "Binary files … differ" — review saw nothing at all. All ten
  NULs (and the two raw `0x01` bytes sharing two of the same lines) are now
  written as their `\uXXXX` escapes, which compile to the identical string, and
  `SANCTIONED_NUL_FILES` is empty.
