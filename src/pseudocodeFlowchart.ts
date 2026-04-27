/**
 * Converts ComdTeX pseudocode syntax into a Mermaid flowchart TD diagram.
 *
 * Shape mapping:
 *   ALGORITHM / FUNCTION / PROCEDURE  →  hexagon           {{"text"}}
 *   RETURN / END / STOP               →  stadium terminal  (["text"])
 *   FOR / WHILE condition             →  diamond           {"text"}
 *   IF / ELSE IF condition            →  diamond           {"text"}
 *   INPUT / OUTPUT / READ / WRITE     →  parallelogram     [/"text"/]
 *   word(args) function call          →  subroutine        [["text"]]
 *   regular statement                 →  rectangle         ["text"]
 */

// ── AST ───────────────────────────────────────────────────────────────────────

type SimpleKind = "header" | "terminal" | "io" | "process" | "subroutine"

type ASTNode =
  | { t: "simple"; text: string; kind: SimpleKind }
  | { t: "for";    cond: string; body: ASTNode[] }
  | { t: "while";  cond: string; body: ASTNode[] }
  | { t: "repeat"; body: ASTNode[]; cond: string }
  | { t: "if";     cond: string; then: ASTNode[]; elseIfs: Array<{ cond: string; body: ASTNode[] }>; else_: ASTNode[] | null }

// ── Classifier ────────────────────────────────────────────────────────────────

type LK =
  | "header" | "terminal" | "io" | "process"
  | "for" | "endfor" | "while" | "endwhile"
  | "repeat" | "until"
  | "if" | "elseif" | "else" | "endif"

