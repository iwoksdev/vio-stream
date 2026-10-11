import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ["index.html"] },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.arena/**",
        "**/.data/**",
        "**/VIO*.html",
        "**/screenshots/**",
      ],
    },
    allowedHosts: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.data/**",
        "**/.arena/**",
        "**/*.sqlite*",
        "**/*.db*",
        "**/.git/**",
        "*.{crt,pem}",
      ],
    },
  },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
});
