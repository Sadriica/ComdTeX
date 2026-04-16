const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
])

const YOUTUBE_ORIGIN = /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//i

function isAllowedIframe(el: Element): boolean {
  const src = el.getAttribute("src") ?? ""
  return YOUTUBE_ORIGIN.test(src.trim())
}

const URL_ATTRS = new Set(["href", "src", "xlink:href"])

function isSafeUrl(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "")
  if (!normalized) return true
  return /^(#|\/|\.\/|\.\.\/|https?:|data:image\/|blob:|asset:|file:)/i.test(normalized)
}

/**
 * Strip url(...) calls with dangerous schemes from inline style values.
 * Handles both quoted and unquoted URLs, e.g. background:url(javascript:...).
 */
function sanitizeStyle(value: string): string {
  return value.replace(/url\s*\(\s*(['"]?)([^'")\s]*)\1\s*\)/gi, (match, _q, url) => {
    return isSafeUrl(url.trim()) ? match : ""
  })
}

function sanitizeElement(el: Element) {
  const tag = el.tagName.toLowerCase()
  if (BLOCKED_TAGS.has(tag)) {
    if (tag === "iframe" && isAllowedIframe(el)) {
      // Keep YouTube iframes but strip all event handlers below
    } else {
      el.remove()
      return
    }
  }

  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase()
    const value = attr.value
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name)
      continue
    }
    if (URL_ATTRS.has(name) && !isSafeUrl(value)) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === "style") {
      const sanitized = sanitizeStyle(value)
      if (sanitized !== value) el.setAttribute(attr.name, sanitized)
    }
  }
}

export function sanitizeRenderedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT)
  const elements: Element[] = []

  let current = walker.nextNode()
  while (current) {
    elements.push(current as Element)
    current = walker.nextNode()
  }

  elements.forEach(sanitizeElement)
  return doc.body.innerHTML
}
