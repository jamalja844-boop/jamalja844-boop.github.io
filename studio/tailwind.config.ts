import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12", panel: "#12151c", panel2: "#181c25", line: "#252a36",
        accent: "#7c5cff", accent2: "#22d3ee", muted: "#8b93a7",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
