import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
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
});
