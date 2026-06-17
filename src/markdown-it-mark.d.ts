// `markdown-it-mark` (MIT) ships no type declarations; this is the minimal
// ambient module shim. The plugin adds `==text==` → <mark> support.
declare module "markdown-it-mark" {
  import type MarkdownIt from "markdown-it"
  const markPlugin: (md: MarkdownIt) => void
  export default markPlugin
}
