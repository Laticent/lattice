import * as React from 'react';
import { PLAYGROUND_VOICE_DIR } from '../studio/tours/lines';

// The Playground's tour offer. guided-tour.js (the Tour button and the first-visit timer) dispatches
// `pg-tour-offer`; this shows the start card, which is also where a visitor tests their sound,
// because audio only plays after a click. Start runs the narrated tour (playground-tour.js).
// Design record: engineering/decisions/2026-10-20-first-run-onboarding.md.

const WelcomeCard = React.lazy(() => import('../studio/WelcomeCard').then((m) => ({ default: m.WelcomeCard })));

type Voice = typeof import('../studio/tours/tour-voice');

export function PlaygroundTourCard() {
	const [open, setOpen] = React.useState(false);
	const voice = React.useRef<Voice | null>(null);
	const loadVoice = React.useCallback(() => import('../studio/tours/tour-voice').then((m) => (voice.current = m)), []);

	React.useEffect(() => {
		const offer = () => {
			(window as { __pgTourOffer?: boolean }).__pgTourOffer = false;
			setOpen(true);
			loadVoice().catch(() => {});
		};
		document.addEventListener('pg-tour-offer', offer);
		// Asked before this island hydrated: the page left the ask on `window` (playground-tour.js).
		if ((window as { __pgTourOffer?: boolean }).__pgTourOffer) offer();
		return () => document.removeEventListener('pg-tour-offer', offer);
	}, [loadVoice]);

	const start = (sound: boolean) => {
		// Inside the click: build the narrator now so this very gesture unlocks audio.
		if (sound) voice.current?.prepareTourVoice(PLAYGROUND_VOICE_DIR);
		setOpen(false);
		import('@/playground/playground-tour.js').then((m) => m.startPlaygroundTour({ sound }));
	};

	if (!open) return null;
	return (
		<React.Suspense fallback={null}>
		<WelcomeCard
			mode="start"
			onClose={() => setOpen(false)}
			onStart={start}
			onTest={async () => (await (voice.current ?? loadVoice())).testTourSound()}
			onLessons={() => {}}
			copy={{ title: 'Welcome to the Playground', body: 'A narrated tour of the Playground, about a minute and a half. It plays best with your sound on, ideally through headphones.' }}
		/>
		</React.Suspense>
	);
}
