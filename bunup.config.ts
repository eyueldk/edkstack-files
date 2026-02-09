import { defineConfig } from "bunup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/backend/index.ts",
    "src/client/index.ts"
  ],
  target: "bun",
  clean: true,
  dts: true,
  exports: true,
  sourcemap: true,
});