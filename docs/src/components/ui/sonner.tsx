import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// The one toast primitive. Scaffolded from the canonical shadcn CLI
// (`shadcn add sonner`, style new-york) and adapted to this repo's stack — only
// where the canonical base assumes Next.js. Two deliberate deviations from the
// verbatim output, each marked below:
//
//   1. THEME — the shadcn base reads `useTheme()` from `next-themes`. This is an
//      Astro/Starlight site with no next-themes provider (adding it would always
//      report "system"); like every other `ui/` component here, we read the
//      repo's own `data-mode` attribute instead. Same one-line role, no new dep.
//   2. SURFACE — the base paints the light `--popover` panel. Studio toasts are
//      deliberately the dark `--surface-inverse` pill in BOTH color modes, so a
//      toast reads as a transient system message, not a panel (this preserves the
//      look of the hand-rolled pills it replaces). To return to the canonical
//      panel, swap the `--normal-*` block for the shadcn defaults and drop
//      `toastOptions`.
//
// Everything else — the typed variant `icons`, the `ToasterProps` passthrough —
// is the canonical base untouched. `lx-ui` carries the token reset into Sonner's
// document-root portal.

function useMode(): "light" | "dark" {
  const [mode, setMode] = React.useState<"light" | "dark">("light")
  React.useEffect(() => {
    const read = () =>
      setMode(document.documentElement.getAttribute("data-mode") === "dark" ? "dark" : "light")
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] })
    return () => obs.disconnect()
  }, [])
  return mode
}

const Toaster = ({ ...props }: ToasterProps) => {
  const mode = useMode() // (1) data-mode, not next-themes

  return (
    <Sonner
      theme={mode}
      className="toaster group lx-ui"
      position="bottom-center"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // (2) the inverse pill, via the CSS vars Sonner reads for a default toast.
          "--normal-bg": "var(--surface-inverse)",
          "--normal-text": "#fff",
          "--normal-border": "color-mix(in srgb, #fff 16%, transparent)",
          "--border-radius": "9999px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // THE PILL IS FOR ONE LINE. A capsule is the right shape for "Deck
          // saved"; stretched around a title + description + action it becomes a
          // 110px-tall lozenge whose curve CLIPS its own last line of text —
          // measured on the real Studio at 390px, where the crash toast read as
          // an unstyled black blob and was reported as exactly that.
          //
          // So the radius follows the content: capsule while it stays a single
          // line, a 16px card the moment a description is present. Keyed on
          // Sonner's own `[data-description]` element rather than a per-call
          // opt-in, so any future multi-line toast is correct by default instead
          // of correct only if its author remembered.
          //
          // The `!` is load-bearing, and it is the SAME cascade trap this repo
          // already documents (HARD RULE #26, and the invisible button label in
          // #1584): Sonner ships its own UNLAYERED `[data-sonner-toast]` rule
          // reading `--border-radius`, and an unlayered rule beats a layered
          // Tailwind utility no matter the specificity. Written without `!`, the
          // class lands on the element, matches, and silently loses — measured on
          // the built site, where the radius stayed 9999px with the utility
          // present in `class`. The `actionButton` line below carries `!` for
          // exactly this reason.
          toast:
            "rounded-full has-[[data-description]]:!rounded-2xl has-[[data-description]]:!px-4 has-[[data-description]]:!py-3.5 shadow-[0_8px_24px_rgba(10,22,40,.22)]",
          // NOT a contrast tweak — a fix for text that was INVISIBLE. Sonner sets its
          // description color to a hardcoded `#3f3f3f` in an unconditional base rule
          // (`[data-sonner-toast][data-styled='true'] [data-description]`, sonner
          // 2.0.7), overridden only under its dark theme. We paint the toast the dark
          // `--surface-inverse` in BOTH modes, so in light mode that near-black landed
          // on a near-black pill: 1.07:1 on indaco, and 1.6-2.0:1 across the other
          // palettes — unreadable everywhere. Dark mode was fine (`#e8e8e8`, 9.2:1),
          // which is why it survived review: the bug existed only in the mode most
          // people use.
          description: "!text-white/80",
          // The one-tap escape hatch (Undo / Reload), styled like the retired pill's
          // inline button — a translucent white chip on the inverse surface.
          actionButton:
            "!bg-white/15 hover:!bg-white/25 !text-white !rounded-full !px-2.5 !text-[12px] !font-semibold transition-colors",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
