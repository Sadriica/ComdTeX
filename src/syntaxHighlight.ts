/**
 * Small offline syntax highlighter for fenced code in the preview.
 *
 * Why not highlight.js or Monaco's `colorize`: this is a sync, dependency-free
 * scanner of about 200 lines. It runs inside `renderMarkdown` (a plain sync
 * function that also feeds exports), needs no lazy chunk, and its output is
 * escaped text with `<span class="tok-*">` only, which the sanitizer keeps as
 * is. Monaco's colours live in its own per-theme `mtk` classes and could not
 * follow the `--syn-*` tokens. The price is approximate tokenising: keywords,
 * strings, numbers, comments, calls and capitalised types, which is what a
 * reader of a paper needs, not an editor's semantic colouring.
 *
 * Classes map to tokens in preview.css: tok-kw -> --syn-keyword, tok-str ->
 * --syn-string, tok-num -> --syn-number, tok-com -> --syn-comment, tok-fn ->
 * --syn-function, tok-type -> --syn-type.
 */

interface Lang {
  line?: string[]
  block?: [string, string][]
  /** String delimiters. Triple quotes are tried first when listed. */
  quotes?: string[]
  keywords?: string
  /** Builtins, literals and well-known types. */
  types?: string
  /** `Capitalised` identifiers are types. */
  capTypes?: boolean
  /** `name:` at the start of a line or after `{`/`,` is a key. */
  keys?: boolean
  /** `\command` is a keyword, `$..$` is a string (LaTeX). */
  tex?: boolean
  /** `$name` is a variable (shell). */
  dollar?: boolean
  /** Keywords match regardless of case (SQL). */
  ci?: boolean
}

const C_KEYWORDS =
  "if else for while do switch case default break continue return goto sizeof typedef struct union enum static const volatile extern inline register"
const C_TYPES =
  "void int char short long float double unsigned signed bool size_t NULL true false uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t"

const LANGS: Record<string, Lang> = {
  js: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ["`", '"', "'"],
    keywords:
      "break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await get set",
    types: "true false null undefined NaN Infinity",
    capTypes: true,
  },
  ts: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ["`", '"', "'"],
    keywords:
      "abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function if implements import in instanceof interface keyof let namespace new of private protected public readonly return satisfies static super switch this throw try type typeof var void while yield",
    types:
      "true false null undefined NaN Infinity string number boolean any unknown never object symbol bigint",
    capTypes: true,
  },
  python: {
    line: ["#"],
    quotes: ['"""', "'''", '"', "'"],
    keywords:
      "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case",
    types: "True False None self cls int str float bool list dict set tuple bytes",
    capTypes: true,
  },
  rust: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ['"'],
    keywords:
      "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while",
    types:
      "true false i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Some None Ok Err Box",
    capTypes: true,
  },
  c: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ['"', "'"],
    keywords: C_KEYWORDS,
    types: C_TYPES,
  },
  cpp: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ['"', "'"],
    keywords: `${C_KEYWORDS} class namespace template typename using new delete this public private protected virtual override final constexpr auto try catch throw operator nullptr`,
    types: `${C_TYPES} string vector map set unique_ptr shared_ptr`,
    capTypes: true,
  },
  java: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ['"', "'"],
    keywords:
      "abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface new package private protected public return static super switch this throw throws try void volatile while var record",
    types: "true false null int long short byte char float double boolean String Object",
    capTypes: true,
  },
  go: {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ["`", '"', "'"],
    keywords:
      "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
    types:
      "true false nil iota int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any",
    capTypes: true,
  },
  bash: {
    line: ["#"],
    quotes: ['"', "'"],
    keywords:
      "if then else elif fi for while until do done case esac in function select return exit export local readonly unset source alias cd echo set shift trap",
    types: "true false",
    dollar: true,
  },
  json: { quotes: ['"'], types: "true false null", keys: true },
  yaml: { line: ["#"], quotes: ['"', "'"], types: "true false null yes no", keys: true },
  sql: {
    line: ["--"],
    block: [["/*", "*/"]],
    quotes: ["'", '"'],
    keywords:
      "select from where group by order having join inner outer left right full on as and or not in is like between exists union all distinct insert into values update set delete create table alter drop index view primary key foreign references limit offset case when then else end with asc desc",
    types:
      "null true false int integer text varchar char boolean date timestamp float real numeric",
    ci: true,
  },
  latex: { line: ["%"], tex: true },
  julia: {
    line: ["#"],
    block: [["#=", "=#"]],
    quotes: ['"""', '"', "'"],
    keywords:
      "begin break catch const continue do else elseif end export finally for function global if import in let local macro module quote return struct try using while where mutable abstract primitive type",
    types: "true false nothing missing Int Int64 Float64 String Bool Vector Matrix Array",
    capTypes: true,
  },
  r: {
    line: ["#"],
    quotes: ['"', "'"],
    keywords: "if else for while repeat break next function return in library require",
    types: "TRUE FALSE NULL NA NA_integer_ NA_real_ Inf NaN",
  },
  matlab: {
    line: ["%"],
    quotes: ['"', "'"],
    keywords:
      "if else elseif end for while function return break continue switch case otherwise try catch global persistent",
    types: "true false pi Inf NaN",
  },
}

const ALIASES: Record<string, string> = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  node: "js",
  typescript: "ts",
  tsx: "ts",
  py: "python",
  python3: "python",
  rs: "rust",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  h: "c",
  golang: "go",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  postgresql: "sql",
  mysql: "sql",
  sqlite: "sql",
  tex: "latex",
  jl: "julia",
  m: "matlab",
  octave: "matlab",
}

