/**
 * Why a plugin inside a `.lattice` project or a workspace backup is not installed (plugin-system §9
 * decision 13). A zip plugin's code is approved in the browser that holds it and never travels in a
 * deck, a project or a backup, so one that arrives that way is refused by name, with where to import it.
 */
const PLUGIN_PROJECT_REFUSAL =
  'a plugin is not installed from a project or a backup: its code lives only in the browser that approved it. Import the plugin\'s own .zip in the Library instead';

module.exports = { PLUGIN_PROJECT_REFUSAL };
