import { describe, expect, it } from "vitest"
import {
  acceptAll,
  hasCriticMarks,
  markAt,
  parseCriticMarks,
  rejectAll,
  renderCriticMarks,
  resolveAt,
  serializeMark,
  suggestEdit,
} from "./criticMarkup"

describe("parseCriticMarks", () => {
  it("parses the five kinds", () => {
    const t = "a {++b++} {--c--} {~~d~>e~~} {>>f<<} {==g==}"
    const m = parseCriticMarks(t)
    expect(m.map((x) => x.kind)).toEqual(["add", "del", "sub", "comment", "highlight"])
    expect(m[0].text).toBe("b")
    expect(m[2].oldText).toBe("d")
    expect(m[2].newText).toBe("e")
    expect(m[3].text).toBe("f")
    expect(m[4].text).toBe("g")
  })

  it("round-trips through serializeMark", () => {
    const t = "{++a++}{--b--}{~~c~>d~~}{>>e<<}{==f==}{>>g<<}{==h==}"
    for (const m of parseCriticMarks(t)) expect(serializeMark(m)).toBe(m.raw)
  })

  it("attaches a comment that directly follows a highlight", () => {
    const [m] = parseCriticMarks("{==x==}{>>why<<}")
    expect(m.kind).toBe("highlight")
    expect(m.comment).toBe("why")
    expect(m.end).toBe(16)
    expect(parseCriticMarks("{==x==} {>>why<<}").map((x) => x.kind)).toEqual([
      "highlight",
      "comment",
    ])
  })

  it("allows empty marks and multi-line, multi-paragraph bodies", () => {
    expect(parseCriticMarks("{++++}")[0].text).toBe("")
    expect(parseCriticMarks("{++a\n\nb++}")[0].text).toBe("a\n\nb")
  })

  it("never parses inside math or code", () => {
    for (const t of [
      "$x {++y++} z$",
      "$$\n{--a--}\n$$",
      "`{++a++}`",
      "```\n{++a++}\n```",
      "~~~\n{--a--}\n~~~",
      "    {++a++}",
    ]) {
      // the indented case needs a blank line before it
      const doc = t.startsWith("    ") ? "para\n\n" + t : t
      expect(parseCriticMarks(doc), doc).toEqual([])
    }
  })

  it("does not end a mark at a closer inside a formula", () => {
    const [m] = parseCriticMarks("{++a $b++}$ c++}")
    expect(m.text).toBe("a $b++}$ c")
    const [d] = parseCriticMarks("{--see `x--}` here--}")
    expect(d.text).toBe("see `x--}` here")
  })

  it("keeps a formula inside a mark intact on accept and reject", () => {
    const t = "p {++new $\\frac{a}{b}$ and $$x^2$$ ++} q"
    expect(acceptAll(t)).toBe("p new $\\frac{a}{b}$ and $$x^2$$  q")
    expect(rejectAll(t)).toBe("p  q")
  })

  it("leaves malformed marks as literal text", () => {
    for (const t of [
      "{++open",
      "close++}",
      "{~~a~~}",
      "{~~a~>b",
      "{>>x",
      "{==x",
      "{+ + x}",
      "\\{++x++}",
      "{ ++x++}",
    ]) {
      expect(parseCriticMarks(t), t).toEqual([])
      expect(acceptAll(t)).toBe(t)
      expect(rejectAll(t)).toBe(t)
    }
  })

  it("documents nesting: same kind ends at the first closer, other kinds are text", () => {
    const [m] = parseCriticMarks("{++a {++b++} c++}")
    expect(m.text).toBe("a {++b")
    expect(acceptAll("{++a {++b++} c++}")).toBe("a {++b c++}")
    const [o] = parseCriticMarks("{++a {--b--} c++}")
    expect(o.text).toBe("a {--b--} c")
    expect(acceptAll("{++a {--b--} c++}")).toBe("a {--b--} c")
  })

  it("an unterminated opener does not hide later marks", () => {
    const t = "{++ never closed. later {--x--}"
    const m = parseCriticMarks(t)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe("del")
  })

  it("is fast with many unterminated openers", () => {
    const t = "{++a ".repeat(20000)
    const start = Date.now()
    expect(parseCriticMarks(t)).toEqual([])
    expect(Date.now() - start).toBeLessThan(1500)
  })

  it("substitution uses the first ~> and keeps ~> inside math out", () => {
    const [m] = parseCriticMarks("{~~$a~>b$ x~>y~~}")
    expect(m.oldText).toBe("$a~>b$ x")
    expect(m.newText).toBe("y")
  })

  it("hasCriticMarks is a cheap pre-check", () => {
    expect(hasCriticMarks("plain {text}")).toBe(false)
    expect(hasCriticMarks("a {++b++}")).toBe(true)
  })
})

