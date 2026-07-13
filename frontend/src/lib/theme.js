// Dark/light theme store (item 3). Mirrors the getApiBase/setApiBase
// localStorage pattern in api/client.js. The actual color values live as
// CSS custom properties in styles/base.css (`:root` / `:root[data-theme="light"]`)
// -- this module only tracks which theme is active and exposes a small JS
// color map for the one place CSS variables can't reach: literal color
// strings handed to Chart.js for canvas fills (see `seriesColors` below).
import { useEffect, useState } from "./preact.js";

const STORAGE_KEY = "spliceprob:theme";
const THEMES = ["dark", "light"];

function readStored() {
  const v = localStorage.getItem(STORAGE_KEY);
  return THEMES.includes(v) ? v : "dark";
}

let theme = readStored();
const listeners = new Set();

function apply(t) {
  document.documentElement.setAttribute("data-theme", t);
}
apply(theme);

export function getTheme() {
  return theme;
}

export function setTheme(t) {
  if (!THEMES.includes(t) || t === theme) return;
  theme = t;
  localStorage.setItem(STORAGE_KEY, t);
  apply(t);
  listeners.forEach((fn) => fn(theme));
}

export function toggleTheme() {
  setTheme(theme === "dark" ? "light" : "dark");
}

// Preact hook: re-renders the calling component whenever the theme changes,
// so components deriving literal (non-CSS-var) colors from `seriesColors()`
// below re-render with the new palette immediately on toggle.
export function useTheme() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return theme;
}

// JS-side mirror of a handful of the CSS custom properties in base.css, for
// the chart series colors passed inline to Chart.js -- canvas fills need an
// actual computed color string, not an unresolved `var(--x)` reference.
// Keep these visually in sync with base.css's `--base-*`/`--success`/
// `--danger` variables by eye when either changes.
const PALETTE = {
  dark: {
    acceptor: "#60a5fa",
    donor: "#fbbf24",
    deltaAcceptor: "#60a5fa",
    deltaDonor: "#fbbf24",
    deltaPositive: "#22c55e",
    // Item 8: of the two delta-bar colors, red (#ef4444, HSL L≈60%) already
    // reads noticeably lighter than green (#22c55e, L≈48%) against this
    // dark background -- it's the "light" one referenced by item 8, so its
    // light-theme variant (below) gets pushed lighter still rather than the
    // green.
    deltaNegative: "#ef4444",
    zonePale: "#bbf7d0",
    matchPale: "#fecaca",
    // Aggregated/compressed placeholder bar (item 7b) and the persistent
    // click marker line (item 7a) -- markerLine mirrors base.css's
    // `--app-accent` for this theme so it reads as the same accent color as
    // the rest of the UI.
    compressedBar: "#6b7280",
    markerLine: "rgba(99, 102, 241, 0.85)",
  },
  light: {
    acceptor: "#2563eb",
    donor: "#b45309",
    deltaAcceptor: "#2563eb",
    deltaDonor: "#b45309",
    deltaPositive: "#16a34a",
    // Lightened well past a simple "swap to a darker shade for contrast"
    // choice -- verified by eye against the light theme's white panel
    // background (item 8).
    deltaNegative: "#f87171",
    zonePale: "#86efac",
    matchPale: "#fca5a5",
    compressedBar: "#9ca3af",
    markerLine: "rgba(79, 70, 229, 0.85)",
  },
};

export function seriesColors(t = theme) {
  return PALETTE[t] || PALETTE.dark;
}
