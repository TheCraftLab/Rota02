import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1923",
        slate: "#4a6278",
        mist: "#eef2f6",
        sand: "#f5f0ea",
        amber: "#d4913c",
        coral: "#c95e44",
        mint: "#4e9070",

        /* Couleurs supplémentaires pour l'UI */
        cloud: "#f8fafc",
        line: "#e2e8f0",
        successSoft: "#e9f7ef",
        warningSoft: "#fff4dc",
        dangerSoft: "#fdecea"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(15, 25, 35, 0.08), 0 1px 2px rgba(15, 25, 35, 0.06)",
        soft: "0 10px 30px rgba(15, 25, 35, 0.08)",
        glow: "0 20px 60px rgba(212, 145, 60, 0.18)"
      },
      borderRadius: {
        "4xl": "1.5rem",
        "5xl": "2rem"
      }
    }
  },
  plugins: []
};

export default config;
