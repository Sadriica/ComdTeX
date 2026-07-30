import { STORAGE_KEYS } from "./storageKeys"

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  content: string
  custom?: boolean
}

const today = () => new Date().toISOString().split("T")[0]
const todayFormatted = () => new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })
const currentYear = () => new Date().getFullYear().toString()
const now = () => new Date().toISOString()
const time = () => new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })

function formatDate(pattern: string, date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return pattern
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()))
}

export function processTemplateVariables(content: string, filename?: string): string {
  const fileBasename = filename?.replace(/\.[^.]+$/, "") ?? ""
  return content
    .replace(/\{\{date:formatted\}\}/g, todayFormatted())
    .replace(/\{\{date:([^}]+)\}\}/g, (_, pat) => formatDate(pat))
    .replace(/\{\{date\}\}/g, today())
    .replace(/\{\{year\}\}/g, currentYear())
    .replace(/\{\{time\}\}/g, time())
    .replace(/\{\{datetime\}\}/g, now())
    .replace(/\{\{title\}\}/g, fileBasename || "Sin título")
    .replace(/\{\{filename\}\}/g, fileBasename)
    .replace(/\{\{author\}\}/g, "")
    .replace(/\{\{today\}\}/g, today())
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Vacío",
    description: "Archivo en blanco",
    icon: "□",
    content: "",
  },
  {
    id: "article",
    name: "Artículo",
    description: "Documento académico con abstract y secciones",
    icon: "📄",
    content: `---
title: Título del artículo
author:
date: ${today()}
tags: []
---

## Abstract

Breve descripción del contenido.

## 1. Introducción

## 2. Desarrollo

## 3. Resultados

## 4. Conclusiones

## Referencias
`,
  },
  {
    id: "notes",
    name: "Apuntes de clase",
    description: "Notas con definiciones, teoremas y ejemplos",
    icon: "📒",
    content: `---
title:
author:
date: ${today()}
tags: []
---

:::definition
**Definición:**
:::

:::theorem
**Teorema:**
:::

:::proof

:::

:::example
**Ejemplo:**
:::
`,
  },
  {
    id: "problemset",
    name: "Tarea / Problem set",
    description: "Hoja de ejercicios numerados",
    icon: "✏️",
    content: `---
title: Tarea
author:
date: ${today()}
tags: []
---

:::exercise
**Problema 1.**
:::

:::exercise
**Problema 2.**
:::

:::exercise
**Problema 3.**
:::
`,
  },
  {
    id: "theoremsheet",
    name: "Hoja de teoremas",
    description: "Referencia rápida de resultados matemáticos",
    icon: "∑",
    content: `---
title: Hoja de teoremas
author:
date: ${today()}
tags: []
---

:::theorem[Nombre]
**Enunciado:**
:::

:::lemma
**Lema auxiliar:**
:::

:::corollary
**Corolario:**
:::
`,
  },
  {
    id: "research",
    name: "Nota de investigación",
    description: "Con BibTeX y referencias",
    icon: "🔬",
    content: `---
title:
author:
date: ${today()}
tags: []
---

## Contexto

## Idea principal

## Desarrollo

$$
% ecuación principal
$$ {#eq:main}

Como se muestra en @eq:main...

## Referencias

[@key]
`,
  },
  {
    id: "paper-overleaf",
    name: "Paper Overleaf-ready",
    description: "Artículo con labels, figuras, tablas y estructura exportable",
    icon: "◇",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper]
comdtex.main: true
---

# Abstract {#sec:abstract}

Resumen del resultado principal.

# Introduction {#sec:introduction}

Motivación y contribuciones.

# Main Result {#sec:main-result}

