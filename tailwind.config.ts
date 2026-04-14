import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#f8fafc",
        foreground: "#0f172a",
        primary: {
          DEFAULT: "#0b5fff",
          foreground: "#ffffff"
        },
        accent: {
          DEFAULT: "#0ea5e9",
          foreground: "#ffffff"
        },
        muted: {
          DEFAULT: "#e2e8f0",
          foreground: "#475569"
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#0f172a"
        },
        border: "#dbe3ef"
      },
      boxShadow: {
        card: "0 10px 30px -15px rgba(15, 23, 42, 0.15)"
      },
      borderRadius: {
        xl: "1rem"
      }
    }
  },
  plugins: []
};

export default config;
