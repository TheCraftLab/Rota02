import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#11212D",
        slate: "#3E5C76",
        mist: "#E9F1F7",
        sand: "#F4EDE4",
        amber: "#E1A04A",
        coral: "#D96C4F",
        mint: "#6FA58B"
      },
      boxShadow: {
        panel: "0 24px 60px -28px rgba(17, 33, 45, 0.32)"
      },
      borderRadius: {
        "4xl": "2rem"
      }
    }
  },
  plugins: []
};

export default config;

