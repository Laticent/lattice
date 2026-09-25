// The docs-site binding of the shared `delivery:` front-matter register. The names, the preset
// table and the parse live once in the engine at `lib/core/resolve-delivery.mjs` (HARD RULE #1),
// so the Studio's Present Guide and the exported player agree on what a preset allows. A thin
// re-export, for the reason `resolve-pace.js` gives.
export { DEFAULT_DELIVERY, DELIVERY_NAMES, DELIVERY_PRESETS, deliveryLine, frontMatterDelivery, isKnownDelivery, resolveDelivery } from '../../../lib/core/resolve-delivery.mjs';
