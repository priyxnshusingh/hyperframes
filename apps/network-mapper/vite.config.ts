import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// `--mode artifact` builds one self-contained bundle for scripts/build-artifact.mjs,
// which inlines it into a single page for claude.ai Artifacts.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "./",
  build:
    mode === "artifact"
      ? {
          outDir: "dist-artifact",
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
          chunkSizeWarningLimit: 1200,
        }
      : {
          rollupOptions: {
            output: {
              // Keep the graph engine and React in their own long-cacheable chunks.
              manualChunks: {
                graph: ["cytoscape", "cytoscape-fcose"],
                react: ["react", "react-dom"],
              },
            },
          },
          chunkSizeWarningLimit: 600,
        },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
