/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#07070f",
        "bg-deep": "#040408",
        surface: "#0f0f1a",
        "surface-el": "#14141f",
        accent: "#ff2244",
        orange: "#ff8800",
        amber: "#ffaa00",
        green: "#00ff88",
        cyan: "#00bbff",
      },
      animation: {
        "shimmer-bar": "shimmer-bar 3s linear infinite",
        "vibgyor-spin": "vibgyor-spin 1.8s linear infinite",
        "fade-in": "fade-in 0.4s ease-out",
        spin: "spin 0.8s linear infinite",
      },
      keyframes: {
        "shimmer-bar": {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        "vibgyor-spin": {
          "0%": { "--glow-angle": "0deg" },
          "100%": { "--glow-angle": "360deg" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
