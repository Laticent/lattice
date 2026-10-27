// The deck front-matter keys the Studio offers, with a one-line description each.
//
// A VIEW of the engine's table, lib/core/deck-settings.js, since 2026-10-16. This file used to
// be the list itself, one of four hand-written enumerations of the front-matter surface that
// checked only each other, and it had drifted: `icon` and `avatar` (plugin registers) were
// never offered, and `plugins`, `greeting` and `closing` were documented in LFM but not here.
// Every offered row of the table is a key here, and each plugin-declared register joins it
// from the plugin registry's data, so a new register is offered the day its plugin ships.
//
// Its own module so the Studio chat agent (chat-agent.ts) can read the table without
// importing the editor's completion code; `editor-complete.ts` re-exports it.
import deckSettings from '../../../../lib/core/deck-settings.js';
import deckSettingsProse from '../../../../lib/core/deck-settings.prose.js';
import pluginRegisters from '../../../../lib/plugins/registers.generated.js';

/** Every row the Studio offers: the table's own rows, then one per plugin-declared register. */
export const OFFERED_SETTINGS = deckSettingsProse.withProse(deckSettings.withPluginRegisters(pluginRegisters.PLUGIN_REGISTERS)).filter((r) => r.offer !== false && r.kind !== 'retired');

export const FRONT_MATTER_KEYS: { key: string; info: string }[] = OFFERED_SETTINGS.map((r) => ({ key: r.key, info: r.info }));

