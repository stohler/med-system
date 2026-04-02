import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const previewAllowedHosts = (
  process.env.PREVIEW_ALLOWED_HOSTS ||
  ".run.app,med.stohler.com.br,localhost,127.0.0.1"
)
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    allowedHosts: previewAllowedHosts,
  },
});
