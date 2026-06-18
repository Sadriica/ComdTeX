// ComdTeX — AI assistant provider abstraction (BYO key, MVP).
//
// Design goals:
// - 100% offline when AI is disabled: this module performs NO network work at
//   import time. Nothing here runs until `sendMessage` is called.
// - One `Provider` abstraction with two concrete kinds:
//     * HttpProvider — talks to an HTTP LLM API (Anthropic, OpenAI, Gemini, or
//       any OpenAI-compatible endpoint such as DeepSeek / Qwen / OpenRouter /
//       Ollama / LM Studio with a user-configurable base URL).
//     * CliProvider  — one-shot bridge to a local agent CLI (Claude Code,
//       opencode, …) via the Tauri shell plugin.
// - A single `sendMessage(messages, opts)` entry point dispatches to whichever
//   provider the user configured in Settings.
//
// SECURITY NOTE: the API key is read from `settings.aiApiKey`, which the MVP
// stores in localStorage. Storing the key in the OS keychain (e.g. via a Tauri
// plugin) is a planned follow-up — see TODO below.
// TODO (phase 2): move API key storage to the OS keychain instead of localStorage.

import type { Settings } from "../useSettings"
// Built-in ComdTeX system prompt. Imported as a raw string (Vite `?raw`) and
// prepended to every request so any provider knows ComdTeX's syntax deeply and
// produces correct ComdTeX-flavored Markdown. Bundled at build time — no I/O.
import comdtexContext from "./comdtex-context.md?raw"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface SendOptions {
  /** Called with each incremental token/chunk of assistant text as it streams. */
  onToken?: (chunk: string) => void
  /** Abort signal so the UI can cancel an in-flight request. */
  signal?: AbortSignal
  /** Cap on output tokens. Used by the warm-up preflight to keep it near-free. */
  maxTokens?: number
}

export type ProviderId = "anthropic" | "openai" | "gemini" | "openai-compatible" | "cli"

export interface ProviderPreset {
  id: ProviderId
  /** Human label (provider name); not localized — these are brand names. */
  label: string
  /** Whether the user must supply a custom base URL (openai-compatible). */
  needsBaseUrl: boolean
  /** Whether this preset is the CLI bridge rather than an HTTP endpoint. */
  isCli: boolean
  /** Suggested default model id shown as a placeholder. */
  defaultModel: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "anthropic",         label: "Anthropic (Claude)",        needsBaseUrl: false, isCli: false, defaultModel: "claude-3-5-sonnet-latest" },
  { id: "openai",            label: "OpenAI",                    needsBaseUrl: false, isCli: false, defaultModel: "gpt-4o-mini" },
  { id: "gemini",            label: "Google Gemini",             needsBaseUrl: false, isCli: false, defaultModel: "gemini-1.5-flash" },
  { id: "openai-compatible", label: "OpenAI-compatible (custom)", needsBaseUrl: true,  isCli: false, defaultModel: "" },
  { id: "cli",               label: "Local agent CLI",           needsBaseUrl: false, isCli: true,  defaultModel: "" },
]

export function getPreset(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0]
}

/** Anthropic API version pinned for the messages endpoint. */
const ANTHROPIC_VERSION = "2023-06-01"

