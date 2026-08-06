// Vite serves any module with `?raw` as its source text (used by the
// export-coverage guard in documentResolve.test.ts).
declare module "*?raw" {
  const content: string
  export default content
}
