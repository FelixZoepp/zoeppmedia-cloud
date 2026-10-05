import type { Config } from "tailwindcss";

// Fernly-Look in Rot: warme Neutraltöne statt kaltem Grau, tiefes Rot als Akzent.
// gray/red werden bewusst überschrieben, damit alle bestehenden Seiten den Look erben.
const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          50: "#f6f5f4",
          100: "#efedeb",
          200: "#e6e3e1",
          300: "#d5d0cd",
          400: "#a69f9b",
          500: "#7a726e",
          600: "#645d5a",
          700: "#48413e",
          800: "#2e2826",
          900: "#1a1514",
          950: "#0f0c0b",
        },
        red: {
          50: "#fdf2f1",
          100: "#fbe3e1",
          200: "#f7c9c5",
          300: "#f0a39d",
          400: "#e6716a",
          500: "#d9443c",
          600: "#c42b23",
          700: "#a3201a",
          800: "#7f1915",
          900: "#5e1411",
          950: "#3b0b09",
        },
        page: "#eceae8",
        panel: "#f6f5f4",
        card: "#fdfcfb",
        hair: "#e6e3e1",
        ink: "#1a1514",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        lg: "12px",
        xl: "20px",
        "2xl": "26px",
      },
      boxShadow: {
        sm: "0 1px 2px #1a15140a, 0 8px 24px -12px #1a15141a",
        DEFAULT: "0 1px 2px #1a15140a, 0 8px 24px -12px #1a15141f",
        hero: "0 14px 30px -16px #3b0b09b3",
      },
      transitionTimingFunction: {
        fern: "cubic-bezier(.22, 1, .36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
