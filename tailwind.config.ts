import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bet1865 dark/yellow "betting site" theme — see SPEC.md §7
        background: "#111111",
        surface: "#1c1c1c",
        surfaceAlt: "#242424",
        accent: "#ffb80c",
        accentDark: "#d99a00",
      },
    },
  },
  plugins: [],
};

export default config;
