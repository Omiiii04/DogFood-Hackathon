/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Original colors
        canvas: '#0B0F17',
        surface: {
          DEFAULT: '#f8f9ff', // Updated to stitch default for surface, old was #111827
          raised: '#1F2937',
          sunken: '#080C14',
        },
        border: {
          subtle: '#374151',
          focus: '#3B82F6',
        },
        accent: {
          primary: '#3B82F6',
          hover: '#2563EB',
          muted: '#6366F1',
        },
        status: {
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#3B82F6',
        },
        // Stitch colors
        "surface-tint": "#004fe5", "on-tertiary": "#ffffff", "secondary-fixed-dim": "#c0c1ff", "surface-container-high": "#dce9ff", "on-primary-container": "#f2f2ff", "on-background": "#0b1c30", "on-secondary": "#ffffff", "tertiary-fixed-dim": "#d0bcff", "error-container": "#ffdad6", "surface-container-highest": "#d3e4fe", "tertiary": "#6530cf", "on-secondary-container": "#fffbff", "surface-variant": "#d3e4fe", "inverse-surface": "#213145", "surface-container-lowest": "#ffffff", "tertiary-container": "#7e4ee9", "on-secondary-fixed": "#07006c", "surface-bright": "#f8f9ff", "surface-container": "#e5eeff", "on-error-container": "#93000a", "secondary": "#4648d4", "on-error": "#ffffff", "on-primary": "#ffffff", "surface-container-low": "#eff4ff", "on-tertiary-fixed-variant": "#5516be", "on-tertiary-fixed": "#23005c", "outline": "#737687", "primary-fixed": "#dce1ff", "primary-fixed-dim": "#b6c4ff", "on-tertiary-container": "#f8f0ff", "on-primary-fixed": "#00164f", "secondary-fixed": "#e1e0ff", "secondary-container": "#6063ee", "background": "#f8f9ff", "primary": "#0048d4", "error": "#ba1a1a", "on-surface-variant": "#434656", "on-surface": "#0b1c30", "surface-dim": "#cbdbf5", "inverse-primary": "#b6c4ff", "outline-variant": "#c3c5d9", "inverse-on-surface": "#eaf1ff", "primary-container": "#1e60ff", "on-primary-fixed-variant": "#003bb0", "tertiary-fixed": "#e9ddff", "on-secondary-fixed-variant": "#2f2ebe"
      },
      fontFamily: {
        // Original
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        // Stitch
        "body-sm": ["Plus Jakarta Sans"], "label-numeric": ["Space Grotesk"], "headline-sm": ["Plus Jakarta Sans"], "headline-lg": ["Plus Jakarta Sans"], "body-md": ["Plus Jakarta Sans"], "headline-md": ["Plus Jakarta Sans"], "label-countdown": ["Space Grotesk"], "display-hero": ["Plus Jakarta Sans"], "body-lg": ["Plus Jakarta Sans"], "headline-lg-mobile": ["Plus Jakarta Sans"], "title-md": ["Plus Jakarta Sans"], "label-caps": ["Plus Jakarta Sans"], "display-hero-mobile": ["Plus Jakarta Sans"]
      },
      fontSize: {
        "body-sm": ["12px", { "lineHeight": "18px", "fontWeight": "400" }], "label-numeric": ["14px", { "lineHeight": "18px", "fontWeight": "700" }], "headline-sm": ["20px", { "lineHeight": "28px", "fontWeight": "600" }], "headline-lg": ["32px", { "lineHeight": "40px", "fontWeight": "700" }], "body-md": ["14px", { "lineHeight": "22px", "fontWeight": "400" }], "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "700" }], "label-countdown": ["20px", { "lineHeight": "24px", "fontWeight": "700" }], "display-hero": ["48px", { "lineHeight": "56px", "fontWeight": "800" }], "body-lg": ["16px", { "lineHeight": "26px", "fontWeight": "400" }], "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "700" }], "title-md": ["16px", { "lineHeight": "24px", "fontWeight": "600" }], "label-caps": ["11px", { "lineHeight": "16px", "fontWeight": "700" }], "display-hero-mobile": ["32px", { "lineHeight": "40px", "fontWeight": "800" }]
      },
      spacing: {
        "space-xs": "0.25rem", "space-sm": "0.5rem", "gutter-mobile": "1rem", "gutter": "1.5rem", "space-xl": "2.5rem", "margin-mobile": "1rem", "margin": "2rem", "space-md": "1rem", "space-lg": "1.5rem"
      },
      boxShadow: {
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5)',
        glow: '0 0 15px rgba(59, 130, 246, 0.25)',
      },
    },
  },
  plugins: [],
};
