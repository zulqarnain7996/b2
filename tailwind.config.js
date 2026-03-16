/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(215 27% 88%)",
        input: "hsl(215 27% 88%)",
        ring: "hsl(217 91% 60%)",
        background: "hsl(217 33% 96%)",
        foreground: "hsl(222 47% 11%)",
        primary: {
          DEFAULT: "hsl(217 91% 60%)",
          foreground: "hsl(210 40% 98%)",
        },
        secondary: {
          DEFAULT: "hsl(215 28% 92%)",
          foreground: "hsl(222 47% 11%)",
        },
        muted: {
          DEFAULT: "hsl(215 25% 92%)",
          foreground: "hsl(215 16% 40%)",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(59,130,246,0.15), 0 20px 50px rgba(30,64,175,0.15)",
      },
    },
  },
  plugins: [],
};
