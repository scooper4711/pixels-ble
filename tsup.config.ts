import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist/esm",
    dts: false,
    clean: true,
    sourcemap: true,
    splitting: false,
    target: "es2020",
  },
  {
    entry: ["src/index.ts"],
    format: ["iife"],
    outDir: "dist/umd",
    globalName: "PixelsBLE",
    dts: false,
    clean: true,
    sourcemap: true,
    splitting: false,
    target: "es2020",
  },
]);
