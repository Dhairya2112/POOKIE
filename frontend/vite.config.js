import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/three") ||
            id.includes("node_modules/@react-three")
          ) {
            return "three";
          }
          if (
            id.includes("node_modules/gsap") ||
            id.includes("node_modules/lenis")
          ) {
            return "gsap";
          }
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router-dom") ||
            id.includes("node_modules/zustand")
          ) {
            return "vendor";
          }
        },
      },
    },
  },
});