function lk(line: string): LK {
  const u = line.toUpperCase().trimStart()
  if (/^(ALGORITHM|FUNCTION|PROCEDURE)\b/.test(u))  return "header"
  if (/^(RETURN|END\b|STOP\b)/.test(u))             return "terminal"
  if (/^(INPUT|OUTPUT|READ|WRITE|PRINT)\b/.test(u)) return "io"
  if (/^FOR\b/.test(u))                             return "for"
  if (/^END\s*FOR\b|^ENDFOR\b/.test(u))             return "endfor"
  if (/^WHILE\b/.test(u))                           return "while"
  if (/^END\s*WHILE\b|^ENDWHILE\b/.test(u))         return "endwhile"
  if (/^REPEAT\b/.test(u))                          return "repeat"
  if (/^UNTIL\b/.test(u))                           return "until"
  if (/^ELSE\s*IF\b|^ELSEIF\b/.test(u))             return "elseif"
  if (/^ELSE\b/.test(u))                            return "else"
  if (/^END\s*IF\b|^ENDIF\b/.test(u))               return "endif"
  if (/^IF\b/.test(u))                              return "if"
  return "process"
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parse(code: string): ASTNode[] {
  const lines = code.split("\n").map(l => l.trim()).filter(Boolean)
  let pos = 0

  function parseBlock(stopAt: LK[]): ASTNode[] {
    const out: ASTNode[] = []
    while (pos < lines.length) {
      if (stopAt.includes(lk(lines[pos]))) break
      out.push(parseOne())
    }
    return out
  }

  function parseOne(): ASTNode {
    const line = lines[pos++]
    const k = lk(line)

    if (k === "header")   return { t: "simple", text: line, kind: "header" }
    if (k === "terminal") return { t: "simple", text: line, kind: "terminal" }
    if (k === "io")       return { t: "simple", text: line, kind: "io" }

    if (k === "for") {
      const cond = line.replace(/\s+DO\s*$/i, "")
      const body = parseBlock(["endfor"])
      if (pos < lines.length && lk(lines[pos]) === "endfor") pos++
      return { t: "for", cond, body }
    }

    if (k === "while") {
      const cond = line.replace(/\s+DO\s*$/i, "")
      const body = parseBlock(["endwhile"])
      if (pos < lines.length && lk(lines[pos]) === "endwhile") pos++
      return { t: "while", cond, body }
    }

    if (k === "repeat") {
      const body = parseBlock(["until"])
      let cond = "condition"
      if (pos < lines.length && lk(lines[pos]) === "until") {
        cond = lines[pos++].replace(/^UNTIL\s*/i, "")
      }
      return { t: "repeat", body, cond }
    }

    if (k === "if") {
      const cond = line.replace(/^IF\s*/i, "").replace(/\s+THEN\s*$/i, "")
      const then_ = parseBlock(["elseif", "else", "endif"])
      const elseIfs: Array<{ cond: string; body: ASTNode[] }> = []
      while (pos < lines.length && lk(lines[pos]) === "elseif") {
        const ec = lines[pos++].replace(/^ELSE\s*IF\s*/i, "").replace(/\s+THEN\s*$/i, "")
        elseIfs.push({ cond: ec, body: parseBlock(["elseif", "else", "endif"]) })
      }
      let else_: ASTNode[] | null = null
      if (pos < lines.length && lk(lines[pos]) === "else") {
        pos++
        else_ = parseBlock(["endif"])
      }
      if (pos < lines.length && lk(lines[pos]) === "endif") pos++
      return { t: "if", cond, then: then_, elseIfs, else_ }
    }

    // Lines that look like function calls: word chars followed by (args)
    const kind: SimpleKind = /^\w[\w\s]*\(.*\)\s*$/.test(line) ? "subroutine" : "process"
    return { t: "simple", text: line, kind }
  }

  return parseBlock([])
}

// ── Code generator ────────────────────────────────────────────────────────────

function generate(ast: ASTNode[]): string {
  let counter = 0
  const defs: string[] = []
  const edges: string[] = []

  const uid = () => `n${counter++}`

  function esc(s: string): string {
    return s
      .replace(/"/g, "'")
      .replace(/[{}[\]]/g, c => ({ "{": "(", "}": ")", "[": "(", "]": ")" }[c] ?? c))
      .slice(0, 70)
  }

  function mkNode(shape: SimpleKind, text: string): string {
    const id = uid()
    const label = esc(text)
    switch (shape) {
      case "header":     defs.push(`${id}{{"${label}"}}`); break
      case "terminal":   defs.push(`${id}(["${label}"])`); break
      case "io":         defs.push(`${id}[/"${label}"/]`); break
      case "subroutine": defs.push(`${id}[["${label}"]]`); break
      default:           defs.push(`${id}["${label}"]`); break
    }
    return id
  }

  function mkDiamond(text: string): string {
    const id = uid()
    defs.push(`${id}{"${esc(text)}"}`)
    return id
  }

  function addEdge(from: string, to: string, label?: string) {
    edges.push(label ? `${from} -->|"${label}"| ${to}` : `${from} --> ${to}`)
  }

  // Returns new open tails after processing all nodes
  function gen(nodes: ASTNode[], tails: string[]): string[] {
    for (const node of nodes) {
      tails = genOne(node, tails)
    }
    return tails
  }

  function genOne(node: ASTNode, tails: string[]): string[] {
    if (node.t === "simple") {
      const id = mkNode(node.kind, node.text)
      tails.forEach(t => addEdge(t, id))
      return node.kind === "terminal" ? [] : [id]
    }

    if (node.t === "for") {
      const d = mkDiamond(node.cond)
      tails.forEach(t => addEdge(t, d))
      const bodyTails = gen(node.body, [d])
      bodyTails.forEach(t => addEdge(t, d, "↺"))
      return [d]  // "No / Done" exit
    }

    if (node.t === "while") {
      const d = mkDiamond(node.cond)
      tails.forEach(t => addEdge(t, d))
      const bodyTails = gen(node.body, [d])
      bodyTails.forEach(t => addEdge(t, d, "↺"))
      return [d]
    }

    if (node.t === "repeat") {
      // body runs first, condition checked at end
      const bodyTails = gen(node.body, tails)
      const d = mkDiamond(`UNTIL ${node.cond}`)
      bodyTails.forEach(t => addEdge(t, d))
      // Loop back: re-entry into body start — approximate via back to d
      addEdge(d, d, "↺ No")
      return [d]  // "Yes / Exit" tail
    }

    if (node.t === "if") {
      const d = mkDiamond(node.cond)
      tails.forEach(t => addEdge(t, d))

      const merges: string[] = []
      const thenTails = gen(node.then, [d])
      merges.push(...thenTails)

      // Chain ELSE IF diamonds off previous diamond's No path
      let prev = d
      for (const eif of node.elseIfs) {
        const ed = mkDiamond(eif.cond)
        addEdge(prev, ed, "No")
        const eifTails = gen(eif.body, [ed])
        merges.push(...eifTails)
        prev = ed
      }

      if (node.else_) {
        const elseTails = gen(node.else_, [prev])
        merges.push(...elseTails)
      } else {
        merges.push(prev)  // No-branch falls through
      }

      return merges
    }

    return tails
  }

  // Seed: virtual start
  const startId = uid()
  defs.push(`${startId}(["Start"])`)
  const finalTails = gen(ast, [startId])

  // Virtual end
  const endId = uid()
  defs.push(`${endId}(["End"])`)
  finalTails.forEach(t => addEdge(t, endId))

  return ["flowchart TD", ...defs, ...edges].join("\n")
}

// ── Public API ────────────────────────────────────────────────────────────────

export function pseudocodeToFlowchart(code: string): string {
  try {
    return generate(parse(code))
  } catch {
    return `flowchart TD\n  err["Error parsing pseudocode"]`
  }
}
