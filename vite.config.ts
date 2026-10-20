import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
/// <reference types="vitest" />

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8"),
)

// KaTeX's stylesheet lists woff2, woff and ttf for every face, and the bundler
// emits all three. Every webview Tauri targets (WebKitGTK, WKWebView, WebView2)
// supports woff2, so keep only that source and skip ~40 redundant font files.
// src/styles/index.css pulls KaTeX in with `@import "katex/dist/katex.min.css"
// layer(vendor)`. The CSS inliner reads that file before any plugin sees it, so
// the plugin writes a stripped copy (fonts rebased to where they really live)
// to node_modules/.cache and points the import at it.
const KATEX_CSS = fileURLToPath(new URL("./node_modules/katex/dist/katex.min.css", import.meta.url))
const KATEX_CACHE_DIR = fileURLToPath(new URL("./node_modules/.cache/comdtex/", import.meta.url))
const KATEX_IMPORT = '@import "katex/dist/katex.min.css" layer(vendor);'
const stripLegacyFonts = (css: string) =>
  css.replace(/,url\([^)]*\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, "")

function katexWoff2Only(): Plugin {
  const cached = `${KATEX_CACHE_DIR}katex-woff2.css`
  return {
    name: "comdtex:katex-woff2-only",
    enforce: "pre",
    buildStart() {
      mkdirSync(KATEX_CACHE_DIR, { recursive: true })
      writeFileSync(
        cached,
        stripLegacyFonts(readFileSync(KATEX_CSS, "utf-8")).replaceAll(
          "url(fonts/",
          "url(../../katex/dist/fonts/",
        ),
      )
    },
    transform(code, id) {
      const file = id.split("?")[0]
      if (/katex[\\/]dist[\\/]katex(\.min)?\.css/.test(file)) return stripLegacyFonts(code)
      if (/styles[\\/]index\.css$/.test(file) && code.includes(KATEX_IMPORT))
        return code.replace(KATEX_IMPORT, `@import "${cached}" layer(vendor);`)
      return null
    },
  }
}

export default defineConfig(async () => ({
  plugins: [react(), katexWoff2Only()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
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
        lines: 47,
        statements: 45,
        functions: 34,
        branches: 40,
      },
    },
  },

  build: {
    // Vite 8 defaults the CSS minifier to lightningcss, which rejects the
    // paged-media `@page { @header ... }` / `running()` rules used for the
    // print/PDF export headers in src/styles/print.css. Keep esbuild (the Vite 7 default).
    cssMinify: "esbuild",
    rollupOptions: {
      output: {
        // Vite 8 / rolldown replaces `manualChunks` (object form) with
        // `codeSplitting.groups`; each group's `test` matches the module id.
        // `[\\/]` keeps the separator Windows-safe.
        codeSplitting: {
          groups: [
            // Vite's dynamic-import preload helper is imported by every
            // lazy boundary. Without its own group, rolldown parks it in the
            // monaco chunk and the entry then preloads ~3.7 MB of Monaco.
            { name: "preload-helper", test: /vite[\\/]preload-helper/, priority: 100 },
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
}))