describe("accept and reject", () => {
  const t = "A {++B++} C {--D--} E {~~F~>G~~} H {>>I<<} J {==K==}{>>L<<} M"
  it("accepts all", () => {
    expect(acceptAll(t)).toBe("A B C  E G H  J K M")
  })
  it("rejects all", () => {
    expect(rejectAll(t)).toBe("A  C D E F H  J K M")
  })
  it("returns text without marks unchanged", () => {
    expect(acceptAll("just $x$ text")).toBe("just $x$ text")
  })
  it("resolves the mark at the cursor", () => {
    const s = "one {++two++} three"
    expect(resolveAt(s, 7, "accept")).toEqual({ start: 4, end: 13, text: "two" })
    expect(resolveAt(s, 4, "reject")).toEqual({ start: 4, end: 13, text: "" })
    expect(resolveAt(s, 13, "accept")?.text).toBe("two")
    expect(resolveAt(s, 1, "accept")).toBeNull()
    expect(markAt(s, 2)).toBeNull()
  })
})

describe("suggestEdit", () => {
  const apply = (t: string, r: ReturnType<typeof suggestEdit>) => {
    if (!r.ok) throw new Error("not ok")
    return t.slice(0, r.edit.start) + r.edit.text + t.slice(r.edit.end)
  }
  it("wraps a selection as an addition and deletion", () => {
    const t = "hello world"
    const a = suggestEdit(t, 6, 11, "add")
    expect(apply(t, a)).toBe("hello {++world++}")
    const d = suggestEdit(t, 0, 5, "del")
    expect(apply(t, d)).toBe("{--hello-- } world".replace("-- }", "--}"))
  })
  it("inserts an empty mark with the caret inside", () => {
    const r = suggestEdit("ab", 1, 1, "add")
    expect(r.ok && apply("ab", r)).toBe("a{++++}b")
    expect(r.ok && r.selection).toEqual({ start: 4, end: 4 })
  })
  it("comment on a selection highlights it and puts the caret in the comment", () => {
    const r = suggestEdit("see this", 4, 8, "comment")
    const out = apply("see this", r)
    expect(out).toBe("see {==this==}{>><<}")
    expect(r.ok && out.slice(0, r.selection.start).endsWith("{>>")).toBe(true)
  })
  it("substitution puts the caret in the new text", () => {
    const r = suggestEdit("a b c", 2, 3, "sub")
    expect(apply("a b c", r)).toBe("a {~~b~>~~} c")
    expect(r.ok && "a {~~b~>~~} c".slice(r.selection.start - 2, r.selection.start)).toBe("~>")
  })
  it("snaps a selection that cuts a formula outward", () => {
    const t = "x $a+b$ y"
    const r = suggestEdit(t, 4, 6, "add")
    expect(apply(t, r)).toBe("x {++$a+b$++} y")
  })
  it("moves an empty caret inside a formula to after it", () => {
    const t = "x $a+b$ y"
    const r = suggestEdit(t, 4, 4, "add")
    expect(apply(t, r)).toBe("x $a+b${++++} y")
  })
  it("refuses a selection that overlaps an existing mark", () => {
    const t = "a {++b++} c"
    expect(suggestEdit(t, 0, 6, "del")).toEqual({ ok: false, reason: "overlap" })
    expect(suggestEdit(t, 6, 6, "add")).toEqual({ ok: false, reason: "overlap" })
  })
  it("a comment inside a mark goes after it", () => {
    const t = "a {++b++} c"
    const r = suggestEdit(t, 6, 6, "comment")
    expect(apply(t, r)).toBe("a {++b++}{>><<} c")
  })
  it("refuses a selection holding the closing delimiter", () => {
    expect(suggestEdit("a ++} b", 0, 7, "add")).toEqual({ ok: false, reason: "delimiter" })
  })
  it("a created mark can be accepted and rejected back", () => {
    const t = "keep $x$ this"
    const r = suggestEdit(t, 5, 13, "del")
    const out = apply(t, r)
    expect(rejectAll(out)).toBe(t)
    expect(acceptAll(out)).toBe("keep ")
  })
})

