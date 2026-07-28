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
          toast: "rounded-full shadow-[0_8px_24px_rgba(10,22,40,.22)]",
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
