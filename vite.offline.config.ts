import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(
  base,
  defineConfig({
    build: {
      outDir: ".arena/offline-build",
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
      chunkSizeWarningLimit: 1800,
    },
  }),
);
