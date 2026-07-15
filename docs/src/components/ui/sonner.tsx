import * as React from "react"
import { Toaster as SonnerToaster, type ToasterProps } from "sonner"

// The one toast primitive. Replaces the hand-rolled `role="status"` pill state
// machines in StudioShell (message + Undo) and PlaygroundApp (message + Undo/
// Reload) with a single Sonner surface (HARD RULE #15) — stacking, swipe-dismiss,
// and a11y for free, and `toast()` callable from anywhere without threading a
// setter through props.
//
// Themed to the Studio's established toast look: the dark `--surface-inverse`
// pill with white text, in BOTH color modes (a toast is deliberately inverse, so
// it reads as a transient system message, not a panel). `lx-ui` carries the token
// reset into Sonner's document-root portal; `theme` tracks `data-mode` only so
// Sonner's own internals (focus ring, etc.) match. Color rides the token bridge.

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

function Toaster({ ...props }: ToasterProps) {
  const mode = useMode()
  return (
    <SonnerToaster
      theme={mode}
      className="toaster group lx-ui"
      position="bottom-center"
      // The inverse pill, via the CSS vars Sonner reads for a default toast.
      style={
        {
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
