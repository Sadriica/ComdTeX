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

export function processTemplateVariables(content: string, filename?: string): string {
  const fileBasename = filename?.replace(/\.[^.]+$/, "") ?? ""
  return content
    .replace(/\{\{date\}\}/g, today())
    .replace(/\{\{date:formatted\}\}/g, todayFormatted())
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

const CUSTOM_TEMPLATES_KEY = "comdtex.customTemplates"

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
