// The docs page the Live privacy note links to (docs/src/content/docs/privacy.md, followups 2547-p2):
// who sees a Live user's IP address. One constant, so the start card and the lobby cannot point at
// different pages. Opened in a new tab: following it must not drop a guest out of the lobby.
import { joinBase } from '@/lib/base-url.mjs';

export const LIVE_PRIVACY_HREF = joinBase(import.meta.env.BASE_URL || '/', 'privacy/#live-sessions-who-sees-your-ip-address');
