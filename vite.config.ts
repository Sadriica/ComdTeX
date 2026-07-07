import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/// <reference types="vitest" />

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8"));

export default defineConfig(async () => ({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/main.tsx",
        "src/**/*.d.ts",
        "src/**/generated/**",
        "src/**/vendor/**",
        // Pure translation-data files — huge string maps with no logic; the
        // parity test guards their structure, and counting them drags the
        // global ratio down without measuring any real code path.
        "src/i18n/es.ts",
        "src/i18n/en.ts",
        "src/i18n/types.ts",
        "src/templates.ts",
      ],
      // Regression floor, not a target — set a few points below the measured
      // baseline (`npm run test:coverage`) so CI catches drops without blocking
      // on today's level. Raise these as coverage improves (App.tsx and the AI
      // layer are the big untested surfaces). Baseline measured 2026-07 after
      // the pure-module test wave: ~36% lines / 29% branches / 25% functions
      // with i18n data excluded.
      thresholds: {
        lines: 30,
        statements: 28,
        functions: 19,
        branches: 24,
      },
    },
  },

  build: {
    // Vite 8 defaults the CSS minifier to lightningcss, which rejects the
    // paged-media `@page { @header ... }` / `running()` rules used for the
    // print/PDF export headers in App.css. Keep esbuild (the Vite 7 default).
    cssMinify: "esbuild",
    rollupOptions: {
      output: {
        // Vite 8 / rolldown replaces `manualChunks` (object form) with
        // `codeSplitting.groups`; each group's `test` matches the module id.
        // `[\\/]` keeps the separator Windows-safe.
        codeSplitting: {
          groups: [
            // Monaco is huge — split it so the initial chunk loads faster
            { name: "monaco-editor", test: /[\\/]node_modules[\\/]monaco-editor/ },
            // Keep react in its own chunk
            { name: "react-vendor", test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/ },
            // Math rendering
            { name: "katex", test: /[\\/]node_modules[\\/]katex/ },
          ],
        },
      },
    },
  },
}));
