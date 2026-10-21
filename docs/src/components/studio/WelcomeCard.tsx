import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// WelcomeCard — the two cards that bracket the first-run tour.
//
//  • `start`: shown once, to a first-time visitor, before anything speaks. A browser plays no sound
//    until the visitor does something, so this card is also the click that unlocks audio — and the
//    place to say "this is best with sound on" and let them check it works (the Test button plays
//    one sentence from the left speaker, then the right).
//  • `end`: shown when the tour finishes on its own. The tour is the short version; this is the
//    fork — keep going with the hands-on lessons, or start building.
//
// Both are plain dialogs. Neither blocks anything: Esc, the X and "Not now" all leave the Studio
// exactly as it was.
// Design record: engineering/decisions/2026-10-20-first-run-onboarding.md.

export type WelcomeCardProps = {
	mode: 'start' | 'end' | null;
	onClose: () => void;
	/** Start the tour; `sound` is false for "without sound". Called inside the click, so audio unlocks. */
	onStart: (sound: boolean) => void;
	/** Plays the sound test. Resolves false when the voice could not load (offline). */
	onTest: () => Promise<boolean>;
	/** Opens the hands-on lessons (the next one the visitor has not finished). */
	onLessons: () => void;
	/** Words for a surface other than the Studio. The Studio's own are the defaults. */
	copy?: { title?: string; body?: string };
	/** The end card: the heading for the tour that just finished, and the tour after it (none = the lessons). */
	end?: { title: string; next: { label: string; description: string } | null };
	/** The end card's "Next" button: start the tour after this one. Called inside the click. */
	onNext?: () => void;
};

type TestState = 'idle' | 'playing' | 'heard' | 'unavailable';

export function WelcomeCard({ mode, onClose, onStart, onTest, onLessons, copy, end, onNext }: WelcomeCardProps) {
	const [test, setTest] = React.useState<TestState>('idle');
	const runTest = () => {
		setTest('playing');
		onTest().then(
			(ok) => setTest(ok ? 'heard' : 'unavailable'),
			() => setTest('unavailable'),
		);
	};
	return (
		<Dialog open={mode != null} onOpenChange={(o) => !o && onClose()}>
			{mode === 'start' && (
				<DialogContent data-welcome="start" className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{copy?.title ?? 'Welcome to Lattice'}</DialogTitle>
						<DialogDescription>{copy?.body ?? 'A narrated tour of the Studio, about two minutes. It plays best with your sound on, ideally through headphones.'}</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
						<Button type="button" variant="outline" size="sm" data-welcome="test" onClick={runTest} disabled={test === 'playing'}>
							{test === 'playing' ? 'Playing…' : 'Test sound'}
						</Button>
						<p className="text-[13px] text-muted-foreground" role="status" aria-live="polite">
							{test === 'idle' && 'You should hear a voice, first on the left, then on the right.'}
							{test === 'playing' && 'Listen: left, then right.'}
							{test === 'heard' && 'Heard it? You’re set. Nothing? Check your volume, then test again.'}
							{test === 'unavailable' && 'The voice could not load. The tour still works with captions.'}
						</p>
					</div>
					<DialogFooter className="gap-2 sm:justify-between">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Not now
						</Button>
						<div className="flex flex-col-reverse gap-2 sm:flex-row">
							<Button type="button" variant="outline" size="sm" data-welcome="silent" onClick={() => onStart(false)}>
								Start without sound
							</Button>
							<Button type="button" size="sm" data-welcome="start" onClick={() => onStart(true)}>
								Start the tour
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			)}
			{mode === 'end' && (
				<DialogContent data-welcome="end" className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{end?.title ?? 'That’s the shape of it'}</DialogTitle>
						<DialogDescription>
							{end?.next
								? `Want to go further? Next is the ${end.next.label.toLowerCase()}: ${end.next.description.charAt(0).toLowerCase()}${end.next.description.slice(1)}`
								: 'Want to go further? The lessons teach by doing, one short task at a time, on your own deck.'}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Start building
						</Button>
						{end?.next ? (
							<Button
								type="button"
								size="sm"
								data-welcome="next"
								onClick={() => {
									onClose();
									onNext?.();
								}}
							>
								Go further: {end.next.label.toLowerCase()}
							</Button>
						) : (
							<Button
								type="button"
								size="sm"
								data-welcome="lessons"
								onClick={() => {
									onClose();
									onLessons();
								}}
							>
								Go further: the lessons
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			)}
		</Dialog>
	);
}
