import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "logo-vc.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /\/media\//,
            handler: "NetworkOnly",
          },
        ],
      },
      manifest: {
        name: "SIGeCom Mesa de Ayuda",
        short_name: "Mesa Ayuda",
        description: "Mesa de ayuda V&C Corporation",
        theme_color: "#1E8C87",
        background_color: "#2D2D2D",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/logo-vc.png", sizes: "232x128", type: "image/png" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/media": "http://127.0.0.1:8000",
    },
  },
});