:::theorem[Resultado principal]{#thm:main}
Enunciado del resultado principal.
:::

:::proof
Demostración del resultado principal.
:::

$$
E = mc^2
$$ {#eq:main}

La ecuación @eq:main se usa en @thm:main.

| Símbolo | Significado |
|---|---|
| $E$ | Energía |
| $m$ | Masa |
{#tbl:notation}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "thesis",
    name: "Tesis / documento largo",
    description: "Documento principal con transclusiones por capítulos",
    icon: "▦",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [tesis]
comdtex.main: true
---

# Introducción {#sec:intro}

![[chapters/01-introduccion]]

# Marco teórico {#sec:theory}

![[chapters/02-marco-teorico]]

# Resultados {#sec:results}

![[chapters/03-resultados]]

# Conclusiones {#sec:conclusions}

![[chapters/04-conclusiones]]

# Bibliografía {#sec:bibliography}

[@key]
`,
  },
  {
    id: "lecture-notes-book",
    name: "Libro de apuntes",
    description: "Capítulo con definiciones, teoremas, ejercicios y backlinks matemáticos",
    icon: "▤",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [apuntes, libro]
---

# Objetivos {#sec:goals}

- Objetivo 1
- Objetivo 2

# Definiciones {#sec:definitions}

:::definition[Concepto central]{#def:central}
Definición del concepto central.
:::

# Teoremas {#sec:theorems}

:::theorem[Teorema clave]{#thm:key}
Enunciado que usa @def:central.
:::

:::proof
Demostración.
:::

# Ejercicios {#sec:exercises}

:::exercise{#exc:one}
Aplica @thm:key a un caso concreto.
:::
`,
  },
]

const CUSTOM_TEMPLATES_KEY = STORAGE_KEYS.CUSTOM_TEMPLATES

export function loadCustomTemplates(): Template[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((tpl) => typeof tpl?.name === "string" && typeof tpl?.content === "string")
      .map((tpl, index) => ({
        id: String(tpl.id || `custom-${index}`),
        name: tpl.name,
        description: String(tpl.description || "Plantilla personalizada"),
        icon: String(tpl.icon || "◇"),
        content: tpl.content,
        custom: true,
      }))
  } catch {
    return []
  }
}

/**
 * Turn an existing document into a reusable template by replacing the parts that
 * are specific to *that* note with template variables.
 *
 * Deliberately conservative — it only rewrites things that are unambiguously
 * per-note metadata (the frontmatter `title`/`date`, the H1 when it matches the
 * title, and ISO dates in the frontmatter block). Body prose is left alone: a
 * date mentioned inside a paragraph is content, not a field, and rewriting it
 * would corrupt the template silently.
 */
export function parameterizeDocument(content: string, filename?: string): string {
  const stem = filename?.replace(/\.[^.]+$/, "") ?? ""
  const fmEnd = /^---\r?\n[\s\S]*?\r?\n---/.exec(content)
  let title: string | null = null

  let out = content
  if (fmEnd) {
    let block = fmEnd[0]
    const titleMatch = /^title:[ \t]*(.+)$/m.exec(block)
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, "")
      block = block.replace(/^title:[ \t]*.+$/m, "title: {{title}}")
    }
    // Any ISO date inside the frontmatter is a field value, safe to template.
    block = block.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "{{date}}")
    out = block + content.slice(fmEnd[0].length)
  }

  // The H1 only becomes {{title}} when it restates the note's identity —
  // otherwise it is a real heading that belongs in the template as-is.
  const h1 = /^#[ \t]+(.+)$/m.exec(out)
  if (h1) {
    const heading = h1[1].trim()
    if ((title && heading === title) || (stem && heading === stem)) {
      out = out.replace(/^#[ \t]+.+$/m, "# {{title}}")
    }
  }
  return out
}

export function saveCustomTemplate(template: Omit<Template, "id" | "custom">): Template[] {
  const templates = loadCustomTemplates()
  const next: Template = {
    ...template,
    id: `custom-${Date.now()}`,
    custom: true,
  }
  const updated = [...templates, next]
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated))
  return updated
}
