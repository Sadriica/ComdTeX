import DOMPurify from "dompurify"

// ── URL scheme policy ───────────────────────────────────────────────────────
//
// Links (`<a href>`) may point to http(s), mailto, or fragment/relative
// targets. `file:` and `asset:` are intentionally EXCLUDED from links — they
// let a rendered document reference (and navigate to) arbitrary local files,
// which is a meaningfully different risk from just *displaying* a local
// image. This tightens the previous (pre-DOMPurify) sanitizer, which allowed
// both schemes on every URL attribute indiscriminately.
const LINK_SAFE = /^(#|\/(?!\/)|\.\.?\/|mailto:|https?:)/i

// Images (and other media-ish src attributes) may additionally reference
// `asset:`/`https://asset.localhost` (Tauri's asset protocol, used for vault
// images) and `blob:` (object URLs), plus base64 raster `data:` images.
// `data:image/svg+xml` stays rejected — inline SVG can carry <script>/on*
// handlers and is never produced by KaTeX/Mermaid/Graphviz/function-plot in
// this app's pipeline.
const MEDIA_SAFE = /^(#|\/(?!\/)|\.\.?\/|https?:|blob:|asset:|https:\/\/asset\.localhost)/i

// Strips control characters and any whitespace, mirroring the old
// sanitizer's normalization so schemes like "java\tscript:" can't sneak
// past the regex tests below.
const CONTROL_OR_WHITESPACE_RE = /[\x00-\x1f\x7f]|\s/g

function isSafeDataImage(value: string): boolean {
  if (!/^data:image\//i.test(value)) return false
  if (/^data:image\/svg/i.test(value)) return false
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

function normalize(value: string): string {
  return value.trim().replace(CONTROL_OR_WHITESPACE_RE, "")
}

function isSafeLinkUrl(value: string): boolean {
  const normalized = normalize(value)
  if (!normalized) return true
  if (/^data:/i.test(normalized)) return false
  return LINK_SAFE.test(normalized)
}

function isSafeMediaUrl(value: string): boolean {
  const normalized = normalize(value)
  if (!normalized) return true
  if (/^data:/i.test(normalized)) return isSafeDataImage(normalized)
  return MEDIA_SAFE.test(normalized)
}

const YOUTUBE_EMBED = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//i

// Attributes whose value is a link-like URL (navigation) vs. a media-like
// URL (fetched/displayed content, or an SVG/XLink reference). `href` on <a>
// is link-like; everywhere else (img/source/video/audio/poster, SVG
// xlink:href/use) is media-like.
const LINK_ATTRS = new Set(["href"])
const MEDIA_URL_ATTRS = new Set(["src", "xlink:href", "poster"])

let purifyConfigured = false

function configurePurify() {
  if (purifyConfigured) return
  purifyConfigured = true

  // Enforce our own link-vs-media URL policy instead of DOMPurify's default
  // scheme allowlist, which doesn't know about `asset:` (Tauri's asset
  // protocol) and would otherwise treat every URL attribute the same way.
  // Setting `forceKeepAttr` skips DOMPurify's own URI-scheme re-check for
  // attributes we've already validated (the attribute name itself is still
  // only reachable here because it's in the profile's ALLOWED_ATTR set).
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLowerCase()

    if (LINK_ATTRS.has(name)) {
      if (isSafeLinkUrl(data.attrValue)) {
        data.forceKeepAttr = true
      } else {
        data.keepAttr = false
      }
      return
    }

    if (MEDIA_URL_ATTRS.has(name)) {
      if (isSafeMediaUrl(data.attrValue)) {
        data.forceKeepAttr = true
      } else {
        data.keepAttr = false
      }
    }
  })

  // Restrict youtube iframes; drop everything else. iframe is otherwise not
  // in any DOMPurify profile, so it only exists at all via ADD_TAGS below.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName?.toLowerCase() !== "iframe") return
    const src = node.getAttribute("src") ?? ""
    if (!YOUTUBE_EMBED.test(src.trim())) {
      node.remove()
      return
    }
    // Force a safe, consistent embed sandbox regardless of what the
    // renderer produced.
    node.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation")
    node.setAttribute("allowfullscreen", "")
    node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
  })
}

// Shared between the string and DocumentFragment entry points below so the
// two can never drift apart into different sanitization policies.
const PURIFY_OPTIONS = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  // `iframe` (YouTube embeds only, filtered above) is in no profile.
  // `semantics`/`annotation` are KaTeX's MathML mirror of the TeX source
  // (in DOMPurify's mathMlDisallowed set by default). `foreignobject` is
  // used by Mermaid for HTML-in-SVG diagram labels (svg profile omits it).
  ADD_TAGS: ["iframe", "semantics", "annotation", "foreignobject"],
  ADD_ATTR: ["aria-hidden", "target", "rel", "allowfullscreen", "sandbox", "referrerpolicy"],
  ALLOW_DATA_ATTR: true,
}

export function sanitizeRenderedHtml(html: string): string {
  configurePurify()
  return DOMPurify.sanitize(html, PURIFY_OPTIONS) as unknown as string
}

/**
 * Same sanitization policy as `sanitizeRenderedHtml`, but returns a
 * DOMPurify-built `DocumentFragment` (`RETURN_DOM_FRAGMENT`) instead of a
 * re-serialized string. Used by the preview commit hot path
 * (`previewMorph.ts` `commitPreview`) so the (potentially multi-MB,
 * KaTeX-heavy) document HTML is parsed exactly once per render instead of
 * being parsed here and then re-parsed again downstream by the DOM morph.
 */
export function sanitizeRenderedHtmlToFragment(html: string): DocumentFragment {
  configurePurify()
  return DOMPurify.sanitize(html, {
    ...PURIFY_OPTIONS,
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment
}
