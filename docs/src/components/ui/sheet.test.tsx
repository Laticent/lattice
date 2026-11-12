import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';

const pointer = (fine: boolean) =>
	((q: string) => ({ matches: fine && q.includes('pointer: fine'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

describe('SheetContent', () => {
	it('returns focus to a text field only on a fine pointer: on touch it would raise the keyboard', async () => {
		const real = window.matchMedia;
		for (const fine of [true, false]) {
			window.matchMedia = pointer(fine);
			try {
				function FromEditor() {
					const [open, setOpen] = React.useState(false);
					return (
						<>
							<textarea data-testid="editor" />
							<button type="button" onClick={() => setOpen(true)}>
								open
							</button>
							<Sheet open={open} onOpenChange={setOpen}>
								<SheetContent>
									<SheetTitle>Sheet</SheetTitle>
									<SheetClose>done</SheetClose>
								</SheetContent>
							</Sheet>
						</>
					);
				}
				const { unmount } = render(<FromEditor />);
				const editor = screen.getByTestId('editor');
				editor.focus();
				// Opened from a control that keeps the editor focused, as Compose's slide bar does.
				fireEvent.click(screen.getByText('open'));
				await waitFor(() => expect(screen.getByText('done')).toBeTruthy());
				fireEvent.click(screen.getByText('done'));
				await waitFor(() => expect(screen.queryByText('done')).toBeNull());
				if (fine) expect(document.activeElement, 'a mouse gets its caret back').toBe(editor);
				else expect(document.activeElement, 'a touch screen got the keyboard back up').not.toBe(editor);
				unmount();
			} finally {
				window.matchMedia = real;
			}
		}
	});
});
