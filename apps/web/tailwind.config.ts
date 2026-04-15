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
        mint: "#4e9070"
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
