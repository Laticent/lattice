// THE ONE WAY INTO THE LINT CORE (authoring-core.generated.js). Import this, never the generated file:
// `docs/src/playground/authoring-door.test.ts` fails on any other importer.
//
// The lint core is 176 KB gz, and nothing on the Studio's first paint needs it, so it loads after first
// paint (engineering/decisions/2026-10-14-engine-spine.md §5). It holds its own copy of the boundary
// parser, and that copy must follow the deck's plugin admission before anyone parses with it. ES module
// evaluation runs this file's body after the lint core and before any importer's body, so switching the
// parser here means no reader, static or dynamic, can see the lint core on a stale grammar.

import { setBoundaryPluginsOff } from './authoring-core.generated.js';
import { adoptLintBoundarySetter } from './lint-boundary-state.js';

adoptLintBoundarySetter(setBoundaryPluginsOff);

export * from './authoring-core.generated.js';
