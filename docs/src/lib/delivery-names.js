// The docs-site binding of the `delivery:` register's names and parse, WITHOUT the delivery
// styles (lib/core/delivery-names.mjs). The Studio's settings menu imports this one, so the
// styles stay in the lazily loaded Present chunk; `@/lib/resolve-delivery` is the full register.
export { DEFAULT_DELIVERY, DELIVERY_NAMES, frontMatterDelivery, isKnownDelivery } from '../../../lib/core/delivery-names.mjs';
