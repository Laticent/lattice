// Semantic icon registry for the two glyphs that have collided before: Chat vs.
// Send feedback (both drawn from MessageSquareHeart), and Preview vs. Lenses (both
// drawn from Eye). Import the MEANING here, never the raw lucide name, at any of
// these five call sites — a future author reaching for "the chat icon" gets exactly
// one answer, so the collision this file exists to prevent cannot silently recur.
// See engineering/decisions/2026-07-26-studio-mobile-eight-cell-bar.md.
export {
	Accessibility as SrDescriptionIcon,
	BotMessageSquare as ChatIcon,
	Eye as PreviewIcon,
	Glasses as LensIcon,
	MessageSquareHeart as FeedbackIcon,
} from 'lucide-react';
