import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,js,jsx,mdx}",
    "./src/components/**/*.{ts,tsx,js,jsx,mdx}",
    "./src/pages/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },

      transitionDuration: {
        '400': '400ms',
      },
 
      keyframes: {
        slideDown: {
          '0%': { 
            transform: 'translateY(-12px)',  // More movement
            opacity: '0'
          },
          '100%': { 
            transform: 'translateY(0)',
            opacity: '1'
          }
        }
      },
      animation: {
        slideDown: 'slideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)',  // Longer + smoother
      }
    },
  },
  plugins: [],
};

export default config;