import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic colors (light mode defaults, overridden in dark)
        ink: "var(--color-ink)",
        slate: "var(--color-slate)",
        mist: "var(--color-mist)",
        sand: "var(--color-sand)",
        // Accent colors - chosen via admin
        accent: {
          50: "var(--color-accent-50)",
          100: "var(--color-accent-100)",
          500: "var(--color-accent-500)",
          600: "var(--color-accent-600)"
        },
        // Semantic uses
        success: "var(--color-success)",
        danger: "var(--color-danger)"
      },
      boxShadow: {
        panel: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)"
      },
      borderRadius: {
        "4xl": "1rem"
      }
    }
  },
  plugins: []
};

export default config;
