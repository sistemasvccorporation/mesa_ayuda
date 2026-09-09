/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#1E8C87",
          hover: "#187370",
          secondary: "#3AB6B0",
          tint: "#73D8D3",
          mint: "#F0F9F9",
          charcoal: "#2D2D2D",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};
