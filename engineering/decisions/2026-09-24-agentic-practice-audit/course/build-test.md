# Build test: an independent agent builds the booking app from the course

**Date:** 2026-10-15. **Method:** one independent agent was given only the deck, not
the README, scorecard or harness. It played the target reader: an engineer who knows git,
pull requests, CI and testing but has never used a coding agent. It followed the primer and
Chapters 1–8 in order and built the room-booking app from an empty repository, applying
each chapter. It logged every gap at the moment it hit one.

**Caveat:** the agent played both the director and the coding agent. No separate tool,
planning mode or fresh session ran, so the course's tool-facing advice was tested only on
paper. A human cold read is still the stronger test, and it hasn't been done.

## Outcome

- **Build:** a Node.js library with no packages: `book()`, `freeRooms()`, UTC storage,
  half-open spans, and a `UtcTime` guardrail.
- **History:** nine small commits.
- **Tests:** 12 of 12 pass. Every key test was seen failing first.
- **A real bug found by the course's own advice:** "look for what's missing" caught an
  impossible date (Feb 30) being accepted.
- **Verified by the author:** the tests re-run and pass, and the Chapter 8 contradiction
  is confirmed.

## Gaps and what happened to each

| Severity | Gap | Fixed by |
| --- | --- | --- |
| Blocker | No tool, no way to start a session or see what the agent did | Primer: a tool table (each tool's instruction-file name and how to start it) and a "first session" slide |
| Blocker | The instruction file had no name or location | Primer tool table; Chapter 2 now says the file sits in the repository root, named for your tool |
| Major | No sample plan, and no word on where a plan lives | Kit: a sample plan that ends with an open question |
| Major | No full schema, so the limits were invented | Kit: the booking schema with every limit |
| Major | No spec: input format, what "free" means, API, stack | Day one: a one-page spec; every code sample now follows it |
| Major | Chapter 4's test took a local time plus a city and used Jest's `expect` | Rewritten to the spec's ISO time format and `node:test` |
| Major | "See it fail first" vs "never skip the hook" | Day one: commit the test and the fix together, with the failing run pasted into the commit message |
| Major | No hook example | Kit: a pre-commit hook plus the one-time setup |
| Major | "Turn on a linter", but nothing for a build with no packages | Kit: a dozen-line lint check whose message says how to fix the problem |
| Major | No follow-up file format, and the check wasn't shown | Kit: the file and its check (two slides) |
| Major | Chapter 6 assumes helper agents with no solo fallback | Chapter 6: give a second session only the diff if your tool can't start helper agents |
| Major | "The mistake stops compiling" doesn't hold in JavaScript, and the Chapter 8 Try it called a check a guardrail | Chapter 8: a typed-language version and a JavaScript version (Kit: UtcTime plus the lint ban); Try it now goes from a check to a guardrail |
| Major | Chapter 3 assumes a permission prompt the course never introduced | Primer "first session": most tools ask before running a command or editing a file |
| Major | Chapter 5's "a test that fails if code compares local times" can't be a unit test | Chapter 5: "a test or a small lint rule" |
| Minor | Four things each claimed to come first | Day one: six commits in a fixed order |
| Minor | Stop-list examples assume a team | Chapter 3 Try it: works for a solo project; the notes give solo examples |
| Minor | Commit hashes in records go stale | Chapter 5: link the pull request, not a hash |
| Minor | 30-minute slots (Chapter 8) weren't in any spec | The spec lists 30-minute slots and the Kathmandu office |
| Minor | "Tried by hand", screenshots and staging don't apply to a library with no UI | **Not fixed.** The app is presented as having screens; the spec's "Not v1: a UI" line now makes the mismatch explicit. A later pass could add a minimal UI to the spec |
| Minor | Retiring an API doesn't arise on day one | **Not fixed, by design.** Chapter 8 is about later months |
| Minor | No how-to for "measure what fills the view" or "say what each agent costs" | **Not fixed.** Both depend on the tool; logged here |
| Minor | Nothing warns that cleanup commands (`git checkout`) destroy uncommitted work | **Not fixed.** Worth a "Common mistakes" row in a later pass |
| Minor | The prompt-injection slide reads as an app feature, and led to a test that couldn't fail | **Not fixed.** The slide's notes say it's a rule for the agent; a clearer heading would help |

## Every kit file was run

On 2026-10-15 each kit file was extracted from the deck itself and run:

- **The lint check:** passes on clean code and catches `new Date()`, exit 1.
- **The follow-up check:** catches a file with no `done when`, exit 1.
- **UtcTime:** London 14:00 equals New York 09:00 on Jan 12, and a time with no offset is
  refused.
- **The hook:** lets a clean commit through and blocks a commit that breaks the lint.
