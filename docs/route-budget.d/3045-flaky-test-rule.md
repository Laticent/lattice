studio: +6
The optional `work` step counter in lib/core/meta-record.mjs `comments()` (HARD RULE #32): its test now asserts the comment scan stays linear on the steps it took instead of on milliseconds. Production callers pass nothing; the bytes are the two `if (work) work.steps++` lines and the parameter.
