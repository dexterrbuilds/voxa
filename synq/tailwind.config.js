/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#ffffff",
        "cinematic-dark": "#0f172a",
        "cinematic-card": "rgba(15, 23, 42, 0.7)",
        "cinematic-purple": "#8b5cf6",
        "cinematic-blue": "#6366f1",
        "cinematic-pink": "#ec4899",
        "cinematic-indigo": "#818cf8",
        "cinematic-slate": "#94a3b8",
        "cinematic-sky": "#7dd3fc",
        "cinematic-violet": "#a78bfa",
      },
      animation: {
        "cinematic-pulse": "cinematic-pulse 4s infinite",
        "cinematic-pulse-fast": "cinematic-pulse-fast 2s infinite",
        "cinematic-breathe": "cinematic-breathe 4s infinite",
        "cinematic-float": "cinematic-float 6s ease-in-out infinite",
        "cinematic-glow-pulse": "cinematic-glow-pulse 3s ease-in-out infinite",
        "bounce-slow": "bounce 6s infinite",
        "bounce-medium": "bounce 4s infinite",
        "bounce-fast": "bounce 2s infinite",
      },
      keyframes: {
        "cinematic-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "cinematic-pulse-fast": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "cinematic-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.02)", opacity: "0.8" },
        },
        "cinematic-float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "cinematic-glow-pulse": {
          "0%, 100%": { "box-shadow": "0 0 10px rgba(139, 92, 246, 0.2)" },
          "50%": { "box-shadow": "0 0 25px rgba(139, 92, 246, 0.4)" },
        },
        bounce: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};
