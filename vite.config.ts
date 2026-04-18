import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts"],
  },
  ...(mode === "lib"
    ? {
        build: {
          lib: {
            entry: {
              core: resolve(__dirname, "src/core/index.ts"),
              react: resolve(__dirname, "src/react/index.ts"),
            },
            formats: ["es"] as const,
            fileName: (_: string, entryName: string) => `${entryName}.js`,
          },
          rollupOptions: {
            external: [
              "pixi.js",
              "pixi-viewport",
              "react",
              "react-dom",
              "react/jsx-runtime",
            ],
          },
        },
      }
    : {}),
}));
