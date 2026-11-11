import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { mediaTools } from "./server/media-tools.js";

export default defineConfig(({ mode }) => ({
  plugins: [react(), mediaTools(loadEnv(mode, process.cwd(), "ONDA_"))],
  base: process.env.VITE_BASE_PATH || "/",
}));