const wordSets = new Map<string, Set<string>>()
function words(list: string | undefined, ci: boolean): Set<string> {
  if (!list) return new Set()
  const key = `${ci ? "i" : "s"}:${list}`
  let set = wordSets.get(key)
  if (!set) {
    set = new Set((ci ? list.toLowerCase() : list).split(" "))
    wordSets.set(key, set)
  }
  return set
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESC[c])
}

function wrap(cls: string, text: string): string {
  return `<span class="tok-${cls}">${esc(text)}</span>`
}

/** Past this size the scan costs more than it is worth on the typing path. */
const MAX_CODE_LENGTH = 30_000

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[\w$]/
const NUMBER_RE = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?[a-zA-Z]{0,3})/

/** The language key for a fence info string, or null when we do not know it. */
export function resolveHighlightLang(info: string | undefined): string | null {
  const raw = (info ?? "").trim().split(/\s+/)[0]?.toLowerCase()
  if (!raw) return null
  const key = ALIASES[raw] ?? raw
  return Object.prototype.hasOwnProperty.call(LANGS, key) ? key : null
}

/**
 * Highlights `code` as `info` (a fence info string such as `python` or `ts`).
 * Returns the inner HTML of a `<code>` element, or null when the language is
 * unknown or the block is too large, so the caller keeps its plain rendering.
 */
export function highlightCode(code: string, info: string | undefined): string | null {
  const key = resolveHighlightLang(info)
  if (!key || code.length > MAX_CODE_LENGTH) return null
  const lang = LANGS[key]
  const ci = lang.ci === true
  const keywords = words(lang.keywords, ci)
  const types = words(lang.types, false)
  const quotes = [...(lang.quotes ?? [])].sort((a, b) => b.length - a.length)

  let out = ""
  let plain = ""
  const flush = () => {
    if (plain) out += esc(plain)
    plain = ""
  }
  const emit = (cls: string, text: string) => {
    flush()
    out += wrap(cls, text)
  }

  let i = 0
  const n = code.length
  while (i < n) {
    const ch = code[i]

    // Comments.
    const line = lang.line?.find((p) => code.startsWith(p, i))
    if (line) {
      const end = code.indexOf("\n", i)
      const stop = end < 0 ? n : end
      emit("com", code.slice(i, stop))
      i = stop
      continue
    }
    const block = lang.block?.find(([open]) => code.startsWith(open, i))
    if (block) {
      const end = code.indexOf(block[1], i + block[0].length)
      const stop = end < 0 ? n : end + block[1].length
      emit("com", code.slice(i, stop))
      i = stop
      continue
    }

    // LaTeX: commands and inline math.
    if (lang.tex) {
      if (ch === "\\") {
        const m = /^\\(?:[A-Za-z@]+\*?|.)/.exec(code.slice(i, i + 40))
        if (m) {
          emit("kw", m[0])
          i += m[0].length
          continue
        }
      }
      if (ch === "$") {
        const close = code.indexOf("$", i + 1)
        const stop = close < 0 ? i + 1 : close + 1
        emit("str", code.slice(i, stop))
        i = stop
        continue
      }
      plain += ch
      i++
      continue
    }

    // Strings.
    const quote = quotes.find((q) => code.startsWith(q, i))
    if (quote && !(quote === "'" && key === "matlab" && /[\w)\]']/.test(code[i - 1] ?? ""))) {
      let j = i + quote.length
      while (j < n) {
        if (code[j] === "\\" && quote.length === 1 && key !== "go") {
          j += 2
          continue
        }
        if (code.startsWith(quote, j)) {
          j += quote.length
          break
        }
        // A one-char quote ends at the line end (the string was left open).
        if (quote.length === 1 && code[j] === "\n" && quote !== "`") break
        j++
      }
      const stop = Math.min(j, n)
      const text = code.slice(i, stop)
      // JSON/YAML: a string followed by a colon is a key.
      const isKey = lang.keys && /^\s*:/.test(code.slice(stop, stop + 8))
      emit(isKey ? "type" : "str", text)
      i = stop
      continue
    }

    // Shell variables.
    if (lang.dollar && ch === "$") {
      const m = /^\$(?:\{[^}\n]*\}|\w+|[?#@*!$0-9])/.exec(code.slice(i, i + 60))
      if (m) {
        emit("type", m[0])
        i += m[0].length
        continue
      }
    }

    // Numbers (not glued to an identifier).
    if (/\d/.test(ch) && !(i > 0 && IDENT_PART.test(code[i - 1]))) {
      const m = NUMBER_RE.exec(code.slice(i, i + 40))
      if (m) {
        emit("num", m[0])
        i += m[0].length
        continue
      }
    }

    // Identifiers.
    if (IDENT_START.test(ch) && !(i > 0 && IDENT_PART.test(code[i - 1]))) {
      let j = i + 1
      while (j < n && IDENT_PART.test(code[j])) j++
      const word = code.slice(i, j)
      const lookup = ci ? word.toLowerCase() : word
      const next = code.slice(j, j + 24)
      if (keywords.has(lookup)) emit("kw", word)
      else if (types.has(word)) emit("type", word)
      else if (lang.keys && /^\s*:(?!:)/.test(next) && !/\n/.test(next.split(":")[0]))
        emit("type", word)
      else if (/^\s*\(/.test(next) && key !== "json") emit("fn", word)
      else if (lang.capTypes && /^[A-Z][a-z0-9]/.test(word) && word.length > 1) emit("type", word)
      else plain += word
      i = j
      continue
    }

    plain += ch
    i++
  }
  flush()
  return out
}