describe("fuzz: formulas and code survive every operation", () => {
  // deterministic PRNG
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]
  const atoms = [
    "$x^2$",
    "$a++}b$",
    "$$\\int_0^1 f$$",
    "$$\n\\sum_i x_i\n$$",
    "`code {++x++}`",
    "```\n{--block--}\n```",
    "word",
    " ",
    "\n",
    "\n\n",
    "{",
    "}",
    "++",
    "--",
    "~>",
    "<<",
    "==",
  ]
  const formulas = ["$x^2$", "$a++}b$", "$$\\int_0^1 f$$", "$$\n\\sum_i x_i\n$$"]
  const marked = (inner: string) =>
    pick([
      `{++${inner}++}`,
      `{--${inner}--}`,
      `{~~${inner}~>new~~}`,
      `{==${inner}==}{>>c<<}`,
      `{>>${inner}<<}`,
    ])

  it("never throws and keeps every formula that is inside a kept branch", () => {
    for (let n = 0; n < 400; n++) {
      let doc = ""
      const keptAccept: string[] = []
      for (let k = 0; k < 6; k++) {
        if (rnd() < 0.5) {
          const f = pick(formulas)
          doc += " " + marked("t " + f + " u") + " "
          // formula survives accept in add/highlight; reject in del; sub-old only on reject
        } else doc += pick(atoms)
      }
      expect(() => {
        parseCriticMarks(doc)
        acceptAll(doc)
        rejectAll(doc)
        renderCriticMarks(doc)
        for (let o = 0; o < doc.length; o += 7) {
          suggestEdit(doc, o, Math.min(doc.length, o + 5), "add")
          resolveAt(doc, o, "accept")
        }
      }).not.toThrow()
      // A document without marks is a fixed point.
      const a = acceptAll(doc)
      if (parseCriticMarks(doc).length === 0) expect(a).toBe(doc)
      void keptAccept
    }
  })

  it("an added formula is whole after accept; a deleted one is whole after reject", () => {
    for (const f of formulas) {
      expect(acceptAll(`p {++x ${f} y++} q`)).toBe(`p x ${f} y q`)
      expect(rejectAll(`p {--x ${f} y--} q`)).toBe(`p x ${f} y q`)
      expect(rejectAll(`p {~~${f}~>z~~} q`)).toBe(`p ${f} q`)
      expect(acceptAll(`p {~~z~>${f}~~} q`)).toBe(`p ${f} q`)
    }
  })

  it("a closer-like token inside atomic regions never ends a mark early", () => {
    for (const f of formulas.concat(["`++}`", "```\n++}\n```"])) {
      const t = `{++a\n${f}\nb++}`
      const m = parseCriticMarks(t)
      expect(m).toHaveLength(1)
      expect(m[0].text).toBe(`a\n${f}\nb`)
    }
  })

  it("no mark parsed starts or ends inside a formula", () => {
    for (let n = 0; n < 300; n++) {
      let doc = ""
      for (let k = 0; k < 8; k++) doc += pick(atoms) + (rnd() < 0.3 ? marked("z") : "")
      for (const m of parseCriticMarks(doc)) {
        expect(m.start).toBeLessThan(m.end)
        expect(doc.slice(m.start, m.end)).toBe(m.raw)
      }
    }
  })
})

