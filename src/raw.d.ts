// Ambient module declaration so TypeScript accepts Vite's `?raw` imports of
// Markdown files (e.g. `import ctx from "./comdtex-context.md?raw"`).
declare module "*.md?raw" {
  const content: string
  export default content
}
