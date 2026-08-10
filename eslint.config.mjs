import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "output/**",
    "release/**",
    "graphify-out/**",
    "packaging/web-runtime/node_modules/**",
    "backend/**",
    "next-env.d.ts",
  ]),
]);
