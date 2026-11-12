import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { mediaTools } from "./server/media-tools.js";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mediaTools(loadEnv(mode, process.cwd(), "ONDA_")),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.js",
      injectRegister: null,
      registerType: "prompt",
      manifest: {
        name: "Onda — Tu música, tu momento",
        short_name: "Onda",
        description: "Tu biblioteca de música local, también sin conexión.",
        lang: "es",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#121713",
        theme_color: "#121713",
        icons: [
          { src: "icons/onda.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,svg,jpg,jpeg,png,webp,ttf,woff,woff2,mp3,webmanifest}"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  base: process.env.VITE_BASE_PATH || "/",
}));
