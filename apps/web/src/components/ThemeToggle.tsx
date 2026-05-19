interface ThemeToggleProps {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
}

export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <span>🌙</span>
      ) : (
        <span>☀️</span>
      )}
    </button>
  );
}
