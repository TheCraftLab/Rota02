export type AccentColor = "blue" | "amber" | "green" | "purple" | "red";
export type Theme = "light" | "dark";

export const ACCENT_COLORS: Record<AccentColor, { light: string; dark: string; label: string }> = {
  blue: {
    light: "#3b82f6",
    dark: "#60a5fa",
    label: "Blue"
  },
  amber: {
    light: "#d4913c",
    dark: "#fbbf24",
    label: "Amber"
  },
  green: {
    light: "#16a34a",
    dark: "#86efac",
    label: "Green"
  },
  purple: {
    light: "#7c3aed",
    dark: "#d8b4fe",
    label: "Purple"
  },
  red: {
    light: "#dc2626",
    dark: "#fca5a5",
    label: "Red"
  }
};

export function getThemeFromStorage(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("rota-theme");
  return (stored as Theme) || "light";
}

export function setThemeInStorage(theme: Theme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("rota-theme", theme);
}

export function getAccentColorFromStorage(): AccentColor {
  if (typeof window === "undefined") return "blue";
  const stored = localStorage.getItem("rota-accent");
  return (stored as AccentColor) || "blue";
}

export function setAccentColorInStorage(color: AccentColor): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("rota-accent", color);
}

export function applyTheme(theme: Theme, accentColor: AccentColor): void {
  if (typeof document === "undefined") return;

  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  const accentData = ACCENT_COLORS[accentColor];
  const accentValue = theme === "dark" ? accentData.dark : accentData.light;

  // Set accent color CSS variables
  document.documentElement.style.setProperty("--color-accent-50", `${accentValue}20`);
  document.documentElement.style.setProperty("--color-accent-100", `${accentValue}30`);
  document.documentElement.style.setProperty("--color-accent-500", accentValue);
  document.documentElement.style.setProperty("--color-accent-600", adjustBrightness(accentValue, -20));
}

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (
    0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)
  ).toString(16).slice(1);
}