export class AiError extends Error {}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt injection.
//
// The ComdTeX context is prepended as a `system` message so every provider sees
// it: Anthropic collapses all `system` messages into its `system` field,
// Gemini into `systemInstruction`, OpenAI/openai-compatible keep them as a
// leading `{role:"system"}` message, and the CLI flattens them into the prompt.
// If the caller already supplied system message(s) we keep them too, with the
// ComdTeX context FIRST so app knowledge frames any caller-specific guidance.
// ─────────────────────────────────────────────────────────────────────────────
function withComdtexSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  const ctx: ChatMessage = { role: "system", content: comdtexContext }
  return [ctx, ...messages]
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: validate a user-supplied openai-compatible base URL before we ever
// attach the `Authorization: Bearer <apiKey>` header to a request. Without this
// a malicious/typo'd base URL could exfiltrate the user's API key (SSRF). We
// only permit https:// origins or loopback http:// (localhost / 127.0.0.1), the
// latter so local engines (Ollama, LM Studio) keep working over plain HTTP.
function assertSafeBaseUrl(raw: string): void {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new AiError("AI base URL must be https:// or http://localhost")
  }
  const isHttps = parsed.protocol === "https:"
  const isLoopbackHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  if (!isHttps && !isLoopbackHttp) {
    throw new AiError("AI base URL must be https:// or http://localhost")
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE helpers — parse a `fetch` ReadableStream of `data: …` lines.
// ─────────────────────────────────────────────────────────────────────────────

async function* iterSse(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const body = res.body
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  // A single SSE event can span multiple `data:` lines; they are concatenated
  // (newline-joined) and the event only ends at a blank line. Accumulate the
  // data lines here and flush them as one payload on the event boundary so we
  // never drop or mis-parse a multi-line event.
  let dataLines: string[] = []
  const flush = (): string | null => {
    if (dataLines.length === 0) return null
    const payload = dataLines.join("\n")
    dataLines = []
    return payload
  }
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line. Process complete lines.
      let nl: number
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "")
        buffer = buffer.slice(nl + 1)
        if (line === "") {
          // Event boundary — emit the accumulated data payload (if any).
          const payload = flush()
          if (payload !== null) yield payload
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""))
        }
        // Other SSE fields (event:, id:, retry:, comments) are ignored.
      }
    }
    // Stream ended without a trailing blank line — flush any pending payload.
    const tail = flush()
    if (tail !== null) yield tail
  } finally {
    reader.releaseLock()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP provider
// ─────────────────────────────────────────────────────────────────────────────

interface HttpConfig {
  providerId: ProviderId
  baseUrl: string
  apiKey: string
  model: string
}

function resolveBaseUrl(cfg: HttpConfig): string {
  switch (cfg.providerId) {
    case "anthropic": return "https://api.anthropic.com"
    case "openai":    return "https://api.openai.com/v1"
    case "gemini":    return "https://generativelanguage.googleapis.com"
    case "openai-compatible": {
      const u = cfg.baseUrl.trim().replace(/\/+$/, "")
      if (!u) throw new AiError("missing-base-url")
      // SECURITY: only allow https:// or loopback http:// so the Bearer API key
      // can never be sent to an arbitrary attacker-controlled origin.
      assertSafeBaseUrl(u)
      // NOTE: The known provider hosts (Anthropic / OpenAI / Gemini / localhost:11434)
      // are allow-listed in the CSP `connect-src` (src-tauri/tauri.conf.json).
      // A custom openai-compatible host (e.g. https://api.deepseek.com) must have
      // its own origin added to that connect-src list, or the fetch will be blocked.
      return u
    }
    default: throw new AiError("not-http-provider")
  }
}

class HttpProvider {
  constructor(private cfg: HttpConfig) {}

  async send(messages: ChatMessage[], opts: SendOptions): Promise<string> {
    if (!this.cfg.apiKey && this.cfg.providerId !== "openai-compatible") {
      throw new AiError("missing-api-key")
    }
    switch (this.cfg.providerId) {
      case "anthropic": return this.sendAnthropic(messages, opts)
      case "gemini":    return this.sendGemini(messages, opts)
      case "openai":
      case "openai-compatible":
      default:          return this.sendOpenAI(messages, opts)
    }
  }

  // OpenAI /chat/completions — also reused for every openai-compatible host.
  private async sendOpenAI(messages: ChatMessage[], opts: SendOptions): Promise<string> {
    const base = resolveBaseUrl(this.cfg)
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.cfg.apiKey) headers["Authorization"] = `Bearer ${this.cfg.apiKey}`
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      signal: opts.signal,
      body: JSON.stringify({
        model: this.cfg.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        stream: true,
      }),
    })
    if (!res.ok) throw new AiError(await errText(res))

    let full = ""
    try {
      for await (const data of iterSse(res, opts.signal)) {
        if (data === "[DONE]") break
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (typeof delta === "string" && delta) { full += delta; opts.onToken?.(delta) }
        } catch { /* ignore keep-alive / partial */ }
      }
    } catch (e) {
      // Only treat partial output as a (cancelled) success when the USER
      // explicitly aborted; a genuine network error must still surface.
      if (opts.signal?.aborted && full) return full
      throw e
    }
    return full
  }

  // Anthropic /v1/messages.
  private async sendAnthropic(messages: ChatMessage[], opts: SendOptions): Promise<string> {
    const base = resolveBaseUrl(this.cfg)
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n")
    const convo = messages.filter((m) => m.role !== "system")
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // Required for browser-context (Tauri WebView) direct calls.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal: opts.signal,
      body: JSON.stringify({
        model: this.cfg.model,
        max_tokens: opts.maxTokens ?? 4096,
        ...(system ? { system } : {}),
        messages: convo.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    })
    if (!res.ok) throw new AiError(await errText(res))

    let full = ""
    try {
      for await (const data of iterSse(res, opts.signal)) {
        try {
          const json = JSON.parse(data)
          if (json.type === "content_block_delta") {
            const text = json.delta?.text
            if (typeof text === "string" && text) { full += text; opts.onToken?.(text) }
          }
        } catch { /* ignore */ }
      }
    } catch (e) {
      // Partial output only counts as a result on explicit user abort.
      if (opts.signal?.aborted && full) return full
      throw e
    }
    return full
  }

  // Gemini generateContent (streaming via streamGenerateContent + SSE).
  private async sendGemini(messages: ChatMessage[], opts: SendOptions): Promise<string> {
    const base = resolveBaseUrl(this.cfg)
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n")
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
    const url =
      `${base}/v1beta/models/${encodeURIComponent(this.cfg.model)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(this.cfg.apiKey)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(opts.maxTokens ? { generationConfig: { maxOutputTokens: opts.maxTokens } } : {}),
      }),
    })
    if (!res.ok) throw new AiError(await errText(res))

    let full = ""
    try {
      for await (const data of iterSse(res, opts.signal)) {
        try {
          const json = JSON.parse(data)
          const parts = json.candidates?.[0]?.content?.parts
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (typeof p.text === "string" && p.text) { full += p.text; opts.onToken?.(p.text) }
            }
          }
        } catch { /* ignore */ }
      }
    } catch (e) {
      // Partial output only counts as a result on explicit user abort.
      if (opts.signal?.aborted && full) return full
      throw e
    }
    return full
  }
}

async function errText(res: Response): Promise<string> {
  let detail = ""
  try { detail = await res.text() } catch { /* ignore */ }
  return `HTTP ${res.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI provider — one-shot bridge to a local agent CLI.
// ─────────────────────────────────────────────────────────────────────────────

class CliProvider {
  constructor(private command: string) {}

  async send(messages: ChatMessage[], opts: SendOptions): Promise<string> {
    const cmdLine = this.command.trim()
    if (!cmdLine) throw new AiError("missing-cli-command")

    // Flatten the conversation into a single prompt for the one-shot call.
    const prompt = messages
      .map((m) => (m.role === "system" ? m.content : `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`))
      .join("\n\n")

    // The shell allow-list (capabilities/default.json) only scopes specific
    // command names. Parse the configured command line into name + base args;
    // the prompt is appended as the final argument.
    //
    // SECURITY: a prompt that begins with `-`/`--` would otherwise be parsed by
    // the child CLI as a flag (argument injection). We could route the prompt
    // through STDIN, but the plugin-shell streaming model used here reads stdout
    // via `execute()`/event handlers and writing to the child's stdin would be a
    // larger, riskier change. Instead we insert a literal `"--"` end-of-options
    // separator immediately before the prompt so everything after it is treated
    // as a positional argument by any getopt-style CLI.
    const tokens = cmdLine.split(/\s+/)
    const name = tokens[0]
    const args = [...tokens.slice(1), "--", prompt]

    // Lazy import so the shell plugin isn't pulled in unless the CLI is used.
    const { Command } = await import("@tauri-apps/plugin-shell")
    const cmd = Command.create(name, args)

    let full = ""
    // Stream stdout if the plugin emits incremental data events.
    cmd.stdout?.on?.("data", (line: string) => {
      const chunk = typeof line === "string" ? line : String(line)
      full += chunk
      opts.onToken?.(chunk)
    })

    const output = await cmd.execute()
    // If streaming events weren't delivered, fall back to the captured stdout.
    if (!full) {
      full = output.stdout ?? ""
      if (full) opts.onToken?.(full)
    }
    if (!full && output.stderr) throw new AiError(output.stderr.slice(0, 500))
    return full
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a chat to the configured provider. Throws `AiError` with a short code or
 * message; the UI maps known codes to localized strings. Never performs any
 * network work unless explicitly called.
 */
export async function sendMessage(
  settings: Settings,
  messages: ChatMessage[],
  opts: SendOptions = {},
): Promise<string> {
  const id = settings.aiProviderId as ProviderId
  // Always prepend the built-in ComdTeX context as a system message so the model
  // generates correct ComdTeX syntax regardless of which provider is configured.
  const withSystem = withComdtexSystemPrompt(messages)
  if (id === "cli") {
    return new CliProvider(settings.aiCliCommand).send(withSystem, opts)
  }
  return new HttpProvider({
    providerId: id,
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiApiKey,
    model: settings.aiModel,
  }).send(withSystem, opts)
}

/** True when the AI is enabled AND has the config its provider needs to send. */
export function isAiReady(settings: Settings): boolean {
  if (!settings.aiEnabled) return false
  const id = settings.aiProviderId as ProviderId
  if (id === "cli") return !!settings.aiCliCommand.trim()
  if (id === "openai-compatible" && !settings.aiBaseUrl.trim()) return false
  return !!settings.aiModel.trim()
}

/**
 * Best-effort warm-up "preflight" run when the chat opens, so the first real
 * message feels faster: for HTTP providers it establishes the DNS/TLS/keep-alive
 * connection; for the CLI it spins up the agent process and primes its
 * auth/config caches. Deliberately sends a trivial 1-word prompt WITHOUT the
 * (large) ComdTeX system context, and caps output to ~1 token, so it stays
 * near-free. Errors are swallowed — a failed warm-up must never surface.
 */
export async function warmUp(settings: Settings, signal?: AbortSignal): Promise<void> {
  if (!isAiReady(settings)) return
  const id = settings.aiProviderId as ProviderId
  // Skip the CLI provider: `Command.execute()` doesn't honor an AbortSignal, so a
  // warm-up spawn couldn't be cancelled (orphaned process on a slow/hanging local
  // agent), and the speed benefit of pre-spawning a one-shot CLI is marginal.
  if (id === "cli") return
  const ping: ChatMessage[] = [{ role: "user", content: "Hi" }]
  try {
    await new HttpProvider({
      providerId: id,
      baseUrl: settings.aiBaseUrl,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
    }).send(ping, { signal, maxTokens: 1 })
  } catch { /* warm-up is best-effort — ignore all failures */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline edit (Ctrl/Cmd+K) — focused single-turn helper.
//
// Used by the floating CmdKEdit widget. The model must return ONLY the
// replacement text (paste-ready ComdTeX Markdown), with no preamble, no
// explanation and no Markdown code-fences — the result is applied verbatim via
// `editor.executeEdits`, so any chatter would land in the document.
// ─────────────────────────────────────────────────────────────────────────────

const INLINE_EDIT_SYSTEM =
  "You are an inline editing tool inside ComdTeX (a Markdown + LaTeX editor). " +
  "Apply the user's instruction and return ONLY the resulting text, ready to " +
  "paste directly into the document. Output ComdTeX-flavored Markdown with math " +
  "in LaTeX ($...$ or $$...$$). Do NOT wrap your answer in a code fence. Do NOT " +
  "add any preamble, explanation, commentary or trailing notes — output the " +
  "replacement text and nothing else."

/**
 * Strip a single wrapping Markdown code-fence (```lang … ```), if the model
 * ignored the no-fence instruction. Only removes the fence when it wraps the
 * WHOLE response, so legitimate inner fenced blocks are preserved.
 */
function stripWrappingFence(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n?```$/)
  return m ? m[1] : text
}

export interface InlineEditRequest {
  /** The user's natural-language instruction. */
  instruction: string
  /** The currently selected text to transform (empty string ⇒ insert mode). */
  selection: string
  /** Whether the operation edits a selection (true) or inserts at the cursor (false). */
  hasSelection: boolean
  /** Optional surrounding document text, for context. */
  documentContext?: string
}

/**
 * Run a focused inline AI edit and return the paste-ready replacement text.
 * Streams tokens through `opts.onToken` exactly like `sendMessage`. The returned
 * string has any whole-response code fence stripped so it can be applied
 * verbatim through Monaco's `executeEdits`.
 */
export async function sendInlineEdit(
  settings: Settings,
  req: InlineEditRequest,
  opts: SendOptions = {},
): Promise<string> {
  const parts: string[] = [`Instruction: ${req.instruction}`]
  if (req.hasSelection) {
    parts.push("Edit the following selected text and return the edited version:\n```\n" + req.selection + "\n```")
  } else {
    parts.push("There is no selection. Generate the text to insert at the cursor.")
  }
  if (req.documentContext && req.documentContext.trim()) {
    parts.push("For context only (do not repeat it), here is the surrounding document:\n```\n" + req.documentContext + "\n```")
  }
  const messages: ChatMessage[] = [
    { role: "system", content: INLINE_EDIT_SYSTEM },
    { role: "user", content: parts.join("\n\n") },
  ]
  const raw = await sendMessage(settings, messages, opts)
  return stripWrappingFence(raw)
}