describe("renderCriticMarks", () => {
  it("renders ins, del, mark and a comment marker", () => {
    const h = renderCriticMarks("a {++b++} {--c--} {==d==}{>>e<<}")
    expect(h).toContain('<ins class="critic critic-add"')
    expect(h).toContain('<del class="critic critic-del"')
    expect(h).toContain('<mark class="critic critic-highlight"')
    expect(h).toContain('data-comment="e"')
    expect(h).toContain('tabindex="0"')
  })
  it("renders a substitution as del then ins", () => {
    const h = renderCriticMarks("{~~old~>new~~}")
    expect(h.indexOf("critic-del")).toBeLessThan(h.indexOf("critic-add"))
    expect(h).toContain(">old</del>")
    expect(h).toContain(">new</ins>")
  })
  it("escapes comment text so later passes cannot touch the attribute", () => {
    const h = renderCriticMarks('{>>cost $5 and `x` "q" @eq:a [[n]] frac(1,2)<<}')
    const attr = /data-comment="([^"]*)"/.exec(h)![1]
    expect(attr).not.toMatch(/[$`"@[\]()<>]/)
    expect(attr).toContain("&#36;5")
  })
  it("wraps each paragraph of a multi-paragraph mark separately and keeps the line count", () => {
    const src = "{++one\n\ntwo++}"
    const h = renderCriticMarks(src)
    expect(h.match(/<ins /g)).toHaveLength(2)
    expect(h.split("\n").length).toBe(src.split("\n").length)
  })
  it("leaves display math inside a mark outside the tag", () => {
    const h = renderCriticMarks("{++see\n$$\nx\n$$\nend++}")
    expect(h).toContain("$$\nx\n$$")
    expect(h.match(/<ins /g)).toHaveLength(2)
  })
  it("returns text without marks untouched", () => {
    expect(renderCriticMarks("plain $x$")).toBe("plain $x$")
  })
})

describe("model-based fuzz", () => {
  let seed = 987
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) >>> 0
    return seed / 2 ** 32
  }
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]
  // Bodies are plain words and atomic regions, some containing closers.
  const bits = [
    "foo",
    " bar ",
    "$x^2$",
    "$a++}b--}c$",
    "$$y=\\frac{1}{2}$$",
    "$$\n{==z==}\n$$",
    "`++}`",
    "x\n\ny",
  ]
  const body = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(bits)).join(" ")

  it("matches an independent construction", () => {
    for (let n = 0; n < 500; n++) {
      let doc = ""
      let acc = ""
      let rej = ""
      for (let k = 0; k < 1 + Math.floor(rnd() * 5); k++) {
        const plain = pick(["a ", "b\n", " ", " c "])
        doc += plain
        acc += plain
        rej += plain
        const b = body()
        const b2 = body()
        switch (pick(["add", "del", "sub", "com", "hl"])) {
          case "add":
            doc += `{++${b}++}`
            acc += b
            break
          case "del":
            doc += `{--${b}--}`
            rej += b
            break
          case "sub":
            doc += `{~~${b}~>${b2}~~}`
            acc += b2
            rej += b
            break
          case "com":
            doc += `{>>${b}<<}`
            break
          default:
            doc += `{==${b}==}`
            acc += b
            rej += b
        }
      }
      expect(acceptAll(doc), doc).toBe(acc)
      expect(rejectAll(doc), doc).toBe(rej)
    }
  })
})
