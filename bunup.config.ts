import { defineConfig } from "bunup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/backend/index.ts",
    "src/client/index.ts"
  ],
  clean: true,
  sourcemap: true,
  dts: true,
  exports: true,
});